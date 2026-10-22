"use client";

import { useMemo } from "react";
import PumpSlots from "@/components/PumpSlots";
import { usePhotoManager } from "@/components/usePhotoManager";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { useMyPumpPhotos } from "@/lib/useMyPumpPhotos";
import { useSignedUrls } from "@/lib/useSignedUrls";
import { todayStr } from "@/lib/streaks";

// Home screen: "Today's pump check" -- add your pre and post workout photos.
export default function PumpCheckCard() {
  const { session } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const uid = session?.user.id ?? null;
  const day = todayStr();
  const { photos, status } = useMyPumpPhotos(supabase, uid);
  const todays = photos.filter((p) => p.day === day);
  const urls = useSignedUrls(supabase, todays.map((p) => p.path));
  const manager = usePhotoManager(supabase, uid);

  // Photos need migration 0007; until it's been run, show nothing at all.
  if (!uid || status !== "ready") return null;

  // Every photo is optional: before, after, both, or none -- all fine.
  const sub =
    todays.length === 0
      ? "Add a photo before, after, or both — whatever suits you. Totally optional."
      : todays.length === 1
        ? "Photo saved. Add another any time today, or leave it at that."
        : "Both photos in — nice work. Check your progress on Profile.";
  return (
    <section className="card pump-card" data-testid="pump-card">
      <div className="pump-head">
        <div>
          <div className="eyebrow">Today&rsquo;s pump check</div>
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
