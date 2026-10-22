"use client";

import { instagramUrl, isValidHandle } from "@/lib/instagram";

// "@handle" link to a member's Instagram, shown next to their name.
// Renders nothing unless the handle looks valid, so a bad value in the
// database can never turn into a strange link.
export default function IgHandle({ handle }: { handle: string | null | undefined }) {
  if (!isValidHandle(handle)) return null;
  return (
    <a
      className="ig-handle"
      href={instagramUrl(handle)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      aria-label={`${handle} on Instagram`}
      data-testid="ig-handle"
    >
      @{handle}
    </a>
  );
}
