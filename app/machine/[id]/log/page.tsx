"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
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
  const view = machine ? resolveMachineView(machine, modeParam) : null;
  const mode = view?.modeKey ?? null;
  const currentPath = `/machine/${params.id}/log${modeParam ? `?mode=${modeParam}` : ""}`;

  const [mine, setMine] = useState<StatsRow | null>(null);
  const [weight, setWeight] = useState(0);
  const [reps, setReps] = useState(8);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<LogSetResult | null>(null);

  useEffect(() => {
    if (!machine || !view || !session) return;
    supabase
      .from("machine_stats")
      .select("*")
      .eq("uid", session.user.id)
      .eq("machine_id", machine.id)
      .eq("mode", mode || "")
      .maybeSingle()
      .then(({ data }) => {
        setMine(data ?? null);
        const startW = data ? Number(data.pb_weight) : Math.round(view.challenge.weight * 0.7);
        const startR = data ? data.pb_reps : 8;
        setWeight(startW);
        setReps(startR);
      });
  }, [machine, view, mode, session, supabase]);

  if (!machine || !view) return notFound();

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
      setResult(res);
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
        {mine && (
          <div className="card center">
            <div className="eyebrow">
              <Icon name="trophy" /> Your Personal Best
            </div>
            <div className="num" style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>
              {mine.pb_weight}
              {machine.unit} × {mine.pb_reps} reps
            </div>
          </div>
        )}
        <Stepper label={`Weight (${machine.unit})`} value={weight} onChange={setWeight} step={machine.unit === "KG" ? 2.5 : 1} min={0} />
        <Stepper label="Reps" value={reps} onChange={setReps} step={1} min={1} />
        <button className="btn btn-yellow" style={{ padding: 18 }} onClick={handleSubmit} disabled={saving}>
          {saving ? "SAVING…" : "LOG SET"}
        </button>
      </div>
      {result && (
        <SetResultModal
          machine={machine}
          label={view.label}
          challenge={view.challenge}
          mode={mode}
          result={result}
          onClose={() => router.push(`/machine/${machine.id}${modeParam ? `?mode=${modeParam}` : ""}`)}
        />
      )}
    </>
  );
}
