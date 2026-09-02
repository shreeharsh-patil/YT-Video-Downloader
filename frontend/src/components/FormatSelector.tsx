"use client";

import { useMemo } from "react";
import type { VideoFormat } from "@/types";
import {
  buildVideoQualityGroups,
  formatSizeForFormat,
  qualityLabel,
} from "@/lib/utils";
import { cn } from "@/lib/cn";
import { SegmentedControl } from "./SegmentedControl";

interface FormatSelectorProps {
  formats: VideoFormat[];
  container: "mp4" | "webm";
  onContainerChange: (container: "mp4" | "webm") => void;
  quality: string;
  onQualityChange: (quality: string) => void;
}

export function FormatSelector({
  formats,
  container,
  onContainerChange,
  quality,
  onQualityChange,
}: FormatSelectorProps) {
  const groups = useMemo(
    () => buildVideoQualityGroups(formats, container),
    [formats, container],
  );

  const availableContainers = useMemo(
    () => [...new Set(formats.map((f) => f.container))],
    [formats],
  );

  const bestGroup = groups[0];
  const providerSelected = groups.every((group) => group.format.format_note === "Provider-selected");
  const showContainerToggle = availableContainers.length > 1;

  const meta = (fmt: VideoFormat | undefined): string => {
    if (!fmt) return "";
    const parts: string[] = [fmt.extension.toUpperCase()];
    if (fmt.fps && fmt.fps > 30) parts.push(`${fmt.fps}fps`);
    const size = formatSizeForFormat(fmt);
    if (size) parts.push(size);
    return parts.join(" · ");
  };

  return (
    <div>
      {showContainerToggle && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted">
            Container
          </span>
          <SegmentedControl<"mp4" | "webm">
            options={[
              { value: "mp4", label: "MP4" },
              { value: "webm", label: "WebM" },
            ]}
            value={container}
            onChange={onContainerChange}
            ariaLabel="Video container"
            layoutId="video-container"
          />
        </div>
      )}

      <div role="radiogroup" aria-label="Video quality" className="grid gap-0.5">
        <button
          type="button"
          role="radio"
          aria-checked={quality === "best"}
          onClick={() => onQualityChange("best")}
          className={cn(
            "focus-ring relative flex w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left transition-colors",
            quality === "best" ? "bg-accent-soft" : "hover:bg-foreground/[0.04]",
          )}
        >
          {quality === "best" && (
            <span
              aria-hidden="true"
              className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-accent"
            />
          )}
          <span className="flex min-w-0 flex-col">
            <span className="text-[15px] font-semibold">Best available</span>
            {bestGroup && (
              <span className="truncate font-mono text-xs text-muted">
                {qualityLabel(bestGroup.quality)} · {meta(bestGroup.format)}
              </span>
            )}
          </span>
        </button>

        {groups.map((group) => {
          const selected = quality === String(group.quality);
          return (
            <button
              key={group.quality}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onQualityChange(String(group.quality))}
              className={cn(
                "focus-ring relative flex w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left transition-colors",
                selected ? "bg-accent-soft" : "hover:bg-foreground/[0.04]",
              )}
            >
              {selected && (
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-accent"
                />
              )}
              <span className="flex min-w-0 flex-col">
                <span className="text-[15px] font-semibold">
                  {qualityLabel(group.quality)}
                </span>
                <span className="truncate font-mono text-xs text-muted">
                  {meta(group.format)}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {providerSelected && (
        <p className="mt-4 font-mono text-xs leading-relaxed text-muted">
          Choose a preferred quality. Provider support varies; if a source
          cannot honor it, it returns the version it has available.
        </p>
      )}
    </div>
  );
}
