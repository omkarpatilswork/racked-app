"use client";

import { PREF_THEME, readPref, writePref } from "@/lib/prefs";

export type ThemePref = "system" | "dark" | "light";

// Racked is dark-first: with no saved choice the app is dark.
export function getThemePref(): ThemePref {
  const v = readPref(PREF_THEME, "dark");
  return v === "light" || v === "system" ? v : "dark";
}

export function resolveTheme(pref: ThemePref): "dark" | "light" {
  if (pref === "system") {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches) return "light";
    return "dark";
  }
  return pref;
}

export function applyTheme(pref: ThemePref) {
  if (typeof document === "undefined") return;
  const theme = resolveTheme(pref);
  document.documentElement.setAttribute("data-theme", theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "light" ? "#f5f4f0" : "#0a0a0c");
}

export function setThemePref(pref: ThemePref) {
  writePref(PREF_THEME, pref);
  applyTheme(pref);
}

// Runs inline in <head> before the page paints, so there is never a flash of
// the wrong theme. Keep it tiny and dependency-free.
export const THEME_BOOT_SCRIPT = `(function(){try{var p=localStorage.getItem('${PREF_THEME}');var t=p==='light'?'light':p==='system'?(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):'dark';document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;
