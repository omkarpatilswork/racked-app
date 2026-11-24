"use client";

// You v2 (Nov 2026, Omi: simpler, less text, Settings easy to find): a
// "Settings" button with the word, name + "Club 360 · member since", one row
// of numbers, the attendance calendar, progress photos and "Your bests" (one
// line per machine). The old "Your gym" card is the youGymCard switch.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import Icon from "@/components/Icon";
import Avatar from "@/components/Avatar";
import IgHandle from "@/components/IgHandle";
import AttendanceCalendar from "@/components/AttendanceCalendar";
import ProgressPhotos from "@/components/ProgressPhotos";
import SignInSheet from "@/components/SignInSheet";
import ShareStudio from "@/components/share/ShareStudio";
import GymMark from "@/components/GymMark";
import { useGym } from "@/lib/gym";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { fetchAttendance, fetchMyStats, overallFromStats, toggleAttendanceDay } from "@/lib/data";
import { calculateMachineLevel } from "@/lib/gamification";
import { useFeature } from "@/lib/features";
import { computeStreaks, todayStr, type AttendanceMap } from "@/lib/streaks";
import { MACHINE_MAP, MACHINES } from "@/lib/machines";
import { toast } from "@/lib/toast";
import type { StoryData } from "@/lib/story";
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
  const [sharing, setSharing] = useState<StoryData | null>(null);
  const [photoDays, setPhotoDays] = useState<Record<string, boolean>>({});
  // Levels come from XP, which is archived for launch (features.xp).
  const xpOn = useFeature("xp");
  const gymCardOn = useFeature("youGymCard");

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
  // your bests in machine order (01, 02, …), the dual machine's sides together
  const order = new Map(MACHINES.map((m, i) => [m.id, i]));
  const mine = Object.values(stats || {}).sort((a, b) => (order.get(a.machine_id) ?? 99) - (order.get(b.machine_id) ?? 99) || a.mode.localeCompare(b.mode));
  const streaks = computeStreaks(attendance);
  const gym = useGym();
  const since = profile?.created_at ? new Date(profile.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : null;

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
      kind: "progress",
      level: xpOn ? lvl.level : null,
      sets: overall.totalSets,
      volume: overall.totalVolume,
      pbs: overall.pbCount,
      machines: `${overall.unlocked}/${MACHINES.length} machines`,
    });
  }

  return (
    <>
      <Topbar
        right={
          <Link href="/settings" className="you-set-btn" data-testid="open-settings">
            <Icon name="gear" /> Settings
          </Link>
        }
      />
      <div className="page stack-lg">
        <section className="center" data-testid="profile-header">
          <div style={{ position: "relative", width: 84, margin: "4px auto 12px" }}>
            <Avatar name={name} url={profile?.avatar_url} size={84} className="profile-avatar" />
          </div>
          <h1 style={{ fontSize: 24, margin: 0 }}>{name}</h1>
          {(xpOn || profile?.instagram_handle) && (
            <div className="chip-row" style={{ justifyContent: "center", marginTop: 8, alignItems: "center" }}>
              {xpOn && <span className="pill-yellow">Level {lvl.level}</span>}
              {profile?.instagram_handle ? <IgHandle handle={profile.instagram_handle} /> : null}
            </div>
          )}
          {!gymCardOn && (
            <div>
              <span className="you-gym" data-testid="you-gym">
                <b>{gym.name}</b>
                {since ? ` member since ${since}` : " member"}
              </span>
            </div>
          )}
          <div className="btn-row" style={{ marginTop: 16, maxWidth: 360, marginInline: "auto" }}>
            <Link href="/settings" className="btn btn-ghost btn-sm" style={{ flex: 1, minHeight: 44 }} data-testid="edit-profile">
              <Icon name="edit" /> Edit profile
            </Link>
            <button type="button" className="btn btn-ghost btn-sm" style={{ flex: 1, minHeight: 44 }} onClick={openProgressShare}>
              <Icon name="share" /> Share progress
            </button>
          </div>
        </section>

        {xpOn && (
          <section className="tile" style={{ flexDirection: "row", alignItems: "center", gap: 16, minHeight: 0 }} data-testid="profile-level">
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
          </section>
        )}

        <section className="you-stats" aria-label="Your totals" data-testid="you-stats">
          <div>
            <b className="num">{stats ? overall.totalSets.toLocaleString("en-IN") : "–"}</b>
            <span>{overall.totalSets === 1 ? "set" : "sets"}</span>
          </div>
          <div>
            <b className="num">{stats ? compactKg(overall.totalVolume) : "–"}</b>
            <span>kg moved</span>
          </div>
          <div>
            <b className="num">{stats ? overall.pbCount : "–"}</b>
            <span>{overall.pbCount === 1 ? "PB" : "PBs"}</span>
          </div>
          <div>
            <b className="num">
              {overall.unlocked}/{MACHINES.length}
            </b>
            <span>machines</span>
          </div>
        </section>

        {gymCardOn && (
          <section className="card gym-card" data-testid="your-gym">
            <div className="row" style={{ alignItems: "flex-start" }}>
              <GymMark variant="lockup" label="Your gym" />
              {gym.instagram && (
                <a className="iconbtn" href={gym.instagram} target="_blank" rel="noopener" aria-label={`${gym.name} on Instagram`}>
                  <Icon name="instagram" />
                </a>
              )}
            </div>
            <div className="gym-card-stats">
              <div>
                <b className="num">{since || "–"}</b>
                <span>Member since</span>
              </div>
              <div>
                <b className="num">
                  {overall.unlocked}/{MACHINES.length}
                </b>
                <span>Machines used</span>
              </div>
              <div>
                <b className="num">{streaks.best}</b>
                <span>Best streak</span>
              </div>
            </div>
            <Link href="/leaderboard" className="btn btn-ghost btn-sm" style={{ marginTop: 12, width: "100%" }} data-testid="gym-leaderboard-link">
              <Icon name="trophy" /> {gym.name} leaderboard
            </Link>
          </section>
        )}

        <section className="card" data-testid="you-attendance">
          <div className="you-head">
            <h2>Attendance</h2>
            <span className="you-streak" data-testid="you-streak">
              <Icon name="flame" /> {streaks.current} {streaks.current === 1 ? "day" : "days"}
              {streaks.best > streaks.current && <small>· best {streaks.best}</small>}
            </span>
          </div>
          <div style={{ marginTop: 12 }}>
            <AttendanceCalendar attendance={attendance} onToggle={handleToggleAttendance} photoDays={photoDays} />
          </div>
          {Object.keys(photoDays).length > 0 && (
            <div className="faint" style={{ fontSize: 11.5, marginTop: 10 }}>
              <span className="cal-legend-dot" /> = a day with progress photos
            </div>
          )}
        </section>

        <ProgressPhotos uid={uid} onPhotoDays={setPhotoDays} />

        <section data-testid="you-bests">
          <div className="you-sec-head">
            <h2>Your bests</h2>
            <Link href="/machines">
              All machines <Icon name="chev" />
            </Link>
          </div>
          {stats === null ? (
            <div className="skeleton" style={{ height: 116, borderRadius: 22 }} aria-busy="true" />
          ) : mine.length ? (
            <div className="you-bests">
              {mine.map((s) => {
                const m = MACHINE_MAP[s.machine_id];
                if (!m) return null;
                const side = m.dual ? m.modes?.[s.mode]?.label : null;
                return (
                  <Link
                    key={`${s.machine_id}__${s.mode}`}
                    href={`/machine/${m.id}${m.dual && s.mode ? `?mode=${s.mode}` : ""}`}
                    className="you-best"
                    data-testid="you-best"
                  >
                    <span className="n num" aria-hidden="true">
                      {m.number}
                    </span>
                    <span className="t">{side || m.name}</span>
                    <span className="v num">
                      {Number(s.pb_weight)} <small>{m.unit === "KG" ? "kg" : m.unit.toLowerCase()} × {s.pb_reps}</small>
                    </span>
                    <Icon name="chev" className="icon c" />
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="card empty" style={{ padding: 18 }}>
              Your bests show up here. Tap or scan any machine to start.
            </div>
          )}
        </section>
      </div>
      {sharing && <ShareStudio story={sharing} title="Share your progress" onClose={() => setSharing(null)} />}
    </>
  );
}

// 4,200 · 43.6k · 1.2M
function compactKg(n: number) {
  const v = Math.round(Number(n) || 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (v >= 10_000) return `${(v / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return v.toLocaleString("en-IN");
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
        <p className="muted" style={{ margin: 0 }}>Sign in to see your streak, personal bests and progress photos.</p>
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
