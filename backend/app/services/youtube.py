"""yt-dlp based video analysis and format selection.

All yt-dlp usage is contained here and in services/downloader.py so the HTTP
layer stays thin. Format IDs are never hardcoded: everything is derived from
the live yt-dlp response for the requested video.
"""

from __future__ import annotations

import logging
import re
import shutil
from typing import Any
from urllib.parse import urlparse

from yt_dlp import YoutubeDL

from ..config import FFMPEG_PATH, SOCKET_TIMEOUT
from ..utils.errors import AppError, map_ytdlp_error

logger = logging.getLogger("ytdl.services.youtube")


class _QuietLogger:
    """Suppresses yt-dlp's default stderr spam while keeping logs available."""

    def debug(self, msg: str) -> None:  # noqa: D102
        logger.debug(msg)

    def warning(self, msg: str) -> None:  # noqa: D102
        logger.warning(msg)

    def error(self, msg: str) -> None:  # noqa: D102
        logger.error(msg)


def build_ydl_options(**overrides: Any) -> dict[str, Any]:
    """Base yt-dlp options shared by analysis and downloads."""
    ffmpeg_bin = shutil.which(FFMPEG_PATH) or FFMPEG_PATH
    opts: dict[str, Any] = {
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "socket_timeout": SOCKET_TIMEOUT,
        "retries": 3,
        "fragment_retries": 3,
        "extractor_retries": 2,
        "concurrent_fragment_downloads": 4,
        # Ask for formats that do not require PO tokens first, which avoids a
        # class of throttled/missing formats on modern YouTube.
        "extractor_args": {
            "youtube": {"formats": ["missing_pot", "storyboard", "channel"]}
        },
        "ignoreerrors": False,
        "logger": _QuietLogger(),
        "progress_hooks": [],
        "postprocessor_hooks": [],
        "ffmpeg_location": ffmpeg_bin,
    }
    opts.update(overrides)
    return opts


def _container_from_ext(ext: str) -> str:
    if ext in ("mp4", "m4a", "mov"):
        return "mp4"
    if ext in ("webm",):
        return "webm"
    return ext or "unknown"


def analyze_video(url: str) -> dict[str, Any]:
    """Fetch metadata for *url* without downloading the video (supports playlists & videos)."""
    from ..utils.url import is_playlist_or_channel_url
    
    is_playlist = is_playlist_or_channel_url(url)
    if is_playlist:
        opts = build_ydl_options(
            noplaylist=False,
            extract_flat="in_playlist",
            playlist_items="1:100",
        )
    else:
        opts = build_ydl_options(noplaylist=True)

    try:
        with YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
    except Exception as exc:  # noqa: BLE001 - everything maps to AppError
        code, message, status = map_ytdlp_error(exc)
        logger.exception("analyze failed for %s", url)
        raise AppError(code, message, status=status) from exc

    if not info:
        raise AppError(
            "VIDEO_UNAVAILABLE",
            "This video or playlist isn't available for downloading.",
            status=404,
        )

    return info


def _extract_formats(info: dict[str, Any]) -> tuple[list[dict], list[dict]]:
    """Split raw yt-dlp formats into video and audio format dictionaries."""
    raw_formats: list[dict] = info.get("formats") or []
    duration = info.get("duration")

    video_formats: list[dict] = []
    audio_formats: list[dict] = []

    for raw in raw_formats:
        format_id = raw.get("format_id")
        if not format_id:
            continue
        vcodec = raw.get("vcodec") or "none"
        acodec = raw.get("acodec") or "none"
        has_video = vcodec not in ("none", "")
        has_audio = acodec not in ("none", "")
        ext = raw.get("ext") or "unknown"
        height = raw.get("height")
        fps = raw.get("fps")
        note = raw.get("format_note") or ""
        filesize = raw.get("filesize") or raw.get("filesize_approx")
        abr = raw.get("abr")

        if has_video:
            video_formats.append(
                {
                    "id": format_id,
                    "quality": height,
                    "quality_label": f"{height}p" if height else (note or None),
                    "fps": fps,
                    "extension": ext,
                    "container": _container_from_ext(ext),
                    "video_codec": raw.get("vcodec"),
                    "audio_codec": raw.get("acodec") if has_audio else None,
                    "has_video": True,
                    "has_audio": has_audio,
                    "is_progressive": has_video and has_audio,
                    "file_size": filesize,
                    "file_size_estimate": raw.get("filesize_approx"),
                    "format_note": note or None,
                    "dynamic_range": raw.get("dynamic_range"),
                }
            )

        if has_audio and not has_video:
            bitrate: int | None = None
            if abr is not None:
                try:
                    bitrate = int(round(float(abr)))
                except (ValueError, TypeError):
                    bitrate = None
            if bitrate is None:
                bitrate = _estimate_bitrate(raw, duration)

            audio_formats.append(
                {
                    "id": format_id,
                    "bitrate": bitrate,
                    "extension": ext,
                    "container": _container_from_ext(ext),
                    "audio_codec": raw.get("acodec"),
                    "file_size": filesize,
                    "file_size_estimate": raw.get("filesize_approx"),
                    "format_note": note or None,
                }
            )

    video_formats.sort(
        key=lambda f: (
            f["quality"] or 0,
            f["fps"] or 0,
            f["container"],
        ),
        reverse=True,
    )
    audio_formats.sort(
        key=lambda f: (
            f["bitrate"] or 0,
            0 if f["extension"] == "m4a" else 1,
        ),
        reverse=True,
    )
    return video_formats, audio_formats


def get_available_formats(info: dict[str, Any]) -> tuple[list[dict], list[dict]]:
    """Public wrapper returning (video_formats, audio_formats)."""
    return _extract_formats(info)


def _estimate_bitrate(raw: dict, duration: float | None) -> int | None:
    if not duration:
        return None
    size = raw.get("filesize") or raw.get("filesize_approx")
    if not size:
        return None
    return int((size * 8) / duration / 1000)


def normalize_info(info: dict[str, Any], normalized_url: str) -> dict[str, Any]:
    """Build the public analysis payload from a raw yt-dlp info dict."""
    from ..utils.url import is_playlist_or_channel_url
    
    # Check if this is a playlist or collection
    if info.get("_type") == "playlist" or (is_playlist_or_channel_url(normalized_url) and info.get("entries")):
        raw_entries = list(info.get("entries") or [])
        entries = []
        for item in raw_entries:
            if not item:
                continue
            vid_id = item.get("id") or ""
            vid_url = item.get("url") or (f"https://www.youtube.com/watch?v={vid_id}" if vid_id else "")
            thumb = item.get("thumbnail") or (f"https://i.ytimg.com/vi/{vid_id}/hqdefault.jpg" if vid_id else None)
            dur = item.get("duration")
            entries.append({
                "id": vid_id,
                "url": vid_url,
                "title": item.get("title") or "Untitled video",
                "duration": dur,
                "duration_human": _format_duration(dur),
                "thumbnail": thumb,
                "uploader": item.get("uploader") or item.get("channel"),
            })

        pl_thumb = info.get("thumbnail") or (entries[0]["thumbnail"] if entries else None)
        pl_title = info.get("title") or "YouTube Playlist"
        channel = info.get("channel") or info.get("uploader") or "YouTube"

        return {
            "type": "playlist",
            "id": info.get("id"),
            "url": normalized_url,
            "title": pl_title,
            "thumbnail": pl_thumb,
            "channel": channel,
            "uploader": info.get("uploader"),
            "duration": sum((e["duration"] or 0) for e in entries) if entries else None,
            "duration_human": f"{len(entries)} videos",
            "view_count": info.get("view_count"),
            "upload_date": info.get("upload_date"),
            "description": (info.get("description") or "")[:400],
            "is_short": False,
            "formats": [],
            "audio_formats": [],
            "best_video_quality": 1080,
            "best_audio_bitrate": 320,
            "playlist_entries": entries,
            "playlist_count": len(entries),
        }

    # If single video but returned in a singleton entry list
    if info.get("entries"):
        entries = [e for e in info["entries"] if e]
        if entries:
            info = entries[0]

    video_formats, audio_formats = _extract_formats(info)

    video_id = info.get("id")
    duration = info.get("duration")
    thumbnail = info.get("thumbnail")
    if not thumbnail and video_id:
        thumbnail = f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"

    best_video_quality = max(
        (f["quality"] for f in video_formats if f["quality"]), default=None
    )
    best_audio_bitrate = max(
        (f["bitrate"] for f in audio_formats if f["bitrate"]), default=None
    )

    channel = (
        info.get("channel")
        or info.get("uploader")
        or info.get("channel_id")
        or "Unknown channel"
    )

    source_url = info.get("webpage_url") or info.get("url") or normalized_url

    return {
        "type": "video",
        "id": video_id,
        "url": normalized_url,
        "title": info.get("title") or "Untitled video",
        "thumbnail": thumbnail,
        "channel": channel,
        "uploader": info.get("uploader"),
        "duration": duration,
        "duration_human": _format_duration(duration),
        "view_count": info.get("view_count"),
        "upload_date": info.get("upload_date"),
        "description": (info.get("description") or "")[:400],
        "is_short": "/shorts/" in (urlparse(source_url).path or ""),
        "formats": video_formats,
        "audio_formats": audio_formats,
        "best_video_quality": best_video_quality,
        "best_audio_bitrate": best_audio_bitrate,
        "playlist_entries": [],
        "playlist_count": 0,
    }


def _format_duration(seconds: float | None) -> str:
    if not seconds or seconds <= 0:
        return "—"
    total = int(seconds)
    hours, rem = divmod(total, 3600)
    minutes, secs = divmod(rem, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


def _pick_best_format(
    candidates: list[dict], preferred_container: str | None
) -> dict:
    """Pick the best format from *candidates*.

    Prefers: requested container, then non-HDR, then higher fps, then streams
    that already include audio (avoids an unnecessary merge).
    """

    def score(fmt: dict) -> tuple:
        container_ok = (
            fmt["container"] == preferred_container
            if preferred_container
            else False
        )
        non_hdr = fmt.get("dynamic_range") not in ("HDR", "HDR10", "HDR12")
        fps = fmt.get("fps") or 0
        return (
            container_ok,
            non_hdr,
            fps,
            fmt.get("has_audio", False),
            fmt.get("quality") or 0,
        )

    return max(candidates, key=score)


def select_video_format(
    formats: list[dict], quality: str, container: str
) -> dict:
    """Choose the video stream matching the requested quality/container.

    *quality* is ``"best"`` or a pixel height as a string.
    """
    candidates = [f for f in formats if f.get("has_video", True)]
    if not candidates:
        raise AppError(
            "NO_FORMAT", "No video format is available for this video.", 400
        )

    target_height: int | None
    if quality == "best":
        heights = [f["quality"] for f in candidates if f["quality"]]
        target_height = max(heights) if heights else None
    else:
        try:
            target_height = int(quality)
        except (TypeError, ValueError):
            raise AppError(
                "INVALID_REQUEST", "Invalid video quality requested.", 400
            ) from None

    if target_height is None:
        group = candidates
    else:
        group = [f for f in candidates if f["quality"] == target_height]
        if not group:
            below = [f for f in candidates if f["quality"] and f["quality"] < target_height]
            if below:
                best_below = max(f["quality"] for f in below)
                group = [f for f in candidates if f["quality"] == best_below]
            else:
                above = [f for f in candidates if f["quality"]]
                if above:
                    best_above = min(f["quality"] for f in above)
                    group = [f for f in candidates if f["quality"] == best_above]
                else:
                    group = candidates

    return _pick_best_format(group, container)


def select_audio_stream(audio_formats: list[dict], container: str) -> dict | None:
    """Pick the best audio-only stream to pair with a video merge.

    Prefers a container compatible with the video container, then highest
    bitrate. Returns None when no separate audio stream exists.
    """
    if not audio_formats:
        return None

    compatible = [f for f in audio_formats if f.get("container") == container]
    pool = compatible or audio_formats

    def key(f: dict) -> tuple:
        return (f.get("bitrate") or 0, 0 if f.get("container") == container else 1)

    return max(pool, key=key)


def select_best_audio_format(
    audio_formats: list[dict], container: str
) -> dict:
    """Pick the audio source used for audio-only downloads."""
    if not audio_formats:
        raise AppError(
            "NO_FORMAT", "No audio format is available for this video.", 400
        )
    compatible = [f for f in audio_formats if f["container"] == container]
    pool = compatible or audio_formats

    def key(f: dict) -> tuple:
        return (f["bitrate"] or 0, 0 if f["container"] == container else 1)

    return max(pool, key=key)