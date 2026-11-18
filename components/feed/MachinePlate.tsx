// The PR card's "plate": the machine's own colours, pattern and drawing (the
// same art as the share stories), with the lift big on top of it.
import { machineArt } from "@/lib/story";

function poseSvg(machineId: string, stroke: string) {
  const { pose } = machineArt(machineId);
  if (!pose) return null;
  const pts = (seg: number[]) => {
    const out: string[] = [];
    for (let i = 0; i < seg.length; i += 2) out.push(`${seg[i]},${seg[i + 1]}`);
    return out.join(" ");
  };
  return (
    <svg viewBox="0 0 100 100" className="fx-pose" aria-hidden="true">
      <g fill="none" stroke={stroke} strokeLinecap="round" strokeLinejoin="round">
        {pose.gear.map((g, i) => (
          <polyline key={`g${i}`} points={pts(g)} strokeWidth={3.2} opacity={0.55} />
        ))}
        {pose.body.map((b, i) => (
          <polyline key={`b${i}`} points={pts(b)} strokeWidth={5.4} />
        ))}
      </g>
      <circle cx={pose.head[0]} cy={pose.head[1]} r={6.4} fill={stroke} />
      {(pose.dots || []).map(([x, y, r], i) => (
        <circle key={`d${i}`} cx={x} cy={y} r={r} fill={stroke} opacity={0.9} />
      ))}
    </svg>
  );
}

export default function MachinePlate({
  machineId,
  number,
  name,
  weight,
  reps,
  unit,
  pb,
  meta,
}: {
  machineId: string;
  number: string;
  name: string;
  weight: string;
  reps: number;
  unit: string;
  pb: boolean;
  meta?: string;
}) {
  const art = machineArt(machineId);
  const [a, b, c] = art.tone.disc;
  return (
    <div
      className={`fx-plate m-${art.motif} t-${art.toneName}`}
      style={{ ["--d1" as string]: a, ["--d2" as string]: b, ["--d3" as string]: c, ["--acc" as string]: art.tone.accent }}
    >
      <span className="fx-plate-no" aria-hidden="true">
        {number}
      </span>
      <span className="fx-plate-disc" aria-hidden="true" />
      {poseSvg(machineId, art.toneName === "paper" ? "#202018" : "#ffffff")}
      <div className="fx-plate-copy">
        <span className={`fx-plate-tag${pb ? " pb" : ""}`}>{pb ? "New PB" : "Best set"}</span>
        <span className="fx-plate-name">{name}</span>
        <span className="fx-plate-lift" aria-hidden="true">
          <b className="num">{weight}</b>
          <small>{unit.toLowerCase()}</small>
          <i aria-hidden="true">×</i>
          <b className="num">{reps}</b>
        </span>
        <span className="sr-only">
          {weight} {unit} times {reps}
        </span>
        {meta && <span className="fx-plate-meta">{meta}</span>}
      </div>
    </div>
  );
}
