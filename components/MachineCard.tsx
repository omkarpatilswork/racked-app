import Link from "next/link";
import Icon from "@/components/Icon";
import type { Machine } from "@/lib/machines";

export default function MachineCard({
  machine,
  unlocked,
  showLock,
  pb,
}: {
  machine: Machine;
  // "unlocked" = you've logged at least one set on it
  unlocked?: boolean;
  showLock?: boolean;
  pb?: string | null;
}) {
  return (
    <Link href={`/machine/${machine.id}`} className="machine-card" data-testid="machine-card">
      <div className={`thumb${unlocked ? " done" : ""}`} aria-hidden="true">
        {machine.number}
        {showLock && unlocked && (
          <div className="lockdot">
            <Icon name="check" />
          </div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="title">{machine.name}</div>
        <div className="sub">{machine.muscles.slice(0, 3).join(" · ")}</div>
      </div>
      {pb ? (
        <span className="pill" style={{ fontFamily: "var(--font-mono)" }}>
          {pb}
        </span>
      ) : (
        <div className="chev">
          <Icon name="chev" />
        </div>
      )}
    </Link>
  );
}
