"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Topbar from "@/components/Topbar";
import Icon from "@/components/Icon";
import Avatar from "@/components/Avatar";
import BoltMark from "@/components/BoltMark";
import GymMark from "@/components/GymMark";
import ShareSheet from "@/components/ShareSheet";
import CountUp from "@/components/tv/CountUp";
import { BadgesSection, MissionsCard, StreakCard } from "@/components/rewards/parts";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { fetchMachineLeaderboard, fetchOverallLeaderboard } from "@/lib/data";
import { useGym } from "@/lib/gym";
import { MACHINE_MAP, MACHINES, resolveMachineView } from "@/lib/machines";
import { PERIOD_OPTIONS, type Period } from "@/lib/period";
import { toast } from "@/lib/toast";
import {
  awardsToast,
  fetchMyRewards,
  fetchRewardsOverview,
  fetchSeasonBoard,
  fmtXp,
  setsFor,
  syncMyRewards,
  timeLeft,
  type MyRewards,
  type RewardsOverview,
} from "@/lib/rewards";
import type { ShareCardData } from "@/lib/shareCard";

type Tab = "week" | "all" | "machine";
type Row = { key: string; rank: number; name: string; avatar: string | null; value: number; label: string; isMe: boolean };

const TABS: { key: Tab; label: string }[] = [
  { key: "week", label: "This week" },
  { key: "all", label: "All time" },
  { key: "machine", label: "By machine" },
];

export default function LeaderboardPage() {
  return (
    <Suspense fallback={null}>
      <LeaderboardInner />
    </Suspense>
  );
}

function parseTab(raw: string | null): Tab {
  if (raw === "all" || raw === "overall") return "all";
  if (raw === "machine" || raw === "machines") return "machine";
  return "week";
}

function LeaderboardInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { session, profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const gym = useGym();

  const tab = parseTab(params.get("tab"));
  const machineSel = params.get("machine") || MACHINES[0].id;
  const selM = MACHINE_MAP[machineSel];
  const view = selM ? resolveMachineView(selM, params.get("mode")) : null;
  const mode = view?.modeKey ?? "";
  const period = (params.get("period") as Period) || "all";
  const myUid = session?.user.id ?? null;
  const myFirst = (profile?.display_name || "").split(" ")[0];

  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [weekSource, setWeekSource] = useState<"season" | "xp">("season");
  const [ov, setOv] = useState<RewardsOverview | null>(null);
  const [me, setMe] = useState<MyRewards | null>(null);
  const [sharing, setSharing] = useState<ShareCardData | null>(null);

  function setQuery(next: Record<string, string | undefined>) {
    const q = new URLSearchParams(params.toString());
    Object.entries(next).forEach(([k, v]) => (v === undefined ? q.delete(k) : q.set(k, v)));
    router.replace(`/leaderboard${q.toString() ? `?${q}` : ""}`, { scroll: false });
  }

  // ---- the board
  const load = useCallback(async () => {
    try {
      let next: Row[];
      if (tab === "week") {
        try {
          const board = await fetchSeasonBoard(supabase, null, 50);
          next = board.map((r) => ({ key: `${r.rank}-${r.name}`, rank: r.rank, name: r.name, avatar: null, value: r.score, label: "XP", isMe: !!myUid && r.is_me }));
          setWeekSource("season");
        } catch {
          // rewards not set up yet: this week's XP from the classic board
          const list = await fetchOverallLeaderboard(supabase, "week");
          next = list.map((u, i) => ({ key: u.uid, rank: i + 1, name: u.display_name, avatar: u.avatar_url, value: u.total_xp, label: "XP", isMe: u.uid === myUid }));
          setWeekSource("xp");
        }
      } else if (tab === "all") {
        const list = await fetchOverallLeaderboard(supabase, "all");
        next = list.map((u, i) => ({ key: u.uid, rank: i + 1, name: u.display_name, avatar: u.avatar_url, value: u.total_xp, label: "XP", isMe: u.uid === myUid }));
      } else {
        if (!selM) return;
        const list = await fetchMachineLeaderboard(supabase, machineSel, mode, period);
        const unit = selM.unit === "KG" ? "kg" : selM.unit.toLowerCase();
        next = list.map((u) => ({
          key: u.uid,
          rank: u.rank,
          name: u.display_name,
          avatar: u.avatar_url,
          value: Number(u.pb_weight),
          label: `${unit} × ${u.pb_reps}`,
          isMe: u.uid === myUid,
        }));
      }
      setRows(next);
      setFailed(false);
    } catch {
      setFailed(true);
      setRows((r) => r ?? []);
    }
  }, [tab, supabase, myUid, selM, machineSel, mode, period]);

  useEffect(() => {
    setRows(null);
    load();
    // any write to machine_stats means someone just logged a set
    const channel = supabase
      .channel("leaderboard-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "machine_stats" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, supabase, reloadKey]);

  // ---- the race + your progress (rewards, 0011)
  useEffect(() => {
    let alive = true;
    fetchRewardsOverview(supabase).then(
      (o) => alive && setOv(o),
      () => undefined
    );
    if (myUid) {
      (async () => {
        try {
          const t = awardsToast(await syncMyRewards(supabase));
          if (t && alive) toast(t);
        } catch {
          /* ignore */
        }
        try {
          const m = await fetchMyRewards(supabase);
          if (alive) setMe(m);
        } catch {
          /* rewards not set up */
        }
      })();
    }
    return () => {
      alive = false;
    };
  }, [supabase, myUid]);

  const list = rows || [];
  const podium = list.slice(0, 3);
  const rest = list.slice(3);
  const mine = list.find((r) => r.isMe) || null;
  const above = mine && mine.rank > 1 ? list.find((r) => r.rank === mine.rank - 1) : null;
  const prize = ov?.season?.prizes[0];
  const prizePlaces = (ov?.season?.prizes || []).reduce((m, p) => Math.max(m, p.rank_to), 0);
  const isLoading = rows === null;
  const subject = tab === "machine" && selM ? `${selM.name}${selM.dual ? ` (${view?.label})` : ""}` : tab === "week" ? "this week" : "all time";

  let gap: string | null = null;
  if (mine && above) {
    if (tab === "machine") {
      const kg = Math.round((above.value - mine.value) * 100) / 100;
      gap = kg > 0 ? `${kg} kg to pass ${above.name.split(" ")[0]}` : `Beat ${above.name.split(" ")[0]} on reps`;
    } else {
      const xp = above.value - mine.value + 1;
      gap = `${fmtXp(xp)} XP (about ${setsFor(xp)} sets) to pass ${above.name.split(" ")[0]}`;
    }
  }

  function shareRank() {
    if (!mine) return;
    const where = tab === "machine" && selM ? subject : tab === "week" ? "This week" : "All time";
    setSharing({
      eyebrow: `${gym.name} leaderboard`,
      big: `#${mine.rank}`,
      sub: where,
      meta: tab === "machine" ? `${mine.value}${mine.label.replace(/^kg/, "KG")}` : `${fmtXp(mine.value)} XP`,
      dateLabel: new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
      fileTag: `rank-${tab}`,
      shareText: `#${mine.rank} on the ${gym.name} leaderboard (${where.toLowerCase()}) 🏆 #RackedByBijlee`,
    });
  }

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
      <div className="page stack-lg lbx" data-testid="ranks">
        <header className="lbx-hero" data-testid="lbx-hero">
          <GymMark variant="lockup" onDark label="Leaderboard" />
          <div className="lbx-hero-foot">
            <span className="lbx-powered">
              <BoltMark className="lbx-bolt" /> Powered by Racked × Bijlee
            </span>
            {ov?.season && (
              <span className="lbx-ends">
                <Icon name="timer" /> Week ends in {timeLeft(ov.season.ends_at)}
              </span>
            )}
          </div>
        </header>

        <div className="rw-tabs" role="tablist" aria-label="Leaderboard" style={{ ["--n" as string]: 3, ["--i" as string]: TABS.findIndex((t) => t.key === tab) }}>
          <span className="rw-tabs-glider" aria-hidden="true" />
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={tab === t.key ? "on" : ""}
              onClick={() => setQuery({ tab: t.key === "week" ? undefined : t.key, machine: t.key === "machine" ? machineSel : undefined, mode: undefined, period: undefined })}
              data-testid={`lb-tab-${t.key}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "machine" && (
          <>
            <div className="scroll-row" aria-label="Choose a machine">
              {MACHINES.map((m) => (
                <button key={m.id} type="button" className="chip" aria-pressed={m.id === machineSel} onClick={() => setQuery({ machine: m.id, mode: undefined })}>
                  {m.name}
                </button>
              ))}
            </div>
            {selM?.dual && (
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
                <button key={opt.key} type="button" className="chip" aria-pressed={period === opt.key} onClick={() => setQuery({ period: opt.key === "all" ? undefined : opt.key })}>
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        )}

        {tab === "week" && prize && weekSource === "season" && (
          <Link href="/rewards" className="lbx-prize" data-testid="lb-prize-race">
            <span className="lbx-prize-art" aria-hidden="true">
              {prize.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={prize.image_url} alt="" />
              ) : (
                <Icon name="gift" />
              )}
            </span>
            <span className="lbx-prize-body">
              <span className="lbx-prize-eyebrow">#1 this week wins</span>
              <b>{prize.title}</b>
            </span>
            <Icon name="chev" />
          </Link>
        )}

        {isLoading ? (
          <div className="card lbx-board" aria-busy="true" aria-label="Loading leaderboard">
            <div className="podium">
              {[0, 1, 2].map((i) => (
                <div key={i} className="podium-spot">
                  <div className="skeleton" style={{ width: 56, height: 56, borderRadius: "50%", margin: "0 auto 8px" }} />
                  <div className="skeleton sk-line" style={{ width: "70%", margin: "0 auto" }} />
                  <div className="skeleton" style={{ height: [70, 96, 54][i], marginTop: 10, borderRadius: "18px 18px 6px 6px" }} />
                </div>
              ))}
            </div>
          </div>
        ) : failed && list.length === 0 ? (
          <div className="card empty">
            <div style={{ fontWeight: 800, color: "var(--ink)" }}>Couldn&rsquo;t load the leaderboard</div>
            <p style={{ margin: "4px 0 14px", fontSize: 13.5 }}>Check your connection and try again.</p>
            <button type="button" className="btn btn-primary btn-sm" style={{ margin: "0 auto" }} onClick={() => setReloadKey((k) => k + 1)}>
              <Icon name="refresh" /> Try again
            </button>
          </div>
        ) : list.length === 0 ? (
          <div className="card empty lbx-empty">
            <span className="tapin-icons" style={{ margin: "0 auto 10px" }} aria-hidden="true">
              <Icon name="trophy" />
            </span>
            <div style={{ fontWeight: 800, color: "var(--ink)" }}>The board is wide open</div>
            <p style={{ margin: "4px 0 0", fontSize: 13.5 }}>Log a set and you&rsquo;re #1 {tab === "machine" ? `on ${subject}` : subject}.</p>
          </div>
        ) : (
          <section className="card lbx-board" data-testid="leaderboard" key={`${tab}-${machineSel}-${mode}-${period}`}>
            {tab === "machine" && <div className="eyebrow" style={{ marginBottom: 12 }}>{subject}</div>}
            <Podium rows={podium} prizePlaces={tab === "week" && weekSource === "season" ? prizePlaces : 0} />
            {rest.length > 0 && <BoardRows rows={rest} prizePlaces={tab === "week" && weekSource === "season" ? prizePlaces : 0} />}
          </section>
        )}

        {myUid && !isLoading && (
          <div className={`lbx-you${mine ? "" : " empty"}`} data-testid="my-rank">
            {mine ? (
              <>
                <span className="lbx-you-rank display">#{mine.rank}</span>
                <span className="lbx-you-body">
                  <b>
                    You · {tab === "machine" ? `${mine.value} ${mine.label}` : `${fmtXp(mine.value)} XP`}
                  </b>
                  <span>{mine.rank === 1 ? `Top of the board ${tab === "machine" ? "" : subject}`.trim() : gap}</span>
                </span>
                <button type="button" className="lbx-you-share" onClick={shareRank} aria-label="Share your rank" data-testid="share-rank">
                  <Icon name="share" />
                </button>
              </>
            ) : (
              <span className="lbx-you-body">
                <b>{myFirst ? `${myFirst}, you're not on this board yet` : "You're not on this board yet"}</b>
                <span>{tab === "machine" ? `Log a set on ${subject} to get ranked.` : "Log a set to get on the board."}</span>
              </span>
            )}
          </div>
        )}

        {myUid && ov && (
          <section id="progress" className="stack-lg lbx-progress" data-testid="lb-progress" aria-labelledby="lb-progress-h">
            <div className="lbx-section-head">
              <h2 id="lb-progress-h">Your progress</h2>
              <p>Streaks, missions and badges all earn bonus XP, and that counts towards this week&rsquo;s prize.</p>
            </div>
            <StreakCard steps={ov.streak_steps} me={me} />
            <MissionsCard defs={ov.missions} me={me} />
            <BadgesSection defs={ov.badges} me={me} />
          </section>
        )}
      </div>
      {sharing && <ShareSheet data={sharing} onClose={() => setSharing(null)} />}
    </>
  );
}

// ---- podium: rises in, numbers count up, #1 gets the gold treatment ------
function Podium({ rows, prizePlaces }: { rows: Row[]; prizePlaces: number }) {
  const order = [rows[1], rows[0], rows[2]];
  return (
    <div className="podium lbx-podium" data-testid="podium">
      {order.map((u, i) =>
        u ? (
          <div key={u.key} className={`podium-spot p${Math.min(u.rank, 3)}${u.isMe ? " me" : ""}`} style={{ ["--d" as string]: `${[0.12, 0, 0.24][i]}s` }}>
            {u.rank === 1 && (
              <span className="lbx-crown" aria-hidden="true">
                <Icon name="trophy" />
              </span>
            )}
            <Avatar name={u.name} url={u.avatar} size={u.rank === 1 ? 68 : 54} />
            <div className="pname">{u.isMe ? "You" : u.name.split(" ")[0]}</div>
            <div className="pval num">
              <CountUp value={u.value} duration={1100} format={(n) => n.toLocaleString("en-IN")} /> <small>{u.label}</small>
            </div>
            <div className="block">
              <span>{u.rank}</span>
              {prizePlaces >= u.rank && (
                <>
                  <i className="lbx-prize-dot" aria-hidden="true" />
                  <span className="sr-only">In the prizes</span>
                </>
              )}
            </div>
          </div>
        ) : (
          <div key={`empty-${i}`} className={`podium-spot open p${[2, 1, 3][i]}`}>
            <span className="avatar lbx-open-av" style={{ width: 54, height: 54 }} aria-hidden="true">
              ?
            </span>
            <div className="pname">Open</div>
            <div className="pval">Be next</div>
            <div className="block">
              <span>{[2, 1, 3][i]}</span>
            </div>
          </div>
        )
      )}
    </div>
  );
}

// ---- rows 4+: slide into place when someone overtakes (FLIP) -------------
function BoardRows({ rows, prizePlaces }: { rows: Row[]; prizePlaces: number }) {
  const box = useRef<HTMLDivElement>(null);
  const prev = useRef<Map<string, number>>(new Map());

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const next = new Map<string, number>();
    el.querySelectorAll<HTMLElement>("[data-key]").forEach((node) => {
      const key = node.dataset.key!;
      const top = node.offsetTop;
      next.set(key, top);
      const before = prev.current.get(key);
      if (!reduce && before !== undefined && before !== top) {
        node.animate([{ transform: `translateY(${before - top}px)` }, { transform: "translateY(0)" }], { duration: 520, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
      }
    });
    prev.current = next;
  }, [rows]);

  return (
    <div className="lbx-rows" ref={box}>
      {rows.map((u, i) => (
        <div
          key={u.key}
          data-key={u.key}
          className={`lb-row${u.isMe ? " me" : ""}${prizePlaces >= u.rank ? " prized" : ""}`}
          style={{ ["--d" as string]: `${0.3 + Math.min(i, 8) * 0.05}s` }}
        >
          <div className="rank num" aria-label={`Rank ${u.rank}`}>
            {u.rank}
          </div>
          <Avatar name={u.name} url={u.avatar} />
          <div className="name">{u.isMe ? "You" : u.name}</div>
          {prizePlaces >= u.rank && (
            <span className="lbx-row-prize">
              <Icon name="gift" />
              <span className="sr-only">In the prizes</span>
            </span>
          )}
          <div className="best num">
            {u.value.toLocaleString("en-IN")} <small>{u.label}</small>
          </div>
        </div>
      ))}
    </div>
  );
}
