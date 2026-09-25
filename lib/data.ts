import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Client = SupabaseClient<Database>;
type MachineStatsRow = Database["public"]["Tables"]["machine_stats"]["Row"];

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

export async function fetchMachineLeaderboard(
  supabase: Client,
  machineId: string,
  mode: string
) {
  const { data, error } = await supabase
    .from("v_machine_leaderboard")
    .select("*")
    .eq("machine_id", machineId)
    .eq("mode", mode)
    .order("rank", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function fetchOverallLeaderboard(supabase: Client) {
  const { data, error } = await supabase
    .from("v_overall_leaderboard")
    .select("*")
    .order("total_xp", { ascending: false });
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

export async function recordTap(supabase: Client, machineId: string) {
  // Fire-and-forget: a failed tap-analytics write should never block the page.
  try {
    await supabase.rpc("record_tap", { p_machine_id: machineId });
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

export function overallFromStats(stats: Record<string, MachineStatsRow>) {
  const all = Object.values(stats);
  const totalXp = all.reduce((s, x) => s + (x.xp || 0), 0);
  const totalSets = all.reduce((s, x) => s + (x.sets || 0), 0);
  const totalVolume = all.reduce((s, x) => s + Number(x.volume || 0), 0);
  const pbCount = all.length;
  const unlocked = new Set(all.map((x) => x.machine_id)).size;
  return { totalXp, totalSets, totalVolume, pbCount, unlocked };
}
