import Link from "next/link";
import Icon from "@/components/Icon";
import type { Machine } from "@/lib/machines";

export default function MachineCard({
  machine,
  unlocked,
  showLock,
}: {
  machine: Machine;
  unlocked?: boolean;
  showLock?: boolean;
}) {
  return (
    <Link href={`/machine/${machine.id}`} className="machine-card">
      <div className="thumb">
        <Icon name="dumbbell" />
        {showLock && (
          <div className="lockdot">
            <Icon name={unlocked ? "unlock" : "lock"} />
          </div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="num">Machine #{machine.number}</div>
        <div className="title">{machine.name}</div>
        <div className="sub">{machine.muscles.slice(0, 3).join(" • ")}</div>
      </div>
      <div className="chev">
        <Icon name="chev" />
      </div>
    </Link>
  );
}
