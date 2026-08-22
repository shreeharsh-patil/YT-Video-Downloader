"use client";

import { Link2, Loader2, X } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/cn";

interface UrlInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
  disabled?: boolean;
}

export function UrlInput({
  value,
  onChange,
  onSubmit,
  loading,
  disabled,
}: UrlInputProps) {
  const inputId = useId();

  return (
    <form
      className="w-full"
      onSubmit={(e) => {
        e.preventDefault();
        if (!loading) onSubmit();
      }}
    >
      <label htmlFor={inputId} className="sr-only">
        YouTube URL
      </label>
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center">
            <Link2 className="size-4 text-muted" aria-hidden="true" />
          </div>
          <input
            id={inputId}
            type="text"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={value}
            placeholder="Paste a YouTube link…"
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className={cn(
              "focus-ring h-14 w-full rounded-xl border border-border bg-card pl-12 pr-12 text-[15px] text-foreground shadow-none transition-colors placeholder:text-muted/70 sm:text-base",
              disabled && "cursor-not-allowed opacity-70",
            )}
          />
          {value && (
            <button
              type="button"
              onClick={() => onChange("")}
              aria-label="Clear URL"
              className="focus-ring absolute inset-y-0 right-3.5 my-auto flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-accent-soft hover:text-accent"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={loading || disabled}
          className={cn(
            "focus-ring inline-flex h-14 shrink-0 items-center justify-center gap-2 rounded-xl bg-foreground px-7 text-[15px] font-semibold text-background transition-all",
            !loading && "hover:bg-accent hover:text-accent-foreground active:scale-[0.98]",
            (loading || disabled) && "cursor-not-allowed opacity-60",
          )}
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Analyzing…
            </>
          ) : (
            "Analyze"
          )}
        </button>
      </div>
    </form>
  );
}