"use client";

// Small, crash-proof wrappers around localStorage for per-device
// preferences (theme, vibration, rest timer). Storage can be missing or
// throw (private browsing, blocked site data) -- every read falls back to the
// default and every write is best-effort.

export function readPref(key: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writePref(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export const PREF_THEME = "racked:theme"; // "system" | "dark" | "light"
export const PREF_HAPTICS = "racked:haptics"; // "on" | "off"
export const PREF_REST = "racked:rest-seconds"; // "0" (off) | "60" | "90" | ...
