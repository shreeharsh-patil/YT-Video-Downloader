import { detectPlatform } from "@/lib/platforms";
import type { DownloadMode } from "@/types";

type Media = {
  title: string;
  creator: string;
  thumbnail: string | null;
  mediaUrl: string;
  filename: string;
  isAudio: boolean;
};

const PROVIDER = "https://backend1.tioo.eu.org";
const INSTAGRAM_AUDIO = "https://instagram-audio-downloader-api.vercel.app/api/download";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function value(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function cleanFilename(title: string, extension: string): string {
  const safe = title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
  return `${(safe || "download").slice(0, 90)}.${extension}`;
}

function endpointFor(platform: string): string {
  return platform === "instagram" ? "igdl" : platform === "x" ? "twitter" : platform === "facebook" ? "fbdown" : platform;
}

function mediaFromResponse(platform: string, body: unknown, mode: DownloadMode): Media | null {
  const data = record(body);
  const audio = mode === "audio";
  const simple = (url: unknown, title: unknown, creator: unknown, thumbnail: unknown, extension: string): Media | null => {
    if (typeof url !== "string") return null;
    const name = value(title, `${platform}-media`);
    return { title: name, creator: value(creator, platform), thumbnail: typeof thumbnail === "string" ? thumbnail : null, mediaUrl: url, filename: cleanFilename(name, extension), isAudio: audio };
  };

  if (platform === "youtube") return simple(audio ? data.mp3 : data.mp4, data.title, data.author, data.thumbnail, audio ? "mp3" : "mp4");
  if (platform === "tiktok") {
    const item = record(data.data); const author = record(item.author);
    return simple(audio ? item.music : item.play, item.title, author.nickname ?? author.unique_id, item.cover, audio ? "mp3" : "mp4");
  }
  if (platform === "instagram") {
    const item = Array.isArray(body) ? record(body.find((entry) => typeof record(entry).url === "string")) : {};
    return audio ? null : simple(item.url, item.title, item.author, item.thumbnail, "mp4");
  }
  if (platform === "x") { const item = Array.isArray(data.url) ? record(data.url[0]) : {}; return audio ? null : simple(item.hd ?? item.sd, data.title, "X", null, "mp4"); }
  if (platform === "facebook") return audio ? null : simple(data.HD ?? data.Normal_video, "facebook-video", "Facebook", null, "mp4");
  if (platform === "cocofun") return audio ? null : simple(data.no_watermark ?? data.watermark, data.topic ?? data.caption, data.author, data.thumbnail, "mp4");
  if (platform === "mediafire") return audio ? null : simple(data.url, data.filename, data.owner, null, value(data.ext, "bin"));
  if (platform === "capcut") return audio ? null : simple(data.originalVideoUrl, data.title, data.authorName, data.coverUrl, "mp4");
  if (platform === "gdrive") { const item = record(data.data); return audio ? null : simple(item.downloadUrl, item.filename, "Google Drive", null, "bin"); }
  if (platform === "kuaishou") return audio ? null : simple(data.videoUrl, data.title, data.author ?? data.username, null, "mp4");
  if (platform === "rednote") { const first = Array.isArray(data.downloads) ? record(data.downloads[0]) : {}; const image = Array.isArray(data.images) ? data.images[0] : null; return audio ? null : simple(first.url ?? image, data.title, data.nickname, image, first.url ? "mp4" : "jpg"); }
  if (platform === "douyin") { const item = record(data.data); const links = Array.isArray(item.links) ? item.links.map(record) : []; const link = audio ? links.find((entry) => entry.quality === "Quality 3" || value(entry.url).includes(".mp3")) : links.find((entry) => entry.quality === "Quality 2") ?? links.find((entry) => entry.quality !== "Quality 3"); return simple(link?.url, item.title, "Douyin", item.thumbnail, audio ? "mp3" : "mp4"); }
  if (platform === "snackvideo") return audio ? null : simple(data.videoUrl, data.title, record(data.creator).name, data.thumbnail, "mp4");
  if (platform === "spotify") { const item = record(data.res_data); const format = Array.isArray(item.formats) ? record(item.formats[0]) : {}; return simple(format.url, item.title, "Spotify", item.thumbnail, value(format.ext, "mp3")); }
  if (platform === "soundcloud") return simple(data.downloadMp3 ?? data.audio, data.title, "SoundCloud", data.thumbnail, "mp3");
  if (platform === "pinterest") { const item = record(data.result); return audio ? null : simple(item.video_url ?? item.image, item.title, record(item.user).username, item.image, item.video_url ? "mp4" : "jpg"); }
  if (platform === "threads") return audio ? null : simple(data.type === "video" ? data.video : data.image, "threads-media", "Threads", data.type === "video" ? null : data.image, data.type === "video" ? "mp4" : "jpg");
  return null;
}

export async function resolveDirectProvider(url: string, mode: DownloadMode, quality?: string): Promise<Media> {
  const platform = detectPlatform(url);
  if (!platform) throw new Error("This link is not from a supported provider service.");
  if (mode === "audio" && !platform.supportsAudio) throw new Error(`${platform.name} does not provide a separate audio download.`);

  if (platform.id === "instagram" && mode === "audio") {
    const response = await fetch(`${INSTAGRAM_AUDIO}?url=${encodeURIComponent(url)}`);
    const body = await response.json(); const data = record(body);
    const media = mediaFromResponse("instagram", [{ url: data.audio, title: data.title, author: data.author, thumbnail: data.thumbnail }], "video");
    if (!response.ok || !media) throw new Error("No audio track was found for this Instagram post.");
    return { ...media, filename: cleanFilename(media.title, "mp3"), isAudio: true };
  }

  const preferredQuality = quality && quality !== "best" ? `&quality=${encodeURIComponent(quality)}` : "";
  const response = await fetch(`${PROVIDER}/api/downloader/${endpointFor(platform.id)}?url=${encodeURIComponent(url)}${preferredQuality}`, { cache: "no-store" });
  if (!response.ok) throw new Error("The provider could not resolve this link.");
  const media = mediaFromResponse(platform.id, await response.json(), mode);
  if (!media) throw new Error("No downloadable media was found for this link.");
  return media;
}
