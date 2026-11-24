"use client";

// Every kind of card in the Home feed. Member content (PRs, workouts, pump
// checks, posts, transformations) gets kudos + comments; gym content
// (notices, offers, the prize race, challenges, winners) gets a clear action.
import Link from "next/link";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import Icon from "@/components/Icon";
import Avatar from "@/components/Avatar";
import IgHandle from "@/components/IgHandle";
import MachinePlate from "@/components/feed/MachinePlate";
import { MACHINE_MAP } from "@/lib/machines";
import { timeAgo } from "@/lib/time";
import { toast } from "@/lib/toast";
import {
  challengeStatus,
  fmtXp,
  metricValue,
  prizeRankLabel,
  sponsorLink,
  timeLeft,
  weekdayName,
  type Challenge,
  type MyRewards,
  type Redemption,
  type RewardsOverview,
} from "@/lib/rewards";
import { apartLabel, type FeedItem, type GymPost, type Media } from "@/lib/feed";
import { useFeature } from "@/lib/features";

export type SetItem = Extract<FeedItem, { type: "set" }>;
export type PumpItem = Extract<FeedItem, { type: "pump" }>;
export type WallItem = Extract<FeedItem, { type: "wall" }>;
export type SocialItem = SetItem | PumpItem | WallItem;

export type Handlers = {
  now: number;
  urls: Record<string, string>;
  comments: boolean; // 0014 run: comments available
  onKudos: (item: SocialItem, onlyGive?: boolean) => void;
  onComments: (item: SocialItem) => void;
  onMenu: (item: WallItem) => void;
  onShare: (item: SetItem) => void;
  onOpenPump: (item: PumpItem, kind: "pre" | "post") => void;
};

const fmt = (n: number) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 1 });

// "Priya, Rahul and 3 others gave kudos" / "You and Priya gave kudos"
export function kudosLine(count: number, mine: boolean, names: string[]): string {
  if (count <= 0) return "";
  const parts: string[] = [];
  if (mine) parts.push("You");
  parts.push(...names.slice(0, mine ? 1 : 2));
  const remaining = Math.max(0, count - parts.length);
  if (remaining > 0) parts.push(`${remaining} ${remaining === 1 ? "other" : "others"}`);
  if (parts.length === 1) return `${parts[0]} gave kudos`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]} gave kudos`;
}

function machineLabel(id: string | null, mode?: string | null) {
  const m = id ? MACHINE_MAP[id] : null;
  if (!m) return null;
  return mode && m.modes?.[mode] ? m.modes[mode].label : m.name;
}

// ---- shared pieces -----------------------------------------------------------
function Head({
  name,
  avatarName,
  avatar,
  ig,
  sub,
  ring,
  right,
}: {
  name: string;
  avatarName?: string | null;
  avatar: string | null;
  ig?: string | null;
  sub: ReactNode;
  ring?: boolean;
  right?: ReactNode;
}) {
  return (
    <header className="fx-head">
      <Avatar name={avatarName || name} url={avatar} size={40} className={ring ? "fx-ring" : ""} />
      <div className="fx-who">
        <div className="fx-name">
          <b>{name}</b>
          <IgHandle handle={ig} />
        </div>
        <div className="fx-sub">{sub}</div>
      </div>
      {right}
    </header>
  );
}

// Tap twice on a photo or a PR to give kudos (with a flame burst). A single
// tap does `onSingle` (if any) after a short wait.
function TapMedia({ children, className, onDouble, onSingle, label }: { children: ReactNode; className?: string; onDouble: () => void; onSingle?: () => void; label?: string }) {
  const last = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const [burst, setBurst] = useState(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  function click() {
    const t = Date.now();
    if (t - last.current < 320) {
      window.clearTimeout(timer.current);
      last.current = 0;
      setBurst((b) => b + 1);
      onDouble();
      return;
    }
    last.current = t;
    if (onSingle) timer.current = window.setTimeout(onSingle, 320);
  }
  return (
    <div className={`fx-tap ${className || ""}`} onClick={click} title={label}>
      {children}
      {burst > 0 && (
        <span key={burst} className="fx-burst" aria-hidden="true">
          <Icon name="flame" />
        </span>
      )}
    </div>
  );
}

function Actions({ item, h, share }: { item: SocialItem; h: Handlers; share?: boolean }) {
  const n = item.comment_count ?? 0;
  return (
    <div className="fx-actions">
      <button
        type="button"
        className={`fx-act kudos${item.kudos_mine ? " on" : ""}`}
        onClick={() => h.onKudos(item)}
        aria-pressed={item.kudos_mine}
        aria-label={item.kudos_mine ? "Take back kudos" : "Give kudos"}
        data-testid="kudos"
      >
        <Icon name="flame" />
        {item.kudos_count > 0 && <span className="num">{item.kudos_count}</span>}
      </button>
      {h.comments && (
        <button type="button" className="fx-act" onClick={() => h.onComments(item)} aria-label={n ? `${n} comment${n === 1 ? "" : "s"}, open` : "Comment"} data-testid="comment-btn">
          <Icon name="msg" />
          {n > 0 && <span className="num">{n}</span>}
        </button>
      )}
      {share && item.type === "set" && (
        <button type="button" className="fx-act" onClick={() => h.onShare(item)} aria-label="Share to Instagram or WhatsApp" data-testid="share-pr">
          <Icon name="share" />
        </button>
      )}
    </div>
  );
}

function Social({ item, h }: { item: SocialItem; h: Handlers }) {
  const line = kudosLine(item.kudos_count, item.kudos_mine, item.kudos_names || []);
  const n = item.comment_count ?? 0;
  const last = item.last_comment;
  if (!line && !last) return null;
  return (
    <div className="fx-social">
      {line && <div className="fx-kudos-line">{line}</div>}
      {last && h.comments && (
        <button type="button" className="fx-last" onClick={() => h.onComments(item)} data-testid="last-comment">
          <span className="fx-last-text">
            <b>{last.is_mine ? "You" : last.name}</b> {last.body}
          </span>
          {n > 1 && <span className="fx-last-more">View all {n} comments</span>}
        </button>
      )}
    </div>
  );
}

function Img({ path, urls, alt = "" }: { path: string | null; urls: Record<string, string>; alt?: string }) {
  const url = path ? urls[path] : undefined;
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt={alt} loading="lazy" draggable={false} /> : <span className="fx-skel" aria-hidden="true" />;
}

// ---- workouts + PRs ------------------------------------------------------------
export function SetCard({ item, h }: { item: SetItem; h: Handlers }) {
  const xpOn = useFeature("xp");
  const m = MACHINE_MAP[item.machine_id];
  if (!m) return null;
  const label = machineLabel(item.machine_id, item.mode) || m.name;
  const name = item.is_mine ? "You" : item.display_name || "Member";
  const sets = `${item.sets} ${item.sets === 1 ? "set" : "sets"}`;
  if (!item.has_pb) {
    return (
      <article className="fx-card fx-row" data-testid="feed-workout">
        <Avatar name={item.display_name} url={item.avatar_url} size={36} />
        <div className="fx-row-body">
          <div className="fx-row-title">
            <b>{name}</b> logged {sets} on <b>{label}</b>
          </div>
          <div className="fx-sub">
            Best {fmt(item.weight)} {m.unit.toLowerCase()} × {item.reps} · {timeAgo(item.created_at, h.now)}
          </div>
        </div>
        <div className="fx-row-acts">
          <button
            type="button"
            className={`fx-act mini kudos${item.kudos_mine ? " on" : ""}`}
            onClick={() => h.onKudos(item)}
            aria-pressed={item.kudos_mine}
            aria-label={item.kudos_mine ? "Take back kudos" : "Give kudos"}
            data-testid="kudos"
          >
            <Icon name="flame" />
            {item.kudos_count > 0 && <span className="num">{item.kudos_count}</span>}
          </button>
          {h.comments && (
            <button type="button" className="fx-act mini" onClick={() => h.onComments(item)} aria-label="Comments" data-testid="comment-btn">
              <Icon name="msg" />
              {(item.comment_count ?? 0) > 0 && <span className="num">{item.comment_count}</span>}
            </button>
          )}
        </div>
      </article>
    );
  }
  return (
    <article className="fx-card fx-pr" data-testid="feed-pr">
      <Head name={name} avatarName={item.display_name} avatar={item.avatar_url} ig={item.instagram_handle} ring sub={<>New PB · {timeAgo(item.created_at, h.now)}</>} />
      <TapMedia className="fx-plate-wrap" onDouble={() => h.onKudos(item, true)} label="Double-tap for kudos">
        <MachinePlate
          machineId={item.machine_id}
          number={m.number}
          name={label}
          weight={fmt(item.weight)}
          reps={item.reps}
          unit={m.unit}
          pb
          meta={`${sets}${xpOn && item.xp > 0 ? ` · +${item.xp} XP` : ""}`}
        />
      </TapMedia>
      <Actions item={item} h={h} share={item.is_mine} />
      <Social item={item} h={h} />
    </article>
  );
}

// ---- pump check ------------------------------------------------------------------
export function PumpCard({ item, h }: { item: PumpItem; h: Handlers }) {
  const name = item.is_mine ? "You" : item.display_name || "Member";
  const shots = (
    [
      { kind: "pre" as const, path: item.pre_path, label: item.post_path ? "Before" : "Pre-workout" },
      { kind: "post" as const, path: item.post_path, label: item.pre_path ? "After" : "Post-workout" },
    ] as const
  ).filter((s) => s.path);
  return (
    <article className="fx-card" data-testid="photo-card">
      <Head name={name} avatarName={item.display_name} avatar={item.avatar_url} ig={item.instagram_handle} sub={<>Pump check · {timeAgo(item.created_at, h.now)}</>} />
      <div className={`fx-pump${shots.length === 1 ? " single" : ""}`}>
        {shots.map((s) => (
          <TapMedia key={s.kind} className="fx-pump-shot" onDouble={() => h.onKudos(item, true)} onSingle={() => h.onOpenPump(item, s.kind)} label={`${s.label} photo`}>
            <Img path={s.path} urls={h.urls} />
            <span className="fx-media-tag">{s.label}</span>
          </TapMedia>
        ))}
      </div>
      <Actions item={item} h={h} />
      <Social item={item} h={h} />
    </article>
  );
}

// ---- member posts --------------------------------------------------------------
function Carousel({ media, urls, onDouble }: { media: Media[]; urls: Record<string, string>; onDouble: () => void }) {
  const [i, setI] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const go = (n: number) => ref.current?.scrollTo({ left: n * ref.current.clientWidth, behavior: "smooth" });
  return (
    <div className="fx-carousel">
      <div
        className="fx-track"
        ref={ref}
        onScroll={(e) => setI(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}
        tabIndex={media.length > 1 ? 0 : -1}
        aria-label={media.length > 1 ? `${media.length} photos, swipe to see more` : undefined}
        role={media.length > 1 ? "region" : undefined}
      >
        {media.map((m, n) => (
          <TapMedia key={m.path} className="fx-slide" onDouble={onDouble} label="Double-tap for kudos">
            <Img path={m.path} urls={urls} alt={media.length > 1 ? `Photo ${n + 1} of ${media.length}` : "Photo"} />
          </TapMedia>
        ))}
      </div>
      {media.length > 1 && (
        <>
          <span className="fx-count num" aria-hidden="true">
            {i + 1}/{media.length}
          </span>
          <div className="fx-dots">
            {media.map((m, n) => (
              <button key={m.path} type="button" className={n === i ? "on" : ""} onClick={() => go(n)} aria-label={`Show photo ${n + 1}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Compare({ before, after, weeks, urls, onDouble }: { before: string | null; after: string | null; weeks: number | null; urls: Record<string, string>; onDouble: () => void }) {
  const [x, setX] = useState(50);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef(false);
  const setFrom = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setX(Math.max(4, Math.min(96, ((clientX - r.left) / r.width) * 100)));
  };
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const lineX = r.left + (x / 100) * r.width;
    if (Math.abs(e.clientX - lineX) > 44) return; // not on the handle: let taps through
    drag.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  return (
    <div
      className="fx-compare"
      ref={box}
      style={{ ["--x" as string]: `${x}%` }}
      onPointerDown={down}
      onPointerMove={(e) => drag.current && setFrom(e.clientX)}
      onPointerUp={() => (drag.current = false)}
      onPointerCancel={() => (drag.current = false)}
    >
      <TapMedia className="fx-cmp-media" onDouble={onDouble} label="Double-tap for kudos">
        <span className="fx-cmp-after">
          <Img path={after} urls={urls} alt="After" />
        </span>
        <span className="fx-cmp-before">
          <Img path={before} urls={urls} alt="Before" />
        </span>
      </TapMedia>
      <span className="fx-cmp-line" aria-hidden="true">
        <i>
          <Icon name="compare" />
        </i>
      </span>
      <span className="fx-media-tag l">Before</span>
      <span className="fx-media-tag r">After</span>
      {weeks && <span className="fx-cmp-weeks">{apartLabel(weeks)} apart</span>}
      <input
        className="sr-only"
        type="range"
        min={4}
        max={96}
        value={Math.round(x)}
        onChange={(e) => setX(Number(e.target.value))}
        aria-label="Compare before and after"
      />
    </div>
  );
}

export function WallCard({ item, h }: { item: WallItem; h: Handlers }) {
  const name = item.is_mine ? "You" : item.display_name || "Member";
  const tag = machineLabel(item.machine_id, item.mode);
  const what = item.kind === "transformation" ? "Transformation" : item.kind === "photo" ? (item.media.length > 1 ? `${item.media.length} photos` : "Photo") : "Post";
  const short = item.kind === "text" && (item.body || "").length <= 90;
  const before = item.media.find((m) => m.label === "before")?.path ?? null;
  const after = item.media.find((m) => m.label === "after")?.path ?? null;
  const give = () => h.onKudos(item, true);
  return (
    <article className={`fx-card fx-wall k-${item.kind}${item.hidden ? " is-hidden" : ""}`} data-testid={`feed-${item.kind}`}>
      <Head
        name={name}
        avatarName={item.display_name}
        avatar={item.avatar_url}
        ig={item.instagram_handle}
        sub={
          <>
            {what} · {timeAgo(item.created_at, h.now)}
            {item.edited ? " · edited" : ""}
          </>
        }
        right={
          <button type="button" className="fx-more" onClick={() => h.onMenu(item)} aria-label={item.is_mine ? "Edit or delete your post" : "More, report this post"} data-testid="post-menu">
            <Icon name="more" />
          </button>
        }
      />
      {item.hidden && (
        <div className="fx-hidden-note" role="note">
          <Icon name="info" /> Hidden after members reported it. Staff will take a look.
        </div>
      )}
      {item.kind === "text" && item.body && <p className={`fx-body${short ? " big" : ""}`}>{item.body}</p>}
      {item.kind === "photo" && <Carousel media={item.media} urls={h.urls} onDouble={give} />}
      {item.kind === "transformation" && <Compare before={before} after={after} weeks={item.weeks_apart} urls={h.urls} onDouble={give} />}
      {item.kind !== "text" && item.body && <p className="fx-body cap">{item.body}</p>}
      {tag && item.machine_id && (
        <Link href={`/machine/${item.machine_id}/guide${item.mode ? `?mode=${item.mode}` : ""}`} className="fx-tag-chip" data-testid="machine-tag">
          <Icon name="tag" /> {MACHINE_MAP[item.machine_id]?.number} {tag}
        </Link>
      )}
      <Actions item={item} h={h} />
      <Social item={item} h={h} />
    </article>
  );
}

// ---- gym: notices + offers -------------------------------------------------------
export function NoticeCard({ post, onDismiss, now }: { post: GymPost; onDismiss?: () => void; now: number }) {
  const until = post.ends_at ? new Date(post.ends_at).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : null;
  return (
    <article className={`fx-card fx-notice${post.pinned ? " pinned" : ""}`} data-testid="feed-notice">
      <div className="fx-notice-top">
        <span className="fx-notice-label">
          <Icon name={post.pinned ? "pin" : "megaphone"} /> {post.pinned ? "Pinned" : "Gym notice"}
          {until ? ` · until ${until}` : ` · ${timeAgo(post.starts_at, now)}`}
        </span>
        {onDismiss && (
          <button type="button" className="fx-x" onClick={onDismiss} aria-label="Hide this notice" data-testid="dismiss-notice">
            <Icon name="x" />
          </button>
        )}
      </div>
      <h3 className="fx-notice-title">{post.title}</h3>
      {post.body && <p className="fx-notice-body">{post.body}</p>}
      {post.image_url && (
        <div className="fx-notice-img">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={post.image_url} alt="" loading="lazy" onError={(e) => (e.currentTarget.parentElement!.style.display = "none")} />
        </div>
      )}
      {post.cta_url && (
        <a className="fx-link-btn" href={post.cta_url} target="_blank" rel="noopener noreferrer">
          {post.cta_label || "Open"} <Icon name="external" />
        </a>
      )}
    </article>
  );
}

export function OfferCard({ post, onClick }: { post: GymPost; onClick?: (sponsorId: string | null) => void }) {
  // "Claim with XP" goes to the Shop, which is archived for launch.
  const shopOn = useFeature("rewardsShop");
  const xpOn = useFeature("xp");
  const link = sponsorLink(post.cta_url || post.sponsor?.website_url, `offer-${post.id}`);
  async function copy() {
    if (!post.code) return;
    try {
      await navigator.clipboard.writeText(post.code);
      toast(`Copied ${post.code}`);
    } catch {
      toast(`Code: ${post.code}`);
    }
  }
  return (
    <article className="fx-card fx-offer" data-testid="feed-offer">
      {post.image_url && (
        <div className="fx-offer-img">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={post.image_url} alt="" loading="lazy" onError={(e) => (e.currentTarget.parentElement!.style.display = "none")} />
        </div>
      )}
      <div className="fx-offer-body">
        <div className="fx-offer-brand">
          {post.sponsor?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.sponsor.logo_url} alt="" onError={(e) => (e.currentTarget.style.display = "none")} />
          ) : (
            <span className="fx-offer-mono" aria-hidden="true">
              {(post.sponsor?.name || "R").slice(0, 1)}
            </span>
          )}
          <span>
            <b>{post.sponsor?.name || "Racked"}</b>
            <small>Partner offer</small>
          </span>
        </div>
        <h3 className="fx-offer-title">{post.title}</h3>
        {post.body && <p className="fx-offer-text">{post.body}</p>}
        {post.code && (
          <button type="button" className="fx-code" onClick={copy} aria-label={`Copy code ${post.code}`} data-testid="offer-code">
            <span className="num">{post.code}</span>
            <Icon name="copy" />
          </button>
        )}
        <div className="fx-offer-ctas">
          {link && (
            <a className="btn btn-primary btn-sm" href={link} target="_blank" rel="noopener noreferrer" onClick={() => onClick?.(post.sponsor?.id ?? null)} data-testid="offer-cta">
              {post.cta_label || "Shop now"} <Icon name="external" />
            </a>
          )}
          {post.reward && shopOn && xpOn && (
            <Link className="btn btn-ghost btn-sm" href="/rewards?tab=shop" data-testid="offer-xp">
              <Icon name="ticket" /> Claim{post.reward.xp_cost ? ` · ${fmtXp(post.reward.xp_cost)} XP` : ""}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

// ---- milestones ----------------------------------------------------------------
export function MilestoneRow({ item, now }: { item: Extract<FeedItem, { type: "milestone" }>; now: number }) {
  const who = item.is_mine ? "You" : item.name;
  return (
    <div className="fx-milestone" data-testid="feed-milestone">
      <span className={`fx-ms-ic${item.kind === "streak" ? " streak" : ""}`} aria-hidden="true">
        <Icon name={item.kind === "streak" ? "flame" : "medal"} />
      </span>
      <span className="fx-ms-text">
        {item.kind === "streak" ? (
          <>
            <b>{who}</b> hit a <b>{item.days}-day</b> lifting streak
          </>
        ) : (
          <>
            <b>{who}</b> unlocked the <b>{item.title}</b> badge
          </>
        )}
      </span>
      <span className="fx-ms-time">{timeAgo(item.at, now)}</span>
    </div>
  );
}

// ---- rewards in the feed -----------------------------------------------------------
export function PrizeCard({ ov, me, now }: { ov: RewardsOverview; me: MyRewards | null; now: number }) {
  const s = ov.season!;
  const prize = s.prizes[0];
  const leader = s.leader;
  const mine = me?.season;
  const word = s.period === "month" ? "month" : "week";
  const strength = ov.scoring === "strength";
  const unit = strength ? "pts" : "XP";
  const race = mine?.division === "women" ? "Women's" : "Men's";
  let you: string | null = null;
  if (strength && me && !me.body?.body_kg) you = "Add your body weight to race for it";
  else if (strength && me && !mine?.division) you = "Prizes are for the Men's and Women's races";
  else if (mine?.rank === 1) you = strength ? `You're #1 on the ${race} board. Hold on to it!` : "You're #1. Hold on to it!";
  else if (mine?.rank && mine.ahead) you = `You're #${mine.rank}${strength ? ` (${race})` : ""} · ${fmtXp(mine.ahead.score - mine.score + 1)} ${unit} to pass ${mine.ahead.name}`;
  else if (mine) you = "Log a set to get on the board";
  const leaders = strength ? s.leaders : null;
  return (
    <Link href="/rewards" className="fx-card fx-prize" data-testid="feed-prize">
      <span className="fx-prize-art" aria-hidden="true">
        {prize?.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={prize.image_url} alt="" />
        ) : (
          <Icon name="gift" />
        )}
      </span>
      <span className="fx-prize-copy">
        <span className="fx-prize-eyebrow">
          {ov.settings?.prize_headline || `This ${word}'s prize`} · <span className="nowrap">{timeLeft(s.ends_at, now)} left</span>
        </span>
        <b className="fx-prize-title">{prize ? (strength && prize.rank_from === 1 && prize.rank_to === 1 ? `#1 Men & #1 Women win ${prize.title}` : `${prizeRankLabel(prize)} wins ${prize.title}`) : s.title}</b>
        {leaders ? (
          <span className="fx-prize-lead two" data-testid="prize-leaders">
            <span>
              <Icon name="flame" /> Men: {leaders.men ? `${leaders.men.name} · ${fmtXp(leaders.men.score)} pts` : "open"}
            </span>
            <span>
              <Icon name="flame" /> Women: {leaders.women ? `${leaders.women.name} · ${fmtXp(leaders.women.score)} pts` : "open"}
            </span>
          </span>
        ) : (
          <span className="fx-prize-lead">
            <Icon name="flame" /> {leader ? `${leader.name} leads · ${fmtXp(leader.score)} XP` : "Nobody yet. First set takes #1"}
          </span>
        )}
        {you && <span className="fx-prize-you">{you}</span>}
      </span>
      <Icon name="chev" />
    </Link>
  );
}

export function ChallengeCard({ c, now, strength = false }: { c: Challenge; now: number; strength?: boolean }) {
  const st = challengeStatus(c, now);
  const m = c.machine_id ? MACHINE_MAP[c.machine_id] : null;
  const lead = (l: { name: string; value: number; reps: number | null } | null | undefined) =>
    l ? `${l.name} · ${metricValue(c.metric, Number(l.value), l.reps, strength)}` : "open";
  return (
    <article className={`fx-card fx-chal${st.live ? " live" : ""}`} data-testid="feed-challenge">
      <span className="fx-chal-status">
        {st.live && <i aria-hidden="true" />}
        {st.live ? `Live now · ${timeLeft(c.ends_at, now)} left` : c.repeats === "weekly" && c.weekday ? `Every ${weekdayName(c.weekday)}` : st.label}
      </span>
      <h3 className="fx-chal-title">{c.title}</h3>
      {c.prize && (
        <p className="fx-chal-prize">
          <Icon name="gift" /> Win {c.prize.replace(/^an? /i, (x) => x.toLowerCase())}
        </p>
      )}
      <div className="fx-chal-foot">
        <span>
          {st.live && strength && c.leaders && (c.leaders.men || c.leaders.women) ? (
            <span className="fx-chal-leads">
              <span>
                Men <b>{lead(c.leaders.men)}</b>
              </span>
              <span>
                Women <b>{lead(c.leaders.women)}</b>
              </span>
            </span>
          ) : st.live && c.leader ? (
            <>
              <b>{c.leader.name}</b> leads · {metricValue(c.metric, Number(c.leader.value), c.leader.reps, strength)}
            </>
          ) : c.last_result ? (
            <>
              Last winner <b>{c.last_result.name}</b> · {metricValue(c.metric, Number(c.last_result.value), c.last_result.reps, strength)}
            </>
          ) : (
            <>{c.players > 0 ? `${c.players} in` : "Be the first in"}</>
          )}
        </span>
        <Link href="/rewards#challenges" className="fx-link-btn">
          {m ? `${m.number} ${m.name}` : "See the board"} <Icon name="chev" />
        </Link>
      </div>
    </article>
  );
}

export function WinnersCard({ w }: { w: NonNullable<RewardsOverview["last_winners"]> }) {
  const split = w.winners.some((x) => x.division === "men" || x.division === "women");
  if (split) {
    const men = w.winners.filter((x) => x.division === "men").slice(0, 3);
    const women = w.winners.filter((x) => x.division === "women").slice(0, 3);
    const firsts = [men[0]?.name, women[0]?.name].filter(Boolean).join(" and ");
    return (
      <article className="fx-card fx-winners" data-testid="feed-winners">
        <span className="fx-prize-eyebrow">{w.season} · winners</span>
        <h3 className="fx-chal-title">Well lifted, {firsts}!</h3>
        <div className="fx-win-split">
          {[
            ["Men", men],
            ["Women", women],
          ].map(([label, list]) => (
            <div key={label as string}>
              <span className="fx-win-board">{label as string}</span>
              <ol className="fx-win-list">
                {(list as typeof men).map((x) => (
                  <li key={x.rank}>
                    <span className={`fx-win-rank r${x.rank}`}>{x.rank}</span>
                    <b>{x.name}</b>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </article>
    );
  }
  const top = w.winners.slice(0, 3);
  return (
    <article className="fx-card fx-winners" data-testid="feed-winners">
      <span className="fx-prize-eyebrow">{w.season} · winners</span>
      <h3 className="fx-chal-title">Well lifted, {top[0]?.name}!</h3>
      <ol className="fx-win-list">
        {top.map((x) => (
          <li key={x.rank}>
            <span className={`fx-win-rank r${x.rank}`}>{x.rank}</span>
            <b>{x.name}</b>
            {x.prize && <small>{x.prize}</small>}
          </li>
        ))}
      </ol>
    </article>
  );
}

export function WonCard({ r }: { r: Redemption }) {
  return (
    <Link href="/rewards#mine" className="fx-card fx-won" data-testid="rw-won-card">
      <span className="fx-won-ic" aria-hidden="true">
        <Icon name="trophy" />
      </span>
      <span className="fx-prize-copy">
        <span className="fx-prize-eyebrow">You won{r.rank ? ` · #${r.rank}` : ""}</span>
        <b className="fx-prize-title">{r.title}</b>
        <span className="fx-prize-you">{r.code ? `Show code ${r.code} at the front desk` : "Collect it at the front desk"}</span>
      </span>
      <Icon name="chev" />
    </Link>
  );
}
