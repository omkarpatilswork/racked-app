"use client";

// Staff -> Machines -> House lifts (0013). A real lift by someone who isn't
// on the app yet (a trainer, a regular without a phone), put on a machine's
// board by staff. It shows on the boards and the TV like anyone else's, but
// never earns XP, prizes or challenge places, and doesn't count in the gym's
// totals.
import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/Icon";
import Sheet from "@/components/Sheet";
import ConfirmSheet from "@/components/ConfirmSheet";
import { SkeletonList, needsMigration } from "@/components/admin/shared";
import { MACHINES, MACHINE_MAP } from "@/lib/machines";
import { deleteHouseLift, fetchHouseLifts, gymToday, saveHouseLift, type HouseLift, type HouseLiftInput } from "@/lib/houseLifts";
import { toast } from "@/lib/toast";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Client = SupabaseClient<Database>;

function machineLabel(id: string, mode: string) {
  const m = MACHINE_MAP[id];
  if (!m) return id;
  const side = mode && m.modes?.[mode] ? ` · ${m.modes[mode].label}` : "";
  return `${m.number} ${m.name}${side}`;
}

const niceDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export default function HouseLifts({ supabase, onChanged }: { supabase: Client; onChanged?: () => void }) {
  const [rows, setRows] = useState<HouseLift[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [editing, setEditing] = useState<Partial<HouseLiftInput> | null>(null);
  const [removing, setRemoving] = useState<HouseLift | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetchHouseLifts(supabase)
      .then((r) => {
        setRows(r);
        setMissing(false);
      })
      .catch((err) => {
        setMissing(needsMigration(err));
        setRows([]);
      });
  }, [supabase]);
  useEffect(load, [load]);

  return (
    <section data-testid="house-lifts">
      <div className="section-head">
        <h2>House lifts</h2>
      </div>
      <div className="row" style={{ alignItems: "flex-start", margin: "-4px 0 12px" }}>
        <p className="faint" style={{ margin: 0, fontSize: 13, flex: 1 }}>
          A real lift by someone who isn&rsquo;t on the app yet, like a trainer or a regular. It shows on that machine&rsquo;s board and the TV like anyone else&rsquo;s, but never earns XP or prizes.
        </p>
        {!missing && (
          <button type="button" className="btn btn-yellow btn-sm" style={{ flex: "none" }} onClick={() => setEditing({ lifted_on: gymToday() })} data-testid="add-house-lift">
            + Add a lift
          </button>
        )}
      </div>
      {rows === null ? (
        <SkeletonList rows={2} height={56} />
      ) : missing ? (
        <div className="card" data-testid="needs-0013">
          <b>Turn on house lifts</b>
          <div className="faint" style={{ fontSize: 13, marginTop: 2 }}>
            Run database update <span className="num">0013_tv_house_lifts.sql</span> in Supabase → SQL Editor, then refresh.
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="card empty" style={{ padding: 18 }}>
          No house lifts yet. Add one to put a machine on the board before anyone logs on it.
        </div>
      ) : (
        <ul className="hl-list">
          {rows.map((h) => (
            <li key={h.id} data-testid="house-lift">
              <span className="hl-main">
                <b>
                  {h.name} <span className="hl-lift num">{h.weight} kg × {h.reps}</span>
                </b>
                <span>
                  {machineLabel(h.machine_id, h.mode)} · {niceDate(h.lifted_on)}
                </span>
              </span>
              <button type="button" className="iconbtn" aria-label={`Edit ${h.name}'s lift`} onClick={() => setEditing(h)}>
                <Icon name="edit" />
              </button>
              <button type="button" className="iconbtn" aria-label={`Remove ${h.name}'s lift`} onClick={() => setRemoving(h)} data-testid="remove-house-lift">
                <Icon name="trash" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <HouseLiftForm
          value={editing}
          onClose={() => setEditing(null)}
          onSave={async (p) => {
            await saveHouseLift(supabase, p);
            toast(`${p.name}'s lift is on the ${MACHINE_MAP[p.machine_id]?.name ?? ""} board`);
            setEditing(null);
            load();
            onChanged?.();
          }}
        />
      )}
      <ConfirmSheet
        open={!!removing}
        title={`Remove ${removing?.name ?? ""}'s lift?`}
        body={removing ? `${removing.weight} kg × ${removing.reps} on ${machineLabel(removing.machine_id, removing.mode)} comes off the boards and the TV.` : ""}
        confirmLabel="Remove"
        danger
        busy={busy}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          setBusy(true);
          try {
            await deleteHouseLift(supabase, removing.id);
            toast("Lift removed");
            setRemoving(null);
            load();
          } catch {
            toast("That didn't go through — try again");
          } finally {
            setBusy(false);
          }
        }}
      />
    </section>
  );
}

function HouseLiftForm({ value, onSave, onClose }: { value: Partial<HouseLiftInput>; onSave: (p: HouseLiftInput) => Promise<void>; onClose: () => void }) {
  const [f, setF] = useState({
    name: value.name || "",
    machine_id: value.machine_id || "",
    mode: value.mode || "",
    weight: value.weight != null ? String(value.weight) : "",
    reps: value.reps != null ? String(value.reps) : "",
    lifted_on: value.lifted_on || gymToday(),
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const m = f.machine_id ? MACHINE_MAP[f.machine_id] : null;
  const sides = m?.dual && m.modes ? Object.entries(m.modes) : [];
  const set = (k: keyof typeof f, v: string) =>
    setF((x) => {
      const next = { ...x, [k]: v };
      if (k === "machine_id") {
        const mm = MACHINE_MAP[v];
        next.mode = mm?.dual && mm.modes ? Object.keys(mm.modes)[0] : "";
      }
      return next;
    });

  async function submit() {
    const name = f.name.trim().replace(/\s+/g, " ");
    const weight = Number(f.weight);
    const reps = Number(f.reps);
    if (!name) return setErr("Add the lifter's name");
    if (!f.machine_id) return setErr("Pick a machine");
    if (!Number.isFinite(weight) || weight <= 0) return setErr("Add the weight in kg");
    if (!Number.isInteger(reps) || reps < 1) return setErr("Add the reps");
    if (!f.lifted_on) return setErr("Add the date");
    setErr(null);
    setBusy(true);
    try {
      await onSave({ ...(value.id ? { id: value.id } : {}), name, machine_id: f.machine_id, mode: f.mode, weight, reps, lifted_on: f.lifted_on });
    } catch (e) {
      const msg = (e as { message?: string })?.message;
      setErr(needsMigration(e) ? "Run database update 0013 first" : msg && msg.length < 100 ? msg : "That didn't go through — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={busy ? () => undefined : onClose} title={value.id ? "Edit house lift" : "Add a house lift"} testId="house-lift-form">
      <div className="stack">
        <div>
          <label className="field-label" htmlFor="hl-name">
            Name
          </label>
          <input id="hl-name" className="field" maxLength={16} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Vikram" autoComplete="off" />
          <p className="field-hint">A first name is best. It shows on the TV as typed.</p>
        </div>
        <div>
          <label className="field-label" htmlFor="hl-machine">
            Machine
          </label>
          <select id="hl-machine" className="field" value={f.machine_id} onChange={(e) => set("machine_id", e.target.value)}>
            <option value="">Pick a machine</option>
            {MACHINES.map((x) => (
              <option key={x.id} value={x.id}>
                {x.number} {x.name}
              </option>
            ))}
          </select>
        </div>
        {sides.length > 0 && (
          <div>
            <label className="field-label" htmlFor="hl-side">
              Side
            </label>
            <select id="hl-side" className="field" value={f.mode} onChange={(e) => set("mode", e.target.value)}>
              {sides.map(([k, md]) => (
                <option key={k} value={k}>
                  {md.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="rw-form-row">
          <div style={{ flex: 1, minWidth: 0 }}>
            <label className="field-label" htmlFor="hl-kg">
              Weight (kg)
            </label>
            <input id="hl-kg" className="field num" inputMode="decimal" value={f.weight} onChange={(e) => set("weight", e.target.value)} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <label className="field-label" htmlFor="hl-reps">
              Reps
            </label>
            <input id="hl-reps" className="field num" inputMode="numeric" value={f.reps} onChange={(e) => set("reps", e.target.value)} />
          </div>
        </div>
        <div>
          <label className="field-label" htmlFor="hl-date">
            Date lifted
          </label>
          <input id="hl-date" className="field" type="date" max={gymToday()} value={f.lifted_on} onChange={(e) => set("lifted_on", e.target.value)} />
          <p className="field-hint">Today puts it on today&rsquo;s board. Older lifts show up as &ldquo;best ever&rdquo; when a board is short.</p>
        </div>
      </div>
      {err && (
        <p className="field-error" role="alert">
          {err}
        </p>
      )}
      <button type="button" className="btn btn-yellow" style={{ marginTop: 14 }} disabled={busy} onClick={submit} data-testid="save-house-lift">
        {busy ? "Saving…" : value.id ? "Save lift" : "Add to the board"}
      </button>
    </Sheet>
  );
}
