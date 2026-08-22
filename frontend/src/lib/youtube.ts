const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "youtu.be",
]);

const VIDEO_ID_RE = /^[\w-]{11}$/;

/** Path prefixes whose first segment is a video id. */
const VIDEO_PATH_PREFIXES = ["/shorts/", "/embed/", "/live/", "/v/"];

function withScheme(raw: string): string {
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function idFromPath(path: string): string | null {
  const segments = path.split("/").filter(Boolean);
  for (const segment of segments) {
    if (VIDEO_ID_RE.test(segment)) return segment;
  }
  return null;
}

export function extractVideoId(raw: string): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;

  // Bare video id (also handles the <ID> form some sites copy out).
  if (!value.includes("/") && !/\?|&|=|\s/.test(value)) {
    const bare = value.replace(/^</, "").replace(/>$/, "");
    if (VIDEO_ID_RE.test(bare)) return bare;
    return null;
  }

  try {
    const url = new URL(withScheme(value));
    const host = url.hostname.toLowerCase();

    if (!YOUTUBE_HOSTS.has(host) && !host.endsWith(".youtube.com")) return null;

    if (host === "youtu.be") {
      return idFromPath(url.pathname);
    }

    // Any page that carries a ?v= param (watch, live, embed variants).
    const vParam = url.searchParams.get("v");
    if (vParam && VIDEO_ID_RE.test(vParam)) return vParam;

    const path = url.pathname;
    for (const prefix of VIDEO_PATH_PREFIXES) {
      if (path.startsWith(prefix)) {
        return idFromPath(path.slice(prefix.length - 1));
      }
    }

    return idFromPath(path);
  } catch {
    return null;
  }
}

export function isValidYouTubeUrl(raw: string): boolean {
  return extractVideoId(raw) != null;
}

/** True when the input is a YouTube playlist or channel link rather than a video. */
export function isPlaylistOrChannelUrl(raw: string): boolean {
  const value = (raw ?? "").trim();
  if (!value || !value.includes("/")) return false;
  try {
    const url = new URL(withScheme(value));
    const host = url.hostname.toLowerCase();
    if (!YOUTUBE_HOSTS.has(host)) return false;
    if (url.searchParams.has("list")) return true;
    const path = url.pathname;
    return (
      path.startsWith("/playlist") ||
      path.startsWith("/@") ||
      path.startsWith("/channel/") ||
      path.startsWith("/c/") ||
      path.startsWith("/user/")
    );
  } catch {
    return false;
  }
}

export function normalizeYouTubeUrl(raw: string): string | null {
  const id = extractVideoId(raw);
  if (!id) return null;
  return `https://www.youtube.com/watch?v=${id}`;
}
