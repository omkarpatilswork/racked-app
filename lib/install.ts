"use client";

// "Add to Home Screen". Chrome/Edge/Android fire `beforeinstallprompt` once,
// early -- AppEffects catches it and stores it here so Settings can offer an
// "Install app" button later. iPhone Safari has no prompt; we show how-to text.

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

let deferred: BIPEvent | null = null;
const listeners = new Set<() => void>();

export function captureInstallPrompt() {
  if (typeof window === "undefined") return () => {};
  const onPrompt = (e: Event) => {
    e.preventDefault();
    deferred = e as BIPEvent;
    listeners.forEach((l) => l());
  };
  const onInstalled = () => {
    deferred = null;
    listeners.forEach((l) => l());
  };
  window.addEventListener("beforeinstallprompt", onPrompt);
  window.addEventListener("appinstalled", onInstalled);
  return () => {
    window.removeEventListener("beforeinstallprompt", onPrompt);
    window.removeEventListener("appinstalled", onInstalled);
  };
}

export function canPromptInstall() {
  return !!deferred;
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  await e.prompt();
  const choice = await e.userChoice.catch(() => ({ outcome: "dismissed" }));
  listeners.forEach((l) => l());
  return choice.outcome === "accepted";
}

export function onInstallChange(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
