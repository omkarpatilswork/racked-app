"use client";

// Gym TV screen. Open https://<your-site>/tv on the TV's browser, press F (or
// double-click) for full screen, and leave it. No login: it only shows first
// names, best lifts and anonymous counts (see supabase/migrations/0005).
//
// Optional settings in the address:
//   /tv?interval=8        seconds per slide (default 5, minimum 3)
//   /tv?period=week       today (default) | week | month | all
//   /tv?limit=3           lifters shown per leaderboard (default 5, max 8)
//
// Keyboard: F = full screen, Space = pause, ← → = previous / next slide.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Icon from "@/components/Icon";
import { createClient } from "@/lib/supabase/client";
import { fetchTvData, type TvBoard, type TvData } from "@/lib/data";
import type { Period } from "@/lib/period";

const POLL_MS = 10_000;
// If we haven't managed to refresh for this long, say so on screen rather
// than silently showing stale numbers as if they were live.
const STALE_MS = 35_000;

const PERIOD_WORD: Record<Period, string> = {
  today: "today",
  week: "this week",
  month: "this month",
  all: "all time",
};

type Slide = { kind: "board"; key: string; board: TvBoard } | { kind: "activity"; key: string };

function fmtNum(n: number) {
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function parsePeriod(raw: string | null): Period {
  return raw === "week" || raw === "month" || raw === "all" ? raw : "today";
}

function TvScreen() {
  const params = useSearchParams();
  const period = parsePeriod(params.get("period"));
  const intervalSec = Math.max(3, Number(params.get("interval")) || 5);
  const limit = Math.min(8, Math.max(3, Number(params.get("limit")) || 5));

  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<TvData | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [idle, setIdle] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const lastOkRef = useRef(0);

  // ---- live data: poll, and keep showing the last good numbers on a failure
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const next = await fetchTvData(supabase, period, limit);
        if (cancelled) return;
        lastOkRef.current = Date.now();
        setData(next);
      } catch {
        /* keep whatever we had; the header flips to "reconnecting" if it persists */
      }
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [supabase, period, limit]);

  // ---- clock (also drives the "reconnecting" check)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // ---- slides: boards that have someone on them, then the muscle-group slide.
  // If nobody has lifted anything yet, show every board with a "be the first"
  // message instead of a blank screen.
  const slides = useMemo<Slide[]>(() => {
    if (!data) return [];
    const withPeople = data.boards.filter((b) => b.entries.length > 0);
    const shown = withPeople.length > 0 ? withPeople : data.boards;
    return [
      ...shown.map((b): Slide => ({ kind: "board", key: b.key, board: b })),
      { kind: "activity", key: "activity" },
    ];
  }, [data]);

  const slideCount = slides.length;
  const current = slideCount ? slides[idx % slideCount] : null;

  const next = useCallback(() => setIdx((i) => i + 1), []);

  // ---- auto-advance
  useEffect(() => {
    if (paused || !slideCount) return;
    const t = setTimeout(next, intervalSec * 1000);
    return () => clearTimeout(t);
  }, [idx, paused, slideCount, intervalSec, next]);

  // ---- keyboard + fullscreen + hide the mouse pointer when idle
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else rootRef.current?.requestFullscreen?.().catch(() => {});
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "f" || e.key === "F") toggleFullscreen();
      else if (e.key === " ") {
        e.preventDefault();
        setPaused((p) => !p);
      } else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft" && slideCount) setIdx((i) => ((i % slideCount) - 1 + slideCount) % slideCount);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleFullscreen, next, slideCount]);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const wake = () => {
      setIdle(false);
      clearTimeout(t);
      t = setTimeout(() => setIdle(true), 3000);
    };
    wake();
    window.addEventListener("mousemove", wake);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousemove", wake);
    };
  }, []);

  // ---- keep the TV from going to sleep (where the browser supports it)
  useEffect(() => {
    type WakeNav = Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
    };
    let lock: { release: () => Promise<void> } | null = null;
    const acquire = async () => {
      try {
        lock = (await (navigator as WakeNav).wakeLock?.request("screen")) ?? null;
      } catch {
        /* not supported / denied -- set the TV's screensaver to "never" instead */
      }
    };
    acquire();
    const onVis = () => document.visibilityState === "visible" && acquire();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      lock?.release().catch(() => {});
    };
  }, []);

  const stale = lastOkRef.current > 0 && now - lastOkRef.current > STALE_MS;
  const clock = new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div
      ref={rootRef}
      className={`tv${idle ? " tv-idle" : ""}`}
      onDoubleClick={toggleFullscreen}
      data-testid="tv-root"
    >
      <header className="tv-head">
        <div className="tv-brand">
          <b>RACKED</b>
          <span>BY BIJLEE</span>
        </div>
        <div className="tv-head-right">
          <div className={`tv-live${stale ? " off" : ""}`}>
            <i />
            {stale ? "Reconnecting" : `Live · ${PERIOD_WORD[period]}`}
          </div>
          <div className="tv-clock">{clock}</div>
        </div>
      </header>

      <main className="tv-stage">
        {!current || !data ? (
          <div className="tv-splash">Loading the floor…</div>
        ) : current.kind === "board" ? (
          <BoardSlide key={`${current.key}-${idx}`} board={current.board} period={period} />
        ) : (
          <ActivitySlide key={`activity-${idx}`} data={data} period={period} />
        )}
      </main>

      <footer className="tv-foot">
        <div className="tv-dots" aria-hidden>
          {slides.map((s, i) => (
            <i key={s.key} className={i === idx % slideCount ? "on" : ""} />
          ))}
        </div>
        <div>Scan the QR or tap the NFC sticker on any machine to join the board</div>
      </footer>

      {slideCount > 0 && (
        <div className="tv-progress" aria-hidden>
          <i
            key={`p-${idx}`}
            style={{
              animationDuration: `${intervalSec}s`,
              animationPlayState: paused ? "paused" : "running",
            }}
          />
        </div>
      )}
    </div>
  );
}

function BoardSlide({ board, period }: { board: TvBoard; period: Period }) {
  const empty = board.entries.length === 0;
  return (
    <section className="tv-slide" data-testid="slide-board">
      <div className="tv-side">
        <div className="tv-eyebrow">{period === "today" ? "Today's leaderboard" : `Leaderboard · ${PERIOD_WORD[period]}`}</div>
        <div className="tv-machine-no">{board.machineNumber}</div>
        <div className="tv-machine-name">{board.title}</div>
      </div>
      {empty ? (
        <div className="tv-empty">
          <b>Nobody yet</b>
          <span>Be the first on the {board.title.toLowerCase()} board {PERIOD_WORD[period]}</span>
        </div>
      ) : (
        <div className="tv-rows">
          {board.entries.map((e, i) => (
            <div
              key={`${e.rank}-${e.name}-${i}`}
              className={`tv-row${e.rank === 1 ? " first" : ""}`}
              style={{ animationDelay: `${i * 0.07}s` }}
            >
              <div className="rk">{e.rank === 1 ? <Icon name="trophy" /> : e.rank}</div>
              <div className="nm">{e.name}</div>
              <div className="lift">
                {fmtNum(e.weight)}
                <small>{board.unit}</small> × {e.reps}
              </div>
              <div className="st">
                {e.sets} {e.sets === 1 ? "set" : "sets"}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ActivitySlide({ data, period }: { data: TvData; period: Period }) {
  const { groups, lifters, sets, volume, pbs } = data.activity;
  const sorted = [...groups].sort((a, b) => b.lifters - a.lifters || b.sets - a.sets);
  const maxLifters = Math.max(1, ...sorted.map((g) => g.lifters));
  const top = sorted[0];
  const quiet = sorted[sorted.length - 1];
  const hasData = lifters > 0;

  return (
    <section className="tv-slide" data-testid="slide-activity">
      <div className="tv-acts">
        <div>
          <div className="tv-eyebrow">The floor {PERIOD_WORD[period]}</div>
          <div className="tv-title">Who&apos;s hitting what</div>
        </div>
        <div className="tv-sub">
          {hasData
            ? `${lifters} ${lifters === 1 ? "lifter" : "lifters"} in the gym ${PERIOD_WORD[period]}`
            : `Nobody has logged a set ${PERIOD_WORD[period]} yet`}
        </div>
        {sorted.map((g, i) => (
          <div key={g.id} className={`tv-bar${hasData && i === 0 ? " top" : ""}`}>
            <div className="lb">{g.label}</div>
            <div className="track">
              <div
                className="fill"
                style={{
                  width: `${hasData ? Math.max(4, (g.lifters / maxLifters) * 100) : 4}%`,
                  animationDelay: `${i * 0.08}s`,
                }}
              />
            </div>
            <div className="ct">
              {g.lifters}
              <small>
                {g.lifters === 1 ? "lifter" : "lifters"} · {g.sets} {g.sets === 1 ? "set" : "sets"}
              </small>
            </div>
          </div>
        ))}
      </div>

      <div className="tv-facts">
        <div className="tv-callout">
          <small>{hasData ? "Crowd favourite" : "Fun fact"}</small>
          <b>
            {hasData
              ? `${top.label} — ${top.lifters} of ${lifters} lifters`
              : "The floor is empty. Be the first to rack up."}
          </b>
        </div>
        <div className="tv-tiles">
          <div className="tv-tile">
            <b>{lifters}</b>
            <span>Lifters</span>
          </div>
          <div className="tv-tile">
            <b>{sets}</b>
            <span>Sets logged</span>
          </div>
          <div className="tv-tile">
            <b>{fmtNum(Math.round(volume))}</b>
            <span>Kg moved</span>
          </div>
          <div className="tv-tile">
            <b>{pbs}</b>
            <span>New PBs</span>
          </div>
        </div>
        {hasData && quiet && quiet.lifters < top.lifters && (
          <div className="tv-sub">
            {quiet.lifters === 0
              ? `Nobody has trained ${quiet.label.toLowerCase()} yet — who's first?`
              : `Quietest: ${quiet.label} with ${quiet.lifters} ${quiet.lifters === 1 ? "lifter" : "lifters"}`}
          </div>
        )}
      </div>
    </section>
  );
}

export default function TvPage() {
  return (
    <Suspense fallback={<div className="tv"><div className="tv-splash">Loading the floor…</div></div>}>
      <TvScreen />
    </Suspense>
  );
}
