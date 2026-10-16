"use client";

import Icon from "@/components/Icon";
import type { PumpKind, PumpPhoto } from "@/lib/data";

const COPY: Record<PumpKind, { label: string; hint: string }> = {
  pre: { label: "Pre", hint: "Before you start" },
  post: { label: "Post", hint: "After your workout" },
};

// Today's two photo slots: Pre and Post.
export default function PumpSlots({
  day,
  photos,
  urls,
  onAdd,
  onOpen,
}: {
  day: string;
  photos: PumpPhoto[];
  urls: Record<string, string>;
  onAdd: (kind: PumpKind) => void;
  onOpen: (photo: PumpPhoto) => void;
}) {
  const hasPre = photos.some((p) => p.day === day && p.kind === "pre");
  return (
    <div className="pump-slots">
      {(["pre", "post"] as PumpKind[]).map((kind) => {
        const photo = photos.find((p) => p.day === day && p.kind === kind);
        const url = photo ? urls[photo.path] : undefined;
        if (!photo) {
          const nudge = kind === "post" && hasPre;
          return (
            <button
              key={kind}
              type="button"
              className={`pump-slot empty${nudge ? " nudge" : ""}`}
              onClick={() => onAdd(kind)}
              data-testid={`slot-${kind}-empty`}
            >
              <Icon name="camera" />
              <b>Add {COPY[kind].label.toLowerCase()} photo</b>
              <small>{COPY[kind].hint}</small>
            </button>
          );
        }
        return (
          <button
            key={kind}
            type="button"
            className="pump-slot filled"
            onClick={() => onOpen(photo)}
            data-testid={`slot-${kind}-filled`}
            aria-label={`${COPY[kind].label} photo — tap to view`}
          >
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt="" />
            ) : (
              <div className="pump-skel" />
            )}
            <span className="pump-tag">{COPY[kind].label}</span>
            <span className="pump-lock" title={photo.shared ? "Shared to the gym feed" : "Only you"}>
              <Icon name={photo.shared ? "unlock" : "lock"} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
