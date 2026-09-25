"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { notFound, useSearchParams } from "next/navigation";
import Icon from "@/components/Icon";
import LbRow from "@/components/LbRow";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { fetchMachineLeaderboard, recordTap } from "@/lib/data";
import { calculateMachineLevel } from "@/lib/gamification";
import { MACHINE_MAP, resolveMachineView } from "@/lib/machines";
import type { Database } from "@/lib/database.types";

type StatsRow = Database["public"]["Tables"]["machine_stats"]["Row"];
type LbRowType = Database["public"]["Views"]["v_machine_leaderboard"]["Row"];

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
  const supabase = useMemo(() => createClient(), []);

  const modeParam = searchParams.get("mode");
  const view = machine ? resolveMachineView(machine, modeParam) : null;
  const mode = view?.modeKey ?? null;

  const [mine, setMine] = useState<StatsRow | null>(null);
  const [board, setBoard] = useState<LbRowType[]>([]);

  useEffect(() => {
    if (!machine) return;
    recordTap(supabase, machine.id);
  }, [machine, supabase]);

  useEffect(() => {
    if (!machine) return;
    fetchMachineLeaderboard(supabase, machine.id, mode || "").then(setBoard);
  }, [machine, mode, supabase]);

  useEffect(() => {
    if (!machine || !session) {
      setMine(null);
      return;
    }
    supabase
      .from("machine_stats")
      .select("*")
      .eq("uid", session.user.id)
      .eq("machine_id", machine.id)
      .eq("mode", mode || "")
      .maybeSingle()
      .then(({ data }) => setMine(data ?? null));
  }, [machine, mode, session, supabase]);

  if (!machine || !view) return notFound();

  const challenge = view.challenge;
  const gap = mine && challenge ? Math.max(0, challenge.weight - Number(mine.pb_weight)) : null;
  const top3 = board.slice(0, 3);

  return (
    <>
      <div className="topbar">
        <Link href="/machines" className="iconbtn" aria-label="Back">
          <Icon name="back" />
        </Link>
        <div className="pill">
          <Icon name="bolt" /> Machine #{machine.number}
        </div>
        <div style={{ width: 38 }} />
      </div>

      <div className="stack-lg">
        <div className="hero-machine">
          <div className="glyph-lg">
            <Icon name="dumbbell" />
          </div>
          <div className="eyebrow" style={{ color: "rgba(255,255,255,.55)" }}>
            You are at
          </div>
          <h1>{machine.name}</h1>
          <div
            className="pill"
            style={{ position: "relative", background: "rgba(255,255,255,.1)", borderColor: "rgba(255,255,255,.15)", color: "#fff", marginTop: 2 }}
          >
            Machine #{machine.number}
          </div>
        </div>

        {machine.dual && (
          <div className="tabs">
            <Link href={`/machine/${machine.id}?mode=pec-fly`} className={`tab${mode === "pec-fly" ? " active" : ""}`}>
              Pec Fly
            </Link>
            <Link href={`/machine/${machine.id}?mode=rear-delt`} className={`tab${mode === "rear-delt" ? " active" : ""}`}>
              Rear Delt
            </Link>
          </div>
        )}

        {mine ? (
          <div className="card dark-card" style={{ border: "none" }}>
            <div className="eyebrow accent">Welcome back 🔥</div>
            <div className="row" style={{ marginTop: 8, alignItems: "flex-end" }}>
              <div>
                <div className="muted-on-dark" style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" }}>
                  Your PB
                </div>
                <div className="num" style={{ fontSize: 26, fontWeight: 700, color: "#fff" }}>
                  {mine.pb_weight}
                  {machine.unit} × {mine.pb_reps}
                </div>
              </div>
              {challenge &&
                (gap && gap > 0 ? (
                  <div style={{ textAlign: "right" }}>
                    <div className="muted-on-dark" style={{ fontSize: 11.5 }}>to challenge</div>
                    <div className="num accent" style={{ fontWeight: 700 }}>
                      {gap}
                      {machine.unit}
                    </div>
                  </div>
                ) : (
                  <div className="pill-yellow">Challenge cleared</div>
                ))}
            </div>
          </div>
        ) : (
          <div className="empty" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20 }}>
            <div className="glyph" style={{ width: 44, height: 44, margin: "0 auto 12px", color: "var(--ink-faint)" }}>
              <Icon name="target" />
            </div>
            <div style={{ fontWeight: 700, color: "var(--ink)" }}>No PB yet</div>
            <div style={{ fontSize: 13, marginTop: 2 }}>Your first set could change that. 🔥</div>
          </div>
        )}

        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Target Muscles
          </div>
          <div className="chip-row">
            {view.muscles.map((x) => (
              <span className="pill" key={x}>
                {x}
              </span>
            ))}
          </div>
        </div>

        <div className="stack">
          <Link href={`/machine/${machine.id}/guide${mode ? `?mode=${mode}` : ""}`} className="action-card">
            <div className="glyph">
              <Icon name="dumbbell" />
            </div>
            <div className="body">
              <div className="title">How to use</div>
              <div className="sub">Learn the correct setup and form</div>
            </div>
            <div className="chev">
              <Icon name="chev" />
            </div>
          </Link>
          <Link href={`/machine/${machine.id}/log${mode ? `?mode=${mode}` : ""}`} className="action-card">
            <div className="glyph yellow">
              <Icon name="flame" />
            </div>
            <div className="body">
              <div className="title">Log your set</div>
              <div className="sub">Track your weight, reps & PB</div>
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
              <div className="title">Give feedback</div>
              <div className="sub">Help the gym improve</div>
            </div>
            <div className="chev">
              <Icon name="chev" />
            </div>
          </Link>
        </div>

        {mine && (
          <div className="card">
            <div className="row">
              <h3 style={{ margin: 0, fontSize: 15 }}>Your {view.label}</h3>
              <span className="pill-yellow">LVL {mine.level}</span>
            </div>
            <div className="stat-grid" style={{ marginTop: 12 }}>
              <div className="stat-tile">
                <div className="v">{mine.sets}</div>
                <div className="l">Sets logged</div>
              </div>
              <div className="stat-tile">
                <div className="v">{mine.sessions}</div>
                <div className="l">Sessions</div>
              </div>
              <div className="stat-tile">
                <div className="v">{Number(mine.volume).toLocaleString()}</div>
                <div className="l">KG Volume</div>
              </div>
            </div>
            {(() => {
              const lvl = calculateMachineLevel(mine.xp);
              return (
                <div style={{ marginTop: 14 }}>
                  <div className="row" style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-soft)" }}>
                    <span>Machine Level</span>
                    <span className="num">
                      {lvl.into} / {lvl.need} XP
                    </span>
                  </div>
                  <div className="progress-track" style={{ marginTop: 6 }}>
                    <div className="progress-fill" style={{ width: `${Math.min(100, Math.round((100 * lvl.into) / lvl.need))}%` }} />
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {challenge && (
          <div className="card">
            <div className="row">
              <div className="eyebrow">
                <Icon name="bolt" /> Machine Challenge
              </div>
            </div>
            <h3 style={{ margin: "8px 0 2px", fontSize: 17 }}>
              Hit {challenge.weight}
              {machine.unit} × {challenge.reps}
            </h3>
            {mine ? (
              <>
                <p className="muted" style={{ margin: "0 0 10px", fontSize: 13 }}>
                  Your current:{" "}
                  <b className="num" style={{ color: "var(--ink)" }}>
                    {mine.pb_weight}
                    {machine.unit} × {mine.pb_reps}
                  </b>
                </p>
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{ width: `${Math.min(100, Math.round((100 * Number(mine.pb_weight)) / challenge.weight))}%` }}
                  />
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    {Math.max(0, challenge.weight - Number(mine.pb_weight))}
                    {machine.unit} to go
                  </span>
                  <Link href={`/machine/${machine.id}/log${mode ? `?mode=${mode}` : ""}`} className="btn btn-yellow btn-sm">
                    Let&rsquo;s go 🔥
                  </Link>
                </div>
              </>
            ) : (
              <>
                <p className="muted" style={{ fontSize: 13, margin: "0 0 10px" }}>
                  Log a set to start tracking this challenge.
                </p>
                <Link href={`/machine/${machine.id}/log${mode ? `?mode=${mode}` : ""}`} className="btn btn-yellow btn-sm">
                  Let&rsquo;s go 🔥
                </Link>
              </>
            )}
          </div>
        )}

        <div className="card">
          <div className="row">
            <h3 style={{ margin: 0, fontSize: 15 }}>
              <Icon name="trophy" /> Top Performers
            </h3>
            <Link
              href={`/leaderboard?tab=machines&machine=${machine.id}${mode ? `&mode=${mode}` : ""}`}
              className="faint"
              style={{ fontSize: 12, fontWeight: 700 }}
            >
              See all
            </Link>
          </div>
          <div style={{ marginTop: 6 }}>
            {top3.length ? (
              top3.map((u) => (
                <LbRow
                  key={u.uid}
                  rank={u.rank}
                  name={u.display_name}
                  avatarUrl={u.avatar_url}
                  best={`${u.pb_weight}${machine.unit}×${u.pb_reps}`}
                  isMe={session?.user.id === u.uid}
                />
              ))
            ) : (
              <div className="empty" style={{ padding: "16px 0" }}>
                Be the first on the leaderboard.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
