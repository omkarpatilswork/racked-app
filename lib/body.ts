// Body weight + board (Men / Women / Prefer not to say), database update 0015.
// Boards and prizes rank by ×BW = kg lifted ÷ body weight on the day.
// Body weight is private: only you (and staff) ever see the number.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Client = SupabaseClient<Database>;
type Rpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
async function call<T>(supabase: Client, fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await (supabase as unknown as { rpc: Rpc }).rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export type Division = "men" | "women";
export type BoardChoice = Division | "open";
export type BoardView = Division | "all";

export type MyBody = {
  division: BoardChoice | null;
  body_kg: number | null;
  body_set_at?: string | null;
  division_set_at?: string | null;
  checked_at?: string | null;
  checked_by?: string | null;
  next_body_change?: string | null;
  next_division_change?: string | null;
};

export const DIVISION_LABEL: Record<BoardView, string> = { men: "Men", women: "Women", all: "All" };
export const CHOICE_LABEL: Record<BoardChoice, string> = { men: "Men", women: "Women", open: "Prefer not to say" };

const norm = (b: MyBody | null | undefined): MyBody => ({
  ...(b || { division: null, body_kg: null }),
  division: (b?.division as BoardChoice | null) ?? null,
  body_kg: b?.body_kg == null ? null : Number(b.body_kg),
});

/** On the ×BW boards: has a body weight. In a prize race: and Men or Women. */
export const hasBody = (b: MyBody | null | undefined) => !!b && b.body_kg != null && b.division != null;
export const raceOf = (b: MyBody | null | undefined): Division | null =>
  b && b.body_kg != null && (b.division === "men" || b.division === "women") ? b.division : null;

export async function fetchMyBody(supabase: Client): Promise<MyBody> {
  return norm(await call<MyBody>(supabase, "my_body"));
}

export async function saveMyBody(supabase: Client, division: BoardChoice | null, bodyKg: number | null): Promise<MyBody> {
  return norm(await call<MyBody>(supabase, "set_my_body", { p_division: division, p_body_kg: bodyKg }));
}

export async function adminMemberBody(supabase: Client, uid: string): Promise<MyBody> {
  return norm(await call<MyBody>(supabase, "admin_member_body", { p_uid: uid }));
}

export async function adminSetMemberBody(supabase: Client, uid: string, bodyKg: number, division: BoardChoice | null = null): Promise<MyBody> {
  return norm(await call<MyBody>(supabase, "admin_set_member_body", { p_uid: uid, p_body_kg: bodyKg, p_division: division }));
}

/** 0.8 -> "0.80×" */
export function fmtBw(ratio: number | null | undefined) {
  if (ratio == null || !isFinite(Number(ratio))) return "–";
  return `${Number(ratio).toFixed(2)}×`;
}

/** points -> "255" (best ×BW per machine × 100, added up) */
export function fmtPts(points: number | null | undefined) {
  return Math.round(Number(points || 0)).toLocaleString("en-IN");
}

// The board you see by default: your own race, else Men.
export function defaultBoard(b: MyBody | null | undefined): BoardView {
  return raceOf(b) || "men";
}

// Fired after the body sheet saves, so open screens can refresh.
export const BODY_CHANGED = "racked:body-changed";
export const OPEN_BODY = "racked:open-body";
export function openBodySheet() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OPEN_BODY));
}
