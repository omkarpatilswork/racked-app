"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Topbar from "@/components/Topbar";
import Icon from "@/components/Icon";
import Avatar from "@/components/Avatar";
import BoltMark from "@/components/BoltMark";
import GymMark from "@/components/GymMark";
import ShareStudio from "@/components/share/ShareStudio";
import CountUp from "@/components/tv/CountUp";
import { BadgesSection, MissionsCard, StreakCard } from "@/components/rewards/parts";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { fetchMachineBoard, fetchOverallLeaderboard } from "@/lib/data";
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
  isStrength,
  setsFor,
  syncMyRewards,
  timeLeft,
  type MyRewards,
  type RewardsOverview,
} from "@/lib/rewards";
import type { StoryData } from "@/lib/story";
import DivisionTabs from "@/components/DivisionTabs";
import { useMyBody } from "@/components/BodySheet";
import { BODY_CHANGED, defaultBoard, openBodySheet, type BoardView } from "@/lib/body";

type Tab = "week" | "all" | "machine";
// ever: one of the machine's best-ever lifts filling a short period board (0013)
// bw: value is ×BW (0015), shown with 2 decimals
type Row = { key: string; rank: number; name: string; avatar: string | null; value: number; label: string; isMe: boolean; ever?: boolean; bw?: boolean; kg?: number | null };
const fmtVal = (r: Pick<Row, "value" | "bw">) => (r.bw ? r.value.toFixed(2) : r.value.toLocaleString("en-IN"));

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
  const body = useMyBody();
  const myBody = body && body !== "off" ? body : null;
  const askedBoard = params.get("board");
  const division: BoardView = askedBoard === "men" || askedBoard === "women" || askedBoard === "all" ? askedBoard : defaultBoard(myBody);

  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [weekSource, setWeekSource] = useState<"season" | "xp">("season");
  const [ov, setOv] = useState<RewardsOverview | null>(null);
  const strength = isStrength(ov);
  const [me, setMe] = useState<MyRewards | null>(null);
  const [sharing, setSharing] = useState<StoryData | null>(null);

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
          const board = await fetchSeasonBoard(supabase, null, 50, strength ? division : undefined);
          next = board.map((r) => ({ key: `${r.rank}-${r.name}`, rank: r.rank, name: r.name, avatar: null, value: r.score, label: strength ? "pts" : "XP", isMe: !!myUid && r.is_me }));
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
        const list = await fetchMachineBoard(supabase, machineSel, mode, period, 3, division);
        const unit = selM.unit === "KG" ? "kg" : selM.unit.toLowerCase();
        next = list.map((u) => ({
          key: u.uid ? `${u.uid}${u.best_ever ? "-ever" : ""}` : `house-${u.display_name}-${u.rank}`,
          rank: u.rank,
          name: u.display_name,
          avatar: u.avatar_url,
          value: u.ratio != null ? u.ratio : Number(u.pb_weight),
          label: u.ratio != null ? "× BW" : `${unit} × ${u.pb_reps}`,
          isMe: !!u.uid && u.uid === myUid && !u.best_ever,
          ever: u.best_ever,
          bw: u.ratio != null,
          kg: u.ratio != null && u.pb_weight ? u.pb_weight : null,
        }));
      }
      setRows(next);
      setFailed(false);
    } catch {
      setFailed(true);
      setRows((r) => r ?? []);
    }
  }, [tab, supabase, myUid, selM, machineSel, mode, period, division, strength]);

  useEffect(() => {
    setRows(null);
    load();
    // any write to machine_stats means someone just logged a set
    const channel = supabase
      .channel("leaderboard-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "machine_stats" }, () => load())
      .subscribe();
    window.addEventListener(BODY_CHANGED, load);
    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener(BODY_CHANGED, load);
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

  const all = rows || [];
  const list = all.filter((r) => !r.ever);
  const ever = all.filter((r) => r.ever);
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
    if (tab === "machine" && mine.bw) {
      const diff = above.value - mine.value;
      const bwKg = myBody?.body_kg ?? null;
      const kg = bwKg ? Math.max(0.25, Math.ceil((diff * bwKg) / 0.25) * 0.25) : null;
      gap =
        diff <= 0
          ? `Beat ${above.name.split(" ")[0]} on reps`
          : kg
            ? `About ${kg} kg more to pass ${above.name.split(" ")[0]}`
            : `${diff.toFixed(2)}× BW to pass ${above.name.split(" ")[0]}`;
    } else if (tab === "machine") {
      const kg = Math.round((above.value - mine.value) * 100) / 100;
      gap = kg > 0 ? `${kg} kg to pass ${above.name.split(" ")[0]}` : `Beat ${above.name.split(" ")[0]} on reps`;
    } else if (strength) {
      gap = `${fmtXp(above.value - mine.value + 1)} points to pass ${above.name.split(" ")[0]}: beat your best ×BW on any machine`;
    } else {
      const xp = above.value - mine.value + 1;
      gap = `${fmtXp(xp)} XP (about ${setsFor(xp)} sets) to pass ${above.name.split(" ")[0]}`;
    }
  }

  function shareRank() {
    if (!mine) return;
    const scope = tab === "machine" && selM ? `on ${subject}` : tab === "week" ? "this week" : "all time";
    const val = (r: Row) => (r.bw ? `${fmtVal(r)}× BW` : tab === "machine" ? `${r.value} ${r.label.split(" ")[0]}` : `${fmtXp(r.value)} ${r.label}`);
    const boardName = strength && division !== "all" ? ` (${division === "women" ? "Women" : "Men"})` : "";
    setSharing({
      kind: "rank",
      rank: mine.rank,
      scope: scope + boardName,
      value: mine.bw ? `${fmtVal(mine)}× BW` : tab === "machine" ? `${mine.value} ${mine.label}` : `${fmtXp(mine.value)} ${mine.label}`,
      of: list.length,
      top: list.slice(0, 3).map((r) => ({ rank: r.rank, name: r.isMe ? (myFirst || "Me") : r.name.split(" ")[0], value: val(r), me: r.isMe })),
    });
  }

  function shareBadge(b: { title: string; description: string; icon: string; xp: number }) {
    setSharing({ kind: "badge", title: b.title, description: b.description, icon: b.icon, xp: b.xp });
  }

  function shareStreak() {
    const days = me?.streak.days || 0;
    const next = (ov?.streak_steps || []).find((s) => s.days > days) || null;
    setSharing({ kind: "streak", days, next });
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

        {strength && tab !== "all" && (
          <DivisionTabs
            value={division}
            onChange={(d) => setQuery({ board: d })}
            label="Men's, Women's or everyone's board"
            className="lbx-div-tabs"
          />
        )}
        {strength && myUid && body !== null && body !== "off" && !myBody?.body_kg && tab !== "all" && (
          <button type="button" className="lbx-bodycta" onClick={openBodySheet} data-testid="lb-add-body">
            <Icon name="scale" />
            <span>
              <b>Add your body weight to get on these boards</b>
              <span>They rank by ×BW: the weight you lift ÷ your body weight.</span>
            </span>
            <Icon name="chev" />
          </button>
        )}

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
              <span className="lbx-prize-eyebrow">{strength ? "#1 Men and #1 Women this week win" : "#1 this week wins"}</span>
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
        ) : all.length === 0 ? (
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
            {ever.length > 0 && (
              <div className="lbx-ever" data-testid="best-ever">
                <div className="lbx-ever-head">
                  <Icon name="star" /> Best ever here · the lifts to beat
                </div>
                {ever.map((u, i) => (
                  <div key={u.key} className="lb-row ever" style={{ ["--d" as string]: `${0.35 + i * 0.06}s` }}>
                    <div className="rank">
                      <Icon name="star" />
                      <span className="sr-only">Best ever</span>
                    </div>
                    <Avatar name={u.name} url={u.avatar} />
                    <div className="name">{u.name}</div>
                    <div className="best num">
                      {fmtVal(u)} <small>{u.label}</small>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {myUid && !isLoading && (
          <div className={`lbx-you${mine ? "" : " empty"}`} data-testid="my-rank">
            {mine ? (
              <>
                <span className="lbx-you-rank display">#{mine.rank}</span>
                <span className="lbx-you-body">
                  <b>
                    You · {mine.bw ? `${fmtVal(mine)}× BW${mine.kg ? ` (${mine.kg} kg)` : ""}` : tab === "machine" ? `${mine.value} ${mine.label}` : `${fmtXp(mine.value)} ${mine.label}`}
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
              <p>{strength ? "Streaks, missions and badges earn bonus XP to spend in the shop." : "Streaks, missions and badges all earn bonus XP, and that counts towards this week’s prize."}</p>
            </div>
            <StreakCard steps={ov.streak_steps} me={me} onShare={shareStreak} />
            <MissionsCard defs={ov.missions} me={me} />
            <BadgesSection defs={ov.badges} me={me} onShare={shareBadge} />
          </section>
        )}
      </div>
      {sharing && <ShareStudio story={sharing} onClose={() => setSharing(null)} />}
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
              {u.bw ? (
                <CountUp value={Math.round(u.value * 100)} duration={1100} format={(n) => (n / 100).toFixed(2)} />
              ) : (
                <CountUp value={u.value} duration={1100} format={(n) => Math.round(n).toLocaleString("en-IN")} />
              )}{" "}
              <small>{u.label}</small>
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
            {fmtVal(u)} <small>{u.label}</small>
          </div>
        </div>
      ))}
    </div>
  );
}
