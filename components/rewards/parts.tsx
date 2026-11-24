"use client";

import DivisionTabs from "@/components/DivisionTabs";
import type { BoardView } from "@/lib/body";
import { useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import Sheet from "@/components/Sheet";
import { MACHINE_MAP } from "@/lib/machines";
import { toast } from "@/lib/toast";
import {
  fmtXp,
  metricLabel,
  metricValue,
  prizeForRank,
  prizeRankLabel,
  sponsorLink,
  timeLeft,
  type BadgeDef,
  type BoardRow,
  type Challenge,
  type ChallengeRow,
  type MissionDef,
  type MyRewards,
  type Redemption,
  type RewardsOverview,
  type ShopItem,
  type Sponsor,
} from "@/lib/rewards";

export type SponsorMap = Record<string, Sponsor>;

const periodWord = (p: "week" | "month" | undefined) => (p === "month" ? "month" : "week");

function sponsorNames(ids: string[] | undefined, sponsors: SponsorMap) {
  return (ids || []).map((id) => sponsors[id]?.name).filter(Boolean) as string[];
}

export function copyCode(code: string) {
  const done = () => toast("Code copied");
  try {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(code).then(done, () => toast(code));
      return;
    }
  } catch {
    /* fall through */
  }
  toast(code);
}

// ---- wallet ---------------------------------------------------------------
export function WalletCard({ me, onHow, onShop }: { me: MyRewards; onHow: () => void; onShop?: () => void }) {
  const w = me.wallet;
  return (
    <section className="rw-wallet" data-testid="rw-wallet" aria-label="Your XP">
      <div className="rw-wallet-top">
        <span className="eyebrow rw-on-dark-eyebrow">XP to spend</span>
        <button type="button" className="rw-how" onClick={onHow}>
          <Icon name="info" /> How XP works
        </button>
      </div>
      <div className="rw-balance" data-testid="rw-balance">
        <span className="display">{fmtXp(w.balance)}</span>
        <small>XP</small>
      </div>
      <div className="rw-wallet-meta">
        <span>
          <b>{fmtXp(w.lifetime)}</b> earned all time
        </span>
        {w.spent > 0 && (
          <span>
            <b>{fmtXp(w.spent)}</b> spent
          </span>
        )}
        {w.on_hold > 0 && (
          <span className="rw-hold" data-testid="rw-on-hold">
            <b>{fmtXp(w.on_hold)}</b> on hold
          </span>
        )}
      </div>
      <p className="rw-wallet-note">Spending XP never lowers your level or your rank.</p>
      {onShop && (
        <button type="button" className="btn-slab rw-wallet-cta" onClick={onShop}>
          <span>
            Spend in the XP shop <span aria-hidden="true">→</span>
          </span>
        </button>
      )}
    </section>
  );
}

export function SignInCard({ onSignIn }: { onSignIn: () => void }) {
  return (
    <section className="rw-wallet" data-testid="rw-signin">
      <span className="eyebrow rw-on-dark-eyebrow">Rewards</span>
      <h1 className="rw-signin-title">
        Every set earns <em>XP.</em> Spend it on real stuff.
      </h1>
      <p className="rw-wallet-note" style={{ marginTop: 8 }}>
        Weekly missions, streak bonuses and a prize race with gifts from our partner brands. Sign in to start earning.
      </p>
      <button type="button" className="btn-slab rw-wallet-cta" onClick={onSignIn} data-testid="rw-signin-btn">
        <span>
          <i className="g-chip" aria-hidden="true">
            <Icon name="google" />
          </i>
          Continue with Google
        </span>
      </button>
    </section>
  );
}

// ---- missions -----------------------------------------------------------------
function missionProgress(m: MissionDef, me: MyRewards | null) {
  if (!me) return 0;
  const w = me.week;
  return m.metric === "sets" ? w.sets : m.metric === "days" ? w.days : m.metric === "machines" ? w.machines : m.metric === "pbs" ? w.pbs : w.volume;
}

// showXp false (Ranks v2): no +XP pills, no descriptions, "New every Monday".
export function MissionsCard({ defs, me, showXp = true }: { defs: MissionDef[]; me: MyRewards | null; showXp?: boolean }) {
  if (!defs.length) return null;
  const done = defs.filter((m) => me?.missions_done.includes(m.id) || missionProgress(m, me) >= m.target).length;
  const total = defs.reduce((s, m) => s + m.xp, 0);
  return (
    <section className="card rw-missions" data-testid="rw-missions" aria-labelledby="rw-missions-h">
      <div className="rw-card-head">
        <h2 id="rw-missions-h" style={{ fontSize: 17, margin: 0 }}>
          Weekly missions
        </h2>
        <span className="pill rw-pill num">{me ? `${done}/${defs.length} done` : showXp ? `Up to ${total} XP` : `${defs.length} this week`}</span>
      </div>
      <p className="faint" style={{ fontSize: 12.5, margin: "2px 0 4px" }}>
        {showXp ? <>Bonus XP for this week&rsquo;s goals. New missions every Monday.</> : "New every Monday"}
      </p>
      <ul className="rw-mission-list">
        {defs.map((m) => {
          const v = missionProgress(m, me);
          const isDone = !!me && (me.missions_done.includes(m.id) || v >= m.target);
          const pct = Math.min(100, Math.round((100 * v) / m.target));
          const shown = m.metric === "volume" ? `${fmtXp(Math.min(v, m.target))} / ${fmtXp(m.target)} kg` : `${Math.min(v, m.target)} / ${m.target}`;
          return (
            <li key={m.id} className={isDone ? "done" : ""} data-testid={`mission-${m.id}`}>
              <span className="rw-m-ic" aria-hidden="true">
                <Icon name={isDone ? "check" : m.icon} />
              </span>
              <span className="rw-m-body">
                <span className="rw-m-title">
                  <b>{m.title}</b>
                  {showXp && <span className={`rw-xp${isDone ? " got" : ""}`}>+{m.xp} XP</span>}
                </span>
                {showXp && <span className="rw-m-desc">{m.description}</span>}
                {me && (
                  <span className="rw-m-bar">
                    <span className="progress-track" role="progressbar" aria-label={m.title} aria-valuemin={0} aria-valuemax={m.target} aria-valuenow={Math.min(v, m.target)}>
                      <span className="progress-fill" style={{ width: `${pct}%`, display: "block" }} />
                    </span>
                    <span className="num">{isDone ? "Done" : shown}</span>
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---- streak -----------------------------------------------------------------
// showXp false (Ranks v2): streak goals without the +XP bonuses, one line.
export function StreakCard({ steps, me, onShare, showXp = true }: { steps: { days: number; xp: number }[]; me: MyRewards | null; onShare?: () => void; showXp?: boolean }) {
  if (!steps.length) return null;
  const days = me?.streak.days || 0;
  const next = steps.find((s) => s.days > days);
  const max = steps[steps.length - 1].days;
  return (
    <section className="card rw-streak" data-testid="rw-streak" aria-labelledby="rw-streak-h">
      <div className="rw-streak-top">
        <span className="rw-flame" aria-hidden="true">
          <Icon name="flame" />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 id="rw-streak-h" style={{ fontSize: 17, margin: 0 }}>
            {me ? (
              <>
                {days}-day lifting streak
              </>
            ) : (
              "Lifting streaks"
            )}
          </h2>
          <div className="faint" style={{ fontSize: 13, marginTop: 2 }}>
            {!showXp
              ? next
                ? me
                  ? `${next.days - days} more day${next.days - days === 1 ? "" : "s"} to a ${next.days}-day streak`
                  : "Log a set on back-to-back days."
                : "Every streak goal hit. Legend."
              : next
                ? me
                  ? `${next.days - days} more day${next.days - days === 1 ? "" : "s"} for +${next.xp} XP`
                  : "Log a set on back-to-back days to earn bonus XP."
                : `You've hit every streak bonus. Legend.`}
          </div>
        </div>
        {onShare && me && days >= 2 && (
          <button type="button" className="share-mini" onClick={onShare} aria-label="Share your streak" data-testid="share-streak">
            <Icon name="share" />
          </button>
        )}
      </div>
      <ol className="rw-steps" aria-label={showXp ? "Streak bonuses" : "Streak goals"}>
        {steps.map((s) => {
          const got = days >= s.days || me?.streak.claimed.includes(s.days);
          return (
            <li key={s.days} className={got ? "got" : ""} style={{ ["--at" as string]: `${(100 * s.days) / max}%` }}>
              <b className="num">{s.days}d</b>
              {showXp && <span>+{s.xp}</span>}
            </li>
          );
        })}
      </ol>
      <div className="progress-track" aria-hidden="true">
        <div className="progress-fill" style={{ width: `${Math.min(100, (100 * days) / max)}%` }} />
      </div>
      {showXp && (
        <p className="faint" style={{ fontSize: 12, margin: "10px 0 0" }}>
          A streak counts days with at least one logged set, in a row. Miss a day and it starts again.
        </p>
      )}
    </section>
  );
}

// ---- XP shop -------------------------------------------------------------------
export function ShopSection({
  items,
  me,
  sponsors,
  signedIn,
  onRedeem,
  onSignIn,
}: {
  items: ShopItem[];
  me: MyRewards | null;
  sponsors: SponsorMap;
  signedIn: boolean;
  onRedeem: (item: ShopItem) => void;
  onSignIn: () => void;
}) {
  const balance = me?.wallet.balance ?? 0;
  return (
    <section id="shop" data-testid="rw-shop" aria-labelledby="rw-shop-h">
      <div className="section-head">
        <h2 id="rw-shop-h" style={{ fontSize: 17, margin: 0 }}>
          XP shop
        </h2>
        {me && <span className="faint num" style={{ fontSize: 12.5 }}>{fmtXp(balance)} XP to spend</span>}
      </div>
      {items.length === 0 ? (
        <div className="card rw-shop-empty" data-testid="rw-shop-empty">
          <span className="tapin-icons" aria-hidden="true">
            <Icon name="gift" />
          </span>
          <div>
            <b>The shop opens soon</b>
            <span>Vouchers and goodies from our partners are on the way. Keep earning: your XP waits for you.</span>
          </div>
        </div>
      ) : (
        <div className="rw-shop-grid">
          {items.map((it) => {
            const sp = it.sponsor_id ? sponsors[it.sponsor_id] : null;
            const claimed = me?.claimed_rewards[String(it.id)] || 0;
            const soldOut = it.stock_left === 0;
            const limitHit = claimed >= it.per_member_limit;
            const short = it.xp_cost - balance;
            const label = !signedIn
              ? "Sign in to redeem"
              : soldOut
                ? "All gone"
                : limitHit
                  ? "Claimed"
                  : short > 0
                    ? `${fmtXp(short)} XP to go`
                    : "Redeem";
            const disabled = signedIn && (soldOut || limitHit || short > 0);
            const pct = signedIn ? Math.min(100, Math.round((100 * balance) / it.xp_cost)) : 0;
            return (
              <article key={it.id} className={`rw-item${soldOut ? " out" : ""}`} data-testid={`shop-${it.id}`}>
                <div className="rw-item-art" aria-hidden="true">
                  {it.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.image_url} alt="" loading="lazy" onError={(e) => ((e.currentTarget.style.display = "none"))} />
                  ) : (
                    <span className="rw-art-mono">
                      <Icon name={it.code_mode === "desk" ? "gift" : "ticket"} />
                    </span>
                  )}
                  {it.stock_left !== null && !soldOut && <span className="rw-stock">{it.stock_left} left</span>}
                </div>
                <div className="rw-item-body">
                  {sp && <span className="rw-item-by">{sp.name}</span>}
                  <h3>{it.title}</h3>
                  {it.description && <p>{it.description}</p>}
                  <div className="rw-cost">
                    <span className="display">{fmtXp(it.xp_cost)}</span> XP
                  </div>
                  {signedIn && !soldOut && !limitHit && short > 0 && (
                    <span className="progress-track rw-item-bar" aria-hidden="true">
                      <span className="progress-fill" style={{ width: `${pct}%`, display: "block" }} />
                    </span>
                  )}
                  <button
                    type="button"
                    className={`btn btn-sm ${!disabled && signedIn ? "btn-yellow" : "btn-ghost"}`}
                    disabled={disabled}
                    onClick={() => (signedIn ? onRedeem(it) : onSignIn())}
                    data-testid={`redeem-${it.id}`}
                  >
                    {label}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ---- my rewards -------------------------------------------------------------------
const STATUS: Record<Redemption["status"], string> = { issued: "Ready to collect", fulfilled: "Collected", cancelled: "Cancelled" };

export function codeHint(r: { code_mode: string; how_to_use: string | null; source?: string }) {
  if (r.how_to_use) return r.how_to_use;
  if (r.code_mode === "desk" || r.source !== "shop") return "Show this code at the front desk to collect.";
  return "Use this code at checkout on the brand's website.";
}

export function MyRewardsSection({ list, sponsors, onShare }: { list: Redemption[]; sponsors: SponsorMap; onShare?: (r: Redemption) => void }) {
  const shown = list.filter((r) => r.status !== "cancelled" || Date.now() - new Date(r.created_at).getTime() < 7 * 86400000);
  if (!shown.length) return null;
  return (
    <section id="mine" data-testid="rw-mine" aria-labelledby="rw-mine-h">
      <div className="section-head">
        <h2 id="rw-mine-h" style={{ fontSize: 17, margin: 0 }}>
          Your rewards
        </h2>
      </div>
      <ul className="card rw-mine-list">
        {shown.map((r) => {
          const sp = r.sponsor_id ? sponsors[r.sponsor_id] : null;
          const src = r.source === "prize" ? `Prize · #${r.rank}` : r.source === "challenge" ? `Challenge win · #${r.rank}` : `XP shop · ${fmtXp(r.xp_spent)} XP`;
          return (
            <li key={r.id} className={`rw-mine-row ${r.status}`} data-testid={`mine-${r.id}`}>
              <span className={`rw-m-ic${r.source !== "shop" ? " prize" : ""}`} aria-hidden="true">
                <Icon name={r.source === "shop" ? "ticket" : "trophy"} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <b>{r.title}</b>
                <span className="rw-mine-sub">
                  {src}
                  {sp ? ` · ${sp.name}` : ""}
                </span>
                {r.code && r.status === "issued" && (
                  <>
                    <button type="button" className="rw-code" onClick={() => copyCode(r.code!)} aria-label={`Copy code ${r.code}`}>
                      <span className="num">{r.code}</span>
                      <Icon name="copy" />
                    </button>
                    <span className="rw-mine-sub">{codeHint(r)}</span>
                  </>
                )}
              </span>
              <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                <span className={`rw-status ${r.status}`}>{STATUS[r.status]}</span>
                {onShare && r.source !== "shop" && r.status !== "cancelled" && (
                  <button type="button" className="share-mini" onClick={() => onShare(r)} aria-label={`Share: you won ${r.title}`} data-testid="share-win">
                    <Icon name="share" />
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---- badges -----------------------------------------------------------------
// showXp false (Ranks v2): icon + name only; tap a badge for what it's for.
export function BadgesSection({ defs, me, onShare, showXp = true }: { defs: BadgeDef[]; me: MyRewards | null; onShare?: (b: BadgeDef) => void; showXp?: boolean }) {
  const [open, setOpen] = useState<BadgeDef | null>(null);
  if (!defs.length) return null;
  const earned = new Map((me?.badges || []).map((b) => [b.id, b.at]));
  const openAt = open ? earned.get(open.id) : undefined;
  return (
    <section data-testid="rw-badges" aria-labelledby="rw-badges-h">
      <div className="section-head">
        <h2 id="rw-badges-h" style={{ fontSize: 17, margin: 0 }}>
          Badges
        </h2>
        {me && (
          <span className="faint" style={{ fontSize: 12.5 }}>
            {earned.size}/{defs.length} unlocked
          </span>
        )}
      </div>
      <ul className={`rw-badges${showXp ? "" : " compact"}`}>
        {defs.map((b) => {
          const at = earned.get(b.id);
          return (
            <li key={b.id} className={at ? "got" : ""} data-testid={`badge-${b.id}`}>
              {showXp ? (
                <>
                  <span className="rw-badge-ic" aria-hidden="true">
                    <Icon name={at ? b.icon : "lock"} />
                  </span>
                  <b>{b.title}</b>
                  <span>{b.description}</span>
                  <span className="rw-xp">{at ? `+${b.xp} XP earned` : `+${b.xp} XP`}</span>
                  <span className="sr-only">{at ? "Unlocked" : "Locked"}</span>
                </>
              ) : (
                <button type="button" className="rw-badge-btn" onClick={() => setOpen(b)} data-testid={`badge-open-${b.id}`}>
                  <span className="rw-badge-ic" aria-hidden="true">
                    <Icon name={at ? b.icon : "lock"} />
                  </span>
                  <b>{b.title}</b>
                  <span className="sr-only">{at ? "Unlocked" : "Locked"}</span>
                </button>
              )}
              {at && onShare && (
                <button type="button" className="share-mini rw-badge-share" onClick={() => onShare(b)} aria-label={`Share the ${b.title} badge`} data-testid={`share-badge-${b.id}`}>
                  <Icon name="share" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {open && (
        <Sheet open onClose={() => setOpen(null)} title={open.title} testId="badge-sheet">
          <div className={`rw-badge-detail${openAt ? " got" : ""}`}>
            <span className="rw-badge-ic" aria-hidden="true">
              <Icon name={openAt ? open.icon : "lock"} />
            </span>
            <p>{open.description}</p>
            <span className="faint">
              {openAt ? `Unlocked ${new Date(openAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : "Not unlocked yet"}
            </span>
          </div>
          {openAt && onShare && (
            <button type="button" className="btn btn-ghost" onClick={() => (onShare(open), setOpen(null))} data-testid="badge-sheet-share">
              <Icon name="share" /> Share it
            </button>
          )}
        </Sheet>
      )}
    </section>
  );
}

// ---- last winners -------------------------------------------------------------------
export function WinnersCard({ last }: { last: RewardsOverview["last_winners"] }) {
  if (!last || !last.winners.length) return null;
  return (
    <section className="card" data-testid="rw-winners" aria-labelledby="rw-win-h">
      <div className="section-head">
        <h2 id="rw-win-h" style={{ fontSize: 17, margin: 0 }}>
          Last winners
        </h2>
        <span className="faint" style={{ fontSize: 12.5 }}>
          {last.season}
        </span>
      </div>
      <ol className="rw-winners">
        {last.winners.slice(0, 5).map((w) => (
          <li key={w.rank}>
            <span className={`rw-medal r${w.rank}`}>{w.rank}</span>
            <b>{w.name}</b>
            <span className="faint">{w.prize || ""}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---- partners ----------------------------------------------------------------------
const productIcon = (sp: Sponsor) => (/apparel|jersey|wear|cloth/i.test(`${sp.category} ${sp.name}`) ? "shirt" : /nutri|food|protein|oat/i.test(`${sp.category} ${sp.name}`) ? "bowl" : "gift");

export function PartnersSection({ sponsors, onClick, gymName }: { sponsors: Sponsor[]; onClick: (sponsorId: string, productId?: number) => void; gymName?: string }) {
  if (!sponsors.length)
    return (
      <div className="card empty" data-testid="rw-partners-empty">
        Partner brands will show up here soon.
      </div>
    );
  return (
    <section data-testid="rw-partners" aria-labelledby="rw-partners-h">
      <div className="rw-tab-intro">
        <h2 id="rw-partners-h">Our partners</h2>
        <p>The brands behind the prizes{gymName ? ` at ${gymName}` : ""}. Tap through to see what they make.</p>
      </div>
      <div className="stack">
        {sponsors.map((sp) => {
          const site = sponsorLink(sp.website_url, "partner-card");
          return (
            <article key={sp.id} className={`card rw-partner${sp.cover_url ? " has-cover" : ""}`} data-testid={`partner-${sp.id}`}>
              {sp.cover_url && (
                <div className="rw-cover" aria-hidden="true">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={sp.cover_url} alt="" loading="lazy" onError={(e) => ((e.currentTarget.parentElement!.style.display = "none"))} />
                </div>
              )}
              <header className="rw-partner-head">
                <span className="rw-logo" aria-hidden="true">
                  {sp.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={sp.logo_url} alt="" loading="lazy" onError={(e) => ((e.currentTarget.style.display = "none"))} />
                  ) : null}
                  <span>{sp.name.slice(0, 1)}</span>
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <h3>{sp.name}</h3>
                  {sp.tagline && <span className="rw-tagline">{sp.tagline}</span>}
                </span>
                {sp.category && <span className="pill rw-pill">{sp.category}</span>}
              </header>
              {sp.blurb && <p className="rw-blurb">{sp.blurb}</p>}
              {sp.products.length > 0 && (
                <div className="scroll-row rw-products" aria-label={`${sp.name} products`}>
                  {sp.products.map((p) => {
                    const href = sponsorLink(p.url || sp.website_url, `product-${p.id}`);
                    const inner = (
                      <>
                        <span className="rw-product-art" aria-hidden="true">
                          {p.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.image_url} alt="" loading="lazy" onError={(e) => ((e.currentTarget.style.display = "none"))} />
                          ) : (
                            <Icon name={productIcon(sp)} />
                          )}
                        </span>
                        <b>{p.title}</b>
                        {p.subtitle && <span className="rw-p-sub">{p.subtitle}</span>}
                        {p.price_text && <span className="rw-p-price num">{p.price_text}</span>}
                      </>
                    );
                    return href ? (
                      <a key={p.id} className="rw-product" href={href} target="_blank" rel="noopener" onClick={() => onClick(sp.id, p.id)}>
                        {inner}
                        <span className="sr-only">(opens {sp.name}&rsquo;s site)</span>
                      </a>
                    ) : (
                      <div key={p.id} className="rw-product">
                        {inner}
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="rw-partner-links">
                {site && (
                  <a className="btn btn-ghost btn-sm" href={site} target="_blank" rel="noopener" onClick={() => onClick(sp.id)} data-testid={`visit-${sp.id}`}>
                    Shop {sp.name} <Icon name="external" />
                  </a>
                )}
                {sp.instagram_url && (
                  <a className="btn btn-ghost btn-sm" href={sp.instagram_url} target="_blank" rel="noopener" onClick={() => onClick(sp.id)} aria-label={`${sp.name} on Instagram`}>
                    <Icon name="instagram" />
                  </a>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

// ---- sheets ----------------------------------------------------------------------------
export { periodWord, sponsorNames };

export function HowXpSheet({ open, onClose, ov }: { open: boolean; onClose: () => void; ov: RewardsOverview | null }) {
  const missionXp = (ov?.missions || []).reduce((s, m) => s + m.xp, 0);
  return (
    <Sheet open={open} onClose={onClose} title="How XP works" testId="how-xp-sheet">
      <div className="rw-how-list">
        <div>
          <b>Earn</b>
          <ul>
            <li>+10 XP for every set, +50 for a personal best</li>
            <li>+20 on your 3rd set of the day, +25 when you come back after a break</li>
            <li>Weekly missions: up to {missionXp || 310} XP a week</li>
            <li>Lifting streaks, badges and sponsor challenges pay bonus XP</li>
          </ul>
        </div>
        <div>
          <b>Spend</b>
          <ul>
            <li>Swap XP for vouchers and goodies in the XP shop</li>
            <li>Your level and all-time rank use the XP you&rsquo;ve earned, so spending never lowers them</li>
          </ul>
        </div>
        <div>
          <b>Win</b>
          <ul>
            <li>Every {periodWord(ov?.period)}, whoever earns the most XP wins the prize. More sets = more XP</li>
            <li>Special challenges (like the Friday Leg Press one) have their own winner</li>
            <li>Staff check the board before prizes go out</li>
          </ul>
        </div>
        <div>
          <b>Fair play</b>
          <ul>
            <li>Sets that look off (a huge jump, say) wait for a quick staff check. Their XP shows as &ldquo;on hold&rdquo; until approved</li>
            <li>Streaks and missions count logged sets, not check-ins</li>
          </ul>
        </div>
      </div>
      <button type="button" className="btn btn-primary" onClick={onClose} style={{ marginTop: 16 }}>
        Got it
      </button>
    </Sheet>
  );
}

export function BoardSheet({
  open,
  onClose,
  title,
  sub,
  rows,
  format,
  division,
  onDivision,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  sub?: string;
  rows: (BoardRow | ChallengeRow)[] | null;
  format: (r: BoardRow | ChallengeRow) => string;
  division?: BoardView | null; // 0015: Men · Women · All
  onDivision?: (d: BoardView) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title} testId="board-sheet">
      {sub && (
        <p className="faint center" style={{ margin: "-4px 0 12px", fontSize: 13 }}>
          {sub}
        </p>
      )}
      {division && onDivision && <DivisionTabs value={division} onChange={onDivision} className="rw-div-tabs" />}
      {rows === null ? (
        <div className="stack" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 40, borderRadius: 12 }} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="empty">Nobody on the board yet.</p>
      ) : (
        <ol className="rw-board">
          {rows.map((r) => (
            <li key={r.rank} className={r.is_me ? "me" : ""}>
              <span className="r num">{r.rank}</span>
              <span className="n">{r.is_me ? `${r.name} (you)` : r.name}</span>
              <span className="s num">{format(r)}</span>
            </li>
          ))}
        </ol>
      )}
      <button type="button" className="btn btn-ghost" onClick={onClose} style={{ marginTop: 14 }}>
        Close
      </button>
    </Sheet>
  );
}

export function RedeemSheet({
  item,
  result,
  balance,
  sponsors,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  item: ShopItem | null;
  result: { code: string | null; code_mode: string; how_to_use: string | null; balance: number } | null;
  balance: number;
  sponsors: SponsorMap;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (!item) return null;
  const sp = item.sponsor_id ? sponsors[item.sponsor_id] : null;
  const site = sponsorLink(sp?.website_url, `redeem-${item.id}`);
  return (
    <Sheet open={!!item} onClose={busy ? () => undefined : onClose} title={result ? "It's yours" : "Spend XP?"} testId="redeem-sheet">
      {!result ? (
        <>
          <div className="rw-redeem-sum">
            {sp && <span className="rw-item-by">{sp.name}</span>}
            <b>{item.title}</b>
            <div className="rw-redeem-math num">
              <span>{fmtXp(balance)} XP</span>
              <span>− {fmtXp(item.xp_cost)} XP</span>
              <span className="eq">= {fmtXp(balance - item.xp_cost)} XP left</span>
            </div>
            <p className="faint" style={{ fontSize: 13, margin: "10px 0 0" }}>
              {item.code_mode === "desk"
                ? "You'll get a claim code to show at the front desk."
                : "You'll get a discount code to use on their website."}{" "}
              Your level stays the same.
            </p>
          </div>
          {error && (
            <p className="field-error" role="alert" data-testid="redeem-error">
              {error}
            </p>
          )}
          <button type="button" className="btn btn-yellow" onClick={onConfirm} disabled={busy} data-testid="redeem-confirm">
            {busy ? "Redeeming…" : `Spend ${fmtXp(item.xp_cost)} XP`}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy} style={{ marginTop: 10 }}>
            Not now
          </button>
        </>
      ) : (
        <div className="rw-result" data-testid="redeem-result">
          <span className="rw-result-ic" aria-hidden="true">
            <Icon name="gift" />
          </span>
          <b className="rw-result-title">{item.title}</b>
          {result.code && (
            <button type="button" className="rw-code big" onClick={() => copyCode(result.code!)} aria-label={`Copy code ${result.code}`} data-testid="redeem-code">
              <span className="num">{result.code}</span>
              <Icon name="copy" />
            </button>
          )}
          <p className="muted" style={{ fontSize: 14, margin: "6px 0 0" }}>
            {codeHint({ code_mode: result.code_mode, how_to_use: result.how_to_use, source: "shop" })}
          </p>
          <p className="faint" style={{ fontSize: 12.5, margin: "8px 0 0" }}>
            Saved under Your rewards. {fmtXp(result.balance)} XP left.
          </p>
          {result.code_mode !== "desk" && site && (
            <a className="btn btn-ghost" href={site} target="_blank" rel="noopener" style={{ marginTop: 14 }}>
              Open {sp?.name} <Icon name="external" />
            </a>
          )}
          <button type="button" className="btn btn-primary" onClick={onClose} style={{ marginTop: 10 }}>
            Done
          </button>
        </div>
      )}
    </Sheet>
  );
}
