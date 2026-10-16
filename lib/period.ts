// Shared "time period" filter used by both the admin dashboard and the
// public leaderboard. Keeping the type/labels in one place so the two UIs
// stay in sync.
export type Period = "today" | "week" | "month" | "all";

export const PERIOD_OPTIONS: { key: Period; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "all", label: "All Time" },
];

// Client-side mirror of the DB's public._period_start() (see
// supabase/migrations/0003_admin_tools.sql), used only for the admin
// dashboard's direct table queries (tap_events / set_logs / feedback),
// which need an ISO timestamp to pass to `.gte("created_at", ...)`.
//
// The leaderboard RPCs (leaderboard_overall / leaderboard_machine) compute
// their own period boundary inside Postgres and don't call this — so
// there's a caveat: this runs in the visitor's browser timezone, while the DB
// function runs on the gym's clock (public.app_timezone(), set in
// supabase/migrations/0005_tv_display.sql). They agree whenever the admin is
// in the same timezone as the gym, which is the normal case.
export function periodSince(period: Period): string | null {
  const now = new Date();
  if (period === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  }
  if (period === "week") {
    const day = now.getDay(); // 0 = Sun .. 6 = Sat
    const diffToMonday = (day + 6) % 7;
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday).toISOString();
  }
  if (period === "month") {
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  }
  return null; // "all" -> no lower bound
}
