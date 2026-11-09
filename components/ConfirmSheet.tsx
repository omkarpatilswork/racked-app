"use client";

import { useState } from "react";
import Sheet from "@/components/Sheet";

// "Are you sure?" sheet. Optional typed confirmation (e.g. type DELETE) for
// actions that can't be undone.
export default function ConfirmSheet({
  open,
  title,
  body,
  confirmLabel,
  danger,
  typeToConfirm,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  typeToConfirm?: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const ready = !typeToConfirm || typed.trim().toUpperCase() === typeToConfirm.toUpperCase();
  return (
    <Sheet open={open} onClose={busy ? () => {} : onClose} title={title} testId="confirm-sheet">
      <div className="muted center" style={{ fontSize: 14.5, margin: "0 0 16px" }}>
        {body}
      </div>
      {typeToConfirm && (
        <div style={{ marginBottom: 14 }}>
          <label className="field-label" htmlFor="confirm-type">
            Type {typeToConfirm} to confirm
          </label>
          <input
            id="confirm-type"
            className="field"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
      )}
      <div className="stack">
        <button
          type="button"
          className={`btn ${danger ? "btn-danger-solid" : "btn-yellow"}`}
          disabled={!ready || busy}
          onClick={onConfirm}
          data-testid="confirm-yes"
        >
          {busy ? "Working…" : confirmLabel}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
          Cancel
        </button>
      </div>
    </Sheet>
  );
}
