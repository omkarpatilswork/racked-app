"use client";

import { useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import PumpSlots from "@/components/PumpSlots";
import { formatDay } from "@/components/PhotoViewer";
import { usePhotoManager } from "@/components/usePhotoManager";
import { createClient } from "@/lib/supabase/client";
import type { PumpKind, PumpPhoto } from "@/lib/data";
import { useMyPumpPhotos } from "@/lib/useMyPumpPhotos";
import { useSignedUrls } from "@/lib/useSignedUrls";
import { todayStr } from "@/lib/streaks";

const DAYS_PER_PAGE = 10;

type DayRow = { day: string; pre?: PumpPhoto; post?: PumpPhoto };

function daysBetween(a: string, b: string) {
  return Math.round((new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 86400000);
}

// Profile: add today's photos, see a timeline of every pre/post pair, and a
// "then vs now" comparison. Also reports which days have photos so the
// attendance calendar can mark them.
export default function ProgressPhotos({
  uid,
  onPhotoDays,
}: {
  uid: string;
  onPhotoDays?: (days: Record<string, boolean>) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { photos, status } = useMyPumpPhotos(supabase, uid);
  const manager = usePhotoManager(supabase, uid);
  const [shownDays, setShownDays] = useState(DAYS_PER_PAGE);
  const today = todayStr();

  const rows = useMemo<DayRow[]>(() => {
    const by = new Map<string, DayRow>();
    photos.forEach((p) => {
      const row = by.get(p.day) || { day: p.day };
      row[p.kind] = p;
      by.set(p.day, row);
    });
    return [...by.values()].sort((a, b) => (a.day < b.day ? 1 : -1));
  }, [photos]);

  // then vs now: the same kind of photo (post preferred), oldest vs newest
  const compare = useMemo(() => {
    for (const kind of ["post", "pre"] as PumpKind[]) {
      const list = photos.filter((p) => p.kind === kind).sort((a, b) => (a.day < b.day ? -1 : 1));
      if (list.length >= 2) return { first: list[0], last: list[list.length - 1], kind };
    }
    return null;
  }, [photos]);

  const visibleRows = rows.slice(0, shownDays);
  const paths = [
    ...photos.filter((p) => p.day === today),
    ...visibleRows.flatMap((r) => [r.pre, r.post].filter(Boolean) as PumpPhoto[]),
    ...(compare ? [compare.first, compare.last] : []),
  ].map((p) => p.path);
  const urls = useSignedUrls(supabase, paths);

  // let the calendar mark days that have photos
  const photoDaysKey = [...new Set(photos.map((p) => p.day))].join(",");
  useEffect(() => {
    if (!onPhotoDays) return;
    const map: Record<string, boolean> = {};
    if (photoDaysKey) photoDaysKey.split(",").forEach((d) => (map[d] = true));
    onPhotoDays(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoDaysKey]);

  if (status !== "ready") return null;

  const open = (p: PumpPhoto) => manager.viewOwn(p, urls[p.path] ?? null);

  return (
    <div className="card" data-testid="progress-photos">
      <div className="row">
        <h3 style={{ margin: 0, fontSize: 15 }}>
          <Icon name="camera" /> Progress photos
        </h3>
        <span className="faint" style={{ fontSize: 12 }}>
          {rows.length} {rows.length === 1 ? "day" : "days"}
        </span>
      </div>
      <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>
        Add a before photo, an after photo, or both — every one is optional. Watch the change over time.
      </div>

      <div style={{ marginTop: 14 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>
          Today
        </div>
        <PumpSlots
          day={today}
          photos={photos}
          urls={urls}
          onAdd={(kind) => manager.pick(kind, today)}
          onOpen={open}
        />
      </div>

      {compare && (
        <div style={{ marginTop: 18 }} data-testid="then-now">
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            Then vs now · {daysBetween(compare.first.day, compare.last.day)} days apart
          </div>
          <div className="pump-slots">
            {[compare.first, compare.last].map((p, i) => (
              <button key={p.id} type="button" className="pump-slot filled" onClick={() => open(p)}>
                {urls[p.path] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urls[p.path]} alt="" />
                ) : (
                  <div className="pump-skel" />
                )}
                <span className="pump-tag">{i === 0 ? "Then" : "Now"}</span>
                <span className="pump-date">{formatDay(p.day)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            Timeline
          </div>
          <div className="pump-timeline">
            {visibleRows.map((r) => (
              <div className="pump-day" key={r.day} data-testid="pump-day">
                <div className="pump-day-label">
                  {r.day === today ? "Today" : formatDay(r.day)}
                </div>
                <div className="pump-day-imgs">
                  {(["pre", "post"] as PumpKind[]).map((kind) => {
                    const p = r[kind];
                    if (!p) return null;
                    return (
                      <button key={kind} type="button" className="pump-thumb" onClick={() => open(p)}>
                        {urls[p.path] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={urls[p.path]} alt="" loading="lazy" />
                        ) : (
                          <div className="pump-skel" />
                        )}
                        <span className="pump-tag">{kind === "pre" ? "Pre" : "Post"}</span>
                        {!p.shared && (
                          <span className="pump-lock">
                            <Icon name="lock" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {rows.length > shownDays && (
            <button
              type="button"
              className="btn btn-outline"
              style={{ marginTop: 12 }}
              onClick={() => setShownDays((n) => n + DAYS_PER_PAGE)}
            >
              Show older days
            </button>
          )}
        </div>
      )}
      {manager.ui}
    </div>
  );
}
