"use client";

// Men · Women · All, for the ×BW boards (database update 0015).
import type { BoardView } from "@/lib/body";

const OPTIONS: { key: BoardView; label: string }[] = [
  { key: "men", label: "Men" },
  { key: "women", label: "Women" },
  { key: "all", label: "All" },
];

export default function DivisionTabs({
  value,
  onChange,
  withAll = true,
  label = "Board",
  className = "",
}: {
  value: BoardView;
  onChange: (v: BoardView) => void;
  withAll?: boolean;
  label?: string;
  className?: string;
}) {
  const opts = withAll ? OPTIONS : OPTIONS.filter((o) => o.key !== "all");
  return (
    <div className={`div-tabs ${className}`} role="tablist" aria-label={label} style={{ ["--n" as string]: opts.length, ["--i" as string]: Math.max(0, opts.findIndex((o) => o.key === value)) }}>
      <span className="div-tabs-glider" aria-hidden="true" />
      {opts.map((o) => (
        <button key={o.key} type="button" role="tab" aria-selected={value === o.key} className={value === o.key ? "on" : ""} onClick={() => onChange(o.key)} data-testid={`div-${o.key}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
