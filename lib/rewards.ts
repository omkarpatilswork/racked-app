// Rewards: XP wallet, weekly missions, lifting streaks, badges, the season
// prize race, sponsor challenges, the XP shop and sponsor showcase.
// Everything is worked out in the database (0011_rewards.sql); this file only
// calls those functions and shapes the results for the screens.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { TvPartner } from "@/lib/tvSlides";
import { featureOn } from "@/lib/featureFlags";

export type Client = SupabaseClient<Database>;

// The hand-kept Database types don't list the 0011 functions, so these calls
// go through a small untyped wrapper.
type Rpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
function rpc(supabase: Client, fn: string, args?: Record<string, unknown>) {
  return (supabase as unknown as { rpc: Rpc }).rpc(fn, args);
}

async function call<T>(supabase: Client, fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(supabase, fn, args);
  if (error) throw error;
  return data as T;
}

// ---- types ---------------------------------------------------------------
export type SponsorProduct = { id: number; title: string; subtitle: string | null; price_text: string | null; image_url: string | null; url: string | null };
export type Sponsor = {
  id: string;
  name: string;
  tagline: string | null;
  blurb: string | null;
  website_url: string | null;
  instagram_url: string | null;
  logo_url: string | null;
  category: string | null;
  cover_url?: string | null;
  // on the gym TV (0013)
  show_on_tv?: boolean;
  tv_headline?: string | null;
  products: SponsorProduct[];
};
export type Prize = { id: number; rank_from: number; rank_to: number; title: string; description: string | null; sponsor_ids: string[]; image_url?: string | null };
export type Season = {
  id: number;
  title: string;
  period: "week" | "month";
  starts_at: string;
  ends_at: string;
  prizes: Prize[];
  players: number;
  leader?: { name: string; score: number } | null;
  // 0015: strength points, a race each for Men and Women
  leaders?: { men: { name: string; score: number } | null; women: { name: string; score: number } | null } | null;
  players_by?: { men: number; women: number } | null;
};
export type DivLeader = { name: string; value: number; reps: number | null } | null;
// Gym + Rewards-page settings, edited in R&R Controls (0012)
export type RrSettings = {
  gym_name: string;
  gym_location: string | null;
  gym_logo_url: string | null;
  gym_logo_dark_url: string | null;
  gym_instagram_url: string | null;
  gym_website_url: string | null;
  prize_headline: string | null;
  rewards_note: string | null;
  show_partners: boolean;
  show_shop: boolean;
  tv_slides?: unknown; // 0013: times per loop + seconds, per kind of TV slide
};
export type CodeMode = "shared" | "pool" | "desk";
export type ShopItem = {
  id: number;
  sponsor_id: string | null;
  title: string;
  description: string | null;
  image_url: string | null;
  xp_cost: number;
  code_mode: CodeMode;
  stock_left: number | null;
  per_member_limit: number;
  valid_until: string | null;
};
export type Metric = "best_lift" | "sets" | "volume";
export type Challenge = {
  id: number;
  sponsor_id: string | null;
  title: string;
  description: string | null;
  metric: Metric;
  machine_id: string | null;
  mode: string | null;
  starts_at: string;
  ends_at: string;
  prize: string | null;
  winners: number;
  join_xp: number;
  players: number;
  leader: { name: string; value: number; reps: number | null } | null;
  leaders?: { men: DivLeader; women: DivLeader } | null; // 0015
  // weekly challenges (0012)
  series_id?: number | null;
  repeats?: "weekly" | null;
  weekday?: number; // 1 = Monday ... 7 = Sunday (gym time)
  last_result?: { ends_at: string; name: string; value: number; reps: number | null; winners?: { men: DivLeader; women: DivLeader } | null } | null;
};
export type MissionDef = { id: string; title: string; description: string; metric: "sets" | "days" | "machines" | "pbs" | "volume"; target: number; xp: number; icon: string; sort: number };
export type BadgeDef = { id: string; title: string; description: string; xp: number; icon: string; sort: number };
export type RewardsOverview = {
  period: "week" | "month";
  scoring?: "strength"; // 0015: the race is strength points (×BW), Men's and Women's
  settings?: RrSettings | null;
  season: Season | null;
  sponsors: Sponsor[];
  shop: ShopItem[];
  challenges: Challenge[];
  missions: MissionDef[];
  badges: BadgeDef[];
  streak_steps: { days: number; xp: number }[];
  last_winners: {
    season: string;
    scoring?: "strength" | "xp";
    winners: { rank: number; name: string; score: number; prize: string | null; division?: "men" | "women" | "all" }[];
  } | null;
};
export type Redemption = {
  id: number;
  title: string;
  sponsor_id: string | null;
  source: "shop" | "prize" | "challenge";
  code: string | null;
  code_mode: CodeMode;
  how_to_use: string | null;
  xp_spent: number;
  status: "issued" | "fulfilled" | "cancelled";
  rank: number | null;
  created_at: string;
};
export type MyRewards = {
  wallet: { training: number; bonus: number; spent: number; on_hold: number; lifetime: number; balance: number };
  season: {
    id: number;
    title: string;
    period: "week" | "month";
    ends_at: string;
    rank: number | null;
    score: number;
    players: number;
    ahead: { name: string; score: number } | null;
    top_prize: string | null;
    division?: "men" | "women" | null; // 0015: your race (null = no body weight yet, or prefer not to say)
    scoring?: "strength";
  } | null;
  body?: { division: "men" | "women" | "open" | null; body_kg: number | null; checked_at?: string | null } | null;
  week: { sets: number; days: number; machines: number; pbs: number; volume: number };
  missions_done: string[];
  streak: { days: number; started: string | null; claimed: number[] };
  badges: { id: string; at: string }[];
  redemptions: Redemption[];
  claimed_rewards: Record<string, number>;
  challenges: { id: number; rank: number; value: number; reps: number | null; division?: string }[];
  recent: { kind: string; title: string; amount: number; at: string }[];
};
export type BoardRow = { rank: number; name: string; score: number; is_me: boolean };
export type ChallengeRow = { rank: number; name: string; value: number; reps: number | null; is_me: boolean };
export type NewAward = { kind: "mission" | "streak" | "badge" | "challenge"; id: string; title: string; xp: number };
export type RedeemResult = {
  id: number;
  title: string;
  code: string | null;
  code_mode: CodeMode;
  how_to_use: string | null;
  sponsor_id: string | null;
  xp_spent: number;
  balance: number;
};

// ---- member + public calls -----------------------------------------------
export async function fetchRewardsOverview(supabase: Client): Promise<RewardsOverview> {
  const o = await call<RewardsOverview>(supabase, "rewards_overview");
  return {
    ...o,
    sponsors: o.sponsors || [],
    shop: (o.shop || []).map((x) => ({ ...x, xp_cost: Number(x.xp_cost) })),
    challenges: (o.challenges || []).map((c) => ({
      ...c,
      leader: c.leader ? { ...c.leader, value: Number(c.leader.value) } : null,
      last_result: c.last_result ? { ...c.last_result, value: Number(c.last_result.value) } : null,
    })),
    missions: (o.missions || []).map((m) => ({ ...m, target: Number(m.target) })),
    badges: o.badges || [],
    streak_steps: o.streak_steps || [],
  };
}

export async function fetchMyRewards(supabase: Client): Promise<MyRewards> {
  const m = await call<MyRewards>(supabase, "my_rewards");
  return {
    ...m,
    week: { ...m.week, volume: Number(m.week?.volume || 0) },
    challenges: (m.challenges || []).map((c) => ({ ...c, value: Number(c.value) })),
    missions_done: m.missions_done || [],
    badges: m.badges || [],
    redemptions: m.redemptions || [],
    claimed_rewards: m.claimed_rewards || {},
    recent: m.recent || [],
    streak: { days: m.streak?.days || 0, started: m.streak?.started || null, claimed: m.streak?.claimed || [] },
  };
}

// Pays out anything due (missions, streak steps, badges, challenge joins).
// Safe to call as often as you like; returns only what's new.
export async function syncMyRewards(supabase: Client): Promise<NewAward[]> {
  const r = await call<NewAward[]>(supabase, "sync_my_rewards");
  return Array.isArray(r) ? r : [];
}

export async function redeemReward(supabase: Client, rewardId: number): Promise<RedeemResult> {
  return call<RedeemResult>(supabase, "redeem_reward", { p_reward_id: rewardId });
}

// division (0015): "men" | "women" | "all". Before 0015: one XP board.
export async function fetchSeasonBoard(supabase: Client, seasonId: number | null = null, limit = 10, division?: "men" | "women" | "all"): Promise<BoardRow[]> {
  let rows: BoardRow[];
  try {
    rows = division
      ? await call<BoardRow[]>(supabase, "season_division_board", { p_division: division, p_season_id: seasonId, p_limit: limit })
      : await call<BoardRow[]>(supabase, "season_board", { p_season_id: seasonId, p_limit: limit });
  } catch (e) {
    if (!division || !isMissingRewards(e)) throw e;
    rows = await call<BoardRow[]>(supabase, "season_board", { p_season_id: seasonId, p_limit: limit });
  }
  return (rows || []).map((r) => ({ ...r, score: Number(r.score) }));
}

export async function fetchChallengeBoard(supabase: Client, id: number, limit = 20, division?: "men" | "women" | "all"): Promise<ChallengeRow[]> {
  let rows: ChallengeRow[];
  try {
    rows = division
      ? await call<ChallengeRow[]>(supabase, "challenge_division_board", { p_id: id, p_division: division, p_limit: limit })
      : await call<ChallengeRow[]>(supabase, "challenge_board", { p_id: id, p_limit: limit });
  } catch (e) {
    if (!division || !isMissingRewards(e)) throw e;
    rows = await call<ChallengeRow[]>(supabase, "challenge_board", { p_id: id, p_limit: limit });
  }
  return (rows || []).map((r) => ({ ...r, value: Number(r.value) }));
}

export function trackSponsorClick(supabase: Client, sponsorId: string, productId: number | null = null) {
  // fire and forget: never block opening the sponsor's site
  rpc(supabase, "track_sponsor_click", { p_sponsor_id: sponsorId, p_product_id: productId }).then(
    () => undefined,
    () => undefined
  );
}

// Everything the gym TV shows besides the boards: the prize race, challenges,
// partner ads, last week's winners and the slide settings (tv_feed(), 0013).
// Before 0013 is run it's pieced together from the Rewards page data.
export type TvFeed = {
  slides: unknown;
  prizeHeadline: string | null;
  season: Season | null;
  top: BoardRow[];
  // 0015: top 5 of each race (strength points)
  tops: { men: BoardRow[]; women: BoardRow[] } | null;
  partners: TvPartner[];
  sponsors: Sponsor[];
  challenges: Challenge[];
  lastWinners: RewardsOverview["last_winners"];
};

type TvFeedRaw = RewardsOverview & {
  tv_slides?: unknown;
  tv_partners?: { id: string; tv_headline: string | null }[];
  season_top?: { rank: number; name: string; score: number }[];
  season_tops?: { men: { rank: number; name: string; score: number }[]; women: { rank: number; name: string; score: number }[] } | null;
};

export async function fetchTvFeed(supabase: Client): Promise<TvFeed> {
  let raw: TvFeedRaw;
  try {
    raw = await call<TvFeedRaw>(supabase, "tv_feed");
  } catch (e) {
    if (!isMissingRewards(e)) throw e;
    raw = await fetchRewardsOverview(supabase);
    raw.season_top = raw.season ? await fetchSeasonBoard(supabase, raw.season.id, 5).catch(() => []) : [];
  }
  const sponsors = raw.sponsors || [];
  const onTv = raw.tv_partners ? new Map(raw.tv_partners.map((p) => [p.id, p.tv_headline])) : null;
  const partners: TvPartner[] = sponsors
    .filter((sp) => !onTv || onTv.has(sp.id))
    .map((sp) => ({
      id: sp.id,
      name: sp.name,
      tagline: sp.tagline,
      logo_url: sp.logo_url,
      cover_url: sp.cover_url ?? null,
      website_url: sp.website_url,
      products: sp.products || [],
      tv_headline: onTv?.get(sp.id) ?? null,
    }));
  return {
    slides: raw.tv_slides ?? raw.settings?.tv_slides ?? null,
    prizeHeadline: raw.settings?.prize_headline ?? null,
    season: raw.season,
    top: (raw.season_top || []).map((r) => ({ rank: Number(r.rank), name: r.name, score: Number(r.score), is_me: false })),
    tops: raw.season_tops
      ? {
          men: (raw.season_tops.men || []).map((r) => ({ rank: Number(r.rank), name: r.name, score: Number(r.score), is_me: false })),
          women: (raw.season_tops.women || []).map((r) => ({ rank: Number(r.rank), name: r.name, score: Number(r.score), is_me: false })),
        }
      : null,
    partners,
    sponsors,
    challenges: raw.challenges || [],
    lastWinners: raw.last_winners,
  };
}

// The link behind a partner's QR code on the TV: our own /go/<brand> page
// counts the scan, then sends the phone on to the brand's site.
export function tvPartnerLink(origin: string, sponsorId: string, productId?: number | null) {
  const q = new URLSearchParams({ src: "tv" });
  if (productId) q.set("p", String(productId));
  return `${origin}/go/${encodeURIComponent(sponsorId)}?${q}`;
}

export function siteHost(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// ---- helpers -------------------------------------------------------------
// Tag sponsor links so the brands can see visits from Racked in their analytics.
export function sponsorLink(url: string | null | undefined, content?: string, medium: "app" | "tv" = "app"): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return null;
    u.searchParams.set("utm_source", "racked");
    u.searchParams.set("utm_medium", medium);
    u.searchParams.set("utm_campaign", medium === "tv" ? "gym-tv" : "rewards");
    if (content) u.searchParams.set("utm_content", content);
    return u.toString();
  } catch {
    return null;
  }
}

export function timeLeft(endsAt: string | null | undefined, now = Date.now()): string {
  if (!endsAt) return "";
  const ms = new Date(endsAt).getTime() - now;
  if (ms <= 0) return "Ended";
  const mins = Math.floor(ms / 60000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${Math.max(1, m)}m`;
}

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const weekdayName = (d: number | undefined | null) => (d && d >= 1 && d <= 7 ? WEEKDAYS[d - 1] : "");

// "Live today · ends in 5h", "Starts Friday", "Ended"
export function challengeStatus(c: Pick<Challenge, "starts_at" | "ends_at" | "weekday">, now = Date.now()) {
  const s = new Date(c.starts_at).getTime();
  const e = new Date(c.ends_at).getTime();
  if (now >= e) return { live: false, ended: true, label: "Ended" };
  if (now >= s) return { live: true, ended: false, label: `Live now · ends in ${timeLeft(c.ends_at, now)}` };
  const days = Math.floor((s - now) / 86400000);
  const label = days < 1 ? `Starts in ${timeLeft(c.starts_at, now)}` : days < 7 ? `Starts ${weekdayName(c.weekday) || new Date(c.starts_at).toLocaleDateString(undefined, { weekday: "long" })}` : `Starts ${new Date(c.starts_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
  return { live: false, ended: false, label };
}

// XP gap -> "about N sets" (a set is 10 XP before bonuses)
export function setsFor(xp: number) {
  return Math.max(1, Math.ceil(xp / 10));
}

export function prizeRankLabel(p: { rank_from: number; rank_to: number }) {
  return p.rank_from === p.rank_to ? `#${p.rank_from}` : `#${p.rank_from}–${p.rank_to}`;
}

export function prizeForRank(prizes: Prize[] | undefined, rank: number | null | undefined) {
  if (!prizes || !rank) return null;
  return prizes.find((p) => rank >= p.rank_from && rank <= p.rank_to) || null;
}

// bw: 0015 scoring (best lift = ×BW, volume = kg moved ÷ body weight)
export function metricLabel(metric: Metric, bw = false) {
  if (bw) return metric === "best_lift" ? "Best score" : metric === "sets" ? "Most sets" : "Most kg moved for your size";
  return metric === "best_lift" ? "Heaviest set" : metric === "sets" ? "Most sets" : "Most volume";
}

export function metricValue(metric: Metric, value: number, reps?: number | null, bw = false) {
  if (bw && metric === "best_lift") return `Score ${Math.round(Number(value) * 100)}${reps ? ` · ${reps} reps` : ""}`;
  if (bw && metric === "volume") return `Score ${Math.round(Number(value) * 100).toLocaleString("en-IN")}`;
  if (metric === "best_lift") return `${trim(value)} kg${reps ? ` × ${reps}` : ""}`;
  if (metric === "sets") return `${Math.round(value)} set${Math.round(value) === 1 ? "" : "s"}`;
  return `${Math.round(value).toLocaleString("en-IN")} kg`;
}

function trim(n: number) {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

export function fmtXp(n: number | null | undefined) {
  return Math.round(Number(n || 0)).toLocaleString("en-IN");
}

// One toast line for whatever was just unlocked.
export function awardsToast(awards: NewAward[]): string | null {
  if (!awards.length) return null;
  const total = awards.reduce((s, a) => s + (a.xp || 0), 0);
  // XP is archived for launch (features.xp): same toast, no "+N XP".
  const xp = featureOn("xp");
  if (awards.length === 1) {
    const a = awards[0];
    const what = a.kind === "mission" ? "Mission complete" : a.kind === "badge" ? "Badge unlocked" : a.kind === "streak" ? "Streak bonus" : "Challenge joined";
    return `${what}: ${a.title}${xp && a.xp ? ` · +${a.xp} XP` : ""}`;
  }
  return `${awards.length} rewards unlocked${xp && total ? ` · +${total} XP` : ""}`;
}

/** The race and challenges are scored by ×BW (database update 0015). */
export const isStrength = (ov: { scoring?: string } | null | undefined) => ov?.scoring === "strength";

export function isMissingRewards(err: unknown) {
  const code = (err as { code?: string } | null)?.code;
  return code === "PGRST202" || code === "42883" || code === "42P01" || code === "PGRST205";
}

// ---- staff ---------------------------------------------------------------
export type AdminReward = {
  id: number;
  sponsor_id: string | null;
  title: string;
  description: string | null;
  how_to_use: string | null;
  image_url: string | null;
  xp_cost: number | null;
  code_mode: CodeMode;
  stock: number | null;
  per_member_limit: number;
  valid_until: string | null;
  active: boolean;
  sort: number;
  issued: number;
  codes_left: number;
  shared_code: string | null;
};
export type AdminChallenge = Omit<Challenge, "leader" | "players"> & {
  active: boolean;
  awarded_at: string | null;
  reward_id: number | null;
  players: number;
  top: { rank: number; name: string; value: number; reps: number | null }[];
  tops?: { men: AdminChallengeTop[]; women: AdminChallengeTop[] } | null; // 0015
};
export type AdminChallengeTop = { rank: number; name: string; value: number; reps: number | null; weight?: number | null; demo?: boolean };
export type AdminSponsor = Omit<Sponsor, "products"> & {
  active: boolean;
  sort: number;
  products: (SponsorProduct & { active: boolean; sort: number; sponsor_id: string })[];
  clicks_7d: number;
  clicks_30d: number;
  redeemed_30d: number;
};
export type AdminRedemption = {
  id: number;
  title: string;
  code: string | null;
  source: Redemption["source"];
  status: Redemption["status"];
  rank: number | null;
  xp_spent: number;
  created_at: string;
  fulfilled_at: string | null;
  member: string;
  sponsor_id: string | null;
};
export type AdminLiveRow = { rank: number; name: string; score: number; flagged: number; demo?: boolean };
export type AdminAwardRow = { rank: number; uid: string; name: string; score: number; flagged: number; body_kg: number | null; checked_at: string | null; prize: string | null };
export type PrizeRow = {
  id?: number;
  rank_from: number;
  rank_to: number;
  title: string;
  description: string | null;
  sponsor_ids: string[];
  reward_id?: number | null;
  image_url?: string | null;
};
export type AdminRewardsData = {
  period: "week" | "month";
  season: { id: number; title: string; period: "week" | "month"; starts_at: string; ends_at: string; awarded_at: string | null };
  season_prizes: PrizeRow[];
  templates: PrizeRow[];
  live_board: { rank: number; name: string; score: number; flagged: number }[];
  // 0015: strength points, Men's and Women's races
  scoring?: "strength";
  live_boards?: { men: AdminLiveRow[]; women: AdminLiveRow[] } | null;
  to_award: {
    id: number;
    title: string;
    ends_at: string;
    board: { rank: number; name: string; score: number; flagged: number; prize: string | null }[];
    boards?: { men: AdminAwardRow[]; women: AdminAwardRow[] } | null;
  }[];
  seasons: {
    id: number;
    title: string;
    period: string;
    starts_at: string;
    ends_at: string;
    awarded_at: string | null;
    winners: { rank: number; name: string; score: number; division?: "men" | "women" | "all" }[];
  }[];
  rewards: AdminReward[];
  challenges: AdminChallenge[];
  sponsors: AdminSponsor[];
  redemptions: AdminRedemption[];
};

export async function adminRewardsData(supabase: Client): Promise<AdminRewardsData> {
  const d = await call<AdminRewardsData>(supabase, "admin_rewards_data");
  return {
    ...d,
    season_prizes: d.season_prizes || [],
    templates: d.templates || [],
    live_board: d.live_board || [],
    to_award: d.to_award || [],
    seasons: d.seasons || [],
    rewards: d.rewards || [],
    challenges: (d.challenges || []).map((c) => ({ ...c, top: (c.top || []).map((t) => ({ ...t, value: Number(t.value) })) })),
    sponsors: d.sponsors || [],
    redemptions: d.redemptions || [],
  };
}

export const adminSetSeasonPeriod = (s: Client, period: "week" | "month") => call<null>(s, "admin_set_season_period", { p_period: period });
export const adminSavePrizes = (s: Client, prizes: PrizeRow[], applyCurrent = true) =>
  call<null>(s, "admin_save_prizes", {
    p_prizes: prizes.map((p) => ({
      rank_from: p.rank_from,
      rank_to: p.rank_to,
      title: p.title,
      description: p.description,
      sponsor_ids: p.sponsor_ids,
      reward_id: p.reward_id ?? null,
      image_url: p.image_url ?? null,
    })),
    p_apply_current: applyCurrent,
  });
export const adminAwardSeason = (s: Client, id: number) => call<{ rank: number; prize: string; division?: string }[]>(s, "admin_award_season", { p_season_id: id });
export const adminUpdateRedemption = (s: Client, id: number, status: "fulfilled" | "cancelled") =>
  call<null>(s, "admin_update_redemption", { p_id: id, p_status: status });
export const adminSaveReward = (s: Client, p: Record<string, unknown>) => call<number>(s, "admin_save_reward", { p });
export const adminAddRewardCodes = (s: Client, rewardId: number, codes: string, shared: boolean) =>
  call<number>(s, "admin_add_reward_codes", { p_reward_id: rewardId, p_codes: codes, p_shared: shared });
export const adminSaveChallenge = (s: Client, p: Record<string, unknown>) => call<number>(s, "admin_save_challenge", { p });
export const adminAwardChallenge = (s: Client, id: number) => call<{ rank: number }[]>(s, "admin_award_challenge", { p_id: id });
export const adminSaveSponsor = (s: Client, p: Record<string, unknown>) => call<string>(s, "admin_save_sponsor", { p });
export const adminSaveProduct = (s: Client, p: Record<string, unknown>) => call<number>(s, "admin_save_product", { p });
export const adminDeleteProduct = (s: Client, id: number) => call<null>(s, "admin_delete_product", { p_id: id });
export const adminBonusXp = (s: Client, uid: string, amount: number, reason: string) =>
  call<null>(s, "admin_bonus_xp", { p_uid: uid, p_amount: amount, p_reason: reason });

// ---- R&R Controls (0012) ---------------------------------------------------
export type AdminSeries = {
  id: number;
  sponsor_id: string | null;
  title: string;
  description: string | null;
  metric: Metric;
  machine_id: string | null;
  mode: string | null;
  prize: string | null;
  reward_id: number | null;
  winners: number;
  join_xp: number;
  active: boolean;
  weekday: number;
  start_time: string;
  end_time: string;
  next: { id: number; starts_at: string; ends_at: string; players: number } | null;
};
export type AdminChallengeRow = AdminChallenge & { series_id: number | null };
export type AdminRrData = Omit<AdminRewardsData, "challenges"> & {
  settings: RrSettings;
  series: AdminSeries[];
  challenges: AdminChallengeRow[];
  tv_scans_30d?: Record<string, number>; // 0013: TV QR scans per brand
};

export async function adminRrData(supabase: Client): Promise<AdminRrData> {
  const d = await call<AdminRrData>(supabase, "admin_rr_data");
  return {
    ...d,
    season_prizes: d.season_prizes || [],
    templates: d.templates || [],
    live_board: d.live_board || [],
    to_award: d.to_award || [],
    seasons: d.seasons || [],
    rewards: d.rewards || [],
    series: d.series || [],
    challenges: (d.challenges || []).map((c) => ({ ...c, top: (c.top || []).map((t) => ({ ...t, value: Number(t.value) })) })),
    sponsors: d.sponsors || [],
    redemptions: d.redemptions || [],
    tv_scans_30d: d.tv_scans_30d || {},
  };
}
export const adminSaveSeries = (s: Client, p: Record<string, unknown>) => call<number>(s, "admin_save_series", { p });
export const adminSaveRrSettings = (s: Client, p: Partial<RrSettings>) => call<null>(s, "admin_save_rr_settings", { p });

// Photos for prizes, brands and products: shrunk in the browser, then put in
// the public "rr-media" bucket (staff only can upload).
export async function uploadRrPhoto(supabase: Client, file: File, folder: "prizes" | "brands" | "products" | "gym" | "shop" | "feed"): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("Use a PNG, JPG or WebP picture");
  const keepPng = file.type === "image/png"; // logos keep their see-through background
  const blob = await shrinkImage(file, folder === "gym" || folder === "brands" ? 1200 : 1600, keepPng ? "image/png" : "image/jpeg");
  if (blob.size > 5 * 1024 * 1024) throw new Error("That picture is too big (5 MB max)");
  const ext = keepPng ? "png" : "jpg";
  const name = `${folder}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("rr-media").upload(name, blob, { contentType: keepPng ? "image/png" : "image/jpeg", cacheControl: "31536000", upsert: false });
  if (error) throw error;
  return supabase.storage.from("rr-media").getPublicUrl(name).data.publicUrl;
}

async function shrinkImage(file: File, max: number, type: string): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.type === type) return file;
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    const ctx = c.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise<Blob>((res) => c.toBlob((b) => res(b || file), type, 0.86));
  } catch {
    return file;
  }
}
