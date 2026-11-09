"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { haptic } from "@/lib/haptics";
import { PREF_REST, readPref, writePref } from "@/lib/prefs";

const OPTIONS = [60, 90, 120, 180];

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

type WakeLockSentinelLike = {
  release: () => Promise<void>;
  addEventListener?: (type: "release", cb: () => void) => void;
};

// Rest timer that starts after each logged set. Counts down from an end
// time (not a ticking counter), so it stays correct if the phone locks or the
// tab is in the background. Keeps the screen awake while running where the
// browser allows it, and buzzes when rest is over.
export default function RestTimer({ startSignal }: { startSignal: number }) {
  const [duration, setDuration] = useState(90);
  const [endAt, setEndAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [done, setDone] = useState(false);
  const wake = useRef<WakeLockSentinelLike | null>(null);
  const firedFor = useRef<number | null>(null);
  const startedAt = useRef<number>(0);
  const running = useRef(false);

  useEffect(() => {
    const saved = Number(readPref(PREF_REST, "90"));
    if (Number.isFinite(saved) && saved >= 0) setDuration(saved);
  }, []);

  const releaseWake = useCallback(() => {
    running.current = false;
    wake.current?.release().catch(() => {});
    wake.current = null;
  }, []);

  // Keep the screen on while resting (where the browser supports it). The
  // browser drops the lock whenever the page is hidden, so we forget it when
  // that happens and ask again when the page is visible.
  const acquireWake = useCallback(() => {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLockSentinelLike> } };
    if (wake.current || !nav.wakeLock || document.visibilityState !== "visible") return;
    nav.wakeLock
      .request("screen")
      .then((s) => {
        if (!running.current) {
          s.release().catch(() => {});
          return;
        }
        wake.current = s;
        s.addEventListener?.("release", () => {
          if (wake.current === s) wake.current = null;
        });
      })
      .catch(() => {});
  }, []);

  const start = useCallback(
    (secs: number) => {
      if (secs <= 0) return;
      setDone(false);
      running.current = true;
      startedAt.current = Date.now();
      setEndAt(Date.now() + secs * 1000);
      setNow(Date.now());
      acquireWake();
    },
    [acquireWake]
  );

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && running.current) acquireWake();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [acquireWake]);

  // a new set was logged -> (re)start the rest
  useEffect(() => {
    if (startSignal > 0 && firedFor.current !== startSignal) {
      firedFor.current = startSignal;
      const saved = Number(readPref(PREF_REST, "90"));
      start(Number.isFinite(saved) ? saved : 90);
    }
  }, [startSignal, start]);

  useEffect(() => {
    if (!endAt) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [endAt]);

  const remaining = endAt ? Math.max(0, Math.ceil((endAt - now) / 1000)) : 0;

  useEffect(() => {
    if (endAt && remaining === 0 && !done) {
      setDone(true);
      setEndAt(null);
      haptic("alert");
      releaseWake();
    }
  }, [endAt, remaining, done, releaseWake]);

  useEffect(() => releaseWake, [releaseWake]);

  if (duration === 0 && !endAt) return null;
  if (!endAt && !done) return null;

  const total = endAt ? Math.max(1, (endAt - startedAt.current) / 1000) : 1;
  const pct = endAt ? Math.min(100, Math.max(0, 100 - (remaining / total) * 100)) : 100;

  return (
    <section className={`card rest-timer${done ? " done" : ""}`} aria-live="polite" data-testid="rest-timer">
      <div className="rest-ring" style={{ ["--p" as string]: pct }}>
        {done ? <Icon name="check" /> : fmt(remaining)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800 }}>{done ? "Rest over — next set!" : "Resting"}</div>
        <div className="chip-row" style={{ marginTop: 8 }}>
          {done ? (
            <button type="button" className="qchip" onClick={() => setDone(false)}>
              Dismiss
            </button>
          ) : (
            <>
              <button type="button" className="qchip" onClick={() => setEndAt((e) => (e ? e + 30000 : e))}>
                +30s
              </button>
              <button
                type="button"
                className="qchip"
                onClick={() => {
                  setEndAt(null);
                  setDone(false);
                  releaseWake();
                }}
              >
                Skip
              </button>
            </>
          )}
        </div>
      </div>
      <label className="sr-only" htmlFor="rest-len">
        Rest length
      </label>
      <select
        id="rest-len"
        className="rest-select"
        value={duration}
        onChange={(e) => {
          const v = Number(e.target.value);
          setDuration(v);
          writePref(PREF_REST, String(v));
          if (v === 0) {
            setEndAt(null);
            setDone(false);
            releaseWake();
          } else if (endAt) start(v);
        }}
      >
        {OPTIONS.map((o) => (
          <option key={o} value={o}>
            {fmt(o)}
          </option>
        ))}
        <option value={0}>Off</option>
      </select>
    </section>
  );
}
