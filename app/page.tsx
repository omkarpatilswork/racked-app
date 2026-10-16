"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import Icon from "@/components/Icon";
import HomeFeed from "@/components/HomeFeed";
import PumpCheckCard from "@/components/PumpCheckCard";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { fetchMyStats, overallFromStats } from "@/lib/data";
import { MACHINES } from "@/lib/machines";

export default function HomePage() {
  const { session, profile, loading, signInWithGoogle } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [overall, setOverall] = useState<ReturnType<typeof overallFromStats> | null>(null);

  useEffect(() => {
    if (!session) {
      setOverall(null);
      return;
    }
    fetchMyStats(supabase, session.user.id).then((stats) => {
      setOverall(overallFromStats(stats));
    });
  }, [session, supabase]);

  const firstName = (profile?.display_name || "").split(" ")[0];

  return (
    <>
      <Topbar />
      <div className="stack-lg">
        {!session || loading ? (
          <div className="hero-machine">
            <div className="glyph-lg">
              <Icon name="bolt" />
            </div>
            <div className="eyebrow" style={{ color: "rgba(255,255,255,.55)" }}>
              Your gym
            </div>
            <h1>Smarter.</h1>
            <p
              className="muted"
              style={{ position: "relative", color: "rgba(255,255,255,.7)", margin: "0 0 16px", fontSize: 14 }}
            >
              Tap any machine to get started.
            </p>
            <Link href="/machines" className="btn btn-yellow" style={{ position: "relative" }}>
              <Icon name="grid" /> Explore Machines
            </Link>
            <div
              className="pill"
              style={{
                position: "relative",
                marginTop: 14,
                background: "rgba(255,255,255,.1)",
                borderColor: "rgba(255,255,255,.15)",
                color: "#fff",
              }}
            >
              <Icon name="dumbbell" /> {MACHINES.length} interactive machines
            </div>
          </div>
        ) : (
          <div className="hero-machine">
            <div className="eyebrow" style={{ color: "rgba(255,255,255,.55)" }}>
              Welcome back
            </div>
            <h1>{firstName || "there"} 👋</h1>
            {overall && (
              <div className="stat-grid" style={{ position: "relative", marginTop: 16 }}>
                <div className="stat-tile" style={{ background: "rgba(255,255,255,.08)", borderColor: "rgba(255,255,255,.14)" }}>
                  <div className="v" style={{ color: "var(--accent-on-dark)" }}>{overall.totalSets}</div>
                  <div className="l" style={{ color: "rgba(255,255,255,.6)" }}>Sets</div>
                </div>
                <div className="stat-tile" style={{ background: "rgba(255,255,255,.08)", borderColor: "rgba(255,255,255,.14)" }}>
                  <div className="v" style={{ color: "var(--accent-on-dark)" }}>{overall.totalVolume.toLocaleString()}</div>
                  <div className="l" style={{ color: "rgba(255,255,255,.6)" }}>KG Moved</div>
                </div>
                <div className="stat-tile" style={{ background: "rgba(255,255,255,.08)", borderColor: "rgba(255,255,255,.14)" }}>
                  <div className="v" style={{ color: "var(--accent-on-dark)" }}>{overall.pbCount}</div>
                  <div className="l" style={{ color: "rgba(255,255,255,.6)" }}>PBs</div>
                </div>
              </div>
            )}
            <div className="btn-row" style={{ position: "relative", marginTop: 16 }}>
              <Link href="/profile" className="btn btn-yellow">
                Your progress <Icon name="chev" />
              </Link>
              <Link
                href="/machines"
                className="btn"
                style={{ background: "rgba(255,255,255,.12)", color: "#fff", border: "1px solid rgba(255,255,255,.18)" }}
              >
                <Icon name="grid" /> Machines
              </Link>
            </div>
          </div>
        )}

        {session && !loading ? (
          <>
            <PumpCheckCard />
            <HomeFeed />
          </>
        ) : (
          <div className="card" style={{ textAlign: "center" }}>
            <div className="feed-glyph">
              <Icon name="flame" />
            </div>
            <h3 style={{ margin: "10px 0 4px", fontSize: 17 }}>See what the gym is lifting</h3>
            <p className="muted" style={{ margin: "0 0 14px", fontSize: 14 }}>
              Sign in to follow your gym&rsquo;s feed &mdash; every set and personal best, with kudos.
            </p>
            <button type="button" className="btn btn-primary" onClick={() => signInWithGoogle("/")}>
              <Icon name="google" /> Continue with Google
            </button>
          </div>
        )}
      </div>
    </>
  );
}
