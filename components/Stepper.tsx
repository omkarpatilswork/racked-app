"use client";

import { useEffect, useState } from "react";

export default function Stepper({
  label,
  value,
  onChange,
  step,
  min,
  max,
  quickSets,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step: number;
  min: number;
  max?: number;
  // Optional one-tap shortcuts shown as chips under the +/- row — e.g. jump
  // straight to a saved PB — alongside a pair of auto-generated "big jump"
  // chips (4x the normal step) so a big weight/rep change doesn't need
  // dozens of individual taps on the small +/- buttons.
  quickSets?: { label: string; value: number }[];
}) {
  // The visible text is tracked separately from the numeric `value`. If the
  // <input> just displayed `value` directly, every keystroke's re-render
  // would stomp on what's mid-typed — clearing the field to retype snaps
  // back to showing "0", and a trailing "." while typing a decimal (e.g.
  // "40." on the way to "40.5") gets silently stripped because `String(40)`
  // has no dot. Keeping our own text buffer, and only resyncing it from
  // `value` while the field isn't focused, avoids both.
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  function clamp(v: number) {
    if (v < min) v = min;
    if (typeof max === "number" && v > max) v = max;
    // avoid floating point artifacts like 62.499999999
    return Math.round(v * 100) / 100;
  }

  // A "complete" change — button press or arrow key — always gets clamped
  // and the visible text updated to match immediately.
  function commit(v: number) {
    const c = clamp(v);
    onChange(c);
    setText(String(c));
  }

  function bump(dir: number) {
    commit(value + dir * step);
  }

  // A bigger jump for fast changes (chips below), 4x the normal +/- step —
  // e.g. 5kg step -> 20kg chip, 1 rep step -> 4 rep chip.
  const bigStep = Math.round(step * 4 * 100) / 100;
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));
  const showChips = (quickSets && quickSets.length > 0) || bigStep > 0;

  return (
    <div className="card">
      <div className="eyebrow center" style={{ display: "block", marginBottom: 10 }}>
        {label}
      </div>
      <div className="stepper">
        <button type="button" onClick={() => bump(-1)} aria-label={`Decrease ${label}`}>
          −
        </button>
        <div className="value">
          <input
            className="num"
            type="number"
            step={step}
            min={min}
            max={max}
            inputMode={step % 1 !== 0 ? "decimal" : "numeric"}
            value={text}
            onFocus={() => setFocused(true)}
            onChange={(e) => {
              const raw = e.target.value;
              // Always show exactly what was typed, including a lone "-",
              // a trailing "." or an empty field mid-edit.
              setText(raw);
              if (raw === "" || raw === "-") return;
              const v = parseFloat(raw);
              if (!Number.isFinite(v)) return;
              // Only push the high bound live — a value that's already too
              // large isn't something a later keystroke would fix. Leave the
              // low bound alone until blur: typing "40" from scratch passes
              // through "4" first, which is legitimately below a min of 5
              // for an instant, and clamping that mid-keystroke is what
              // corrupted every digit typed after it.
              const bounded = typeof max === "number" && v > max ? clamp(v) : v;
              onChange(bounded);
            }}
            onBlur={() => {
              setFocused(false);
              const v = parseFloat(text);
              commit(Number.isFinite(v) ? v : min);
            }}
            onKeyDown={(e) => {
              // Belt-and-suspenders: some mobile/in-app browsers don't wire
              // ArrowUp/ArrowDown to the native number step even on
              // type="number" inputs, so handle it ourselves too.
              if (e.key === "ArrowUp") {
                e.preventDefault();
                bump(1);
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                bump(-1);
              }
            }}
          />
        </div>
        <button type="button" onClick={() => bump(1)} aria-label={`Increase ${label}`}>
          +
        </button>
      </div>
      {showChips && (
        <div className="chip-row" style={{ justifyContent: "center", marginTop: 12 }}>
          {bigStep > 0 && (
            <button type="button" className="qchip" onClick={() => commit(value - bigStep)}>
              −{fmt(bigStep)}
            </button>
          )}
          {quickSets?.map((qs) => (
            <button
              key={qs.label}
              type="button"
              className="qchip qchip-accent"
              onClick={() => commit(qs.value)}
            >
              {qs.label}
            </button>
          ))}
          {bigStep > 0 && (
            <button type="button" className="qchip" onClick={() => commit(value + bigStep)}>
              +{fmt(bigStep)}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
