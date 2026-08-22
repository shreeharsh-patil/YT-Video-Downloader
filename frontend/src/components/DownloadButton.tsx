"use client";

import { Download } from "lucide-react";
import type { DownloadMode } from "@/types";
import { cn } from "@/lib/cn";

interface DownloadButtonProps {
  mode: DownloadMode;
  disabled?: boolean;
  onClick: () => void;
}

export function DownloadButton({ mode, disabled, onClick }: DownloadButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "focus-ring inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-foreground px-6 text-[15px] font-semibold text-background transition-all",
        !disabled && "hover:bg-accent hover:text-accent-foreground active:scale-[0.99]",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <Download className="size-4" strokeWidth={2.25} aria-hidden="true" />
      {mode === "video" ? "Download video" : "Download audio"}
    </button>
  );
}