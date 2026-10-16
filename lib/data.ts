import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { Period } from "@/lib/period";
import { periodSince } from "@/lib/period";

type Client = SupabaseClient<Database>;
type MachineStatsRow = Database["public"]["Tables"]["machine_stats"]["Row"];
type FeedbackRow = Database["public"]["Tables"]["feedback"]["Row"];
type SetLogRow = Database["public"]["Views"]["v_admin_set_logs"]["Row"];

export function statKey(machineId: string, mode?: string | null) {
  return `${machineId}__${mode || ""}`;
}

export async function fetchMyStats(supabase: Client, uid: string) {
  const { data, error } = await supabase
    .from("machine_stats")
    .select("*")
    .eq("uid", uid);
  if (error) throw error;
  const map: Record<string, MachineStatsRow> = {};
  (data || []).forEach((row) => {
    map[statKey(row.machine_id, row.mode)] = row;
  });
  return map;
}

export async function fetchAttendance(supabase: Client, uid: string) {
  const { data, error } = await supabase
    .from("attendance")
    .select("date, present")
    .eq("uid", uid)
    .limit(400);
  if (error) throw error;
  const map: Record<string, boolean> = {};
  (data || []).forEach((r) => {
    if (r.present) map[r.date] = true;
  });
  return map;
}

export async function toggleAttendanceDay(
  supabase: Client,
  uid: string,
  dateStr: string,
  present: boolean
) {
  const { error } = await supabase
    .from("attendance")
    .upsert(
      { uid, date: dateStr, present, updated_at: new Date().toISOString() },
      { onConflict: "uid,date" }
    );
  if (error) throw error;
}

// Period-scoped leaderboards, via the leaderboard_machine/leaderboard_overall
// RPCs (see supabase/migrations/0003_admin_tools.sql) rather than the plain
// v_machine_leaderboard/v_overall_leaderboard views — those views only ever
// read machine_stats' all-time cumulative totals, which have no timestamp
// to filter "today"/"this week"/"this month" by.
export async function fetchMachineLeaderboard(
  supabase: Client,
  machineId: string,
  mode: string,
  period: Period = "all"
) {
  const { data, error } = await supabase.rpc("leaderboard_machine", {
    p_machine_id: machineId,
    p_mode: mode,
    p_period: period,
  });
  if (error) throw error;
  return data || [];
}

export async function fetchOverallLeaderboard(supabase: Client, period: Period = "all") {
  const { data, error } = await supabase.rpc("leaderboard_overall", { p_period: period });
  if (error) throw error;
  return data || [];
}

export type LogSetResult = {
  isPb: boolean;
  weight: number;
  reps: number;
  pbWeight: number;
  pbReps: number;
  previousPb: { weight: number; reps: number } | null;
  xpGain: number;
  totalXp: number;
  totalSets: number;
  level: number;
};

export async function logSet(
  supabase: Client,
  machineId: string,
  mode: string | null,
  weight: number,
  reps: number
) {
  const { data, error } = await supabase.rpc("log_set", {
    p_machine_id: machineId,
    p_mode: mode,
    p_weight: weight,
    p_reps: reps,
  });
  if (error) throw error;
  return data as unknown as LogSetResult;
}

export async function recordTap(supabase: Client, machineId: string, source: "nfc" | "qr" = "nfc") {
  // Fire-and-forget: a failed tap-analytics write should never block the page.
  try {
    const { error } = await supabase.rpc("record_tap", { p_machine_id: machineId, p_source: source });
    if (error) {
      // The database hasn't had migration 0004 applied yet (old record_tap
      // only takes the machine id) -- still log the scan rather than lose it.
      await supabase.rpc("record_tap", { p_machine_id: machineId });
    }
  } catch {
    /* ignore */
  }
}

export async function submitFeedback(
  supabase: Client,
  input: {
    uid: string | null;
    displayName: string;
    machineId: string;
    rating: number;
    issues: string[];
    comment: string;
  }
) {
  const { error } = await supabase.from("feedback").insert({
    uid: input.uid,
    display_name: input.displayName,
    machine_id: input.machineId,
    rating: input.rating,
    issues: input.issues,
    comment: input.comment || null,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Admin dashboard: period-filtered reads + the delete/reset controls. Every
// mutation below goes through a security-definer RPC that re-checks
// is_staff() server-side (see 0003_admin_tools.sql) — a non-staff caller
// gets a Postgres permission error back, not a silent no-op.
// ---------------------------------------------------------------------------

export type TapCounts = { total: number; nfc: number; qr: number; untracked: number };
const emptyTapCounts = (): TapCounts => ({ total: 0, nfc: 0, qr: 0, untracked: 0 });

// Scans per machine, split by how the person got in: NFC tap, QR scan, or
// "untracked" (scans recorded before the NFC/QR split existed).
export async function fetchAdminTapCounts(supabase: Client, period: Period) {
  const since = periodSince(period);
  let query = supabase.from("tap_events").select("machine_id, source");
  if (since) query = query.gte("created_at", since);
  const { data, error } = await query;
  if (error) throw error;
  const counts: Record<string, TapCounts> = {};
  (data || []).forEach((row) => {
    const c = (counts[row.machine_id] ||= emptyTapCounts());
    c.total += 1;
    if (row.source === "nfc") c.nfc += 1;
    else if (row.source === "qr") c.qr += 1;
    else c.untracked += 1;
  });
  return counts;
}

export function sumTapCounts(counts: Record<string, TapCounts>): TapCounts {
  return Object.values(counts).reduce((acc, c) => {
    acc.total += c.total;
    acc.nfc += c.nfc;
    acc.qr += c.qr;
    acc.untracked += c.untracked;
    return acc;
  }, emptyTapCounts());
}

export async function fetchAdminSetCount(supabase: Client, period: Period) {
  const since = periodSince(period);
  let query = supabase.from("set_logs").select("id", { count: "exact", head: true });
  if (since) query = query.gte("created_at", since);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function fetchAdminFeedback(
  supabase: Client,
  opts: { period: Period; machineId?: string; status?: FeedbackRow["status"] | "all" }
) {
  const since = periodSince(opts.period);
  let query = supabase.from("feedback").select("*").order("created_at", { ascending: false }).limit(300);
  if (since) query = query.gte("created_at", since);
  if (opts.machineId && opts.machineId !== "all") query = query.eq("machine_id", opts.machineId);
  if (opts.status && opts.status !== "all") query = query.eq("status", opts.status);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function fetchAdminSetLogs(
  supabase: Client,
  opts: { period: Period; machineId?: string; limit?: number }
) {
  const since = periodSince(opts.period);
  let query = supabase.from("v_admin_set_logs").select("*").limit(opts.limit ?? 60);
  if (since) query = query.gte("created_at", since);
  if (opts.machineId && opts.machineId !== "all") query = query.eq("machine_id", opts.machineId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as SetLogRow[];
}

export async function adminDeleteSetLog(supabase: Client, id: number) {
  const { error } = await supabase.rpc("admin_delete_set_log", { p_id: id });
  if (error) throw error;
}

export async function adminDeleteFeedback(supabase: Client, id: number) {
  const { error } = await supabase.rpc("admin_delete_feedback", { p_id: id });
  if (error) throw error;
}

export async function adminClearFeedback(supabase: Client, machineId?: string) {
  const { error } = await supabase.rpc("admin_clear_feedback", { p_machine_id: machineId ?? null });
  if (error) throw error;
}

export async function adminResetMachine(supabase: Client, machineId: string) {
  const { error } = await supabase.rpc("admin_reset_machine", { p_machine_id: machineId });
  if (error) throw error;
}

export async function adminResetAllData(supabase: Client) {
  const { error } = await supabase.rpc("admin_reset_all_data");
  if (error) throw error;
}

export function overallFromStats(stats: Record<string, MachineStatsRow>) {
  const all = Object.values(stats);
  const totalXp = all.reduce((s, x) => s + (x.xp || 0), 0);
  const totalSets = all.reduce((s, x) => s + (x.sets || 0), 0);
  const totalVolume = all.reduce((s, x) => s + Number(x.volume || 0), 0);
  const pbCount = all.length;
  const unlocked = new Set(all.map((x) => x.machine_id)).size;
  return { totalXp, totalSets, totalVolume, pbCount, unlocked };
}
