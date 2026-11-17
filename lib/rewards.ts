// Rewards: XP wallet, weekly missions, lifting streaks, badges, the season
// prize race, sponsor challenges, the XP shop and sponsor showcase.
// Everything is worked out in the database (0011_rewards.sql); this file only
// calls those functions and shapes the results for the screens.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

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
  products: SponsorProduct[];
};
export type Prize = { id: number; rank_from: number; rank_to: number; title: string; description: string | null; sponsor_ids: string[] };
export type Season = { id: number; title: string; period: "week" | "month"; starts_at: string; ends_at: string; prizes: Prize[]; players: number };
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
};
export type MissionDef = { id: string; title: string; description: string; metric: "sets" | "days" | "machines" | "pbs" | "volume"; target: number; xp: number; icon: string; sort: number };
export type BadgeDef = { id: string; title: string; description: string; xp: number; icon: string; sort: number };
export type RewardsOverview = {
  period: "week" | "month";
  season: Season | null;
  sponsors: Sponsor[];
  shop: ShopItem[];
  challenges: Challenge[];
  missions: MissionDef[];
  badges: BadgeDef[];
  streak_steps: { days: number; xp: number }[];
  last_winners: { season: string; winners: { rank: number; name: string; score: number; prize: string | null }[] } | null;
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
  } | null;
  week: { sets: number; days: number; machines: number; pbs: number; volume: number };
  missions_done: string[];
  streak: { days: number; started: string | null; claimed: number[] };
  badges: { id: string; at: string }[];
  redemptions: Redemption[];
  claimed_rewards: Record<string, number>;
  challenges: { id: number; rank: number; value: number; reps: number | null }[];
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
    challenges: (o.challenges || []).map((c) => ({ ...c, leader: c.leader ? { ...c.leader, value: Number(c.leader.value) } : null })),
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

export async function fetchSeasonBoard(supabase: Client, seasonId: number | null = null, limit = 10): Promise<BoardRow[]> {
  const rows = await call<BoardRow[]>(supabase, "season_board", { p_season_id: seasonId, p_limit: limit });
  return (rows || []).map((r) => ({ ...r, score: Number(r.score) }));
}

export async function fetchChallengeBoard(supabase: Client, id: number, limit = 20): Promise<ChallengeRow[]> {
  const rows = await call<ChallengeRow[]>(supabase, "challenge_board", { p_id: id, p_limit: limit });
  return (rows || []).map((r) => ({ ...r, value: Number(r.value) }));
}

export function trackSponsorClick(supabase: Client, sponsorId: string, productId: number | null = null) {
  // fire and forget: never block opening the sponsor's site
  rpc(supabase, "track_sponsor_click", { p_sponsor_id: sponsorId, p_product_id: productId }).then(
    () => undefined,
    () => undefined
  );
}

// The gym TV's prize slide: this season's prizes + top 5 (first names only).
export type TvPrize = { title: string; period: "week" | "month"; endsAt: string; prizes: Prize[]; top: BoardRow[]; sponsors: string[] };
export async function fetchTvPrize(supabase: Client): Promise<TvPrize | null> {
  const ov = await fetchRewardsOverview(supabase);
  if (!ov.season || ov.season.prizes.length === 0) return null;
  const top = await fetchSeasonBoard(supabase, ov.season.id, 5).catch(() => [] as BoardRow[]);
  const ids = new Set(ov.season.prizes.flatMap((p) => p.sponsor_ids || []));
  return {
    title: ov.season.title,
    period: ov.season.period,
    endsAt: ov.season.ends_at,
    prizes: ov.season.prizes,
    top: top.map((r) => ({ ...r, is_me: false })),
    sponsors: ov.sponsors.filter((s) => ids.has(s.id)).map((s) => s.name),
  };
}

// ---- helpers -------------------------------------------------------------
// Tag sponsor links so the brands can see visits from Racked in their analytics.
export function sponsorLink(url: string | null | undefined, content?: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return null;
    u.searchParams.set("utm_source", "racked");
    u.searchParams.set("utm_medium", "app");
    u.searchParams.set("utm_campaign", "rewards");
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

export function prizeRankLabel(p: { rank_from: number; rank_to: number }) {
  return p.rank_from === p.rank_to ? `#${p.rank_from}` : `#${p.rank_from}–${p.rank_to}`;
}

export function prizeForRank(prizes: Prize[] | undefined, rank: number | null | undefined) {
  if (!prizes || !rank) return null;
  return prizes.find((p) => rank >= p.rank_from && rank <= p.rank_to) || null;
}

export function metricLabel(metric: Metric) {
  return metric === "best_lift" ? "Heaviest set" : metric === "sets" ? "Most sets" : "Most volume";
}

export function metricValue(metric: Metric, value: number, reps?: number | null) {
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
  if (awards.length === 1) {
    const a = awards[0];
    const what = a.kind === "mission" ? "Mission complete" : a.kind === "badge" ? "Badge unlocked" : a.kind === "streak" ? "Streak bonus" : "Challenge joined";
    return `${what}: ${a.title} · +${a.xp} XP`;
  }
  return `${awards.length} rewards unlocked · +${total} XP`;
}

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
};
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
export type PrizeRow = { id?: number; rank_from: number; rank_to: number; title: string; description: string | null; sponsor_ids: string[]; reward_id?: number | null };
export type AdminRewardsData = {
  period: "week" | "month";
  season: { id: number; title: string; period: "week" | "month"; starts_at: string; ends_at: string; awarded_at: string | null };
  season_prizes: PrizeRow[];
  templates: PrizeRow[];
  live_board: { rank: number; name: string; score: number; flagged: number }[];
  to_award: { id: number; title: string; ends_at: string; board: { rank: number; name: string; score: number; flagged: number; prize: string | null }[] }[];
  seasons: { id: number; title: string; period: string; starts_at: string; ends_at: string; awarded_at: string | null; winners: { rank: number; name: string; score: number }[] }[];
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
    p_prizes: prizes.map((p) => ({ rank_from: p.rank_from, rank_to: p.rank_to, title: p.title, description: p.description, sponsor_ids: p.sponsor_ids, reward_id: p.reward_id ?? null })),
    p_apply_current: applyCurrent,
  });
export const adminAwardSeason = (s: Client, id: number) => call<{ rank: number; prize: string }[]>(s, "admin_award_season", { p_season_id: id });
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
