"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import Confetti from "@/components/Confetti";
import ShareSheet from "@/components/ShareSheet";
import { checkChallengeCompletion } from "@/lib/gamification";
import type { LogSetResult } from "@/lib/data";
import type { ShareCardData } from "@/lib/shareCard";
import type { Machine } from "@/lib/machines";

export default function SetResultModal({
  machine,
  label,
  challenge,
  mode,
  result,
  onClose,
  onContinue,
  continueLabel = "Keep training this machine",
}: {
  machine: Machine;
  label: string;
  challenge?: { weight: number; reps: number };
  mode: string | null;
  result: LogSetResult;
  onClose: () => void;
  // Optional: lets the person dismiss a new-PB celebration and keep logging
  // sets on the same machine, instead of always being sent back to it.
  onContinue?: () => void;
  continueLabel?: string;
}) {
  const primaryRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    primaryRef.current?.focus({ preventScroll: true });
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") (onContinue || onClose)();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onContinue, onClose]);
  const [sharing, setSharing] = useState(false);
  const cleared = checkChallengeCompletion(result.weight, result.reps, challenge);
  const dateLabel = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  const shareData: ShareCardData = result.isPb
    ? {
        eyebrow: "New Personal Best",
        big: `${result.weight}${machine.unit} × ${result.reps}`,
        sub: label,
        meta: `+${result.xpGain} XP`,
        dateLabel,
        fileTag: `pb-${machine.id}`,
        shareText: `New PB on ${label}: ${result.weight}${machine.unit} × ${result.reps} 💪 #RackedByBijlee`,
      }
    : {
        eyebrow: "Set Logged",
        big: `${result.weight}${machine.unit} × ${result.reps}`,
        sub: label,
        meta: `PB ${result.pbWeight}${machine.unit} × ${result.pbReps}`,
        dateLabel,
        fileTag: `set-${machine.id}`,
        shareText: `Logged ${result.weight}${machine.unit} × ${result.reps} on ${label} 🔥 #RackedByBijlee`,
      };

  if (result.isPb) {
    const gain = result.previousPb ? result.weight - result.previousPb.weight : null;
    return (
      <>
        <div className="celebrate" role="dialog" aria-modal="true" aria-labelledby="pb-title" data-testid="pb-celebration">
          <Confetti />
          <div className="pb-badge" aria-hidden="true">
            <Icon name="trophy" />
          </div>
          <h1 id="pb-title">New personal best</h1>
          <div className="big">
            {result.weight}
            <span style={{ fontSize: "0.45em", marginLeft: 4 }}>{machine.unit}</span> × {result.reps}
          </div>
          <div className="chip-row" style={{ justifyContent: "center" }}>
            {result.previousPb ? (
              <>
                <span className="pill" style={{ background: "rgba(255,255,255,.08)", borderColor: "rgba(255,255,255,.16)", color: "#fff" }}>
                  Was {result.previousPb.weight}
                  {machine.unit} × {result.previousPb.reps}
                </span>
                {gain !== null && gain > 0 && (
                  <span className="pill" style={{ background: "rgba(255,90,54,.2)", borderColor: "rgba(255,122,85,.4)", color: "#ffb39e" }}>
                    +{gain.toFixed(1).replace(/\.0$/, "")}
                    {machine.unit}
                  </span>
                )}
              </>
            ) : (
              <span className="pill" style={{ background: "rgba(255,255,255,.08)", borderColor: "rgba(255,255,255,.16)", color: "#fff" }}>
                First PB on {label}
              </span>
            )}
            <span className="pill" style={{ background: "rgba(255,255,255,.08)", borderColor: "rgba(255,255,255,.16)", color: "#fff" }}>
              +{result.xpGain} XP
            </span>
          </div>
          {cleared && (
            <div className="pill" style={{ marginTop: 12, background: "rgba(63,208,127,.16)", borderColor: "rgba(63,208,127,.4)", color: "#9ff0c1" }}>
              <Icon name="bolt" /> Machine challenge cleared
            </div>
          )}
          <div style={{ width: "100%", maxWidth: 340, marginTop: 30 }} className="stack">
            {onContinue ? (
              <button ref={primaryRef} className="btn btn-yellow btn-lg" onClick={onContinue} data-testid="pb-continue">
                {continueLabel}
              </button>
            ) : null}
            <div className="btn-row">
              <button
                ref={onContinue ? undefined : primaryRef}
                className="btn"
                style={{ background: "rgba(255,255,255,.1)", color: "#fff", border: "1px solid rgba(255,255,255,.16)" }}
                onClick={() => setSharing(true)}
              >
                <Icon name="share" /> Share
              </button>
              <button
                className="btn"
                style={{ background: "transparent", color: "rgba(255,255,255,.8)", border: "1px solid rgba(255,255,255,.16)" }}
                onClick={onClose}
              >
                Back to machine
              </button>
            </div>
          </div>
        </div>
        {sharing && <ShareSheet data={shareData} onClose={() => setSharing(false)} />}
      </>
    );
  }

  return (
    <>
      <div className="sheet-backdrop">
        <div className="sheet center">
          <div className="sheet-handle" />
          <div style={{ color: "var(--good)", marginBottom: 6 }}>
            <Icon name="check" />
          </div>
          <h2 style={{ margin: "0 0 4px", fontSize: 19 }}>Set logged</h2>
          <div className="num" style={{ fontSize: 20, fontWeight: 700, margin: "6px 0" }}>
            {result.weight}
            {machine.unit} × {result.reps}
          </div>
          <p className="muted" style={{ fontSize: 13, margin: "0 0 4px" }}>
            Your PB: {result.pbWeight}
            {machine.unit} × {result.pbReps}
          </p>
          <div className="pill-yellow" style={{ margin: "10px 0 4px" }}>
            +{result.xpGain} XP
          </div>
          <div className="btn-row" style={{ marginTop: 14 }}>
            <button className="btn btn-ghost" onClick={() => setSharing(true)}>
              <Icon name="bolt" /> Share
            </button>
            <button ref={primaryRef} className="btn btn-primary" onClick={onClose}>
              Back to Machine
            </button>
          </div>
        </div>
      </div>
      {sharing && <ShareSheet data={shareData} onClose={() => setSharing(false)} />}
    </>
  );
}
