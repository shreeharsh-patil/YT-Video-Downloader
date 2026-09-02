export type PlatformId =
  | "youtube"
  | "instagram"
  | "tiktok"
  | "x"
  | "facebook"
  | "cocofun"
  | "mediafire"
  | "capcut"
  | "gdrive"
  | "kuaishou"
  | "rednote"
  | "douyin"
  | "snackvideo"
  | "pinterest"
  | "soundcloud"
  | "spotify"
  | "threads";

export interface Platform {
  id: PlatformId;
  name: string;
  domains: readonly string[];
  supportsAudio?: boolean;
}

export const PLATFORMS: readonly Platform[] = [
  { id: "youtube", name: "YouTube", domains: ["youtube.com", "youtu.be"], supportsAudio: true },
  { id: "instagram", name: "Instagram", domains: ["instagram.com"], supportsAudio: true },
  { id: "tiktok", name: "TikTok", domains: ["tiktok.com"], supportsAudio: true },
  { id: "x", name: "X", domains: ["x.com", "twitter.com"] },
  { id: "facebook", name: "Facebook", domains: ["facebook.com", "fb.watch"] },
  { id: "cocofun", name: "Cocofun", domains: ["cocofun.com"] },
  { id: "mediafire", name: "MediaFire", domains: ["mediafire.com"] },
  { id: "capcut", name: "CapCut", domains: ["capcut.com"] },
  { id: "gdrive", name: "Google Drive", domains: ["drive.google.com"] },
  { id: "kuaishou", name: "Kuaishou", domains: ["kuaishou.com", "kwai.com"] },
  { id: "rednote", name: "Rednote", domains: ["xiaohongshu.com", "xhslink.com"] },
  { id: "douyin", name: "Douyin", domains: ["douyin.com", "iesdouyin.com"], supportsAudio: true },
  { id: "snackvideo", name: "SnackVideo", domains: ["snackvideo.com"] },
  { id: "pinterest", name: "Pinterest", domains: ["pinterest.com", "pin.it"] },
  { id: "soundcloud", name: "SoundCloud", domains: ["soundcloud.com"], supportsAudio: true },
  { id: "spotify", name: "Spotify", domains: ["spotify.com"], supportsAudio: true },
  { id: "threads", name: "Threads", domains: ["threads.net", "threads.com"] },
];

function asUrl(value: string): URL | null {
  const source = value.trim();
  if (!source) return null;
  try {
    return new URL(/^https?:\/\//i.test(source) ? source : `https://${source}`);
  } catch {
    return null;
  }
}

export function detectPlatform(value: string): Platform | null {
  const url = asUrl(value);
  if (!url || !["http:", "https:"].includes(url.protocol)) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  return PLATFORMS.find((platform) =>
    platform.domains.some((domain) => host === domain || host.endsWith(`.${domain}`)),
  ) ?? null;
}

/** Returns a canonical, safe HTTP(S) URL only for a supported service. */
export function normalizeSupportedUrl(value: string): string | null {
  const url = asUrl(value);
  if (!url || !["http:", "https:"].includes(url.protocol) || !detectPlatform(value)) {
    return null;
  }
  url.hash = "";
  return url.toString();
}
