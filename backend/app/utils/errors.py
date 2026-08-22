"""Error types and yt-dlp error mapping.

Raw Python exceptions are never exposed to the frontend. Every failure is
converted into an AppError carrying a stable machine code and a friendly
human message. Full details are logged server-side instead.
"""

from __future__ import annotations

import socket

from yt_dlp.utils import (
    DownloadError,
    GeoRestrictedError,
    UnsupportedError,
    YoutubeDLError,
)


class AppError(Exception):
    """An application-level error safe to send to the client."""

    def __init__(
        self,
        code: str,
        message: str,
        status: int = 500,
        detail: str | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.detail = detail

    def to_dict(self) -> dict:
        payload: dict = {"code": self.code, "message": self.message}
        if self.detail:
            payload["detail"] = self.detail
        return payload


def _joined_message(err: Exception) -> str:
    parts = [str(err)]
    caused_by = getattr(err, "caused_by", None)
    if caused_by is not None:
        parts.append(str(caused_by))
    exc_info = getattr(err, "exc_info", None)
    if exc_info:
        parts.append(str(exc_info[1]) if exc_info[1] else "")
    return " ".join(parts).lower()


def map_ytdlp_error(err: Exception) -> tuple[str, str, int]:
    """Map a yt-dlp exception to (code, message, http_status)."""
    text = _joined_message(err)

    if isinstance(err, GeoRestrictedError) or "geo-restricted" in text:
        return (
            "GEO_RESTRICTED",
            "This video isn't available in your region.",
            403,
        )
    if isinstance(err, UnsupportedError) or "unsupported url" in text:
        return (
            "UNSUPPORTED_URL",
            "That link isn't supported.",
            400,
        )
    if (
        "sign in to confirm" in text
        or "identified as part of a pool" in text
        or "not a bot" in text
        or "confirm you're not a bot" in text
    ):
        return (
            "ACCESS_RESTRICTED",
            "YouTube is restricting automated access right now. Please try again later.",
            429,
        )
    if "private video" in text or ("private" in text and "sign in" in text):
        return (
            "VIDEO_PRIVATE",
            "This video is private. You need access to it to download it.",
            403,
        )
    if "age-restricted" in text or "age restricted" in text or "requires you to confirm your age" in text:
        return (
            "AGE_RESTRICTED",
            "This video is age-restricted and can't be downloaded.",
            403,
        )
    if (
        "video unavailable" in text
        or "is unavailable" in text
        or "has been removed" in text
        or "removed by the uploader" in text
        or "this video is not available" in text
        or "taken down" in text
        or "deleted" in text
        or "not found" in text
    ):
        return (
            "VIDEO_UNAVAILABLE",
            "This video isn't available for downloading.",
            404,
        )
    if (
        "timed out" in text
        or "timeout" in text
        or isinstance(getattr(err, "caused_by", None), socket.timeout)
    ):
        return (
            "TIMEOUT",
            "The request timed out. Please try again.",
            504,
        )

    if isinstance(err, (DownloadError, YoutubeDLError)):
        # Generic network / extraction failure.
        return (
            "PROCESSING_ERROR",
            "Something went wrong while processing the video. Please try again.",
            502,
        )

    return (
        "INTERNAL",
        "Something went wrong while processing the video. Please try again.",
        500,
    )