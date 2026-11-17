"use client";

import Link from "next/link";
import Icon from "@/components/Icon";
import { MACHINE_MAP } from "@/lib/machines";
import {
  challengeStatus,
  fmtXp,
  metricValue,
  prizeRankLabel,
  setsFor,
  timeLeft,
  weekdayName,
  type BoardRow,
  type Challenge,
  type MyRewards,
  type RewardsOverview,
} from "@/lib/rewards";
import { periodWord, sponsorNames, type SponsorMap } from "@/components/rewards/parts";

// ---- This week's prize: what you can win, who's winning it, where you are --
export function PrizeHero({
  ov,
  me,
  top,
  sponsors,
  now,
  onBoard,
  onHow,
}: {
  ov: RewardsOverview;
  me: MyRewards | null;
  top: BoardRow[] | null;
  sponsors: SponsorMap;
  now: number;
  onBoard: () => void;
  onHow: () => void;
}) {
  const s = ov.season;
  if (!s) return null;
  const word = periodWord(s.period);
  const [first, ...rest] = s.prizes;
  const names = sponsorNames(first?.sponsor_ids, sponsors);
  const leaderRow = top && top[0] ? top[0] : null;
  const leader = s.leader || (leaderRow ? { name: leaderRow.name, score: leaderRow.score } : null);
  const leaderIsMe = !!me && !!leaderRow?.is_me;
  const myRank = me?.season?.rank ?? null;
  const myScore = me?.season?.score ?? 0;
  const ahead = me?.season?.ahead ?? null;
  const prizePlaces = s.prizes.reduce((m, p) => Math.max(m, p.rank_to), 0);

  let you: string | null = null;
  if (me) {
    if (!myRank) you = `Log a set this ${word} to get on the board.`;
    else if (myRank === 1) you = "You're winning it right now. Hold on to #1!";
    else if (ahead) you = `You're #${myRank}. About ${setsFor(ahead.score - myScore + 1)} more sets to pass ${ahead.name}.`;
    else you = `You're #${myRank}.`;
    if (myRank && myRank > 1 && myRank <= prizePlaces) you += " You're in the prizes.";
  }

  return (
    <section className="rw-prize" data-testid="rw-prize" aria-labelledby="rw-prize-h">
      <div className="rw-prize-top">
        <span className="eyebrow rw-on-dark-eyebrow">{ov.settings?.prize_headline || `This ${word}'s prize`}</span>
        <span className="rw-countdown" data-testid="rw-countdown">
          <Icon name="timer" />
          {timeLeft(s.ends_at, now)}
        </span>
      </div>

      <div className={`rw-prize-art${first?.image_url ? " has-img" : ""}`}>
        {first?.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={first.image_url} alt={first.title} onError={(e) => ((e.currentTarget.style.display = "none"))} />
        ) : (
          <span className="rw-prize-art-ph" aria-hidden="true">
            <Icon name="gift" />
          </span>
        )}
        <span className="rw-prize-badge">#1 wins</span>
      </div>

      <h2 id="rw-prize-h" className="rw-prize-title">
        {first ? first.title : "Prizes are on the way"}
      </h2>
      {names.length > 0 && <div className="rw-prize-from">from {names.join(" × ")}</div>}
      {first?.description && <p className="rw-prize-desc">{first.description}</p>}

      <div className="rw-leader" data-testid="rw-leader">
        <span className="rw-leader-av" aria-hidden="true">
          {leader ? leader.name.slice(0, 1).toUpperCase() : <Icon name="trophy" />}
        </span>
        <span className="rw-leader-body">
          <span className="rw-leader-label">Winning it right now</span>
          <b>{leader ? (leaderIsMe ? `${leader.name} (you)` : leader.name) : "Nobody yet"}</b>
        </span>
        <span className="rw-leader-score num">{leader ? `${fmtXp(leader.score)} XP` : `First set this ${word} takes it`}</span>
      </div>
      {you && (
        <p className="rw-you" data-testid="rw-you">
          {you}
        </p>
      )}

      {top && top.length > 1 && (
        <ol className="rw-mini-board" aria-label="Top of the race">
          {top.slice(0, 5).map((r) => (
            <li key={r.rank} className={`${r.is_me ? "me " : ""}${r.rank <= prizePlaces ? "prized" : ""}`}>
              <span className="r num">{r.rank}</span>
              <span className="n">{r.is_me ? `${r.name} (you)` : r.name}</span>
              <span className="s num">{fmtXp(r.score)}</span>
            </li>
          ))}
        </ol>
      )}
      <button type="button" className="rw-dark-btn" onClick={onBoard} data-testid="rw-board-btn">
        Full board <Icon name="chev" />
      </button>

      {rest.length > 0 && (
        <ul className="rw-prizes rw-more-prizes" aria-label="More prizes">
          {rest.map((p) => {
            const by = sponsorNames(p.sponsor_ids, sponsors);
            return (
              <li key={p.id}>
                <span className="rw-prize-rank">{prizeRankLabel(p)}</span>
                <span className="rw-prize-body">
                  <b>{p.title}</b>
                  {by.length > 0 && <span className="rw-prize-by">{by.join(" × ")}</span>}
                </span>
                {p.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image_url} alt="" className="rw-prize-thumb" />
                ) : (
                  <Icon name="ticket" className="icon rw-prize-ic" />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {ov.settings?.rewards_note && <p className="rw-note">{ov.settings.rewards_note}</p>}
      <p className="rw-fine">
        Every set you log earns XP. Most XP this {word} wins.{" "}
        <button type="button" className="rw-inline-link" onClick={onHow}>
          How it works
        </button>
      </p>
    </section>
  );
}

// ---- Special challenges (e.g. the Friday Leg Press one) -------------------
export function ChallengesBlock({
  list,
  me,
  sponsors,
  now,
  onBoard,
  onShare,
}: {
  list: Challenge[];
  me: MyRewards | null;
  sponsors: SponsorMap;
  now: number;
  onBoard: (c: Challenge) => void;
  onShare?: (c: Challenge, mine: { rank: number; value: number; reps: number | null }) => void;
}) {
  if (!list.length) return null;
  return (
    <section id="challenges" data-testid="rw-challenges" aria-labelledby="rw-ch-h">
      <div className="section-head">
        <h2 id="rw-ch-h" style={{ fontSize: 18, margin: 0 }}>
          Special challenges
        </h2>
      </div>
      <div className="stack">
        {list.map((c) => {
          const sp = c.sponsor_id ? sponsors[c.sponsor_id] : null;
          const m = c.machine_id ? MACHINE_MAP[c.machine_id] : null;
          const mine = me?.challenges.find((x) => x.id === c.id);
          const st = challengeStatus(c, now);
          const day = weekdayName(c.weekday);
          const goal = `${c.metric === "best_lift" ? "Heaviest single set" : c.metric === "sets" ? "Most sets" : "Most kg moved"}${m ? ` on ${m.name}` : ""}`;
          return (
            <article key={c.id} className={`rw-chal${st.live ? " live" : ""}`} data-testid={`challenge-${c.id}`}>
              <div className="rw-chal-head">
                <span className="rw-chal-brand">
                  <span className="rw-chal-logo" aria-hidden="true">
                    {sp?.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={sp.logo_url} alt="" onError={(e) => ((e.currentTarget.style.display = "none"))} />
                    ) : null}
                    <span>{(sp?.name || "R").slice(0, 1)}</span>
                  </span>
                  {sp ? sp.name : "Racked"}
                </span>
                {c.repeats === "weekly" && day && <span className="rw-chal-repeat">Every {day}</span>}
              </div>
              <h3 className="rw-chal-title">{c.title}</h3>
              <span className={`rw-chal-status${st.live ? " live" : ""}`} data-testid="challenge-status">
                <i aria-hidden="true" />
                {st.label}
              </span>
              {c.description && <p className="rw-chal-desc">{c.description}</p>}
              <dl className="rw-chal-grid">
                <div>
                  <dt>Goal</dt>
                  <dd>{goal}</dd>
                </div>
                {c.prize && (
                  <div>
                    <dt>{c.winners > 1 ? `Top ${c.winners} win` : "Winner gets"}</dt>
                    <dd>{c.prize}</dd>
                  </div>
                )}
                {st.live || st.ended ? (
                  <div>
                    <dt>Leading</dt>
                    <dd>{c.leader ? `${c.leader.name} · ${metricValue(c.metric, c.leader.value, c.leader.reps)}` : "Nobody yet. Be first!"}</dd>
                  </div>
                ) : c.last_result ? (
                  <div>
                    <dt>Last {day || "time"}</dt>
                    <dd>
                      {c.last_result.name} won · {metricValue(c.metric, c.last_result.value, c.last_result.reps)}
                    </dd>
                  </div>
                ) : null}
                {mine && (
                  <div>
                    <dt>Your best</dt>
                    <dd>
                      #{mine.rank} · {metricValue(c.metric, mine.value, mine.reps)}
                    </dd>
                  </div>
                )}
              </dl>
              <div className="rw-ch-actions">
                {m && st.live ? (
                  <Link href={`/machine/${m.id}`} className="btn btn-yellow btn-sm">
                    Go to {m.name}
                  </Link>
                ) : null}
                {(st.live || st.ended) && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onBoard(c)}>
                    Board · {c.players}
                  </button>
                )}
                {mine && onShare && c.metric === "best_lift" && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onShare(c, mine)} data-testid="share-challenge">
                    <Icon name="share" /> Share
                  </button>
                )}
                {c.join_xp > 0 && !st.ended && <span className="rw-xp">+{c.join_xp} XP for joining</span>}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
