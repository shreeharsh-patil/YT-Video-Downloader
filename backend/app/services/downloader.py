"""Download orchestration.

Separates "what yt-dlp does" (single stream downloads) from "what we do"
(choose formats, merge with FFmpeg, convert audio, produce a final file).
"""

from __future__ import annotations

import glob
import logging
import os
import shutil
import time
from typing import Any, Callable

from yt_dlp import YoutubeDL

from ..utils.errors import AppError, map_ytdlp_error
from . import ffmpeg as ffmpeg_service
from .youtube import build_ydl_options

logger = logging.getLogger("ytdl.services.downloader")

# event emitter type: callable receiving a JSON-serializable event dict
Emit = Callable[[dict[str, Any]], None]

_VIDEO_CODECS_REQUIRING_MP4 = ("h264", "avc")


class DownloadTracker:
    """Tracks per-stream byte counts and enforces size/timeout limits."""

    def __init__(self, max_size: int, timeout: int) -> None:
        self.max_size = max_size
        self.deadline = time.monotonic() + timeout
        self.video_bytes = 0
        self.audio_bytes = 0

    def report(self, kind: str, downloaded: int) -> None:
        if kind == "video":
            self.video_bytes = max(self.video_bytes, downloaded)
        else:
            self.audio_bytes = max(self.audio_bytes, downloaded)

        total = self.video_bytes + self.audio_bytes
        if total > self.max_size:
            raise AppError(
                "TOO_LARGE",
                "The file is larger than the maximum allowed download size.",
                status=413,
            )
        if time.monotonic() > self.deadline:
            raise AppError(
                "TIMEOUT",
                "The download took too long. Please try again.",
                status=504,
            )


def download_single(
    url: str,
    format_id: str,
    out_dir: str,
    tag: str,
    tracker: DownloadTracker,
    kind: str,
    stage: str,
    emit: Emit,
) -> str:
    """Download one yt-dlp stream into *out_dir* and return its file path."""
    outtmpl = os.path.join(out_dir, f"{tag}.%(ext)s")

    def progress_hook(data: dict) -> None:
        status = data.get("status")
        if status == "error":
            raise AppError(
                "DOWNLOAD_FAILED",
                "The download failed while retrieving the video. Please try again.",
                status=502,
            )
        if status != "downloading":
            return
        downloaded = int(data.get("downloaded_bytes") or 0)
        total = data.get("total_bytes") or data.get("total_bytes_estimate")
        total = int(total) if total else None
        tracker.report(kind, downloaded)
        fraction = (downloaded / total) if total else None
        emit(
            {
                "type": "progress",
                "stage": stage,
                "progress": fraction,
                "downloaded_bytes": downloaded,
                "total_bytes": total,
            }
        )

    opts = build_ydl_options(
        format=format_id,
        outtmpl=outtmpl,
        progress_hooks=[progress_hook],
        noprogress=True,
    )
    try:
        with YoutubeDL(opts) as ydl:
            ydl.extract_info(url, download=True)
    except AppError:
        raise
    except Exception as exc:  # noqa: BLE001 - normalize to AppError
        logger.exception("stream download failed for format %s", format_id)
        code, message, status = map_ytdlp_error(exc)
        raise AppError(code, message, status=status) from exc

    return _locate_file(out_dir, tag)


def _locate_file(out_dir: str, tag: str) -> str:
    pattern = os.path.join(out_dir, tag + ".*")
    matches = [
        p
        for p in glob.glob(pattern)
        if not p.endswith((".part", ".ytdl"))
        and os.path.isfile(p)
        and not os.path.basename(p).endswith((".part", ".ytdl"))
    ]
    if not matches:
        raise AppError(
            "DOWNLOAD_FAILED",
            "The download produced no file. Please try again.",
            status=502,
        )
    return max(matches, key=os.path.getmtime)


def _out_container(video_fmt: dict, requested: str) -> str:
    """Resolve the output container, avoiding impossible codec combinations."""
    if requested not in ("mp4", "webm"):
        return video_fmt.get("container") or "mp4"
    vcodec = (video_fmt.get("video_codec") or "").lower()
    if requested == "webm" and any(c in vcodec for c in _VIDEO_CODECS_REQUIRING_MP4):
        return "mp4"
    return requested


def download_video_pipeline(
    url: str,
    video_fmt: dict,
    audio_fmt: dict | None,
    container: str,
    out_dir: str,
    base: str,
    tracker: DownloadTracker,
    emit: Emit,
) -> str:
    """Download a video, merging separate streams when required."""
    final_container = _out_container(video_fmt, container)
    final_path = os.path.join(out_dir, f"{base}.{final_container}")

    if video_fmt.get("is_progressive"):
        emit(
            {
                "type": "status",
                "stage": "downloading_video",
                "message": "Downloading video...",
            }
        )
        path = download_single(
            url,
            video_fmt["id"],
            out_dir,
            f"{base}_video",
            tracker,
            "video",
            "downloading_video",
            emit,
        )
        if video_fmt.get("container") == final_container and os.path.basename(path) != os.path.basename(final_path):
            shutil.move(path, final_path)
        else:
            emit(
                {
                    "type": "status",
                    "stage": "merging",
                    "message": "Finalizing stream...",
                }
            )
            ffmpeg_service.remux_stream(path, final_path, final_container)
        return final_path

    if audio_fmt is None:
        raise AppError(
            "NO_FORMAT",
            "This video has no compatible audio stream. Please choose another format.",
            status=400,
        )

    emit(
        {
            "type": "status",
            "stage": "downloading_video",
            "message": "Downloading video...",
        }
    )
    video_path = download_single(
        url,
        video_fmt["id"],
        out_dir,
        f"{base}_video",
        tracker,
        "video",
        "downloading_video",
        emit,
    )

    emit(
        {
            "type": "status",
            "stage": "downloading_audio",
            "message": "Downloading audio...",
        }
    )
    audio_path = download_single(
        url,
        audio_fmt["id"],
        out_dir,
        f"{base}_audio",
        tracker,
        "audio",
        "downloading_audio",
        emit,
    )

    emit(
        {
            "type": "status",
            "stage": "merging",
            "message": "Merging video and audio...",
        }
    )
    ffmpeg_service.merge_streams(video_path, audio_path, final_path, final_container)
    return final_path


def download_audio_pipeline(
    url: str,
    source_fmt: dict,
    container: str,
    quality: str,
    out_dir: str,
    base: str,
    tracker: DownloadTracker,
    emit: Emit,
) -> str:
    """Download audio-only, converting to the requested container when needed."""
    source_ext = source_fmt.get("extension") or "webm"
    source_bitrate = source_fmt.get("bitrate")
    requested = None if quality in (None, "", "best") else quality
    effective = ffmpeg_service.effective_audio_bitrate(requested, source_bitrate)

    plan = _audio_plan(container, source_ext, effective, source_bitrate)

    emit(
        {
            "type": "status",
            "stage": "downloading_audio",
            "message": "Downloading audio...",
        }
    )
    source_path = download_single(
        url,
        source_fmt["id"],
        out_dir,
        f"{base}_audio",
        tracker,
        "audio",
        "downloading_audio",
        emit,
    )

    final_path = os.path.join(out_dir, f"{base}.{plan['out_ext']}")

    if plan["mode"] == "direct":
        if source_path != final_path:
            shutil.move(source_path, final_path)
        return final_path

    emit(
        {
            "type": "status",
            "stage": "merging",
            "message": "Converting audio...",
        }
    )

    if plan["mode"] == "remux":
        ffmpeg_service.remux_stream(source_path, final_path, plan["out_ext"])
        return final_path

    ffmpeg_service.convert_audio(
        source_path, final_path, plan["codec"], plan["bitrate"]
    )
    return final_path


def _audio_plan(
    container: str,
    source_ext: str,
    effective: int | None,
    source_bitrate: int | None,
) -> dict[str, Any]:
    """Decide how to produce the requested audio container.

    Returns a plan dict with:
      - mode: "direct" | "remux" | "convert"
      - out_ext, codec, bitrate
    """
    if container == "mp3":
        bitrate = effective if effective is not None else (source_bitrate or 192)
        bitrate = ffmpeg_service.nearest_mp3_bitrate(bitrate)
        return {
            "mode": "convert",
            "out_ext": "mp3",
            "codec": "libmp3lame",
            "bitrate": bitrate,
        }

    if container == "m4a":
        if source_ext in ("m4a", "mp4"):
            if effective is not None:
                return {
                    "mode": "convert",
                    "out_ext": "m4a",
                    "codec": "aac",
                    "bitrate": effective,
                }
            return {"mode": "direct", "out_ext": "m4a", "codec": None, "bitrate": None}
        bitrate = effective if effective is not None else (source_bitrate or 128)
        return {
            "mode": "convert",
            "out_ext": "m4a",
            "codec": "aac",
            "bitrate": bitrate,
        }

    if container == "opus":
        if source_ext == "webm" and effective is None:
            return {"mode": "remux", "out_ext": "opus", "codec": None, "bitrate": None}
        bitrate = effective if effective is not None else (source_bitrate or 128)
        return {
            "mode": "convert",
            "out_ext": "opus",
            "codec": "libopus",
            "bitrate": bitrate,
        }

    # Fallback: keep whatever the source is.
    return {"mode": "direct", "out_ext": source_ext, "codec": None, "bitrate": None}


def cleanup_files(out_dir: str) -> None:
    """Recursively delete a temporary workspace. Never raises."""
    try:
        if out_dir and os.path.isdir(out_dir):
            shutil.rmtree(out_dir, ignore_errors=True)
            logger.info("cleaned up temp dir %s", out_dir)
    except Exception:  # noqa: BLE001
        logger.exception("failed to clean up %s", out_dir)