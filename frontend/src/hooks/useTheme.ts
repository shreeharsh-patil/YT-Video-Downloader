"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

const STORAGE_KEY = "ytdl-theme";
const THEME_EVENT = "ytdl-theme-change";

function readTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(next: "light" | "dark"): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignore storage errors */
  }
  const root = document.documentElement;
  root.classList.toggle("dark", next === "dark");
  root.style.colorScheme = next === "dark" ? "dark" : "light";
  window.dispatchEvent(new Event(THEME_EVENT));
}

function subscribe(callback: () => void): () => void {
  window.addEventListener(THEME_EVENT, callback);
  window.addEventListener("storage", callback);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", callback);
  return () => {
    window.removeEventListener(THEME_EVENT, callback);
    window.removeEventListener("storage", callback);
    mq.removeEventListener("change", callback);
  };
}

function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function useTheme() {
  const theme = useSyncExternalStore(
    subscribe,
    () => readTheme(),
    () => "light",
  );
  const mounted = useMounted();

  useEffect(() => {
    applyTheme(readTheme());
  }, []);

  const toggle = useCallback(() => {
    applyTheme(readTheme() === "dark" ? "light" : "dark");
  }, []);

  return { theme, mounted, toggle };
}