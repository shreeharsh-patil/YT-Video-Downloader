import type { VideoFormat } from "@/types";

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || Number.isNaN(bytes) || bytes < 0) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / Math.pow(1024, i);
  const formatted = value >= 100 ? value.toFixed(0) : value.toFixed(1);
  return `${formatted} ${units[i]}`;
}

export function formatCount(count: number | null | undefined): string {
  if (count == null) return "—";
  if (count >= 1_000_000_000) {
    return `${(count / 1_000_000_000).toFixed(count % 1_000_000_000 === 0 ? 0 : 1)}B`;
  }
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(count % 1_000_000 === 0 ? 0 : 1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(count % 1_000 === 0 ? 0 : 1)}K`;
  }
  return String(count);
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function qualityLabel(quality: number | string): string {
  const q = Number(quality);
  if (!Number.isFinite(q)) return String(quality);
  return q >= 1000 ? `${(q / 1000).toFixed(q % 1000 === 0 ? 0 : 1)}K` : `${q}p`;
}

export function formatSizeForFormat(
  fmt: Pick<VideoFormat, "file_size" | "file_size_estimate"> | undefined,
): string {
  if (!fmt) return "";
  const size = fmt.file_size ?? fmt.file_size_estimate;
  return size ? formatBytes(size) : "";
}

export interface QualityGroup {
  quality: number;
  format: VideoFormat;
}

export function buildVideoQualityGroups(
  formats: VideoFormat[],
  container: "mp4" | "webm",
): QualityGroup[] {
  const map = new Map<number, VideoFormat>();
  for (const fmt of formats) {
    if (fmt.container !== container || fmt.quality == null) continue;
    const prev = map.get(fmt.quality);
    if (!prev || isBetterForGroup(fmt, prev)) {
      map.set(fmt.quality, fmt);
    }
  }
  return [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([quality, format]) => ({ quality, format }));
}

function isBetterForGroup(candidate: VideoFormat, current: VideoFormat): boolean {
  if (candidate.has_audio !== current.has_audio) {
    return candidate.has_audio;
  }
  if (candidate.fps !== current.fps) {
    return (candidate.fps ?? 0) > (current.fps ?? 0);
  }
  const candidateSize = candidate.file_size ?? candidate.file_size_estimate ?? 0;
  const currentSize = current.file_size ?? current.file_size_estimate ?? 0;
  return candidateSize > currentSize;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}