import Link from "next/link";
import Icon from "@/components/Icon";
import type { Machine } from "@/lib/machines";

// Shown in place of a machine's pages when you haven't tapped its NFC
// sticker yet -- see lib/machineLock.ts for how a tap is recognized.
export default function LockedMachine({ machine }: { machine: Machine }) {
  return (
    <>
      <div className="topbar">
        <Link href="/machines" className="iconbtn" aria-label="Back">
          <Icon name="back" />
        </Link>
        <div style={{ width: 38 }} />
      </div>
      <div className="stack-lg center" style={{ paddingTop: 50 }}>
        <div className="glyph-lg" style={{ width: 56, height: 56, margin: "0 auto", color: "var(--ink-faint)" }}>
          <Icon name="lock" />
        </div>
        <h2 style={{ margin: "14px 0 4px" }}>Tap in to {machine.name}</h2>
        <p className="muted" style={{ maxWidth: 280, margin: "0 auto" }}>
          To keep the leaderboard honest, tap this machine&rsquo;s NFC sticker with your phone before logging a set here.
        </p>
        <p className="faint" style={{ fontSize: 12.5, marginTop: 10 }}>
          Standing at it right now? Tap the sticker on the machine itself — this page can&rsquo;t unlock on its own.
        </p>
      </div>
    </>
  );
}
