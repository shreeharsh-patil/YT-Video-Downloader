"use client";

import type { AudioFormat } from "@/types";
import { cn } from "@/lib/cn";
import { SegmentedControl } from "./SegmentedControl";

interface QualitySelectorProps {
  audioFormats: AudioFormat[];
  format: "m4a" | "opus" | "mp3";
  onFormatChange: (format: "m4a" | "opus" | "mp3") => void;
  quality: string;
  onQualityChange: (quality: string) => void;
}

const QUALITY_OPTIONS: { value: string; label: string }[] = [
  { value: "best", label: "Best" },
  { value: "320", label: "320 kbps" },
  { value: "256", label: "256 kbps" },
  { value: "192", label: "192 kbps" },
  { value: "128", label: "128 kbps" },
];

export function QualitySelector({
  audioFormats,
  format,
  onFormatChange,
  quality,
  onQualityChange,
}: QualitySelectorProps) {
  const bestAudio = audioFormats[0];
  const sourceBitrate = bestAudio?.bitrate ?? null;
  const capped = sourceBitrate != null && sourceBitrate < 320;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted">
          Format
        </span>
        <SegmentedControl<"m4a" | "opus" | "mp3">
          options={[
            { value: "m4a", label: "M4A" },
            { value: "opus", label: "Opus" },
            { value: "mp3", label: "MP3" },
          ]}
          value={format}
          onChange={onFormatChange}
          ariaLabel="Audio format"
          layoutId="audio-format"
        />
      </div>

      <div
        role="radiogroup"
        aria-label="Audio quality"
        className="flex flex-wrap gap-2"
      >
        {QUALITY_OPTIONS.map((option) => {
          const selected = quality === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onQualityChange(option.value)}
              className={cn(
                "focus-ring inline-flex h-9 items-center gap-1.5 rounded-full border px-4 text-[13px] font-medium tabular-nums transition-colors",
                selected
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-muted hover:border-foreground/40 hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <p className="mt-4 font-mono text-xs leading-relaxed text-muted">
        {bestAudio ? (
          <>
            Source: {bestAudio.audio_codec ?? bestAudio.extension} ≈
            {sourceBitrate ?? "?"} kbps
            {capped ? " — higher bitrates won't add quality." : ""}
          </>
        ) : (
          <>Audio stream information unavailable.</>
        )}
      </p>
    </div>
  );
}