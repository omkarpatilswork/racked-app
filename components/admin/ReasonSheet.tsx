"use client";

import { useEffect, useState } from "react";
import Sheet from "@/components/Sheet";

// Confirm a staff action and pick (or type) the reason the member will see.
// Optional "type X to confirm" for actions that affect many people.
export default function ReasonSheet({
  open,
  title,
  body,
  reasons,
  confirmLabel,
  typeToConfirm,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: React.ReactNode;
  reasons: string[];
  confirmLabel: string;
  typeToConfirm?: string;
  busy?: boolean;
  onConfirm: (reason: string | null) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (open) {
      setPicked(reasons[0] ?? null);
      setCustom("");
      setTyped("");
    }
  }, [open, reasons]);

  const reason = picked === "__other" ? custom.trim() || null : picked;
  const ready = (!typeToConfirm || typed.trim().toUpperCase() === typeToConfirm.toUpperCase()) && !(picked === "__other" && !custom.trim());

  return (
    <Sheet open={open} onClose={busy ? () => {} : onClose} title={title} testId="reason-sheet">
      <div className="muted center" style={{ fontSize: 14, margin: "0 0 14px" }}>
        {body}
      </div>
      <div className="list-title">Reason the member will see</div>
      <div className="chip-row" role="radiogroup" aria-label="Reason" style={{ marginBottom: 12 }}>
        {reasons.map((r) => (
          <button key={r} type="button" role="radio" aria-checked={picked === r} className={`chip${picked === r ? " on" : ""}`} onClick={() => setPicked(r)}>
            {r}
          </button>
        ))}
        <button type="button" role="radio" aria-checked={picked === "__other"} className={`chip${picked === "__other" ? " on" : ""}`} onClick={() => setPicked("__other")}>
          Other…
        </button>
      </div>
      {picked === "__other" && (
        <div style={{ marginBottom: 12 }}>
          <label className="field-label" htmlFor="reason-custom">
            Write a short reason
          </label>
          <input id="reason-custom" className="field" maxLength={200} value={custom} onChange={(e) => setCustom(e.target.value)} />
        </div>
      )}
      {typeToConfirm && (
        <div style={{ marginBottom: 14 }}>
          <label className="field-label" htmlFor="reason-type">
            Type {typeToConfirm} to confirm
          </label>
          <input
            id="reason-type"
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
        <button type="button" className="btn btn-danger-solid" disabled={!ready || busy} onClick={() => onConfirm(reason)} data-testid="reason-confirm">
          {busy ? "Working…" : confirmLabel}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
          Cancel
        </button>
      </div>
    </Sheet>
  );
}
