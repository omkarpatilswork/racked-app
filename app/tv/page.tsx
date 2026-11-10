"use client";

// Gym TV screen. Open https://<your-site>/tv on the TV's browser, press F (or
// double-click) for full screen, and leave it. No login: it only shows first
// names, best lifts and anonymous counts (see supabase/migrations/0005).
//
// The slideshow is built to pull people in: a "Join Racked" slide with a big
// QR code, today's gym totals, who's training what, and a leaderboard for
// every machine someone has used. A small "scan to join" QR stays in the
// corner of every other slide.
//
// Optional settings in the address:
//   /tv?interval=8        seconds per leaderboard slide (default 8, minimum 4)
//   /tv?period=week       today (default) | week | month | all
//   /tv?limit=3           lifters shown per leaderboard (default 5, max 8)
//
// Keyboard: F = full screen, Space = pause, ← → = previous / next slide.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Icon from "@/components/Icon";
import QrCode from "@/components/tv/QrCode";
import CountUp from "@/components/tv/CountUp";
import { createClient } from "@/lib/supabase/client";
import { fetchTvData, type TvBoard, type TvData } from "@/lib/data";
import { MACHINES } from "@/lib/machines";
import { fmtKg, kgEquivalent } from "@/lib/tvCopy";
import { buildSlides, type Slide } from "@/lib/tvSlides";
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

function parsePeriod(raw: string | null): Period {
  return raw === "week" || raw === "month" || raw === "all" ? raw : "today";
}

function TvScreen() {
  const params = useSearchParams();
  const period = parsePeriod(params.get("period"));
  const boardSec = Math.max(4, Number(params.get("interval")) || 8);
  const limit = Math.min(8, Math.max(3, Number(params.get("limit")) || 5));

  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<TvData | null>(null);
  // 0 until mounted: the server's clock and the TV's would never match, which
  // made React throw away the server HTML (a hydration error).
  const [now, setNow] = useState(0);
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [idle, setIdle] = useState(false);
  const [joinUrl, setJoinUrl] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const lastOkRef = useRef(0);

  useEffect(() => {
    setJoinUrl(`${window.location.origin}/join?src=tv`);
  }, []);

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
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const slides = useMemo<Slide[]>(() => (data ? buildSlides(data) : []), [data]);
  // Track the slide by key, so fresh data arriving mid-slide never makes the
  // show jump to a different slide.
  const idx = useMemo(() => {
    if (!slides.length) return 0;
    const i = slides.findIndex((s) => s.key === currentKey);
    return i >= 0 ? i : 0;
  }, [slides, currentKey]);
  const current = slides[idx] ?? null;

  // `go` reads the latest slides through refs so it stays the same function
  // across data refreshes -- otherwise every 10-second poll would restart the
  // current slide's timer and long slides would never advance.
  const slidesRef = useRef(slides);
  const idxRef = useRef(idx);
  slidesRef.current = slides;
  idxRef.current = idx;
  const go = useCallback((delta: number) => {
    const list = slidesRef.current;
    if (!list.length) return;
    const n = list.length;
    setCurrentKey(list[(((idxRef.current + delta) % n) + n) % n].key);
  }, []);
  const currentSlideKey = current?.key ?? null;

  const seconds = !current
    ? boardSec
    : current.kind === "join"
      ? 12
      : current.kind === "totals"
        ? 10
        : current.kind === "board"
          ? boardSec
          : 9;

  // ---- auto-advance
  useEffect(() => {
    if (paused || !currentSlideKey) return;
    const t = setTimeout(() => go(1), seconds * 1000);
    return () => clearTimeout(t);
  }, [currentSlideKey, paused, seconds, go]);

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
      } else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleFullscreen, go]);

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
  const clock = now ? new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  const host = joinUrl ? new URL(joinUrl).host : "";

  return (
    <div ref={rootRef} className={`tv${idle ? " tv-idle" : ""}`} onDoubleClick={toggleFullscreen} data-testid="tv-root">
      <div className="tv-aurora" aria-hidden />
      <header className="tv-head">
        <div className="tv-brand">
          <span className="tv-dot" />
          <b>RACKED</b>
          <span>× BIJLEE</span>
        </div>
        <div className="tv-head-right">
          <div className={`tv-live${stale ? " off" : ""}`} data-testid="tv-live">
            <i />
            {stale ? "Reconnecting" : `Live · ${PERIOD_WORD[period]}`}
          </div>
          <div className="tv-clock">{clock}</div>
        </div>
      </header>

      <main className="tv-stage" aria-live="off">
        {!current || !data ? (
          <div className="tv-splash">
            <span className="tv-dot big" />
            Loading the floor…
          </div>
        ) : current.kind === "join" ? (
          <JoinSlide key={current.key} data={data} joinUrl={joinUrl} host={host} period={period} />
        ) : current.kind === "totals" ? (
          <TotalsSlide key={current.key} data={data} period={period} />
        ) : current.kind === "groups" ? (
          <GroupsSlide key={current.key} data={data} period={period} />
        ) : current.kind === "open" ? (
          <OpenSlide key={current.key} period={period} />
        ) : (
          <BoardSlide key={current.key} board={current.board} period={period} />
        )}
      </main>

      <footer className="tv-foot">
        <div className="tv-dots" aria-hidden>
          {slides.map((s, i) => (
            <i key={`${s.key}-${i}`} className={i === idx ? "on" : ""} />
          ))}
        </div>
        <div className="tv-foot-msg">Tap the Racked sticker on any machine to log your set</div>
      </footer>

      {current && current.kind !== "join" && joinUrl && (
        <div className="tv-corner-qr" data-testid="tv-corner-qr">
          <QrCode value={joinUrl} className="tv-qr small" label="QR code to join Racked" />
          <div>
            <b>Not on the board yet?</b>
            <span>Scan to join · free</span>
          </div>
        </div>
      )}

      {current && (
        <div className="tv-progress" aria-hidden>
          <i key={`p-${current.key}`} style={{ animationDuration: `${seconds}s`, animationPlayState: paused ? "paused" : "running" }} />
        </div>
      )}
    </div>
  );
}

function JoinSlide({ data, joinUrl, host, period }: { data: TvData; joinUrl: string; host: string; period: Period }) {
  const { lifters, pbs } = data.activity;
  return (
    <section className="tv-slide tv-join" data-testid="slide-join">
      <div className="tv-join-copy">
        <div className="tv-eyebrow">New here? This gym is live.</div>
        <h1 className="tv-hero">
          Tap. Lift.
          <br />
          <span className="tv-grad">Get on the board.</span>
        </h1>
        <p className="tv-lede">Every machine here has a Racked sticker. Log your sets, beat your best, and see your name on this screen.</p>
        <ol className="tv-steps">
          <li style={{ animationDelay: "0.15s" }}>
            <span className="tv-step-ic">
              <Icon name="qr" />
            </span>
            <b>Scan the code</b>
            <span>Sign in with Google in 10 seconds</span>
          </li>
          <li style={{ animationDelay: "0.3s" }}>
            <span className="tv-step-ic">
              <Icon name="nfc" />
            </span>
            <b>Tap a machine</b>
            <span>Hold your phone to its sticker</span>
          </li>
          <li style={{ animationDelay: "0.45s" }}>
            <span className="tv-step-ic">
              <Icon name="trophy" />
            </span>
            <b>Climb the board</b>
            <span>Your best lift shows up here, live</span>
          </li>
        </ol>
      </div>
      <div className="tv-join-qr">
        <div className="tv-qr-card">
          {joinUrl && <QrCode value={joinUrl} className="tv-qr" label="QR code to join Racked" />}
          <div className="tv-qr-cta">Scan with your camera</div>
          <div className="tv-qr-url">{host}/join</div>
        </div>
        <div className="tv-qr-badge">Free · No app download</div>
        <div className="tv-proof" data-testid="tv-proof">
          <Icon name="flame" />
          {lifters > 0
            ? `${lifters} ${lifters === 1 ? "lifter is" : "lifters are"} on the boards ${PERIOD_WORD[period]}${pbs > 0 ? ` · ${pbs} new PB${pbs === 1 ? "" : "s"}` : ""}`
            : `Every board is empty ${PERIOD_WORD[period]} — the first set takes #1`}
        </div>
      </div>
    </section>
  );
}

function TotalsSlide({ data, period }: { data: TvData; period: Period }) {
  const { lifters, sets, volume, pbs, machines } = data.activity;
  const busiest = machines[0];
  const kg = Math.round(volume);
  return (
    <section className="tv-slide tv-totals" data-testid="slide-totals">
      <div className="tv-totals-hero">
        <div className="tv-eyebrow">The gym {PERIOD_WORD[period]}</div>
        <div className="tv-mega" data-testid="tv-kg">
          <CountUp value={kg} />
          <small>kg</small>
        </div>
        <div className="tv-mega-label">moved by Racked lifters</div>
        <div className="tv-equiv">{kgEquivalent(kg)}</div>
      </div>
      <div className="tv-totals-grid">
        <div className="tv-stat" style={{ animationDelay: "0.1s" }}>
          <Icon name="user" />
          <b>
            <CountUp value={lifters} duration={900} />
          </b>
          <span>{lifters === 1 ? "Lifter" : "Lifters"}</span>
        </div>
        <div className="tv-stat" style={{ animationDelay: "0.2s" }}>
          <Icon name="dumbbell" />
          <b>
            <CountUp value={sets} duration={1100} />
          </b>
          <span>Sets logged</span>
        </div>
        <div className="tv-stat accent" style={{ animationDelay: "0.3s" }}>
          <Icon name="trophy" />
          <b>
            <CountUp value={pbs} duration={900} />
          </b>
          <span>New PBs</span>
        </div>
        <div className="tv-stat" style={{ animationDelay: "0.4s" }}>
          <Icon name="flame" />
          <b className="tv-stat-name">{busiest ? busiest.title : "—"}</b>
          <span>{busiest ? `Busiest machine · ${busiest.lifters} ${busiest.lifters === 1 ? "lifter" : "lifters"}` : "Busiest machine"}</span>
        </div>
      </div>
    </section>
  );
}

function GroupsSlide({ data, period }: { data: TvData; period: Period }) {
  const { groups, lifters } = data.activity;
  const sorted = [...groups].sort((a, b) => b.lifters - a.lifters || b.sets - a.sets);
  const maxLifters = Math.max(1, ...sorted.map((g) => g.lifters));
  const top = sorted[0];
  const quiet = sorted[sorted.length - 1];
  const hasData = lifters > 0;

  return (
    <section className="tv-slide tv-groups" data-testid="slide-activity">
      <div>
        <div className="tv-eyebrow">The floor {PERIOD_WORD[period]}</div>
        <h2 className="tv-title">Who&apos;s hitting what</h2>
        <p className="tv-sub">
          {hasData
            ? `${top.label} is the crowd favourite — ${top.lifters} of ${lifters} ${lifters === 1 ? "lifter" : "lifters"}.`
            : `Nobody has logged a set ${PERIOD_WORD[period]} yet. Be the first.`}
        </p>
        {hasData && quiet && quiet.lifters < top.lifters && (
          <div className="tv-callout">
            <small>Up for grabs</small>
            <b>
              {quiet.lifters === 0 ? `Nobody has trained ${quiet.label.toLowerCase()} yet. Who's first?` : `${quiet.label} is the quietest — easy top spot.`}
            </b>
          </div>
        )}
      </div>
      <div className="tv-bars">
        {sorted.map((g, i) => (
          <div key={g.id} className={`tv-bar${hasData && i === 0 ? " top" : ""}`}>
            <div className="lb">{g.label}</div>
            <div className="track">
              <div className="fill" style={{ width: `${hasData ? Math.max(4, (g.lifters / maxLifters) * 100) : 4}%`, animationDelay: `${i * 0.08}s` }} />
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
    </section>
  );
}

function OpenSlide({ period }: { period: Period }) {
  return (
    <section className="tv-slide tv-open" data-testid="slide-open">
      <div>
        <div className="tv-eyebrow">Leaderboards {PERIOD_WORD[period]}</div>
        <h2 className="tv-title">
          Every board is <span className="tv-grad">wide open.</span>
        </h2>
        <p className="tv-sub">Log one set on any machine and you&apos;re #1 on its board — right here on this screen.</p>
      </div>
      <div className="tv-open-grid">
        {MACHINES.map((m, i) => (
          <div key={m.id} className="tv-open-cell" style={{ animationDelay: `${i * 0.05}s` }}>
            <span>{m.number}</span>
            <b>{m.name}</b>
            <i>#1 is free</i>
          </div>
        ))}
      </div>
    </section>
  );
}

function BoardSlide({ board, period }: { board: TvBoard; period: Period }) {
  const [first, ...others] = board.entries;
  const podium = board.entries.slice(0, 3);
  const rest = board.entries.slice(3);
  const unit = board.unit.toLowerCase();
  return (
    <section className="tv-slide tv-board" data-testid="slide-board">
      <div className="tv-board-side">
        <div className="tv-eyebrow">{period === "today" ? "Today's leaderboard" : `Leaderboard · ${PERIOD_WORD[period]}`}</div>
        <div className="tv-machine-no">{board.machineNumber}</div>
        <h2 className="tv-machine-name">{board.title}</h2>
        {first && (
          <div className="tv-beat" data-testid="tv-beat">
            <small>Think you can beat {first.name}?</small>
            <b>
              {fmtKg(first.weight)} {unit} × {first.reps}
            </b>
            <span>Tap the sticker on machine {board.machineNumber} and go for it.</span>
          </div>
        )}
      </div>
      <div className="tv-board-main">
        <div className="tv-podium">
          {[podium[1], podium[0], podium[2]].map((e, i) =>
            e ? (
              <div key={`${e.rank}-${e.name}`} className={`tv-pod p${e.rank <= 3 ? e.rank : 3}`} style={{ animationDelay: `${[0.15, 0, 0.3][i]}s` }}>
                <div className="tv-pod-name">{e.name}</div>
                <div className="tv-pod-lift">
                  {fmtKg(e.weight)}
                  <small>{unit}</small> × {e.reps}
                </div>
                <div className="tv-pod-block">
                  {e.rank === 1 ? <Icon name="trophy" /> : null}
                  <span>{e.rank}</span>
                </div>
              </div>
            ) : (
              <div key={`empty-${i}`} className={`tv-pod empty p${i === 0 ? 2 : 3}`}>
                <div className="tv-pod-name">Open</div>
                <div className="tv-pod-lift">Be next</div>
                <div className="tv-pod-block">
                  <span>{i === 0 ? 2 : 3}</span>
                </div>
              </div>
            )
          )}
        </div>
        {rest.length > 0 && (
          <div className="tv-rows">
            {rest.map((e, i) => (
              <div key={`${e.rank}-${e.name}-${i}`} className="tv-row" style={{ animationDelay: `${0.4 + i * 0.07}s` }}>
                <div className="rk">{e.rank}</div>
                <div className="nm">{e.name}</div>
                <div className="lift">
                  {fmtKg(e.weight)}
                  <small>{unit}</small> × {e.reps}
                </div>
              </div>
            ))}
          </div>
        )}
        {others.length === 0 && <div className="tv-sub" style={{ marginTop: "2em" }}>Only one lifter so far — spots #2 and #3 are up for grabs.</div>}
      </div>
    </section>
  );
}

export default function TvPage() {
  return (
    <Suspense
      fallback={
        <div className="tv">
          <div className="tv-splash">Loading the floor…</div>
        </div>
      }
    >
      <TvScreen />
    </Suspense>
  );
}
