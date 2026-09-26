"use client";

export default function Stepper({
  label,
  value,
  onChange,
  step,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step: number;
  min: number;
  max?: number;
}) {
  function clamp(v: number) {
    if (v < min) v = min;
    if (typeof max === "number" && v > max) v = max;
    // avoid floating point artifacts like 62.499999999
    return Math.round(v * 100) / 100;
  }

  function bump(dir: number) {
    onChange(clamp(value + dir * step));
  }

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
            value={value}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                onChange(0);
                return;
              }
              const v = parseFloat(raw);
              if (!Number.isFinite(v)) return;
              // Only clamp once the typed number actually breaches a bound —
              // clamping every keystroke would fight the user mid-type.
              const bounded = v < min || (typeof max === "number" && v > max) ? clamp(v) : v;
              onChange(bounded);
            }}
            onBlur={(e) => {
              const v = parseFloat(e.target.value);
              onChange(clamp(Number.isFinite(v) ? v : min));
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
    </div>
  );
}
