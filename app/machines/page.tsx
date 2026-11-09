"use client";

import { useEffect, useMemo, useState } from "react";
import Topbar from "@/components/Topbar";
import Icon from "@/components/Icon";
import MachineCard from "@/components/MachineCard";
import { MACHINES, MUSCLE_GROUPS, type MuscleGroup } from "@/lib/machines";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { fetchMyStats } from "@/lib/data";

export default function MachinesPage() {
  const { session } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [pbs, setPbs] = useState<Record<string, string>>({});
  const [group, setGroup] = useState<MuscleGroup | "all">("all");

  useEffect(() => {
    if (!session) {
      setPbs({});
      return;
    }
    fetchMyStats(supabase, session.user.id)
      .then((stats) => {
        const best: Record<string, { w: number; label: string }> = {};
        Object.values(stats).forEach((s) => {
          const m = MACHINES.find((x) => x.id === s.machine_id);
          const w = Number(s.pb_weight);
          if (!best[s.machine_id] || w > best[s.machine_id].w) {
            best[s.machine_id] = { w, label: `${w}${m?.unit === "KG" ? "kg" : m?.unit ?? ""}×${s.pb_reps}` };
          }
        });
        setPbs(Object.fromEntries(Object.entries(best).map(([k, v]) => [k, v.label])));
      })
      .catch(() => setPbs({}));
  }, [session, supabase]);

  const trained = Object.keys(pbs).length;
  const list = group === "all" ? MACHINES : MACHINES.filter((m) => m.group === group || Object.values(m.modes || {}).some((md) => md.group === group));

  return (
    <>
      <Topbar />
      <div className="page stack-lg">
        <header>
          <h1 style={{ fontSize: 27, margin: "0 0 6px" }}>Machines</h1>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            {session
              ? `You've trained on ${trained} of ${MACHINES.length}.`
              : `${MACHINES.length} smart machines in this gym.`}{" "}
            Tap a machine&rsquo;s sticker to log a set there.
          </p>
          {session && (
            <div className="progress-track" style={{ marginTop: 12 }} aria-hidden="true">
              <div className="progress-fill" style={{ width: `${Math.round((100 * trained) / MACHINES.length)}%` }} />
            </div>
          )}
        </header>

        <div className="scroll-row" role="tablist" aria-label="Filter by muscle group">
          <button type="button" role="tab" aria-selected={group === "all"} className="chip" onClick={() => setGroup("all")}>
            All
          </button>
          {MUSCLE_GROUPS.map((g) => (
            <button key={g.id} type="button" role="tab" aria-selected={group === g.id} className="chip" onClick={() => setGroup(g.id)}>
              {g.label}
            </button>
          ))}
        </div>

        <div className="stack">
          {list.map((m) => (
            <MachineCard key={m.id} machine={m} unlocked={!!pbs[m.id]} showLock={!!session} pb={pbs[m.id] ?? null} />
          ))}
          {list.length === 0 && <div className="empty">No machines for this muscle group yet.</div>}
        </div>

        <div className="tapin-card">
          <div className="tapin-icons" aria-hidden="true">
            <Icon name="nfc" />
          </div>
          <div style={{ flex: 1 }}>
            <b>No sticker on a machine?</b>
            <span>Let the front desk know so they can add one.</span>
          </div>
        </div>
      </div>
    </>
  );
}
