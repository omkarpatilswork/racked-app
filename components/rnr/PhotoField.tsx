"use client";

import { useId, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { uploadRrPhoto, type Client } from "@/lib/rewards";

// Pick a photo from the phone / computer -> shrunk and uploaded to the
// rr-media bucket -> its link is saved with the item. A link can also be
// pasted. `shape` only changes the preview.
export default function PhotoField({
  supabase,
  label,
  hint,
  value,
  onChange,
  folder,
  shape = "wide",
  testId,
}: {
  supabase: Client;
  label: string;
  hint?: string;
  value: string;
  onChange: (url: string) => void;
  folder: "prizes" | "brands" | "products" | "gym" | "shop";
  shape?: "wide" | "square" | "logo";
  testId?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [paste, setPaste] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      onChange(await uploadRrPhoto(supabase, file, folder));
    } catch (e) {
      const m = (e as { message?: string })?.message || "";
      setErr(/bucket|not found|row-level|security|policy/i.test(m) ? "Uploads aren't set up yet. Run database update 0012, then try again." : m || "Upload failed. Try again.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="rr-photo" data-testid={testId}>
      <div className="field-label" id={`${id}-l`}>
        {label}
      </div>
      <div className="rr-photo-row">
        <div className={`rr-photo-preview ${shape}${value ? " has" : ""}`}>
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" onError={(e) => ((e.currentTarget.style.opacity = "0.2"))} />
          ) : (
            <Icon name="camera" />
          )}
        </div>
        <div className="rr-photo-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => input.current?.click()} disabled={busy} aria-describedby={`${id}-l`}>
            <Icon name="camera" /> {busy ? "Uploading…" : value ? "Change" : "Upload"}
          </button>
          {value && (
            <button type="button" className="text-btn" onClick={() => onChange("")} disabled={busy}>
              Remove
            </button>
          )}
          {!paste && (
            <button type="button" className="text-btn" onClick={() => setPaste(true)}>
              Paste a link
            </button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => pick(e.target.files?.[0])}
          data-testid={testId ? `${testId}-file` : undefined}
          aria-label={`${label}: choose a photo`}
        />
      </div>
      {paste && (
        <input
          className="field"
          style={{ marginTop: 8 }}
          inputMode="url"
          placeholder="https://…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} link`}
        />
      )}
      {hint && <p className="field-hint">{hint}</p>}
      {err && (
        <p className="field-error" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}
