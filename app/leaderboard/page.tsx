"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Topbar from "@/components/Topbar";
import Icon from "@/components/Icon";
import LbRow from "@/components/LbRow";
import ShareSheet from "@/components/ShareSheet";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { fetchMachineLeaderboard, fetchOverallLeaderboard } from "@/lib/data";
import { MACHINE_MAP, MACHINES, resolveMachineView } from "@/lib/machines";
import type { ShareCardData } from "@/lib/shareCard";
import type { Database } from "@/lib/database.types";

type OverallRow = Database["public"]["Views"]["v_overall_leaderboard"]["Row"];
type MachineRow = Database["public"]["Views"]["v_machine_leaderboard"]["Row"];

export default function LeaderboardPage() {
  return (
    <Suspense fallback={null}>
      <LeaderboardInner />
    </Suspense>
  );
}

function LeaderboardInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { session } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const tab = searchParams.get("tab") || "overall";
  const machineSel = searchParams.get("machine") || MACHINES[0].id;
  const selM = MACHINE_MAP[machineSel];
  const view = selM ? resolveMachineView(selM, searchParams.get("mode")) : null;
  const mode = view?.modeKey ?? "";

  const [overallList, setOverallList] = useState<OverallRow[]>([]);
  const [machineList, setMachineList] = useState<MachineRow[]>([]);
  const [sharing, setSharing] = useState<ShareCardData | null>(null);

  useEffect(() => {
    let active = true;
    function load() {
      if (tab === "overall") {
        fetchOverallLeaderboard(supabase).then((rows) => active && setOverallList(rows));
      } else if (selM) {
        fetchMachineLeaderboard(supabase, machineSel, mode).then((rows) => active && setMachineList(rows));
      }
    }
    load();

    const channel = supabase
      .channel("leaderboard-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "machine_stats" }, load)
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [tab, machineSel, mode, selM, supabase]);

  const myUid = session?.user.id ?? null;
  const mineRow = machineList.find((x) => x.uid === myUid);
  const myRankIdx = machineList.findIndex((x) => x.uid === myUid);
  const above = myRankIdx > 0 ? machineList[myRankIdx - 1] : null;

  function openRankShare() {
    if (!mineRow || !selM) return;
    const rankLabel = selM.name + (selM.dual ? ` — ${view?.label}` : "");
    setSharing({
      eyebrow: "Leaderboard Rank",
      big: `#${mineRow.rank}`,
      sub: rankLabel,
      meta: `${mineRow.pb_weight}${selM.unit} × ${mineRow.pb_reps}`,
      dateLabel: new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
      fileTag: `rank-${machineSel}`,
      shareText: `Ranked #${mineRow.rank} on ${rankLabel} 🏆 #RackedByBijlee`,
    });
  }

  function setQuery(params: Record<string, string | undefined>) {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined) next.delete(k);
      else next.set(k, v);
    });
    router.push(`/leaderboard?${next.toString()}`);
  }

  return (
    <>
      <Topbar />
      <div className="stack-lg">
        <h1 style={{ fontSize: 24, margin: 0 }}>
          <Icon name="trophy" /> Leaderboard
        </h1>
        <div className="tabs">
          <button className={`tab${tab === "overall" ? " active" : ""}`} onClick={() => setQuery({ tab: "overall", machine: undefined, mode: undefined })}>
            Overall
          </button>
          <button className={`tab${tab === "machines" ? " active" : ""}`} onClick={() => setQuery({ tab: "machines", machine: machineSel })}>
            Machines
          </button>
        </div>

        {tab === "overall" ? (
          <div className="card" style={{ padding: "6px 8px" }}>
            {overallList.length ? (
              overallList.map((u, i) => (
                <LbRow
                  key={u.uid}
                  rank={i + 1}
                  name={u.display_name}
                  avatarUrl={u.avatar_url}
                  best={`${u.total_xp.toLocaleString()} XP`}
                  isMe={u.uid === myUid}
                />
              ))
            ) : (
              <div className="empty">Be the first on the leaderboard.</div>
            )}
          </div>
        ) : (
          <div className="stack">
            <select className="field" value={machineSel} onChange={(e) => setQuery({ machine: e.target.value, mode: undefined })}>
              {MACHINES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            {selM?.dual && (
              <div className="tabs">
                <button className={`tab${mode === "pec-fly" ? " active" : ""}`} onClick={() => setQuery({ mode: "pec-fly" })}>
                  Pec Fly
                </button>
                <button className={`tab${mode === "rear-delt" ? " active" : ""}`} onClick={() => setQuery({ mode: "rear-delt" })}>
                  Rear Delt
                </button>
              </div>
            )}
            <div className="card">
              <div className="eyebrow" style={{ marginBottom: 2 }}>
                {selM?.name}
                {selM?.dual ? ` — ${view?.label}` : ""}
              </div>
              {machineList.length ? (
                machineList.map((u) => (
                  <LbRow
                    key={u.uid}
                    rank={u.rank}
                    name={u.display_name}
                    avatarUrl={u.avatar_url}
                    best={`${u.pb_weight}${selM?.unit}×${u.pb_reps}`}
                    isMe={u.uid === myUid}
                  />
                ))
              ) : (
                <div className="empty">Be the first on the leaderboard.</div>
              )}
            </div>
            {myUid && mineRow ? (
              <div className="card dark-card" style={{ border: "none" }}>
                <div className="row">
                  <div className="eyebrow accent">Your Rank</div>
                  <button
                    className="btn-sm btn-outline"
                    style={{ borderColor: "rgba(255,255,255,.3)", color: "#fff", padding: "6px 12px", fontSize: 12 }}
                    onClick={openRankShare}
                  >
                    <Icon name="bolt" /> Share
                  </button>
                </div>
                <div className="row" style={{ marginTop: 6, alignItems: "flex-end" }}>
                  <div className="num" style={{ fontSize: 26, fontWeight: 700, color: "#fff" }}>#{mineRow.rank}</div>
                  {above && (
                    <div className="muted-on-dark" style={{ fontSize: 12 }}>
                      You&rsquo;re {(Number(above.pb_weight) - Number(mineRow.pb_weight)).toFixed(1).replace(/\.0$/, "")}
                      {selM?.unit} away from #{mineRow.rank - 1}
                    </div>
                  )}
                </div>
              </div>
            ) : myUid ? (
              <p className="faint center" style={{ fontSize: 12.5 }}>
                Log a set on this machine to get ranked.
              </p>
            ) : null}
          </div>
        )}
      </div>
      {sharing && <ShareSheet data={sharing} onClose={() => setSharing(null)} />}
    </>
  );
}
