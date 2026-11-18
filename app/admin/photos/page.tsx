"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import SignInSheet from "@/components/SignInSheet";
import ConfirmSheet from "@/components/ConfirmSheet";
import { formatDay } from "@/components/PhotoViewer";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { adminSetPhotoHidden, deletePumpPhoto, fetchAdminPhotoReports, type AdminPhotoReport } from "@/lib/data";
import { adminFeedReports, adminSetCommentHidden, adminSetPostHidden, deleteComment, deletePost, isMissingFeed, type ReportedComment, type ReportedPost } from "@/lib/feed";
import { MACHINE_MAP } from "@/lib/machines";
import { timeAgo } from "@/lib/time";
import { useSignedUrls } from "@/lib/useSignedUrls";
import { toast } from "@/lib/toast";

type Del = { kind: "post"; row: ReportedPost } | { kind: "comment"; row: ReportedComment } | { kind: "photo"; row: AdminPhotoReport };
const KIND_LABEL: Record<ReportedPost["kind"], string> = { text: "Post", photo: "Photo post", transformation: "Transformation" };
const ON_LABEL: Record<ReportedComment["target_type"], string> = { wall: "a post", set: "a workout", photo: "a pump check" };

function Reasons({ reasons }: { reasons: string[] }) {
  const list = [...new Set(reasons.filter(Boolean))].slice(0, 3);
  if (!list.length) return null;
  return (
    <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>
      &ldquo;{list.join("”, “")}&rdquo;
    </div>
  );
}

function Count({ n, hidden }: { n: number; hidden: boolean }) {
  return (
    <div style={{ marginTop: 6, fontSize: 13 }}>
      <b className="num">{n}</b> {n === 1 ? "report" : "reports"}
      {hidden && (
        <span className="pill-yellow" style={{ marginLeft: 8, fontSize: 10.5 }}>
          HIDDEN
        </span>
      )}
    </div>
  );
}

// Staff only: what members reported on the feed (posts and comments) and pump
// photos, plus anything hidden automatically after 3 reports. Keep restores it
// and clears the reports; Hide keeps it off the feed; Delete removes it for good.
export default function AdminReportsPage() {
  const { session, profile, loading } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const isStaff = !!profile?.is_staff;
  const [photos, setPhotos] = useState<AdminPhotoReport[] | null>(null);
  const [feed, setFeed] = useState<{ posts: ReportedPost[]; comments: ReportedComment[] } | null>(null);
  const [feedMissing, setFeedMissing] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const [del, setDel] = useState<Del | null>(null);
  const paths = useMemo(() => [...(photos || []).map((r) => r.path), ...(feed?.posts || []).flatMap((p) => p.media.map((m) => m.path))], [photos, feed]);
  const urls = useSignedUrls(supabase, paths);

  const load = useCallback(async () => {
    const [ph, fd] = await Promise.allSettled([fetchAdminPhotoReports(supabase), adminFeedReports(supabase)]);
    setPhotos(ph.status === "fulfilled" ? ph.value : []);
    if (fd.status === "fulfilled") {
      setFeed(fd.value);
      setFeedMissing(false);
    } else {
      setFeed({ posts: [], comments: [] });
      setFeedMissing(isMissingFeed(fd.reason));
    }
    setError(ph.status === "rejected" && (fd.status === "rejected" && !isMissingFeed(fd.reason)));
  }, [supabase]);

  useEffect(() => {
    if (isStaff) load();
  }, [isStaff, load]);

  if (loading) return null;
  if (!session) {
    return (
      <div className="stack-lg center" style={{ paddingTop: 60 }}>
        <SignInSheet open onClose={() => {}} next="/admin/photos" />
      </div>
    );
  }
  if (!isStaff) {
    return (
      <div className="stack-lg center" style={{ paddingTop: 60 }}>
        <h2>Staff only</h2>
        <p className="muted">This page is for the gym team.</p>
        <Link href="/home" className="btn btn-primary" style={{ marginTop: 14 }}>
          Back home
        </Link>
      </div>
    );
  }

  async function run(key: string, fn: () => Promise<unknown>, done: string) {
    setBusy(key);
    try {
      await fn();
      toast(done);
      await load();
    } catch {
      toast("That didn't work. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const posts = feed?.posts || [];
  const comments = feed?.comments || [];
  const total = posts.length + comments.length + (photos?.length || 0);
  const ready = photos !== null && feed !== null;

  return (
    <>
      <div className="topbar">
        <Link href="/admin" className="iconbtn" aria-label="Back to dashboard">
          <Icon name="back" />
        </Link>
        <div className="brand">Reports</div>
        <div style={{ width: 38 }} />
      </div>
      <div className="stack">
        <p className="muted" style={{ fontSize: 13.5, margin: "0 0 4px" }}>
          Posts, comments and photos members reported, plus anything hidden automatically after 3 reports. <b>Keep</b> puts it back and clears the reports;{" "}
          <b>Hide</b> keeps it off the feed; <b>Delete</b> removes it for good.
        </p>

        {!ready ? (
          <div className="feed-skel" />
        ) : total === 0 ? (
          <div className="card feed-empty" data-testid="reports-empty">
            <div className="feed-glyph">
              <Icon name="check" />
            </div>
            <h3>{error ? "Couldn't load reports" : "Nothing to review"}</h3>
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              {error ? "Check your connection and try again." : "No reported or hidden posts, comments or photos right now."}
            </p>
          </div>
        ) : null}

        {ready && posts.length > 0 && (
          <section className="stack" data-testid="reported-posts">
            <h2 className="list-title">Posts · {posts.length}</h2>
            {posts.map((p) => (
              <div className="card admin-report" key={`p${p.id}`} data-testid="reported-post">
                {p.media.length > 0 && (
                  <div className="admin-report-media">
                    {p.media.map((m) => (
                      <button key={m.path} type="button" className="admin-photo-img" onClick={() => urls[m.path] && setZoom(urls[m.path])} aria-label={`Open ${m.label || "photo"}`}>
                        {urls[m.path] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={urls[m.path]} alt="" />
                        ) : (
                          <div className="pump-skel" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
                <div style={{ fontWeight: 800 }}>{p.author}</div>
                <div className="faint" style={{ fontSize: 12.5, marginTop: 2 }}>
                  {[KIND_LABEL[p.kind], p.machine_id ? MACHINE_MAP[p.machine_id]?.name : null, timeAgo(p.created_at)].filter(Boolean).join(" · ")}
                </div>
                {p.body && <p className="admin-report-text">{p.body}</p>}
                <Count n={p.reports} hidden={p.hidden} />
                <Reasons reasons={p.reasons} />
                <div className="btn-row" style={{ marginTop: 10 }}>
                  <button className="btn btn-outline btn-sm" disabled={busy !== null} onClick={() => run(`p${p.id}`, () => adminSetPostHidden(supabase, p.id, false), "Post kept")} data-testid="keep-post">
                    Keep
                  </button>
                  {!p.hidden && (
                    <button className="btn btn-outline btn-sm" disabled={busy !== null} onClick={() => run(`p${p.id}`, () => adminSetPostHidden(supabase, p.id, true), "Post hidden")} data-testid="hide-post">
                      Hide
                    </button>
                  )}
                  <button className="btn btn-sm admin-del" disabled={busy !== null} onClick={() => setDel({ kind: "post", row: p })} data-testid="delete-post">
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}

        {ready && comments.length > 0 && (
          <section className="stack" data-testid="reported-comments">
            <h2 className="list-title">Comments · {comments.length}</h2>
            {comments.map((c) => (
              <div className="card admin-report" key={`c${c.id}`} data-testid="reported-comment">
                <div style={{ fontWeight: 800 }}>{c.author}</div>
                <div className="faint" style={{ fontSize: 12.5, marginTop: 2 }}>
                  Comment on {ON_LABEL[c.target_type]} · {timeAgo(c.created_at)}
                </div>
                <p className="admin-report-text">{c.body}</p>
                <Count n={c.reports} hidden={c.hidden} />
                <Reasons reasons={c.reasons} />
                <div className="btn-row" style={{ marginTop: 10 }}>
                  <button className="btn btn-outline btn-sm" disabled={busy !== null} onClick={() => run(`c${c.id}`, () => adminSetCommentHidden(supabase, c.id, false), "Comment kept")} data-testid="keep-comment">
                    Keep
                  </button>
                  {!c.hidden && (
                    <button className="btn btn-outline btn-sm" disabled={busy !== null} onClick={() => run(`c${c.id}`, () => adminSetCommentHidden(supabase, c.id, true), "Comment hidden")} data-testid="hide-comment">
                      Hide
                    </button>
                  )}
                  <button className="btn btn-sm admin-del" disabled={busy !== null} onClick={() => setDel({ kind: "comment", row: c })} data-testid="delete-reported-comment">
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}

        {ready && (photos?.length || 0) > 0 && (
          <section className="stack" data-testid="reported-photos">
            <h2 className="list-title">Pump photos · {photos!.length}</h2>
            {photos!.map((r) => (
              <div className="card admin-photo" key={r.id} data-testid="report-row">
                <button type="button" className="admin-photo-img" onClick={() => urls[r.path] && setZoom(urls[r.path])} aria-label="Open photo">
                  {urls[r.path] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={urls[r.path]} alt="" />
                  ) : (
                    <div className="pump-skel" />
                  )}
                </button>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800 }}>{r.display_name}</div>
                  <div className="faint" style={{ fontSize: 12.5, marginTop: 2 }}>
                    {r.kind === "pre" ? "Pre" : "Post"} · {formatDay(r.day)} · {r.shared ? "shared" : "private"}
                  </div>
                  <Count n={r.report_count} hidden={r.hidden} />
                  <Reasons reasons={r.reasons} />
                  <div className="btn-row" style={{ marginTop: 10 }}>
                    <button className="btn btn-outline btn-sm" disabled={busy !== null} onClick={() => run(`ph${r.id}`, () => adminSetPhotoHidden(supabase, r.id, false), "Photo restored")}>
                      Keep
                    </button>
                    {!r.hidden && (
                      <button className="btn btn-outline btn-sm" disabled={busy !== null} onClick={() => run(`ph${r.id}`, () => adminSetPhotoHidden(supabase, r.id, true), "Photo hidden")}>
                        Hide
                      </button>
                    )}
                    <button className="btn btn-sm admin-del" disabled={busy !== null} onClick={() => setDel({ kind: "photo", row: r })}>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </section>
        )}

        {feedMissing && (
          <p className="faint" style={{ fontSize: 12.5 }} data-testid="needs-0014">
            Reported posts and comments show here once database update 0014_social_feed.sql is run.
          </p>
        )}
      </div>

      <ConfirmSheet
        open={!!del}
        title={del?.kind === "post" ? "Delete this post?" : del?.kind === "comment" ? "Delete this comment?" : "Delete this photo?"}
        body={
          del?.kind === "post"
            ? `${del.row.author}'s post comes off the feed with its photos, kudos and comments. This can't be undone.`
            : del?.kind === "comment"
              ? `${del.row.author}'s comment is removed for good.`
              : del
                ? `${del.row.display_name}'s ${del.row.kind} photo and its file are removed for good.`
                : ""
        }
        confirmLabel="Delete"
        danger
        busy={busy !== null}
        onClose={() => setDel(null)}
        onConfirm={async () => {
          if (!del) return;
          const d = del;
          await run(
            "del",
            () => (d.kind === "post" ? deletePost(supabase, d.row.id) : d.kind === "comment" ? deleteComment(supabase, d.row.id) : deletePumpPhoto(supabase, d.row.id)),
            d.kind === "post" ? "Post deleted" : d.kind === "comment" ? "Comment deleted" : "Photo deleted"
          );
          setDel(null);
        }}
      />

      {zoom && (
        <div className="pump-viewer" onClick={() => setZoom(null)}>
          <div className="pump-viewer-img" style={{ paddingTop: 40 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={zoom} alt="" />
          </div>
        </div>
      )}
    </>
  );
}
