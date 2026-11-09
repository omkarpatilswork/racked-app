"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/Icon";
import ConfirmSheet from "@/components/ConfirmSheet";
import ReasonSheet from "@/components/admin/ReasonSheet";
import { HEALTH_COLOR, HEALTH_LABEL, machineHealth } from "@/components/admin/OverviewTab";
import { MigrationNotice, SkeletonList, needsMigration } from "@/components/admin/shared";
import {
  adminResetAllData,
  adminResetMachineForAll,
  adminSetMachineLimit,
  fetchAdminFeedback,
  fetchMachineLimits,
  type MachineLimit,
} from "@/lib/data";
import { RESET_MACHINE_REASONS } from "@/lib/fairplay";
import { MACHINES, type Machine } from "@/lib/machines";
import { toast } from "@/lib/toast";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type FeedbackRow = Database["public"]["Tables"]["feedback"]["Row"];

export default function MachinesTab({ supabase, onChanged }: { supabase: SupabaseClient<Database>; onChanged: () => void }) {
  const [limits, setLimits] = useState<Record<string, MachineLimit> | null>(null);
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [resetting, setResetting] = useState<Machine | null>(null);
  const [resetAll, setResetAll] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetchMachineLimits(supabase).then(setLimits);
    fetchAdminFeedback(supabase, { period: "all" })
      .then(setFeedback)
      .catch(() => setFeedback([]));
  }, [supabase]);
  useEffect(load, [load]);

  const hasLimits = limits !== null && Object.keys(limits).length > 0;

  async function doReset(reason: string | null) {
    if (!resetting) return;
    setBusy(true);
    try {
      const n = await adminResetMachineForAll(supabase, resetting.id, reason);
      toast(`${resetting.name} reset — ${n} member${n === 1 ? "" : "s"} notified`);
      setResetting(null);
      onChanged();
    } catch (err) {
      toast(needsMigration(err) ? "Run database update 0010 to reset machines with a note" : "That didn't go through — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack-lg" data-testid="tab-machines">
      <section>
        <div className="section-head">
          <h2>Machines &amp; limits</h2>
        </div>
        <p className="faint" style={{ margin: "-4px 0 12px", fontSize: 13 }}>
          Set each machine&rsquo;s real max. Anything above it is refused when a member logs it. Big jumps over someone&rsquo;s usual best go to the review queue.
        </p>
        {limits === null ? (
          <SkeletonList rows={4} height={92} />
        ) : !hasLimits ? (
          <MigrationNotice what="weight limits" />
        ) : null}
        <div className="stack">
          {limits !== null &&
            MACHINES.map((m) => {
              const lim = limits[m.id];
              const h = machineHealth(m.id, feedback);
              return (
                <article key={m.id} className="card" style={{ padding: 16 }} data-testid="machine-admin-card">
                  <div className="row" style={{ alignItems: "flex-start" }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="eyebrow">Machine {m.number}</div>
                      <div style={{ fontWeight: 800, fontSize: 15.5, marginTop: 2 }}>{m.name}</div>
                      <div style={{ fontSize: 12.5, marginTop: 4, color: HEALTH_COLOR[h], fontWeight: 700, display: "flex", gap: 6, alignItems: "center" }}>
                        <span className="health-dot" style={{ background: HEALTH_COLOR[h] }} /> {HEALTH_LABEL[h]}
                      </div>
                    </div>
                    {hasLimits && editing !== m.id && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(m.id)} data-testid="edit-limit">
                        <Icon name="edit" /> {lim ? "Limits" : "Set limits"}
                      </button>
                    )}
                  </div>
                  {lim && editing !== m.id && (
                    <div className="chip-row" style={{ marginTop: 12 }}>
                      <span className="pill num" data-testid="limit-summary">Max {lim.max_weight} kg</span>
                      <span className="pill num">≤ {lim.max_reps} reps</span>
                      <span className="pill">Flag jumps &gt; {lim.jump_pct}%</span>
                    </div>
                  )}
                  {hasLimits && !lim && editing !== m.id && (
                    <div className="chip-row" style={{ marginTop: 12 }}>
                      <span className="flag-pill">No limit set — anything up to 2000 kg is accepted</span>
                    </div>
                  )}
                  {hasLimits && editing === m.id && (
                    <LimitForm
                      machine={m}
                      value={lim ?? { max_weight: m.maxWeight ?? 150, max_reps: m.maxReps ?? 50, jump_pct: 40 }}
                      onCancel={() => setEditing(null)}
                      onSave={async (v) => {
                        try {
                          await adminSetMachineLimit(supabase, m.id, v);
                          setLimits((all) => ({ ...(all || {}), [m.id]: v }));
                          setEditing(null);
                          toast(`${m.name}: max ${v.max_weight} kg saved`);
                          onChanged();
                        } catch (err) {
                          const msg = (err as { message?: string })?.message;
                          toast(msg && msg.length < 80 ? msg : "Couldn't save — try again");
                        }
                      }}
                    />
                  )}
                  <button type="button" className="text-btn" style={{ color: "var(--danger)", padding: "12px 0 0" }} onClick={() => setResetting(m)} data-testid="reset-machine">
                    Reset this machine for everyone…
                  </button>
                </article>
              );
            })}
        </div>
      </section>

      <section>
        <div className="list-title" style={{ color: "var(--danger)" }}>
          Danger zone
        </div>
        <div className="card" style={{ borderColor: "color-mix(in srgb, var(--danger) 40%, var(--border))" }}>
          <div style={{ fontWeight: 800 }}>Reset everything</div>
          <p className="faint" style={{ fontSize: 13, margin: "4px 0 12px" }}>
            Wipes every member&rsquo;s sets, PBs, check-ins, feedback and attendance on every machine. Accounts are kept. Only for starting over.
          </p>
          <button type="button" className="btn btn-danger btn-sm" onClick={() => setResetAll(true)}>
            Reset all gym data…
          </button>
        </div>
      </section>

      <ReasonSheet
        open={!!resetting}
        title={`Reset ${resetting?.name ?? ""}?`}
        body="Deletes every member's sets and PBs on this machine, so its leaderboard starts fresh. Check-in counts are kept. Everyone affected gets a short note."
        reasons={RESET_MACHINE_REASONS}
        confirmLabel="Reset machine"
        typeToConfirm="RESET"
        busy={busy}
        onConfirm={doReset}
        onClose={() => setResetting(null)}
      />
      <ConfirmSheet
        open={resetAll}
        title="Reset ALL gym data?"
        body="This permanently deletes every set, PB, check-in, feedback and attendance record for every member. It can't be undone."
        confirmLabel="Reset everything"
        danger
        typeToConfirm="RESET ALL"
        busy={busy}
        onClose={() => setResetAll(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await adminResetAllData(supabase);
            toast("All gym data reset");
            setResetAll(false);
            onChanged();
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

function LimitForm({
  machine,
  value,
  onSave,
  onCancel,
}: {
  machine: Machine;
  value: MachineLimit;
  onSave: (v: MachineLimit) => Promise<void>;
  onCancel: () => void;
}) {
  const [w, setW] = useState(String(value.max_weight));
  const [r, setR] = useState(String(value.max_reps));
  const [j, setJ] = useState(String(value.jump_pct));
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const mw = Number(w);
    const mr = Number(r);
    const mj = Number(j);
    if (!Number.isFinite(mw) || mw <= 0 || mw > 2000) return setErr("Max weight must be 1–2000 kg.");
    if (!Number.isInteger(mr) || mr < 1 || mr > 200) return setErr("Max reps must be a whole number 1–200.");
    if (!Number.isInteger(mj) || mj < 5 || mj > 500) return setErr("Jump alert must be 5–500%.");
    setErr(null);
    setSaving(true);
    await onSave({ max_weight: mw, max_reps: mr, jump_pct: mj });
    setSaving(false);
  }

  const id = machine.id;
  return (
    <form onSubmit={submit} style={{ marginTop: 12 }} noValidate data-testid="limit-form">
      <div className="limit-grid">
        <div>
          <label className="field-label" htmlFor={`${id}-w`}>
            Max kg
          </label>
          <input id={`${id}-w`} className="field num" inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor={`${id}-r`}>
            Max reps
          </label>
          <input id={`${id}-r`} className="field num" inputMode="numeric" value={r} onChange={(e) => setR(e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor={`${id}-j`}>
            Flag jump %
          </label>
          <input id={`${id}-j`} className="field num" inputMode="numeric" value={j} onChange={(e) => setJ(e.target.value)} />
        </div>
      </div>
      {err && (
        <div className="field-error" role="alert">
          {err}
        </div>
      )}
      <div className="btn-row" style={{ marginTop: 12 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="btn btn-yellow btn-sm" disabled={saving} data-testid="save-limit">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
