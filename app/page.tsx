"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import Icon from "@/components/Icon";
import HomeFeed from "@/components/HomeFeed";
import PumpCheckCard from "@/components/PumpCheckCard";
import SignInSheet from "@/components/SignInSheet";
import Avatar from "@/components/Avatar";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { fetchAttendance, fetchMyStats, fetchWeekSummary, overallFromStats, type WeekSummary } from "@/lib/data";
import { calculateMachineLevel } from "@/lib/gamification";
import { computeStreaks, dateStr, type AttendanceMap } from "@/lib/streaks";
import { getActiveMachineId } from "@/lib/machineLock";
import { MACHINE_MAP, MACHINES } from "@/lib/machines";

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Late session";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function HomePage() {
  const { session, profile, loading } = useAuth();

  return (
    <>
      <Topbar
        right={
          session ? (
            <Link href="/profile" aria-label="Your profile" className="avatar-link">
              <Avatar name={profile?.display_name} url={profile?.avatar_url} size={40} />
            </Link>
          ) : undefined
        }
      />
      <div className="page stack-lg">
        {loading ? <HomeSkeleton /> : session ? <SignedInHome /> : <SignedOutHome />}
      </div>
    </>
  );
}

function HomeSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="skeleton sk-line" style={{ width: 120, marginBottom: 10 }} />
      <div className="skeleton" style={{ height: 34, width: "70%", marginBottom: 18 }} />
      <div className="bento">
        <div className="skeleton" style={{ height: 120, borderRadius: 22 }} />
        <div className="skeleton" style={{ height: 120, borderRadius: 22 }} />
      </div>
    </div>
  );
}

function SignedInHome() {
  const { session, profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const uid = session!.user.id;
  const [overall, setOverall] = useState<ReturnType<typeof overallFromStats> | null>(null);
  const [attendance, setAttendance] = useState<AttendanceMap | null>(null);
  const [week, setWeek] = useState<WeekSummary | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    setActiveId(getActiveMachineId());
    fetchMyStats(supabase, uid)
      .then((s) => setOverall(overallFromStats(s)))
      .catch(() => setOverall(overallFromStats({})));
    fetchAttendance(supabase, uid)
      .then(setAttendance)
      .catch(() => setAttendance({}));
    fetchWeekSummary(supabase, uid)
      .then(setWeek)
      .catch(() => setWeek(null));
  }, [supabase, uid]);

  const firstName = (profile?.display_name || "").split(" ")[0];
  const streaks = attendance ? computeStreaks(attendance) : null;
  const lvl = overall ? calculateMachineLevel(overall.totalXp) : null;
  const pct = lvl ? Math.min(100, Math.round((100 * lvl.into) / lvl.need)) : 0;
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return !!attendance?.[dateStr(d)];
  });
  const active = activeId ? MACHINE_MAP[activeId] : null;
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });

  return (
    <>
      <header>
        <div className="eyebrow">{today}</div>
        <h1 style={{ fontSize: 27, margin: "6px 0 0" }}>
          {greeting()}
          {firstName ? `, ${firstName}` : ""}
        </h1>
      </header>

      {active ? (
        <Link href={`/machine/${active.id}/log`} className="action-card resume-card" data-testid="resume-card">
          <div className="glyph yellow">
            <Icon name="flame" />
          </div>
          <div className="body">
            <div className="eyebrow accent" style={{ fontSize: 10 }}>
              You&rsquo;re at
            </div>
            <div className="title">{active.name}</div>
            <div className="sub">Tap to log your next set</div>
          </div>
          <div className="chev">
            <Icon name="chev" />
          </div>
        </Link>
      ) : (
        <div className="tapin-card" data-testid="tapin-card">
          <div className="tapin-icons" aria-hidden="true">
            <Icon name="nfc" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b>At a machine?</b>
            <span>Hold your phone to its sticker, or scan the QR code, to log a set.</span>
          </div>
        </div>
      )}

      <section className="bento" aria-label="Your stats">
        <div className="tile accent-tile tall" data-testid="tile-streak">
          <div className="t-label">
            <Icon name="flame" /> Streak
          </div>
          <div>
            <div className="t-value">
              {streaks ? streaks.current : "–"}
              <small>{streaks?.current === 1 ? "day" : "days"}</small>
            </div>
            <div className="week-dots" role="img" aria-label={`${last7.filter(Boolean).length} of the last 7 days at the gym`}>
              {last7.map((on, i) => (
                <i key={i} className={on ? "on" : ""} />
              ))}
            </div>
            <div className="t-sub">Best {streaks?.best ?? 0} · last 7 days</div>
          </div>
        </div>
        <Link href="/profile" className="tile" data-testid="tile-level">
          <div className="row" style={{ alignItems: "flex-start" }}>
            <div className="t-label">Level</div>
            <div className="ring" style={{ ["--p" as string]: pct, width: 34, height: 34 }} aria-hidden="true" />
          </div>
          <div>
            <div className="t-value" style={{ marginTop: 4 }}>{lvl ? lvl.level : "–"}</div>
            <div className="t-sub">{lvl ? `${lvl.need - lvl.into} XP to next` : " "}</div>
          </div>
        </Link>
        <div className="tile" data-testid="tile-week">
          <div className="t-label">This week</div>
          <div>
            <div className="t-value" style={{ fontSize: 24 }}>
              {week ? week.volume.toLocaleString() : "–"}
              <small>kg</small>
            </div>
            <div className="t-sub">
              {week ? `${week.sets} set${week.sets === 1 ? "" : "s"} · ${week.pbs} PB${week.pbs === 1 ? "" : "s"}` : " "}
            </div>
          </div>
        </div>
      </section>

      <PumpCheckCard />
      <HomeFeed />
    </>
  );
}

function SignedOutHome() {
  const [signIn, setSignIn] = useState(false);
  return (
    <>
      <section className="hero-machine" style={{ padding: "26px 22px 22px" }}>
        <div className="eyebrow">Racked × Bijlee</div>
        <h1 style={{ fontSize: 32, margin: "10px 0 8px" }}>Your gym, levelled up.</h1>
        <p style={{ margin: "0 0 20px", fontSize: 15 }}>
          Tap a machine with your phone, log the set, beat your best — and see what the rest of the gym is lifting.
        </p>
        <button
          type="button"
          className="btn"
          onClick={() => setSignIn(true)}
          style={{ background: "#fff", color: "#111" }}
          data-testid="hero-signin"
        >
          <Icon name="google" /> Continue with Google
        </button>
        <Link href="/machines" className="btn" style={{ marginTop: 10, background: "rgba(255,255,255,.1)", color: "#fff", border: "1px solid rgba(255,255,255,.16)" }}>
          <Icon name="grid" /> Browse the {MACHINES.length} machines
        </Link>
      </section>

      <section className="card">
        <h2 style={{ fontSize: 17, margin: "0 0 14px" }}>How it works</h2>
        <div className="stack">
          <div className="ob-step">
            <div className="n">1</div>
            <div>
              <b>Tap in</b>
              <span>Hold your phone near the sticker on any machine, or scan its QR code.</span>
            </div>
          </div>
          <div className="ob-step">
            <div className="n">2</div>
            <div>
              <b>Log your set</b>
              <span>Weight and reps in two taps. We remember what you did last time.</span>
            </div>
          </div>
          <div className="ob-step">
            <div className="n">3</div>
            <div>
              <b>Level up</b>
              <span>Earn XP, keep your streak and climb the gym leaderboard.</span>
            </div>
          </div>
        </div>
      </section>

      <Link href="/leaderboard" className="action-card">
        <div className="glyph yellow">
          <Icon name="trophy" />
        </div>
        <div className="body">
          <div className="title">See who&rsquo;s on top</div>
          <div className="sub">This gym&rsquo;s live leaderboard</div>
        </div>
        <div className="chev">
          <Icon name="chev" />
        </div>
      </Link>
      <SignInSheet open={signIn} onClose={() => setSignIn(false)} next="/" />
    </>
  );
}
