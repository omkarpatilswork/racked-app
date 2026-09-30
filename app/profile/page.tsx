"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import Icon from "@/components/Icon";
import AttendanceCalendar from "@/components/AttendanceCalendar";
import SignInSheet from "@/components/SignInSheet";
import ShareSheet from "@/components/ShareSheet";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { fetchAttendance, fetchMyStats, overallFromStats, toggleAttendanceDay } from "@/lib/data";
import { calculateMachineLevel } from "@/lib/gamification";
import { computeStreaks, todayStr, type AttendanceMap } from "@/lib/streaks";
import { MACHINE_MAP, MACHINES } from "@/lib/machines";
import type { ShareCardData } from "@/lib/shareCard";
import type { Database } from "@/lib/database.types";

type StatsRow = Database["public"]["Tables"]["machine_stats"]["Row"];

export default function ProfilePage() {
  const { session, profile, signOut } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [stats, setStats] = useState<Record<string, StatsRow>>({});
  const [attendance, setAttendance] = useState<AttendanceMap>({});
  const [sharing, setSharing] = useState<ShareCardData | null>(null);

  useEffect(() => {
    if (!session) return;
    fetchMyStats(supabase, session.user.id).then(setStats);
    fetchAttendance(supabase, session.user.id).then(setAttendance);
  }, [session, supabase]);

  if (!session) {
    return (
      <>
        <Topbar />
        <div className="stack-lg center" style={{ paddingTop: 60 }}>
          <div style={{ color: "var(--ink-faint)" }}>
            <Icon name="user" />
          </div>
          <h2 style={{ margin: "10px 0 4px" }}>Sign in to track your progress</h2>
          <SignInSheetTrigger />
        </div>
      </>
    );
  }

  const overall = overallFromStats(stats);
  const lvl = calculateMachineLevel(overall.totalXp);
  const mine = Object.values(stats).sort((a, b) => b.xp - a.xp);
  const streaks = computeStreaks(attendance);
  const name = profile?.display_name || session.user.email || "Member";
  const uid = session.user.id;

  async function handleToggleAttendance(dateStr: string) {
    if (dateStr > todayStr()) return;
    const turningOn = !attendance[dateStr];
    setAttendance((prev) => {
      const next = { ...prev };
      if (turningOn) next[dateStr] = true;
      else delete next[dateStr];
      return next;
    });
    try {
      await toggleAttendanceDay(supabase, uid, dateStr, turningOn);
    } catch (err) {
      console.error(err);
    }
  }

  function openProgressShare() {
    setSharing({
      eyebrow: "My Progress",
      big: `LEVEL ${lvl.level}`,
      sub: `${overall.totalSets} sets · ${overall.totalVolume.toLocaleString()}KG moved`,
      meta: `${overall.unlocked}/${MACHINES.length} MACHINES · ${overall.pbCount} PBs`,
      dateLabel: new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
      fileTag: "progress",
      shareText: `Level ${lvl.level} on Racked — ${overall.totalSets} sets, ${overall.totalVolume.toLocaleString()}KG moved 🔥 #RackedByBijlee`,
    });
  }

  return (
    <>
      <div className="topbar">
        <div className="brand">
          <span className="dot" />
          RACKED <span className="brand-sub">× BIJLEE</span>
        </div>
        <button className="iconbtn" onClick={signOut} aria-label="Sign out">
          <Icon name="x" />
        </button>
      </div>
      <div className="stack-lg">
        <div className="center">
          <div className="avatar" style={{ width: 64, height: 64, fontSize: 24, margin: "0 auto 10px" }}>
            {profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              name.slice(0, 1).toUpperCase()
            )}
          </div>
          <h1 style={{ fontSize: 22, margin: 0 }}>{name}</h1>
          <div className="pill-yellow" style={{ marginTop: 8 }}>
            LEVEL {lvl.level}
          </div>
          <button className="btn btn-outline btn-sm" style={{ marginTop: 10 }} onClick={openProgressShare}>
            <Icon name="bolt" /> Share Progress
          </button>
        </div>

        <div className="stat-grid">
          <div className="stat-tile">
            <div className="v">{overall.unlocked}/{MACHINES.length}</div>
            <div className="l">Unlocked</div>
          </div>
          <div className="stat-tile">
            <div className="v">{overall.totalSets}</div>
            <div className="l">Sets logged</div>
          </div>
          <div className="stat-tile">
            <div className="v">{overall.pbCount}</div>
            <div className="l">Personal Bests</div>
          </div>
        </div>

        <div className="card">
          <div className="row" style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-soft)" }}>
            <span>Overall Level</span>
            <span className="num">
              {lvl.into} / {lvl.need} XP
            </span>
          </div>
          <div className="progress-track" style={{ marginTop: 6 }}>
            <div className="progress-fill" style={{ width: `${Math.min(100, Math.round((100 * lvl.into) / lvl.need))}%` }} />
          </div>
          <div className="muted num" style={{ fontSize: 12, marginTop: 8 }}>
            {overall.totalVolume.toLocaleString()} KG total volume
          </div>
        </div>

        <div className="card">
          <div className="row">
            <h3 style={{ margin: 0, fontSize: 15 }}>
              <Icon name="flame" /> Attendance
            </h3>
            <span className="pill-yellow">
              {streaks.current} day{streaks.current === 1 ? "" : "s"} 🔥
            </span>
          </div>
          <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>
            Best streak: {streaks.best} day{streaks.best === 1 ? "" : "s"} · tap a day to mark it
          </div>
          <div style={{ marginTop: 14 }}>
            <AttendanceCalendar attendance={attendance} onToggle={handleToggleAttendance} />
          </div>
        </div>

        <div>
          <div className="row" style={{ marginBottom: 10 }}>
            <div className="eyebrow">Your Machines</div>
            <span className="faint" style={{ fontSize: 12 }}>
              {overall.unlocked} / {MACHINES.length} unlocked
            </span>
          </div>
          {mine.length ? (
            <div className="stack">
              {mine.map((s) => {
                const m = MACHINE_MAP[s.machine_id];
                if (!m) return null;
                const label = m.dual ? m.modes?.[s.mode]?.label || m.name : m.name;
                return (
                  <Link
                    key={`${s.machine_id}__${s.mode}`}
                    href={`/machine/${s.machine_id}${s.mode ? `?mode=${s.mode}` : ""}`}
                    className="machine-card"
                  >
                    <div className="thumb">
                      <Icon name="dumbbell" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="title">{label}</div>
                      <div className="sub">
                        Level {s.level} • PB {s.pb_weight}
                        {m.unit}×{s.pb_reps} • {s.sets} sets
                      </div>
                    </div>
                    <div className="chev">
                      <Icon name="chev" />
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="empty">
              Your progress starts here.
              <br />
              Tap a machine and log your first set. 🔥
            </div>
          )}
        </div>
        {overall.unlocked < MACHINES.length && (
          <Link href="/machines" className="btn btn-outline">
            Unlock them all <Icon name="chev" />
          </Link>
        )}
      </div>
      {sharing && <ShareSheet data={sharing} onClose={() => setSharing(null)} />}
    </>
  );
}

function SignInSheetTrigger() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button className="btn btn-yellow" style={{ maxWidth: 220, margin: "10px auto 0" }} onClick={() => setOpen(true)}>
        <Icon name="bolt" /> Continue
      </button>
      <SignInSheet open={open} onClose={() => setOpen(false)} next="/profile" />
    </>
  );
}
