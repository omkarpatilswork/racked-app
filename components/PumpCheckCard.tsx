"use client";

import { useMemo } from "react";
import PumpSlots from "@/components/PumpSlots";
import { usePhotoManager } from "@/components/usePhotoManager";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { useMyPumpPhotos } from "@/lib/useMyPumpPhotos";
import { useSignedUrls } from "@/lib/useSignedUrls";
import { todayStr } from "@/lib/streaks";

// "Today's pump check" -- add your pre and post workout photos. Lives in the
// + menu (bare: no card or heading, the sheet has its own).
export default function PumpCheckCard({ bare = false }: { bare?: boolean }) {
  const { session } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const uid = session?.user.id ?? null;
  const day = todayStr();
  const { photos, status } = useMyPumpPhotos(supabase, uid);
  const todays = photos.filter((p) => p.day === day);
  const urls = useSignedUrls(supabase, todays.map((p) => p.path));
  const manager = usePhotoManager(supabase, uid);

  // Photos need migration 0007; until it's been run, show nothing at all.
  if (!uid || status !== "ready") {
    return bare && uid && status !== "loading" ? <p className="faint">Photos aren&rsquo;t switched on yet.</p> : null;
  }

  // Every photo is optional: before, after, both, or none -- all fine.
  const sub =
    todays.length === 0
      ? "Before, after, both or neither — totally optional."
      : todays.length === 1
        ? "Photo saved. Add another any time today, or leave it at that."
        : "Both photos in — nice work. Check your progress on Profile.";
  if (bare) {
    // the + drawer's sheet: one short line, no "(optional)" under each slot
    const line = todays.length === 0 ? "Before and after today\u2019s workout. Both optional." : todays.length === 1 ? "Saved. Add the other one any time today." : "Both in. See them on You.";
    return (
      <section className="pump-card bare" data-testid="pump-card">
        <div className="pump-sub" style={{ marginBottom: 12 }}>
          {line}
        </div>
        <PumpSlots day={day} photos={photos} urls={urls} onAdd={(kind) => manager.pick(kind, day)} onOpen={(p) => manager.viewOwn(p, urls[p.path] ?? null)} hints={false} />
        {manager.ui}
      </section>
    );
  }
  return (
    <section className="card pump-card" data-testid="pump-card">
      <div className="pump-head">
        <div>
          <h2 style={{ fontSize: 16, margin: 0 }}>Today&rsquo;s pump check</h2>
          <div className="pump-sub">{sub}</div>
        </div>
      </div>
      <PumpSlots
        day={day}
        photos={photos}
        urls={urls}
        onAdd={(kind) => manager.pick(kind, day)}
        onOpen={(p) => manager.viewOwn(p, urls[p.path] ?? null)}
      />
      {manager.ui}
    </section>
  );
}
