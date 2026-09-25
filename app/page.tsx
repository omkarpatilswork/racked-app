"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import Icon from "@/components/Icon";
import MachineCard from "@/components/MachineCard";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { fetchMyStats, overallFromStats } from "@/lib/data";
import { MACHINES } from "@/lib/machines";

export default function HomePage() {
  const { session, profile, loading } = useAuth();
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
            <Link href="/demo" className="btn btn-yellow" style={{ position: "relative" }}>
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
              <Icon name="dumbbell" /> 9 interactive machines
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
            <Link href="/profile" className="btn btn-yellow" style={{ position: "relative", marginTop: 16 }}>
              Continue your progress <Icon name="chev" />
            </Link>
          </div>
        )}

        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Quick actions
          </div>
          <div className="stack">
            <Link href="/demo" className="action-card">
              <div className="glyph yellow">
                <Icon name="wifi" />
              </div>
              <div className="body">
                <div className="title">Simulate an NFC tap</div>
                <div className="sub">Choose a machine like you tapped its sticker</div>
              </div>
              <div className="chev">
                <Icon name="chev" />
              </div>
            </Link>
            <Link href="/leaderboard" className="action-card">
              <div className="glyph">
                <Icon name="trophy" />
              </div>
              <div className="body">
                <div className="title">Leaderboard</div>
                <div className="sub">See who&rsquo;s on top across all 9 machines</div>
              </div>
              <div className="chev">
                <Icon name="chev" />
              </div>
            </Link>
          </div>
        </div>

        <div>
          <div className="row" style={{ marginBottom: 10 }}>
            <div className="eyebrow">Machines</div>
            <Link href="/machines" className="faint" style={{ fontSize: 12.5, fontWeight: 700 }}>
              See all
            </Link>
          </div>
          <div className="stack">
            {MACHINES.slice(0, 3).map((m) => (
              <MachineCard key={m.id} machine={m} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
