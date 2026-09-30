"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { notFound, useRouter, useSearchParams } from "next/navigation";
import Icon from "@/components/Icon";
import Stepper from "@/components/Stepper";
import SignInSheet from "@/components/SignInSheet";
import SetResultModal from "@/components/SetResultModal";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { logSet, type LogSetResult } from "@/lib/data";
import { toast } from "@/lib/toast";
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

  // Weight increment: use the machine's own override when set, otherwise
  // fall back to 5kg steps for KG machines (matches how the weight stacks
  // are actually loaded — every machine, not just Lat Pulldown).
  const weightStep = machine?.weightStep ?? (machine?.unit === "KG" ? 5 : 1);
  const weightMin = machine?.minWeight ?? 0;
  const weightMax = machine?.maxWeight;
  const repsMin = machine?.minReps ?? 1;
  const repsMax = machine?.maxReps;

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
    if (!machine || !view || !session) return;
    userEditedRef.current = false;
    supabase
      .from("machine_stats")
      .select("*")
      .eq("uid", session.user.id)
      .eq("machine_id", machine.id)
      .eq("mode", mode || "")
      .maybeSingle()
      .then(({ data }) => {
        setMine(data ?? null);
        if (userEditedRef.current) return;
        const startW = data
          ? Number(data.pb_weight)
          : roundToStep(machine.startWeight ?? Math.round(view.challenge.weight * 0.7), weightStep);
        const startR = data ? data.pb_reps : machine.startReps ?? 10;
        setWeight(clampTo(startW, weightMin, weightMax));
        setReps(clampTo(startR, repsMin, repsMax));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machine, view, mode, session, supabase]);

  function handleWeightChange(v: number) {
    userEditedRef.current = true;
    setWeight(v);
  }

  function handleRepsChange(v: number) {
    userEditedRef.current = true;
    setReps(v);
  }

  if (!machine || !view) return notFound();

  const displayPb = livePb ?? (mine ? { weight: Number(mine.pb_weight), reps: mine.pb_reps } : null);
  const sessionVolume = sessionSets.reduce((sum, s) => sum + s.weight * s.reps, 0);

  if (!session) {
    return (
      <>
        <div className="topbar">
          <Link href={`/machine/${machine.id}${modeParam ? `?mode=${modeParam}` : ""}`} className="iconbtn" aria-label="Back">
            <Icon name="back" />
          </Link>
          <div style={{ width: 38 }} />
        </div>
        <div className="stack-lg center" style={{ paddingTop: 40 }}>
          <div style={{ color: "var(--ink-faint)" }}>
            <Icon name="lock" />
          </div>
          <h2 style={{ margin: "10px 0 4px" }}>Sign in to log your set</h2>
          <p className="muted" style={{ margin: 0 }}>Save your weight, reps and Personal Best.</p>
        </div>
        <SignInSheet open onClose={() => router.push(`/machine/${machine.id}`)} next={currentPath} />
      </>
    );
  }

  async function handleSubmit() {
    if (weight <= 0 || reps <= 0) {
      toast("Enter a weight and reps first");
      return;
    }
    setSaving(true);
    try {
      const res = await logSet(supabase, machine!.id, mode, weight, reps);
      setLivePb({ weight: res.pbWeight, reps: res.pbReps });
      setSessionSets((prev) => [...prev, { weight: res.weight, reps: res.reps, isPb: res.isPb }]);
      if (res.isPb) {
        // A new PB is worth a full celebration — show the modal.
        setResult(res);
      } else {
        // Anything else shouldn't interrupt the flow of a workout: a quick
        // toast is enough, and the set drops straight into the list below
        // so you can immediately load up the next one.
        toast(`Logged ${res.weight}${machine!.unit} × ${res.reps} 🔥`);
      }
    } catch (err) {
      console.error(err);
      toast("Could not save that set — try again");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="topbar">
        <Link href={`/machine/${machine.id}${modeParam ? `?mode=${modeParam}` : ""}`} className="iconbtn" aria-label="Back">
          <Icon name="back" />
        </Link>
        <div style={{ width: 38 }} />
      </div>
      <div className="stack-lg">
        <div>
          <div className="eyebrow">Log your set</div>
          <h1 style={{ fontSize: 22, margin: "6px 0 0" }}>{view.label}</h1>
        </div>
        {displayPb && (
          <div className="card center">
            <div className="eyebrow">
              <Icon name="trophy" /> Your Personal Best
            </div>
            <div className="num" style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>
              {displayPb.weight}
              {machine.unit} × {displayPb.reps} reps
            </div>
          </div>
        )}
        <Stepper
          label={`Weight (${machine.unit})`}
          value={weight}
          onChange={handleWeightChange}
          step={weightStep}
          min={weightMin}
          max={weightMax}
          quickSets={displayPb ? [{ label: `PB ${displayPb.weight}${machine.unit}`, value: displayPb.weight }] : undefined}
        />
        <Stepper
          label="Reps"
          value={reps}
          onChange={handleRepsChange}
          step={1}
          min={repsMin}
          max={repsMax}
          quickSets={displayPb ? [{ label: `PB ×${displayPb.reps}`, value: displayPb.reps }] : undefined}
        />
        <button className="btn btn-yellow" style={{ padding: 18 }} onClick={handleSubmit} disabled={saving}>
          {saving ? "SAVING…" : sessionSets.length > 0 ? "LOG ANOTHER SET" : "LOG SET"}
        </button>

        {sessionSets.length > 0 && (
          <div className="card">
            <div className="row">
              <h3 style={{ margin: 0, fontSize: 15 }}>Sets logged today</h3>
              <span className="pill-yellow">
                {sessionSets.length} set{sessionSets.length > 1 ? "s" : ""}
              </span>
            </div>
            <div style={{ marginTop: 6 }}>
              {sessionSets.map((s, i) => (
                <div
                  key={i}
                  className="row"
                  style={{
                    padding: "9px 0",
                    borderBottom: i < sessionSets.length - 1 ? "1px solid var(--border)" : "none",
                  }}
                >
                  <span className="muted" style={{ fontSize: 13 }}>Set {i + 1}</span>
                  <span className="num" style={{ fontWeight: 700 }}>
                    {s.weight}
                    {machine.unit} × {s.reps}
                    {s.isPb ? " ⭐" : ""}
                  </span>
                </div>
              ))}
            </div>
            <div className="row" style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
              <span className="muted" style={{ fontSize: 12.5 }}>Session volume</span>
              <span className="num" style={{ fontWeight: 700 }}>
                {sessionVolume.toLocaleString()}
                {machine.unit}
              </span>
            </div>
          </div>
        )}

        {sessionSets.length > 0 && (
          <Link
            href={`/machine/${machine.id}${modeParam ? `?mode=${modeParam}` : ""}`}
            className="btn btn-ghost"
          >
            Finish session
          </Link>
        )}
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
        />
      )}
    </>
  );
}
