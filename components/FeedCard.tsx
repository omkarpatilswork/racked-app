"use client";

import Icon from "@/components/Icon";
import { MACHINE_MAP, MUSCLE_GROUPS, muscleGroupFor } from "@/lib/machines";
import { timeAgo } from "@/lib/time";
import type { FeedPost } from "@/lib/data";

function fmt(n: number) {
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: 1 });
}

// "Priya, Rahul and 3 others gave kudos" / "You and Priya gave kudos"
export function kudosLine(count: number, mine: boolean, names: string[]): string {
  if (count <= 0) return "";
  const others = count - (mine ? 1 : 0);
  const parts: string[] = [];
  if (mine) parts.push("You");
  const shown = names.slice(0, mine ? 1 : 2);
  parts.push(...shown);
  const remaining = Math.max(0, count - parts.length);
  if (remaining > 0) {
    parts.push(`${remaining} ${remaining === 1 ? "other" : "others"}`);
  }
  if (parts.length === 0) return `${others} gave kudos`;
  if (parts.length === 1) return `${parts[0]} gave kudos`;
  const last = parts[parts.length - 1];
  return `${parts.slice(0, -1).join(", ")} and ${last} gave kudos`;
}

export default function FeedCard({
  post,
  now,
  onKudos,
}: {
  post: FeedPost;
  now: number;
  onKudos: (post: FeedPost) => void;
}) {
  const machine = MACHINE_MAP[post.machine_id];
  if (!machine) return null;

  const mode = post.mode && machine.modes?.[post.mode] ? machine.modes[post.mode] : null;
  const machineName = mode ? mode.label : machine.name;
  const group = muscleGroupFor(post.machine_id, post.mode);
  const groupLabel = MUSCLE_GROUPS.find((g) => g.id === group)?.label;
  const name = post.is_mine ? "You" : post.display_name || "Member";
  const line = kudosLine(post.kudos_count, post.kudos_mine, post.kudos_names || []);

  return (
    <article className={`card feed-card${post.has_pb ? " pb" : ""}`} data-testid="feed-card">
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
          <div className="feed-name">
            {name}
            {post.has_pb && <span className="feed-badge">PB</span>}
          </div>
          <div className="feed-sub">
            {machineName} · {timeAgo(post.created_at, now)}
          </div>
        </div>
        {groupLabel && <span className="pill feed-group">{groupLabel}</span>}
      </header>

      <div className="feed-lift-box">
        {post.has_pb && (
          <div className="feed-pbline">
            <Icon name="trophy" /> New personal best
          </div>
        )}
        <div className="feed-lift">
          <span className="num feed-weight">{fmt(post.weight)}</span>
          <span className="feed-unit">{machine.unit}</span>
          <span className="feed-x">×</span>
          <span className="num feed-weight">{post.reps}</span>
        </div>
        <div className="feed-meta">
          {post.sets} {post.sets === 1 ? "set" : "sets"}
          {post.sets > 1 && post.volume > 0 ? ` · ${fmt(Math.round(post.volume))} kg moved` : ""}
          {post.xp > 0 ? ` · +${post.xp} XP` : ""}
        </div>
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
