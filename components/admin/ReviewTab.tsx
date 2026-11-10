"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/Icon";
import Avatar from "@/components/Avatar";
import ReasonSheet from "@/components/admin/ReasonSheet";
import SetRow from "@/components/admin/SetRow";
import { LoadError, MigrationNotice, SkeletonList, needsMigration } from "@/components/admin/shared";
import { adminApproveSet, adminDeleteSetLog, adminRemoveSet, adminReviewQueue, fetchAdminSetLogs, type ReviewItem } from "@/lib/data";
import { REMOVE_SET_REASONS, fmtNum, machineLabel } from "@/lib/fairplay";
import { MACHINES } from "@/lib/machines";
import { timeAgo } from "@/lib/time";
import { toast } from "@/lib/toast";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type SetLogRow = Database["public"]["Views"]["v_admin_set_logs"]["Row"];
type Target = { id: number; name: string; weight: number; reps: number; machine: string };

export default function ReviewTab({
  supabase,
  onChanged,
}: {
  supabase: SupabaseClient<Database>;
  onChanged: () => void;
}) {
  const [queue, setQueue] = useState<ReviewItem[] | null>(null);
  const [queueState, setQueueState] = useState<"ok" | "missing" | "error">("ok");
  const [machine, setMachine] = useState("all");
  const [recent, setRecent] = useState<SetLogRow[] | null>(null);
  const [recentFailed, setRecentFailed] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [removing, setRemoving] = useState<Target | null>(null);

  const loadQueue = useCallback(() => {
    setQueueState("ok");
    adminReviewQueue(supabase)
      .then(setQueue)
      .catch((err) => {
        setQueue([]);
        setQueueState(needsMigration(err) ? "missing" : "error");
      });
  }, [supabase]);

  const loadRecent = useCallback(() => {
    setRecentFailed(false);
    fetchAdminSetLogs(supabase, { period: "all", machineId: machine, limit: 60 })
      .then(setRecent)
      .catch(() => {
        setRecent([]);
        setRecentFailed(true);
      });
  }, [supabase, machine]);

  useEffect(() => {
    loadQueue();
    // keep the queue in step with the badge while the tab is open
    const t = setInterval(loadQueue, 60_000);
    return () => clearInterval(t);
  }, [loadQueue]);
  useEffect(() => {
    setRecent(null);
    loadRecent();
  }, [loadRecent]);

  async function approve(item: ReviewItem) {
    setBusy(item.id);
    try {
      await adminApproveSet(supabase, item.id);
      setQueue((q) => (q || []).filter((x) => x.id !== item.id));
      setRecent((r) => (r || []).map((x) => (x.id === item.id ? { ...x, review_status: "approved" } : x)));
      onChanged();
      toast(`Approved ${item.display_name.split(" ")[0]}'s ${fmtNum(item.weight)} kg`);
    } catch {
      toast("That didn't go through — try again");
    } finally {
      setBusy(null);
    }
  }

  async function confirmRemove(reason: string | null) {
    if (!removing) return;
    const t = removing;
    setBusy(t.id);
    const done = (msg: string) => {
      setQueue((q) => (q || []).filter((x) => x.id !== t.id));
      setRecent((r) => (r || []).filter((x) => x.id !== t.id));
      onChanged();
      setRemoving(null);
      toast(msg);
    };
    try {
      await adminRemoveSet(supabase, t.id, reason);
      done(`Removed. ${t.name.split(" ")[0]}'s PB and the leaderboard are updated.`);
    } catch (err) {
      if (needsMigration(err)) {
        // Database update 0010 not run yet: use the older delete (it still
        // recalculates the PB, but can't leave the member a note).
        try {
          await adminDeleteSetLog(supabase, t.id);
          done("Removed. (Run database update 0010 so members get a note.)");
        } catch {
          toast("That didn't go through — try again");
        }
      } else {
        toast("That didn't go through — try again");
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stack-lg" data-testid="tab-review">
      <section>
        <div className="section-head">
          <h2>Needs review</h2>
          {queue && queue.length > 0 && <span className="faint" style={{ fontSize: 12.5 }}>{queue.length} waiting</span>}
        </div>
        <p className="faint" style={{ margin: "-4px 0 12px", fontSize: 13 }}>
          Sets that jumped far above someone&rsquo;s usual weight, or a first set close to the machine&rsquo;s max. They count until you remove them.
        </p>
        {queue === null ? (
          <SkeletonList rows={2} height={150} />
        ) : queueState === "missing" ? (
          <MigrationNotice what="the review queue" />
        ) : queueState === "error" ? (
          <LoadError onRetry={loadQueue} />
        ) : queue.length === 0 ? (
          <div className="card empty" data-testid="queue-empty">
            <div className="tapin-icons" style={{ margin: "0 auto 10px" }}>
              <Icon name="check" />
            </div>
            <div style={{ fontWeight: 800, color: "var(--ink)" }}>All clear</div>
            <div style={{ fontSize: 13, marginTop: 2 }}>No suspicious sets right now.</div>
          </div>
        ) : (
          <div className="stack">
            {queue.map((item) => (
              <article key={item.id} className="card review-card" data-testid="review-item">
                <div className="row" style={{ justifyContent: "flex-start", gap: 10 }}>
                  <Avatar name={item.display_name} url={item.avatar_url} size={38} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800 }}>{item.display_name}</div>
                    <div className="faint" style={{ fontSize: 12.5 }}>
                      {machineLabel(item.machine_id, item.mode)} · {timeAgo(item.created_at)}
                    </div>
                  </div>
                </div>
                <div className="review-lift">
                  <span className="big-num">
                    {fmtNum(item.weight)}
                    <span style={{ fontSize: 14, color: "var(--ink-soft)", marginLeft: 3 }}>kg</span> × {item.reps}
                  </span>
                  <span className="faint" style={{ fontSize: 13 }}>
                    {item.prev_best != null ? `usual best ${fmtNum(item.prev_best)} kg` : "first set on this machine"} · {item.member_sets} set
                    {item.member_sets === 1 ? "" : "s"} here
                  </span>
                </div>
                {item.review_reason && (
                  <div className="flag-pill">
                    <Icon name="info" /> {item.review_reason}
                  </div>
                )}
                <div className="btn-row" style={{ marginTop: 14 }}>
                  <button type="button" className="btn btn-ghost" disabled={busy === item.id} onClick={() => approve(item)} data-testid="approve">
                    <Icon name="check" /> Looks fine
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={busy === item.id}
                    onClick={() =>
                      setRemoving({ id: item.id, name: item.display_name, weight: item.weight, reps: item.reps, machine: machineLabel(item.machine_id, item.mode) })
                    }
                    data-testid="remove-flagged"
                  >
                    <Icon name="trash" /> Remove set
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="section-head">
          <h2>All recent sets</h2>
        </div>
        <p className="faint" style={{ margin: "-4px 0 10px", fontSize: 13 }}>
          Remove any set. The member&rsquo;s PB, XP and every leaderboard recalculate straight away.
        </p>
        <div className="scroll-row" aria-label="Filter by machine" style={{ marginBottom: 12 }}>
          <button type="button" className="chip" aria-pressed={machine === "all"} onClick={() => setMachine("all")}>
            All machines
          </button>
          {MACHINES.map((m) => (
            <button key={m.id} type="button" className="chip" aria-pressed={machine === m.id} onClick={() => setMachine(m.id)}>
              {m.name}
            </button>
          ))}
        </div>
        {recent === null ? (
          <SkeletonList rows={4} height={56} />
        ) : recentFailed ? (
          <LoadError onRetry={loadRecent} />
        ) : recent.length === 0 ? (
          <div className="card empty">No sets logged{machine !== "all" ? " on this machine" : ""} yet.</div>
        ) : (
          <div className="list" data-testid="recent-sets">
            {recent.map((r) => (
              <SetRow
                key={r.id}
                row={r}
                busy={busy === r.id}
                onRemove={(row) =>
                  setRemoving({ id: row.id, name: row.display_name, weight: Number(row.weight), reps: row.reps, machine: machineLabel(row.machine_id, row.mode) })
                }
              />
            ))}
          </div>
        )}
      </section>

      <ReasonSheet
        open={!!removing}
        title="Remove this set?"
        body={
          removing ? (
            <>
              <b>
                {fmtNum(removing.weight)} kg × {removing.reps}
              </b>{" "}
              by {removing.name} on {removing.machine}. Their PB and XP are recalculated and they&rsquo;ll see a short note.
            </>
          ) : null
        }
        reasons={REMOVE_SET_REASONS}
        confirmLabel="Remove set"
        busy={busy !== null && busy === removing?.id}
        onConfirm={confirmRemove}
        onClose={() => setRemoving(null)}
      />
    </div>
  );
}
