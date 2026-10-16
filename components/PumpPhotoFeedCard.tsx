"use client";

import Icon from "@/components/Icon";
import { kudosLine } from "@/components/FeedCard";
import { timeAgo } from "@/lib/time";
import type { FeedPhotoPost, PumpKind } from "@/lib/data";

// A member's pump check for the day: pre and post photos side by side.
export default function PumpPhotoFeedCard({
  post,
  now,
  urls,
  onKudos,
  onOpen,
}: {
  post: FeedPhotoPost;
  now: number;
  urls: Record<string, string>;
  onKudos: (post: FeedPhotoPost) => void;
  onOpen: (post: FeedPhotoPost, kind: PumpKind) => void;
}) {
  const name = post.is_mine ? "You" : post.display_name || "Member";
  const line = kudosLine(post.kudos_count, post.kudos_mine, post.kudos_names || []);
  const items: { kind: PumpKind; path: string | null; label: string }[] = [
    { kind: "pre", path: post.pre_path, label: post.post_path ? "Before" : "Pre-workout" },
    { kind: "post", path: post.post_path, label: post.pre_path ? "After" : "Post-workout" },
  ];
  const shown = items.filter((i) => i.path);

  return (
    <article className="card feed-card" data-testid="photo-card">
      <header className="feed-head">
        <div className="avatar feed-avatar">
          {post.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            (post.display_name || "?").slice(0, 1).toUpperCase()
          )}
        </div>
        <div className="feed-who">
          <div className="feed-name">{name}</div>
          <div className="feed-sub">Pump check · {timeAgo(post.created_at, now)}</div>
        </div>
        <span className="pill feed-group">
          <Icon name="camera" /> Photos
        </span>
      </header>

      <div className={`pump-feed-grid${shown.length === 1 ? " single" : ""}`}>
        {shown.map((i) => {
          const url = i.path ? urls[i.path] : undefined;
          return (
            <button
              key={i.kind}
              type="button"
              className="pump-feed-img"
              onClick={() => onOpen(post, i.kind)}
              aria-label={`${i.label} photo — tap to view`}
            >
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="" loading="lazy" />
              ) : (
                <div className="pump-skel" />
              )}
              <span className="pump-tag">{i.label}</span>
            </button>
          );
        })}
      </div>

      <footer className="feed-foot">
        <button
          type="button"
          className={`feed-kudos${post.kudos_mine ? " on" : ""}`}
          onClick={() => onKudos(post)}
          aria-pressed={post.kudos_mine}
          aria-label={post.kudos_mine ? "Take back kudos" : "Give kudos"}
        >
          <Icon name="flame" />
          <span>{post.kudos_mine ? "Kudos given" : "Kudos"}</span>
          {post.kudos_count > 0 && <b className="num">{post.kudos_count}</b>}
        </button>
        {line && <div className="feed-kudos-line">{line}</div>}
      </footer>
    </article>
  );
}
