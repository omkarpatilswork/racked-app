import Topbar from "@/components/Topbar";
import MachineCard from "@/components/MachineCard";
import { MACHINES } from "@/lib/machines";

export default function DemoPage() {
  return (
    <>
      <Topbar />
      <div className="stack-lg">
        <div className="center" style={{ padding: "6px 0 2px" }}>
          <div className="eyebrow">Demo mode</div>
          <h1 style={{ fontSize: 22, margin: "6px 0 4px" }}>Choose a machine</h1>
          <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>
            Simulates tapping that machine&rsquo;s NFC sticker
          </p>
        </div>
        <div className="stack">
          {MACHINES.map((m) => (
            <MachineCard key={m.id} machine={m} />
          ))}
        </div>
      </div>
    </>
  );
}
