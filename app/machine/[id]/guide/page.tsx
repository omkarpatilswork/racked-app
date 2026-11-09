"use client";

import { Suspense } from "react";
import Link from "next/link";
import { notFound, useSearchParams } from "next/navigation";
import Icon from "@/components/Icon";
import ExerciseAnimation from "@/components/ExerciseAnimation";
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
  // The guide is open to everyone (it's just instructions) -- only logging a
  // set needs a tap. We still check the lock to decide where "back" goes.
  const lockStatus = useMachineLock(machine, searchParams.get("tap"));

  if (!machine || !view) return notFound();
  const backHref = lockStatus === "unlocked" ? `/machine/${machine.id}${mode ? `?mode=${mode}` : ""}` : "/machines";

  return (
    <>
      <div className="topbar">
        <Link href={backHref} className="iconbtn" aria-label="Back">
          <Icon name="back" />
        </Link>
        <div className="topbar-title">How to use</div>
        <div style={{ width: 42 }} />
      </div>
      <div className="page stack-lg">
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
        <div className="card" style={{ background: "var(--accent-soft)", borderColor: "color-mix(in srgb, var(--yellow) 30%, transparent)" }}>
          <div className="eyebrow accent">Quick tip</div>
          <div style={{ fontWeight: 700, marginTop: 4, fontSize: 14.5 }}>{view.tip}</div>
        </div>
        {lockStatus === "unlocked" ? (
          <Link href={`/machine/${machine.id}/log${mode ? `?mode=${mode}` : ""}`} className="btn btn-yellow btn-lg">
            <Icon name="flame" /> Log a set
          </Link>
        ) : (
          <div className="tapin-card">
            <div className="tapin-icons" aria-hidden="true">
              <Icon name="nfc" />
            </div>
            <div style={{ flex: 1 }}>
              <b>Ready to try it?</b>
              <span>Tap this machine&rsquo;s sticker or scan its QR code to log a set.</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
