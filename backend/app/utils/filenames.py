"""Safe filename generation for downloads."""

from __future__ import annotations

import re

# Characters forbidden by common filesystems (Windows + POSIX best-effort).
_FORBIDDEN = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
_RESERVED = {
    "con", "prn", "aux", "nul",
    *(f"com{i}" for i in range(1, 10)),
    *(f"lpt{i}" for i in range(1, 10)),
}

_MAX_LENGTH = 150


def sanitize_filename(title: str, fallback: str = "video") -> str:
    """Return a filesystem-safe filename base derived from *title*.

    The result has no path separators, no control characters and is trimmed to
    a reasonable length. Reserved device names are avoided.
    """
    name = _FORBIDDEN.sub(" ", title or "").strip()
    name = re.sub(r"\s+", " ", name)
    name = name.rstrip(". ")
    if not name:
        name = fallback
    if name.lower() in _RESERVED:
        name = f"{name}_"
    if len(name) > _MAX_LENGTH:
        name = name[:_MAX_LENGTH].rstrip(" .")
    return name or fallback