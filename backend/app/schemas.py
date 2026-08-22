"""Pydantic request/response models for the public API."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

VIDEO_QUALITIES = {"best", "2160", "1440", "1080", "720", "480", "360", "240", "144"}
VIDEO_CONTAINERS = {"mp4", "webm"}
AUDIO_CONTAINERS = {"m4a", "opus", "mp3"}
AUDIO_QUALITIES = {"best", "320", "256", "192", "128"}


class AnalyzeRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2000)


class VideoFormat(BaseModel):
    id: str
    quality: int | None
    quality_label: str | None
    fps: int | None
    extension: str
    container: str
    video_codec: str | None
    audio_codec: str | None
    has_audio: bool
    is_progressive: bool
    file_size: int | None
    file_size_estimate: int | None
    format_note: str | None


class AudioFormat(BaseModel):
    id: str
    bitrate: int | None
    extension: str
    container: str
    audio_codec: str | None
    file_size: int | None
    file_size_estimate: int | None
    format_note: str | None


class PlaylistEntry(BaseModel):
    id: str
    url: str
    title: str
    duration: float | None = None
    duration_human: str = "—"
    thumbnail: str | None = None
    uploader: str | None = None


class AnalyzeResponse(BaseModel):
    type: Literal["video", "playlist"] = "video"
    id: str | None = None
    url: str
    title: str
    thumbnail: str | None = None
    channel: str = "Unknown"
    uploader: str | None = None
    duration: float | None = None
    duration_human: str = "—"
    view_count: int | None = None
    upload_date: str | None = None
    description: str | None = None
    is_short: bool = False
    formats: list[VideoFormat] = []
    audio_formats: list[AudioFormat] = []
    best_video_quality: int | None = None
    best_audio_bitrate: int | None = None
    playlist_entries: list[PlaylistEntry] = []
    playlist_count: int = 0


class DownloadRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2000)
    type: Literal["video", "audio"]
    quality: str = "best"
    container: str = "mp4"


class ErrorDetail(BaseModel):
    code: str
    message: str
    detail: str | None = None


class HealthResponse(BaseModel):
    status: str
    service: str
    ffmpeg: bool