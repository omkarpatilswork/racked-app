"use client";

// Home = the gym's feed (PRs, pump checks, posts, transformations, gym
// notices and offers, the prize race, challenges, winners). Above it, just a
// hello, one line of your numbers, a "you're at a machine" banner when it
// matters, and a composer bar. Posting and the 10 machines live in the + menu.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import Icon from "@/components/Icon";
import { shouldAskBody, useMyBody } from "@/components/BodySheet";
import { openBodySheet } from "@/lib/body";
import HomeFeed from "@/components/feed/HomeFeed";
import SignInSheet from "@/components/SignInSheet";
import Avatar from "@/components/Avatar";
import StaffNotices from "@/components/StaffNotices";
import GymMark from "@/components/GymMark";
import ShareStudio from "@/components/share/ShareStudio";
import type { StoryData } from "@/lib/story";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { fetchAttendance, fetchMyStats, fetchWeekSummary, overallFromStats, type WeekSummary } from "@/lib/data";
import { openCreate } from "@/lib/feed";
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
      <div className={`page home-page${session ? " hx" : " stack-lg"}`}>{loading ? <HomeSkeleton /> : session ? <SignedInHome /> : <SignedOutHome />}</div>
    </>
  );
}

function HomeSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="skeleton" style={{ height: 28, width: "60%", marginBottom: 12 }} />
      <div className="skeleton" style={{ height: 34, width: "90%", marginBottom: 16, borderRadius: 99 }} />
      <div className="fx-skel-card" />
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
  const [share, setShare] = useState<StoryData | null>(null);
  const body = useMyBody();
  const [askBody, setAskBody] = useState(false);
  useEffect(() => setAskBody(shouldAskBody()), [body]);

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
  const active = activeId ? MACHINE_MAP[activeId] : null;

  function shareWeek() {
    if (!week) return;
    const monday = new Date();
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const days = Object.keys(attendance || {}).filter((d) => d >= dateStr(monday)).length;
    setShare({
      kind: "week",
      title: `Week of ${monday.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`,
      sets: week.sets,
      volume: week.volume,
      pbs: week.pbs,
      days,
    });
  }

  return (
    <>
      <header className="hx-top">
        <div className="hx-hello">
          <h1>
            {greeting()}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <GymMark variant="chip" label="at" />
        </div>
        <div className="hx-you" data-testid="you-line">
          <Link href="/leaderboard#progress" className="hx-stat" data-testid="tile-streak" aria-label={`${streaks ? streaks.current : 0} day streak, best ${streaks?.best ?? 0}`}>
            <span className="hx-v">
              <Icon name="flame" />
              <b className="t-value num">{streaks ? streaks.current : "–"}</b>
            </span>
            <span className="hx-l">day streak</span>
          </Link>
          <Link href="/profile" className="hx-stat" data-testid="tile-level" aria-label={lvl ? `Level ${lvl.level}, ${lvl.need - lvl.into} XP to the next` : "Your level"}>
            <span className="hx-v">
              <span className="hx-ring" style={{ ["--p" as string]: pct }} aria-hidden="true" />
              <b className="num">{lvl ? lvl.level : "–"}</b>
            </span>
            <span className="hx-l">level</span>
          </Link>
          <div className="hx-stat" data-testid="tile-week">
            <span className="hx-v">
              <Icon name="bolt" />
              <b className="num">{week ? week.sets : "–"}</b>
            </span>
            <span className="hx-l">{week?.sets === 1 ? "set" : "sets"} this week</span>
            {week && week.sets > 0 && (
              <button type="button" className="hx-share" onClick={shareWeek} aria-label="Share your week" data-testid="share-week">
                <Icon name="share" />
              </button>
            )}
          </div>
        </div>
      </header>

      <StaffNotices supabase={supabase} uid={uid} />

      {body && body !== "off" && body.body_kg == null && askBody && (
        <div className="hx-bodycta" data-testid="home-add-body">
          <span className="hx-bodycta-ic" aria-hidden="true">
            <Icon name="scale" />
          </span>
          <span className="hx-bodycta-copy">
            <b>Get on the strength boards</b>
            <span>Boards and prizes rank by ×BW: what you lift ÷ your body weight. Men&rsquo;s and Women&rsquo;s.</span>
          </span>
          <button type="button" className="btn btn-primary btn-sm" onClick={openBodySheet} data-testid="home-add-body-btn">
            Add
          </button>
        </div>
      )}

      {active && (
        <Link href={`/machine/${active.id}/log`} className="hx-resume" data-testid="resume-card">
          <span className="hx-resume-no num" aria-hidden="true">
            {active.number}
          </span>
          <span className="hx-resume-copy">
            <small>You&rsquo;re at</small>
            <b>{active.name}</b>
          </span>
          <span className="hx-resume-go">
            Log a set <Icon name="chev" />
          </span>
        </Link>
      )}

      <div className="hx-compose" data-testid="composer">
        <Avatar name={profile?.display_name} url={profile?.avatar_url} size={36} />
        <button type="button" className="hx-compose-field" onClick={() => openCreate("post")} data-testid="composer-open">
          Share a PR, photo or note…
        </button>
        <button type="button" className="hx-compose-ic" onClick={() => openCreate("photo")} aria-label="Post a photo" data-testid="composer-photo">
          <Icon name="image" />
        </button>
      </div>

      <HomeFeed />
      {share && <ShareStudio story={share} title="Share your week" onClose={() => setShare(null)} />}
    </>
  );
}

function SignedOutHome() {
  const [signIn, setSignIn] = useState(false);
  return (
    <>
      <section className="hero-machine" style={{ padding: "26px 22px 22px" }}>
        <div className="eyebrow">Racked × Bijlee Run Club</div>
        <div style={{ marginTop: 10 }}>
          <GymMark variant="chip" onDark label="Live at" />
        </div>
        <h1 style={{ fontSize: 30, margin: "10px 0 10px" }}>
          Tap. Log. <em>Win.</em>
        </h1>
        <p style={{ margin: "0 0 22px", fontSize: 15 }}>
          Tap a machine with your phone, log the set and win weekly prizes. Boards rank by strength for your size, with Men&rsquo;s and Women&rsquo;s boards.
        </p>
        <button type="button" className="btn-slab" onClick={() => setSignIn(true)} data-testid="hero-signin">
          <span>
            <i className="g-chip" aria-hidden="true">
              <Icon name="google" />
            </i>
            Continue with Google
          </span>
        </button>
        <Link href="/about" className="text-link-on-dark" style={{ display: "inline-block", marginTop: 18 }}>
          What is Racked? <span aria-hidden="true">→</span>
        </Link>
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
      <Link href="/rewards" className="action-card rw-teaser" data-testid="rw-teaser-out">
        <div className="glyph gold">
          <Icon name="gift" />
        </div>
        <div className="body">
          <div className="title">This week&rsquo;s prize</div>
          <div className="sub">Log the most this week and win gifts from our partner brands</div>
        </div>
        <div className="chev">
          <Icon name="chev" />
        </div>
      </Link>
      <SignInSheet open={signIn} onClose={() => setSignIn(false)} next="/home" />
    </>
  );
}
