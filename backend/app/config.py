import os
import tempfile


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except (TypeError, ValueError):
        return default


# Comma-separated list of origins allowed to call the API.
ALLOWED_ORIGINS: list[str] = [
    origin.strip()
    for origin in os.environ.get(
        "ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
    ).split(",")
    if origin.strip()
]

# Maximum total size in bytes a single download may produce.
MAX_DOWNLOAD_SIZE: int = _env_int("MAX_DOWNLOAD_SIZE", 2 * 1024 * 1024 * 1024)

# Maximum wall-clock time in seconds for a single download.
DOWNLOAD_TIMEOUT: int = _env_int("DOWNLOAD_TIMEOUT", 900)

# Maximum requests per minute per client IP.
RATE_LIMIT: int = _env_int("RATE_LIMIT", 30)

# Root directory where per-request temporary workspaces are created.
TEMP_ROOT: str = os.environ.get(
    "TEMP_ROOT", os.path.join(tempfile.gettempdir(), "yt-video-downloader")
)

# Path to the ffmpeg / ffprobe binaries (auto-detected by yt-dlp when set to "ffmpeg").
FFMPEG_PATH: str = os.environ.get("FFMPEG_PATH", "ffmpeg")
FFPROBE_PATH: str = os.environ.get("FFPROBE_PATH", "ffprobe")

# Socket timeout used by yt-dlp network requests.
SOCKET_TIMEOUT: int = _env_int("SOCKET_TIMEOUT", 30)

# Timeout for internal ffmpeg subprocesses in seconds.
FFMPEG_TIMEOUT: int = _env_int("FFMPEG_TIMEOUT", 900)

# Enable detailed request logging.
DEBUG: bool = _env_bool("DEBUG", False)

# Optional environment label surfaced to the frontend (used by the status check).
ENVIRONMENT: str = os.environ.get("ENVIRONMENT", "development")

APP_NAME: str = "YtDL App"
