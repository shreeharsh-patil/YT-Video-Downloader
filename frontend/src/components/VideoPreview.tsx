"use client";

import Image from "next/image";
import type { VideoMetadata } from "@/types";
import { formatCount } from "@/lib/utils";

interface VideoPreviewProps {
  metadata: VideoMetadata;
}

export function VideoPreview({ metadata }: VideoPreviewProps) {
  const channelInitial = (metadata.channel || "?").charAt(0).toUpperCase();
  const hasDuration =
    metadata.duration_human && metadata.duration_human !== "—";
  const views = metadata.view_count;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-lg border border-border bg-black sm:w-60">
        {metadata.thumbnail ? (
          <Image
            src={metadata.thumbnail}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, 240px"
            className="object-cover"
            priority
          />
        ) : (
          <div className="absolute inset-0" />
        )}
        {hasDuration && (
          <span className="absolute bottom-2 right-2 rounded-md bg-black/85 px-1.5 py-0.5 font-mono text-[11px] font-medium tabular-nums text-white">
            {metadata.duration_human}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <h2 className="font-display text-xl leading-snug tracking-tight text-balance">
          {metadata.title}
        </h2>
        <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs tabular-nums text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="grid size-[18px] place-items-center rounded-[5px] bg-accent-soft text-[10px] font-bold not-italic text-accent"
            >
              {channelInitial}
            </span>
            <span className="truncate">{metadata.channel}</span>
          </span>
          {views != null && (
            <>
              <span aria-hidden="true">·</span>
              <span>{formatCount(views)} views</span>
            </>
          )}
          {hasDuration && (
            <>
              <span aria-hidden="true">·</span>
              <span>{metadata.duration_human}</span>
            </>
          )}
          {metadata.is_short && (
            <span className="rounded border border-border px-1.5 py-px text-[10px] uppercase tracking-[0.14em]">
              Short
            </span>
          )}
        </p>
      </div>
    </div>
  );
}