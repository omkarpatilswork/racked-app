"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { fetchMyNotices, markNoticesSeen, type MemberNotice } from "@/lib/data";
import { noticeText } from "@/lib/fairplay";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// "From the gym staff": shown on Home when staff removed one of your sets or
// reset a machine, so changes to your stats never happen silently.
export default function StaffNotices({ supabase, uid }: { supabase: SupabaseClient<Database>; uid: string }) {
  const [notices, setNotices] = useState<MemberNotice[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchMyNotices(supabase, uid).then(setNotices);
  }, [supabase, uid]);

  if (notices.length === 0) return null;

  return (
    <section className="card notice-card" role="status" aria-live="polite" data-testid="staff-notices">
      <div className="row" style={{ justifyContent: "flex-start", gap: 10 }}>
        <span className="tapin-icons" style={{ width: 36, height: 36, borderRadius: 12 }} aria-hidden="true">
          <Icon name="shield" />
        </span>
        <div className="eyebrow">From the gym staff</div>
      </div>
      <div className="stack" style={{ marginTop: 12 }}>
        {notices.slice(0, 3).map((n) => {
          const t = noticeText(n);
          return (
            <div key={n.id}>
              <div style={{ fontWeight: 800 }}>{t.title}</div>
              <p className="muted" style={{ fontSize: 13.5, margin: "2px 0 0" }}>
                {t.body}
              </p>
            </div>
          );
        })}
        {notices.length > 3 && <div className="faint" style={{ fontSize: 12.5 }}>{notices.length - 3} more after this</div>}
      </div>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        style={{ marginTop: 14 }}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            // only the notes actually shown are marked as read
            const shown = notices.slice(0, 3);
            await markNoticesSeen(
              supabase,
              shown.map((n) => n.id)
            );
            setNotices((all) => all.slice(3));
          } catch {
            /* keep them; try again later */
          } finally {
            setBusy(false);
          }
        }}
        data-testid="notices-ok"
      >
        Got it
      </button>
    </section>
  );
}
