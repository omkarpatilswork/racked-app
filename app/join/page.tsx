"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Topbar from "@/components/Topbar";
import Icon from "@/components/Icon";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { fetchTvData, type TvData } from "@/lib/data";
import { MACHINES } from "@/lib/machines";

// Where the QR code on the gym TV lands (/join?src=tv). One job: turn someone
// standing on the gym floor into a member in about ten seconds, by showing
// that the gym is live right now and making sign-in a single tap.
export default function JoinPage() {
  return (
    <Suspense fallback={null}>
      <Join />
    </Suspense>
  );
}

function firstName(name?: string | null) {
  const n = (name || "").trim().split(/\s+/)[0];
  return n || "lifter";
}

function Join() {
  const { session, profile, loading, signInWithGoogle } = useAuth();
  const params = useSearchParams();
  const fromTv = params.get("src") === "tv";
  const supabase = useMemo(() => createClient(), []);
  const [live, setLive] = useState<TvData | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchTvData(supabase, "today", 3)
      .then((d) => alive && setLive(d))
      .catch(() => {
        /* the page works without the live numbers */
      });
    return () => {
      alive = false;
    };
  }, [supabase]);

  async function join() {
    if (busy) return;
    setBusy(true);
    try {
      await signInWithGoogle("/home");
    } finally {
      // the page normally navigates away to Google; if it didn't, allow a retry
      setTimeout(() => setBusy(false), 4000);
    }
  }

  return (
    <>
      <Topbar />
      <div className="page stack-lg" data-testid="join-page">
        {loading ? (
          <div aria-busy="true" aria-label="Loading">
            <div className="skeleton" style={{ height: 260, borderRadius: 28 }} />
          </div>
        ) : session ? (
          <section className="hero-machine join-hero" data-testid="join-in">
            <div className="eyebrow">You&rsquo;re in</div>
            <h1>
              Nice one, <span className="join-grad">{firstName(profile?.display_name)}</span>.
            </h1>
            <p>
              Walk up to any machine and hold your phone near the Racked sticker to log your set. Your best lift goes
              straight onto the gym TV.
            </p>
            <Link href="/home" className="btn" style={{ background: "#fff", color: "#111" }} data-testid="join-home">
              <Icon name="home" /> Go to my home
            </Link>
            <Link href="/machines" className="btn join-ghost" style={{ marginTop: 10 }}>
              <Icon name="grid" /> Find a machine
            </Link>
          </section>
        ) : (
          <section className="hero-machine join-hero" data-testid="join-out">
            <div className="eyebrow">{fromTv ? "You scanned the gym screen" : "Racked × Bijlee"}</div>
            <h1>
              Get on the board <span className="join-grad">today.</span>
            </h1>
            <p>
              Free, no app to download. Sign in once with Google, then tap the sticker on any machine to log your set.
            </p>
            <button type="button" className="btn-slab join-google" onClick={join} disabled={busy} data-testid="join-google">
              <span>
                <i className="g-chip" aria-hidden="true">
                  <Icon name="google" />
                </i>
                {busy ? "Opening Google…" : "Join with Google"}
              </span>
            </button>
            <p className="join-fine">
              No password · about 10 seconds ·{" "}
              <Link href="/privacy" className="link">
                privacy
              </Link>
            </p>
          </section>
        )}

        <LiveCard live={live} />

        {!session && !loading && (
          <section className="card">
            <h2 style={{ fontSize: 17, margin: "0 0 14px" }}>How it works</h2>
            <div className="stack">
              <div className="ob-step">
                <div className="n">1</div>
                <div>
                  <b>Join with Google</b>
                  <span>One tap. Your sets, personal bests and streak are saved to your account.</span>
                </div>
              </div>
              <div className="ob-step">
                <div className="n">2</div>
                <div>
                  <b>Tap a machine</b>
                  <span>Hold your phone near the Racked sticker (or scan its QR) and log weight and reps in two taps.</span>
                </div>
              </div>
              <div className="ob-step">
                <div className="n">3</div>
                <div>
                  <b>See yourself on the TV</b>
                  <span>Your best lift shows up on the gym screen, live. Beat it next time.</span>
                </div>
              </div>
            </div>
          </section>
        )}

        {!session && !loading && (
          <section className="card join-trust" data-testid="join-trust">
            <Icon name="shield" />
            <p>
              The TV only shows your <b>first name</b> and your <b>best lift</b> — never your email or photos. You can
              delete your account any time in Settings.
            </p>
          </section>
        )}

        <div className="btn-row">
          <Link href="/leaderboard" className="btn btn-outline btn-sm">
            <Icon name="trophy" /> Leaderboard
          </Link>
          <Link href="/machines" className="btn btn-outline btn-sm">
            <Icon name="grid" /> {MACHINES.length} machines
          </Link>
        </div>
      </div>
    </>
  );
}

function LiveCard({ live }: { live: TvData | null }) {
  if (!live) {
    return <div className="skeleton" style={{ height: 150, borderRadius: 22 }} aria-hidden="true" />;
  }
  const a = live.activity;
  // the most-contested board, so the challenge feels real
  const top = [...live.boards]
    .filter((b) => b.entries.length > 0)
    .sort((x, y) => y.entries.length - x.entries.length)[0];
  const leader = top?.entries[0];

  return (
    <section className="card join-live" data-testid="join-live" aria-live="polite">
      <div className="join-live-head">
        <i className="pulse" aria-hidden="true" /> Live at this gym today
      </div>
      {a.sets === 0 ? (
        <p className="join-first" data-testid="join-first">
          Nobody has lifted yet today — your first set puts you at <b>#1</b> on the TV.
        </p>
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat-tile">
              <div className="v">{a.lifters}</div>
              <div className="l">{a.lifters === 1 ? "Lifter" : "Lifters"}</div>
            </div>
            <div className="stat-tile">
              <div className="v">{a.sets}</div>
              <div className="l">Sets</div>
            </div>
            <div className="stat-tile">
              <div className="v">{a.pbs}</div>
              <div className="l">New PBs</div>
            </div>
          </div>
          {top && leader && (
            <div className="join-beat" data-testid="join-beat">
              <span className="eyebrow">Think you can beat this?</span>
              <div className="join-beat-row">
                <b>{leader.name}</b>
                <span>
                  {leader.weight}
                  <small>{top.unit.toLowerCase()}</small> × {leader.reps}
                </span>
              </div>
              <div className="join-beat-sub">
                #1 on {top.title} · machine {top.machineNumber}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
