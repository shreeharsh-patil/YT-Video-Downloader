import type {
  DownloadRequest,
  VideoMetadata,
} from "@/types";

export class ApiError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const API_BASE = "/api/provider";

export interface ProgressUpdate {
  stage: string;
  progress: number | null;
  downloadedBytes: number | null;
  totalBytes: number | null;
  message: string | null;
}

/**
 * Extract a human-readable message from the backend's error payloads,
 * which are either `{code, message}` (AppError handler), FastAPI's
 * `{detail: {code, message}}`, or `{detail: "string"}`.
 */
async function extractErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: unknown;
      message?: unknown;
      detail?: unknown;
    };
    const detail = body.detail;
    if (typeof detail === "string" && detail.trim()) return detail;
    if (
      detail &&
      typeof detail === "object" &&
      typeof (detail as { message?: unknown }).message === "string"
    ) {
      return (detail as { message: string }).message;
    }
    if (typeof body.message === "string" && body.message.trim()) return body.message;
    if (typeof body.error === "string" && body.error.trim()) return body.error;
  } catch {
    /* ignore parse errors */
  }
  return fallback;
}

async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError("The request timed out. Please try again.");
    }
    throw new ApiError(
      "Could not reach the download server. Is the backend running?",
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new ApiError(
      await extractErrorMessage(response, `Request failed (${response.status}).`),
      response.status,
    );
  }

  return (await response.json()) as T;
}

export async function analyzeUrl(url: string): Promise<VideoMetadata> {
  const resolved = await requestJson<{
    title: string;
    creator: string;
    thumbnail: string | null;
    isAudio: boolean;
  }>("/analyze", {
    method: "POST",
    body: JSON.stringify({ url, type: "video" }),
  });
  return {
    type: "video", id: null, url, title: resolved.title, thumbnail: resolved.thumbnail,
    channel: resolved.creator, uploader: resolved.creator, duration: null, duration_human: "—",
    view_count: null, upload_date: null, description: null, is_short: false,
    formats: resolved.isAudio ? [] : [{ id: "provider", quality: null, quality_label: "Best available", fps: null, extension: "mp4", container: "mp4", video_codec: null, audio_codec: null, has_audio: true, is_progressive: true, file_size: null, file_size_estimate: null, format_note: null }],
    audio_formats: [{ id: "provider", bitrate: null, extension: "mp3", container: "mp3", audio_codec: null, file_size: null, file_size_estimate: null, format_note: null }],
    best_video_quality: null, best_audio_bitrate: null, playlist_entries: [], playlist_count: 0,
  };
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const next = new Uint8Array(a.length + b.length);
  next.set(a);
  next.set(b, a.length);
  return next;
}

function indexOfByte(haystack: Uint8Array, needle: number, from: number): number {
  for (let i = from; i < haystack.length; i++) {
    if (haystack[i] === needle) return i;
  }
  return -1;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function fetchDownload(
  params: DownloadRequest,
  onProgress: (update: ProgressUpdate) => void,
): Promise<{ filename: string; blob: Blob }> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
  } catch {
    throw new ApiError(
      "Could not reach the download server. Is the backend running?",
    );
  }

  if (!response.ok) {
    throw new ApiError(
      await extractErrorMessage(response, `Download failed (${response.status}).`),
      response.status,
    );
  }

  const contentType = response.headers.get("Content-Type") ?? "";
  if (!contentType.includes("application/octet-stream") && !contentType.startsWith("video/") && !contentType.startsWith("audio/")) {
    throw new ApiError("Unexpected response from the server.");
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new ApiError("Streaming is not supported by this browser.");
  }

  const disposition = response.headers.get("Content-Disposition") ?? "";
  const encodedFilename = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const directFile = Boolean(encodedFilename);
  const decoder = new TextDecoder();
  let buffer: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  let binary: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  let filename = "download";
  if (directFile) filename = decodeURIComponent(encodedFilename ?? "download");
  let sawFileEvent = false;

  const handleLine = (line: string): void => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      return; // ignore malformed lines
    }
    switch (event.type) {
      case "status":
        onProgress({
          stage: String(event.stage ?? ""),
          progress: null,
          downloadedBytes: null,
          totalBytes: null,
          message: typeof event.message === "string" ? event.message : null,
        });
        break;
      case "progress":
        onProgress({
          stage: String(event.stage ?? ""),
          progress: num(event.progress),
          downloadedBytes: num(event.downloaded_bytes),
          totalBytes: num(event.total_bytes),
          message: null,
        });
        break;
      case "file":
        sawFileEvent = true;
        if (typeof event.filename === "string" && event.filename) {
          filename = event.filename;
        }
        break;
      case "error":
        throw new ApiError(
          typeof event.message === "string" && event.message
            ? event.message
            : "Download failed.",
        );
      default:
        break;
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.length === 0) continue;

      if (directFile || sawFileEvent) {
        // Everything after the file event line is raw file data.
        binary = concatBytes(binary, value);
        continue;
      }

      buffer = concatBytes(buffer, value);

      let consumed = 0;
      for (;;) {
        // Once the file event is seen, every remaining byte (including any
        // newline bytes inside the binary data) belongs to the file.
        if (sawFileEvent) break;
        const newlineIdx = indexOfByte(buffer, 10, consumed);
        if (newlineIdx === -1) break;
        const lineBytes = buffer.slice(consumed, newlineIdx);
        consumed = newlineIdx + 1;
        handleLine(decoder.decode(lineBytes, { stream: true }));
      }

      const rest = buffer.slice(consumed);
      if (sawFileEvent) {
        // The file began inside this chunk: its first bytes are still in `rest`.
        binary = concatBytes(binary, rest);
        buffer = new Uint8Array(0);
      } else {
        buffer = rest;
      }
    }
  } finally {
    // Release the connection if we exit early (e.g. an error event).
    reader.cancel().catch(() => {});
  }

  if (!directFile && !sawFileEvent) {
    throw new ApiError("No file was received from the server.");
  }

  return {
    filename,
    blob: new Blob([binary.buffer as ArrayBuffer], {
      type: "application/octet-stream",
    }),
  };
}
