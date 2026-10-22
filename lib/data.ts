import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { Period } from "@/lib/period";
import { periodSince } from "@/lib/period";
import { MACHINES, MUSCLE_GROUPS, muscleGroupFor, type MuscleGroup } from "@/lib/machines";

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

// ---------------------------------------------------------------------------
// Gym TV (/tv). Public, so it only ever sees what tv_boards()/tv_activity()
// hand back: first names, best lifts and anonymous counts.
// ---------------------------------------------------------------------------

export type TvEntry = { rank: number; name: string; weight: number; reps: number; sets: number };

export type TvBoard = {
  key: string; // machineId__mode
  machineId: string;
  mode: string;
  machineNumber: string;
  title: string; // "Lat Pulldown" or "Pec Fly" for a dual machine's mode
  unit: string;
  entries: TvEntry[];
};

export type TvGroupStat = {
  id: MuscleGroup;
  label: string;
  lifters: number; // distinct people who trained this group
  sets: number;
};

export type TvActivity = {
  groups: TvGroupStat[];
  lifters: number; // distinct people in the gym
  sets: number;
  volume: number; // kg moved
  pbs: number;
};

export type TvData = { boards: TvBoard[]; activity: TvActivity; fetchedAt: number };

export async function fetchTvData(supabase: Client, period: Period, limit = 5): Promise<TvData> {
  const [boardsRes, activityRes] = await Promise.all([
    supabase.rpc("tv_boards", { p_period: period, p_limit: limit }),
    supabase.rpc("tv_activity", { p_period: period }),
  ]);
  if (boardsRes.error) throw boardsRes.error;
  if (activityRes.error) throw activityRes.error;
  return buildTvData(boardsRes.data || [], activityRes.data || []);
}

type BoardRow = Database["public"]["Functions"]["tv_boards"]["Returns"][number];
type ActivityRow = Database["public"]["Functions"]["tv_activity"]["Returns"][number];

// Pure (no network) so it can be unit-tested: turns the two RPC payloads into
// ordered boards (machine order, then mode order) and the muscle-group tally.
export function buildTvData(boardRows: BoardRow[], activityRows: ActivityRow[]): TvData {
  const byKey = new Map<string, TvEntry[]>();
  boardRows.forEach((r) => {
    const key = `${r.machine_id}__${r.mode || ""}`;
    const list = byKey.get(key) || [];
    list.push({
      rank: Number(r.rank),
      name: r.name,
      weight: Number(r.pb_weight),
      reps: Number(r.pb_reps),
      sets: Number(r.sets),
    });
    byKey.set(key, list);
  });

  // One board per machine / mode, in the order of the gym floor (01, 02, ...).
  const boards: TvBoard[] = [];
  MACHINES.forEach((m) => {
    const modes: (string | null)[] = m.dual ? Object.keys(m.modes || {}) : [null];
    modes.forEach((mode) => {
      const key = `${m.id}__${mode || ""}`;
      boards.push({
        key,
        machineId: m.id,
        mode: mode || "",
        machineNumber: m.number,
        title: mode ? m.modes![mode].label : m.name,
        unit: m.unit,
        entries: (byKey.get(key) || []).sort((a, b) => a.rank - b.rank),
      });
    });
  });

  const people = new Set<number>();
  const groupPeople = new Map<MuscleGroup, Set<number>>();
  const groupSets = new Map<MuscleGroup, number>();
  let sets = 0;
  let volume = 0;
  let pbs = 0;
  activityRows.forEach((r) => {
    people.add(r.person);
    sets += Number(r.sets);
    volume += Number(r.volume);
    pbs += Number(r.pbs);
    const g = muscleGroupFor(r.machine_id, r.mode);
    if (!g) return;
    if (!groupPeople.has(g)) groupPeople.set(g, new Set());
    groupPeople.get(g)!.add(r.person);
    groupSets.set(g, (groupSets.get(g) || 0) + Number(r.sets));
  });

  const groups = MUSCLE_GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    lifters: groupPeople.get(g.id)?.size || 0,
    sets: groupSets.get(g.id) || 0,
  }));

  return {
    boards,
    activity: { groups, lifters: people.size, sets, volume, pbs },
    fetchedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Home feed. Each post is one member's visit to one machine (their sets there
// grouped together), built by feed_posts() -- see 0006_home_feed.sql.
// ---------------------------------------------------------------------------

export type FeedPost = Database["public"]["Functions"]["feed_posts"]["Returns"][number];

export async function fetchFeed(
  supabase: Client,
  opts: { limit?: number; before?: string | null } = {}
): Promise<FeedPost[]> {
  const { data, error } = await supabase.rpc("feed_posts", {
    p_limit: opts.limit ?? 15,
    p_before: opts.before ?? null,
  });
  if (error) throw error;
  // numeric columns can arrive as strings from PostgREST
  return (data || []).map((p) => ({
    ...p,
    post_id: Number(p.post_id),
    weight: Number(p.weight),
    volume: Number(p.volume),
  }));
}

// Save (or clear, with empty text) the member's optional Instagram handle.
// The database cleans it up and returns the stored value.
export async function setInstagramHandle(supabase: Client, handle: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("set_instagram_handle", { p_handle: handle });
  if (error) throw error;
  return (data as string | null) ?? null;
}

export async function toggleKudos(supabase: Client, postId: number) {
  const { data, error } = await supabase.rpc("toggle_kudos", { p_post_id: postId });
  if (error) throw error;
  const r = data as unknown as { count: number; mine: boolean };
  return { count: Number(r.count), mine: !!r.mine };
}

// ---------------------------------------------------------------------------
// Pre / post pump photos (see supabase/migrations/0007_pump_photos.sql).
// Files live in a PRIVATE bucket, so every image is shown through a
// short-lived signed link rather than a public URL.
// ---------------------------------------------------------------------------

export const PHOTO_BUCKET = "pump-photos";
export type PumpKind = "pre" | "post";
export type PumpPhoto = Database["public"]["Tables"]["pump_photos"]["Row"];
export type FeedPhotoPost = Database["public"]["Functions"]["feed_photos"]["Returns"][number];
export type AdminPhotoReport = Database["public"]["Functions"]["admin_pump_reports"]["Returns"][number];

export async function fetchMyPumpPhotos(supabase: Client, uid: string): Promise<PumpPhoto[]> {
  const { data, error } = await supabase
    .from("pump_photos")
    .select("*")
    .eq("uid", uid)
    .order("day", { ascending: false })
    .limit(400);
  if (error) throw error;
  return (data || []).map((p) => ({ ...p, id: Number(p.id) }));
}

// Upload the (already compressed) image, then register it as that day's
// pre/post photo. A photo of the same kind for the same day is replaced and
// its old file removed. If registering fails, the orphaned upload is removed.
export async function uploadPumpPhoto(
  supabase: Client,
  opts: { uid: string; kind: PumpKind; blob: Blob; path: string; shared: boolean; day: string }
) {
  const up = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(opts.path, opts.blob, { contentType: "image/jpeg", upsert: false });
  if (up.error) throw up.error;

  const { data, error } = await supabase.rpc("add_pump_photo", {
    p_kind: opts.kind,
    p_path: opts.path,
    p_shared: opts.shared,
    p_day: opts.day,
  });
  if (error) {
    await supabase.storage.from(PHOTO_BUCKET).remove([opts.path]).catch(() => {});
    throw error;
  }
  const res = data as unknown as { id: number; old_path: string | null };
  if (res.old_path) await supabase.storage.from(PHOTO_BUCKET).remove([res.old_path]).catch(() => {});
  return Number(res.id);
}

export async function setPumpPhotoShared(supabase: Client, id: number, shared: boolean) {
  const { error } = await supabase.rpc("set_pump_photo_shared", { p_id: id, p_shared: shared });
  if (error) throw error;
}

// Used by members (their own photos) and by staff (any photo).
export async function deletePumpPhoto(supabase: Client, id: number) {
  const { data, error } = await supabase.rpc("delete_pump_photo", { p_id: id });
  if (error) throw error;
  if (data) await supabase.storage.from(PHOTO_BUCKET).remove([data as unknown as string]).catch(() => {});
}

export async function reportPhotos(supabase: Client, ids: number[], reason?: string) {
  const { error } = await supabase.rpc("report_photos", { p_ids: ids, p_reason: reason ?? null });
  if (error) throw error;
}

export async function fetchFeedPhotos(
  supabase: Client,
  opts: { limit?: number; before?: string | null } = {}
): Promise<FeedPhotoPost[]> {
  const { data, error } = await supabase.rpc("feed_photos", {
    p_limit: opts.limit ?? 15,
    p_before: opts.before ?? null,
  });
  if (error) throw error;
  return (data || []).map((p) => ({
    ...p,
    item_id: Number(p.item_id),
    pre_photo_id: p.pre_photo_id == null ? null : Number(p.pre_photo_id),
    post_photo_id: p.post_photo_id == null ? null : Number(p.post_photo_id),
  }));
}

export async function togglePhotoKudos(supabase: Client, itemId: number) {
  const { data, error } = await supabase.rpc("toggle_photo_kudos", { p_item_id: itemId });
  if (error) throw error;
  const r = data as unknown as { count: number; mine: boolean };
  return { count: Number(r.count), mine: !!r.mine };
}

// path -> temporary https link (valid for `seconds`). Missing/forbidden files
// are simply left out of the result.
export async function fetchSignedUrls(supabase: Client, paths: string[], seconds = 3600) {
  const out: Record<string, string> = {};
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return out;
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(unique, seconds);
  if (error) throw error;
  (data || []).forEach((row) => {
    if (row.path && row.signedUrl && !row.error) out[row.path] = row.signedUrl;
  });
  return out;
}

export async function fetchAdminPhotoReports(supabase: Client): Promise<AdminPhotoReport[]> {
  const { data, error } = await supabase.rpc("admin_pump_reports");
  if (error) throw error;
  return (data || []).map((r) => ({ ...r, id: Number(r.id), report_count: Number(r.report_count) }));
}

export async function adminSetPhotoHidden(supabase: Client, id: number, hidden: boolean) {
  const { error } = await supabase.rpc("admin_set_photo_hidden", { p_id: id, p_hidden: hidden });
  if (error) throw error;
}
