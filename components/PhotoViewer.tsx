"use client";

import Icon from "@/components/Icon";
import type { PumpKind } from "@/lib/data";

const KIND_LABEL: Record<PumpKind, string> = { pre: "Pre-workout", post: "Post-workout" };

export type ViewerPhoto = {
  id: number;
  kind: PumpKind;
  day: string;
  shared: boolean;
  url: string | null;
};

export function formatDay(day: string, long = false) {
  return new Date(day + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(long ? { year: "numeric" } : {}),
  });
}

// Full-screen look at one photo. mode "own" adds share / replace / delete;
// mode "view" (someone else's photo in the feed) adds Report.
export default function PhotoViewer({
  photo,
  mode,
  canReplace,
  title,
  onClose,
  onToggleShare,
  onReplace,
  onDelete,
  onReport,
}: {
  photo: ViewerPhoto;
  mode: "own" | "view";
  canReplace?: boolean;
  title?: string;
  onClose: () => void;
  onToggleShare?: () => void;
  onReplace?: () => void;
  onDelete?: () => void;
  onReport?: () => void;
}) {
  return (
    <div className="pump-viewer" role="dialog" aria-modal="true" data-testid="photo-viewer">
      <div className="pump-viewer-top">
        <div>
          <div className="pump-viewer-title">{title || KIND_LABEL[photo.kind]}</div>
          <div className="pump-viewer-sub">
            {KIND_LABEL[photo.kind]} · {formatDay(photo.day, true)}
          </div>
        </div>
        <button type="button" className="iconbtn pump-viewer-x" onClick={onClose} aria-label="Close">
          <Icon name="x" />
        </button>
      </div>

      <div className="pump-viewer-img" onClick={onClose}>
        {photo.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo.url} alt={`${KIND_LABEL[photo.kind]} photo`} onClick={(e) => e.stopPropagation()} />
        ) : (
          <div className="pump-skel" style={{ width: "70%", aspectRatio: "3 / 4" }} />
        )}
      </div>

      <div className="pump-viewer-actions">
        {mode === "own" ? (
          <>
            <button type="button" className="pump-viewer-row" onClick={onToggleShare}>
              <Icon name={photo.shared ? "unlock" : "lock"} />
              <span>
                <b>{photo.shared ? "Shared to the gym feed" : "Only you can see this"}</b>
                <small>{photo.shared ? "Tap to make it private" : "Tap to share it to the feed"}</small>
              </span>
            </button>
            <div className="btn-row">
              {canReplace && (
                <button type="button" className="btn pump-viewer-btn" onClick={onReplace}>
                  <Icon name="camera" /> Replace
                </button>
              )}
              <button type="button" className="btn pump-viewer-btn danger" onClick={onDelete}>
                <Icon name="x" /> Delete
              </button>
            </div>
          </>
        ) : (
          onReport && (
            <button type="button" className="btn pump-viewer-btn" onClick={onReport}>
              Report this photo
            </button>
          )
        )}
      </div>
    </div>
  );
}
