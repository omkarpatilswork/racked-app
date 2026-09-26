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
            type="number"
            step={step}
            min={min}
            inputMode={step % 1 !== 0 ? "decimal" : "numeric"}
            value={value}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              onChange(Number.isFinite(v) ? v : 0);
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
