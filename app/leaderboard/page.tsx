"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Topbar from "@/components/Topbar";
import Icon from "@/components/Icon";
import LbRow from "@/components/LbRow";
import Avatar from "@/components/Avatar";
import ShareSheet from "@/components/ShareSheet";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { fetchMachineLeaderboard, fetchOverallLeaderboard } from "@/lib/data";
import { MACHINE_MAP, MACHINES, resolveMachineView } from "@/lib/machines";
import { PERIOD_OPTIONS, type Period } from "@/lib/period";
import type { ShareCardData } from "@/lib/shareCard";
import type { Database } from "@/lib/database.types";

type OverallRow = Database["public"]["Functions"]["leaderboard_overall"]["Returns"][number];
type MachineRow = Database["public"]["Functions"]["leaderboard_machine"]["Returns"][number];

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
  const period = (searchParams.get("period") as Period) || "all";

  const [overallList, setOverallList] = useState<OverallRow[] | null>(null);
  const [machineList, setMachineList] = useState<MachineRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [sharing, setSharing] = useState<ShareCardData | null>(null);

  useEffect(() => {
    let active = true;
    function load() {
      if (tab === "overall") {
        fetchOverallLeaderboard(supabase, period)
          .then((rows) => {
            if (!active) return;
            setOverallList(rows);
            setFailed(false);
          })
          .catch(() => active && (setFailed(true), setOverallList((l) => l ?? [])));
      } else if (selM) {
        fetchMachineLeaderboard(supabase, machineSel, mode, period)
          .then((rows) => {
            if (!active) return;
            setMachineList(rows);
            setFailed(false);
          })
          .catch(() => active && (setFailed(true), setMachineList((l) => l ?? [])));
      }
    }
    if (tab === "overall") setOverallList(null);
    else setMachineList(null);
    load();

    // machine_stats only tracks all-time totals, but any write to it means a
    // set was just logged, so it's still the right signal to refetch a
    // period-scoped leaderboard on, too.
    const channel = supabase
      .channel("leaderboard-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "machine_stats" }, load)
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [tab, machineSel, mode, period, selM, supabase, reloadKey]);

  const myUid = session?.user.id ?? null;
  const mList = machineList || [];
  const mineRow = mList.find((x) => x.uid === myUid);
  const myRankIdx = mList.findIndex((x) => x.uid === myUid);
  const above = myRankIdx > 0 ? mList[myRankIdx - 1] : null;
  const myOverallIdx = (overallList || []).findIndex((x) => x.uid === myUid);

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
    router.replace(`/leaderboard?${next.toString()}`, { scroll: false });
  }

  const rows: { uid: string; rank: number; name: string; avatar: string | null; best: string }[] =
    tab === "overall"
      ? (overallList || []).map((u, i) => ({ uid: u.uid, rank: i + 1, name: u.display_name, avatar: u.avatar_url, best: `${u.total_xp.toLocaleString()} XP` }))
      : mList.map((u) => ({ uid: u.uid, rank: u.rank, name: u.display_name, avatar: u.avatar_url, best: `${u.pb_weight}${selM?.unit === "KG" ? "kg" : selM?.unit ?? ""}×${u.pb_reps}` }));
  const isLoading = tab === "overall" ? overallList === null : machineList === null;
  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);

  return (
    <>
      <Topbar />
      <div className="page stack-lg">
        <header>
          <h1 style={{ fontSize: 27, margin: 0 }}>Leaderboard</h1>
        </header>
        <div className="tabs" role="tablist" aria-label="Leaderboard type">
          <button role="tab" aria-selected={tab === "overall"} className={`tab${tab === "overall" ? " active" : ""}`} onClick={() => setQuery({ tab: "overall", machine: undefined, mode: undefined })}>
            Overall XP
          </button>
          <button role="tab" aria-selected={tab === "machines"} className={`tab${tab === "machines" ? " active" : ""}`} onClick={() => setQuery({ tab: "machines", machine: machineSel })}>
            By machine
          </button>
        </div>

        {tab === "machines" && (
          <div className="scroll-row" aria-label="Choose a machine">
            {MACHINES.map((m) => (
              <button
                key={m.id}
                type="button"
                className="chip"
                aria-pressed={m.id === machineSel}
                onClick={() => setQuery({ machine: m.id, mode: undefined })}
              >
                {m.name}
              </button>
            ))}
          </div>
        )}
        {tab === "machines" && selM?.dual && (
          <div className="tabs" role="tablist" aria-label="Side">
            <button role="tab" aria-selected={mode === "pec-fly"} className={`tab${mode === "pec-fly" ? " active" : ""}`} onClick={() => setQuery({ mode: "pec-fly" })}>
              Pec Fly
            </button>
            <button role="tab" aria-selected={mode === "rear-delt"} className={`tab${mode === "rear-delt" ? " active" : ""}`} onClick={() => setQuery({ mode: "rear-delt" })}>
              Rear Delt
            </button>
          </div>
        )}

        <div className="scroll-row" aria-label="Time period">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className="chip"
              aria-pressed={period === opt.key}
              onClick={() => setQuery({ period: opt.key === "all" ? undefined : opt.key })}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="card" aria-busy="true" aria-label="Loading leaderboard">
            <div className="podium">
              {[0, 1, 2].map((i) => (
                <div key={i} className="podium-spot">
                  <div className="skeleton" style={{ width: 52, height: 52, borderRadius: "50%", margin: "0 auto 8px" }} />
                  <div className="skeleton sk-line" style={{ width: "70%", margin: "0 auto" }} />
                  <div className="skeleton" style={{ height: [64, 86, 48][i], marginTop: 10, borderRadius: "16px 16px 6px 6px" }} />
                </div>
              ))}
            </div>
          </div>
        ) : failed && rows.length === 0 ? (
          <div className="card empty">
            <div style={{ fontWeight: 800, color: "var(--ink)" }}>Couldn&rsquo;t load the leaderboard</div>
            <p style={{ margin: "4px 0 14px", fontSize: 13.5 }}>Check your connection and try again.</p>
            <button type="button" className="btn btn-primary btn-sm" style={{ margin: "0 auto" }} onClick={() => setReloadKey((k) => k + 1)}>
              <Icon name="refresh" /> Try again
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="card empty">
            <div style={{ fontWeight: 800, color: "var(--ink)" }}>No one on the board {period === "all" ? "yet" : "for this period"}</div>
            <p style={{ margin: "4px 0 0", fontSize: 13.5 }}>Log a set to claim the top spot.</p>
          </div>
        ) : (
          <section className="card" data-testid="leaderboard">
            {tab === "machines" && (
              <div className="eyebrow" style={{ marginBottom: 10 }}>
                {selM?.name}
                {selM?.dual ? ` — ${view?.label}` : ""}
              </div>
            )}
            <div className="podium" data-testid="podium">
              {[podium[1], podium[0], podium[2]].map((u, i) =>
                u ? (
                  <div key={u.uid} className={`podium-spot p${u.rank <= 3 ? u.rank : 3}${u.uid === myUid ? " me" : ""}`}>
                    <Avatar name={u.name} url={u.avatar} size={u.rank === 1 ? 64 : 52} />
                    <div className="pname">{u.uid === myUid ? "You" : u.name.split(" ")[0]}</div>
                    <div className="pval">{u.best}</div>
                    <div className="block">{u.rank}</div>
                  </div>
                ) : (
                  <div key={`empty-${i}`} className="podium-spot" />
                )
              )}
            </div>
            {rest.length > 0 && (
              <div style={{ marginTop: 10 }}>
                {rest.map((u) => (
                  <LbRow key={u.uid} rank={u.rank} name={u.name} avatarUrl={u.avatar} best={u.best} isMe={u.uid === myUid} />
                ))}
              </div>
            )}
          </section>
        )}

        {tab === "overall" && myUid && myOverallIdx >= 3 && overallList && (
          <div className="card dark-card" data-testid="my-rank">
            <div className="eyebrow">Your rank</div>
            <div className="big-num" style={{ fontSize: 30, marginTop: 6 }}>#{myOverallIdx + 1}</div>
            <div className="muted-on-dark" style={{ fontSize: 12.5, marginTop: 4 }}>
              {(overallList[myOverallIdx - 1].total_xp - overallList[myOverallIdx].total_xp).toLocaleString()} XP behind #{myOverallIdx}
            </div>
          </div>
        )}

        {tab === "machines" &&
          (myUid && mineRow ? (
            <div className="card dark-card" data-testid="my-rank">
              <div className="row">
                <div className="eyebrow">Your rank</div>
                <button
                  className="btn btn-sm"
                  style={{ background: "rgba(255,255,255,.1)", color: "#fff", border: "1px solid rgba(255,255,255,.18)" }}
                  onClick={openRankShare}
                >
                  <Icon name="share" /> Share
                </button>
              </div>
              <div className="row" style={{ marginTop: 6, alignItems: "flex-end" }}>
                <div className="big-num" style={{ fontSize: 30 }}>#{mineRow.rank}</div>
                {above && (
                  <div className="muted-on-dark" style={{ fontSize: 12.5, textAlign: "right" }}>
                    {(Number(above.pb_weight) - Number(mineRow.pb_weight)).toFixed(1).replace(/\.0$/, "")}
                    {selM?.unit} to pass #{mineRow.rank - 1}
                  </div>
                )}
              </div>
            </div>
          ) : myUid && !isLoading ? (
            <p className="faint center" style={{ fontSize: 13 }}>
              Log a set on this machine to get ranked.
            </p>
          ) : null)}
      </div>
      {sharing && <ShareSheet data={sharing} onClose={() => setSharing(null)} />}
    </>
  );
}
