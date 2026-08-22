"""Download endpoint.

Streams NDJSON progress events followed by the final file bytes in a single
HTTP response. Each request gets its own temporary directory that is removed
in a finally block regardless of success, failure or client disconnect.
"""

from __future__ import annotations

import json
import logging
import os
import queue as queue_mod
import tempfile
import threading
import uuid
from typing import Iterator

from fastapi import APIRouter, Depends, Request
from fastapi import HTTPException
from fastapi.responses import StreamingResponse

from ..config import (
    DOWNLOAD_TIMEOUT,
    MAX_DOWNLOAD_SIZE,
    TEMP_ROOT,
)
from ..schemas import (
    AUDIO_CONTAINERS,
    AUDIO_QUALITIES,
    VIDEO_CONTAINERS,
    DownloadRequest,
)
from ..services import ffmpeg as ffmpeg_service
from ..services import youtube
from ..services.downloader import (
    DownloadTracker,
    cleanup_files,
    download_audio_pipeline,
    download_video_pipeline,
)
from ..utils.errors import AppError
from ..utils.filenames import sanitize_filename
from ..utils.rate_limit import enforce_rate_limit
from ..utils.url import normalize_youtube_url

logger = logging.getLogger("ytdl.routes.download")

router = APIRouter(tags=["download"])

_CHUNK_SIZE = 1024 * 1024


def _validate_request(body: DownloadRequest) -> None:
    if body.type == "video":
        if body.container not in VIDEO_CONTAINERS:
            raise AppError(
                "INVALID_REQUEST",
                "Unsupported video container requested.",
                status=400,
            )
        if body.quality != "best" and not body.quality.isdigit():
            raise AppError(
                "INVALID_REQUEST",
                "Invalid video quality requested.",
                status=400,
            )
    else:
        if body.container not in AUDIO_CONTAINERS:
            raise AppError(
                "INVALID_REQUEST",
                "Unsupported audio format requested.",
                status=400,
            )
        if body.quality not in AUDIO_QUALITIES:
            raise AppError(
                "INVALID_REQUEST",
                "Invalid audio quality requested.",
                status=400,
            )


def _yield_bytes_line(event: dict) -> bytes:
    return (json.dumps(event) + "\n").encode("utf-8")


def _read_chunks(path: str) -> Iterator[bytes]:
    with open(path, "rb") as handle:
        while True:
            chunk = handle.read(_CHUNK_SIZE)
            if not chunk:
                break
            yield chunk


@router.post(
    "/api/download",
    responses={
        400: {"description": "Invalid request"},
        429: {"description": "Rate limited"},
    },
)
def download(
    body: DownloadRequest,
    request: Request,
    _: None = Depends(enforce_rate_limit),
) -> StreamingResponse:
    try:
        normalized = normalize_youtube_url(body.url)
        _validate_request(body)
    except AppError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.to_dict()) from exc

    def event_stream() -> Iterator[bytes]:
        out_dir: str | None = None
        queue: "queue_mod.Queue[tuple[str, object]]" = queue_mod.Queue()
        result: dict[str, str] = {}

        def emit(event: dict) -> None:
            queue.put(("event", _yield_bytes_line(event)))

        def worker() -> None:
            try:
                if not ffmpeg_service.ensure_ffmpeg():
                    raise AppError(
                        "FFMPEG_ERROR",
                        "FFmpeg is not available on the server.",
                        status=500,
                    )

                tracker = DownloadTracker(MAX_DOWNLOAD_SIZE, DOWNLOAD_TIMEOUT)
                info = youtube.analyze_video(normalized)
                video_formats, audio_formats = youtube.get_available_formats(info)
                title = info.get("title") or "video"
                base = sanitize_filename(title, fallback="video")

                if body.type == "video":
                    video_fmt = youtube.select_video_format(
                        video_formats, body.quality, body.container
                    )
                    audio_fmt = (
                        None
                        if video_fmt.get("is_progressive")
                        else youtube.select_audio_stream(
                            audio_formats, body.container
                        )
                    )
                    final_path = download_video_pipeline(
                        url=normalized,
                        video_fmt=video_fmt,
                        audio_fmt=audio_fmt,
                        container=body.container,
                        out_dir=out_dir,
                        base=base,
                        tracker=tracker,
                        emit=emit,
                    )
                else:
                    source_fmt = youtube.select_best_audio_format(
                        audio_formats, body.container
                    )
                    final_path = download_audio_pipeline(
                        url=normalized,
                        source_fmt=source_fmt,
                        container=body.container,
                        quality=body.quality,
                        out_dir=out_dir,
                        base=base,
                        tracker=tracker,
                        emit=emit,
                    )

                if not os.path.isfile(final_path):
                    raise AppError(
                        "DOWNLOAD_FAILED",
                        "The download finished without producing a file. Please try again.",
                        status=502,
                    )
                result["final_path"] = final_path
                queue.put(("done", None))
            except AppError as exc:
                logger.warning("download aborted: %s (%s)", exc.code, exc.message)
                queue.put(("error", exc))
            except Exception as exc:  # noqa: BLE001
                logger.exception("unexpected download failure")
                queue.put(
                    (
                        "error",
                        AppError(
                            "INTERNAL",
                            "Something went wrong while downloading. Please try again.",
                            status=500,
                        ),
                    )
                )

        try:
            os.makedirs(TEMP_ROOT, exist_ok=True)
            out_dir = tempfile.mkdtemp(
                prefix=f"dl_{uuid.uuid4().hex}_", dir=TEMP_ROOT
            )
            emit(
                {
                    "type": "status",
                    "stage": "preparing",
                    "message": "Preparing...",
                }
            )

            thread = threading.Thread(target=worker, name="ytdl-download", daemon=True)
            thread.start()

            while True:
                kind, payload = queue.get()
                if kind == "event":
                    yield payload  # type: ignore[misc]
                elif kind == "error":
                    err = payload  # type: ignore[assignment]
                    yield _yield_bytes_line(
                        {"type": "error", "code": err.code, "message": err.message}  # type: ignore[union-attr]
                    )
                    return
                else:
                    break

            final_path = result["final_path"]
            yield _yield_bytes_line(
                {
                    "type": "status",
                    "stage": "finalizing",
                    "message": "Finalizing...",
                }
            )

            size = os.path.getsize(final_path)
            filename = os.path.basename(final_path)
            yield _yield_bytes_line(
                {
                    "type": "file",
                    "filename": filename,
                    "size": size,
                }
            )
            yield from _read_chunks(final_path)

            logger.info("download complete: %s (%d bytes)", filename, size)

        except AppError as exc:
            logger.warning("stream error: %s (%s)", exc.code, exc.message)
            yield _yield_bytes_line(
                {
                    "type": "error",
                    "code": exc.code,
                    "message": exc.message,
                }
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("unexpected stream failure")
            yield _yield_bytes_line(
                {
                    "type": "error",
                    "code": "INTERNAL",
                    "message": "Something went wrong while downloading. Please try again.",
                }
            )
        finally:
            if out_dir:
                cleanup_files(out_dir)

    return StreamingResponse(
        event_stream(),
        media_type="application/octet-stream",
        headers={
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )