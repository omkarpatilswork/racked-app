import Link from "next/link";
import Icon from "@/components/Icon";
import type { Machine } from "@/lib/machines";

// Shown in place of a machine's pages when you haven't tapped its NFC
// sticker or scanned its QR code yet -- see lib/machineLock.ts for how a tap
// is recognized. Not a dead end: you can still read how to use the machine
// and see its leaderboard.
export default function LockedMachine({ machine }: { machine: Machine }) {
  return (
    <>
      <div className="topbar">
        <Link href="/machines" className="iconbtn" aria-label="All machines">
          <Icon name="back" />
        </Link>
        <div className="topbar-title">Machine {String(machine.number).padStart(2, "0")}</div>
        <div style={{ width: 42 }} />
      </div>
      <div className="page stack-lg" data-testid="locked-machine">
        <section className="hero-machine">
          <div className="eyebrow">Machine {String(machine.number).padStart(2, "0")}</div>
          <h1 style={{ fontSize: 26 }}>{machine.name}</h1>
          <p style={{ margin: 0, fontSize: 13 }}>{machine.muscles.join(" · ")}</p>
        </section>

        <section className="card">
          <div className="row" style={{ justifyContent: "flex-start", gap: 14 }}>
            <div className="tapin-icons" aria-hidden="true">
              <Icon name="lock" />
            </div>
            <div>
              <h2 style={{ fontSize: 17, margin: 0 }}>Tap in to log here</h2>
              <p className="muted" style={{ margin: "4px 0 0", fontSize: 13.5 }}>
                To keep the leaderboard honest, sets can only be logged at the machine.
              </p>
            </div>
          </div>
          <div className="stack" style={{ marginTop: 16 }}>
            <div className="ob-step">
              <div className="n">
                <Icon name="nfc" />
              </div>
              <div>
                <b>Tap the sticker</b>
                <span>Hold the top of your phone against the Racked sticker on the machine.</span>
              </div>
            </div>
            <div className="ob-step">
              <div className="n">
                <Icon name="qr" />
              </div>
              <div>
                <b>Or scan the QR code</b>
                <span>Open your camera and point it at the code next to the sticker.</span>
              </div>
            </div>
          </div>
        </section>

        <div className="stack">
          <Link href={`/machine/${machine.id}/guide`} className="action-card">
            <div className="glyph">
              <Icon name="dumbbell" />
            </div>
            <div className="body">
              <div className="title">How to use it</div>
              <div className="sub">Setup, form and common mistakes</div>
            </div>
            <div className="chev">
              <Icon name="chev" />
            </div>
          </Link>
          <Link href={`/leaderboard?tab=machines&machine=${machine.id}`} className="action-card">
            <div className="glyph">
              <Icon name="trophy" />
            </div>
            <div className="body">
              <div className="title">Leaderboard</div>
              <div className="sub">Who lifts the most on this machine</div>
            </div>
            <div className="chev">
              <Icon name="chev" />
            </div>
          </Link>
        </div>
      </div>
    </>
  );
}
