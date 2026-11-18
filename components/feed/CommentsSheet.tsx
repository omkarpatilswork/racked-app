"use client";

// Comments on a post, PR or pump check: read them, add one (280 characters,
// no links), delete yours, report someone else's.
import { useEffect, useRef, useState } from "react";
import Sheet from "@/components/Sheet";
import Icon from "@/components/Icon";
import Avatar from "@/components/Avatar";
import { addComment, deleteComment, hasLink, listComments, reportComment, type Comment, type CommentTarget } from "@/lib/feed";
import { friendlyDbError } from "@/lib/data";
import { timeAgo } from "@/lib/time";
import { toast } from "@/lib/toast";
import { haptic } from "@/lib/haptics";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

const MAX = 280;

export default function CommentsSheet({
  supabase,
  target,
  title,
  meName,
  meAvatar,
  onClose,
  onChanged,
}: {
  supabase: SupabaseClient<Database>;
  target: { type: CommentTarget; id: number };
  title: string;
  meName: string | null;
  meAvatar: string | null;
  onClose: () => void;
  onChanged: (count: number, last: { name: string; body: string; is_mine: boolean } | null) => void;
}) {
  const [rows, setRows] = useState<Comment[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [menu, setMenu] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    listComments(supabase, target.type, target.id)
      .then((r) => alive && setRows(r))
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [supabase, target.type, target.id]);

  function report(list: Comment[]) {
    const vis = list.filter((c) => !c.hidden || c.is_mine);
    const last = vis[vis.length - 1];
    onChanged(vis.filter((c) => !c.hidden).length, last ? { name: (last.display_name || "").split(" ")[0], body: last.body, is_mine: last.is_mine } : null);
  }

  async function send() {
    const body = text.trim();
    if (!body) return;
    if (body.length > MAX) return setErr(`Keep it to ${MAX} characters`);
    if (hasLink(body)) return setErr("Links can't be posted. Write it out instead.");
    setBusy(true);
    setErr(null);
    try {
      const c = await addComment(supabase, target.type, target.id, body);
      haptic("tap");
      const next = [...(rows || []), c];
      setRows(next);
      setText("");
      report(next);
      requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }));
    } catch (e) {
      setErr(friendlyDbError(e) || "Couldn't post that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: Comment) {
    setMenu(null);
    try {
      await deleteComment(supabase, c.id);
      const next = (rows || []).filter((x) => x.id !== c.id);
      setRows(next);
      report(next);
      toast("Comment deleted");
    } catch {
      toast("That didn't go through. Try again.");
    }
  }

  async function flag(c: Comment) {
    setMenu(null);
    try {
      await reportComment(supabase, c.id);
      toast("Thanks. Staff will take a look.");
    } catch {
      toast("That didn't go through. Try again.");
    }
  }

  const left = MAX - text.length;
  return (
    <Sheet open onClose={onClose} title={title} testId="comments-sheet" className="fx-comments-sheet">
      <div className="fx-comments" ref={listRef} aria-live="polite">
        {rows === null ? (
          <div className="stack">
            <div className="skeleton" style={{ height: 44 }} />
            <div className="skeleton" style={{ height: 44 }} />
          </div>
        ) : rows.length === 0 ? (
          <p className="fx-comments-empty">No comments yet. Say something nice.</p>
        ) : (
          rows.map((c) => (
            <div key={c.id} className={`fx-comment${c.hidden ? " hidden" : ""}`} data-testid="comment">
              <Avatar name={c.display_name} url={c.avatar_url} size={32} />
              <div className="fx-comment-body">
                <div className="fx-comment-head">
                  <b>{c.is_mine ? "You" : c.display_name}</b>
                  <span>{timeAgo(c.created_at)}</span>
                </div>
                <p>{c.body}</p>
                {c.hidden && <small className="fx-comment-note">Hidden after reports. Only you can see it.</small>}
              </div>
              <div className="fx-comment-menu">
                <button type="button" className="fx-more sm" aria-label={c.is_mine ? "Delete your comment" : "Report this comment"} aria-expanded={menu === c.id} onClick={() => setMenu(menu === c.id ? null : c.id)}>
                  <Icon name="more" />
                </button>
                {menu === c.id && (
                  <div className="fx-pop" role="menu">
                    {c.is_mine ? (
                      <button type="button" role="menuitem" onClick={() => remove(c)} data-testid="delete-comment">
                        <Icon name="trash" /> Delete
                      </button>
                    ) : (
                      <button type="button" role="menuitem" onClick={() => flag(c)} data-testid="report-comment">
                        <Icon name="flag" /> Report
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      <form
        className="fx-compose-row"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <Avatar name={meName} url={meAvatar} size={32} />
        <label className="sr-only" htmlFor="fx-comment-input">
          Add a comment
        </label>
        <textarea
          id="fx-comment-input"
          className="fx-comment-input"
          rows={1}
          maxLength={MAX + 20}
          placeholder="Add a comment…"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setErr(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          data-testid="comment-input"
        />
        <button type="submit" className="fx-send" disabled={busy || !text.trim() || left < 0} aria-label="Post comment" data-testid="comment-send">
          <Icon name="send" />
        </button>
      </form>
      <div className="fx-compose-foot">
        {err ? (
          <span className="field-error" role="alert">
            {err}
          </span>
        ) : (
          <span />
        )}
        {text.length > MAX - 40 && <span className={`num${left < 0 ? " over" : ""}`}>{left}</span>}
      </div>
    </Sheet>
  );
}
