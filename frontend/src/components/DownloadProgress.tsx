"use client";

import type { DownloadMode, DownloadProgressState } from "@/types";
import { formatBytes } from "@/lib/utils";

const STAGE_LABELS: Record<string, string> = {
  preparing: "Preparing…",
  downloading_video: "Downloading video…",
  downloading_audio: "Downloading audio…",
  merging: "Processing…",
  finalizing: "Finishing up…",
};

interface DownloadProgressProps {
  progress: DownloadProgressState;
  mode: DownloadMode;
}

export function DownloadProgress({ progress, mode }: DownloadProgressProps) {
  const label =
    progress.message || STAGE_LABELS[progress.stage] || "Working…";
  const p = progress.progress;
  const known = p != null;
  const percent = known ? Math.round(p * 100) : null;

  return (
    <div role="status" aria-live="polite" className="w-full">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        {known && (
          <span className="font-mono text-sm tabular-nums text-accent">
            {percent}%
          </span>
        )}
      </div>

      <div className="mt-3 h-[3px] w-full overflow-hidden rounded-full bg-border">
        {known ? (
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-200 ease-out"
            style={{ width: `${percent}%` }}
          />
        ) : (
          <div className="h-full w-1/5 overflow-hidden rounded-full bg-accent animate-ytdl-shimmer" />
        )}
      </div>

      {(progress.downloadedBytes != null || progress.totalBytes != null) && (
        <p className="mt-2 font-mono text-[11px] tabular-nums tracking-wide text-muted">
          {formatBytes(progress.downloadedBytes)}
          {progress.totalBytes != null &&
            ` / ${formatBytes(progress.totalBytes)}`}
          {progress.stage === "merging" && mode === "video" && " · merging"}
        </p>
      )}
    </div>
  );
}
