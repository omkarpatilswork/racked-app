"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import SignInSheet from "@/components/SignInSheet";
import { formatDay } from "@/components/PhotoViewer";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import {
  adminSetPhotoHidden,
  deletePumpPhoto,
  fetchAdminPhotoReports,
  type AdminPhotoReport,
} from "@/lib/data";
import { useSignedUrls } from "@/lib/useSignedUrls";
import { toast } from "@/lib/toast";

// Staff only: photos that members reported (or that were auto-hidden after 3
// reports). Look at them, then Keep (restores and clears the reports) or
// Delete (removes the photo and its file for good).
export default function AdminPhotosPage() {
  const { session, profile, loading } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const isStaff = !!profile?.is_staff;
  const [rows, setRows] = useState<AdminPhotoReport[] | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const urls = useSignedUrls(supabase, (rows || []).map((r) => r.path));

  const load = useCallback(async () => {
    try {
      setRows(await fetchAdminPhotoReports(supabase));
      setError(false);
    } catch {
      setError(true);
      setRows((r) => r ?? []);
    }
  }, [supabase]);

  useEffect(() => {
    if (isStaff) load();
  }, [isStaff, load]);

  if (loading) return null;
  if (!session) {
    return (
      <div className="stack-lg center" style={{ paddingTop: 60 }}>
        <SignInSheet open onClose={() => {}} next="/admin/photos" />
      </div>
    );
  }
  if (!isStaff) {
    return (
      <div className="stack-lg center" style={{ paddingTop: 60 }}>
        <h2>Staff only</h2>
        <p className="muted">This page is for the gym team.</p>
        <Link href="/" className="btn btn-primary" style={{ marginTop: 14 }}>
          Back home
        </Link>
      </div>
    );
  }

  async function act(r: AdminPhotoReport, action: "keep" | "hide" | "delete") {
    if (action === "delete" && !confirm(`Delete this ${r.kind} photo by ${r.display_name}? This can't be undone.`)) return;
    setBusy(r.id);
    try {
      if (action === "delete") await deletePumpPhoto(supabase, r.id);
      else await adminSetPhotoHidden(supabase, r.id, action === "hide");
      toast(action === "delete" ? "Photo deleted" : action === "keep" ? "Photo restored" : "Photo hidden");
      await load();
    } catch {
      toast("That didn't work — try again");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="topbar">
        <Link href="/admin" className="iconbtn" aria-label="Back to dashboard">
          <Icon name="back" />
        </Link>
        <div className="brand">Photo reports</div>
        <div style={{ width: 38 }} />
      </div>
      <div className="stack">
        <p className="muted" style={{ fontSize: 13.5, margin: "0 0 4px" }}>
          Photos members reported, plus any hidden automatically after 3 reports. <b>Keep</b> restores a photo;
          <b> Delete</b> removes it for good.
        </p>

        {rows === null ? (
          <div className="feed-skel" />
        ) : rows.length === 0 ? (
          <div className="card feed-empty">
            <div className="feed-glyph">
              <Icon name="check" />
            </div>
            <h3>{error ? "Couldn't load reports" : "Nothing to review"}</h3>
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              {error ? "Has 0007_pump_photos.sql been run in Supabase?" : "No reported or hidden photos right now."}
            </p>
          </div>
        ) : (
          rows.map((r) => (
            <div className="card admin-photo" key={r.id} data-testid="report-row">
              <button type="button" className="admin-photo-img" onClick={() => urls[r.path] && setZoom(urls[r.path])}>
                {urls[r.path] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urls[r.path]} alt="" />
                ) : (
                  <div className="pump-skel" />
                )}
              </button>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800 }}>{r.display_name}</div>
                <div className="faint" style={{ fontSize: 12.5, marginTop: 2 }}>
                  {r.kind === "pre" ? "Pre" : "Post"} · {formatDay(r.day)} · {r.shared ? "shared" : "private"}
                </div>
                <div style={{ marginTop: 6, fontSize: 13 }}>
                  <b>{r.report_count}</b> {r.report_count === 1 ? "report" : "reports"}
                  {r.hidden && <span className="pill-yellow" style={{ marginLeft: 8, fontSize: 10.5 }}>HIDDEN</span>}
                </div>
                {r.reasons.length > 0 && (
                  <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>
                    “{[...new Set(r.reasons)].slice(0, 3).join("”, “")}”
                  </div>
                )}
                <div className="btn-row" style={{ marginTop: 10 }}>
                  <button className="btn btn-outline btn-sm" disabled={busy === r.id} onClick={() => act(r, "keep")}>
                    Keep
                  </button>
                  {!r.hidden && (
                    <button className="btn btn-outline btn-sm" disabled={busy === r.id} onClick={() => act(r, "hide")}>
                      Hide
                    </button>
                  )}
                  <button className="btn btn-sm" style={{ color: "var(--danger)", border: "1px solid var(--border)" }} disabled={busy === r.id} onClick={() => act(r, "delete")}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {zoom && (
        <div className="pump-viewer" onClick={() => setZoom(null)}>
          <div className="pump-viewer-img" style={{ paddingTop: 40 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={zoom} alt="" />
          </div>
        </div>
      )}
    </>
  );
}
