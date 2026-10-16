"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import FeedCard from "@/components/FeedCard";
import { createClient } from "@/lib/supabase/client";
import { fetchFeed, toggleKudos, type FeedPost } from "@/lib/data";

const PAGE = 15;
const REFRESH_MS = 30_000;
// A kudos you just tapped is shown from your own tap for this long, so the
// 30-second background refresh can't flicker it back to an older count.
const OPTIMISTIC_MS = 25_000;

type KudosState = { count: number; mine: boolean; at: number };

export default function HomeFeed() {
  const supabase = useMemo(() => createClient(), []);
  const [latest, setLatest] = useState<FeedPost[] | null>(null); // refreshed page 1
  const [older, setOlder] = useState<FeedPost[]>([]); // pages loaded with "Load more"
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [kudos, setKudos] = useState<Record<number, KudosState>>({});
  const inflight = useRef<Set<number>>(new Set());
  const firstLoad = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const page = await fetchFeed(supabase, { limit: PAGE });
      setLatest(page);
      setError(false);
      setNow(Date.now());
      // On the very first load, a page shorter than full means nothing is
      // further back. After that "Load older" owns hasMore.
      if (firstLoad.current) {
        firstLoad.current = false;
        setHasMore(page.length >= PAGE);
      }
    } catch {
      setError(true);
      setLatest((cur) => cur ?? []);
    }
  }, [supabase]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, REFRESH_MS);
    const onVis = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  // newest page wins over anything already loaded further back
  const posts = useMemo(() => {
    const byId = new Map<number, FeedPost>();
    older.forEach((p) => byId.set(p.post_id, p));
    (latest || []).forEach((p) => byId.set(p.post_id, p));
    return [...byId.values()]
      .map((p) => {
        const k = kudos[p.post_id];
        return k && now - k.at < OPTIMISTIC_MS
          ? { ...p, kudos_count: k.count, kudos_mine: k.mine }
          : p;
      })
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  }, [latest, older, kudos, now]);

  const loadMore = useCallback(async () => {
    if (loadingMore || posts.length === 0) return;
    setLoadingMore(true);
    try {
      const before = posts[posts.length - 1].created_at;
      const page = await fetchFeed(supabase, { limit: PAGE, before });
      setOlder((o) => [...o, ...page]);
      if (page.length < PAGE) setHasMore(false);
    } catch {
      setError(true);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, posts, supabase]);

  const onKudos = useCallback(
    async (post: FeedPost) => {
      if (inflight.current.has(post.post_id)) return;
      inflight.current.add(post.post_id);
      const mine = !post.kudos_mine;
      const optimistic = Math.max(0, post.kudos_count + (mine ? 1 : -1));
      setKudos((k) => ({ ...k, [post.post_id]: { count: optimistic, mine, at: Date.now() } }));
      setNow(Date.now());
      try {
        const res = await toggleKudos(supabase, post.post_id);
        setKudos((k) => ({ ...k, [post.post_id]: { count: res.count, mine: res.mine, at: Date.now() } }));
      } catch {
        // put it back the way it was
        setKudos((k) => ({
          ...k,
          [post.post_id]: { count: post.kudos_count, mine: post.kudos_mine, at: Date.now() },
        }));
      } finally {
        inflight.current.delete(post.post_id);
      }
    },
    [supabase]
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
      ) : posts.length === 0 ? (
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
          {posts.map((p) => (
            <FeedCard key={p.post_id} post={p} now={now} onKudos={onKudos} />
          ))}
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
    </section>
  );
}
