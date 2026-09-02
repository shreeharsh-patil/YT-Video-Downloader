"use client";

import { CheckCircle2 } from "lucide-react";
import type { CompletedInfo } from "@/types";

interface CompletedCardProps {
  completed: CompletedInfo;
  onReset?: () => void;
}

export function CompletedCard({ completed, onReset }: CompletedCardProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-4 rounded-xl border border-border bg-background px-5 py-4"
    >
      <CheckCircle2 className="size-6 shrink-0 text-accent" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-display text-lg italic leading-tight">Download started.</p>
        <p className="mt-0.5 truncate font-mono text-xs text-muted">
          {completed.filename} · {completed.size_human}
        </p>
      </div>
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="focus-ring shrink-0 rounded-lg border border-border bg-card px-3.5 py-2 text-[13px] font-medium transition-colors hover:border-foreground/40"
        >
          Download another
        </button>
      )}
    </div>
  );
}
