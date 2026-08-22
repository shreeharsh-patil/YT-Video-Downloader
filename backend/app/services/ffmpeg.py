"""FFmpeg helpers used for merging and audio conversion.

All ffmpeg invocations use argument arrays (never shell strings), so untrusted
input cannot be injected into the command line.
"""

from __future__ import annotations

import logging
import shutil
import subprocess
from typing import Iterable

from ..config import FFMPEG_PATH, FFMPEG_TIMEOUT
from ..utils.errors import AppError

logger = logging.getLogger("ytdl.services.ffmpeg")

_MP3_BITRATES = (32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320)


def ensure_ffmpeg() -> bool:
    """Return True when a usable ffmpeg binary is on the system."""
    return shutil.which(FFMPEG_PATH) is not None


def _run(cmd: list[str]) -> None:
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=FFMPEG_TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        logger.error("ffmpeg timed out: %s", " ".join(cmd))
        raise AppError(
            "FFMPEG_ERROR",
            "Video processing timed out. Please try again.",
            status=504,
        ) from None
    except OSError as exc:
        logger.error("ffmpeg could not be started: %s", exc)
        raise AppError(
            "FFMPEG_ERROR",
            "FFmpeg is not available on the server.",
            status=500,
        ) from exc

    if proc.returncode != 0:
        logger.error(
            "ffmpeg failed (rc=%s): %s", proc.returncode, proc.stderr[-2000:]
        )
        raise AppError(
            "FFMPEG_ERROR",
            "Video processing failed while merging streams. Please try again.",
            status=500,
        )


def merge_streams(
    video_path: str, audio_path: str, output_path: str, container: str
) -> None:
    """Losslessly mux separate video and audio streams into one file."""
    cmd: list[str] = [
        FFMPEG_PATH,
        "-y",
        "-loglevel",
        "error",
        "-i",
        video_path,
        "-i",
        audio_path,
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c",
        "copy",
    ]
    if container == "mp4":
        cmd += ["-movflags", "+faststart"]
    cmd.append(output_path)
    logger.info("merging streams -> %s", output_path)
    _run(cmd)


def remux_stream(
    input_path: str, output_path: str, container: str
) -> None:
    """Re-mux a single (already combined) stream into the target container."""
    cmd = [
        FFMPEG_PATH,
        "-y",
        "-loglevel",
        "error",
        "-i",
        input_path,
        "-c",
        "copy",
    ]
    if container == "mp4":
        cmd += ["-movflags", "+faststart"]
    cmd.append(output_path)
    _run(cmd)


def convert_audio(
    input_path: str,
    output_path: str,
    codec: str,
    bitrate_kbps: int | None = None,
) -> None:
    """Transcode audio to *codec* at *bitrate_kbps* (if given)."""
    cmd: list[str] = [
        FFMPEG_PATH,
        "-y",
        "-loglevel",
        "error",
        "-i",
        input_path,
        "-vn",
        "-c:a",
        codec,
    ]
    if bitrate_kbps is not None:
        cmd += ["-b:a", f"{bitrate_kbps}k"]
    if output_path.endswith((".m4a", ".mp4")):
        cmd += ["-movflags", "+faststart"]
    cmd.append(output_path)
    logger.info("converting audio -> %s (%d kbps)", output_path, bitrate_kbps or 0)
    _run(cmd)


def nearest_mp3_bitrate(kbps: int) -> int:
    """Round a bitrate down to the nearest value MP3 actually supports."""
    return max(b for b in _MP3_BITRATES if b <= kbps) if kbps >= _MP3_BITRATES[0] else _MP3_BITRATES[0]


def effective_audio_bitrate(requested: str | None, source_kbps: int | None) -> int | None:
    """Never claim a higher bitrate than the source actually contains.

    Returns the bitrate to use for transcoding, or None when the source should
    be kept untouched.
    """
    if requested in (None, "", "best"):
        return None
    try:
        requested_kbps = int(requested)
    except (TypeError, ValueError):
        return None
    if source_kbps is None:
        return requested_kbps
    return min(requested_kbps, source_kbps)