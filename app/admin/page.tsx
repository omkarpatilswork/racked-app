"use client";

import { useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import SignInSheet from "@/components/SignInSheet";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { MACHINES, MACHINE_MAP } from "@/lib/machines";
import { toast } from "@/lib/toast";
import type { Database } from "@/lib/database.types";

type FeedbackRow = Database["public"]["Tables"]["feedback"]["Row"];

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

export default function AdminPage() {
  const { session, profile, loading, signOut } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [totalTaps, setTotalTaps] = useState(0);
  const [totalSets, setTotalSets] = useState(0);
  const [feedbackSummary, setFeedbackSummary] = useState({ feedback_count: 0, avg_rating: null as number | null, open_count: 0 });
  const [tapCounts, setTapCounts] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);

  const isStaff = !!profile?.is_staff;

  useEffect(() => {
    if (!isStaff) return;
    let active = true;

    async function load() {
      const [{ count: tapCount }, { count: setCount }, { data: summary }, { data: taps }, { data: fb }] = await Promise.all([
        supabase.from("tap_events").select("*", { count: "exact", head: true }),
        supabase.from("set_logs").select("*", { count: "exact", head: true }),
        supabase.from("v_admin_feedback_summary").select("*").maybeSingle(),
        supabase.from("v_admin_tap_counts").select("*"),
        supabase.from("feedback").select("*").order("created_at", { ascending: false }).limit(50),
      ]);
      if (!active) return;
      setTotalTaps(tapCount ?? 0);
      setTotalSets(setCount ?? 0);
      if (summary) setFeedbackSummary(summary);
      const tc: Record<string, number> = {};
      (taps || []).forEach((t) => { tc[t.machine_id] = t.taps; });
      setTapCounts(tc);
      setFeedback(fb || []);
    }
    load();

    const channel = supabase
      .channel("admin-feedback")
      .on("postgres_changes", { event: "*", schema: "public", table: "feedback" }, load)
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [isStaff, supabase]);

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

  const avgRating = feedbackSummary.avg_rating != null ? feedbackSummary.avg_rating.toFixed(1) : "—";
  const openIssues = feedback.filter((f) => f.status !== "resolved" && (f.issues || []).some((i) => i !== "good")).length;
  const mostUsed = [...MACHINES].map((m) => ({ m, taps: tapCounts[m.id] || 0 })).sort((a, b) => b.taps - a.taps);
  const maxTaps = Math.max(1, ...mostUsed.map((x) => x.taps));

  async function setFeedbackStatus(id: number, status: FeedbackRow["status"]) {
    const { error } = await supabase.from("feedback").update({ status }).eq("id", id);
    if (error) toast("Could not update status");
    else setFeedback((prev) => prev.map((f) => (f.id === id ? { ...f, status } : f)));
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
        <div className="stat-grid">
          <div className="stat-tile"><div className="v">{totalTaps.toLocaleString()}</div><div className="l">NFC taps</div></div>
          <div className="stat-tile"><div className="v">{totalSets.toLocaleString()}</div><div className="l">Sets logged</div></div>
          <div className="stat-tile"><div className="v">{feedbackSummary.feedback_count.toLocaleString()}</div><div className="l">Feedback</div></div>
          <div className="stat-tile"><div className="v">{avgRating}</div><div className="l">Avg rating</div></div>
          <div className="stat-tile"><div className="v">{openIssues}</div><div className="l">Open issues</div></div>
          <div className="stat-tile"><div className="v">{MACHINES.length}</div><div className="l">Machines</div></div>
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
                  <span className="num faint">{x.taps} taps</span>
                </div>
                <div className="progress-track" style={{ marginTop: 5 }}>
                  <div className="progress-fill" style={{ width: `${Math.round((100 * x.taps) / maxTaps)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Machine Health
          </div>
          <div className="stack">
            {MACHINES.map((m) => {
              const h = health(m.id, feedback);
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
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Recent Feedback
          </div>
          <div className="stack">
            {feedback.length ? (
              feedback.slice(0, 20).map((f) => {
                const m = MACHINE_MAP[f.machine_id];
                const stars = "★".repeat(f.rating) + "☆".repeat(5 - f.rating);
                const cls = f.status === "resolved" ? "resolved" : f.status === "dismissed" ? "progress" : "open";
                const mins = Math.max(1, Math.round((Date.now() - new Date(f.created_at).getTime()) / 60000));
                const timeStr = mins < 60 ? `${mins} minutes ago` : mins < 1440 ? `${Math.round(mins / 60)} hours ago` : `${Math.round(mins / 1440)} days ago`;
                const nonGoodIssues = (f.issues || []).filter((i) => i !== "good");
                return (
                  <div key={f.id} className={`admin-issue ${cls}`}>
                    <div className="row">
                      <b style={{ fontSize: 13.5 }}>{m ? m.name : f.machine_id}</b>
                      <span style={{ color: "var(--yellow)", fontSize: 12 }}>{stars}</span>
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
                      <span className="faint" style={{ fontSize: 11.5 }}>{timeStr}</span>
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
              <div className="empty">No feedback yet.</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
