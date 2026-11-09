"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import Icon from "@/components/Icon";
import Avatar from "@/components/Avatar";
import IgHandle from "@/components/IgHandle";
import AttendanceCalendar from "@/components/AttendanceCalendar";
import ProgressPhotos from "@/components/ProgressPhotos";
import SignInSheet from "@/components/SignInSheet";
import ShareSheet from "@/components/ShareSheet";
import MachineCard from "@/components/MachineCard";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { fetchAttendance, fetchMyStats, overallFromStats, toggleAttendanceDay } from "@/lib/data";
import { calculateMachineLevel } from "@/lib/gamification";
import { computeStreaks, todayStr, type AttendanceMap } from "@/lib/streaks";
import { MACHINE_MAP, MACHINES } from "@/lib/machines";
import { toast } from "@/lib/toast";
import type { ShareCardData } from "@/lib/shareCard";
import type { Database } from "@/lib/database.types";

type StatsRow = Database["public"]["Tables"]["machine_stats"]["Row"];

export default function ProfilePage() {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <>
        <Topbar />
        <div className="page stack-lg" aria-busy="true">
          <div className="skeleton" style={{ width: 80, height: 80, borderRadius: "50%", margin: "10px auto 0" }} />
          <div className="skeleton sk-line" style={{ width: 160, margin: "0 auto" }} />
          <div className="skeleton" style={{ height: 200, borderRadius: 22 }} />
        </div>
      </>
    );
  }
  if (!session) return <SignedOutProfile />;
  return <SignedInProfile key={session.user.id} uid={session.user.id} name={profile?.display_name || session.user.email || "Member"} />;
}

function SignedInProfile({ uid, name }: { uid: string; name: string }) {
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [stats, setStats] = useState<Record<string, StatsRow> | null>(null);
  const [attendance, setAttendance] = useState<AttendanceMap>({});
  const [sharing, setSharing] = useState<ShareCardData | null>(null);
  const [photoDays, setPhotoDays] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchMyStats(supabase, uid)
      .then(setStats)
      .catch(() => setStats({}));
    fetchAttendance(supabase, uid)
      .then(setAttendance)
      .catch(() => {});
  }, [uid, supabase]);

  const overall = overallFromStats(stats || {});
  const lvl = calculateMachineLevel(overall.totalXp);
  const pct = Math.min(100, Math.round((100 * lvl.into) / lvl.need));
  const mine = Object.values(stats || {}).sort((a, b) => b.xp - a.xp);
  const streaks = computeStreaks(attendance);

  async function handleToggleAttendance(dateStr: string) {
    if (dateStr > todayStr()) return;
    const turningOn = !attendance[dateStr];
    const before = attendance;
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
      setAttendance(before);
      toast("Couldn't update that day — try again");
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
      <Topbar
        right={
          <Link href="/settings" className="iconbtn" aria-label="Settings" data-testid="open-settings">
            <Icon name="gear" />
          </Link>
        }
      />
      <div className="page stack-lg">
        <section className="center" data-testid="profile-header">
          <div style={{ position: "relative", width: 84, margin: "4px auto 12px" }}>
            <Avatar name={name} url={profile?.avatar_url} size={84} className="profile-avatar" />
          </div>
          <h1 style={{ fontSize: 24, margin: 0 }}>{name}</h1>
          <div className="chip-row" style={{ justifyContent: "center", marginTop: 10, alignItems: "center" }}>
            <span className="pill-yellow">Level {lvl.level}</span>
            {profile?.instagram_handle ? <IgHandle handle={profile.instagram_handle} /> : null}
          </div>
          <div className="btn-row" style={{ marginTop: 16, maxWidth: 360, marginInline: "auto" }}>
            <Link href="/settings" className="btn btn-ghost btn-sm" style={{ flex: 1, minHeight: 44 }}>
              <Icon name="edit" /> Edit profile
            </Link>
            <button type="button" className="btn btn-ghost btn-sm" style={{ flex: 1, minHeight: 44 }} onClick={openProgressShare}>
              <Icon name="share" /> Share progress
            </button>
          </div>
        </section>

        <section className="bento" aria-label="Your totals">
          <div className="tile span-2" style={{ flexDirection: "row", alignItems: "center", gap: 16, minHeight: 0 }}>
            <div className="ring" style={{ ["--p" as string]: pct, width: 64, height: 64, fontSize: 18 }} aria-hidden="true">
              {lvl.level}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800 }}>Level {lvl.level}</div>
              <div className="faint num" style={{ fontSize: 12.5, marginTop: 2 }}>
                {lvl.into} / {lvl.need} XP · {lvl.need - lvl.into} to go
              </div>
              <div className="progress-track" style={{ marginTop: 8 }}>
                <div className="progress-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>
          <div className="tile">
            <div className="t-label">Sets</div>
            <div className="t-value" style={{ fontSize: 26 }}>{stats ? overall.totalSets : "–"}</div>
            <div className="t-sub">{overall.totalVolume.toLocaleString()} kg moved</div>
          </div>
          <div className="tile">
            <div className="t-label">Personal bests</div>
            <div className="t-value" style={{ fontSize: 26 }}>{stats ? overall.pbCount : "–"}</div>
            <div className="t-sub">
              {overall.unlocked} / {MACHINES.length} machines
            </div>
          </div>
        </section>

        <section className="card">
          <div className="row">
            <h2 style={{ margin: 0, fontSize: 16 }}>Attendance</h2>
            <span className="pill-yellow">
              <Icon name="flame" /> {streaks.current} day{streaks.current === 1 ? "" : "s"}
            </span>
          </div>
          <div className="faint" style={{ fontSize: 12.5, marginTop: 4 }}>
            Best streak {streaks.best} · logging a set marks the day for you
          </div>
          <div style={{ marginTop: 14 }}>
            <AttendanceCalendar attendance={attendance} onToggle={handleToggleAttendance} photoDays={photoDays} />
          </div>
          {Object.keys(photoDays).length > 0 && (
            <div className="faint" style={{ fontSize: 11.5, marginTop: 10 }}>
              <span className="cal-legend-dot" /> = a day with progress photos
            </div>
          )}
        </section>

        <ProgressPhotos uid={uid} onPhotoDays={setPhotoDays} />

        <section>
          <div className="section-head">
            <h2>Your machines</h2>
            <Link href="/machines">
              {overall.unlocked} / {MACHINES.length}
            </Link>
          </div>
          {stats === null ? (
            <div className="stack" aria-busy="true">
              <div className="skeleton" style={{ height: 76, borderRadius: 20 }} />
              <div className="skeleton" style={{ height: 76, borderRadius: 20 }} />
            </div>
          ) : mine.length ? (
            <div className="stack">
              {mine.map((s) => {
                const m = MACHINE_MAP[s.machine_id];
                if (!m) return null;
                return (
                  <MachineCard
                    key={`${s.machine_id}__${s.mode}`}
                    machine={m.dual ? { ...m, name: m.modes?.[s.mode]?.label || m.name } : m}
                    unlocked
                    pb={`${s.pb_weight}${m.unit === "KG" ? "kg" : m.unit}×${s.pb_reps}`}
                  />
                );
              })}
            </div>
          ) : (
            <div className="card empty">
              Your progress starts at the first machine.
              <br />
              Tap a sticker and log a set.
            </div>
          )}
        </section>
      </div>
      {sharing && <ShareSheet data={sharing} onClose={() => setSharing(null)} />}
    </>
  );
}

function SignedOutProfile() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Topbar />
      <div className="page stack-lg center" style={{ paddingTop: 40 }}>
        <div className="tapin-icons" style={{ margin: "0 auto", width: 64, height: 64, borderRadius: 22 }}>
          <Icon name="user" />
        </div>
        <h1 style={{ fontSize: 24, margin: "8px 0 0" }}>Your training, in one place</h1>
        <p className="muted" style={{ margin: 0 }}>Sign in to see your level, streak, personal bests and progress photos.</p>
        <button type="button" className="btn btn-yellow" style={{ maxWidth: 300, margin: "8px auto 0" }} onClick={() => setOpen(true)} data-testid="profile-signin">
          <Icon name="google" /> Continue with Google
        </button>
        <Link href="/privacy" className="text-btn">
          How we use your data
        </Link>
      </div>
      <SignInSheet open={open} onClose={() => setOpen(false)} next="/profile" />
    </>
  );
}
