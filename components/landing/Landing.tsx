"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BoltMark from "@/components/BoltMark";
import Icon from "@/components/Icon";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { fetchTvData, type TvActivity } from "@/lib/data";
import { fmtKg } from "@/lib/tvCopy";
import { BIJLEE_HANDLE, BIJLEE_INSTAGRAM, BIJLEE_URL, GYM_NAME, LANDING_PHOTOS } from "@/lib/site";
import { BoardScreen, HeroScreen, LogScreen, PbScreen, Phone, TapScreen } from "@/components/landing/Screens";
import TvPreview from "@/components/landing/TvPreview";
import "./landing.css";

type Gsap = typeof import("gsap").gsap;

const STEPS = [
  {
    no: "01",
    title: "Tap the sticker",
    body: "Every machine has a Racked sticker. Hold your phone to it, or scan its QR. The machine unlocks for you: no app, no typing.",
  },
  {
    no: "02",
    title: "Log in two taps",
    body: "Your last weight and reps are already filled in. Nudge the number, hit Log set, done. The rest timer starts on its own.",
  },
  {
    no: "03",
    title: "Beat your best",
    body: "Lift more than last time and the screen goes off. PBs, XP, levels and streaks, kept for every machine.",
  },
  {
    no: "04",
    title: "Get on the board",
    body: "Your best lift lands on the gym leaderboard and the TV on the wall. First name only.",
  },
];

const FEATURES = [
  {
    no: "01",
    title: "Streaks, levels, PBs",
    body: "Every machine keeps your personal best and your level. Show up on back-to-back days and your streak grows.",
  },
  {
    no: "02",
    title: "Fair play, built in",
    body: "Impossible weights are blocked before they're saved, and anything suspicious goes to gym staff to review. The board stays honest.",
  },
  {
    no: "03",
    title: "Private by default",
    body: "Other members and the TV see your first name and your best lift. Never your email. Your photos stay yours unless you share them.",
  },
  {
    no: "04",
    title: "No app store",
    body: "It's a website that installs like an app. Any phone works: tap the NFC sticker or scan the QR next to it.",
  },
];

const FAQ = [
  { q: "Is it free?", a: "Yes. Racked is free for members." },
  {
    q: "Do I need to download an app?",
    a: "No. Racked is a website. Add it to your home screen if you like and it opens full screen, just like an app.",
  },
  {
    q: "Where can I use it?",
    a: `${GYM_NAME ? `At ${GYM_NAME}, Pune,` : "At our partner gym in Pune,"} on every machine with a Racked sticker. More gyms soon.`,
  },
  {
    q: "What shows up on the gym TV?",
    a: "Your first name and your best lift on each machine, plus anonymous gym totals. Never your email, photos or Instagram.",
  },
  {
    q: "Does tapping work on iPhone?",
    a: "Yes. iPhone XS and newer read the sticker: hold the top of the phone to it. Every machine also has a QR code any phone camera can scan.",
  },
  {
    q: "How do I delete my data?",
    a: "Settings → Delete account. It removes your sets, PBs, photos and everything else, for good.",
  },
];

function Arrow() {
  return (
    <svg className="lp-arrow" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12h15M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" />
    </svg>
  );
}

// The one big button. Signed out: straight to Google, then the short welcome
// for new members, then the app. Signed in: into the app.
function StartButton({ testId, size = "lg" }: { testId: string; size?: "lg" | "sm" }) {
  const { session, signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  const cls = `lp-cta${size === "sm" ? " lp-cta-sm" : ""}`;
  if (session) {
    return (
      <Link href="/home" className={cls} data-testid={testId}>
        <span>
          Open Racked <Arrow />
        </span>
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={cls}
      data-testid={testId}
      disabled={busy}
      onClick={async () => {
        if (busy) return;
        setBusy(true);
        try {
          await signInWithGoogle("/home");
        } finally {
          setTimeout(() => setBusy(false), 4000);
        }
      }}
    >
      <span>
        {/* one text item, so the flex gap only sits before the arrow */}
        <span>
          {busy ? (
            "Opening Google…"
          ) : size === "sm" ? (
            <>
              Start<span className="lp-hide-xs"> lifting</span>
            </>
          ) : (
            "Start lifting — it's free"
          )}
        </span>
        <Arrow />
      </span>
    </button>
  );
}

function tickerItems(live: TvActivity | null | "error"): string[] {
  const where = GYM_NAME ? `Live today at ${GYM_NAME}` : "Live today at the gym";
  if (live && live !== "error") {
    if (live.sets === 0) {
      return [where, "Nobody has lifted yet", "Your first set takes #1", "Tap. Lift. Get on the board."];
    }
    const items = [
      where,
      `${live.lifters} ${live.lifters === 1 ? "lifter" : "lifters"}`,
      `${live.sets} sets`,
      `${fmtKg(live.volume)} kg moved`,
      `${live.pbs} new ${live.pbs === 1 ? "PB" : "PBs"}`,
    ];
    if (live.machines[0]) items.push(`Busiest: ${live.machines[0].title}`);
    return items;
  }
  return ["Tap. Lift. Get on the board.", "Free · no download", "Built by Bijlee Run Club", "Pune"];
}

export default function Landing({ redirectMembers = false }: { redirectMembers?: boolean }) {
  const { session, loading } = useAuth();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const rootRef = useRef<HTMLDivElement>(null);
  const gsapRef = useRef<Gsap | null>(null);
  const reduceRef = useRef(false);
  const [live, setLive] = useState<TvActivity | null | "error">(null);
  const [step, setStep] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  // flips once GSAP is in, so the step that's already on screen gets its animation
  const [motionReady, setMotionReady] = useState(false);

  // "/" is for visitors; the middleware already sends members to /home, this
  // catches the case where it couldn't check the session.
  useEffect(() => {
    if (redirectMembers && !loading && session) router.replace("/home");
  }, [redirectMembers, loading, session, router]);

  useEffect(() => {
    let alive = true;
    fetchTvData(supabase, "today", 3)
      .then((d) => alive && setLive(d.activity))
      .catch(() => alive && setLive("error"));
    return () => {
      alive = false;
    };
  }, [supabase]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ---- which walkthrough step is on screen: the marker crossing the middle
  // of the viewport. Works without GSAP, so reduced motion still steps through.
  useEffect(() => {
    const markers = Array.from(document.querySelectorAll<HTMLElement>("[data-step-marker]"));
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setStep(Number((e.target as HTMLElement).dataset.stepMarker));
        });
      },
      { rootMargin: "-50% 0px -50% 0px" }
    );
    markers.forEach((m) => io.observe(m));
    return () => io.disconnect();
  }, []);

  const goToStep = useCallback((i: number) => {
    const m = document.querySelector<HTMLElement>(`[data-step-marker="${i}"]`);
    if (!m) return;
    const top = m.getBoundingClientRect().top + window.scrollY + 2;
    window.scrollTo({ top, behavior: reduceRef.current ? "auto" : "smooth" });
  }, []);

  // ---- GSAP: only on this page, and only once the visitor starts to
  // scroll or interact (or after a few seconds), so it never slows the first
  // screen. The hero's own motion is plain CSS.
  useEffect(() => {
    reduceRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceRef.current) return;
    let cancelled = false;
    let revert: (() => void) | undefined;
    const wakeEvents = ["scroll", "pointerdown", "pointermove", "touchstart", "keydown", "wheel"] as const;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      wakeEvents.forEach((e) => window.removeEventListener(e, start));
      clearTimeout(timer);
      load();
    };
    wakeEvents.forEach((e) => window.addEventListener(e, start, { passive: true, once: true }));
    timer = setTimeout(start, 3500);
    async function load() {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([import("gsap"), import("gsap/ScrollTrigger")]);
      if (cancelled || !rootRef.current) return;
      gsap.registerPlugin(ScrollTrigger);
      gsapRef.current = gsap;
      const ctx = gsap.context(() => {
        // section headlines: each line rises out of its own mask with a skew
        gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
          gsap.from(el.querySelectorAll(".lp-line > span"), {
            yPercent: 110,
            skewY: 7,
            duration: 0.9,
            ease: "expo.out",
            stagger: 0.08,
            scrollTrigger: { trigger: el, start: "top 82%", once: true },
          });
        });
        // feature rows: the rule draws across, then the number snaps in
        gsap.utils.toArray<HTMLElement>(".lp-feature").forEach((row) => {
          const tl = gsap.timeline({ scrollTrigger: { trigger: row, start: "top 85%", once: true } });
          tl.from(row.querySelector(".lp-feature-rule"), { scaleX: 0, transformOrigin: "0 50%", duration: 0.7, ease: "expo.out" })
            .from(row.querySelector(".lp-feature-no"), { xPercent: -30, opacity: 0, duration: 0.5, ease: "power3.out" }, "-=0.45")
            .from(row.querySelectorAll(".lp-feature-copy > *"), { y: 18, opacity: 0, duration: 0.5, stagger: 0.06, ease: "power3.out" }, "-=0.35");
        });
        // Bijlee slab: words slam in
        gsap.from(".lp-club-head .w", {
          scale: 1.35,
          opacity: 0,
          skewX: -12,
          duration: 0.55,
          ease: "power4.out",
          stagger: 0.07,
          scrollTrigger: { trigger: ".lp-club", start: "top 70%", once: true },
        });
        gsap.from(".lp-club-bolt", {
          rotate: -24,
          scale: 0.6,
          opacity: 0,
          duration: 0.6,
          ease: "back.out(2.2)",
          scrollTrigger: { trigger: ".lp-club", start: "top 70%", once: true },
        });
        // the footer wordmark rises letter by letter
        gsap.from(".lp-giant span", {
          yPercent: 100,
          duration: 0.8,
          ease: "expo.out",
          stagger: 0.05,
          scrollTrigger: { trigger: ".lp-giant", start: "top 92%", once: true },
        });
        // hero phone drifts up a little as you scroll away
        gsap.to(".lp-hero-phone", {
          yPercent: -10,
          rotate: -2,
          ease: "none",
          scrollTrigger: { trigger: ".lp-hero", start: "top top", end: "bottom top", scrub: true },
        });
        // the live ticker leans into the scroll, like a broadcast strap
        const lean = gsap.quickTo(".lp-ticker-band", "skewY", { duration: 0.5, ease: "power3.out" });
        ScrollTrigger.create({
          trigger: ".lp-ticker",
          start: "top bottom",
          end: "bottom top",
          onUpdate: (self) => lean(gsap.utils.clamp(-3, 3, self.getVelocity() / -500) - 1.5),
        });
        // ...and settles back when the scrolling stops
        const settle = () => {
          lean(-1.5);
        };
        ScrollTrigger.addEventListener("scrollEnd", settle);
        return () => ScrollTrigger.removeEventListener("scrollEnd", settle);
      }, rootRef);
      revert = () => ctx.revert();
      setMotionReady(true);
    }
    return () => {
      cancelled = true;
      wakeEvents.forEach((e) => window.removeEventListener(e, start));
      clearTimeout(timer);
      revert?.();
    };
  }, []);

  // ---- per-step phone animations (play into each screen's finished state)
  useEffect(() => {
    const gsap = gsapRef.current;
    const root = rootRef.current;
    if (!gsap || !root || reduceRef.current) return;
    const scr = root.querySelector<HTMLElement>(`.lp-story [data-screen="${step}"]`);
    if (!scr) return;
    const q = gsap.utils.selector(scr);
    const tl = gsap.timeline();
    const cleanups: (() => void)[] = [];
    if (step === 0) {
      tl.fromTo(q(".ps-ring"), { scale: 0.6, opacity: 0.9 }, { scale: 2.4, opacity: 0, duration: 1.3, stagger: 0.28, ease: "power2.out", repeat: 1 })
        .fromTo(q(".ps-nfc-core"), { scale: 0.85 }, { scale: 1, duration: 0.4, ease: "back.out(3)" }, 0)
        .fromTo(q(".ps-unlocked"), { y: 14, opacity: 0, scale: 0.9 }, { y: 0, opacity: 1, scale: 1, duration: 0.45, ease: "back.out(2.4)" }, 0.9)
        .fromTo(q(".ps-tap-note, .ps-cta"), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.08 }, 1.15);
      const sticker = root.querySelector(".lp-sticker");
      if (sticker) tl.fromTo(sticker, { x: -30, rotate: -8 }, { x: 0, rotate: -4, duration: 0.6, ease: "power3.out" }, 0);
    } else if (step === 1) {
      const val = { v: 57.5 };
      const weight = q(".ps-weight-val")[0];
      const ctaKg = q(".ps-cta-kg")[0];
      const finger = q(".ps-finger")[0];
      const plus = q(".ps-plus")[0];
      const cta = q(".ps-log-cta")[0];
      if (finger && plus && cta) {
        // finger positions measured from the real layout (it scales with the phone)
        const s0 = scr.getBoundingClientRect();
        const at = (el: Element) => {
          const r = el.getBoundingClientRect();
          return { x: r.left - s0.left + r.width / 2 - finger.offsetWidth / 2, y: r.top - s0.top + r.height / 2 - finger.offsetHeight / 2 };
        };
        const p1 = at(plus);
        const p2 = at(cta);
        tl.fromTo(finger, { x: p1.x + 40, y: p1.y + 120, opacity: 0 }, { x: p1.x, y: p1.y, opacity: 1, duration: 0.45, ease: "power3.out" })
          .to(plus, { scale: 0.86, duration: 0.09, yoyo: true, repeat: 1 })
          .fromTo(
            val,
            { v: 57.5 },
            {
              v: 60,
              duration: 0.35,
              ease: "steps(2)",
              onUpdate: () => {
                const t = String(Math.round(val.v * 2) / 2);
                if (weight) weight.textContent = t;
                if (ctaKg) ctaKg.textContent = t;
              },
            },
            "<"
          )
          .to(finger, { x: p2.x, y: p2.y, duration: 0.5, ease: "power3.inOut" }, "+=0.25")
          .to(cta, { scale: 0.95, duration: 0.1, yoyo: true, repeat: 1 })
          .to(cta, { backgroundColor: "#f4b424", duration: 0.15 }, "<")
          .to(cta, { backgroundColor: "#ff482c", duration: 0.4 })
          .to(finger, { opacity: 0, duration: 0.25 }, "<");
        cleanups.push(() => {
          if (weight) weight.textContent = "60";
          if (ctaKg) ctaKg.textContent = "60";
        });
      }
    } else if (step === 2) {
      const xp = { v: 0 };
      const xpEl = q(".ps-xp-val")[0];
      tl.fromTo(scr, { backgroundColor: "#f4b424" }, { backgroundColor: "#ff482c", duration: 0.35, ease: "power2.out" })
        .fromTo(q(".ps-pb-big"), { scale: 2.2, skewX: -18, opacity: 0 }, { scale: 1, skewX: 0, opacity: 1, duration: 0.5, ease: "power4.out" }, 0)
        .fromTo(q(".ps-pb-new, .ps-pb-lift, .ps-pb-prev"), { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, stagger: 0.07 }, 0.25)
        .fromTo(
          q(".ps-confetti i"),
          { x: 0, y: 0, rotate: 0, opacity: 1 },
          {
            x: () => gsap.utils.random(-120, 120),
            y: () => gsap.utils.random(-170, 40),
            rotate: () => gsap.utils.random(-260, 260),
            opacity: 0,
            duration: 1.3,
            ease: "power3.out",
            stagger: 0.012,
          },
          0.1
        )
        .fromTo(
          xp,
          { v: 0 },
          {
            v: 60,
            duration: 0.8,
            ease: "power2.out",
            onUpdate: () => {
              if (xpEl) xpEl.textContent = String(Math.round(xp.v));
            },
          },
          0.45
        )
        .fromTo(q(".ps-level-fill"), { scaleX: 0.4 }, { scaleX: 0.78, duration: 0.9, ease: "expo.out" }, 0.5);
    } else if (step === 3) {
      const rows = q(".ps-row");
      // distance between two rows, measured (it scales with the phone)
      const pitch = rows[1] && rows[0] ? rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().top : 40;
      const ranks = q(".ps-rank");
      const finalRanks = ranks.map((r) => r.textContent);
      ["3", "1", "2", "4"].forEach((t, i) => ranks[i] && (ranks[i].textContent = t));
      cleanups.push(() => finalRanks.forEach((t, i) => ranks[i] && (ranks[i].textContent = t)));
      tl.fromTo(q('[data-row="me"]'), { y: 2 * pitch }, { y: 0, duration: 0.8, ease: "expo.inOut" }, 0.35)
        .fromTo(q('[data-row="asha"], [data-row="rahul"]'), { y: -pitch }, { y: 0, duration: 0.8, ease: "expo.inOut" }, 0.35)
        .add(() => finalRanks.forEach((t, i) => ranks[i] && (ranks[i].textContent = t)), 0.75)
        .fromTo(q('[data-row="me"]'), { boxShadow: "0 0 0 0 rgba(244,180,36,0)" }, { boxShadow: "0 0 0 0.3em rgba(244,180,36,0.45)", duration: 0.3, yoyo: true, repeat: 1 }, 1.1)
        .fromTo(q(".ps-tv-badge"), { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "back.out(2)" }, 1.2);
    }
    // leaving a step: jump its animation to the end so the screen is in its
    // finished state if you scroll back
    return () => {
      tl.progress(1).kill();
      cleanups.forEach((fn) => fn());
    };
  }, [step, motionReady]);

  const ticker = tickerItems(live);

  return (
    <div className="lp" ref={rootRef} data-testid="landing">
      <div className="lp-grain" aria-hidden="true" />

      <header className={`lp-nav${scrolled ? " solid" : ""}`}>
        <Link href="/" className="lp-lockup" aria-label="Racked by Bijlee Run Club">
          <BoltMark className="lp-lockup-bolt" />
          <span className="lp-lockup-word">Racked</span>
          <span className="lp-lockup-by">× Bijlee Run Club</span>
        </Link>
        <nav className="lp-nav-links" aria-label="Landing">
          <a href="#how">How it works</a>
          <a href="#tv">Gym TV</a>
          <a href="#faq">FAQ</a>
        </nav>
        <StartButton testId="lp-nav-cta" size="sm" />
      </header>

      {/* ---------------------------------------------------------------- hero */}
      <section className="lp-hero" aria-labelledby="lp-hero-title">
        <svg className="lp-strike" viewBox="0 0 1630 1630" aria-hidden="true">
          <path d="M598 441L1368 439L1200 655L1290 659L1237 812L315 1239L684 775L482 775Z" />
          <path className="y" d="M598 441L232 905L431 905L315 1239L684 775L482 775Z" />
        </svg>
        <div className="lp-flash" aria-hidden="true" />
        <div className="lp-wrap lp-hero-grid">
          <div className="lp-hero-copy">
            <p className="lp-kicker">
              <i className="lp-live-dot" /> Racked by Bijlee Run Club · Pune
            </p>
            <h1 id="lp-hero-title" className="lp-hero-title">
              <span className="l1">Tap. Lift.</span>
              <span className="l2">Get on</span>
              <span className="l3">
                the <em>board.</em>
              </span>
            </h1>
            <p className="lp-lede">
              The gym app with nothing to download. Tap the Racked sticker on any machine, log your set in two taps, and
              watch your name climb the gym TV.
            </p>
            <div className="lp-hero-actions">
              <StartButton testId="lp-hero-cta" />
              <a href="#how" className="lp-textlink">
                See how it works <span aria-hidden="true">↓</span>
              </a>
            </div>
            <p className="lp-fine">Free · No download · One-tap Google sign-in</p>
          </div>
          <div className="lp-hero-visual">
            <div className="lp-hero-phone">
              <Phone>
                <HeroScreen />
              </Phone>
            </div>
            <div className="lp-hero-tag" aria-hidden="true">
              <span>PB</span> 60 kg × 8
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- live ticker */}
      <div className="lp-ticker" data-testid="lp-ticker">
        <div className="lp-ticker-band">
          <p className="sr-only">{ticker.join(". ")}</p>
          <div className="lp-ticker-track" aria-hidden="true">
            {[0, 1].map((copy) => (
              <div className="lp-ticker-run" key={copy}>
                {[...ticker, ...ticker].map((t, i) => (
                  <span key={i}>
                    {i % ticker.length === 0 && <i className="lp-live-dot ink" />}
                    {t}
                    <BoltMark className="lp-ticker-bolt" />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------- how it works */}
      <section className="lp-story" id="how" aria-labelledby="lp-how-title">
        <div className="lp-wrap lp-section-head" data-reveal>
          <p className="lp-label">How it works · 4 steps · about 20 seconds</p>
          <h2 id="lp-how-title" className="lp-h2">
            <span className="lp-line">
              <span>From tap</span>
            </span>
            <span className="lp-line">
              <span>
                to <em>leaderboard.</em>
              </span>
            </span>
          </h2>
        </div>
        <div className="lp-story-track">
          {STEPS.map((_, i) => (
            <div key={i} className="lp-story-marker" data-step-marker={i} style={{ top: `${i * 25}%` }} aria-hidden="true" />
          ))}
          <div className="lp-story-stage">
            <div className="lp-wrap lp-story-grid">
              <ol className="lp-steps" data-testid="lp-steps">
                {STEPS.map((s, i) => (
                  <li key={s.no} className={i === step ? "on" : ""} aria-current={i === step ? "step" : undefined}>
                    <button type="button" onClick={() => goToStep(i)} className="lp-step-btn">
                      <span className="lp-step-no">{s.no}</span>
                      <span className="lp-step-title">{s.title}</span>
                    </button>
                    <p className="lp-step-body">{s.body}</p>
                  </li>
                ))}
              </ol>
              <div className="lp-story-visual" data-step={step}>
                <div className="lp-sticker" aria-hidden="true">
                  <BoltMark className="lp-sticker-bolt" />
                  <b>Tap here</b>
                  <span>Lat Pulldown · 01</span>
                </div>
                <Phone className="lp-story-phone">
                  <TapScreen on={step === 0} />
                  <LogScreen on={step === 1} />
                  <PbScreen on={step === 2} />
                  <BoardScreen on={step === 3} />
                </Phone>
                <div className="lp-step-meter" aria-hidden="true">
                  <span>{STEPS[step].no}</span>
                  <i>
                    <b style={{ transform: `scaleY(${(step + 1) / STEPS.length})` }} />
                  </i>
                  <span>04</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="lp-wrap lp-story-cta">
          <StartButton testId="lp-mid-cta" />
        </div>
      </section>

      {/* ---------------------------------------------------------- gym TV */}
      <section className="lp-tv" id="tv" aria-labelledby="lp-tv-title">
        <div className="lp-wrap">
          <div className="lp-section-head" data-reveal>
            <p className="lp-label">
              <i className="lp-live-dot" /> Live · the gym TV
            </p>
            <h2 id="lp-tv-title" className="lp-h2">
              <span className="lp-line">
                <span>The TV on the wall</span>
              </span>
              <span className="lp-line">
                <span>does the</span>
              </span>
              <span className="lp-line">
                <span>
                  <em>recruiting.</em>
                </span>
              </span>
            </h2>
          </div>
          <TvPreview />
          <ul className="lp-tv-facts">
            <li>
              <b>Scan-to-join QR</b>
              <span>on every slide, so anyone on the floor can start in seconds</span>
            </li>
            <li>
              <b>Today&rsquo;s kg, live</b>
              <span>the whole gym&rsquo;s total, counted up as people lift</span>
            </li>
            <li>
              <b>A podium per machine</b>
              <span>&ldquo;Think you can beat Asha?&rdquo; with open spots for whoever&rsquo;s next</span>
            </li>
          </ul>
        </div>
      </section>

      {/* ------------------------------------------------ what makes it work */}
      <section className="lp-features" aria-labelledby="lp-features-title">
        <div className="lp-wrap lp-features-grid">
          <div className="lp-section-head lp-sticky-head" data-reveal>
            <p className="lp-label">Under the hood</p>
            <h2 id="lp-features-title" className="lp-h2">
              <span className="lp-line">
                <span>Built to</span>
              </span>
              <span className="lp-line">
                <span>keep you</span>
              </span>
              <span className="lp-line">
                <span>
                  <em>coming back.</em>
                </span>
              </span>
            </h2>
          </div>
          <ol className="lp-feature-list">
            {FEATURES.map((f) => (
              <li className="lp-feature" key={f.no}>
                <i className="lp-feature-rule" aria-hidden="true" />
                <span className="lp-feature-no" aria-hidden="true">
                  {f.no}
                </span>
                <div className="lp-feature-copy">
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------ Bijlee Run Club */}
      <section className="lp-club" aria-labelledby="lp-club-title">
        <div className="lp-wrap lp-club-grid">
          <div>
            <p className="lp-label ink">Built by Bijlee Run Club · Pune</p>
            <h2 id="lp-club-title" className="lp-club-head">
              <span className="w">Community</span> <span className="w">first.</span>{" "}
              <span className="w">Competition</span> <span className="w">second.</span>
            </h2>
          </div>
          <div className="lp-club-side">
            <BoltMark className="lp-club-bolt" title="Bijlee Run Club" />
            <p>
              Racked is made by Bijlee Run Club, Pune&rsquo;s running crew. We bring the same energy from the city&rsquo;s
              streets to the weights floor: show up, beat your last effort, cheer on the next person.
            </p>
            <div className="lp-club-links">
              <a href={BIJLEE_URL} target="_blank" rel="noopener noreferrer" className="lp-pill">
                bijlee.run <span aria-hidden="true">↗</span>
              </a>
              <a href={BIJLEE_INSTAGRAM} target="_blank" rel="noopener noreferrer" className="lp-pill">
                <Icon name="instagram" /> {BIJLEE_HANDLE} <span aria-hidden="true">↗</span>
              </a>
            </div>
            <p className="lp-club-owners">
              Run a gym in Pune and want Racked on your floor?{" "}
              <a href={BIJLEE_INSTAGRAM} target="_blank" rel="noopener noreferrer">
                DM {BIJLEE_HANDLE}
              </a>
              .
            </p>
          </div>
        </div>
        {LANDING_PHOTOS.length > 0 && (
          <div className="lp-photos">
            {LANDING_PHOTOS.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={p.src} src={p.src} alt={p.alt} loading="lazy" />
            ))}
          </div>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="lp-club-wordmark" src="/brand/bijlee-wordmark-ink.png" alt="Bijlee Run Club" width={1180} height={357} loading="lazy" />
      </section>

      {/* ------------------------------------------------------------- FAQ */}
      <section className="lp-faq" id="faq" aria-labelledby="lp-faq-title">
        <div className="lp-wrap lp-faq-grid">
          <div className="lp-section-head" data-reveal>
            <p className="lp-label">FAQ</p>
            <h2 id="lp-faq-title" className="lp-h2">
              <span className="lp-line">
                <span>Questions,</span>
              </span>
              <span className="lp-line">
                <span>
                  <em>answered.</em>
                </span>
              </span>
            </h2>
          </div>
          <div className="lp-faq-list">
            {FAQ.map((f) => (
              <details key={f.q} className="lp-qa">
                <summary>
                  {f.q}
                  <span className="lp-qa-plus" aria-hidden="true" />
                </summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ final CTA */}
      <section className="lp-final" aria-labelledby="lp-final-title">
        <div className="lp-wrap">
          <h2 id="lp-final-title" className="lp-final-title" data-reveal>
            <span className="lp-line">
              <span>Your name.</span>
            </span>
            <span className="lp-line">
              <span>
                On the <em>board.</em>
              </span>
            </span>
          </h2>
          <div className="lp-final-row">
            <StartButton testId="lp-final-cta" />
            <p className="lp-fine">Free for members · works on any phone</p>
          </div>
        </div>
        <div className="lp-giant" aria-hidden="true">
          {"RACKED".split("").map((c, i) => (
            <span key={i}>{c}</span>
          ))}
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-row">
          <span className="lp-footer-lockup">
            <BoltMark className="lp-lockup-bolt" /> Racked × Bijlee Run Club · Pune
          </span>
          <nav aria-label="Footer">
            <Link href="/privacy">Privacy</Link>
            <a href={BIJLEE_INSTAGRAM} target="_blank" rel="noopener noreferrer">
              Instagram
            </a>
            <a href={BIJLEE_URL} target="_blank" rel="noopener noreferrer">
              bijlee.run
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
