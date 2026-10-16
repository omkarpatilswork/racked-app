"use client";

import { useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import SignInSheet from "@/components/SignInSheet";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { MACHINES, MACHINE_MAP } from "@/lib/machines";
import { toast } from "@/lib/toast";
import { PERIOD_OPTIONS, type Period } from "@/lib/period";
import {
  adminClearFeedback,
  adminDeleteFeedback,
  adminDeleteSetLog,
  adminResetAllData,
  adminResetMachine,
  fetchAdminFeedback,
  fetchAdminSetCount,
  fetchAdminSetLogs,
  fetchAdminTapCounts,
  sumTapCounts,
  type TapCounts,
} from "@/lib/data";
import type { Database } from "@/lib/database.types";

type FeedbackRow = Database["public"]["Tables"]["feedback"]["Row"];
type SetLogRow = Database["public"]["Views"]["v_admin_set_logs"]["Row"];
type StatusFilter = FeedbackRow["status"] | "all";

const ISSUE_LABELS: Record<string, string> = {
  good: "👍 Everything is good",
  clean: "🧹 Needs cleaning",
  broken: "🔧 Machine not working",
  seat: "🪑 Seat / adjustment issue",
  stack: "⚙️ Weight stack issue",
  damaged: "🏋️ Equipment damaged",
  other: "Other",
};

function health(machineId: string, feedback: FeedbackRow[]): "green" | "yellow" | "red" {
  const critical = feedback.filter(
    (f) => f.machine_id === machineId && f.status !== "resolved" && (f.issues || []).some((i) => ["broken", "damaged", "stack"].includes(i))
  );
  if (critical.length > 0) return "red";
  const minor = feedback.filter((f) => f.machine_id === machineId && f.status === "open" && (f.issues || []).some((i) => i !== "good"));
  if (minor.length > 0) return "yellow";
  return "green";
}

const HEALTH_LABEL = { green: "Operational", yellow: "Needs attention", red: "Reported issue" } as const;
const HEALTH_COLOR = { green: "var(--good)", yellow: "var(--warn)", red: "var(--danger)" } as const;
const HEALTH_DOT = { green: "resolved", yellow: "progress", red: "open" } as const;

function timeAgo(iso: string) {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} minutes ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} hours ago`;
  return `${Math.round(mins / 1440)} days ago`;
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminPage() {
  const { session, profile, loading, signOut } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  // Display filters — scope everything below the stat tiles.
  const [period, setPeriod] = useState<Period>("all");
  const [machineFilter, setMachineFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  // A separate picker for the danger zone's per-machine reset, kept apart
  // from machineFilter above so browsing a machine's feedback never lines
  // it up as the thing about to be wiped.
  const [resetMachineSel, setResetMachineSel] = useState<string>(MACHINES[0].id);

  const [totalSets, setTotalSets] = useState(0);
  const [tapCounts, setTapCounts] = useState<Record<string, TapCounts>>({});
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);
  // Always all-time, unfiltered — machine health reflects real unresolved
  // issues, not whatever period/machine/status the dashboard happens to be
  // scrolled to right now.
  const [healthFeedback, setHealthFeedback] = useState<FeedbackRow[]>([]);
  const [setLogs, setSetLogs] = useState<SetLogRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const isStaff = !!profile?.is_staff;

  useEffect(() => {
    if (!isStaff) return;
    let active = true;

    async function load() {
      const [taps, setCount, fb, allFb, logs] = await Promise.all([
        fetchAdminTapCounts(supabase, period),
        fetchAdminSetCount(supabase, period),
        fetchAdminFeedback(supabase, { period, machineId: machineFilter, status: statusFilter }),
        fetchAdminFeedback(supabase, { period: "all" }),
        fetchAdminSetLogs(supabase, { period, machineId: machineFilter }),
      ]);
      if (!active) return;
      setTapCounts(taps);
      setTotalSets(setCount);
      setFeedback(fb);
      setHealthFeedback(allFb);
      setSetLogs(logs);
    }
    load();

    const channel = supabase
      .channel("admin-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "feedback" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "machine_stats" }, load)
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [isStaff, supabase, period, machineFilter, statusFilter]);

  if (loading) return null;

  if (!session) {
    return (
      <div className="stack-lg" style={{ paddingTop: "16vh", minHeight: "72vh" }}>
        <div className="center">
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 16,
              background: "var(--dark-surface)",
              color: "var(--accent-on-dark)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
            }}
          >
            <Icon name="gear" />
          </div>
          <div className="eyebrow" style={{ letterSpacing: ".18em" }}>
            Staff only
          </div>
          <h1 style={{ fontSize: 24, margin: "8px 0 4px" }}>Racked Admin</h1>
          <p className="muted" style={{ fontSize: 13, margin: "0 0 22px", maxWidth: 280, marginLeft: "auto", marginRight: "auto" }}>
            Sign in with the Google account your gym registered as staff.
          </p>
        </div>
        <SignInSheet open onClose={() => {}} next="/admin" />
      </div>
    );
  }

  if (!isStaff) {
    return (
      <div className="stack-lg center" style={{ paddingTop: "16vh" }}>
        <div style={{ color: "var(--ink-faint)" }}>
          <Icon name="lock" />
        </div>
        <h1 style={{ fontSize: 22, margin: "10px 0 4px" }}>Not a staff account</h1>
        <p className="muted" style={{ margin: "0 0 16px", maxWidth: 280, marginLeft: "auto", marginRight: "auto", fontSize: 13.5 }}>
          {profile?.display_name || "This account"} isn&rsquo;t marked as gym staff yet. Ask an existing admin to grant access from the Supabase dashboard.
        </p>
        <button className="btn btn-ghost" style={{ maxWidth: 200, margin: "0 auto" }} onClick={signOut}>
          Sign out
        </button>
      </div>
    );
  }

  const feedbackCount = feedback.length;
  const avgRating = feedbackCount ? (feedback.reduce((s, f) => s + f.rating, 0) / feedbackCount).toFixed(1) : "—";
  const openIssues = feedback.filter((f) => f.status !== "resolved" && (f.issues || []).some((i) => i !== "good")).length;
  const tapTotals = sumTapCounts(tapCounts);
  const mostUsed = [...MACHINES]
    .map((m) => ({ m, c: tapCounts[m.id] || { total: 0, nfc: 0, qr: 0, untracked: 0 } }))
    .sort((a, b) => b.c.total - a.c.total);
  const maxTaps = Math.max(1, ...mostUsed.map((x) => x.c.total));
  const pct = (n: number) => (tapTotals.total ? Math.round((100 * n) / tapTotals.total) : 0);
  const periodLabel = PERIOD_OPTIONS.find((p) => p.key === period)?.label ?? "All Time";

  async function withBusy(key: string, fn: () => Promise<void>) {
    setBusyId(key);
    try {
      await fn();
    } catch (err) {
      console.error(err);
      toast("That didn't go through — try again");
    } finally {
      setBusyId(null);
    }
  }

  async function setFeedbackStatus(id: number, status: FeedbackRow["status"]) {
    const { error } = await supabase.from("feedback").update({ status }).eq("id", id);
    if (error) toast("Could not update status");
    else setFeedback((prev) => prev.map((f) => (f.id === id ? { ...f, status } : f)));
  }

  function handleDeleteFeedback(row: FeedbackRow) {
    if (!confirm(`Delete this feedback entry from ${row.display_name}? This can't be undone.`)) return;
    withBusy(`fb-${row.id}`, async () => {
      await adminDeleteFeedback(supabase, row.id);
      setFeedback((prev) => prev.filter((f) => f.id !== row.id));
      setHealthFeedback((prev) => prev.filter((f) => f.id !== row.id));
      toast("Feedback deleted");
    });
  }

  function handleClearFeedback() {
    const scopeLabel = machineFilter === "all" ? "every machine" : MACHINE_MAP[machineFilter]?.name || machineFilter;
    if (!confirm(`Delete ALL feedback for ${scopeLabel}? This can't be undone.`)) return;
    withBusy("clear-feedback", async () => {
      await adminClearFeedback(supabase, machineFilter === "all" ? undefined : machineFilter);
      setFeedback([]);
      setHealthFeedback((prev) => (machineFilter === "all" ? [] : prev.filter((f) => f.machine_id !== machineFilter)));
      toast("Feedback cleared");
    });
  }

  function handleExportFeedbackCsv() {
    const rows: (string | number)[][] = [["Machine", "Rating", "Issues", "Comment", "Status", "Name", "Created At"]];
    feedback.forEach((f) => {
      rows.push([
        MACHINE_MAP[f.machine_id]?.name || f.machine_id,
        f.rating,
        (f.issues || []).join("; "),
        f.comment || "",
        f.status,
        f.display_name,
        f.created_at,
      ]);
    });
    downloadCsv(`racked-feedback-${period}.csv`, rows);
  }

  function handleDeleteSetLog(row: SetLogRow) {
    const unit = MACHINE_MAP[row.machine_id]?.unit ?? "";
    if (!confirm(`Delete this set — ${row.weight}${unit} × ${row.reps} by ${row.display_name}? Their PB/XP for this machine will be recalculated from what's left.`)) return;
    withBusy(`set-${row.id}`, async () => {
      await adminDeleteSetLog(supabase, row.id);
      setSetLogs((prev) => prev.filter((r) => r.id !== row.id));
      setTotalSets((prev) => Math.max(0, prev - 1));
      toast("Set deleted");
    });
  }

  function handleResetMachine() {
    const name = MACHINE_MAP[resetMachineSel]?.name || resetMachineSel;
    if (!confirm(`Reset ALL stats, set history and tap counts for ${name}? This affects every member and can't be undone. (Feedback for it is left alone.)`)) return;
    withBusy("reset-machine", async () => {
      await adminResetMachine(supabase, resetMachineSel);
      const [taps, setCount, logs] = await Promise.all([
        fetchAdminTapCounts(supabase, period),
        fetchAdminSetCount(supabase, period),
        fetchAdminSetLogs(supabase, { period, machineId: machineFilter }),
      ]);
      setTapCounts(taps);
      setTotalSets(setCount);
      setSetLogs(logs);
      toast(`${name} reset`);
    });
  }

  function handleResetAll() {
    const typed = window.prompt(
      "This permanently deletes ALL sets, PBs, taps, feedback and attendance for EVERY member and machine.\n\nType RESET to confirm."
    );
    if (typed === null) return;
    if (typed !== "RESET") {
      toast("Not confirmed — nothing was deleted");
      return;
    }
    withBusy("reset-all", async () => {
      await adminResetAllData(supabase);
      setTapCounts({});
      setTotalSets(0);
      setFeedback([]);
      setHealthFeedback([]);
      setSetLogs([]);
      toast("Everything reset");
    });
  }

  return (
    <>
      <div className="topbar">
        <div className="brand">
          <Icon name="gear" /> RACKED ADMIN <span className="brand-sub">× BIJLEE</span>
        </div>
        <button className="iconbtn" onClick={signOut} aria-label="Sign out">
          <Icon name="x" />
        </button>
      </div>
      <div className="stack-lg">
        <h1 style={{ fontSize: 22, margin: 0 }}>Gym Dashboard</h1>
        <p className="faint" style={{ margin: "-14px 0 0", fontSize: 12 }}>
          Staff-only view, separate from the member app.
        </p>

        <div className="chip-row">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className={`issue-chip${period === opt.key ? " on" : ""}`}
              onClick={() => setPeriod(opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="stat-grid">
          <div className="stat-tile"><div className="v">{tapTotals.total.toLocaleString()}</div><div className="l">Check-ins</div></div>
          <div className="stat-tile"><div className="v">{totalSets.toLocaleString()}</div><div className="l">Sets logged</div></div>
          <div className="stat-tile"><div className="v">{feedbackCount.toLocaleString()}</div><div className="l">Feedback</div></div>
          <div className="stat-tile"><div className="v">{avgRating}</div><div className="l">Avg rating</div></div>
          <div className="stat-tile"><div className="v">{openIssues}</div><div className="l">Open issues</div></div>
          <div className="stat-tile"><div className="v">{MACHINES.length}</div><div className="l">Machines</div></div>
        </div>
        <p className="faint" style={{ margin: "-10px 0 0", fontSize: 11.5 }}>
          Numbers above are for {periodLabel.toLowerCase()}{machineFilter !== "all" ? ` · ${MACHINE_MAP[machineFilter]?.name}` : ""}{statusFilter !== "all" ? ` · ${statusFilter}` : ""}.
        </p>

        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            How People Check In
          </div>
          <div className="card stack" style={{ gap: 10 }}>
            <div className="row" style={{ fontSize: 13, fontWeight: 700 }}>
              <span>NFC tap</span>
              <span className="num faint">{tapTotals.nfc} · {pct(tapTotals.nfc)}%</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${pct(tapTotals.nfc)}%` }} />
            </div>
            <div className="row" style={{ fontSize: 13, fontWeight: 700 }}>
              <span>QR scan</span>
              <span className="num faint">{tapTotals.qr} · {pct(tapTotals.qr)}%</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${pct(tapTotals.qr)}%` }} />
            </div>
            {tapTotals.untracked > 0 && (
              <div className="faint" style={{ fontSize: 11.5 }}>
                {tapTotals.untracked} older check-ins from before NFC/QR tracking started aren&rsquo;t split by method.
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Most Used Machines
          </div>
          <div className="card stack" style={{ gap: 10 }}>
            {mostUsed.map((x) => (
              <div key={x.m.id}>
                <div className="row" style={{ fontSize: 13, fontWeight: 700 }}>
                  <span>{x.m.name}</span>
                  <span className="num faint">
                    {x.c.total} check-ins · {x.c.nfc} NFC · {x.c.qr} QR
                  </span>
                </div>
                <div className="progress-track" style={{ marginTop: 5 }}>
                  <div className="progress-fill" style={{ width: `${Math.round((100 * x.c.total) / maxTaps)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Machine Health
          </div>
          <p className="faint" style={{ margin: "-6px 0 10px", fontSize: 11.5 }}>
            Based on all unresolved feedback ever — not affected by the filters above.
          </p>
          <div className="stack">
            {MACHINES.map((m) => {
              const h = health(m.id, healthFeedback);
              return (
                <div key={m.id} className="row card" style={{ padding: "12px 16px" }}>
                  <span style={{ fontWeight: 700, fontSize: 13.5 }}>{m.name}</span>
                  <span style={{ fontSize: 12.5, color: HEALTH_COLOR[h], fontWeight: 700 }}>
                    <span className={`status-dot ${HEALTH_DOT[h]}`} />
                    {HEALTH_LABEL[h]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div className="row" style={{ marginBottom: 10 }}>
            <div className="eyebrow">Recent Feedback</div>
            <button className="btn btn-ghost btn-sm" onClick={handleExportFeedbackCsv} disabled={!feedback.length}>
              <Icon name="download" /> CSV
            </button>
          </div>
          <div className="chip-row" style={{ marginBottom: 10 }}>
            <select className="field" style={{ width: "auto" }} value={machineFilter} onChange={(e) => setMachineFilter(e.target.value)}>
              <option value="all">All machines</option>
              {MACHINES.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <select className="field" style={{ width: "auto" }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
              <option value="all">Any status</option>
              <option value="open">Open</option>
              <option value="dismissed">Dismissed</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
          <div className="stack">
            {feedback.length ? (
              feedback.slice(0, 50).map((f) => {
                const m = MACHINE_MAP[f.machine_id];
                const stars = "★".repeat(f.rating) + "☆".repeat(5 - f.rating);
                const cls = f.status === "resolved" ? "resolved" : f.status === "dismissed" ? "progress" : "open";
                const nonGoodIssues = (f.issues || []).filter((i) => i !== "good");
                const busy = busyId === `fb-${f.id}`;
                return (
                  <div key={f.id} className={`admin-issue ${cls}`}>
                    <div className="row">
                      <b style={{ fontSize: 13.5 }}>{m ? m.name : f.machine_id}</b>
                      <div className="row" style={{ gap: 8, width: "auto" }}>
                        <span style={{ color: "var(--yellow)", fontSize: 12 }}>{stars}</span>
                        <button className="icon-trash-btn" disabled={busy} onClick={() => handleDeleteFeedback(f)} aria-label="Delete feedback">
                          <Icon name="trash" />
                        </button>
                      </div>
                    </div>
                    {f.comment && <div style={{ fontSize: 13, marginTop: 4 }}>&ldquo;{f.comment}&rdquo;</div>}
                    {nonGoodIssues.length > 0 && (
                      <div className="chip-row" style={{ marginTop: 6 }}>
                        {nonGoodIssues.map((k) => (
                          <span className="pill" style={{ fontSize: 11, padding: "4px 9px" }} key={k}>
                            {ISSUE_LABELS[k] || k}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="row" style={{ marginTop: 8 }}>
                      <span className="faint" style={{ fontSize: 11.5 }}>{f.display_name} · {timeAgo(f.created_at)}</span>
                      <select
                        className="field"
                        style={{ width: "auto", padding: "5px 8px", fontSize: 11.5 }}
                        value={f.status}
                        onChange={(e) => setFeedbackStatus(f.id, e.target.value as FeedbackRow["status"])}
                      >
                        <option value="open">Open</option>
                        <option value="dismissed">Dismissed</option>
                        <option value="resolved">Resolved</option>
                      </select>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="empty">No feedback matches these filters.</div>
            )}
          </div>
        </div>

        <div>
          <div className="row" style={{ marginBottom: 10 }}>
            <div className="eyebrow">Recent Sets</div>
            <span className="faint" style={{ fontSize: 12 }}>latest {setLogs.length}</span>
          </div>
          <p className="faint" style={{ margin: "-6px 0 10px", fontSize: 11.5 }}>
            Spot an obviously fake test entry? Delete it here — the member&rsquo;s PB and XP for that machine recalculate automatically.
          </p>
          <div className="stack">
            {setLogs.length ? (
              setLogs.map((s) => {
                const m = MACHINE_MAP[s.machine_id];
                const busy = busyId === `set-${s.id}`;
                return (
                  <div key={s.id} className="row card" style={{ padding: "10px 14px" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                        {m ? m.name : s.machine_id}
                        {s.is_pb && <span className="pill-yellow" style={{ marginLeft: 8, fontSize: 10.5, padding: "2px 7px" }}>PB</span>}
                      </div>
                      <div className="faint" style={{ fontSize: 11.5, marginTop: 2 }}>
                        {s.display_name} · {s.weight}{m?.unit ?? ""} × {s.reps} · {timeAgo(s.created_at)}
                      </div>
                    </div>
                    <button className="icon-trash-btn" disabled={busy} onClick={() => handleDeleteSetLog(s)} aria-label="Delete set">
                      <Icon name="trash" />
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="empty">No sets logged for this filter.</div>
            )}
          </div>
        </div>

        <div>
          <div className="eyebrow" style={{ marginBottom: 10, color: "var(--danger)" }}>
            Danger Zone
          </div>
          <div className="danger-zone">
            <div className="row">
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>Clear feedback</div>
                <div className="faint" style={{ fontSize: 11.5 }}>
                  Deletes all feedback for {machineFilter === "all" ? "every machine" : MACHINE_MAP[machineFilter]?.name} (uses the filter above).
                </div>
              </div>
              <button className="btn btn-danger btn-sm" disabled={busyId === "clear-feedback"} onClick={handleClearFeedback}>
                Clear
              </button>
            </div>
            <div className="row">
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>Reset a machine</div>
                <div className="faint" style={{ fontSize: 11.5, marginBottom: 8 }}>
                  Wipes stats, set history and tap counts for one machine, for everyone.
                </div>
                <select className="field" style={{ width: "auto" }} value={resetMachineSel} onChange={(e) => setResetMachineSel(e.target.value)}>
                  {MACHINES.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              <button className="btn btn-danger btn-sm" disabled={busyId === "reset-machine"} onClick={handleResetMachine}>
                Reset
              </button>
            </div>
            <div className="row">
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>Reset everything</div>
                <div className="faint" style={{ fontSize: 11.5 }}>
                  Wipes all sets, PBs, taps, feedback and attendance — every member, every machine.
                </div>
              </div>
              <button className="btn btn-danger btn-sm" disabled={busyId === "reset-all"} onClick={handleResetAll}>
                Reset All
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
