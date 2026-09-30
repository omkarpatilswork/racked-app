"use client";

import { Suspense } from "react";
import Link from "next/link";
import { notFound, useSearchParams } from "next/navigation";
import Icon from "@/components/Icon";
import ExerciseAnimation from "@/components/ExerciseAnimation";
import LockedMachine from "@/components/LockedMachine";
import { useMachineLock } from "@/lib/machineLock";
import { MACHINE_MAP, resolveMachineView } from "@/lib/machines";

export default function GuidePage({ params }: { params: { id: string } }) {
  return (
    <Suspense fallback={null}>
      <GuidePageInner params={params} />
    </Suspense>
  );
}

function GuidePageInner({ params }: { params: { id: string } }) {
  const machine = MACHINE_MAP[params.id];
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode");
  const view = machine ? resolveMachineView(machine, mode) : null;
  const lockStatus = useMachineLock(machine, searchParams.get("tap"));

  if (!machine || !view) return notFound();
  if (lockStatus === "checking") return null;
  if (lockStatus === "locked") return <LockedMachine machine={machine} />;

  return (
    <>
      <div className="topbar">
        <Link href={`/machine/${machine.id}${mode ? `?mode=${mode}` : ""}`} className="iconbtn" aria-label="Back">
          <Icon name="back" />
        </Link>
        <div style={{ width: 38 }} />
      </div>
      <div className="stack-lg">
        <div>
          <div className="eyebrow">How to use{machine.dual ? ` — ${view.label}` : ""}</div>
          <h1 style={{ fontSize: 24, margin: "6px 0 0" }}>{machine.name}</h1>
        </div>
        <div>
          <div className="exercise-stage">
            <ExerciseAnimation machineId={machine.id} mode={view.modeKey} />
          </div>
          <div className="exercise-caption">{view.instructions[3][1]}</div>
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Setup
          </div>
          <div className="card" style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>
            {view.instructions.slice(0, 2).map((s) => s[1]).join(" ")}
          </div>
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Common Mistakes
          </div>
          <div className="card stack" style={{ gap: 8 }}>
            {view.mistakes.map((x) => (
              <div key={x} className="row" style={{ justifyContent: "flex-start", gap: 10 }}>
                <span style={{ color: "var(--danger)", fontWeight: 700 }}>✕</span>
                <span style={{ fontSize: 13.5 }}>{x}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card" style={{ background: "color-mix(in srgb, var(--yellow) 16%, var(--surface))" }}>
          <div className="eyebrow">Quick Tip</div>
          <div style={{ fontWeight: 700, marginTop: 4, fontSize: 14.5 }}>{view.tip}</div>
        </div>
        <Link href={`/machine/${machine.id}/log${mode ? `?mode=${mode}` : ""}`} className="btn btn-yellow">
          <Icon name="flame" /> Log your set
        </Link>
      </div>
    </>
  );
}
