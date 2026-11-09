"use client";

import { PREF_HAPTICS, readPref } from "@/lib/prefs";

// Short vibrations for key moments (set logged, PB, rest over). Android
// browsers support this; iPhone Safari ignores it, which is fine.
export function haptic(kind: "tap" | "success" | "pb" | "alert" = "tap") {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  if (readPref(PREF_HAPTICS, "on") === "off") return;
  const patterns: Record<string, number | number[]> = {
    tap: 8,
    success: [14, 40, 14],
    pb: [30, 50, 30, 50, 80],
    alert: [200, 100, 200],
  };
  try {
    navigator.vibrate(patterns[kind]);
  } catch {
    /* ignore */
  }
}
