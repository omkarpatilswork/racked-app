"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import Avatar from "@/components/Avatar";
import ReasonSheet from "@/components/admin/ReasonSheet";
import SetRow from "@/components/admin/SetRow";
import { LoadError, MigrationNotice, SkeletonList, needsMigration } from "@/components/admin/shared";
import {
  adminMemberSearch,
  adminRemoveSet,
  adminResetMemberMachine,
  fetchMemberSets,
  fetchMemberStats,
  type StaffMember,
} from "@/lib/data";
import { CHOICE_LABEL, adminMemberBody, adminSetMemberBody, type BoardChoice, type MyBody } from "@/lib/body";
import { REMOVE_SET_REASONS, RESET_MEMBER_REASONS, fmtNum, machineLabel } from "@/lib/fairplay";
import { MACHINE_MAP } from "@/lib/machines";
import { timeAgo } from "@/lib/time";
import { toast } from "@/lib/toast";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type SetLogRow = Database["public"]["Views"]["v_admin_set_logs"]["Row"];
type StatsRow = Database["public"]["Tables"]["machine_stats"]["Row"];

export default function MembersTab({ supabase, onChanged }: { supabase: SupabaseClient<Database>; onChanged: () => void }) {
  const [query, setQuery] = useState("");
  const [list, setList] = useState<StaffMember[] | null>(null);
  const [state, setState] = useState<"ok" | "missing" | "error">("ok");
  const [selected, setSelected] = useState<StaffMember | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    const t = setTimeout(() => {
      adminMemberSearch(supabase, query.trim())
        .then((rows) => {
          if (!active) return;
          setList(rows);
          setState("ok");
        })
        .catch((err) => {
          if (!active) return;
          setList([]);
          setState(needsMigration(err) ? "missing" : "error");
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [supabase, query, reload]);

  if (selected) {
    return (
      <MemberDetail
        supabase={supabase}
        member={selected}
        onBack={() => {
          setSelected(null);
          setReload((n) => n + 1);
        }}
        onChanged={onChanged}
      />
    );
  }

  return (
    <div className="stack-lg" data-testid="tab-members">
      <div>
        <label className="sr-only" htmlFor="member-search">
          Search members
        </label>
        <input
          id="member-search"
          className="field"
          type="search"
          placeholder="Search members by name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          data-testid="member-search"
        />
      </div>
      {list === null ? (
        <SkeletonList rows={5} height={60} />
      ) : state === "missing" ? (
        <MigrationNotice what="member search" />
      ) : state === "error" ? (
        <LoadError onRetry={() => setReload((n) => n + 1)} />
      ) : list.length === 0 ? (
        <div className="card empty">No members match &ldquo;{query}&rdquo;.</div>
      ) : (
        <div className="list">
          {list.map((m) => (
            <button key={m.id} type="button" className="list-row" onClick={() => setSelected(m)} data-testid="member-row">
              <Avatar name={m.display_name} url={m.avatar_url} size={38} />
              <span className="lr-body">
                <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  {m.display_name}
                  {m.is_staff && <span className="pill" style={{ padding: "1px 8px", fontSize: 10.5 }}>Staff</span>}
                  {m.flagged > 0 && <span className="flag-pill" style={{ padding: "1px 8px", fontSize: 10.5 }}>{m.flagged} flagged</span>}
                </span>
                <div className="lr-sub">
                  {m.total_sets} set{m.total_sets === 1 ? "" : "s"} · {m.last_set_at ? `last ${timeAgo(m.last_set_at)}` : "no sets yet"}
                </div>
              </span>
              <span className="lr-end">
                <Icon name="chev" />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Body weight + board (0015): what the member entered, and a desk weigh-in.
function MemberBody({ supabase, member }: { supabase: SupabaseClient<Database>; member: StaffMember }) {
  const [b, setB] = useState<MyBody | null | "off">(null);
  const [kg, setKg] = useState("");
  const [div, setDiv] = useState<BoardChoice | "">("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    adminMemberBody(supabase, member.id).then(
      (x) => {
        if (!alive) return;
        setB(x);
        setKg(x.body_kg != null ? String(x.body_kg) : "");
        setDiv(x.division || "");
      },
      (e) => alive && setB(needsMigration(e) ? "off" : null)
    );
    return () => {
      alive = false;
    };
  }, [supabase, member.id]);
  if (b === "off") return null;
  const ok = Number(kg) >= 25 && Number(kg) <= 300;
  return (
    <section className="card" data-testid="member-body">
      <div className="row">
        <div>
          <div style={{ fontWeight: 800 }}>Body weight &amp; board</div>
          <div className="faint" style={{ fontSize: 12.5, marginTop: 2 }}>
            {b === null
              ? "Loading…"
              : b.body_kg == null
                ? "Not added yet: not on the ×BW boards"
                : `${b.division ? CHOICE_LABEL[b.division] : "No board"} · ${b.body_kg} kg · ${b.checked_at ? `weighed at the desk ${new Date(b.checked_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}${b.checked_by ? ` by ${b.checked_by}` : ""}` : "their own entry"}`}
          </div>
        </div>
      </div>
      <div className="rw-form-row" style={{ marginTop: 10 }}>
        <div style={{ flex: 1 }}>
          <label className="field-label" htmlFor="mb-kg">
            On the scale (kg)
          </label>
          <input id="mb-kg" className="field num" inputMode="decimal" type="number" step="0.1" value={kg} onChange={(e) => setKg(e.target.value)} data-testid="mb-kg" />
        </div>
        <div style={{ flex: 1 }}>
          <label className="field-label" htmlFor="mb-div">
            Board
          </label>
          <select id="mb-div" className="field" value={div} onChange={(e) => setDiv(e.target.value as BoardChoice)} data-testid="mb-div">
            <option value="">Keep</option>
            <option value="men">Men</option>
            <option value="women">Women</option>
            <option value="open">Prefer not to say</option>
          </select>
        </div>
      </div>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        style={{ marginTop: 10 }}
        disabled={busy || !ok}
        onClick={async () => {
          setBusy(true);
          try {
            const x = await adminSetMemberBody(supabase, member.id, Number(kg), div || null);
            setB(x);
            toast("Weigh-in saved. Their sets in weeks not yet awarded use it.");
          } catch {
            toast("That didn't go through. Try again.");
          } finally {
            setBusy(false);
          }
        }}
        data-testid="mb-save"
      >
        Save weigh-in
      </button>
    </section>
  );
}

function MemberDetail({
  supabase,
  member,
  onBack,
  onChanged,
}: {
  supabase: SupabaseClient<Database>;
  member: StaffMember;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [stats, setStats] = useState<StatsRow[] | null>(null);
  const [sets, setSets] = useState<SetLogRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState<string | null>(null);
  const [removing, setRemoving] = useState<SetLogRow | null>(null);
  const [reload, setReload] = useState(0);

  const load = useCallback(() => {
    setFailed(false);
    Promise.all([fetchMemberStats(supabase, member.id), fetchMemberSets(supabase, member.id)])
      .then(([st, s]) => {
        setStats(st);
        setSets(s);
      })
      .catch(() => setFailed(true));
  }, [supabase, member.id]);
  useEffect(load, [load, reload]);

  // one row per machine (dual machines show both sides together)
  const machines = useMemo(() => {
    const by: Record<string, StatsRow[]> = {};
    (stats || []).forEach((s) => (by[s.machine_id] ||= []).push(s));
    return Object.entries(by);
  }, [stats]);

  async function doReset(reason: string | null) {
    if (!resetting) return;
    setBusy(true);
    try {
      const n = await adminResetMemberMachine(supabase, member.id, resetting, reason);
      toast(`Reset ${member.display_name.split(" ")[0]} on ${MACHINE_MAP[resetting]?.name ?? resetting} (${n} set${n === 1 ? "" : "s"} removed)`);
      setResetting(null);
      setReload((x) => x + 1);
      onChanged();
    } catch (err) {
      toast(needsMigration(err) ? "Run database update 0010 to use member resets" : "That didn't go through — try again");
    } finally {
      setBusy(false);
    }
  }

  async function doRemove(reason: string | null) {
    if (!removing) return;
    setBusy(true);
    try {
      await adminRemoveSet(supabase, removing.id, reason);
      toast("Set removed — PB and XP recalculated");
      setRemoving(null);
      setReload((x) => x + 1);
      onChanged();
    } catch (err) {
      toast(needsMigration(err) ? "Run database update 0010 to remove sets here" : "That didn't go through — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack-lg" data-testid="member-detail">
      <button type="button" className="text-btn" onClick={onBack} style={{ padding: "4px 0", display: "inline-flex", gap: 6, alignItems: "center" }}>
        <Icon name="back" /> All members
      </button>
      <section className="row" style={{ justifyContent: "flex-start", gap: 14 }}>
        <Avatar name={member.display_name} url={member.avatar_url} size={60} />
        <div>
          <h2 style={{ fontSize: 21, margin: 0 }}>{member.display_name}</h2>
          <div className="faint" style={{ fontSize: 13, marginTop: 4 }}>
            Joined {new Date(member.joined_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} · {member.total_sets} sets
            {member.flagged > 0 ? ` · ${member.flagged} flagged` : ""}
          </div>
        </div>
      </section>

      <MemberBody supabase={supabase} member={member} />

      {failed ? (
        <LoadError onRetry={() => setReload((x) => x + 1)} />
      ) : (
        <>
          <section>
            <div className="list-title">Machines</div>
            {stats === null ? (
              <SkeletonList rows={2} height={60} />
            ) : machines.length === 0 ? (
              <div className="card empty">No sets on any machine.</div>
            ) : (
              <div className="list">
                {machines.map(([machineId, rows]) => (
                  <div key={machineId} className="list-row" style={{ cursor: "default" }} data-testid="member-machine">
                    <span className="lr-body">
                      {MACHINE_MAP[machineId]?.name ?? machineId}
                      <div className="lr-sub">
                        {rows
                          .map((r) => `${r.mode ? machineLabel(machineId, r.mode) + ": " : ""}PB ${fmtNum(r.pb_weight)} kg × ${r.pb_reps} · ${r.sets} sets`)
                          .join(" · ")}
                      </div>
                    </span>
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => setResetting(machineId)} data-testid="reset-member-machine">
                      Reset
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="list-title">Recent sets</div>
            {sets === null ? (
              <SkeletonList rows={4} height={56} />
            ) : sets.length === 0 ? (
              <div className="card empty">No sets yet.</div>
            ) : (
              <div className="list">
                {sets.map((r) => (
                  <SetRow key={r.id} row={r} showMember={false} busy={busy} onRemove={setRemoving} />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <ReasonSheet
        open={!!resetting}
        title={`Reset ${member.display_name.split(" ")[0]} on ${resetting ? MACHINE_MAP[resetting]?.name ?? resetting : ""}?`}
        body="Deletes all their sets and their PB on this machine. Nobody else is affected. They'll see a short note."
        reasons={RESET_MEMBER_REASONS}
        confirmLabel="Reset this member"
        busy={busy}
        onConfirm={doReset}
        onClose={() => setResetting(null)}
      />
      <ReasonSheet
        open={!!removing}
        title="Remove this set?"
        body={
          removing ? (
            <>
              <b>
                {fmtNum(removing.weight)} kg × {removing.reps}
              </b>{" "}
              on {machineLabel(removing.machine_id, removing.mode)}. Their PB and XP are recalculated.
            </>
          ) : null
        }
        reasons={REMOVE_SET_REASONS}
        confirmLabel="Remove set"
        busy={busy}
        onConfirm={doRemove}
        onClose={() => setRemoving(null)}
      />
    </div>
  );
}
