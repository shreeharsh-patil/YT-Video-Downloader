"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";

export function ThemeToggle() {
  const { theme, mounted, toggle } = useTheme();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={
        theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
      }
      className="focus-ring inline-flex size-9 items-center justify-center rounded-lg border border-border bg-card text-muted transition-colors hover:border-foreground/40 hover:text-foreground"
    >
      {!mounted ? (
        <span className="size-4" aria-hidden="true" />
      ) : theme === "dark" ? (
        <Sun className="size-4" aria-hidden="true" />
      ) : (
        <Moon className="size-4" aria-hidden="true" />
      )}
    </button>
  );
}