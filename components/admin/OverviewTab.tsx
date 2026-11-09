"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import { LoadError, SkeletonList } from "@/components/admin/shared";
import { fetchAdminFeedback, fetchAdminSetCount, fetchAdminTapCounts, sumTapCounts, type TapCounts } from "@/lib/data";
import { MACHINES } from "@/lib/machines";
import { PERIOD_OPTIONS, type Period } from "@/lib/period";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type FeedbackRow = Database["public"]["Tables"]["feedback"]["Row"];

export function machineHealth(machineId: string, feedback: FeedbackRow[]): "green" | "yellow" | "red" {
  const mine = feedback.filter((f) => f.machine_id === machineId && f.status !== "resolved" && f.status !== "dismissed");
  if (mine.some((f) => (f.issues || []).some((i) => ["broken", "damaged", "stack"].includes(i)))) return "red";
  if (mine.some((f) => (f.issues || []).some((i) => i !== "good"))) return "yellow";
  return "green";
}
export const HEALTH_LABEL = { green: "Operational", yellow: "Needs attention", red: "Reported issue" } as const;
export const HEALTH_COLOR = { green: "var(--good)", yellow: "var(--warn)", red: "var(--danger)" } as const;

export default function OverviewTab({
  supabase,
  flagged,
  onGo,
}: {
  supabase: SupabaseClient<Database>;
  flagged: number | null;
  onGo: (tab: "review" | "feedback" | "machines") => void;
}) {
  const [period, setPeriod] = useState<Period>("today");
  const [taps, setTaps] = useState<Record<string, TapCounts> | null>(null);
  const [sets, setSets] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<FeedbackRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setTaps(null);
    setSets(null);
    setFailed(false);
    Promise.all([fetchAdminTapCounts(supabase, period), fetchAdminSetCount(supabase, period), fetchAdminFeedback(supabase, { period: "all" })])
      .then(([t, s, f]) => {
        if (!active) return;
        setTaps(t);
        setSets(s);
        setFeedback(f);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [supabase, period, reload]);

  const totals = taps ? sumTapCounts(taps) : null;
  const pct = (n: number) => (totals && totals.total ? Math.round((100 * n) / totals.total) : 0);
  const openIssues = (feedback || []).filter((f) => f.status === "open" && (f.issues || []).some((i) => i !== "good")).length;
  const used = MACHINES.map((m) => ({ m, c: taps?.[m.id]?.total ?? 0 })).sort((a, b) => b.c - a.c);
  const maxUsed = Math.max(1, ...used.map((u) => u.c));
  const periodLabel = PERIOD_OPTIONS.find((p) => p.key === period)?.label ?? "";

  return (
    <div className="stack-lg" data-testid="tab-overview">
      <div className="scroll-row" aria-label="Time period">
        {PERIOD_OPTIONS.map((o) => (
          <button key={o.key} type="button" className="chip" aria-pressed={period === o.key} onClick={() => setPeriod(o.key)}>
            {o.label}
          </button>
        ))}
      </div>

      {failed ? (
        <LoadError onRetry={() => setReload((n) => n + 1)} />
      ) : (
        <section className="bento" aria-label={`Gym numbers, ${periodLabel}`}>
          <button type="button" className={`tile ${flagged ? "accent-tile" : ""}`} onClick={() => onGo("review")} style={{ textAlign: "left", cursor: "pointer" }} data-testid="kpi-review">
            <div className="t-label">
              <Icon name="shield" /> Needs review
            </div>
            <div className="t-value">{flagged ?? "–"}</div>
            <div className="t-sub">{flagged ? "Suspicious sets waiting" : "All clear"}</div>
          </button>
          <button type="button" className="tile" onClick={() => onGo("feedback")} style={{ textAlign: "left", cursor: "pointer" }}>
            <div className="t-label">
              <Icon name="msg" /> Open issues
            </div>
            <div className="t-value">{feedback ? openIssues : "–"}</div>
            <div className="t-sub">Machine feedback to handle</div>
          </button>
          <div className="tile">
            <div className="t-label">
              <Icon name="nfc" /> Check-ins
            </div>
            <div className="t-value">{totals ? totals.total.toLocaleString() : "–"}</div>
            <div className="t-sub">{periodLabel}</div>
          </div>
          <div className="tile">
            <div className="t-label">
              <Icon name="dumbbell" /> Sets logged
            </div>
            <div className="t-value">{sets != null ? sets.toLocaleString() : "–"}</div>
            <div className="t-sub">{periodLabel}</div>
          </div>
        </section>
      )}

      <section className="card">
        <div className="section-head">
          <h3>How people check in</h3>
        </div>
        {!totals ? (
          <SkeletonList rows={2} height={28} />
        ) : (
          <div className="stack">
            {[
              ["NFC tap", totals.nfc],
              ["QR scan", totals.qr],
            ].map(([label, n]) => (
              <div key={label as string}>
                <div className="row" style={{ fontSize: 13, fontWeight: 700 }}>
                  <span>{label}</span>
                  <span className="num faint">
                    {n} · {pct(n as number)}%
                  </span>
                </div>
                <div className="progress-track" style={{ marginTop: 6 }}>
                  <div className="progress-fill" style={{ width: `${pct(n as number)}%` }} />
                </div>
              </div>
            ))}
            {totals.untracked > 0 && <div className="faint" style={{ fontSize: 11.5 }}>{totals.untracked} older check-ins aren&rsquo;t split by method.</div>}
          </div>
        )}
      </section>

      <section className="card">
        <div className="section-head">
          <h3>Busiest machines</h3>
          <span className="faint" style={{ fontSize: 12 }}>{periodLabel}</span>
        </div>
        {!taps ? (
          <SkeletonList rows={4} height={26} />
        ) : (
          <div className="stack">
            {used.map(({ m, c }) => (
              <div key={m.id}>
                <div className="row" style={{ fontSize: 13, fontWeight: 700 }}>
                  <span>{m.name}</span>
                  <span className="num faint">{c}</span>
                </div>
                <div className="progress-track" style={{ marginTop: 5 }}>
                  <div className="progress-fill" style={{ width: `${Math.round((100 * c) / maxUsed)}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="section-head">
          <h2>Machine health</h2>
          <button type="button" onClick={() => onGo("machines")}>
            Manage
          </button>
        </div>
        <div className="list">
          {MACHINES.map((m) => {
            const h = machineHealth(m.id, feedback || []);
            return (
              <div key={m.id} className="list-row" style={{ cursor: "default", minHeight: 48 }}>
                <span className="lr-body">{m.name}</span>
                <span className="lr-end" style={{ color: HEALTH_COLOR[h] }}>
                  <span className="health-dot" style={{ background: HEALTH_COLOR[h] }} />
                  {HEALTH_LABEL[h]}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <Link href="/admin/photos" className="action-card">
        <div className="glyph">
          <Icon name="camera" />
        </div>
        <div className="body">
          <div className="title">Photo reports</div>
          <div className="sub">Review reported or hidden pump photos</div>
        </div>
        <div className="chev">
          <Icon name="chev" />
        </div>
      </Link>
    </div>
  );
}
