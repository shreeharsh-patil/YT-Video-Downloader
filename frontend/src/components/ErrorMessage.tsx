"use client";

import { AlertCircle } from "lucide-react";

interface ErrorMessageProps {
  message: string;
}

export function ErrorMessage({ message }: ErrorMessageProps) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-xl border border-danger-border bg-danger-soft px-4 py-3"
    >
      <AlertCircle
        className="mt-0.5 size-4 shrink-0 text-danger"
        strokeWidth={2.25}
        aria-hidden="true"
      />
      <span className="text-sm leading-relaxed text-foreground">{message}</span>
    </div>
  );
}