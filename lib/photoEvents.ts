"use client";

// Tiny "something about pump photos changed" signal so the Home card, the
// feed and the Profile timeline all refresh after an upload / delete without
// threading callbacks through every page.
export const PHOTOS_CHANGED = "racked:photos-changed";

export function notifyPhotosChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PHOTOS_CHANGED));
}

export function onPhotosChanged(cb: () => void) {
  window.addEventListener(PHOTOS_CHANGED, cb);
  return () => window.removeEventListener(PHOTOS_CHANGED, cb);
}
