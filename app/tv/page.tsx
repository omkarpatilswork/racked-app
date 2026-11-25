"use client";

// Gym TV screen. Open https://<your-site>/tv on the TV's browser, press F (or
// double-click) for full screen, and leave it. No login: it only shows first
// names, best lifts and anonymous counts (see supabase/migrations/0005, 0013).
//
// Built to teach and to pull people in, with very little text per slide
// (TV v2, Nov 2026):
//   Join (this week's prize + big QR) · How it works (a short demo on a
//   phone) · a machine's top 3 · this week's prizes · challenges (brand
//   first) · partner ads · last week's winners.
// Push · Pull · Legs is switched off (lib/featureFlags.ts -> tvToday).
// How often each shows and for how long is set in R&R Controls -> TV
// (lib/tvSlides.ts has the running order rules). A "Scan to join · Win <the
// #1 prize>" QR sits in the corner of every slide except Join and the
// partner ads (which have their own QR).
//
// Optional setting in the address:
//   /tv?period=week       today (default) | week | month | all
//
// Keyboard: F = full screen, Space = pause, ← → = previous / next slide.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import Icon from "@/components/Icon";
import BoltMark from "@/components/BoltMark";
import QrCode from "@/components/tv/QrCode";
import CountUp from "@/components/tv/CountUp";
import { createClient } from "@/lib/supabase/client";
import { fetchTvData, type TvBoard, type TvData } from "@/lib/data";
import { MACHINE_MAP, MACHINES, SPLITS } from "@/lib/machines";
import { fmtKg } from "@/lib/tvCopy";
import { buildLoop, cleanTvSlides, slideSeconds, type LoopInput, type Slide, type TvPartner } from "@/lib/tvSlides";
import {
  challengeStatus,
  fetchTvFeed,
  metricValue,
  prizeRankLabel,
  siteHost,
  timeLeft,
  tvPartnerLink,
  weekdayName,
  type Challenge,
  type DivLeader,
  type Prize,
  type Sponsor,
  type SponsorProduct,
  type TvFeed,
} from "@/lib/rewards";
import type { Period } from "@/lib/period";

const POLL_MS = 10_000;
const FEED_MS = 60_000;
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

  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<TvData | null>(null);
  const [feed, setFeed] = useState<TvFeed | null>(null);
  // 0 until mounted: the server's clock and the TV's would never match, which
  // made React throw away the server HTML (a hydration error).
  const [now, setNow] = useState(0);
  const [pos, setPos] = useState<{ loop: number; key: string | null }>({ loop: 0, key: null });
  const [paused, setPaused] = useState(false);
  const [idle, setIdle] = useState(false);
  const [origin, setOrigin] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const lastOkRef = useRef(0);

  useEffect(() => {
    setOrigin(window.location.origin);
    // warm the How it works phone screens so the demo never starts blank
    HOW_SCREENS.forEach((n) => {
      const img = new Image();
      img.src = `/tv/how/${n}.webp`;
    });
  }, []);
  const joinUrl = origin ? `${origin}/join?src=tv` : "";

  // ---- live boards: poll, and keep showing the last good numbers on a failure
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const next = await fetchTvData(supabase, period, 3, 3);
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
  }, [supabase, period]);

  // ---- prizes, challenges, partners, winners + slide settings: every minute
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchTvFeed(supabase).then(
        (f) => !cancelled && setFeed(f),
        () => undefined
      );
    load();
    const t = setInterval(load, FEED_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [supabase]);

  // ---- clock (also drives the "reconnecting" check and challenge countdowns)
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const minute = Math.floor(now / 60000);

  const settings = useMemo(() => cleanTvSlides(feed?.slides), [feed]);
  const input = useMemo<LoopInput | null>(() => {
    if (!data) return null;
    const at = minute * 60000 || Date.now();
    const challenges = (feed?.challenges || [])
      .map((c) => ({ c, st: challengeStatus(c, at) }))
      .filter(({ c, st }) => !st.ended && (st.live || new Date(c.starts_at).getTime() - at < 7 * 86400000))
      .sort((a, b) => Number(b.st.live) - Number(a.st.live) || new Date(a.c.starts_at).getTime() - new Date(b.c.starts_at).getTime());
    return {
      boards: data.boards.filter((b) => b.entries.length > 0),
      hasToday: data.activity.sets > 0,
      hasPrize: !!feed?.season && feed.season.prizes.length > 0,
      challenges: challenges.map((x) => x.c),
      liveChallenge: challenges.some((x) => x.st.live),
      partners: feed?.partners || [],
      hasWinners: !!feed?.lastWinners && feed.lastWinners.winners.length > 0,
    };
  }, [data, feed, minute]);

  const slides = useMemo<Slide[]>(() => (input ? buildLoop(input, settings, pos.loop) : []), [input, settings, pos.loop]);
  // Track the slide by key, so fresh data arriving mid-slide never makes the
  // show jump to a different slide.
  const idx = useMemo(() => {
    if (!slides.length) return 0;
    const i = slides.findIndex((s) => s.key === pos.key);
    return i >= 0 ? i : 0;
  }, [slides, pos.key]);
  const current = slides[idx] ?? null;

  // `go` reads the latest slides through refs so it stays the same function
  // across data refreshes -- otherwise every 10-second poll would restart the
  // current slide's timer and long slides would never advance.
  const ref = useRef({ slides, idx, input, settings, loop: pos.loop });
  ref.current = { slides, idx, input, settings, loop: pos.loop };
  const go = useCallback((delta: number) => {
    const { slides: list, idx: i, input: inp, settings: st, loop } = ref.current;
    if (!list.length || !inp) return;
    const j = i + delta;
    if (j >= 0 && j < list.length) setPos({ loop, key: list[j].key });
    else if (j >= list.length) setPos({ loop: loop + 1, key: null });
    else {
      const back = Math.max(0, loop - 1);
      const prev = buildLoop(inp, st, back);
      setPos({ loop: back, key: back === loop ? list[0].key : prev[prev.length - 1].key });
    }
  }, []);
  const currentSlideKey = current?.key ?? null;
  const seconds = current ? slideSeconds(current, settings) : 10;

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

  const prize = topPrize(feed);
  const stale = lastOkRef.current > 0 && now - lastOkRef.current > STALE_MS;
  const clock = now ? new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  const ownQr = current?.kind === "join" || current?.kind === "partner";

  let body: ReactNode;
  if (!current || !data) {
    body = (
      <div className="tv-splash">
        <span className="tv-dot big" />
        Loading the floor…
      </div>
    );
  } else if (current.kind === "join") body = <JoinSlide key={current.key} data={data} feed={feed} joinUrl={joinUrl} period={period} />;
  else if (current.kind === "howto") body = <HowToSlide key={current.key} feed={feed} strength={data.strength} seconds={seconds} />;
  else if (current.kind === "today") body = <TodaySlide key={current.key} data={data} period={period} />;
  else if (current.kind === "open") body = <OpenSlide key={current.key} period={period} />;
  else if (current.kind === "board")
    body = data.strength ? <BoardSlideBw key={current.key} board={current.board} period={period} /> : <BoardSlide key={current.key} board={current.board} period={period} />;
  else if (current.kind === "prize" && feed?.season) body = <PrizeSlide key={current.key} feed={feed} now={now} />;
  else if (current.kind === "challenge") body = <ChallengeSlide key={current.key} challenge={current.challenge} feed={feed} now={now} />;
  else if (current.kind === "partner") body = <PartnerSlide key={current.key} partner={current.partner} product={current.product} origin={origin} feed={feed} />;
  else if (current.kind === "winners" && feed?.lastWinners) body = <WinnersSlide key={current.key} feed={feed} />;
  else body = <OpenSlide key={current.key} period={period} />;

  return (
    <div ref={rootRef} className={`tv${idle ? " tv-idle" : ""}`} onDoubleClick={toggleFullscreen} data-testid="tv-root">
      <div className="tv-aurora" aria-hidden />
      <header className="tv-head">
        <div className="tv-brand">
          <BoltMark className="tv-brand-bolt" />
          <b>RACKED</b>
          <span>× BIJLEE RUN CLUB</span>
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
        {body}
      </main>

      <footer className="tv-foot">
        <div className="tv-dots" aria-hidden>
          {slides.map((s, i) => (
            <i key={s.key} className={i === idx ? "on" : ""} />
          ))}
        </div>
        <div className="tv-foot-msg">
          <b>Tap or scan. Log. Win.</b> The sticker is on every machine
        </div>
      </footer>

      {current && !ownQr && joinUrl && (
        <div className="tv-corner-qr tv2-cqr" data-testid="tv-corner-qr">
          <QrCode value={joinUrl} className="tv-qr small" label="QR code to join Racked" />
          <div>
            <b>Scan to join</b>
            <span>{prize ? winLine(prize.title) : "Free · No app to download"}</span>
          </div>
          {prize?.image_url && <PrizePhoto src={prize.image_url} className="pz" />}
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

// ---- Prizes and brands, shared by several slides -------------------------------
function topPrize(feed: TvFeed | null): Prize | null {
  const list = feed?.season?.prizes || [];
  return [...list].sort((a, b) => a.rank_from - b.rank_from)[0] || null;
}

function prizeBrands(p: Prize, feed: TvFeed | null): Sponsor[] {
  return (p.sponsor_ids || []).map((id) => feed?.sponsors.find((s) => s.id === id)).filter((s): s is Sponsor => !!s);
}

// "Win an Adidas jersey", "Win a Discovery Box", "Win Partner coupons"
function winLine(title: string) {
  const t = title.trim();
  if (/^(a|an|the|\d)\b/i.test(t) || /s$/i.test(t)) return `Win ${t}`;
  return `Win ${/^[aeiou]/i.test(t) ? "an" : "a"} ${t}`;
}

function brandInitials(name: string) {
  const words = name.replace(/^the\s+/i, "").split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || "?").slice(0, 2)).toUpperCase();
}

// The brand's logo on a white tile, or its initials when there's no logo
function BrandMark({ brand, className }: { brand: { name: string; logo_url: string | null }; className?: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className={`tv2-mark${className ? ` ${className}` : ""}`} aria-hidden>
      {brand.logo_url && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brand.logo_url} alt="" onError={() => setBroken(true)} />
      ) : (
        brandInitials(brand.name)
      )}
    </span>
  );
}

// A prize photo that always fits: the whole photo, never cropped, on its own
// background colour. No photo: a gift icon.
function PrizePhoto({ src, className }: { src: string | null | undefined; className: string }) {
  const [broken, setBroken] = useState(false);
  const ok = !!src && !broken;
  return (
    <div className={`tv2-photo ${className}${ok ? "" : " none"}`} aria-hidden>
      {ok ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="bg" src={src!} alt="" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="fg" src={src!} alt="" onError={() => setBroken(true)} />
        </>
      ) : (
        <Icon name="gift" />
      )}
    </div>
  );
}

// ---- Join: the headline, this week's prize, one big QR code -------------------
function JoinSlide({ data, feed, joinUrl, period }: { data: TvData; feed: TvFeed | null; joinUrl: string; period: Period }) {
  const { lifters, pbs } = data.activity;
  const prize = topPrize(feed);
  const brands = prize ? prizeBrands(prize, feed) : [];
  const who = feed?.tops ? "#1 Men & #1 Women" : prize && !(prize.rank_from === 1 && prize.rank_to === 1) ? `${prizeRankLabel(prize)} win` : "#1 wins";
  return (
    <section className="tv-slide tv-join tv2-join" data-testid="slide-join">
      <div className="tv-join-copy">
        <h1 className="tv-hero tv2-hero">
          Get your name
          <br />
          <span className="tv-grad">on this screen.</span>
        </h1>
        {prize && (
          <div className="tv2-prizecard" data-testid="tv-join-prize">
            <PrizePhoto src={prize.image_url} className="ph" />
            <div>
              <small>Win this {feed?.season?.period === "month" ? "month" : "week"}</small>
              <b>{prize.title}</b>
              <span>{[who, ...brands.map((b) => b.name)].join(" · ")}</span>
            </div>
          </div>
        )}
        <div className="tv-proof" data-testid="tv-proof">
          <Icon name="flame" />
          {lifters > 0
            ? `${lifters} ${lifters === 1 ? "lifter is" : "lifters are"} on the boards ${PERIOD_WORD[period]}${pbs > 0 ? ` · ${pbs} new PB${pbs === 1 ? "" : "s"}` : ""}`
            : `Nobody's lifted yet ${PERIOD_WORD[period]}. The first set takes #1`}
        </div>
      </div>
      <div className="tv-join-qr tv2-join-qr">
        <div className="tv-qr-card">
          {joinUrl && <QrCode value={joinUrl} className="tv-qr" label="QR code to join Racked" />}
          <div className="tv2-scan">Scan to join</div>
        </div>
        <div className="tv2-free">Free · No app to download</div>
      </div>
    </section>
  );
}

// ---- How it works: a short demo -------------------------------------------------
// A phone taps the sticker, logs 50 kg × 10, climbs to #2 and wins this week's
// #1 prize, while the 4 steps light up in turn. The phone shows real app
// screens (public/tv/how/*.webp, sample names, no gym name). One run lasts the
// slide's time (R&R Controls -> TV), at least 8 seconds; 12 is best.
const HOW_SCREENS = ["home", "log", "ranks", "rewards"] as const;

// A made-up QR pattern for the drawn sticker (not scannable, on purpose)
const STICKER_DOTS = (() => {
  let seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const out: boolean[] = [];
  for (let y = 0; y < 9; y++)
    for (let x = 0; x < 9; x++) {
      const f = (a: number, b: number) => x >= a && x < a + 3 && y >= b && y < b + 3;
      out.push(f(0, 0) || f(6, 0) || f(0, 6) ? !(x % 6 === 1 && y % 6 === 1) : rnd() > 0.5);
    }
  return out;
})();

function HowToSlide({ feed, strength, seconds }: { feed: TvFeed | null; strength: boolean; seconds: number }) {
  const prize = topPrize(feed);
  const brand = prize ? prizeBrands(prize, feed)[0] : null;
  const steps: { icon: "nfc" | "dumbbell" | "chartbar" | "gift"; title: string; sub: string }[] = [
    { icon: "nfc", title: "Tap or scan", sub: "The sticker on any machine" },
    { icon: "dumbbell", title: "Log your set", sub: "Weight and reps" },
    { icon: "chartbar", title: "Climb the board", sub: strength ? "Fair for every size" : "Every set counts" },
    { icon: "gift", title: "Win prizes", sub: strength ? "Every week · Men & Women" : "Every week" },
  ];
  return (
    <section className="tv-slide tv3-how" data-testid="slide-howto" style={{ ["--how" as string]: `${Math.max(8, seconds)}s` }}>
      <div className="tv3-stage" aria-hidden>
        <div className="tv3-sticker">
          <div className="brand">
            <BoltMark />
            RACKED
          </div>
          <div className="nfc">
            <Icon name="nfc" />
          </div>
          <div className="qr">
            {STICKER_DOTS.map((on, i) => (
              <i key={i} className={on ? "" : "o"} />
            ))}
          </div>
          <small>TAP OR SCAN</small>
          <b>01 · Lat Pulldown</b>
        </div>
        <div className="tv3-rings">
          <i />
          <i />
          <i />
        </div>
        <div className="tv3-float f2">
          <div className="tv3-card">
            <span className="ok">
              <i>
                <Icon name="check" />
              </i>
              Set logged
            </span>
            <b>
              50<small>kg</small> × 10
            </b>
          </div>
        </div>
        <div className="tv3-float f3">
          <div className="tv3-card">
            <b>#2</b>
            <span>You&apos;re on the board</span>
          </div>
        </div>
        <div className="tv3-float f4">
          <div className="tv3-card">
            <PrizePhoto src={prize?.image_url} className="ph" />
            <small>{prize ? "#1 wins" : "Every week"}</small>
            <b>{prize ? prize.title : "Prizes"}</b>
            {brand && (
              <span>
                <BrandMark brand={brand} />
                {brand.name}
              </span>
            )}
          </div>
        </div>
        <div className="tv3-phone">
          <div className="scr">
            {HOW_SCREENS.map((n, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={n} className={`s${i + 1}`} src={`/tv/how/${n}.webp`} alt="" />
            ))}
            <div className="flash" />
            <div className="tv3-tap" />
            <div className="tv3-hl" />
          </div>
          <div className="isl" />
        </div>
      </div>
      <div className="tv3-right">
        <div className="tv-eyebrow">How it works · no app needed</div>
        <ol className="tv3-steps">
          {steps.map((s, i) => (
            <li key={s.title} className={`k${i + 1}`}>
              <span>
                <Icon name={s.icon} />
              </span>
              <div>
                <div className="t">{s.title}</div>
                <div className="d">{s.sub}</div>
              </div>
              <i className="bar" />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ---- A machine's top 3: Men | Women by ×BW (0015) ------------------------------
function BoardSlideBw({ board, period }: { board: TvBoard; period: Period }) {
  const word = PERIOD_WORD[period];
  const col = (label: string, list: TvBoard["men"], key: string) => {
    const rows = list.slice(0, 3);
    const open = Math.max(0, 3 - rows.length);
    return (
      <div className="tv-bwcol" data-testid={`tv-board-${key}`}>
        <div className="tv-bwcol-head">{label}</div>
        <ol className="tv-mrows">
          {rows.map((e, i) => (
            <li key={`${e.name}-${i}`} className={`tv-mrow${e.bestEver ? " ever" : ` r${Math.min(e.rank, 3)}`}`} style={{ ["--d" as string]: `${0.12 + i * 0.12}s` }}>
              <span className="rk">{e.bestEver ? <Icon name="star" /> : e.rank}</span>
              <span className="nm">
                {e.name}
                {e.bestEver && <small className="tag">Best ever</small>}
              </span>
              <span className="lift">
                {e.ratio != null ? Math.round(e.ratio * 100) : "–"}
                <small>score</small>
              </span>
            </li>
          ))}
          {Array.from({ length: open }, (_, i) => (
            <li key={`open-${i}`} className="tv-mrow open" style={{ ["--d" as string]: `${0.12 + (rows.length + i) * 0.12}s` }}>
              <span className="rk">{rows.length + i + 1}</span>
              <span className="nm">Open</span>
              <span className="lift">Be next</span>
            </li>
          ))}
        </ol>
      </div>
    );
  };
  const lead = [board.men.find((e) => !e.bestEver), board.women.find((e) => !e.bestEver)].filter(Boolean) as TvBoard["men"];
  return (
    <section className="tv-slide tv-mboard bw" data-testid="slide-board">
      <div className="tv-mboard-side">
        <div className="tv-machine-no" aria-hidden>
          {board.machineNumber}
        </div>
        <div className="tv-eyebrow">{period === "all" ? "All-time top 3" : `Top 3 ${word}`}</div>
        <h2 className="tv-machine-name">{board.title}</h2>
        <div className="tv2-beat" data-testid="tv-beat">
          {lead.length && lead[0].ratio != null ? (
            <>
              Beat <b>{lead[0].name}&apos;s {Math.round(lead[0].ratio * 100)}</b>
            </>
          ) : (
            <>
              Take <b>#1 on {board.machineNumber}</b>
            </>
          )}
        </div>
      </div>
      <div className="tv-bwcols">
        {col("Men", board.men, "men")}
        {col("Women", board.women, "women")}
        <div className="tv2-fair" data-testid="tv-fair">
          <Icon name="scale" />
          <span>Fair for every size</span>
          <em>Score = kg ÷ body weight × 100</em>
        </div>
      </div>
    </section>
  );
}

// ---- A machine's top 3 -------------------------------------------------------
function BoardSlide({ board, period }: { board: TvBoard; period: Period }) {
  const unit = board.unit.toLowerCase();
  const rows = board.entries.slice(0, 3);
  const open = Math.max(0, 3 - rows.length);
  const leader = rows.find((e) => !e.bestEver);
  const record = rows.find((e) => e.bestEver);
  const target = leader || record;
  const word = PERIOD_WORD[period];
  return (
    <section className="tv-slide tv-mboard" data-testid="slide-board">
      <div className="tv-mboard-side">
        <div className="tv-machine-no" aria-hidden>
          {board.machineNumber}
        </div>
        <div className="tv-eyebrow">{period === "all" ? "All-time top 3" : `Top 3 ${word}`}</div>
        <h2 className="tv-machine-name">{board.title}</h2>
        {target && (
          <div className="tv-beat" data-testid="tv-beat">
            <small>{leader ? `Beat ${leader.name}?` : `Nobody yet ${word}. Beat the best ever?`}</small>
            <b>
              {fmtKg(target.weight)} {unit} × {target.reps}
            </b>
            <span>Tap or scan the sticker on machine {board.machineNumber}</span>
          </div>
        )}
      </div>
      <ol className="tv-mrows">
        {rows.map((e, i) => (
          <li key={`${e.name}-${i}`} className={`tv-mrow${e.bestEver ? " ever" : ` r${Math.min(e.rank, 3)}`}`} style={{ ["--d" as string]: `${0.12 + i * 0.12}s` }}>
            <span className="rk">{e.bestEver ? <Icon name="star" /> : e.rank}</span>
            <span className="nm">
              {e.name}
              {e.bestEver && <small className="tag">Best ever</small>}
            </span>
            <span className="lift">
              {fmtKg(e.weight)}
              <small>{unit}</small> × {e.reps}
            </span>
          </li>
        ))}
        {Array.from({ length: open }, (_, i) => (
          <li key={`open-${i}`} className="tv-mrow open" style={{ ["--d" as string]: `${0.12 + (rows.length + i) * 0.12}s` }}>
            <span className="rk">{rows.length + i + 1}</span>
            <span className="nm">Open</span>
            <span className="lift">Be next</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---- The gym today: one big number ------------------------------------------
function TodaySlide({ data, period }: { data: TvData; period: Period }) {
  const split = data.activity.split;
  const max = Math.max(split.push, split.pull, split.legs);
  return (
    <section className="tv-slide tv-split" data-testid="slide-today">
      <div className="tv-eyebrow">{period === "today" ? "Today at the gym" : `${PERIOD_WORD[period][0].toUpperCase()}${PERIOD_WORD[period].slice(1)} at the gym`}</div>
      <div className="tv-split-row">
        {SPLITS.map((x, i) => (
          <div
            key={x.id}
            className={`tv-split-card${max > 0 && split[x.id] === max ? " top" : ""}`}
            style={{ ["--d" as string]: `${i * 0.12}s` }}
            data-testid={`tv-split-${x.id}`}
          >
            <span className="tv-split-word">{x.label}</span>
            <b className="tv-split-n">
              <CountUp value={split[x.id]} duration={1100} />
            </b>
            <span className="tv-split-l">{split[x.id] === 1 ? "person" : "people"}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---- This week's prizes: a card per prize, the countdown, who's leading -------
function PrizeCard({ p, feed }: { p: Prize; feed: TvFeed }) {
  const brands = prizeBrands(p, feed);
  const photo = !!p.image_url;
  return (
    <div className={`tv2-pcard${photo ? "" : " coupon"}`} data-testid="tv-prize-card">
      {photo && <PrizePhoto src={p.image_url} className="ph" />}
      <span className={`tv2-rank r${Math.min(p.rank_from, 3)}`}>{prizeRankLabel(p)}</span>
      <div className="cap">
        <b>{p.title}</b>
        {brands.length === 1 ? (
          <span>
            <BrandMark brand={brands[0]} />
            {brands[0].name}
          </span>
        ) : brands.length > 1 ? (
          <span>{brands.map((b) => b.name).join(" · ")}</span>
        ) : null}
      </div>
    </div>
  );
}

function PrizeSlide({ feed, now }: { feed: TvFeed; now: number }) {
  const season = feed.season!;
  const prizes = [...season.prizes].sort((a, b) => a.rank_from - b.rank_from).slice(0, 3);
  const first = prizes[0];
  const word = season.period === "month" ? "month" : "week";
  const leader = feed.top[0] || (season.leader ? { name: season.leader.name, score: season.leader.score } : null);
  const ends = now ? timeLeft(season.ends_at, now) : "";
  const tops = feed.tops;
  const who = tops ? "#1 Men & #1 Women each win" : first && !(first.rank_from === 1 && first.rank_to === 1) ? `${prizeRankLabel(first)} win` : "#1 wins";
  return (
    <section className="tv-slide tv2-prize" data-testid="slide-prizes">
      <div className="tv2-prize-top">
        <div>
          <div className="tv-eyebrow">{who}</div>
          <h2>
            {feed.prizeHeadline || (
              <>
                This {word}&apos;s <span className="tv-grad">prizes</span>
              </>
            )}
          </h2>
        </div>
        {ends && (
          <div className="tv2-count" data-testid="tv-prize-ends">
            <small>Ends in </small>
            <b>{ends}</b>
          </div>
        )}
      </div>
      <div className={`tv2-pcards n${prizes.length}`}>
        {prizes.map((p) => (
          <PrizeCard key={p.id} p={p} feed={feed} />
        ))}
      </div>
      <div className="tv2-leads" data-testid="tv-prize-leader">
        {tops ? (
          (["men", "women"] as const).map((d) => (
            <div key={d}>
              <small>{d === "men" ? "Men" : "Women"}</small>
              {tops[d][0] ? (
                <span>
                  <Icon name="flame" /> <b>{tops[d][0].name}</b> {Math.round(tops[d][0].score).toLocaleString("en-IN")} <em>pts</em>
                </span>
              ) : (
                <span>Wide open</span>
              )}
            </div>
          ))
        ) : (
          <div>
            <Icon name="flame" />
            {leader ? (
              <span>
                <b>{leader.name}</b> is winning · {Math.round(leader.score).toLocaleString("en-IN")} XP
              </span>
            ) : (
              <span>Nobody yet. Your first set takes #1.</span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

// ---- A challenge (live, or coming up): the brand first, the prize, who leads ---
function ChallengeSlide({ challenge: c, feed, now }: { challenge: Challenge; feed: TvFeed | null; now: number }) {
  const st = challengeStatus(c, now || Date.now());
  const m = c.machine_id ? MACHINE_MAP[c.machine_id] : null;
  const brand = c.sponsor_id ? feed?.sponsors.find((s) => s.id === c.sponsor_id) : null;
  const bw = !!c.leaders || !!c.last_result?.winners;
  const rule = bw
    ? c.metric === "best_lift"
      ? "Best set for your size wins"
      : c.metric === "sets"
        ? "Most sets wins"
        : "Most kilos for your size wins"
    : c.metric === "best_lift"
      ? "Heaviest set wins"
      : c.metric === "sets"
        ? "Most sets wins"
        : "Most kilos wins";
  const chip = st.live ? `Live now · ends in ${timeLeft(c.ends_at, now || Date.now())}` : c.repeats === "weekly" && c.weekday ? `Every ${weekdayName(c.weekday)}` : st.label;
  const words = c.title.trim().split(/\s+/);
  const last = words.length > 1 ? words.pop() : null;
  const size = c.title.length <= 18 ? "6.2em" : c.title.length <= 28 ? "5em" : "4em";
  // "A goodie bag from The Clean Crate" -> "A goodie bag" + "from The Clean Crate"
  let prizeMain = c.prize || "";
  let prizeFrom = "";
  if (brand && prizeMain.toLowerCase().endsWith(` from ${brand.name.toLowerCase()}`)) {
    prizeMain = prizeMain.slice(0, -` from ${brand.name}`.length);
    prizeFrom = `from ${brand.name}`;
  } else if (brand) prizeFrom = `with ${brand.name}`;
  prizeMain = prizeMain.charAt(0).toUpperCase() + prizeMain.slice(1);
  const photo = brand ? brand.products.find((x) => x.image_url)?.image_url || brand.cover_url || null : null;
  const leads = (list: { men: DivLeader; women: DivLeader }, tag: string) => (
    <div className="tv2-chal-leads">
      {(["men", "women"] as const).map((d) => {
        const l = list[d];
        return (
          <div key={d}>
            <small>
              {d === "men" ? "Men" : "Women"} · {tag}
            </small>
            <b>{l ? l.name : tag === "leading" ? "Nobody yet" : "Nobody"}</b>
            <span>{l ? metricValue(c.metric, Number(l.value), l.reps, true) : tag === "leading" ? "First set takes it" : ""}</span>
          </div>
        );
      })}
    </div>
  );
  const one = (small: string, name: string, value: string) => (
    <div className="tv2-chal-leads one">
      <div>
        <small>{small}</small>
        <b>{name}</b>
        <span>{value}</span>
      </div>
    </div>
  );
  return (
    <section className="tv-slide tv2-chal" data-testid="slide-challenge">
      <div className="tv2-chal-main">
        {brand && (
          <div className="tv2-presents" data-testid="tv-chal-brand">
            <BrandMark brand={brand} className="big" />
            <div>
              <small>Presented by</small>
              <b>{brand.name}</b>
            </div>
          </div>
        )}
        <h2 className="tv2-chal-title" style={{ fontSize: size }}>
          {words.join(" ")}
          {last && (
            <>
              {" "}
              <span className="tv-grad">{last}</span>
            </>
          )}
        </h2>
        <div className="tv2-chips">
          <span className={`tv-chip${st.live ? " live" : ""}`} data-testid="tv-chal-status">
            {st.live && <i />}
            {chip}
          </span>
          {m && <span className="tv-chip">Machine {m.number}</span>}
          <span className="tv-chip">{rule}</span>
        </div>
      </div>
      <div className="tv2-chal-side">
        {c.prize && (
          <div className="tv2-win">
            <PrizePhoto src={photo} className="ph" />
            <div>
              <small>Win</small>
              <b>{prizeMain}</b>
              {prizeFrom && <span>{prizeFrom}</span>}
            </div>
          </div>
        )}
        <div className="tv2-chal-lead" data-testid="tv-chal-leader">
          {bw && st.live && c.leaders
            ? leads(c.leaders, "leading")
            : bw && !st.live && c.last_result?.winners
              ? leads(c.last_result.winners, "last winner")
              : st.live && c.leader
                ? one("Leading now", c.leader.name, metricValue(c.metric, Number(c.leader.value), c.leader.reps))
                : !st.live && c.last_result
                  ? one("Last winner", c.last_result.name, metricValue(c.metric, Number(c.last_result.value), c.last_result.reps))
                  : one(st.live ? "Leading now" : "Starts soon", st.live ? "Nobody yet" : st.label.replace(/^Starts /, ""), st.live ? "First set takes the lead" : "Be ready")}
        </div>
      </div>
    </section>
  );
}

// ---- Partner ad: big photo, brand, product, website + QR --------------------
// A brand that gives a prize gets a "Prize partner" badge. No product photo:
// the photo of the prize they give, with their name big in the background.
function PartnerSlide({ partner: p, product, origin, feed }: { partner: TvPartner; product: SponsorProduct | null; origin: string; feed: TvFeed | null }) {
  const own = product?.image_url || p.cover_url || null;
  const prize = (feed?.season?.prizes || []).filter((x) => (x.sponsor_ids || []).includes(p.id)).sort((a, b) => a.rank_from - b.rank_from)[0] || null;
  const prizePhoto = !own && prize?.image_url ? prize.image_url : null;
  const host = siteHost(product?.url || p.website_url);
  const headline = p.tv_headline || p.tagline || null;
  const link = origin && (product?.url || p.website_url) ? tvPartnerLink(origin, p.id, product?.id) : null;
  return (
    <section className={`tv-slide tv-ad${own ? "" : " no-photo"}${prizePhoto ? " prize-photo" : ""}`} data-testid="slide-partner">
      {own ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="tv-ad-bg" src={own} alt="" onError={(e) => (e.currentTarget.style.display = "none")} />
      ) : (
        <div className="tv2-poster" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i}>
              {p.name} {p.name}
            </span>
          ))}
        </div>
      )}
      {prizePhoto && <PrizePhoto src={prizePhoto} className="tv2-adprod" />}
      <div className="tv-ad-shade" aria-hidden />
      <div className="tv-ad-copy tv2-adcopy">
        {prize && (
          <div className="tv2-badge" data-testid="tv-ad-prize">
            <Icon name="star" /> Prize partner · {prizeRankLabel(prize)} {prize.title}
          </div>
        )}
        <div className="tv-ad-brand tv2-adlogo">
          <BrandMark brand={p} />
          <span data-testid="tv-ad-brand">{p.name}</span>
        </div>
        {headline && <h2 className="tv-ad-head">{headline}</h2>}
        {product && (
          <div className="tv-ad-product" data-testid="tv-ad-product">
            <b>{product.title}</b>
            {product.price_text && <span>{product.price_text}</span>}
          </div>
        )}
        {!prize && <div className="tv-ad-tag">Racked partner</div>}
      </div>
      {link && (
        <div className="tv-ad-qr" data-testid="tv-ad-qr">
          <QrCode value={link} className="tv-qr" label={`QR code to visit ${p.name}`} />
          <b>Scan to shop</b>
          {host && <span data-testid="tv-ad-site">{host}</span>}
        </div>
      )}
    </section>
  );
}

// ---- Last week's winners: a card each, with the prize and the brand -----------
type Winner = NonNullable<TvFeed["lastWinners"]>["winners"][number];

function WinCard({ w, label, feed }: { w: Winner; label: string; feed: TvFeed }) {
  const prize = w.prize ? (feed.season?.prizes || []).find((p) => p.title.trim().toLowerCase() === w.prize!.trim().toLowerCase()) || null : null;
  const brands = prize ? prizeBrands(prize, feed) : [];
  return (
    <div className={`tv2-wincard r${w.rank}`} data-testid="tv-win-card">
      <PrizePhoto src={prize?.image_url} className="ph" />
      <div>
        <small>{label}</small>
        <b>{w.name}</b>
        {w.prize && <span>{[w.prize, ...brands.map((b) => b.name)].join(" · ")}</span>}
      </div>
    </div>
  );
}

function WinnersSlide({ feed }: { feed: TvFeed }) {
  const lw = feed.lastWinners!;
  const split = lw.winners.some((w) => w.division === "men" || w.division === "women");
  const men = lw.winners.filter((w) => w.division === "men");
  const women = lw.winners.filter((w) => w.division === "women");
  const all = [...lw.winners].sort((a, b) => a.rank - b.rank);
  const firsts: { w: Winner; label: string }[] = split
    ? [
        ...(men[0] ? [{ w: men[0], label: "#1 Men" }] : []),
        ...(women[0] ? [{ w: women[0], label: "#1 Women" }] : []),
      ]
    : all.slice(0, 1).map((w) => ({ w, label: `#${w.rank}` }));
  const rest = split ? [men[1], women[1]].filter((w): w is Winner => !!w) : all.slice(1, 3);
  const samePrize = rest.length > 0 && rest.every((w) => w.prize && w.prize === rest[0].prize);
  return (
    <section className="tv-slide tv2-winners" data-testid="slide-winners">
      <div className="tv-eyebrow">{lw.season} · winners</div>
      <h2 className="tv-title">
        Well lifted, <span className="tv-grad">{firsts.map((x) => x.w.name).join(" & ")}!</span>
      </h2>
      <div className={`tv2-wincards n${firsts.length}`}>
        {firsts.map((x) => (
          <WinCard key={x.label} w={x.w} label={x.label} feed={feed} />
        ))}
      </div>
      {rest.length > 0 && (
        <div className="tv2-also" data-testid="tv-win-rest">
          {split || samePrize ? (
            <span>
              {split ? "#2 " : ""}
              {rest.map((w, i) => (
                <span key={`${w.rank}-${w.name}`}>
                  {i > 0 && " & "}
                  {!split && `#${w.rank} `}
                  <b>{w.name}</b>
                </span>
              ))}
              {samePrize && ` · ${rest[0].prize}`}
            </span>
          ) : (
            rest.map((w) => (
              <span key={`${w.rank}-${w.name}`}>
                #{w.rank} <b>{w.name}</b>
                {w.prize ? ` · ${w.prize}` : ""}
              </span>
            ))
          )}
        </div>
      )}
      <div className="tv2-next">
        This week&apos;s race is on. <b>You could be next.</b>
      </div>
    </section>
  );
}

// ---- Nobody has lifted yet anywhere ------------------------------------------
function OpenSlide({ period }: { period: Period }) {
  return (
    <section className="tv-slide tv-open" data-testid="slide-open">
      <div>
        <div className="tv-eyebrow">Leaderboards {PERIOD_WORD[period]}</div>
        <h2 className="tv-title">
          Every board is <span className="tv-grad">wide open.</span>
        </h2>
        <p className="tv-sub">Log one set on any machine and you&apos;re #1 on its board, right here on this screen.</p>
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
