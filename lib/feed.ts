// The Home feed (0014_social_feed.sql): workouts / PRs, pump checks, member
// posts (text, photos, transformations), gym notices + offers, milestones,
// plus kudos, comments, reports and the + menu's posting.
// Before 0014 is run, the feed falls back to the old workouts + pump checks.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { fetchFeed, fetchFeedPhotos, PHOTO_BUCKET, type FeedPhotoPost, type FeedPost } from "@/lib/data";
import { compressImage, newPhotoPath } from "@/lib/photos";

type Client = SupabaseClient<Database>;
type Rpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
function rpc(supabase: Client, fn: string, args?: Record<string, unknown>) {
  return (supabase as unknown as { rpc: Rpc }).rpc(fn, args);
}
async function call<T>(supabase: Client, fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(supabase, fn, args);
  if (error) throw error;
  return data as T;
}
export function isMissingFeed(err: unknown) {
  const code = (err as { code?: string } | null)?.code;
  return code === "PGRST202" || code === "42883";
}

// ---- types -------------------------------------------------------------------
export type FeedFilter = "all" | "prs" | "photos" | "transformations" | "posts" | "gym";
export const FEED_FILTERS: { key: FeedFilter; label: string }[] = [
  { key: "all", label: "For you" },
  { key: "prs", label: "PRs" },
  { key: "photos", label: "Photos" },
  { key: "transformations", label: "Transformations" },
  { key: "posts", label: "Posts" },
  { key: "gym", label: "Gym" },
];

export type CommentTarget = "wall" | "set" | "photo";
export type LastComment = { name: string; body: string; is_mine: boolean } | null;
type Social = { comment_count?: number; last_comment?: LastComment };
export type Media = { path: string; label: "before" | "after" | null };

export type WallPost = Social & {
  id: number;
  kind: "text" | "photo" | "transformation";
  body: string | null;
  machine_id: string | null;
  mode: string;
  weeks_apart: number | null;
  created_at: string;
  edited: boolean;
  is_mine: boolean;
  hidden: boolean;
  display_name: string;
  avatar_url: string | null;
  instagram_handle: string | null;
  media: Media[];
  kudos_count: number;
  kudos_mine: boolean;
  kudos_names: string[];
};

export type GymPost = {
  id: number;
  kind: "notice" | "offer";
  title: string;
  body: string | null;
  image_url: string | null;
  code: string | null;
  cta_label: string | null;
  cta_url: string | null;
  reward_id: number | null;
  pinned: boolean;
  starts_at: string;
  ends_at: string | null;
  sponsor: { id: string; name: string; logo_url: string | null; website_url: string | null } | null;
  reward: { id: number; title: string; xp_cost: number | null } | null;
};

export type Milestone = { kind: "badge" | "streak"; title: string; is_mine: boolean; name: string; avatar_url: string | null; days: number | null };

export type FeedItem =
  | ({ type: "set"; key: string; at: string } & FeedPost & Social)
  | ({ type: "pump"; key: string; at: string } & FeedPhotoPost & Social)
  | ({ type: "wall"; key: string; at: string } & WallPost)
  | ({ type: "gym"; key: string; at: string } & GymPost)
  | ({ type: "milestone"; key: string; at: string; id: number } & Milestone);

export type FeedPage = { items: FeedItem[]; pinned: GymPost[]; hasMore: boolean; legacy: boolean };

// ---- reading -----------------------------------------------------------------
type RawItem = Record<string, unknown> & { type: string; id: number; at: string };

function normalize(raw: RawItem): FeedItem | null {
  const key = `${raw.type}:${raw.id}`;
  const n = (v: unknown) => (v == null ? v : Number(v));
  switch (raw.type) {
    case "set":
      return { ...(raw as unknown as FeedPost), type: "set", key, at: raw.at, post_id: Number(raw.post_id), weight: Number(raw.weight), volume: Number(raw.volume) } as FeedItem;
    case "pump":
      return {
        ...(raw as unknown as FeedPhotoPost),
        type: "pump",
        key,
        at: raw.at,
        item_id: Number(raw.item_id),
        pre_photo_id: n(raw.pre_photo_id) as number | null,
        post_photo_id: n(raw.post_photo_id) as number | null,
      } as FeedItem;
    case "wall":
    case "gym":
    case "milestone":
      return { ...raw, id: Number(raw.id), key } as unknown as FeedItem;
    default:
      return null;
  }
}

export async function fetchHomeFeed(supabase: Client, opts: { before?: string | null; filter?: FeedFilter; limit?: number } = {}): Promise<FeedPage> {
  const limit = opts.limit ?? 15;
  const filter = opts.filter ?? "all";
  try {
    const res = await call<{ items: RawItem[]; pinned: GymPost[]; has_more: boolean }>(supabase, "home_feed", {
      p_before: opts.before ?? null,
      p_limit: limit,
      p_filter: filter,
    });
    return {
      items: (res.items || []).map(normalize).filter(Boolean) as FeedItem[],
      pinned: (res.pinned || []).map((g) => ({ ...g, id: Number(g.id) })),
      hasMore: !!res.has_more,
      legacy: false,
    };
  } catch (err) {
    if (!isMissingFeed(err)) throw err;
    return legacyFeed(supabase, opts.before ?? null, filter, limit);
  }
}

// Database update 0014 not run yet: the old workouts + pump checks.
async function legacyFeed(supabase: Client, before: string | null, filter: FeedFilter, limit: number): Promise<FeedPage> {
  if (!["all", "prs", "photos"].includes(filter)) return { items: [], pinned: [], hasMore: false, legacy: true };
  const [sets, photos] = await Promise.all([
    filter === "photos" ? Promise.resolve([] as FeedPost[]) : fetchFeed(supabase, { limit, before }),
    filter === "prs" ? Promise.resolve([] as FeedPhotoPost[]) : fetchFeedPhotos(supabase, { limit, before }).catch(() => [] as FeedPhotoPost[]),
  ]);
  const items: FeedItem[] = [
    ...sets.filter((p) => filter !== "prs" || p.has_pb).map((p) => ({ ...p, type: "set" as const, key: `set:${p.post_id}`, at: p.created_at })),
    ...photos.map((p) => ({ ...p, type: "pump" as const, key: `pump:${p.item_id}`, at: p.created_at })),
  ]
    .sort((a, b) => +new Date(b.at) - +new Date(a.at))
    .slice(0, limit) as FeedItem[];
  return { items, pinned: [], hasMore: sets.length >= limit || photos.length >= limit, legacy: true };
}

// ---- posting -----------------------------------------------------------------
export type NewPost = {
  kind: "text" | "photo" | "transformation";
  body: string;
  files: { file: Blob; label?: "before" | "after" | null }[];
  machineId?: string | null;
  mode?: string | null;
  weeks?: number | null;
};

const LINK_RE = /(https?:\/\/|www\.|[a-z0-9-]+\.(com|in|net|org|io|co|app|me|xyz|shop|store|link|ly|gg|ai|info|biz|site|online|live|club|fit)([/:?#]|\s|$))/i;
export function hasLink(text: string) {
  return LINK_RE.test(text);
}

// Shrinks and uploads the photos, then creates the post. If anything fails,
// the uploaded files are removed again.
export async function createPost(supabase: Client, uid: string, p: NewPost, onProgress?: (done: number, total: number) => void): Promise<number> {
  const uploaded: string[] = [];
  const bucket = supabase.storage.from(PHOTO_BUCKET);
  try {
    const media: { path: string; label: string | null }[] = [];
    let i = 0;
    for (const f of p.files) {
      const blob = await compressImage(f.file);
      const path = newPhotoPath(uid);
      const up = await bucket.upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (up.error) throw up.error;
      uploaded.push(path);
      media.push({ path, label: f.label ?? null });
      onProgress?.(++i, p.files.length);
    }
    return Number(
      await call<number>(supabase, "create_wall_post", {
        p_kind: p.kind,
        p_body: p.body.trim() || null,
        p_media: media,
        p_machine_id: p.machineId || null,
        p_mode: p.mode || null,
        p_weeks: p.kind === "transformation" ? p.weeks ?? null : null,
      })
    );
  } catch (err) {
    if (uploaded.length) await bucket.remove(uploaded).catch(() => undefined);
    throw err;
  }
}

export const editPost = (s: Client, id: number, body: string, machineId?: string | null, mode?: string | null) =>
  call<null>(s, "edit_wall_post", { p_id: id, p_body: body, p_machine_id: machineId || null, p_mode: mode || null });

export async function deletePost(supabase: Client, id: number) {
  const paths = await call<string[]>(supabase, "delete_wall_post", { p_id: id });
  if (paths && paths.length) await supabase.storage.from(PHOTO_BUCKET).remove(paths).catch(() => undefined);
}

export async function toggleWallKudos(supabase: Client, id: number) {
  const r = await call<{ count: number; mine: boolean }>(supabase, "toggle_wall_kudos", { p_id: id });
  return { count: Number(r.count), mine: !!r.mine };
}

export const reportPost = (s: Client, id: number, reason?: string | null) => call<null>(s, "report_wall_post", { p_id: id, p_reason: reason ?? null });

// ---- comments ----------------------------------------------------------------
export type Comment = { id: number; body: string; created_at: string; is_mine: boolean; hidden: boolean; display_name: string; avatar_url: string | null };

export async function listComments(supabase: Client, type: CommentTarget, id: number): Promise<Comment[]> {
  const rows = await call<Comment[]>(supabase, "list_comments", { p_type: type, p_id: id, p_limit: 200 });
  return (rows || []).map((c) => ({ ...c, id: Number(c.id) }));
}
export async function addComment(supabase: Client, type: CommentTarget, id: number, body: string): Promise<Comment> {
  const c = await call<Comment>(supabase, "add_comment", { p_type: type, p_id: id, p_body: body });
  return { ...c, id: Number(c.id) };
}
export const deleteComment = (s: Client, id: number) => call<null>(s, "delete_comment", { p_id: id });
export const reportComment = (s: Client, id: number, reason?: string | null) => call<null>(s, "report_comment", { p_id: id, p_reason: reason ?? null });

// ---- staff -------------------------------------------------------------------
export type AdminGymPost = GymPost & { active: boolean; sponsor_id: string | null; updated_at: string; status: "live" | "scheduled" | "ended" | "off" };
export const adminGymPosts = async (s: Client) => ((await call<AdminGymPost[]>(s, "admin_gym_posts")) || []).map((g) => ({ ...g, id: Number(g.id) }));
export const adminSaveGymPost = (s: Client, p: Record<string, unknown>) => call<number>(s, "admin_save_gym_post", { p });
export const adminDeleteGymPost = (s: Client, id: number) => call<null>(s, "admin_delete_gym_post", { p_id: id });

export type ReportedPost = WallPost & { author: string; reports: number; reasons: string[]; hidden_by_staff: boolean };
export type ReportedComment = { id: number; body: string; created_at: string; hidden: boolean; target_type: CommentTarget; target_id: number; author: string; reports: number; reasons: string[] };
export async function adminFeedReports(s: Client): Promise<{ posts: ReportedPost[]; comments: ReportedComment[] }> {
  const r = await call<{ posts: ReportedPost[]; comments: ReportedComment[] }>(s, "admin_feed_reports");
  return {
    posts: (r.posts || []).map((p) => ({ ...p, id: Number(p.id) })),
    comments: (r.comments || []).map((c) => ({ ...c, id: Number(c.id) })),
  };
}
export const adminSetPostHidden = (s: Client, id: number, hidden: boolean) => call<null>(s, "admin_set_post_hidden", { p_id: id, p_hidden: hidden });
export const adminSetCommentHidden = (s: Client, id: number, hidden: boolean) => call<null>(s, "admin_set_comment_hidden", { p_id: id, p_hidden: hidden });

// ---- app-wide signals --------------------------------------------------------
// "open the + menu" (from the composer bar on Home) and "the feed changed"
// (after posting / deleting) without threading callbacks through pages.
export const OPEN_CREATE = "racked:open-create";
export const FEED_CHANGED = "racked:feed-changed";
export type CreateTarget = "menu" | "post" | "photo" | "transformation" | "pump" | "machines";
export function openCreate(target: CreateTarget = "menu") {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(OPEN_CREATE, { detail: target }));
}
export function onOpenCreate(cb: (t: CreateTarget) => void) {
  const h = (e: Event) => cb(((e as CustomEvent).detail as CreateTarget) || "menu");
  window.addEventListener(OPEN_CREATE, h);
  return () => window.removeEventListener(OPEN_CREATE, h);
}
export function notifyFeedChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(FEED_CHANGED));
}
export function onFeedChanged(cb: () => void) {
  window.addEventListener(FEED_CHANGED, cb);
  return () => window.removeEventListener(FEED_CHANGED, cb);
}
