"use client";

import { useState } from "react";
import IgHandle from "@/components/IgHandle";
import { cleanHandle } from "@/lib/instagram";

// Optional "add your Instagram" control on the Profile page. The handle is
// shown next to the member's name on the Home feed, to signed-in members only.
export default function InstagramField({
  handle,
  onSave,
}: {
  handle: string | null | undefined;
  onSave: (handle: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function start() {
    setValue(handle ? `@${handle}` : "");
    setError("");
    setEditing(true);
  }

  async function save() {
    const cleaned = cleanHandle(value);
    if (cleaned === undefined) {
      setError("That doesn't look like an Instagram handle. Use letters, numbers, . and _ only.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave(cleaned ?? "");
      setEditing(false);
    } catch {
      setError("Couldn't save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className="ig-row" style={{ marginTop: 6, display: "flex", gap: 8, justifyContent: "center", alignItems: "center" }}>
        {handle ? <IgHandle handle={handle} /> : null}
        <button type="button" className="btn btn-outline btn-sm" onClick={start} data-testid="ig-open">
          {handle ? "Edit" : "+ Add Instagram"}
        </button>
      </div>
    );
  }

  return (
    <div data-testid="ig-editor">
      <div className="ig-edit">
        <input
          className="field"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="@yourhandle"
          maxLength={80}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Instagram handle"
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
        />
        <button type="button" className="btn btn-yellow btn-sm" onClick={save} disabled={busy} data-testid="ig-save">
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditing(false)} disabled={busy}>
          Cancel
        </button>
      </div>
      {error ? (
        <div className="ig-err" role="alert">
          {error}
        </div>
      ) : (
        <div className="ig-hint">
          Optional. Shown next to your name on the gym feed, to signed-in members only. Leave empty and save to remove it.
        </div>
      )}
    </div>
  );
}
