"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { notFound, useSearchParams } from "next/navigation";
import Icon from "@/components/Icon";
import LbRow from "@/components/LbRow";
import LockedMachine from "@/components/LockedMachine";
import ShareStudio from "@/components/share/ShareStudio";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { fetchMachineBoard, recordTap, type MachineBoardRow } from "@/lib/data";
import { useMyBody } from "@/components/BodySheet";
import { defaultBoard, fmtScore, openBodySheet } from "@/lib/body";
import { calculateMachineLevel } from "@/lib/gamification";
import { claimTapRecord, resolveTapSource, useMachineLock } from "@/lib/machineLock";
import { MACHINE_MAP, resolveMachineView } from "@/lib/machines";
import type { StoryData } from "@/lib/story";
import type { Database } from "@/lib/database.types";

type StatsRow = Database["public"]["Tables"]["machine_stats"]["Row"];

export default function MachinePage({ params }: { params: { id: string } }) {
  return (
    <Suspense fallback={null}>
      <MachinePageInner params={params} />
    </Suspense>
  );
}

function MachinePageInner({ params }: { params: { id: string } }) {
  const machine = MACHINE_MAP[params.id];
  const searchParams = useSearchParams();
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const supabase = useMemo(() => createClient(), []);

  const modeParam = searchParams.get("mode");
  const view = machine ? resolveMachineView(machine, modeParam) : null;
  const mode = view?.modeKey ?? null;
  const lockStatus = useMachineLock(machine, searchParams.get("tap"));

  const [mine, setMine] = useState<StatsRow | null>(null);
  const [board, setBoard] = useState<MachineBoardRow[] | null>(null);
  const [mineLoaded, setMineLoaded] = useState(false);
  const [sharing, setSharing] = useState<StoryData | null>(null);
  const body = useMyBody();
  const myBody = body && body !== "off" ? body : null;
  const division = defaultBoard(myBody);

  // Guarded on lockStatus === "unlocked" so a locked page (someone who
  // clicked here from elsewhere in the app instead of tapping the sticker)
  // doesn't record a tap, pull the leaderboard, or fetch anyone's stats.
  // Only an actual scan counts as a tap: the URL carries the machine's NFC or
  // QR code, which also tells us *which* one it was. Coming back to this page
  // from the Log/Guide pages (no code in the URL) is not a new tap, and
  // claimTapRecord drops a refresh or double-fire of the same scan.
  const tapSource = resolveTapSource(machine, searchParams.get("tap"));
  useEffect(() => {
    if (!machine || lockStatus !== "unlocked" || !tapSource) return;
    if (!claimTapRecord(machine.id)) return;
    recordTap(supabase, machine.id, tapSource);
  }, [machine, lockStatus, tapSource, supabase]);

  useEffect(() => {
    if (!machine || lockStatus !== "unlocked") return;
    let active = true;
    setBoard(null);
    if (body === null && session) return; // wait for your board (Men / Women)
    fetchMachineBoard(supabase, machine.id, mode || "", "all", 0, division)
      .then((rows) => active && setBoard(rows))
      .catch(() => active && setBoard([]));
    return () => {
      active = false;
    };
  }, [machine, mode, lockStatus, supabase, division, body, session]);

  useEffect(() => {
    if (!machine || !uid || lockStatus !== "unlocked") {
      setMine(null);
      setMineLoaded(!uid);
      return;
    }
    let active = true;
    setMineLoaded(false);
    supabase
      .from("machine_stats")
      .select("*")
      .eq("uid", uid)
      .eq("machine_id", machine.id)
      .eq("mode", mode || "")
      .maybeSingle()
      .then(
        ({ data }) => {
          if (!active) return;
          setMine(data ?? null);
          setMineLoaded(true);
        },
        () => active && setMineLoaded(true)
      );
    return () => {
      active = false;
    };
  }, [machine, mode, uid, lockStatus, supabase]);

  if (!machine || !view) return notFound();
  if (lockStatus === "checking") return <MachineSkeleton />;
  if (lockStatus === "locked") return <LockedMachine machine={machine} />;

  const challenge = view.challenge;
  const gap = mine && challenge ? Math.max(0, challenge.weight - Number(mine.pb_weight)) : null;
  const top3 = (board || []).slice(0, 3);
  const logHref = `/machine/${machine.id}/log${mode ? `?mode=${mode}` : ""}`;
  const lvl = mine ? calculateMachineLevel(mine.xp) : null;

  function openPrShare() {
    if (!mine) return;
    setSharing({
      kind: "lift",
      machineId: machine!.id,
      label: machine!.dual ? view!.label : machine!.name,
      weight: Number(mine.pb_weight),
      reps: mine.pb_reps,
      unit: machine!.unit,
      isPb: true,
      tag: "MY BEST",
    });
  }

  return (
    <>
      <div className="topbar">
        <Link href="/machines" className="iconbtn" aria-label="All machines">
          <Icon name="back" />
        </Link>
        <div className="topbar-title">Machine {String(machine.number).padStart(2, "0")}</div>
        {mine ? (
          <button type="button" className="iconbtn" onClick={openPrShare} aria-label="Share your PB">
            <Icon name="share" />
          </button>
        ) : (
          <div style={{ width: 42 }} />
        )}
      </div>

      <div className="page stack-lg">
        <section className="hero-machine" data-testid="machine-hero">
          <div className="row" style={{ alignItems: "flex-start" }}>
            <div className="eyebrow">You&rsquo;re at</div>
            {lvl && <span className="pill" style={{ background: "rgba(255,255,255,.08)", borderColor: "rgba(255,255,255,.14)", color: "#fff" }}>Level {lvl.level}</span>}
          </div>
          <h1 style={{ fontSize: 28, margin: "6px 0 6px" }}>{view.label}</h1>
          <p style={{ margin: 0, fontSize: 13 }}>{view.muscles.join(" · ")}</p>
          <div className="hero-pb">
            {mine ? (
              <>
                <div>
                  <div className="eyebrow">Your best</div>
                  <div className="big-num" style={{ fontSize: 34, marginTop: 6 }} data-testid="machine-pb">
                    {mine.pb_weight}
                    <span style={{ fontSize: 15, marginLeft: 3, opacity: 0.7 }}>{machine.unit}</span>
                    <span style={{ opacity: 0.5, margin: "0 6px" }}>×</span>
                    {mine.pb_reps}
                  </div>
                  {myBody?.body_kg ? (
                    <div className="hero-bw" data-testid="machine-bw">
                      Score {fmtScore(Number(mine.pb_weight) / myBody.body_kg)}
                    </div>
                  ) : body && body !== "off" ? (
                    <button type="button" className="hero-bw add" onClick={openBodySheet} data-testid="machine-add-bw">
                      Add body weight to get a score
                    </button>
                  ) : null}
                </div>
                {challenge && gap !== null && (
                  <div style={{ textAlign: "right" }}>
                    <div className="eyebrow">Challenge</div>
                    <div className="num" style={{ fontWeight: 700, marginTop: 6, color: gap > 0 ? "var(--accent-on-dark)" : "#9ff0c1" }}>
                      {gap > 0 ? `${gap}${machine.unit} to go` : "Cleared ✓"}
                    </div>
                  </div>
                )}
              </>
            ) : mineLoaded ? (
              <div>
                <div className="eyebrow">No PB yet</div>
                <div style={{ marginTop: 6, fontWeight: 700 }}>Your first set here sets it.</div>
              </div>
            ) : (
              <div className="skeleton" style={{ height: 40, width: "60%", opacity: 0.3 }} />
            )}
          </div>
        </section>

        {machine.dual && (
          <div className="tabs" role="tablist" aria-label="Side">
            <Link role="tab" aria-selected={mode === "pec-fly"} href={`/machine/${machine.id}?mode=pec-fly`} className={`tab${mode === "pec-fly" ? " active" : ""}`}>
              Pec Fly
            </Link>
            <Link role="tab" aria-selected={mode === "rear-delt"} href={`/machine/${machine.id}?mode=rear-delt`} className={`tab${mode === "rear-delt" ? " active" : ""}`}>
              Rear Delt
            </Link>
          </div>
        )}

        <Link href={logHref} className="btn btn-yellow btn-lg" data-testid="log-cta">
          <Icon name="flame" /> Log a set
        </Link>

        {mine && lvl && (
          <section className="bento" aria-label="Your stats on this machine">
            <div className="tile">
              <div className="t-label">Sets</div>
              <div className="t-value" style={{ fontSize: 26 }}>{mine.sets}</div>
              <div className="t-sub">{mine.sessions} session{mine.sessions === 1 ? "" : "s"}</div>
            </div>
            <div className="tile">
              <div className="t-label">Volume</div>
              <div className="t-value" style={{ fontSize: 24 }}>
                {Number(mine.volume).toLocaleString()}
                <small>{machine.unit.toLowerCase()}</small>
              </div>
              <div className="t-sub">all time</div>
            </div>
            <div className="tile span-2" style={{ minHeight: 0 }}>
              <div className="row" style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-soft)" }}>
                <span>Machine level {lvl.level}</span>
                <span className="num">
                  {lvl.into} / {lvl.need} XP
                </span>
              </div>
              <div className="progress-track" style={{ marginTop: 10 }}>
                <div className="progress-fill" style={{ width: `${Math.min(100, Math.round((100 * lvl.into) / lvl.need))}%` }} />
              </div>
            </div>
          </section>
        )}

        <section className="card">
          <div className="section-head">
            <h3>{top3[0]?.ratio != null ? `Top on this machine · ${division === "women" ? "Women" : "Men"}` : "Top on this machine"}</h3>
            <Link href={`/leaderboard?tab=machines&machine=${machine.id}${mode ? `&mode=${mode}` : ""}`}>See all</Link>
          </div>
          {board === null ? (
            <div className="stack" aria-busy="true">
              <div className="skeleton" style={{ height: 40 }} />
              <div className="skeleton" style={{ height: 40 }} />
            </div>
          ) : top3.length ? (
            top3.map((u) => (
              <LbRow
                key={u.uid || `house-${u.display_name}-${u.rank}`}
                rank={u.rank}
                name={u.display_name}
                avatarUrl={u.avatar_url}
                best={u.ratio != null ? `Score ${fmtScore(u.ratio)} · ${u.pb_reps} reps` : `${u.pb_weight}${machine.unit}×${u.pb_reps}`}
                isMe={!!u.uid && session?.user.id === u.uid}
              />
            ))
          ) : (
            <div className="empty" style={{ padding: "14px 0" }}>
              Nobody&rsquo;s on the board yet — be the first.
            </div>
          )}
        </section>

        {challenge && (
          <section className="card">
            <div className="eyebrow">
              <Icon name="bolt" /> Machine challenge
            </div>
            <h3 style={{ margin: "8px 0 10px", fontSize: 17 }}>
              Hit {challenge.weight}
              {machine.unit} × {challenge.reps}
            </h3>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${mine ? Math.min(100, Math.round((100 * Number(mine.pb_weight)) / challenge.weight)) : 0}%` }}
              />
            </div>
            <div className="faint" style={{ fontSize: 12.5, marginTop: 8 }}>
              {mine
                ? gap && gap > 0
                  ? `You're at ${mine.pb_weight}${machine.unit} — ${gap}${machine.unit} to go.`
                  : "Cleared. Respect."
                : "Log a set to start tracking this challenge."}
            </div>
          </section>
        )}

        <div className="stack">
          <Link href={`/machine/${machine.id}/guide${mode ? `?mode=${mode}` : ""}`} className="action-card">
            <div className="glyph">
              <Icon name="dumbbell" />
            </div>
            <div className="body">
              <div className="title">How to use it</div>
              <div className="sub">Setup, form and common mistakes</div>
            </div>
            <div className="chev">
              <Icon name="chev" />
            </div>
          </Link>
          <Link href={`/machine/${machine.id}/feedback${mode ? `?mode=${mode}` : ""}`} className="action-card">
            <div className="glyph">
              <Icon name="star" />
            </div>
            <div className="body">
              <div className="title">Report an issue</div>
              <div className="sub">Broken, dirty or hard to use? Tell the gym</div>
            </div>
            <div className="chev">
              <Icon name="chev" />
            </div>
          </Link>
        </div>
      </div>
      {sharing && <ShareStudio story={sharing} title="Share your best" onClose={() => setSharing(null)} />}
    </>
  );
}

function MachineSkeleton() {
  return (
    <div className="page stack-lg" aria-busy="true" aria-label="Loading machine" style={{ paddingTop: 64 }}>
      <div className="skeleton" style={{ height: 210, borderRadius: 28 }} />
      <div className="skeleton" style={{ height: 60, borderRadius: 18 }} />
      <div className="skeleton" style={{ height: 160, borderRadius: 22 }} />
    </div>
  );
}
