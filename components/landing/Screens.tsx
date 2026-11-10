// Small, coded versions of the real Racked screens, drawn inside the phone
// on the landing page. They're built from HTML (not screenshots) so they stay
// sharp at any size and can be animated step by step. Every screen's CSS is
// its finished state; the landing page's motion only animates INTO it, so
// with reduced motion (or before GSAP loads) each screen still reads right.
import BoltMark from "@/components/BoltMark";
import Icon from "@/components/Icon";

function StatusBar() {
  return (
    <div className="ps-status">
      <span>9:41</span>
      <span className="ps-status-ic">
        <i />
        <i />
        <i />
      </span>
    </div>
  );
}

function AppBar({ title }: { title?: string }) {
  return (
    <div className="ps-appbar">
      {title ? (
        <>
          <span className="ps-back">
            <Icon name="back" />
          </span>
          <span className="ps-appbar-title">{title}</span>
          <span style={{ width: "2.8em" }} />
        </>
      ) : (
        <span className="ps-lockup">
          <BoltMark className="ps-bolt" />
          RACKED
          <small>× BIJLEE</small>
        </span>
      )}
    </div>
  );
}

// Hero: the Lat Pulldown machine page, with "You" on top of today's board.
export function HeroScreen() {
  return (
    <div className="ps ps-hero on">
      <StatusBar />
      <AppBar />
      <div className="ps-eyebrow">Machine 01 · Back</div>
      <div className="ps-hero-no">01</div>
      <div className="ps-title">Lat Pulldown</div>
      <div className="ps-card ps-pb">
        <span className="ps-label">Your PB</span>
        <b>
          60<small>kg</small> × 8
        </b>
        <span className="ps-up">▲ 2.5 kg on last week</span>
      </div>
      <div className="ps-mini-board">
        <div className="ps-mini-row me">
          <span>1</span>
          <b>You</b>
          <em>60 × 8</em>
        </div>
        <div className="ps-mini-row">
          <span>2</span>
          <b>Asha</b>
          <em>57.5 × 8</em>
        </div>
        <div className="ps-mini-row">
          <span>3</span>
          <b>Rahul</b>
          <em>55 × 10</em>
        </div>
      </div>
      <div className="ps-cta">Log a set</div>
    </div>
  );
}

// Step 1: tap the sticker, the machine unlocks.
export function TapScreen({ on }: { on: boolean }) {
  return (
    <div className={`ps ps-tap${on ? " on" : ""}`} data-screen="0">
      <StatusBar />
      <AppBar />
      <div className="ps-eyebrow">Machine 01 · Back</div>
      <div className="ps-title">Lat Pulldown</div>
      <div className="ps-nfc">
        <i className="ps-ring" />
        <i className="ps-ring" />
        <i className="ps-ring" />
        <span className="ps-nfc-core">
          <Icon name="nfc" />
        </span>
      </div>
      <div className="ps-unlocked">
        <Icon name="check" /> Unlocked
      </div>
      <div className="ps-tap-note">Tapped via NFC · logging open for 4 hours</div>
      <div className="ps-cta">Log a set</div>
    </div>
  );
}

// Step 2: weight and reps prefilled from last time; nudge, log.
export function LogScreen({ on }: { on: boolean }) {
  return (
    <div className={`ps ps-log${on ? " on" : ""}`} data-screen="1">
      <StatusBar />
      <AppBar title="Lat Pulldown" />
      <div className="ps-chip-row">
        <span className="ps-chip">Last 57.5 × 8</span>
        <span className="ps-chip">PB 57.5 × 8</span>
      </div>
      <div className="ps-field">
        <span className="ps-label">Weight</span>
        <div className="ps-stepper">
          <span className="ps-step-btn">−</span>
          <b className="ps-weight">
            <span className="ps-weight-val">60</span>
            <small>kg</small>
          </b>
          <span className="ps-step-btn ps-plus">+</span>
        </div>
      </div>
      <div className="ps-field">
        <span className="ps-label">Reps</span>
        <div className="ps-stepper">
          <span className="ps-step-btn">−</span>
          <b className="ps-weight">8</b>
          <span className="ps-step-btn">+</span>
        </div>
      </div>
      <div className="ps-cta ps-log-cta">
        <span>
          Log set · <span className="ps-cta-kg">60</span> kg × 8
        </span>
      </div>
      <i className="ps-finger" />
    </div>
  );
}

const CONFETTI = Array.from({ length: 14 }, (_, i) => i);

// Step 3: a new personal best.
export function PbScreen({ on }: { on: boolean }) {
  return (
    <div className={`ps ps-pb-screen${on ? " on" : ""}`} data-screen="2">
      <StatusBar />
      <div className="ps-confetti" aria-hidden="true">
        {CONFETTI.map((i) => (
          <i key={i} className={`c${i % 4}`} />
        ))}
      </div>
      <div className="ps-pb-new">New</div>
      <div className="ps-pb-big">PB</div>
      <div className="ps-pb-lift">
        60<small>kg</small> × 8
      </div>
      <div className="ps-pb-prev">was 57.5 kg × 8</div>
      <div className="ps-xp">
        +<span className="ps-xp-val">60</span> XP
      </div>
      <div className="ps-level">
        <span>Level 4</span>
        <i>
          <b className="ps-level-fill" />
        </i>
      </div>
      <div className="ps-cta ps-cta-ink">Keep going</div>
    </div>
  );
}

// Step 4: you move up today's board (and onto the gym TV).
export function BoardScreen({ on }: { on: boolean }) {
  return (
    <div className={`ps ps-board${on ? " on" : ""}`} data-screen="3">
      <StatusBar />
      <AppBar />
      <div className="ps-eyebrow">Today&rsquo;s board</div>
      <div className="ps-title">Lat Pulldown</div>
      <div className="ps-rows">
        <div className="ps-row me" data-row="me">
          <span className="ps-rank">1</span>
          <b>You</b>
          <em>60 kg × 8</em>
        </div>
        <div className="ps-row" data-row="asha">
          <span className="ps-rank">2</span>
          <b>Asha</b>
          <em>57.5 kg × 8</em>
        </div>
        <div className="ps-row" data-row="rahul">
          <span className="ps-rank">3</span>
          <b>Rahul</b>
          <em>55 kg × 10</em>
        </div>
        <div className="ps-row" data-row="neha">
          <span className="ps-rank">4</span>
          <b>Neha</b>
          <em>50 kg × 12</em>
        </div>
      </div>
      <div className="ps-tv-badge">
        <i /> Live on the gym TV
      </div>
    </div>
  );
}

export function Phone({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`lp-phone${className ? ` ${className}` : ""}`} aria-hidden="true">
      <div className="lp-phone-screen">
        <span className="lp-phone-island" />
        {children}
      </div>
    </div>
  );
}
