// Ranks v2 (database update 0016): one board, three things to rank by.
//   score     strength score = kg lifted ÷ body weight × 100
//   moved     kg moved = weight × reps of every set, added up
//   heaviest  the heaviest single set (kg)
// for This week (the prize week) or All time, Men / Women / Everyone, all
// machines or one. Falls back to the older boards when 0016 isn't run yet.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { fetchMachineBoard, fetchOverallLeaderboard, isMissingFunction } from "@/lib/data";
import { fetchSeasonBoard } from "@/lib/rewards";
import { MACHINE_MAP, MACHINES } from "@/lib/machines";

type Client = SupabaseClient<Database>;
type Rpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;

export type RankMetric = "score" | "moved" | "heaviest" | "xp";
export type RankPeriod = "week" | "all";
export type RankBoard = "men" | "women" | "all";

export type RankRow = {
  rank: number;
  name: string;
  avatar_url: string | null;
  value: number;
  reps: number | null;
  machine_id: string | null;
  mode: string | null;
  sets: number | null;
  is_me: boolean;
  house: boolean;
};

export const METRICS: { key: RankMetric; label: string; short: string }[] = [
  { key: "score", label: "Score", short: "Score" },
  { key: "moved", label: "Kg moved", short: "Kg moved" },
  { key: "heaviest", label: "Heaviest lift", short: "Heaviest" },
];
export const XP_METRIC = { key: "xp" as RankMetric, label: "XP", short: "XP" };

export const BOARDS: { key: RankBoard; label: string }[] = [
  { key: "men", label: "Men" },
  { key: "women", label: "Women" },
  { key: "all", label: "Everyone" },
];

/** "lat-pulldown-01" / "pec-fly-rear-delt-04|rear-delt" choices for the machine filter. */
export const MACHINE_CHOICES: { value: string; label: string; id: string; mode: string }[] = MACHINES.flatMap((m) =>
  m.dual && m.modes
    ? Object.entries(m.modes).map(([k, md]) => ({ value: `${m.id}|${k}`, label: md.label, id: m.id, mode: k }))
    : [{ value: m.id, label: m.name, id: m.id, mode: "" }]
);

export function machineChoice(value: string | null | undefined) {
  if (!value) return null;
  return MACHINE_CHOICES.find((c) => c.value === value) || MACHINE_CHOICES.find((c) => c.id === value) || null;
}

/** 0.83 -> 83 */
export const scoreOf = (ratio: number | null | undefined) => (ratio == null || !isFinite(Number(ratio)) ? null : Math.round(Number(ratio) * 100));

export function fmtNum(n: number | null | undefined) {
  if (n == null || !isFinite(Number(n))) return "–";
  const v = Number(n);
  return (Number.isInteger(v) ? v : Number(v.toFixed(2))).toLocaleString("en-IN");
}

/** The big number on a row: "283", "6,240 kg", "140 kg", "1,300 XP". */
export function fmtValue(metric: RankMetric, value: number) {
  if (metric === "moved" || metric === "heaviest") return `${fmtNum(value)} kg`;
  if (metric === "xp") return `${fmtNum(value)} XP`;
  return fmtNum(Math.round(value));
}

/** The small line under a name. */
export function rowSub(metric: RankMetric, r: RankRow, oneMachine: boolean) {
  if (metric === "moved") return r.sets ? `${r.sets} set${r.sets === 1 ? "" : "s"}` : "";
  if (metric === "heaviest") {
    const where = !oneMachine && r.machine_id ? MACHINE_CHOICES.find((c) => c.id === r.machine_id && (!c.mode || c.mode === r.mode))?.label || MACHINE_MAP[r.machine_id]?.name : null;
    return [where, r.reps ? (oneMachine ? `× ${r.reps} reps` : `× ${r.reps}`) : null].filter(Boolean).join(" ");
  }
  if (metric === "score" && oneMachine && r.reps) return `× ${r.reps} reps`;
  return "";
}

export class BoardUnavailable extends Error {
  constructor(public why: "update" | "signin") {
    super(why);
  }
}

export async function fetchRanks(
  supabase: Client,
  o: { metric: RankMetric; period: RankPeriod; board: RankBoard; machine: string | null; mode: string; signedIn: boolean; strength: boolean }
): Promise<RankRow[]> {
  if (o.metric === "xp") return fetchXp(supabase, o.period);
  if (o.signedIn) {
    const { data, error } = await (supabase as unknown as { rpc: Rpc }).rpc("ranks_board", {
      p_metric: o.metric,
      p_period: o.period,
      p_division: o.board,
      p_machine_id: o.machine,
      p_mode: o.mode || "",
      p_limit: 50,
    });
    if (!error) return ((data as RankRow[]) || []).map(norm);
    if (!isMissingFunction(error)) throw error;
  }
  // ---- before 0016 (or signed out): what the older boards can show
  if (o.metric === "score" && !o.machine && o.period === "week") {
    let rows;
    try {
      rows = await fetchSeasonBoard(supabase, null, 50, o.strength ? o.board : undefined);
    } catch (e) {
      if (isMissingFunction(e)) throw new BoardUnavailable("update"); // rewards (0011) not run
      throw e;
    }
    return rows.map((r) => norm({ rank: r.rank, name: r.name, avatar_url: null, value: r.score, reps: null, machine_id: null, mode: null, sets: null, is_me: r.is_me, house: false }));
  }
  if (!o.signedIn) throw new BoardUnavailable("signin");
  if (o.machine && (o.metric === "score" || o.metric === "heaviest")) {
    const rows = (await fetchMachineBoard(supabase, o.machine, o.mode, o.period, 0, o.board)).filter((r) => !r.best_ever);
    if (o.metric === "score" && rows.some((r) => r.ratio != null)) {
      return rows.map((r) => norm({ rank: r.rank, name: r.display_name, avatar_url: r.avatar_url, value: scoreOf(r.ratio) || 0, reps: r.pb_reps, machine_id: o.machine, mode: o.mode, sets: r.sets, is_me: r.is_me ?? false, house: r.house }));
    }
    if (o.metric === "heaviest" && rows.every((r) => r.ratio == null)) {
      return rows.map((r) => norm({ rank: r.rank, name: r.display_name, avatar_url: r.avatar_url, value: r.pb_weight, reps: r.pb_reps, machine_id: o.machine, mode: o.mode, sets: r.sets, is_me: r.is_me ?? false, house: r.house }));
    }
  }
  throw new BoardUnavailable("update");
}

async function fetchXp(supabase: Client, period: RankPeriod) {
  const list = await fetchOverallLeaderboard(supabase, period);
  const { data } = await supabase.auth.getSession();
  const me = data.session?.user.id;
  return list.map((u, i) => norm({ rank: i + 1, name: u.display_name, avatar_url: u.avatar_url, value: u.total_xp, reps: null, machine_id: null, mode: null, sets: u.total_sets, is_me: u.uid === me, house: false }));
}

function norm(r: RankRow): RankRow {
  return {
    ...r,
    rank: Number(r.rank),
    value: Number(r.value),
    reps: r.reps == null ? null : Number(r.reps),
    sets: r.sets == null ? null : Number(r.sets),
    is_me: !!r.is_me,
    house: !!r.house,
    name: r.house ? r.name : (r.name || "").split(" ")[0] || r.name,
  };
}
