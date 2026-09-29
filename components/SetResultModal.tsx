"use client";

import { useState } from "react";
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
}) {
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
    return (
      <>
        <div className="celebrate">
          <Confetti />
          <h1>New Personal Best!</h1>
          <div className="big">
            {result.weight}
            {machine.unit} × {result.reps}
          </div>
          {result.previousPb ? (
            <>
              <div className="pill" style={{ background: "rgba(255,255,255,.1)", borderColor: "rgba(255,255,255,.18)", color: "#fff" }}>
                Previous PB: {result.previousPb.weight}
                {machine.unit} × {result.previousPb.reps}
              </div>
              <div className="pill-yellow" style={{ marginTop: 10 }}>
                +{(result.weight - result.previousPb.weight).toFixed(1).replace(/\.0$/, "")}
                {machine.unit} improvement
              </div>
            </>
          ) : (
            <div className="pill-yellow">First PB on {label}</div>
          )}
          <div className="num accent" style={{ fontWeight: 700, marginTop: 16, fontSize: 18 }}>
            +{result.xpGain} XP
          </div>
          {cleared && (
            <div className="pill" style={{ marginTop: 14, background: "rgba(255,255,255,.1)", borderColor: "rgba(255,255,255,.18)", color: "#fff" }}>
              <Icon name="bolt" /> Challenge cleared
            </div>
          )}
          <div className="btn-row" style={{ marginTop: 28, maxWidth: 320 }}>
            <button className="btn btn-outline" style={{ borderColor: "rgba(255,255,255,.3)", color: "#fff" }} onClick={() => setSharing(true)}>
              <Icon name="bolt" /> Share
            </button>
            <button className="btn btn-yellow" onClick={onClose}>
              Back to Machine
            </button>
          </div>
          {onContinue && (
            <button
              className="btn"
              style={{ marginTop: 12, background: "transparent", color: "rgba(255,255,255,.75)", border: "none" }}
              onClick={onContinue}
            >
              Keep training this machine →
            </button>
          )}
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
            <button className="btn btn-primary" onClick={onClose}>
              Back to Machine
            </button>
          </div>
        </div>
      </div>
      {sharing && <ShareSheet data={shareData} onClose={() => setSharing(false)} />}
    </>
  );
}
