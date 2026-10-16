"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import FeedCard from "@/components/FeedCard";
import PumpPhotoFeedCard from "@/components/PumpPhotoFeedCard";
import { usePhotoManager } from "@/components/usePhotoManager";
import { createClient } from "@/lib/supabase/client";
import {
  fetchFeed,
  fetchFeedPhotos,
  toggleKudos,
  togglePhotoKudos,
  type FeedPhotoPost,
  type FeedPost,
  type PumpKind,
} from "@/lib/data";
import { onPhotosChanged } from "@/lib/photoEvents";
import { useSignedUrls } from "@/lib/useSignedUrls";

const PAGE = 15;
const REFRESH_MS = 30_000;
// A kudos you just tapped is shown from your own tap for this long, so the
// 30-second background refresh can't flicker it back to an older count.
const OPTIMISTIC_MS = 25_000;

type KudosState = { count: number; mine: boolean; at: number };
type Item =
  | { type: "set"; key: string; at: string; post: FeedPost }
  | { type: "photo"; key: string; at: string; post: FeedPhotoPost };

export default function HomeFeed() {
  const supabase = useMemo(() => createClient(), []);
  // Workout posts and photo posts are two feeds merged by time. Each keeps its
  // own newest page (refreshed) and its own older pages ("Load older").
  const [latest, setLatest] = useState<FeedPost[] | null>(null);
  const [older, setOlder] = useState<FeedPost[]>([]);
  const [hasMoreSets, setHasMoreSets] = useState(true);
  const [latestPhotos, setLatestPhotos] = useState<FeedPhotoPost[]>([]);
  const [olderPhotos, setOlderPhotos] = useState<FeedPhotoPost[]>([]);
  const [hasMorePhotos, setHasMorePhotos] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [kudos, setKudos] = useState<Record<string, KudosState>>({});
  const inflight = useRef<Set<string>>(new Set());
  const firstLoad = useRef(true);
  const manager = usePhotoManager(supabase, null);

  const refresh = useCallback(async () => {
    // Photos need migration 0007; if it hasn't been run the photo feed just
    // comes back empty and the workout feed carries on as normal.
    const [sets, photos] = await Promise.allSettled([
      fetchFeed(supabase, { limit: PAGE }),
      fetchFeedPhotos(supabase, { limit: PAGE }),
    ]);
    if (sets.status === "fulfilled") {
      setLatest(sets.value);
      setError(false);
    } else {
      setError(true);
      setLatest((cur) => cur ?? []);
    }
    if (photos.status === "fulfilled") setLatestPhotos(photos.value);
    setNow(Date.now());
    if (firstLoad.current) {
      firstLoad.current = false;
      if (sets.status === "fulfilled") setHasMoreSets(sets.value.length >= PAGE);
      setHasMorePhotos(photos.status === "fulfilled" && photos.value.length >= PAGE);
    }
  }, [supabase]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, REFRESH_MS);
    const onVis = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVis);
    const offPhotos = onPhotosChanged(refresh);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      offPhotos();
    };
  }, [refresh]);

  const withKudos = useCallback(
    <T extends { kudos_count: number; kudos_mine: boolean }>(key: string, p: T): T => {
      const k = kudos[key];
      return k && now - k.at < OPTIMISTIC_MS ? { ...p, kudos_count: k.count, kudos_mine: k.mine } : p;
    },
    [kudos, now]
  );

  // newest page wins over anything already loaded further back
  const items = useMemo<Item[]>(() => {
    const sets = new Map<number, FeedPost>();
    older.forEach((p) => sets.set(p.post_id, p));
    (latest || []).forEach((p) => sets.set(p.post_id, p));
    const photos = new Map<number, FeedPhotoPost>();
    olderPhotos.forEach((p) => photos.set(p.item_id, p));
    latestPhotos.forEach((p) => photos.set(p.item_id, p));
    const all: Item[] = [
      ...[...sets.values()].map((p): Item => ({ type: "set", key: `set:${p.post_id}`, at: p.created_at, post: withKudos(`set:${p.post_id}`, p) })),
      ...[...photos.values()].map((p): Item => ({ type: "photo", key: `photo:${p.item_id}`, at: p.created_at, post: withKudos(`photo:${p.item_id}`, p) })),
    ];
    return all.sort((a, b) => +new Date(b.at) - +new Date(a.at));
  }, [latest, older, latestPhotos, olderPhotos, withKudos]);

  const photoPaths = useMemo(
    () =>
      items.flatMap((i) => (i.type === "photo" ? [i.post.pre_path, i.post.post_path] : [])).filter(Boolean) as string[],
    [items]
  );
  const urls = useSignedUrls(supabase, photoPaths);

  const hasMore = hasMoreSets || hasMorePhotos;

  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const setsOldest = [...(latest || []), ...older].map((p) => p.created_at).sort().at(0);
      const photosOldest = [...latestPhotos, ...olderPhotos].map((p) => p.created_at).sort().at(0);
      const [sets, photos] = await Promise.allSettled([
        hasMoreSets && setsOldest ? fetchFeed(supabase, { limit: PAGE, before: setsOldest }) : Promise.resolve([] as FeedPost[]),
        hasMorePhotos && photosOldest
          ? fetchFeedPhotos(supabase, { limit: PAGE, before: photosOldest })
          : Promise.resolve([] as FeedPhotoPost[]),
      ]);
      if (sets.status === "fulfilled") {
        setOlder((o) => [...o, ...sets.value]);
        if (sets.value.length < PAGE) setHasMoreSets(false);
      } else setError(true);
      if (photos.status === "fulfilled") {
        setOlderPhotos((o) => [...o, ...photos.value]);
        if (photos.value.length < PAGE) setHasMorePhotos(false);
      } else setHasMorePhotos(false);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, latest, older, latestPhotos, olderPhotos, hasMoreSets, hasMorePhotos, supabase]);

  const onKudos = useCallback(
    async (key: string, current: { kudos_count: number; kudos_mine: boolean }, send: () => Promise<{ count: number; mine: boolean }>) => {
      if (inflight.current.has(key)) return;
      inflight.current.add(key);
      const mine = !current.kudos_mine;
      const optimistic = Math.max(0, current.kudos_count + (mine ? 1 : -1));
      setKudos((k) => ({ ...k, [key]: { count: optimistic, mine, at: Date.now() } }));
      setNow(Date.now());
      try {
        const res = await send();
        setKudos((k) => ({ ...k, [key]: { count: res.count, mine: res.mine, at: Date.now() } }));
      } catch {
        // put it back the way it was
        setKudos((k) => ({ ...k, [key]: { count: current.kudos_count, mine: current.kudos_mine, at: Date.now() } }));
      } finally {
        inflight.current.delete(key);
      }
    },
    []
  );

  const openPhoto = useCallback(
    (post: FeedPhotoPost, kind: PumpKind) => {
      const id = kind === "pre" ? post.pre_photo_id : post.post_photo_id;
      const path = kind === "pre" ? post.pre_path : post.post_path;
      if (id == null) return;
      const url = path ? urls[path] ?? null : null;
      if (post.is_mine) {
        // your own post: full controls (share / replace / delete)
        manager.viewOwn(
          { id, uid: "", kind, day: post.day, path: path || "", shared: true, hidden: false, created_at: post.created_at },
          url
        );
        return;
      }
      manager.viewOther(
        { id, kind, day: post.day, url },
        {
          title: `${post.display_name}'s pump check`,
          // report both photos of the post
          reportIds: [post.pre_photo_id, post.post_photo_id].filter((x): x is number => x != null),
        }
      );
    },
    [manager, urls]
  );

  return (
    <section data-testid="home-feed">
      <div className="feed-head-row">
        <div>
          <div className="eyebrow">Gym feed</div>
        </div>
        <span className="feed-live">
          <i /> Live
        </span>
      </div>

      {latest === null ? (
        <div className="stack">
          <div className="feed-skel" />
          <div className="feed-skel" />
        </div>
      ) : items.length === 0 ? (
        <div className="card feed-empty">
          <div className="feed-glyph">
            <Icon name="dumbbell" />
          </div>
          <h3>{error ? "Couldn't load the feed" : "No activity yet"}</h3>
          <p className="muted" style={{ margin: "0 0 14px", fontSize: 14 }}>
            {error
              ? "Check your connection — it'll try again in a few seconds."
              : "Tap a machine, log a set and be the first post on the feed."}
          </p>
          <Link href="/machines" className="btn btn-primary">
            <Icon name="grid" /> Explore machines
          </Link>
        </div>
      ) : (
        <div className="stack">
          {items.map((it) =>
            it.type === "set" ? (
              <FeedCard
                key={it.key}
                post={it.post}
                now={now}
                onKudos={(p) => onKudos(it.key, p, () => toggleKudos(supabase, p.post_id))}
              />
            ) : (
              <PumpPhotoFeedCard
                key={it.key}
                post={it.post}
                now={now}
                urls={urls}
                onKudos={(p) => onKudos(it.key, p, () => togglePhotoKudos(supabase, p.item_id))}
                onOpen={openPhoto}
              />
            )
          )}
          {hasMore ? (
            <button type="button" className="btn btn-outline" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Load older activity"}
            </button>
          ) : (
            <div className="faint" style={{ textAlign: "center", fontSize: 12.5, padding: "6px 0" }}>
              You&rsquo;re all caught up
            </div>
          )}
        </div>
      )}
      {manager.ui}
    </section>
  );
}
