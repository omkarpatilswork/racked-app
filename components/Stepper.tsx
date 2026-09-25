"use client";

export default function Stepper({
  label,
  value,
  onChange,
  step,
  min,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step: number;
  min: number;
}) {
  function bump(dir: number) {
    let v = value + dir * step;
    if (v < min) v = min;
    // avoid floating point artifacts like 62.499999999
    v = Math.round(v * 100) / 100;
    onChange(v);
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
            inputMode={step % 1 !== 0 ? "decimal" : "numeric"}
            value={value}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              onChange(Number.isFinite(v) ? v : 0);
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
