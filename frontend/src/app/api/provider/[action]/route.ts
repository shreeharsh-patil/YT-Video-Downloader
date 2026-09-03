import { NextRequest } from "next/server";
import { detectPlatform } from "@/lib/platforms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Mode = "video" | "audio";

type ResolvedMedia = {
  title: string;
  creator: string;
  thumbnail: string | null;
  mediaUrl: string;
  filename: string;
  isAudio: boolean;
};

// These are intentionally server-side: browsers never call third-party APIs
// directly, avoiding CORS issues and keeping the integration in one place.
const PROVIDER_BASES = ["https://backend1.tioo.eu.org"] as const;
const INSTAGRAM_AUDIO_API = "https://instagram-audio-downloader-api.vercel.app/api/download";
const PROVIDER_TIMEOUT_MS = 20_000;
const HIGHEST_VIDEO_QUALITY = "4320";

function providerBases(): string[] {
  return [...PROVIDER_BASES];
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function filename(title: string, extension: string): string {
  const safe = title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
  return `${(safe || "download").slice(0, 90)}.${extension}`;
}

function extensionFromUrl(url: string, fallback: string): string {
  try {
    const match = new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i);
    return match?.[1]?.toLowerCase() || fallback;
  } catch {
    return fallback;
  }
}

function isCompleteMediaResponse(response: Response): boolean {
  if (!response.body) return false;
  if (response.status === 200) return true;
  // Some CDNs label a complete response as 206. Accept it only when the
  // advertised range spans every byte of the file; other ranges are partial.
  if (response.status !== 206) return false;
  const range = response.headers.get("content-range")?.match(/^bytes 0-(\d+)\/(\d+)$/i);
  if (!range) return false;
  const end = Number(range[1]);
  const total = Number(range[2]);
  return Number.isSafeInteger(end) && Number.isSafeInteger(total) && total > 0 && end + 1 === total;
}

function valueAt(object: unknown, key: string): unknown {
  return object && typeof object === "object" ? (object as Record<string, unknown>)[key] : undefined;
}

function resolveResponse(platform: string, body: unknown, mode: Mode): ResolvedMedia | null {
  if (platform === "youtube") {
    const title = text(valueAt(body, "title"), "youtube-media");
    const mediaUrl = valueAt(body, mode === "audio" ? "mp3" : "mp4");
    if (typeof mediaUrl !== "string") return null;
    return { title, creator: text(valueAt(body, "author"), "YouTube"), thumbnail: typeof valueAt(body, "thumbnail") === "string" ? valueAt(body, "thumbnail") as string : null, mediaUrl, filename: filename(title, mode === "audio" ? "mp3" : "mp4"), isAudio: mode === "audio" };
  }
  if (platform === "tiktok") {
    const data = valueAt(body, "data");
    const title = text(valueAt(data, "title"), "tiktok-media");
    const author = valueAt(data, "author");
    const mediaUrl = valueAt(data, mode === "audio" ? "music" : "play");
    if (typeof mediaUrl !== "string") return null;
    return { title, creator: text(valueAt(author, "nickname"), text(valueAt(author, "unique_id"), "TikTok")), thumbnail: typeof valueAt(data, "cover") === "string" ? valueAt(data, "cover") as string : null, mediaUrl, filename: filename(title, mode === "audio" ? "mp3" : "mp4"), isAudio: mode === "audio" };
  }
  if (platform === "instagram") {
    if (mode === "audio" || !Array.isArray(body)) return null;
    const first = body.find((item) => typeof valueAt(item, "url") === "string");
    const mediaUrl = valueAt(first, "url");
    if (typeof mediaUrl !== "string") return null;
    const title = text(valueAt(first, "title"), "instagram-media");
    return { title, creator: text(valueAt(first, "author"), "Instagram"), thumbnail: typeof valueAt(first, "thumbnail") === "string" ? valueAt(first, "thumbnail") as string : null, mediaUrl, filename: filename(title, "mp4"), isAudio: false };
  }
  if (platform === "x") {
    if (mode === "audio") return null;
    const videos = valueAt(body, "url");
    const first = Array.isArray(videos) ? videos[0] : null;
    const mediaUrl = valueAt(first, "hd") || valueAt(first, "sd");
    if (typeof mediaUrl !== "string") return null;
    const title = text(valueAt(body, "title"), "x-video");
    return { title, creator: "X", thumbnail: null, mediaUrl, filename: filename(title, "mp4"), isAudio: false };
  }
  if (platform === "facebook") {
    if (mode === "audio") return null;
    const mediaUrl = valueAt(body, "HD") || valueAt(body, "Normal_video");
    if (typeof mediaUrl !== "string") return null;
    const title = "facebook-video";
    return { title, creator: "Facebook", thumbnail: null, mediaUrl, filename: filename(title, "mp4"), isAudio: false };
  }
  if (platform === "cocofun") {
    if (mode === "audio") return null;
    const mediaUrl = valueAt(body, "no_watermark") || valueAt(body, "watermark");
    if (typeof mediaUrl !== "string") return null;
    const title = text(valueAt(body, "topic"), text(valueAt(body, "caption"), "cocofun-video"));
    return { title, creator: "Cocofun", thumbnail: typeof valueAt(body, "thumbnail") === "string" ? valueAt(body, "thumbnail") as string : null, mediaUrl, filename: filename(title, "mp4"), isAudio: false };
  }
  if (platform === "mediafire") {
    if (mode === "audio") return null;
    const mediaUrl = valueAt(body, "url");
    if (typeof mediaUrl !== "string") return null;
    const title = text(valueAt(body, "filename"), "mediafire-file");
    return { title, creator: text(valueAt(body, "owner"), "MediaFire"), thumbnail: null, mediaUrl, filename: text(valueAt(body, "filename"), filename(title, text(valueAt(body, "ext"), "bin"))), isAudio: false };
  }
  if (platform === "capcut") {
    if (mode === "audio") return null;
    const mediaUrl = valueAt(body, "originalVideoUrl");
    if (typeof mediaUrl !== "string") return null;
    const title = text(valueAt(body, "title"), "capcut-template");
    return { title, creator: text(valueAt(body, "authorName"), "CapCut"), thumbnail: typeof valueAt(body, "coverUrl") === "string" ? valueAt(body, "coverUrl") as string : null, mediaUrl, filename: filename(title, "mp4"), isAudio: false };
  }
  if (platform === "gdrive") {
    if (mode === "audio") return null;
    const data = valueAt(body, "data");
    const mediaUrl = valueAt(data, "downloadUrl");
    if (typeof mediaUrl !== "string") return null;
    const title = text(valueAt(data, "filename"), "google-drive-file");
    return { title, creator: "Google Drive", thumbnail: null, mediaUrl, filename: text(valueAt(data, "filename"), filename(title, extensionFromUrl(mediaUrl, "bin"))), isAudio: false };
  }
  if (platform === "kuaishou") {
    if (mode === "audio") return null;
    const mediaUrl = valueAt(body, "videoUrl");
    if (typeof mediaUrl !== "string") return null;
    const title = text(valueAt(body, "title"), "kuaishou-video");
    return { title, creator: text(valueAt(body, "author"), text(valueAt(body, "username"), "Kuaishou")), thumbnail: null, mediaUrl, filename: filename(title, "mp4"), isAudio: false };
  }
  if (platform === "rednote") {
    if (mode === "audio") return null;
    const downloads = valueAt(body, "downloads");
    const first = Array.isArray(downloads) ? downloads[0] : null;
    const images = valueAt(body, "images");
    const firstImage = Array.isArray(images) && typeof images[0] === "string" ? images[0] : null;
    const mediaUrl = valueAt(first, "url") || firstImage;
    if (typeof mediaUrl !== "string") return null;
    const title = text(valueAt(body, "title"), "rednote-media");
    return { title, creator: text(valueAt(body, "nickname"), "Rednote"), thumbnail: firstImage, mediaUrl, filename: filename(title, extensionFromUrl(mediaUrl, first ? "mp4" : "jpg")), isAudio: false };
  }
  if (platform === "douyin") {
    const data = valueAt(body, "data");
    const links = valueAt(data, "links");
    if (!Array.isArray(links)) return null;
    const match = mode === "audio"
      ? links.find((item) => valueAt(item, "quality") === "Quality 3" || String(valueAt(item, "url") || "").includes(".mp3"))
      : links.find((item) => valueAt(item, "quality") === "Quality 2") || links.find((item) => valueAt(item, "quality") !== "Quality 3");
    const mediaUrl = valueAt(match, "url");
    if (typeof mediaUrl !== "string") return null;
    const title = text(valueAt(data, "title"), "douyin-media");
    const thumbnail = valueAt(data, "thumbnail");
    return { title, creator: "Douyin", thumbnail: typeof thumbnail === "string" ? thumbnail.replace(/&amp;/g, "&") : null, mediaUrl: mediaUrl.replace(/&amp;/g, "&"), filename: filename(title, mode === "audio" ? "mp3" : extensionFromUrl(mediaUrl, "mp4")), isAudio: mode === "audio" };
  }
  if (platform === "snackvideo") {
    if (mode === "audio") return null;
    const mediaUrl = valueAt(body, "videoUrl");
    if (typeof mediaUrl !== "string") return null;
    const title = text(valueAt(body, "title"), "snackvideo-media");
    return { title, creator: text(valueAt(valueAt(body, "creator"), "name"), "SnackVideo"), thumbnail: typeof valueAt(body, "thumbnail") === "string" ? valueAt(body, "thumbnail") as string : null, mediaUrl, filename: filename(title, "mp4"), isAudio: false };
  }
  if (platform === "spotify") {
    const data = valueAt(body, "res_data");
    const formats = valueAt(data, "formats");
    const first = Array.isArray(formats) ? formats[0] : null;
    const mediaUrl = valueAt(first, "url");
    if (typeof mediaUrl !== "string") return null;
    const title = text(valueAt(data, "title"), "spotify-track");
    return { title, creator: "Spotify", thumbnail: typeof valueAt(data, "thumbnail") === "string" ? valueAt(data, "thumbnail") as string : null, mediaUrl, filename: filename(title, text(valueAt(first, "ext"), "mp3")), isAudio: true };
  }
  if (platform === "soundcloud") {
    const title = text(valueAt(body, "title"), "soundcloud-track");
    const mediaUrl = valueAt(body, "downloadMp3") || valueAt(body, "audio");
    if (typeof mediaUrl !== "string") return null;
    return { title, creator: "SoundCloud", thumbnail: typeof valueAt(body, "thumbnail") === "string" ? valueAt(body, "thumbnail") as string : null, mediaUrl, filename: filename(title, "mp3"), isAudio: true };
  }
  if (platform === "pinterest") {
    if (mode === "audio") return null;
    const data = valueAt(body, "result");
    const mediaUrl = valueAt(data, "video_url") || valueAt(data, "image");
    if (typeof mediaUrl !== "string") return null;
    const title = text(valueAt(data, "title"), "pinterest-media");
    return { title, creator: text(valueAt(valueAt(data, "user"), "username"), "Pinterest"), thumbnail: typeof valueAt(data, "image") === "string" ? valueAt(data, "image") as string : null, mediaUrl, filename: filename(title, valueAt(data, "video_url") ? "mp4" : "jpg"), isAudio: false };
  }
  if (platform === "threads") {
    if (mode === "audio") return null;
    const mediaUrl = valueAt(body, "type") === "video" ? valueAt(body, "video") : valueAt(body, "image");
    if (typeof mediaUrl !== "string") return null;
    const title = "threads-media";
    return { title, creator: "Threads", thumbnail: valueAt(body, "type") === "video" ? null : mediaUrl, mediaUrl, filename: filename(title, extensionFromUrl(mediaUrl, valueAt(body, "type") === "video" ? "mp4" : "jpg")), isAudio: false };
  }
  return null;
}

async function resolve(url: string, mode: Mode, quality?: string): Promise<ResolvedMedia> {
  const platform = detectPlatform(url);
  if (!platform) throw new Error("This link is not from a supported provider service.");
  if (mode === "audio" && !platform.supportsAudio) throw new Error(`${platform.name} does not provide a separate audio download.`);
  if (platform.id === "instagram" && mode === "audio") {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
    try {
      const response = await fetch(`${INSTAGRAM_AUDIO_API}?url=${encodeURIComponent(url)}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const body = await response.json() as Record<string, unknown>;
      const mediaUrl = valueAt(body, "audio");
      if (!response.ok || typeof mediaUrl !== "string") throw new Error("No audio track was found for this Instagram post.");
      const title = text(valueAt(body, "title"), "instagram-audio");
      return { title, creator: text(valueAt(body, "author"), "Instagram"), thumbnail: typeof valueAt(body, "thumbnail") === "string" ? valueAt(body, "thumbnail") as string : null, mediaUrl, filename: filename(title, "mp3"), isAudio: true };
    } finally {
      clearTimeout(timer);
    }
  }
  const endpoint = platform.id === "instagram"
    ? "igdl"
    : platform.id === "x"
      ? "twitter"
      : platform.id === "facebook"
        ? "fbdown"
        : platform.id;
  const failures: string[] = [];
  // Without an explicit value this provider serves its default rendition,
  // which is often not the highest one.  A 4320p ceiling asks it for the
  // highest source stream while still allowing it to fall back gracefully.
  const requestedQuality = mode === "video"
    ? quality && quality !== "best" ? quality : HIGHEST_VIDEO_QUALITY
    : quality && quality !== "best" ? quality : undefined;

  for (const base of providerBases()) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
    try {
      const upstream = await fetch(
        `${base}/api/downloader/${endpoint}?url=${encodeURIComponent(url)}${requestedQuality ? `&quality=${encodeURIComponent(requestedQuality)}` : ""}`,
        { cache: "no-store", signal: controller.signal },
      );
      if (!upstream.ok) {
        failures.push(`${new URL(base).hostname} returned ${upstream.status}`);
        continue;
      }
      const media = resolveResponse(platform.id, await upstream.json(), mode);
      if (media) return media;
      failures.push(`${new URL(base).hostname} returned no usable media`);
    } catch {
      failures.push(`${new URL(base).hostname} did not respond`);
    } finally {
      clearTimeout(timer);
    }
  }

  const target = mode === "audio" ? "audio" : "media";
  throw new Error(`No provider could resolve this ${target}. Please try again shortly.`);
}

export async function POST(request: NextRequest, context: { params: Promise<{ action: string }> }) {
  const { action } = await context.params;
  try {
    const body = request.headers.get("content-type")?.includes("application/json")
      ? await request.json() as { url?: unknown; type?: unknown; quality?: unknown; direct?: unknown }
      : Object.fromEntries(await request.formData()) as { url?: unknown; type?: unknown; quality?: unknown; direct?: unknown };
    if (typeof body.url !== "string") return Response.json({ message: "A media URL is required." }, { status: 400 });
    const quality = typeof body.quality === "string" ? body.quality : undefined;
    let media = await resolve(body.url, body.type === "audio" ? "audio" : "video", quality);
    if (action === "analyze") return Response.json(media, { headers: { "Cache-Control": "no-store" } });
    if (action !== "download") return Response.json({ message: "Unknown provider action." }, { status: 404 });
    // Keep the media transfer off Vercel whenever the provider permits the
    // browser to fetch the resolved URL directly.
    if (body.direct === true) {
      return Response.json(
        { mediaUrl: media.mediaUrl, filename: media.filename },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    let file = await fetch(media.mediaUrl, { cache: "no-store" });
    // A signed media URL may expire between resolution and transfer. Retry it
    // once, but permit CDNs that label a complete byte range as HTTP 206.
    if (!isCompleteMediaResponse(file)) {
      media = await resolve(body.url, body.type === "audio" ? "audio" : "video", quality);
      file = await fetch(media.mediaUrl, { cache: "no-store" });
    }
    if (!isCompleteMediaResponse(file)) throw new Error("The resolved media file is no longer available. Please try again shortly.");
    const headers = new Headers({
      "Content-Type": file.headers.get("content-type") || "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(media.filename)}`,
      "Cache-Control": "no-store",
    });
    const length = file.headers.get("content-length");
    if (length) headers.set("Content-Length", length);
    return new Response(file.body, { headers });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "Provider request failed." }, { status: 502 });
  }
}
