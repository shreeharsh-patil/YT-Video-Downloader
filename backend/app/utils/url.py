"""Domain validation for YouTube URLs.

Only well-known YouTube surfaces are accepted. The goal is to prevent the
server from being used as an arbitrary URL fetcher.
"""

from __future__ import annotations

import re
from urllib.parse import parse_qs, urlparse

from .errors import AppError

# A valid YouTube video id is 11 chars of [A-Za-z0-9_-].
_VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")

# Hostnames we accept.
_ALLOWED_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtube-nocookie.com",
    "www.youtube-nocookie.com",
    "youtu.be",
}

_HTTP_RE = re.compile(r"^https?://", re.IGNORECASE)


def is_playlist_or_channel_url(raw: str) -> bool:
    """Check if the given URL is a playlist or channel URL."""
    url = (raw or "").strip()
    if not _HTTP_RE.match(url):
        url = "https://" + url
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    path = parsed.path or ""
    query = parse_qs(parsed.query)
    if "list" in query:
        return True
    if path.startswith("/playlist") or path.startswith("/@") or path.startswith("/channel/") or path.startswith("/c/"):
        return True
    return False


def normalize_youtube_url(raw: str) -> str:
    """Validate *raw* and return a canonical video or playlist URL.

    Raises AppError with a human readable message when the input is not a
    supported YouTube URL.
    """
    url = (raw or "").strip()
    if not url:
        raise AppError(
            "INVALID_URL", "Please enter a valid YouTube URL.", status=400
        )
    # A bare video id (11 chars) pasted without any URL around it.
    if _VIDEO_ID_RE.match(url):
        return f"https://www.youtube.com/watch?v={url}"
    if not _HTTP_RE.match(url):
        url = "https://" + url

    try:
        parsed = urlparse(url)
    except ValueError as exc:
        raise AppError(
            "INVALID_URL", "Please enter a valid YouTube URL.", status=400
        ) from exc

    host = (parsed.hostname or "").lower()
    if host not in _ALLOWED_HOSTS:
        raise AppError(
            "INVALID_URL",
            "Please enter a valid YouTube URL.",
            status=400,
        )

    # Prefer the single video when a watch URL also carries a list id, so
    # "watch?v=...&list=..." downloads the video the user is looking at.
    # Pure /playlist?list=... links still normalize to a playlist URL below.
    video_id = _extract_video_id(parsed)
    if video_id and not (parsed.path or "").startswith("/playlist"):
        return f"https://www.youtube.com/watch?v={video_id}"

    query = parse_qs(parsed.query)
    if "list" in query:
        playlist_id = query["list"][0]
        if playlist_id:
            return f"https://www.youtube.com/playlist?list={playlist_id}"

    # Check for channel / user URLs
    path = parsed.path or ""
    if path.startswith("/@") or path.startswith("/channel/") or path.startswith("/c/"):
        return f"https://www.youtube.com{path}"

    # Otherwise extract single video id (already computed above when present)
    if not video_id:
        raise AppError(
            "UNSUPPORTED_URL",
            "That link doesn't point to a video or playlist. Please provide a valid YouTube link.",
            status=400,
        )
    return f"https://www.youtube.com/watch?v={video_id}"


def _extract_video_id(parsed: urlparse) -> str | None:
    host = (parsed.hostname or "").lower()
    path = parsed.path or ""

    if host == "youtu.be":
        candidate = path.strip("/").split("/")[0]
        return candidate if _VIDEO_ID_RE.match(candidate) else None

    if path.startswith("/shorts/") or path.startswith("/embed/") or path.startswith("/live/"):
        candidate = path.split("/")[2] if len(path.split("/")) > 2 else ""
        return candidate if _VIDEO_ID_RE.match(candidate) else None

    if path.startswith("/v/"):
        candidate = path.split("/")[2] if len(path.split("/")) > 2 else ""
        return candidate if _VIDEO_ID_RE.match(candidate) else None

    if path.startswith("/watch") or path.startswith("/live"):
        query = parse_qs(parsed.query)
        candidates = query.get("v")
        if not candidates:
            return None
        candidate = candidates[0]
        return candidate if _VIDEO_ID_RE.match(candidate) else None

    return None