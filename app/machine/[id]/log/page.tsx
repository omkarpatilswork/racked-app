"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { notFound, useRouter, useSearchParams } from "next/navigation";
import Icon from "@/components/Icon";
import Stepper from "@/components/Stepper";
import SignInSheet from "@/components/SignInSheet";
import SetResultModal from "@/components/SetResultModal";
import LockedMachine from "@/components/LockedMachine";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { fetchLastSet, fetchMachineLimits, friendlyDbError, logSet, type LastSet, type LogSetResult, type MachineLimit } from "@/lib/data";
import RestTimer from "@/components/RestTimer";
import { haptic } from "@/lib/haptics";
import { timeAgo } from "@/lib/time";
import { toast } from "@/lib/toast";
import { useMachineLock } from "@/lib/machineLock";
import { MACHINE_MAP, resolveMachineView } from "@/lib/machines";
import type { Database } from "@/lib/database.types";

type StatsRow = Database["public"]["Tables"]["machine_stats"]["Row"];

export default function LogSetPage({ params }: { params: { id: string } }) {
  return (
    <Suspense fallback={null}>
      <LogSetPageInner params={params} />
    </Suspense>
  );
}

function LogSetPageInner({ params }: { params: { id: string } }) {
  const machine = MACHINE_MAP[params.id];
  const searchParams = useSearchParams();
  const router = useRouter();
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const supabase = useMemo(() => createClient(), []);

  const modeParam = searchParams.get("mode");
  // Memoized: resolveMachineView builds a brand-new object every call, and
  // this object used to sit directly in the fetch effect's dependency array
  // below. That meant every render (including the one caused by moving the
  // weight/reps stepper) produced a new `view` reference, which re-ran the
  // effect and re-fetched your saved PB — and when that fetch resolved a
  // moment later, it force-set weight/reps straight back to your PB,
  // undoing whatever you'd just typed or tapped. Memoizing keeps the same
  // object across renders unless the machine or mode actually changes.
  const view = useMemo(() => (machine ? resolveMachineView(machine, modeParam) : null), [machine, modeParam]);
  const mode = view?.modeKey ?? null;
  const currentPath = `/machine/${params.id}/log${modeParam ? `?mode=${modeParam}` : ""}`;
  // A real tap lands on the machine's main page, not directly here, so this
  // will almost always just be reading the sessionStorage unlock that page
  // already set — see lib/machineLock.ts.
  const lockStatus = useMachineLock(machine, searchParams.get("tap"));

  const [mine, setMine] = useState<StatsRow | null>(null);
  const [weight, setWeight] = useState(0);
  const [reps, setReps] = useState(10);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<LogSetResult | null>(null);
  // The PB shown on this page updates the instant a set is logged, rather
  // than waiting for a refetch — so a PB you just hit is reflected right
  // away even though you haven't left the page.
  const [livePb, setLivePb] = useState<{ weight: number; reps: number } | null>(null);
  // Sets logged in this visit to the page, newest last. This is what lets
  // you log a whole exercise's worth of sets in one place — each tap of
  // "Log set" adds to this list instead of bouncing you back to the machine
  // screen, so you can knock out set after set without re-navigating.
  const [sessionSets, setSessionSets] = useState<{ weight: number; reps: number; isPb: boolean }[]>([]);
  // What you did last time on this machine -- the log screen starts there.
  const [lastSet, setLastSet] = useState<LastSet | null>(null);
  // bumps after every logged set to (re)start the rest timer
  const [restSignal, setRestSignal] = useState(0);

  // Weight increment: use the machine's own override when set, otherwise
  // fall back to 5kg steps for KG machines (matches how the weight stacks
  // are actually loaded — every machine, not just Lat Pulldown).
  const weightStep = machine?.weightStep ?? (machine?.unit === "KG" ? 5 : 1);
  const weightMin = machine?.minWeight ?? 0;
  // The gym's real limit for this machine (set by staff, enforced by the
  // database) wins over the built-in default when we have it.
  const [limit, setLimit] = useState<MachineLimit | null>(null);
  const weightMax = limit?.max_weight ?? machine?.maxWeight;
  const repsMin = machine?.minReps ?? 1;
  const repsMax = limit?.max_reps ?? machine?.maxReps;

  function clampTo(v: number, lo: number, hi?: number) {
    if (v < lo) v = lo;
    if (typeof hi === "number" && v > hi) v = hi;
    return v;
  }

  function roundToStep(v: number, step: number) {
    if (!step) return v;
    return Math.round(v / step) * step;
  }

  // Guards against a slower fetch resolving *after* the person has already
  // started adjusting the stepper (e.g. on a slow connection) — without
  // this, even a correctly-deduped effect could still land its "here's your
  // saved weight" response on top of an in-progress edit.
  const userEditedRef = useRef(false);

  useEffect(() => {
    if (!machine || !view || !uid || lockStatus !== "unlocked") return;
    userEditedRef.current = false;
    let active = true;
    Promise.all([
      supabase
        .from("machine_stats")
        .select("*")
        .eq("uid", uid)
        .eq("machine_id", machine.id)
        .eq("mode", mode || "")
        .maybeSingle()
        .then(({ data }) => data ?? null, () => null),
      fetchLastSet(supabase, uid, machine.id, mode).catch(() => null),
      fetchMachineLimits(supabase).catch(() => ({}) as Record<string, MachineLimit>),
    ]).then(([data, last, limits]) => {
      if (!active) return;
      setMine(data);
      setLastSet(last);
      const lim = limits[machine.id] ?? null;
      setLimit(lim);
      const wMax = lim?.max_weight ?? weightMax;
      const rMax = lim?.max_reps ?? repsMax;
      // even if they've already started editing, never sit above the real max
      if (lim) {
        setWeight((w) => Math.min(w, lim.max_weight));
        setReps((r) => Math.min(r, lim.max_reps));
      }
      if (userEditedRef.current) return;
      // Start from what you did last time; otherwise your PB; otherwise a
      // sensible starting weight for this machine.
      const startW = last
        ? last.weight
        : data
          ? Number(data.pb_weight)
          : roundToStep(machine.startWeight ?? Math.round(view.challenge.weight * 0.7), weightStep);
      const startR = last ? last.reps : data ? data.pb_reps : machine.startReps ?? 10;
      setWeight(clampTo(startW, weightMin, wMax));
      setReps(clampTo(startR, repsMin, rMax));
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machine, view, mode, uid, lockStatus, supabase]);

  function handleWeightChange(v: number) {
    userEditedRef.current = true;
    setWeight(v);
  }

  function handleRepsChange(v: number) {
    userEditedRef.current = true;
    setReps(v);
  }

  if (!machine || !view) return notFound();
  if (lockStatus === "checking") return null;
  if (lockStatus === "locked") return <LockedMachine machine={machine} />;

  const displayPb = livePb ?? (mine ? { weight: Number(mine.pb_weight), reps: mine.pb_reps } : null);
  const sessionVolume = sessionSets.reduce((sum, s) => sum + s.weight * s.reps, 0);

  if (!session) {
    return (
      <>
        <div className="topbar">
          <Link href={`/machine/${machine.id}${modeParam ? `?mode=${modeParam}` : ""}`} className="iconbtn" aria-label="Back">
            <Icon name="back" />
          </Link>
          <div className="topbar-title">{view.label}</div>
          <div style={{ width: 42 }} />
        </div>
        <div className="page stack-lg center" style={{ paddingTop: 36 }}>
          <div className="tapin-icons" style={{ margin: "0 auto", width: 56, height: 56 }}>
            <Icon name="lock" />
          </div>
          <h2 style={{ margin: "6px 0 0" }}>Sign in to log your set</h2>
          <p className="muted" style={{ margin: 0 }}>Your weight, reps and personal bests are saved to your account.</p>
        </div>
        <SignInSheet
          open
          title="Sign in to log this set"
          onClose={() => router.push(`/machine/${machine.id}${modeParam ? `?mode=${modeParam}` : ""}`)}
          next={currentPath}
        />
      </>
    );
  }

  async function handleSubmit() {
    if (saving) return;
    if (weight <= 0 || reps <= 0) {
      toast("Enter a weight and reps first");
      return;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      toast("You're offline — connect to save this set");
      return;
    }
    setSaving(true);
    try {
      const res = await logSet(supabase, machine!.id, mode, weight, reps);
      setLivePb({ weight: res.pbWeight, reps: res.pbReps });
      setSessionSets((prev) => [...prev, { weight: res.weight, reps: res.reps, isPb: res.isPb }]);
      setLastSet({ weight: res.weight, reps: res.reps, created_at: new Date().toISOString() });
      setRestSignal((n) => n + 1);
      if (res.isPb) {
        // A new PB is worth a full celebration — show the modal.
        haptic("pb");
        setResult(res);
      } else {
        // Anything else shouldn't interrupt the flow of a workout: a quick
        // toast is enough, and the set drops straight into the list below
        // so you can immediately load up the next one.
        haptic("success");
        toast(`Set ${sessionSets.length + 1} logged · ${res.weight}${machine!.unit} × ${res.reps} · +${res.xpGain} XP`);
      }
    } catch (err) {
      console.error(err);
      toast(friendlyDbError(err) ?? "Couldn't save that set — check your connection and tap Log again");
    } finally {
      setSaving(false);
    }
  }

  function finish() {
    if (sessionSets.length) {
      toast(`Nice work — ${sessionSets.length} set${sessionSets.length > 1 ? "s" : ""}, ${sessionVolume.toLocaleString()}${machine!.unit} moved`);
    }
    router.push(`/machine/${machine!.id}${modeParam ? `?mode=${modeParam}` : ""}`);
  }

  const lastChip =
    lastSet && (!displayPb || lastSet.weight !== displayPb.weight)
      ? [{ label: `Last ${lastSet.weight}${machine.unit}`, value: lastSet.weight }]
      : [];
  const lastRepsChip =
    lastSet && (!displayPb || lastSet.reps !== displayPb.reps) ? [{ label: `Last ×${lastSet.reps}`, value: lastSet.reps }] : [];

  return (
    <>
      <div className="topbar">
        <Link href={`/machine/${machine.id}${modeParam ? `?mode=${modeParam}` : ""}`} className="iconbtn" aria-label="Back to machine">
          <Icon name="back" />
        </Link>
        <div className="topbar-title">Log a set</div>
        <div style={{ width: 42 }} />
      </div>
      <div className="page stack-lg">
        <div>
          <div className="eyebrow">
            Machine {String(machine.number).padStart(2, "0")}
          </div>
          <h1 style={{ fontSize: 24, margin: "6px 0 10px" }}>{view.label}</h1>
          <div className="chip-row">
            {displayPb ? (
              <span className="pill-yellow" data-testid="pb-pill">
                <Icon name="trophy" /> PB {displayPb.weight}
                {machine.unit} × {displayPb.reps}
              </span>
            ) : (
              <span className="pill">
                <Icon name="target" /> First set here — set your PB
              </span>
            )}
            {lastSet && (
              <span className="pill" data-testid="last-pill">
                Last {lastSet.weight}
                {machine.unit} × {lastSet.reps} · {timeAgo(lastSet.created_at)}
              </span>
            )}
          </div>
        </div>

        <RestTimer startSignal={restSignal} />

        <Stepper
          label="Weight"
          unit={machine.unit}
          testId="weight"
          value={weight}
          onChange={handleWeightChange}
          step={weightStep}
          min={weightMin}
          max={weightMax}
          quickSets={[
            ...lastChip,
            ...(displayPb ? [{ label: `PB ${displayPb.weight}${machine.unit}`, value: displayPb.weight }] : []),
          ]}
        />
        {limit && (
          <p className="faint center" style={{ fontSize: 12, margin: "-8px 0 0" }} data-testid="limit-hint">
            This machine goes up to {limit.max_weight} kg
          </p>
        )}
        <Stepper
          label="Reps"
          unit="reps"
          testId="reps"
          value={reps}
          onChange={handleRepsChange}
          step={1}
          min={repsMin}
          max={repsMax}
          quickSets={[...lastRepsChip, ...(displayPb ? [{ label: `PB ×${displayPb.reps}`, value: displayPb.reps }] : [])]}
        />

        {sessionSets.length > 0 && (
          <section className="card" data-testid="session-sets">
            <div className="row">
              <h3 style={{ margin: 0, fontSize: 15 }}>This session</h3>
              <span className="pill-yellow">
                {sessionSets.length} set{sessionSets.length > 1 ? "s" : ""}
              </span>
            </div>
            <ol style={{ listStyle: "none", margin: "8px 0 0", padding: 0 }}>
              {sessionSets.map((s, i) => (
                <li
                  key={i}
                  className="row"
                  style={{ padding: "9px 0", borderBottom: i < sessionSets.length - 1 ? "1px solid var(--border)" : "none" }}
                >
                  <span className="muted" style={{ fontSize: 13 }}>Set {i + 1}</span>
                  <span className="num" style={{ fontWeight: 700 }}>
                    {s.weight}
                    {machine.unit} × {s.reps}
                    {s.isPb ? <span className="accent"> · PB</span> : null}
                  </span>
                </li>
              ))}
            </ol>
            <div className="row" style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
              <span className="muted" style={{ fontSize: 12.5 }}>Volume</span>
              <span className="num" style={{ fontWeight: 700 }}>
                {sessionVolume.toLocaleString()}
                {machine.unit}
              </span>
            </div>
          </section>
        )}

        <div className="sticky-cta">
          <button className="btn btn-yellow btn-lg" onClick={handleSubmit} disabled={saving} data-testid="log-submit">
            {saving ? (
              "Saving…"
            ) : (
              <>
                <Icon name="check" /> {sessionSets.length > 0 ? "Log another" : "Log set"} · {weight}
                {machine.unit} × {reps}
              </>
            )}
          </button>
          {sessionSets.length > 0 && (
            <button type="button" className="btn btn-ghost" style={{ marginTop: 10 }} onClick={finish} data-testid="finish">
              Done with this machine
            </button>
          )}
        </div>
      </div>
      {result && (
        <SetResultModal
          machine={machine}
          label={view.label}
          challenge={view.challenge}
          mode={mode}
          result={result}
          onClose={() => router.push(`/machine/${machine.id}${modeParam ? `?mode=${modeParam}` : ""}`)}
          onContinue={() => setResult(null)}
          continueLabel="Keep going — log the next set"

        />
      )}
    </>
  );
}
