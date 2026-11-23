"use client";

// The Home feed: filters, every card type, kudos, comments, post menus,
// the prize race / challenges / winners mixed in, "new posts" pill, pull to
// refresh and endless scrolling.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import Sheet from "@/components/Sheet";
import ConfirmSheet from "@/components/ConfirmSheet";
import ShareStudio from "@/components/share/ShareStudio";
import CommentsSheet from "@/components/feed/CommentsSheet";
import {
  ChallengeCard,
  MilestoneRow,
  NoticeCard,
  OfferCard,
  PrizeCard,
  PumpCard,
  SetCard,
  WallCard,
  WinnersCard,
  WonCard,
  type Handlers,
  type PumpItem,
  type SetItem,
  type SocialItem,
  type WallItem,
} from "@/components/feed/cards";
import { usePhotoManager } from "@/components/usePhotoManager";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError, toggleKudos, togglePhotoKudos } from "@/lib/data";
import {
  deletePost,
  editPost,
  FEED_FILTERS,
  fetchHomeFeed,
  hasLink,
  onFeedChanged,
  openCreate,
  reportPost,
  toggleWallKudos,
  type FeedFilter,
  type FeedItem,
  type GymPost,
} from "@/lib/feed";
import { MACHINE_MAP, MACHINES } from "@/lib/machines";
import { onPhotosChanged } from "@/lib/photoEvents";
import { haptic } from "@/lib/haptics";
import { toast } from "@/lib/toast";
import { useSignedUrls } from "@/lib/useSignedUrls";
import {
  awardsToast,
  challengeStatus,
  fetchMyRewards,
  fetchRewardsOverview,
  syncMyRewards,
  trackSponsorClick,
  type MyRewards,
  type RewardsOverview,
} from "@/lib/rewards";
import type { StoryData } from "@/lib/story";

const PAGE = 15;
const REFRESH_MS = 30_000;
const OPTIMISTIC_MS = 25_000;
const DISMISS_KEY = "racked:dismissed-notices";

type KudosState = { count: number; mine: boolean; at: number };
type CommentState = { count: number; last: SocialItem["last_comment"] };
type Row =
  | { k: "item"; key: string; item: FeedItem }
  | { k: "prize"; key: string }
  | { k: "challenge"; key: string; id: number }
  | { k: "winners"; key: string };

function readDismissed(): number[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) || "[]");
  } catch {
    return [];
  }
}

const EMPTY: Record<FeedFilter, { title: string; text: string; cta: string; target: "menu" | "post" | "photo" | "transformation" | "machines" }> = {
  all: { title: "Nothing here yet", text: "Log a set, post a photo or say hi to the gym. You'll be the first post.", cta: "Create a post", target: "menu" },
  prs: { title: "No PRs yet", text: "Beat your best on any machine and it shows up here for the whole gym.", cta: "Find a machine", target: "machines" },
  photos: { title: "No photos yet", text: "Share a pump check or a gym photo.", cta: "Post a photo", target: "photo" },
  transformations: { title: "No transformations yet", text: "Put a before and after side by side. People love these.", cta: "Post a transformation", target: "transformation" },
  posts: { title: "No posts yet", text: "Ask for a spotter, share a win, say something motivating.", cta: "Write a post", target: "post" },
  gym: { title: "No gym news right now", text: "Notices and partner offers from the gym show up here.", cta: "Back to For you", target: "menu" },
};

export default function HomeFeed() {
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [pinned, setPinned] = useState<GymPost[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [legacy, setLegacy] = useState(false);
  const [error, setError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pending, setPending] = useState<FeedItem[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [kudos, setKudos] = useState<Record<string, KudosState>>({});
  const [comments, setComments] = useState<Record<string, CommentState>>({});
  const [dismissed, setDismissed] = useState<number[]>([]);
  const [ov, setOv] = useState<RewardsOverview | null>(null);
  const [me, setMe] = useState<MyRewards | null>(null);
  const [openComments, setOpenComments] = useState<SocialItem | null>(null);
  const [menuFor, setMenuFor] = useState<WallItem | null>(null);
  const [editing, setEditing] = useState<WallItem | null>(null);
  const [deleting, setDeleting] = useState<WallItem | null>(null);
  const [reporting, setReporting] = useState<WallItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [share, setShare] = useState<StoryData | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const inflight = useRef<Set<string>>(new Set());
  const itemsRef = useRef<FeedItem[] | null>(null);
  itemsRef.current = items;
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const sentinel = useRef<HTMLDivElement>(null);
  const manager = usePhotoManager(supabase, null);

  useEffect(() => setDismissed(readDismissed()), []);

  // ---- first page (and the 30-second refresh)
  const refresh = useCallback(
    async (mode: "replace" | "soft" = "soft") => {
      const f = filterRef.current;
      try {
        const page = await fetchHomeFeed(supabase, { filter: f, limit: PAGE });
        if (f !== filterRef.current) return;
        setError(false);
        setLegacy(page.legacy);
        setPinned(page.pinned);
        setNow(Date.now());
        const cur = itemsRef.current;
        const topAt = cur && cur.length ? new Date(cur[0].at).getTime() : 0;
        const fresh = page.items.filter((i) => new Date(i.at).getTime() > topAt && !cur?.some((c) => c.key === i.key));
        if (mode === "soft" && cur && cur.length && fresh.length && typeof window !== "undefined" && window.scrollY > 320) {
          // they're reading further down: offer the new posts instead of jumping
          setPending(page.items);
          // still update counts on what's already on screen
          const byKey = new Map(page.items.map((i) => [i.key, i]));
          setItems((list) => (list ? list.map((x) => byKey.get(x.key) || x) : list));
          return;
        }
        setPending(null);
        if (mode === "replace" || !cur) setHasMore(page.hasMore);
        setItems((list) => {
          if (mode === "replace" || !list) return page.items;
          const keys = new Set(page.items.map((i) => i.key));
          const oldest = page.items.length ? page.items[page.items.length - 1].at : null;
          const rest = list.filter((x) => !keys.has(x.key) && (!oldest || new Date(x.at) < new Date(oldest)));
          return [...page.items, ...rest];
        });
      } catch {
        setError(true);
        setItems((cur) => cur ?? []);
      }
    },
    [supabase]
  );

  useEffect(() => {
    setItems(null);
    setPending(null);
    refresh("replace");
  }, [filter, refresh]);

  useEffect(() => {
    const t = setInterval(() => refresh("soft"), REFRESH_MS);
    const onVis = () => document.visibilityState === "visible" && refresh("soft");
    document.addEventListener("visibilitychange", onVis);
    const offPhotos = onPhotosChanged(() => refresh("replace"));
    const offFeed = onFeedChanged(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
      refresh("replace");
    });
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      offPhotos();
      offFeed();
    };
  }, [refresh]);

  // ---- rewards cards (prize race, challenges, winners, "you won")
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const t = awardsToast(await syncMyRewards(supabase));
        if (t && alive) toast(t);
      } catch {
        /* rewards not set up */
      }
      const [o, m] = await Promise.allSettled([fetchRewardsOverview(supabase), fetchMyRewards(supabase)]);
      if (!alive) return;
      if (o.status === "fulfilled") setOv(o.value);
      if (m.status === "fulfilled") setMe(m.value);
    })();
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [supabase]);

  // ---- older pages
  const loadMore = useCallback(async () => {
    const list = itemsRef.current;
    if (loadingMore || !list || !list.length) return;
    setLoadingMore(true);
    const f = filterRef.current;
    try {
      const page = await fetchHomeFeed(supabase, { filter: f, limit: PAGE, before: list[list.length - 1].at });
      if (f !== filterRef.current) return;
      setItems((cur) => {
        const keys = new Set((cur || []).map((x) => x.key));
        return [...(cur || []), ...page.items.filter((x) => !keys.has(x.key))];
      });
      setHasMore(page.hasMore && page.items.length > 0);
    } catch {
      toast("Couldn't load more. Check your connection.");
    } finally {
      setLoadingMore(false);
    }
  }, [supabase, loadingMore]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && loadMore(), { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore, items]);

  // ---- pull down at the top to refresh (touch screens)
  useEffect(() => {
    let start: number | null = null;
    let dist = 0;
    const onStart = (e: TouchEvent) => {
      start = window.scrollY <= 0 ? e.touches[0].clientY : null;
      dist = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (start == null) return;
      dist = Math.max(0, e.touches[0].clientY - start);
      setPull(Math.min(90, dist * 0.5));
    };
    const onEnd = async () => {
      if (start != null && dist > 120) {
        setRefreshing(true);
        haptic("tap");
        await refresh("replace");
        setRefreshing(false);
      }
      start = null;
      setPull(0);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [refresh]);

  // ---- kudos + comment counts shown from your own taps for a moment
  const decorate = useCallback(
    (it: FeedItem): FeedItem => {
      if (it.type !== "set" && it.type !== "pump" && it.type !== "wall") return it;
      let out = it as SocialItem;
      const k = kudos[it.key];
      if (k && now - k.at < OPTIMISTIC_MS) out = { ...out, kudos_count: k.count, kudos_mine: k.mine } as SocialItem;
      const c = comments[it.key];
      if (c) out = { ...out, comment_count: c.count, last_comment: c.last } as SocialItem;
      return out;
    },
    [kudos, comments, now]
  );

  const onKudos = useCallback(
    async (item: SocialItem, onlyGive = false) => {
      const cur = decorate(item) as SocialItem;
      if (onlyGive && cur.kudos_mine) return;
      if (inflight.current.has(item.key)) return;
      inflight.current.add(item.key);
      haptic("tap");
      const mine = !cur.kudos_mine;
      setKudos((k) => ({ ...k, [item.key]: { count: Math.max(0, cur.kudos_count + (mine ? 1 : -1)), mine, at: Date.now() } }));
      setNow(Date.now());
      try {
        const res =
          item.type === "set"
            ? await toggleKudos(supabase, item.post_id)
            : item.type === "pump"
              ? await togglePhotoKudos(supabase, item.item_id)
              : await toggleWallKudos(supabase, item.id);
        setKudos((k) => ({ ...k, [item.key]: { count: res.count, mine: res.mine, at: Date.now() } }));
      } catch {
        setKudos((k) => ({ ...k, [item.key]: { count: cur.kudos_count, mine: cur.kudos_mine, at: Date.now() } }));
      } finally {
        inflight.current.delete(item.key);
      }
    },
    [decorate, supabase]
  );

  const paths = useMemo(
    () =>
      (items || []).flatMap((i) =>
        i.type === "pump" ? [i.pre_path, i.post_path] : i.type === "wall" ? i.media.map((m) => m.path) : []
      ) as (string | null)[],
    [items]
  );
  const urls = useSignedUrls(supabase, paths);

  const openPump = useCallback(
    (post: PumpItem, kind: "pre" | "post") => {
      const id = kind === "pre" ? post.pre_photo_id : post.post_photo_id;
      const path = kind === "pre" ? post.pre_path : post.post_path;
      if (id == null) return;
      const url = path ? urls[path] ?? null : null;
      if (post.is_mine) {
        manager.viewOwn({ id, uid: "", kind, day: post.day, path: path || "", shared: true, hidden: false, created_at: post.created_at }, url);
        return;
      }
      manager.viewOther(
        { id, kind, day: post.day, url },
        { title: `${post.display_name}'s pump check`, reportIds: [post.pre_photo_id, post.post_photo_id].filter((x): x is number => x != null) }
      );
    },
    [manager, urls]
  );

  const sharePr = useCallback((item: SetItem) => {
    const m = MACHINE_MAP[item.machine_id];
    if (!m) return;
    const label = item.mode && m.modes?.[item.mode] ? m.modes[item.mode].label : m.name;
    setShare({ kind: "lift", machineId: item.machine_id, label, weight: Number(item.weight), reps: item.reps, unit: m.unit, isPb: true, sets: item.sets });
  }, []);

  const h: Handlers = {
    now,
    urls,
    comments: !legacy,
    onKudos,
    onComments: (it) => setOpenComments(it),
    onMenu: (it) => setMenuFor(it),
    onShare: sharePr,
    onOpenPump: openPump,
  };

  // ---- rows: feed items with the prize race, challenges and winners mixed in
  const rows = useMemo<Row[]>(() => {
    const list: Row[] = (items || []).map((item) => ({ k: "item", key: item.key, item }));
    if (filter !== "all" && filter !== "gym") return list;
    const extra: Row[] = [];
    const s = ov?.season;
    const live = (ov?.challenges || []).filter((c) => {
      const st = challengeStatus(c, now);
      return !st.ended && (st.live || new Date(c.starts_at).getTime() - now < 3 * 86400000);
    });
    if (s && s.prizes.length) extra.push({ k: "prize", key: "prize" });
    live.forEach((c) => extra.push({ k: "challenge", key: `challenge:${c.id}`, id: c.id }));
    if (ov?.last_winners && ov.last_winners.winners.length) extra.push({ k: "winners", key: "winners" });
    if (filter === "gym") return [...extra, ...list];
    const at = [1, 4, 8];
    const out = [...list];
    extra.forEach((r, n) => {
      const pos = Math.min(out.length, (at[n] ?? 8 + n * 4) + n);
      out.splice(pos, 0, r);
    });
    return out;
  }, [items, ov, filter, now]);

  const won = filter === "all" || filter === "gym" ? (me?.redemptions || []).filter((r) => r.source !== "shop" && r.status === "issued") : [];
  const showPinned = (filter === "all" || filter === "gym") ? pinned.filter((p) => !dismissed.includes(p.id)) : [];

  function dismiss(id: number) {
    const next = [...new Set([...dismissed, id])].slice(-50);
    setDismissed(next);
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  function showPending() {
    if (!pending) return;
    setItems((list) => {
      const keys = new Set(pending.map((i) => i.key));
      return [...pending, ...(list || []).filter((x) => !keys.has(x.key))];
    });
    setPending(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const newCount = pending && items && items.length ? pending.filter((p) => new Date(p.at) > new Date(items[0].at)).length : 0;
  const ce = openComments ? decorate(openComments) as SocialItem : null;
  const commentTitle = ce
    ? ce.type === "wall"
      ? `${ce.is_mine ? "Your" : `${ce.display_name.split(" ")[0]}'s`} post`
      : ce.type === "set"
        ? `${ce.is_mine ? "Your" : `${(ce.display_name || "").split(" ")[0]}'s`} ${ce.has_pb ? "PR" : "workout"}`
        : `${ce.is_mine ? "Your" : `${(ce.display_name || "").split(" ")[0]}'s`} pump check`
    : "";

  return (
    <section className="fx-feed-wrap" data-testid="home-feed" aria-labelledby="feed-h">
      <h2 id="feed-h" className="sr-only">
        Gym feed
      </h2>
      <div className="hx-filters" role="tablist" aria-label="Show">
        {FEED_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            className="hx-filter"
            onClick={() => {
              if (f.key === filter) window.scrollTo({ top: 0, behavior: "smooth" });
              setFilter(f.key);
            }}
            data-testid={`filter-${f.key}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {(pull > 0 || refreshing) && (
        <div className="fx-pull" style={{ height: refreshing ? 44 : pull }} aria-hidden="true">
          <span className={refreshing ? "spin" : ""} style={{ transform: `rotate(${pull * 4}deg)` }}>
            <Icon name="refresh" />
          </span>
        </div>
      )}

      {newCount > 0 && (
        <button type="button" className="fx-newpill" onClick={showPending} data-testid="new-posts">
          <Icon name="back" /> {newCount} new {newCount === 1 ? "post" : "posts"}
        </button>
      )}

      <div className="fx-feed">
        {won.map((r) => <WonCard key={`won:${r.id}`} r={r} />)}
        {showPinned.map((p) => (p.kind === "offer" ? <OfferCard key={`pin:${p.id}`} post={p} onClick={(id) => id && trackSponsorClick(supabase, id)} /> : <NoticeCard key={`pin:${p.id}`} post={p} now={now} onDismiss={() => dismiss(p.id)} />))}

        {items === null ? (
          <>
            <div className="fx-skel-card" aria-hidden="true" />
            <div className="fx-skel-card short" aria-hidden="true" />
            <div className="fx-skel-card" aria-hidden="true" />
          </>
        ) : rows.length === 0 && !showPinned.length && !won.length ? (
          <div className="fx-empty" data-testid="feed-empty">
            <span className="fx-empty-ic" aria-hidden="true">
              <Icon name={error ? "offline" : filter === "prs" ? "trophy" : filter === "gym" ? "megaphone" : "image"} />
            </span>
            <h3>{error ? "Couldn't load the feed" : EMPTY[filter].title}</h3>
            <p>{error ? "Check your connection and try again." : legacy && filter !== "all" && filter !== "prs" && filter !== "photos" ? "Posts arrive with the next app update." : EMPTY[filter].text}</p>
            {error ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => refresh("replace")}>
                <Icon name="refresh" /> Try again
              </button>
            ) : filter === "gym" ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFilter("all")}>
                {EMPTY.gym.cta}
              </button>
            ) : (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => openCreate(EMPTY[filter].target)}>
                <Icon name="plus" /> {EMPTY[filter].cta}
              </button>
            )}
          </div>
        ) : (
          rows.map((r) => {
            if (r.k === "prize") return ov?.season ? <PrizeCard key={r.key} ov={ov} me={me} now={now} /> : null;
            if (r.k === "winners") return ov?.last_winners ? <WinnersCard key={r.key} w={ov.last_winners} /> : null;
            if (r.k === "challenge") {
              const c = ov?.challenges.find((x) => x.id === r.id);
              return c ? <ChallengeCard key={r.key} c={c} now={now} strength={ov?.scoring === "strength"} /> : null;
            }
            const it = decorate(r.item);
            switch (it.type) {
              case "set":
                return <SetCard key={it.key} item={it} h={h} />;
              case "pump":
                return <PumpCard key={it.key} item={it} h={h} />;
              case "wall":
                return <WallCard key={it.key} item={it} h={h} />;
              case "gym":
                return it.kind === "offer" ? (
                  <OfferCard key={it.key} post={it} onClick={(id) => id && trackSponsorClick(supabase, id)} />
                ) : (
                  <NoticeCard key={it.key} post={it} now={now} />
                );
              case "milestone":
                return <MilestoneRow key={it.key} item={it} now={now} />;
              default:
                return null;
            }
          })
        )}

        {items && items.length > 0 && (
          <div ref={sentinel} className="fx-more-row">
            {hasMore ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={loadMore} disabled={loadingMore} data-testid="load-more">
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            ) : (
              <span className="fx-caught-up">
                <Icon name="check" /> You&rsquo;re all caught up
              </span>
            )}
          </div>
        )}
      </div>

      {ce && (
        <CommentsSheet
          supabase={supabase}
          target={ce.type === "set" ? { type: "set", id: ce.post_id } : ce.type === "pump" ? { type: "photo", id: ce.item_id } : { type: "wall", id: ce.id }}
          title={`Comments · ${commentTitle}`}
          meName={profile?.display_name ?? null}
          meAvatar={profile?.avatar_url ?? null}
          onClose={() => setOpenComments(null)}
          onChanged={(count, last) => setComments((c) => ({ ...c, [ce.key]: { count, last } }))}
        />
      )}

      {menuFor && (
        <Sheet open onClose={() => setMenuFor(null)} title={menuFor.is_mine ? "Your post" : `${menuFor.display_name.split(" ")[0]}'s post`} testId="post-menu-sheet">
          <div className="fx-menu">
            {menuFor.is_mine ? (
              <>
                <button type="button" onClick={() => (setEditing(menuFor), setMenuFor(null))} data-testid="menu-edit">
                  <Icon name="pen" /> Edit text and machine tag
                </button>
                <button type="button" className="danger" onClick={() => (setDeleting(menuFor), setMenuFor(null))} data-testid="menu-delete">
                  <Icon name="trash" /> Delete post
                </button>
              </>
            ) : (
              <button type="button" className="danger" onClick={() => (setReporting(menuFor), setMenuFor(null))} data-testid="menu-report">
                <Icon name="flag" /> Report post
              </button>
            )}
          </div>
        </Sheet>
      )}

      {editing && (
        <EditSheet
          post={editing}
          onClose={() => setEditing(null)}
          onSave={async (body, machine) => {
            await editPost(supabase, editing.id, body, machine?.id ?? null, machine?.mode ?? null);
            setItems((list) =>
              (list || []).map((x) => (x.key === editing.key && x.type === "wall" ? { ...x, body: body.trim() || null, machine_id: machine?.id ?? null, mode: machine?.mode ?? "", edited: true } : x))
            );
            setEditing(null);
            toast("Post updated");
          }}
        />
      )}

      <ConfirmSheet
        open={!!deleting}
        title="Delete this post?"
        body="It comes off the feed for everyone, with its photos, kudos and comments. This can't be undone."
        confirmLabel="Delete"
        danger
        busy={busy}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          setBusy(true);
          try {
            await deletePost(supabase, deleting.id);
            setItems((list) => (list || []).filter((x) => x.key !== deleting.key));
            toast("Post deleted");
            setDeleting(null);
          } catch {
            toast("That didn't go through. Try again.");
          } finally {
            setBusy(false);
          }
        }}
      />

      {reporting && (
        <Sheet open onClose={() => setReporting(null)} title="Report this post" testId="report-sheet">
          <p className="faint" style={{ margin: "0 0 12px", fontSize: 13.5 }}>
            Staff will take a look. If a few members report it, it&rsquo;s hidden until they do.
          </p>
          <div className="fx-menu">
            {["Spam or selling", "Rude or hurtful", "Not okay to show here", "Something else"].map((why) => (
              <button
                key={why}
                type="button"
                onClick={async () => {
                  try {
                    await reportPost(supabase, reporting.id, why);
                    toast("Thanks. Staff will take a look.");
                  } catch {
                    toast("That didn't go through. Try again.");
                  }
                  setReporting(null);
                }}
              >
                {why}
              </button>
            ))}
          </div>
        </Sheet>
      )}

      {share && <ShareStudio story={share} title="Share your PR" onClose={() => setShare(null)} />}
      {manager.ui}
    </section>
  );
}

function EditSheet({ post, onClose, onSave }: { post: WallItem; onClose: () => void; onSave: (body: string, machine: { id: string; mode: string | null } | null) => Promise<void> }) {
  const [body, setBody] = useState(post.body || "");
  const [machine, setMachine] = useState(post.machine_id ? `${post.machine_id}${post.mode ? `|${post.mode}` : ""}` : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const left = 280 - body.length;
  return (
    <Sheet open onClose={busy ? () => undefined : onClose} title="Edit post" testId="edit-post">
      <label className="field-label" htmlFor="edit-body">
        {post.kind === "text" ? "Your post" : "Caption"}
      </label>
      <textarea id="edit-body" className="field fx-textarea" rows={4} value={body} onChange={(e) => (setBody(e.target.value), setErr(null))} />
      <div className="fx-compose-foot">
        <span />
        <span className={`num${left < 0 ? " over" : ""}`}>{left}</span>
      </div>
      <label className="field-label" htmlFor="edit-machine" style={{ marginTop: 10 }}>
        Machine tag (optional)
      </label>
      <MachineSelect id="edit-machine" value={machine} onChange={setMachine} />
      {err && (
        <p className="field-error" role="alert">
          {err}
        </p>
      )}
      <button
        type="button"
        className="btn btn-yellow"
        style={{ marginTop: 14 }}
        disabled={busy}
        onClick={async () => {
          if (post.kind === "text" && !body.trim()) return setErr("Write something first");
          if (left < 0) return setErr("Keep it to 280 characters");
          if (hasLink(body)) return setErr("Links can't be posted. Write it out instead.");
          setBusy(true);
          try {
            const [id, mode] = machine.split("|");
            await onSave(body, id ? { id, mode: mode || null } : null);
          } catch (e) {
            setErr(friendlyDbError(e) || "Couldn't save. Try again.");
          } finally {
            setBusy(false);
          }
        }}
        data-testid="save-edit"
      >
        {busy ? "Saving…" : "Save"}
      </button>
    </Sheet>
  );
}

// "01 Lat Pulldown", "04 Pec Fly", "04 Rear Delt", ... value "id" or "id|mode"
export function MachineSelect({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <select id={id} className="field" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">No machine</option>
      {MACHINES.flatMap((m) =>
        m.dual && m.modes
          ? Object.entries(m.modes).map(([k, md]) => (
              <option key={`${m.id}|${k}`} value={`${m.id}|${k}`}>
                {m.number} {md.label}
              </option>
            ))
          : [
              <option key={m.id} value={m.id}>
                {m.number} {m.name}
              </option>,
            ]
      )}
    </select>
  );
}
