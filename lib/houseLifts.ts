// House lifts (0013): staff put a real lift on a machine's board for someone
// who isn't on the app yet -- a trainer, a regular without a phone. They show
// on the boards like anyone else, but never earn XP, prizes or challenge
// places, and don't count in the gym's totals.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Client = SupabaseClient<Database>;
type Rpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;

async function call<T>(supabase: Client, fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await (supabase as unknown as { rpc: Rpc }).rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export type HouseLift = {
  id: number;
  machine_id: string;
  mode: string;
  name: string;
  weight: number;
  reps: number;
  lifted_on: string; // YYYY-MM-DD
  created_at: string;
  added_by: string | null;
};

export type HouseLiftInput = {
  id?: number;
  machine_id: string;
  mode: string;
  name: string;
  weight: number;
  reps: number;
  lifted_on: string;
};

export async function fetchHouseLifts(supabase: Client): Promise<HouseLift[]> {
  const rows = await call<HouseLift[]>(supabase, "admin_house_lifts");
  return (rows || []).map((r) => ({ ...r, weight: Number(r.weight), reps: Number(r.reps) }));
}

export const saveHouseLift = (supabase: Client, p: HouseLiftInput) => call<number>(supabase, "admin_save_house_lift", { p });
export const deleteHouseLift = (supabase: Client, id: number) => call<null>(supabase, "admin_delete_house_lift", { p_id: id });

// Today on the gym's clock, as YYYY-MM-DD (the date field's default).
export function gymToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
}
