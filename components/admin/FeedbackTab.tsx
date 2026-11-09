"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/Icon";
import ConfirmSheet from "@/components/ConfirmSheet";
import { LoadError, SkeletonList } from "@/components/admin/shared";
import { adminClearFeedback, adminDeleteFeedback, fetchAdminFeedback } from "@/lib/data";
import { MACHINES, MACHINE_MAP } from "@/lib/machines";
import { timeAgo } from "@/lib/time";
import { toast } from "@/lib/toast";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type FeedbackRow = Database["public"]["Tables"]["feedback"]["Row"];
type Status = FeedbackRow["status"];

const ISSUE_LABELS: Record<string, string> = {
  good: "👍 All good",
  clean: "🧹 Needs cleaning",
  broken: "🔧 Not working",
  seat: "🪑 Seat / adjustment",
  stack: "⚙️ Weight stack",
  damaged: "🏋️ Damaged",
  other: "Other",
};

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const blob = new Blob([rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function FeedbackTab({ supabase, onChanged }: { supabase: SupabaseClient<Database>; onChanged: () => void }) {
  const [machine, setMachine] = useState("all");
  const [status, setStatus] = useState<Status | "all">("open");
  const [rows, setRows] = useState<FeedbackRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: "one"; row: FeedbackRow } | { kind: "all" } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    setRows(null);
    fetchAdminFeedback(supabase, { period: "all", machineId: machine, status })
      .then(setRows)
      .catch(() => {
        setRows([]);
        setFailed(true);
      });
  }, [supabase, machine, status]);
  useEffect(load, [load]);

  async function setRowStatus(id: number, next: Status) {
    const { error } = await supabase.from("feedback").update({ status: next }).eq("id", id);
    if (error) return toast("Couldn't update — try again");
    setRows((r) => (status === "all" ? (r || []).map((f) => (f.id === id ? { ...f, status: next } : f)) : (r || []).filter((f) => f.id !== id)));
    onChanged();
    toast(next === "resolved" ? "Marked fixed" : next === "dismissed" ? "Dismissed" : "Reopened");
  }

  return (
    <div className="stack-lg" data-testid="tab-feedback">
      <div className="tabs" role="tablist" aria-label="Status">
        {(["open", "resolved", "dismissed", "all"] as const).map((s) => (
          <button key={s} role="tab" aria-selected={status === s} className={`tab${status === s ? " active" : ""}`} onClick={() => setStatus(s)}>
            {s === "open" ? "Open" : s === "resolved" ? "Fixed" : s === "dismissed" ? "Dismissed" : "All"}
          </button>
        ))}
      </div>
      <div className="scroll-row" aria-label="Filter by machine">
        <button type="button" className="chip" aria-pressed={machine === "all"} onClick={() => setMachine("all")}>
          All machines
        </button>
        {MACHINES.map((m) => (
          <button key={m.id} type="button" className="chip" aria-pressed={machine === m.id} onClick={() => setMachine(m.id)}>
            {m.name}
          </button>
        ))}
      </div>

      {rows === null ? (
        <SkeletonList rows={3} height={110} />
      ) : failed ? (
        <LoadError onRetry={load} />
      ) : rows.length === 0 ? (
        <div className="card empty">Nothing here. {status === "open" ? "No open issues 🎉" : ""}</div>
      ) : (
        <div className="stack">
          {rows.map((f) => {
            const issues = (f.issues || []).filter((i) => i !== "good");
            return (
              <article key={f.id} className="card" style={{ padding: 16 }} data-testid="feedback-item">
                <div className="row">
                  <b>{MACHINE_MAP[f.machine_id]?.name ?? f.machine_id}</b>
                  <span aria-label={`${f.rating} out of 5`} style={{ color: "var(--accent-text)", fontSize: 13, letterSpacing: 1 }}>
                    {"★".repeat(f.rating)}
                    <span style={{ opacity: 0.3 }}>{"★".repeat(5 - f.rating)}</span>
                  </span>
                </div>
                {issues.length > 0 && (
                  <div className="chip-row" style={{ marginTop: 8 }}>
                    {issues.map((k) => (
                      <span key={k} className="pill" style={{ fontSize: 11.5, padding: "4px 9px" }}>
                        {ISSUE_LABELS[k] || k}
                      </span>
                    ))}
                  </div>
                )}
                {f.comment && <p style={{ fontSize: 14, margin: "10px 0 0" }}>&ldquo;{f.comment}&rdquo;</p>}
                <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>
                  {f.display_name} · {timeAgo(f.created_at)}
                </div>
                <div className="row" style={{ marginTop: 12, gap: 8 }}>
                  <div className="chip-row">
                    {f.status !== "resolved" && (
                      <button type="button" className="btn btn-yellow btn-sm" onClick={() => setRowStatus(f.id, "resolved")}>
                        <Icon name="check" /> Fixed
                      </button>
                    )}
                    {f.status === "open" ? (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRowStatus(f.id, "dismissed")}>
                        Dismiss
                      </button>
                    ) : (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRowStatus(f.id, "open")}>
                        Reopen
                      </button>
                    )}
                  </div>
                  <button type="button" className="icon-btn-danger" aria-label="Delete feedback" onClick={() => setConfirm({ kind: "one", row: f })}>
                    <Icon name="trash" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="btn-row">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={!rows || rows.length === 0}
          onClick={() =>
            downloadCsv(`racked-feedback-${status}.csv`, [
              ["Machine", "Rating", "Issues", "Comment", "Status", "Name", "Created at"],
              ...(rows || []).map((f) => [MACHINE_MAP[f.machine_id]?.name || f.machine_id, f.rating, (f.issues || []).join("; "), f.comment || "", f.status, f.display_name, f.created_at]),
            ])
          }
        >
          <Icon name="download" /> Export CSV
        </button>
        <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirm({ kind: "all" })}>
          Clear {machine === "all" ? "all" : MACHINE_MAP[machine]?.name} feedback…
        </button>
      </div>

      <ConfirmSheet
        open={!!confirm}
        title={confirm?.kind === "all" ? "Clear feedback?" : "Delete this feedback?"}
        body={
          confirm?.kind === "all"
            ? `Deletes all feedback for ${machine === "all" ? "every machine" : MACHINE_MAP[machine]?.name}. This can't be undone.`
            : "This can't be undone."
        }
        confirmLabel={confirm?.kind === "all" ? "Clear feedback" : "Delete"}
        danger
        busy={busy}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          if (!confirm) return;
          setBusy(true);
          try {
            if (confirm.kind === "one") {
              await adminDeleteFeedback(supabase, confirm.row.id);
              setRows((r) => (r || []).filter((x) => x.id !== confirm.row.id));
            } else {
              await adminClearFeedback(supabase, machine === "all" ? undefined : machine);
              setRows([]);
            }
            setConfirm(null);
            onChanged();
            toast("Done");
          } catch {
            toast("That didn't go through — try again");
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
