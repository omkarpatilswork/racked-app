"use client";

// Gym TV screen. Open https://<your-site>/tv on the TV's browser, press F (or
// double-click) for full screen, and leave it. No login: it only shows first
// names, best lifts and anonymous counts (see supabase/migrations/0005, 0013).
//
// Built to teach and to pull people in, with very little text per slide:
//   Join (big QR) · How it works · a machine's top 3 · the gym today ·
//   this week's prize · challenges · partner ads · last week's winners.
// How often each shows and for how long is set in R&R Controls -> TV
// (lib/tvSlides.ts has the running order rules). A small "scan to join" QR
// sits in the corner of every slide except Join and the partner ads (which
// have their own QR).
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

  const stale = lastOkRef.current > 0 && now - lastOkRef.current > STALE_MS;
  const clock = now ? new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  const host = origin ? new URL(origin).host : "";
  const ownQr = current?.kind === "join" || current?.kind === "partner";

  let body: ReactNode;
  if (!current || !data) {
    body = (
      <div className="tv-splash">
        <span className="tv-dot big" />
        Loading the floor…
      </div>
    );
  } else if (current.kind === "join") body = <JoinSlide key={current.key} data={data} joinUrl={joinUrl} host={host} period={period} />;
  else if (current.kind === "howto") body = <HowToSlide key={current.key} />;
  else if (current.kind === "today") body = <TodaySlide key={current.key} data={data} period={period} />;
  else if (current.kind === "open") body = <OpenSlide key={current.key} period={period} />;
  else if (current.kind === "board") body = <BoardSlide key={current.key} board={current.board} period={period} />;
  else if (current.kind === "prize" && feed?.season) body = <PrizeSlide key={current.key} feed={feed} now={now} />;
  else if (current.kind === "challenge") body = <ChallengeSlide key={current.key} challenge={current.challenge} feed={feed} now={now} />;
  else if (current.kind === "partner") body = <PartnerSlide key={current.key} partner={current.partner} product={current.product} origin={origin} />;
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
        <div className="tv-foot-msg">Tap or scan the sticker on any machine to log your set</div>
      </footer>

      {current && !ownQr && joinUrl && (
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

// ---- Join: one line, one big QR code --------------------------------------
function JoinSlide({ data, joinUrl, host, period }: { data: TvData; joinUrl: string; host: string; period: Period }) {
  const { lifters, pbs } = data.activity;
  return (
    <section className="tv-slide tv-join" data-testid="slide-join">
      <div className="tv-join-copy">
        <div className="tv-eyebrow">New here? It&apos;s free</div>
        <h1 className="tv-hero">
          Get your name
          <br />
          <span className="tv-grad">on this screen.</span>
        </h1>
        <p className="tv-lede">Sign in with Google, then tap or scan the sticker on any machine.</p>
        <div className="tv-proof" data-testid="tv-proof">
          <Icon name="flame" />
          {lifters > 0
            ? `${lifters} ${lifters === 1 ? "lifter is" : "lifters are"} on the boards ${PERIOD_WORD[period]}${pbs > 0 ? ` · ${pbs} new PB${pbs === 1 ? "" : "s"}` : ""}`
            : `Nobody's lifted yet ${PERIOD_WORD[period]}. The first set takes #1`}
        </div>
      </div>
      <div className="tv-join-qr">
        <div className="tv-qr-card">
          {joinUrl && <QrCode value={joinUrl} className="tv-qr" label="QR code to join Racked" />}
          <div className="tv-qr-cta">Scan with your camera</div>
          <div className="tv-qr-url">{host}/join</div>
        </div>
        <div className="tv-qr-badge">Free · No app download</div>
      </div>
    </section>
  );
}

// ---- How it works: three big steps that light up in turn -------------------
function HowToSlide() {
  const steps: { icon: "nfc" | "dumbbell" | "trophy"; title: string; sub: string }[] = [
    { icon: "nfc", title: "Tap or scan the sticker", sub: "On any machine" },
    { icon: "dumbbell", title: "Log your set", sub: "Weight and reps" },
    { icon: "trophy", title: "Climb the board", sub: "Your best shows up here" },
  ];
  return (
    <section className="tv-slide tv-howto" data-testid="slide-howto">
      <div className="tv-howto-head">
        <div className="tv-eyebrow">How it works</div>
        <h2 className="tv-title">
          Tap. Log. <span className="tv-grad">Climb.</span>
        </h2>
      </div>
      <ol className="tv-howto-steps">
        {steps.map((s, i) => (
          <li key={s.title} style={{ ["--i" as string]: i }}>
            <span className="tv-howto-n">{i + 1}</span>
            <span className="tv-howto-ic">
              <Icon name={s.icon} />
            </span>
            <b>{s.title}</b>
            <span>{s.sub}</span>
          </li>
        ))}
      </ol>
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

// ---- This week's prize -------------------------------------------------------
function PrizeSlide({ feed, now }: { feed: TvFeed; now: number }) {
  const season = feed.season!;
  const [first, second] = season.prizes;
  const word = season.period === "month" ? "month" : "week";
  const leader = feed.top[0] || (season.leader ? { name: season.leader.name, score: season.leader.score } : null);
  const ends = now ? timeLeft(season.ends_at, now) : "";
  return (
    <section className={`tv-slide tv-prize2${first?.image_url ? "" : " no-photo"}`} data-testid="slide-prizes">
      <div className="tv-prize2-photo" aria-hidden>
        {first?.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={first.image_url} alt="" onError={(e) => (e.currentTarget.style.display = "none")} />
        ) : null}
        <Icon name="gift" />
      </div>
      <div className="tv-prize2-copy">
        <div className="tv-eyebrow">
          {feed.prizeHeadline || `This ${word}'s prize`}
          {ends ? ` · ends in ${ends}` : ""}
        </div>
        <h2 className="tv-title">
          {first && !(first.rank_from === 1 && first.rank_to === 1) ? `${prizeRankLabel(first)} win` : "#1 wins"}
          <br />
          <span className="tv-grad" style={first && first.title.length > 34 ? { fontSize: "0.74em" } : undefined}>
            {first ? first.title : "a prize"}
          </span>
        </h2>
        <div className="tv-prize2-lead" data-testid="tv-prize-leader">
          <Icon name="flame" />
          {leader ? (
            <span>
              <b>{leader.name}</b> is winning · {Math.round(leader.score).toLocaleString("en-IN")} XP
            </span>
          ) : (
            <span>Nobody yet. Your first set takes #1.</span>
          )}
        </div>
        <p className="tv-sub">
          Every set earns XP. Most XP this {word} wins.
          {second ? ` ${prizeRankLabel(second)}: ${second.title}.` : ""}
        </p>
      </div>
    </section>
  );
}

// ---- A challenge (live, or coming up) ---------------------------------------
function ChallengeSlide({ challenge: c, feed, now }: { challenge: Challenge; feed: TvFeed | null; now: number }) {
  const st = challengeStatus(c, now || Date.now());
  const m = c.machine_id ? MACHINE_MAP[c.machine_id] : null;
  const brand = c.sponsor_id ? feed?.sponsors.find((s) => s.id === c.sponsor_id) : null;
  const machineName = m ? (c.mode && m.modes?.[c.mode] ? m.modes[c.mode].label : m.name) : null;
  const rule =
    c.metric === "best_lift" ? `Heaviest ${machineName ? `${machineName} ` : ""}set wins` : c.metric === "sets" ? `Most sets${machineName ? ` on ${machineName}` : ""} wins` : `Most kilos${machineName ? ` on ${machineName}` : ""} wins`;
  const chip = st.live ? `Live now · ends in ${timeLeft(c.ends_at, now || Date.now())}` : c.repeats === "weekly" && c.weekday ? `Every ${weekdayName(c.weekday)}` : st.label;
  return (
    <section className="tv-slide tv-chal" data-testid="slide-challenge">
      <div className="tv-chal-copy">
        <div className={`tv-chip${st.live ? " live" : ""}`} data-testid="tv-chal-status">
          {st.live && <i />}
          {chip}
        </div>
        <h2 className="tv-title" style={c.title.length > 30 ? { fontSize: "3.3em" } : undefined}>
          {c.title}
        </h2>
        <div className="tv-chal-rule">{rule}</div>
        {c.prize && (
          <div className="tv-chal-prize">
            <Icon name="gift" />
            <span>
              Win <b>{c.prize.replace(/^an? /i, (x) => x.toLowerCase())}</b>
            </span>
          </div>
        )}
      </div>
      <div className="tv-chal-side">
        {m && (
          <div className="tv-chal-machine">
            <span>Machine</span>
            <b>{m.number}</b>
          </div>
        )}
        <div className="tv-chal-lead" data-testid="tv-chal-leader">
          {st.live && c.leader ? (
            <>
              <small>Leading now</small>
              <b>{c.leader.name}</b>
              <span>{metricValue(c.metric, Number(c.leader.value), c.leader.reps)}</span>
            </>
          ) : !st.live && c.last_result ? (
            <>
              <small>Last winner</small>
              <b>{c.last_result.name}</b>
              <span>{metricValue(c.metric, Number(c.last_result.value), c.last_result.reps)}</span>
            </>
          ) : (
            <>
              <small>{st.live ? "Leading now" : "Starts soon"}</small>
              <b>{st.live ? "Nobody yet" : st.label.replace(/^Starts /, "")}</b>
              <span>{st.live ? "First set takes the lead" : "Be ready"}</span>
            </>
          )}
        </div>
        {brand && (
          <div className="tv-chal-brand">
            {brand.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logo_url} alt="" onError={(e) => (e.currentTarget.style.display = "none")} />
            )}
            <span>with {brand.name}</span>
          </div>
        )}
      </div>
    </section>
  );
}

// ---- Partner ad: big photo, brand, product, website + QR --------------------
function PartnerSlide({ partner: p, product, origin }: { partner: TvPartner; product: SponsorProduct | null; origin: string }) {
  const photo = product?.image_url || p.cover_url || null;
  const host = siteHost(product?.url || p.website_url);
  const headline = p.tv_headline || p.tagline || null;
  const link = origin && (product?.url || p.website_url) ? tvPartnerLink(origin, p.id, product?.id) : null;
  return (
    <section className={`tv-slide tv-ad${photo ? "" : " no-photo"}`} data-testid="slide-partner">
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="tv-ad-bg" src={photo} alt="" onError={(e) => (e.currentTarget.style.display = "none")} />
      )}
      <div className="tv-ad-shade" aria-hidden />
      <div className="tv-ad-copy">
        <div className="tv-ad-brand">
          {p.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.logo_url} alt="" onError={(e) => (e.currentTarget.style.display = "none")} />
          )}
          <span data-testid="tv-ad-brand">{p.name}</span>
        </div>
        {headline && <h2 className="tv-ad-head">{headline}</h2>}
        {product && (
          <div className="tv-ad-product" data-testid="tv-ad-product">
            <b>{product.title}</b>
            {product.price_text && <span>{product.price_text}</span>}
          </div>
        )}
        <div className="tv-ad-tag">Racked partner</div>
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

// ---- Last week's winners ------------------------------------------------------
function WinnersSlide({ feed }: { feed: TvFeed }) {
  const lw = feed.lastWinners!;
  const top = lw.winners.slice(0, 3);
  return (
    <section className="tv-slide tv-win" data-testid="slide-winners">
      <div className="tv-win-head">
        <div className="tv-eyebrow">{lw.season} · winners</div>
        <h2 className="tv-title">
          Well lifted, <span className="tv-grad">{top[0].name}!</span>
        </h2>
      </div>
      <div className="tv-win-row">
        {top.map((w, i) => (
          <div key={w.rank} className={`tv-win-card r${w.rank}`} style={{ ["--d" as string]: `${0.1 + i * 0.12}s` }}>
            <span className="tv-win-rank">#{w.rank}</span>
            <b>{w.name}</b>
            {w.prize && <span className="tv-win-prize">{w.prize}</span>}
          </div>
        ))}
      </div>
      <p className="tv-sub">This week&apos;s race is on. You could be next.</p>
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
