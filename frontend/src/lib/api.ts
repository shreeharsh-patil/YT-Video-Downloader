import type {
  DownloadRequest,
  VideoMetadata,
} from "@/types";
import { resolveDirectProvider } from "@/lib/direct-provider";

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
  let resolved: {
    title: string;
    creator: string;
    thumbnail: string | null;
    isAudio: boolean;
    mediaUrl?: string;
    filename?: string;
  };
  try {
    resolved = await resolveDirectProvider(url, "video");
  } catch {
    resolved = await requestJson<typeof resolved>("/analyze", {
      method: "POST",
      body: JSON.stringify({ url, type: "video" }),
    });
  }
  return {
    type: "video", id: null, url, title: resolved.title, thumbnail: resolved.thumbnail,
    channel: resolved.creator, uploader: resolved.creator, duration: null, duration_human: "—",
    view_count: null, upload_date: null, description: null, is_short: false,
    // The provider does not describe its variants during analysis. Offer the
    // common video targets so people can state a preferred quality; the route
    // forwards that preference to providers that support it.
    formats: resolved.isAudio ? [] : [1080, 720, 480, 360].map((quality) => ({ id: `provider-${quality}`, quality, quality_label: `${quality}p`, fps: null, extension: "mp4", container: "mp4", video_codec: null, audio_codec: null, has_audio: true, is_progressive: true, file_size: null, file_size_estimate: null, format_note: "Provider-selected" })),
    audio_formats: [{ id: "provider", bitrate: null, extension: "mp3", container: "mp3", audio_codec: null, file_size: null, file_size_estimate: null, format_note: null }],
    best_video_quality: null, best_audio_bitrate: null, playlist_entries: [], playlist_count: 0,
    resolved_media_url: resolved.mediaUrl,
    resolved_filename: resolved.filename,
  };
}

/**
 * Delegate the transfer to the browser's download manager. Submitting a form
 * into an invisible iframe preserves the POST request while allowing the
 * attachment response to trigger native download progress and notifications.
 */
export function startIframeDownload(params: DownloadRequest): void {
  const frameName = `streamkit-download-${crypto.randomUUID()}`;
  const iframe = document.createElement("iframe");
  iframe.name = frameName;
  iframe.hidden = true;
  iframe.setAttribute("aria-hidden", "true");

  const form = document.createElement("form");
  form.method = "post";
  form.action = `${API_BASE}/download`;
  form.target = frameName;
  form.hidden = true;

  for (const [name, value] of Object.entries(params)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.append(input);
  }

  document.body.append(iframe, form);
  form.submit();
  // The download continues in the browser after the form is removed.
  window.setTimeout(() => {
    form.remove();
    iframe.remove();
  }, 60_000);
}
