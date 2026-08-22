/**
 * Mirrors the backend's AnalyzeResponse / DownloadRequest schemas
 * (backend/app/schemas.py). Keep both in sync.
 */

export interface VideoFormat {
  id: string;
  quality: number | null;
  quality_label: string | null;
  fps: number | null;
  extension: string;
  container: string;
  video_codec: string | null;
  audio_codec: string | null;
  has_audio: boolean;
  is_progressive: boolean;
  file_size: number | null;
  file_size_estimate: number | null;
  format_note: string | null;
}

export interface AudioFormat {
  id: string;
  bitrate: number | null;
  extension: string;
  container: string;
  audio_codec: string | null;
  file_size: number | null;
  file_size_estimate: number | null;
  format_note: string | null;
}

export interface PlaylistEntry {
  id: string;
  url: string;
  title: string;
  duration: number | null;
  duration_human: string;
  thumbnail: string | null;
  uploader: string | null;
}

export interface VideoMetadata {
  type: "video" | "playlist";
  id: string | null;
  url: string;
  title: string;
  thumbnail: string | null;
  channel: string;
  uploader: string | null;
  duration: number | null;
  duration_human: string;
  view_count: number | null;
  upload_date: string | null;
  description: string | null;
  is_short: boolean;
  formats: VideoFormat[];
  audio_formats: AudioFormat[];
  best_video_quality: number | null;
  best_audio_bitrate: number | null;
  playlist_entries: PlaylistEntry[];
  playlist_count: number;
}

export type DownloadMode = "video" | "audio";
export type VideoContainer = "mp4" | "webm";
export type AudioFormatKey = "m4a" | "opus" | "mp3";

export type AppState =
  | "idle"
  | "analyzing"
  | "analyzed"
  | "downloading"
  | "completed"
  | "error";

export interface DownloadProgressState {
  stage: string;
  progress: number | null;
  downloadedBytes: number | null;
  totalBytes: number | null;
  message: string | null;
}

export interface CompletedInfo {
  filename: string;
  size: number;
  size_human: string;
}

/** Body sent to POST /api/download (backend DownloadRequest). */
export interface DownloadRequest {
  url: string;
  type: DownloadMode;
  quality: string;
  container: string;
}
