"use client";

// Rewards v2 (Nov 2026): the Win tab, kept simple.
//   PrizeLadder      this week's prizes: a big #1 photo, single places as rows,
//                    ranges (#3–10) as coupon rows. Photos from R&R, else the
//                    partner's product photo, else a branded tile.
//   RaceCard         your place in the race + "See the full race in Ranks"
//                    (the full board lives on Ranks, not here)
//   SpecialChallenge the one weekly challenge: day, machine, what counts, what
//                    winners get, and its own Men / Women board (top 5 + you)
//   LastWinnersLine  last week's winners in one line, tap for the list
// Brand names link to their card on the Partners tab (?tab=partners&brand=…).
import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import Icon from "@/components/Icon";
import Sheet from "@/components/Sheet";
import { WinnersCard, type SponsorMap } from "@/components/rewards/parts";
import { openBodySheet } from "@/lib/body";
import type { Database } from "@/lib/database.types";
import { MACHINE_MAP } from "@/lib/machines";
import {
  challengeStatus,
  fetchChallengeBoard,
  fmtXp,
  metricLabel,
  prizeRankLabel,
  timeLeft,
  weekdayName,
  type Challenge,
  type ChallengeRow,
  type MyRewards,
  type Prize,
  type RewardsOverview,
} from "@/lib/rewards";

type Client = SupabaseClient<Database>;
type Race = "men" | "women";

export const brandHref = (id: string) => `/rewards?tab=partners&brand=${encodeURIComponent(id)}`;

// "Jersey Drip × The Clean Crate", each a link to its Partners card
export function BrandLinks({ ids, sponsors, chevron = false, className = "" }: { ids: (string | null | undefined)[]; sponsors: SponsorMap; chevron?: boolean; className?: string }) {
  const list = ids.filter((id): id is string => !!id && !!sponsors[id]);
  if (!list.length) return null;
  return (
    <span className={`rw2-brands ${className}`}>
      {list.map((id, i) => (
        <Fragment key={id}>
          {i > 0 && <span aria-hidden="true"> × </span>}
          <Link href={brandHref(id)} className="rw2-brandlink" data-testid={`brand-link-${id}`}>
            {sponsors[id].name}
            {chevron && list.length === 1 && <Icon name="chev" />}
          </Link>
        </Fragment>
      ))}
    </span>
  );
}

function photoFor(p: Prize, sponsors: SponsorMap) {
  if (p.image_url) return p.image_url;
  for (const id of p.sponsor_ids || []) {
    const img = sponsors[id]?.products?.find((x) => x.image_url)?.image_url;
    if (img) return img;
  }
  return null;
}

function PrizePhoto({ p, sponsors, rankClass, big = false }: { p: Prize; sponsors: SponsorMap; rankClass: string; big?: boolean }) {
  const src = photoFor(p, sponsors);
  const brand = (p.sponsor_ids || []).map((id) => sponsors[id]?.name).filter(Boolean)[0];
  return (
    <div className={`rw2-tile${big ? " rw2-tile-big" : ""}${src ? "" : " empty"}`}>
      {src ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="rw2-blur" src={src} alt="" aria-hidden="true" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="rw2-img" src={src} alt={p.title} loading="lazy" />
        </>
      ) : (
        <span className="rw2-fallback" aria-hidden="true">
          <Icon name="gift" />
          {big && brand && <small>{brand}</small>}
        </span>
      )}
      {big && <span className={`rw2-rank ${rankClass}`}>{prizeRankLabel(p)}</span>}
    </div>
  );
}

export function PrizeLadder({ ov, sponsors, now, strength }: { ov: RewardsOverview; sponsors: SponsorMap; now: number; strength: boolean }) {
  const season = ov.season;
  if (!season) return null;
  const prizes = [...(season.prizes || [])].sort((a, b) => a.rank_from - b.rank_from);
  const word = season.period === "month" ? "month" : "week";
  const headline = ov.settings?.prize_headline || (strength ? "Men’s & Women’s each win" : `Top of the ${word} wins`);
  if (!prizes.length) {
    return (
      <section className="rw2-card rw2-prizes" data-testid="rw-prize">
        <div className="rw2-head">
          <span className="rw2-eyebrow">This {word}&rsquo;s prizes</span>
        </div>
        <p className="rw2-foot" style={{ marginTop: 8 }}>
          Prizes are coming soon.
        </p>
      </section>
    );
  }
  const [first, ...rest] = prizes;
  const firstHasPhoto = !!photoFor(first, sponsors);
  return (
    <section className="rw2-card rw2-prizes" data-testid="rw-prize" aria-labelledby="rw2-prizes-h">
      <div className="rw2-head">
        <span className="rw2-eyebrow" id="rw2-prizes-h">
          This {word}&rsquo;s prizes
        </span>
        <span className="rw2-time" data-testid="rw-countdown">
          <Icon name="timer" /> {timeLeft(season.ends_at, now)} left
        </span>
      </div>
      <h2 className="rw2-title" data-testid="rw-prize-headline">
        {headline.endsWith("each win") ? (
          <>
            {headline.replace(/each win$/, "")}
            <em>each win</em>
          </>
        ) : (
          headline
        )}
      </h2>

      <div className="rw2-p1" data-testid="prize-1">
        <PrizePhoto p={first} sponsors={sponsors} rankClass="r1" big />
        <div className="rw2-ptxt">
          <b>{first.title}</b>
          <BrandLinks ids={first.sponsor_ids} sponsors={sponsors} chevron />
        </div>
        {firstHasPhoto && <small className="rw2-note">Photo for reference. The prize you get may look different.</small>}
      </div>

      {rest.map((p) =>
        p.rank_to > p.rank_from ? (
          <div key={p.id} className="rw2-coupon" data-testid={`prize-${p.rank_from}`}>
            <span className="rw2-rank flat">{prizeRankLabel(p)}</span>
            <span className="rw2-coupon-t">
              <b>{p.title}</b>
              <small>
                <BrandLinks ids={p.sponsor_ids} sponsors={sponsors} className="sm" />
              </small>
            </span>
            <Icon name="ticket" />
          </div>
        ) : (
          <div key={p.id} className="rw2-p2" data-testid={`prize-${p.rank_from}`}>
            <PrizePhoto p={p} sponsors={sponsors} rankClass={`r${Math.min(p.rank_from, 3)}`} />
            <span className="rw2-p2txt">
              <span className={`rw2-rank inline r${Math.min(p.rank_from, 3)}`}>{prizeRankLabel(p)}</span>
              <b>{p.title}</b>
              <BrandLinks ids={p.sponsor_ids} sponsors={sponsors} chevron />
            </span>
          </div>
        )
      )}
      {ov.settings?.rewards_note && <p className="rw2-foot">{ov.settings.rewards_note}</p>}
    </section>
  );
}

const RACE_WORD: Record<Race, string> = { men: "Men’s", women: "Women’s" };

export function RaceCard({ ov, me, strength, signedIn }: { ov: RewardsOverview; me: MyRewards | null; strength: boolean; signedIn: boolean }) {
  const season = ov.season;
  if (!season) return null;
  const my = me?.season || null;
  const race: Race | null = (my?.division as Race | null) || (me?.body?.division === "men" || me?.body?.division === "women" ? me.body.division : null);
  const needsBody = strength && signedIn && !!me && me.body != null && me.body.body_kg == null;
  const open = strength && !!me?.body?.body_kg && me.body.division === "open";

  let title: string;
  let sub: string | null = null;
  if (!signedIn) {
    title = "Who's winning right now";
  } else if (needsBody) {
    title = "Add your body weight to race";
    sub = "Scores are for your size: kg lifted ÷ body weight × 100.";
  } else if (open) {
    title = "You're on the Everyone board";
    sub = "Prizes are for the Men's and Women's boards.";
  } else if (!my || !my.rank) {
    title = `Log a set to join the race`;
    sub = strength ? `Your best on each machine this ${season.period === "month" ? "month" : "week"} adds up.` : "Every set you log counts.";
  } else if (my.rank === 1) {
    title = strength && race ? `You're #1 on the ${RACE_WORD[race]} board` : "You're #1 this week";
    sub = "Hold on to it until the week ends.";
  } else {
    title = strength && race ? `You're #${my.rank} on the ${RACE_WORD[race]} board` : `You're #${my.rank} this week`;
    sub = my.ahead ? `${fmtXp(Math.max(1, my.ahead.score - my.score + 1))} points to pass ${my.ahead.name}` : null;
  }
  const leaders = strength ? season.leaders : null;
  const board = race || (strength ? "men" : null);

  return (
    <section className="rw2-card rw2-race" data-testid="rw-race">
      <div className="rw2-race-top">
        {my?.rank && !needsBody && !open ? <span className="rw2-race-rank num">#{my.rank}</span> : null}
        <span className="rw2-race-copy" data-testid="rw-you">
          <b>{title}</b>
          {sub && <small>{sub}</small>}
        </span>
        {needsBody && (
          <button type="button" className="btn btn-yellow btn-sm rw2-add" onClick={openBodySheet} data-testid="rw-add-body">
            Add
          </button>
        )}
      </div>
      <div className="rw2-leaders" data-testid="rw-leaders">
        {strength ? (
          (["men", "women"] as Race[]).map((r) => (
            <span key={r} className="rw2-leader" data-testid={`rw-leader-${r}`}>
              <Icon name="trophy" />
              <span>
                {r === "men" ? "Men" : "Women"}: {leaders?.[r] ? <><b>{leaders[r]!.name}</b> {fmtXp(leaders[r]!.score)}</> : <span>nobody yet</span>}
              </span>
            </span>
          ))
        ) : (
          <span className="rw2-leader" data-testid="rw-leader">
            <Icon name="trophy" />
            <span>
              #1 now: {season.leader ? <><b>{season.leader.name}</b> {fmtXp(season.leader.score)}</> : <span>nobody yet</span>}
            </span>
          </span>
        )}
      </div>
      <Link href={`/leaderboard${board ? `?board=${board}` : ""}`} className="rw2-link" data-testid="rw-race-link">
        See the full race in Ranks <Icon name="chev" />
      </Link>
    </section>
  );
}

const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function whenLabel(c: Challenge, now: number) {
  const s = new Date(c.starts_at);
  const e = new Date(c.ends_at);
  const allDay = e.getTime() - s.getTime() >= 23.5 * 3600000;
  const t = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: d.getMinutes() ? "2-digit" : undefined });
  const today = s.toDateString() === new Date(now).toDateString();
  return `${today ? "Today" : DAY[s.getDay()]} · ${allDay ? "all day" : `${t(s)}–${t(e)}`}`;
}
function countsLabel(c: Challenge, strength: boolean) {
  if (strength) return c.metric === "best_lift" ? "Best score for your size" : c.metric === "volume" ? "Most kg moved for your size" : "Most sets";
  return metricLabel(c.metric);
}
function rowValue(c: Challenge, r: { value: number; reps: number | null }, strength: boolean): { v: string; sub: string } {
  if (c.metric === "sets") return { v: String(Math.round(r.value)), sub: "sets" };
  if (strength) return { v: Math.round(r.value * 100).toLocaleString("en-IN"), sub: c.metric === "best_lift" && r.reps ? `× ${r.reps}` : "" };
  if (c.metric === "best_lift") return { v: `${Number(r.value.toFixed(2))} kg`, sub: r.reps ? `× ${r.reps}` : "" };
  return { v: `${Math.round(r.value).toLocaleString("en-IN")} kg`, sub: "" };
}

// The one special challenge: live, else the next one, else the last (a week).
export function pickChallenge(list: Challenge[], now: number) {
  const live = list.filter((c) => challengeStatus(c, now).live);
  if (live.length) return live.sort((a, b) => +new Date(a.ends_at) - +new Date(b.ends_at))[0];
  const next = list.filter((c) => new Date(c.starts_at).getTime() > now).sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
  if (next.length) return next[0];
  const past = list.filter((c) => new Date(c.ends_at).getTime() <= now && now - new Date(c.ends_at).getTime() < 7 * 86400000).sort((a, b) => +new Date(b.ends_at) - +new Date(a.ends_at));
  return past[0] || null;
}

export function SpecialChallenge({
  supabase,
  challenges,
  me,
  sponsors,
  strength,
  now,
  onShare,
  onSeeAll,
}: {
  supabase: Client;
  challenges: Challenge[];
  me: MyRewards | null;
  sponsors: SponsorMap;
  strength: boolean;
  now: number;
  onShare?: (c: Challenge, mine: { rank: number; value: number; reps: number | null }) => void;
  onSeeAll?: (c: Challenge, race: Race | null) => void;
}) {
  const c = useMemo(() => pickChallenge(challenges, now), [challenges, now]);
  const myRace: Race = (me?.season?.division as Race | null) || (me?.body?.division === "women" ? "women" : "men");
  const [race, setRace] = useState<Race>(myRace);
  useEffect(() => setRace(myRace), [myRace]);
  const [rows, setRows] = useState<ChallengeRow[] | null>(null);
  const id = c?.id;
  useEffect(() => {
    if (!id) return;
    let alive = true;
    setRows(null);
    fetchChallengeBoard(supabase, id, 20, strength ? race : undefined).then(
      (r) => alive && setRows(r),
      () => alive && setRows([])
    );
    return () => {
      alive = false;
    };
  }, [supabase, id, race, strength]);
  if (!c) return null;

  const st = challengeStatus(c, now);
  const sp = c.sponsor_id ? sponsors[c.sponsor_id] : null;
  const m = c.machine_id ? MACHINE_MAP[c.machine_id] : null;
  const side = m?.dual && c.mode && m.modes?.[c.mode] ? m.modes[c.mode].label : null;
  const machineName = m ? side || m.name : null;
  const mineAll = me?.challenges.find((x) => x.id === c.id && (!strength || !x.division || x.division === race)) || null;
  const top = (rows || []).slice(0, 5);
  const meRow = (rows || []).find((r) => r.is_me);
  const meOutside = meRow && !top.includes(meRow) ? meRow : null;
  const weekly = c.repeats === "weekly" || !!c.series_id;

  return (
    <section className="rw2-card rw2-chal" data-testid="rw-challenges" aria-labelledby="rw2-chal-h">
      <div className="rw2-brand">
        {sp && (
          <span className="rw2-logo" aria-hidden="true">
            {sp.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={sp.logo_url} alt="" />
            ) : (
              sp.name.slice(0, 1)
            )}
          </span>
        )}
        <span className="rw2-eyebrow rw2-brand-name">{sp ? <BrandLinks ids={[sp.id]} sponsors={sponsors} /> : "Special challenge"}</span>
        {weekly && <span className="rw2-every">Every {weekdayName(c.weekday) || DAY[new Date(c.starts_at).getDay()]}</span>}
      </div>
      <h2 className="rw2-title" id="rw2-chal-h">
        {c.title}
      </h2>
      <div className="rw2-chips">
        <span className="rw2-chip">
          <Icon name="timer" /> {whenLabel(c, now)}
        </span>
        {m && (
          <span className="rw2-chip">
            <Icon name="dumbbell" /> {m.number} {machineName}
          </span>
        )}
        <span className="rw2-chip">{countsLabel(c, strength)}</span>
      </div>
      {c.prize && (
        <div className="rw2-cprize" data-testid="chal-prize">
          <span className="rw2-cprize-ic" aria-hidden="true">
            <Icon name="gift" />
          </span>
          <span className="rw2-cprize-t">
            <small>Winners get</small>
            <b>{c.prize}</b>
            {sp && <BrandLinks ids={[sp.id]} sponsors={sponsors} chevron />}
          </span>
          <span className="rw2-cprize-who">
            {strength ? (
              <>
                #1 Men
                <br />
                #1 Women
              </>
            ) : c.winners > 1 ? (
              `Top ${c.winners}`
            ) : (
              "#1"
            )}
          </span>
        </div>
      )}
      <div className={`rw2-live${st.live ? " on" : ""}`} data-testid="chal-status">
        {st.live && <i aria-hidden="true" />}
        {st.label}
      </div>

      <div className="rw2-board" data-testid="chal-board">
        <div className="rw2-board-head">
          <span className="rw2-eyebrow">{st.ended ? "Final board" : "Leaderboard"}</span>
          {strength && (
            <span className="rw2-seg" role="group" aria-label="Board">
              {(["men", "women"] as Race[]).map((r) => (
                <button key={r} type="button" aria-pressed={race === r} className={race === r ? "on" : ""} onClick={() => setRace(r)} data-testid={`chal-div-${r}`}>
                  {r === "men" ? "Men" : "Women"}
                </button>
              ))}
            </span>
          )}
        </div>
        {rows === null ? (
          <div className="rw2-row">
            <span className="skeleton" style={{ width: 26, height: 26, borderRadius: "50%" }} />
            <span className="skeleton sk-line" style={{ width: "50%" }} />
            <span className="skeleton sk-line" style={{ width: 40 }} />
          </div>
        ) : !top.length ? (
          <p className="rw2-board-empty" data-testid="chal-empty">
            {st.ended ? "Nobody took part." : st.live ? "Nobody yet. Your first set takes #1." : `Nobody yet. The first set on ${DAY[new Date(c.starts_at).getDay()]} takes #1.`}
          </p>
        ) : (
          <>
            {top.map((r) => (
              <ChalRow key={`${r.rank}-${r.name}`} c={c} r={r} strength={strength} />
            ))}
            {meOutside && (
              <>
                <div className="rk-gap" aria-hidden="true">
                  ⋯
                </div>
                <ChalRow c={c} r={meOutside} strength={strength} />
              </>
            )}
          </>
        )}
      </div>

      <div className="rw2-actions">
        {m && !st.ended && (
          <Link href={`/machine/${m.id}${c.mode ? `?mode=${c.mode}` : ""}`} className="btn btn-yellow" data-testid="chal-go">
            Go to {machineName}
          </Link>
        )}
        {c.players > 5 && onSeeAll && (
          <button type="button" className="btn btn-ghost rw2-seeall" onClick={() => onSeeAll(c, strength ? race : null)} data-testid="chal-board-btn">
            All {c.players}
          </button>
        )}
        {mineAll && onShare && (
          <button type="button" className="btn btn-ghost rw2-share" onClick={() => onShare(c, mineAll)} aria-label="Share your place in the challenge" data-testid="chal-share">
            <Icon name="share" />
          </button>
        )}
      </div>
    </section>
  );
}

function ChalRow({ c, r, strength }: { c: Challenge; r: ChallengeRow; strength: boolean }) {
  const { v, sub } = rowValue(c, r, strength);
  return (
    <div className={`rw2-row${r.rank <= 3 ? ` g${r.rank}` : ""}${r.is_me ? " me" : ""}`} data-testid="chal-row">
      <span className="rk-rank num">{r.rank}</span>
      <b>{r.is_me ? "You" : r.name}</b>
      <span className="v num">
        {v}
        {sub && <small> {sub}</small>}
      </span>
    </div>
  );
}

export function LastWinnersLine({ last }: { last: RewardsOverview["last_winners"] }) {
  const [open, setOpen] = useState(false);
  if (!last || !last.winners.length) return null;
  const firsts = last.winners.filter((w) => w.rank === 1);
  const names = (firsts.length ? firsts : last.winners.slice(0, 1)).map((w) => w.name);
  return (
    <>
      <button type="button" className="rw2-last" onClick={() => setOpen(true)} data-testid="rw-last-winners">
        <Icon name="trophy" />
        <span>
          {last.season}: {names.map((n, i) => (
            <Fragment key={n + i}>
              {i > 0 && " & "}
              <b>{n}</b>
            </Fragment>
          ))}{" "}
          won
        </span>
        <Icon name="chev" className="icon rw2-chev" />
      </button>
      {open && (
        <Sheet open onClose={() => setOpen(false)} title="Last winners" testId="winners-sheet">
          <WinnersCard last={last} />
        </Sheet>
      )}
    </>
  );
}
