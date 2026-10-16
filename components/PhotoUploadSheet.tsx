"use client";

import { useEffect, useState } from "react";
import type { PumpKind } from "@/lib/data";

const KIND_LABEL: Record<PumpKind, string> = { pre: "Pre-workout", post: "Post-workout" };

export default function PhotoUploadSheet({
  kind,
  file,
  replacing,
  onCancel,
  onConfirm,
}: {
  kind: PumpKind;
  file: File;
  replacing: boolean;
  onCancel: () => void;
  onConfirm: (shared: boolean) => Promise<void>;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [shared, setShared] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function submit() {
    setBusy(true);
    try {
      await onConfirm(shared);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="sheet-backdrop"
      style={{ zIndex: 80 }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="sheet" data-testid="upload-sheet">
        <div className="sheet-handle" />
        <div className="eyebrow">{KIND_LABEL[kind]} photo</div>
        <div className="pump-preview">
          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt={`${KIND_LABEL[kind]} preview`} />
          )}
        </div>

        <button
          type="button"
          className={`pump-toggle${shared ? " on" : ""}`}
          onClick={() => setShared((s) => !s)}
          aria-pressed={shared}
          disabled={busy}
        >
          <span className="pump-toggle-text">
            <b>{shared ? "Share to the gym feed" : "Keep it just for me"}</b>
            <small>
              {shared
                ? "Other members can see this photo in the feed. Only post what you're happy for everyone at the gym to see."
                : "Only you see it, in your Profile progress timeline."}
            </small>
          </span>
          <span className="pump-switch" aria-hidden>
            <i />
          </span>
        </button>
        <div className="faint" style={{ fontSize: 12, margin: "8px 2px 14px" }}>
          You can change this or delete the photo any time.
          {replacing ? " This replaces your existing photo." : ""}
        </div>

        <div className="btn-row">
          <button type="button" className="btn btn-outline" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? "Uploading…" : replacing ? "Replace photo" : "Post photo"}
          </button>
        </div>
      </div>
    </div>
  );
}
