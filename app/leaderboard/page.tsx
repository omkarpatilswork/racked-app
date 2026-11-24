"use client";

// Ranks v2 (Nov 2026), kept simple for launch: a small Club 360 card with
// "Week ends in", two tabs (This week · All time) and three filter pills:
// the board (Men / Women / Everyone), the machine (all or one) and what to
// show (Score / Kg moved / Heaviest lift). One ranked list, a "you" bar,
// one line about the prizes (they live on Rewards), then your streak,
// 3 weekly missions and badges. No XP here (archived: lib/features.ts).
// Data: lib/ranks.ts -> ranks_board() (0016), with fallbacks.
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Topbar from "@/components/Topbar";
import Icon from "@/components/Icon";
import Avatar from "@/components/Avatar";
import GymMark from "@/components/GymMark";
import Sheet from "@/components/Sheet";
import SignInSheet from "@/components/SignInSheet";
import ShareStudio from "@/components/share/ShareStudio";
import { BadgesSection, MissionsCard, StreakCard } from "@/components/rewards/parts";
import { useMyBody } from "@/components/BodySheet";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { RANKS_MISSIONS, useFeature } from "@/lib/features";
import { BODY_CHANGED, hasBody, openBodySheet, raceOf } from "@/lib/body";
import {
  BOARDS,
  BoardUnavailable,
  fetchRanks,
  fmtNum,
  fmtValue,
  machineChoice,
  MACHINE_CHOICES,
  METRICS,
  rowSub,
  XP_METRIC,
  type RankBoard,
  type RankMetric,
  type RankPeriod,
  type RankRow,
} from "@/lib/ranks";
import { toast } from "@/lib/toast";
import { awardsToast, fetchMyRewards, fetchRewardsOverview, fmtXp, isStrength, syncMyRewards, timeLeft, type MyRewards, type RewardsOverview } from "@/lib/rewards";
import type { StoryData } from "@/lib/story";

const TABS: { key: RankPeriod; label: string }[] = [
  { key: "week", label: "This week" },
  { key: "all", label: "All time" },
];

export default function LeaderboardPage() {
  return (
    <Suspense fallback={null}>
      <LeaderboardInner />
    </Suspense>
  );
}

// ?tab=all (old: overall) · ?tab=machine&machine=…&period=… still work
function parsePeriod(params: URLSearchParams): RankPeriod {
  const tab = params.get("tab");
  if (tab === "all" || tab === "overall") return "all";
  if ((tab === "machine" || tab === "machines") && params.get("period") === "all") return "all";
  return "week";
}

function LeaderboardInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { session, profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const xpOn = useFeature("ranksXp");
  const allMissions = useFeature("ranksAllMissions");

  const period = parsePeriod(params);
  const legacyMachineTab = params.get("tab") === "machine" || params.get("tab") === "machines";
  const machineParam = params.get("machine") || (legacyMachineTab ? MACHINE_CHOICES[0].id : null);
  const choice = machineChoice(machineParam ? `${machineParam}${params.get("mode") ? `|${params.get("mode")}` : ""}` : null) || machineChoice(machineParam);
  const machine = choice?.id ?? null;
  const mode = choice?.mode ?? "";
  const showParam = params.get("show") as RankMetric | null;
  const metrics = xpOn ? [...METRICS, XP_METRIC] : METRICS;
  const show: RankMetric = metrics.some((m) => m.key === showParam) ? (showParam as RankMetric) : "score";

  const myUid = session?.user.id ?? null;
  const myFirst = (profile?.display_name || "").split(" ")[0];
  const body = useMyBody();
  const myBody = body && body !== "off" ? body : null;
  const askedBoard = params.get("board");
  const board: RankBoard = askedBoard === "men" || askedBoard === "women" || askedBoard === "all" ? askedBoard : raceOf(myBody) || "all";

  const [rows, setRows] = useState<RankRow[] | null>(null);
  const [unavailable, setUnavailable] = useState<"update" | "signin" | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [ov, setOv] = useState<RewardsOverview | null>(null);
  const [me, setMe] = useState<MyRewards | null>(null);
  const [sharing, setSharing] = useState<StoryData | null>(null);
  const [info, setInfo] = useState(false);
  const [signIn, setSignIn] = useState(false);
  const strength = isStrength(ov) || !!myBody;

  function setQuery(next: Record<string, string | undefined>) {
    const q = new URLSearchParams(params.toString());
    Object.entries(next).forEach(([k, v]) => (v === undefined || v === "" ? q.delete(k) : q.set(k, v)));
    if (q.get("tab") === "machine" || q.get("tab") === "machines") q.delete("tab");
    q.delete("period");
    router.replace(`/leaderboard${q.toString() ? `?${q}` : ""}`, { scroll: false });
  }

  // ---- the board
  const load = useCallback(async () => {
    try {
      const next = await fetchRanks(supabase, { metric: show, period, board, machine, mode, signedIn: !!myUid, strength });
      setRows(next);
      setUnavailable(null);
      setFailed(false);
    } catch (e) {
      if (e instanceof BoardUnavailable) {
        setUnavailable(e.why);
        setRows([]);
        return;
      }
      setFailed(true);
      setRows((r) => r ?? []);
    }
  }, [supabase, show, period, board, machine, mode, myUid, strength]);

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

  // ---- the prize week + your progress (rewards, 0011)
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
  const mine = list.find((r) => r.is_me) || null;
  const above = mine && mine.rank > 1 ? list.find((r) => r.rank === mine.rank - 1) : null;
  const isLoading = rows === null;
  const metricLabel = metrics.find((m) => m.key === show)!.label;
  const where = choice ? choice.label : null;
  const prizeLine = period === "week" && show === "score" && !machine && (ov?.season?.prizes?.length || 0) > 0;

  let gap: string | null = null;
  if (mine && above) {
    const who = above.name.split(" ")[0];
    const diff = above.value - mine.value;
    if (show === "score" && machine) {
      const bw = myBody?.body_kg ?? null;
      const kg = bw ? Math.max(0.25, Math.ceil(((diff / 100) * bw) / 0.25) * 0.25) : null;
      gap = diff <= 0 ? `Beat ${who} on reps` : kg ? `About ${fmtNum(kg)} kg more to pass ${who}` : `${fmtNum(diff)} points to pass ${who}`;
    } else if (show === "score") {
      gap = `${fmtNum(Math.max(1, diff + 1))} points to pass ${who}`;
    } else if (show === "moved") {
      gap = `${fmtNum(Math.max(1, Math.ceil(diff + 1)))} kg more to pass ${who}`;
    } else if (show === "heaviest") {
      gap = diff <= 0 ? `Beat ${who} on reps` : `${fmtNum(Math.ceil(diff / 0.25) * 0.25)} kg more to pass ${who}`;
    } else {
      gap = `${fmtXp(diff + 1)} XP to pass ${who}`;
    }
  }

  const scope = `${where ? `on ${where} ` : ""}${period === "week" ? "this week" : "all time"}${strength && board !== "all" ? ` (${board === "women" ? "Women" : "Men"})` : ""}`;
  function shareRank() {
    if (!mine) return;
    setSharing({
      kind: "rank",
      rank: mine.rank,
      scope: show === "score" ? scope : `${metricLabel.toLowerCase()} ${scope}`,
      value: fmtValue(show, mine.value),
      of: list.length,
      top: list.slice(0, 3).map((r) => ({ rank: r.rank, name: r.is_me ? myFirst || "Me" : r.name, value: fmtValue(show, r.value), me: r.is_me })),
    });
  }
  function shareBadge(b: { title: string; description: string; icon: string; xp: number }) {
    setSharing({ kind: "badge", title: b.title, description: b.description, icon: b.icon, xp: xpOn ? b.xp : 0 });
  }
  function shareStreak() {
    const days = me?.streak.days || 0;
    const next = (ov?.streak_steps || []).find((s) => s.days > days) || null;
    setSharing({ kind: "streak", days, next: next && !xpOn ? { ...next, xp: 0 } : next });
  }

  const shown = list;
  const lastTop = list.filter((r) => !r.is_me).reduce((m, r) => Math.max(m, r.rank), 0);
  const needsBody = show === "score" && !!myUid && body !== null && body !== "off" && !hasBody(myBody);

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
      <div className="page stack-lg rk" data-testid="ranks">
        <header className="rk-hero" data-testid="lbx-hero">
          <span className="rk-hero-l">
            <span className="rk-eyebrow">Leaderboard</span>
            <span className="rk-gym">
              <GymMark variant="logo" onDark />
            </span>
          </span>
          {ov?.season && (
            <span className="rk-ends" data-testid="week-ends">
              <Icon name="timer" /> Week ends in <b className="num">{timeLeft(ov.season.ends_at)}</b>
            </span>
          )}
        </header>

        <div className="rw-tabs" role="tablist" aria-label="Time" style={{ ["--n" as string]: 2, ["--i" as string]: TABS.findIndex((t) => t.key === period) }}>
          <span className="rw-tabs-glider" aria-hidden="true" />
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={period === t.key}
              className={period === t.key ? "on" : ""}
              onClick={() => setQuery({ tab: t.key === "week" ? undefined : t.key, machine: machine || undefined, mode: mode || undefined })}
              data-testid={`lb-tab-${t.key}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="rk-filters" data-testid="rk-filters">
          {strength && (
            <FilterPill label="Board" value={board} options={BOARDS.map((b) => ({ value: b.key, label: b.label }))} onChange={(v) => setQuery({ board: v })} testId="rk-board" />
          )}
          <FilterPill
            label="Machine"
            value={choice?.value || ""}
            options={[{ value: "", label: "All machines" }, ...MACHINE_CHOICES.map((c) => ({ value: c.value, label: c.label }))]}
            onChange={(v) => {
              const c = machineChoice(v);
              setQuery({ machine: c?.id, mode: c?.mode || undefined });
            }}
            testId="rk-machine"
          />
          <FilterPill
            label="Show"
            value={show}
            options={metrics.map((m) => ({ value: m.key, label: m.label, short: m.short }))}
            onChange={(v) => setQuery({ show: v === "score" ? undefined : v })}
            testId="rk-show"
          />
        </div>

        {isLoading ? (
          <section className="rk-board" aria-busy="true" aria-label="Loading leaderboard">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="rk-row">
                <span className="skeleton" style={{ width: 28, height: 28, borderRadius: "50%" }} />
                <span className="skeleton" style={{ width: 36, height: 36, borderRadius: "50%" }} />
                <span className="skeleton sk-line" style={{ width: "60%" }} />
                <span className="skeleton sk-line" style={{ width: 48 }} />
              </div>
            ))}
          </section>
        ) : unavailable ? (
          <div className="card empty rk-empty" data-testid="rk-unavailable">
            <span className="tapin-icons" style={{ margin: "0 auto 10px" }} aria-hidden="true">
              <Icon name={unavailable === "signin" ? "user" : "trophy"} />
            </span>
            <div style={{ fontWeight: 800, color: "var(--ink)" }}>{unavailable === "signin" ? "Sign in to see this board" : "This board is on its way"}</div>
            <p style={{ margin: "4px 0 14px", fontSize: 13.5 }}>{unavailable === "signin" ? "It takes one tap with Google." : "Try Score for now."}</p>
            {unavailable === "signin" ? (
              <button type="button" className="btn btn-primary btn-sm" style={{ margin: "0 auto" }} onClick={() => setSignIn(true)} data-testid="rk-signin">
                Sign in
              </button>
            ) : (
              <button type="button" className="btn btn-ghost btn-sm" style={{ margin: "0 auto" }} onClick={() => setQuery({ show: undefined })}>
                Show Score
              </button>
            )}
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
          <div className="card empty rk-empty" data-testid="rk-empty">
            <span className="tapin-icons" style={{ margin: "0 auto 10px" }} aria-hidden="true">
              <Icon name="trophy" />
            </span>
            <div style={{ fontWeight: 800, color: "var(--ink)" }}>The board is wide open</div>
            <p style={{ margin: "4px 0 0", fontSize: 13.5 }}>Log a set and you&rsquo;re #1{where ? ` on ${where}` : ""}.</p>
          </div>
        ) : (
          <section className="rk-board" data-testid="leaderboard" aria-label={`${metricLabel}, ${scope}`}>
            <div className="rk-cols">
              <span>#</span>
              <span className="rk-cols-metric">{metricLabel}</span>
              <button type="button" className="rk-info" onClick={() => setInfo(true)} aria-label="How scores work" data-testid="rk-info">
                <Icon name="info" />
              </button>
            </div>
            {shown.map((r) => {
              const sub = rowSub(show, r, !!machine);
              const gapRow = r.is_me && r.rank > lastTop + 1 && lastTop > 0;
              return (
                <div key={`${r.rank}-${r.name}-${r.is_me}`} className={gapRow ? "rk-gapwrap" : undefined}>
                  {gapRow && (
                    <div className="rk-gap" aria-hidden="true">
                      ⋯
                    </div>
                  )}
                  <div className={`rk-row${r.rank <= 3 ? ` g${r.rank}` : ""}${r.is_me ? " me" : ""}`} data-testid="rk-row">
                    <span className="rk-rank num" aria-label={`Rank ${r.rank}`}>
                      {r.rank}
                    </span>
                    <Avatar name={r.name} url={r.avatar_url} size={36} />
                    <span className="rk-name">
                      <b>{r.is_me ? "You" : r.name}</b>
                      {sub && <small>{sub}</small>}
                    </span>
                    <b className="rk-val num">{fmtValue(show, r.value)}</b>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {prizeLine && (
          <Link href="/rewards" className="rk-prize" data-testid="lb-prize-race">
            <Icon name="gift" /> {strength ? "#1 Men & #1 Women win prizes" : "#1 wins a prize"} · <b>Rewards</b>
          </Link>
        )}

        {myUid && !isLoading && !unavailable && (
          <div className={`rk-you${mine ? "" : " empty"}`} data-testid="my-rank">
            {mine ? (
              <>
                <span className="rk-you-rank display">#{mine.rank}</span>
                <span className="rk-you-body">
                  <b>You · {fmtValue(show, mine.value)}</b>
                  <span>{mine.rank === 1 ? "Top of the board" : gap}</span>
                </span>
                <button type="button" className="rk-you-share" onClick={shareRank} aria-label="Share your rank" data-testid="share-rank">
                  <Icon name="share" />
                </button>
              </>
            ) : needsBody ? (
              <>
                <span className="rk-you-body">
                  <b>Add your body weight to get a score</b>
                  <span>Only you see the number.</span>
                </span>
                <button type="button" className="btn btn-yellow btn-sm rk-you-add" onClick={openBodySheet} data-testid="lb-add-body">
                  Add
                </button>
              </>
            ) : (
              <span className="rk-you-body">
                <b>{myFirst ? `${myFirst}, you're not on this board yet` : "You're not on this board yet"}</b>
                <span>{where ? `Log a set on ${where} to get on it.` : "Log a set to get on it."}</span>
              </span>
            )}
          </div>
        )}

        {myUid && ov && (
          <section id="progress" className="stack-lg lbx-progress" data-testid="lb-progress" aria-labelledby="lb-progress-h">
            <div className="lbx-section-head">
              <h2 id="lb-progress-h">Your progress</h2>
            </div>
            <StreakCard steps={ov.streak_steps} me={me} onShare={shareStreak} showXp={xpOn} />
            <MissionsCard defs={allMissions ? ov.missions : ov.missions.filter((m) => RANKS_MISSIONS.includes(m.id))} me={me} showXp={xpOn} />
            <BadgesSection defs={ov.badges} me={me} onShare={shareBadge} showXp={xpOn} />
          </section>
        )}
      </div>

      <Sheet open={info} onClose={() => setInfo(false)} title="How scores work" testId="rk-info-sheet">
        <ol className="hx-guide rk-howto">
          <li>
            <span className="hx-guide-ic rk-howto-n" aria-hidden="true">
              80
            </span>
            <span>
              <b>Score</b> = kg lifted ÷ your body weight × 100. 60 kg at 75 kg = 80. All machines adds up your best on each.
            </span>
          </li>
          <li>
            <span className="hx-guide-ic rk-howto-n" aria-hidden="true">
              kg
            </span>
            <span>
              <b>Kg moved</b> = weight × reps of all your sets, added up.
            </span>
          </li>
          <li>
            <span className="hx-guide-ic" aria-hidden="true">
              <Icon name="dumbbell" />
            </span>
            <span>
              <b>Heaviest lift</b> = your heaviest single set.
            </span>
          </li>
        </ol>
        <p className="field-hint" style={{ margin: "4px 2px 0" }}>
          This week&rsquo;s Score is the prize race: #1 Men and #1 Women win.
        </p>
      </Sheet>
      <SignInSheet open={signIn} onClose={() => setSignIn(false)} next="/leaderboard" />
      {sharing && <ShareStudio story={sharing} onClose={() => setSharing(null)} />}
    </>
  );
}

// A pill that is really a native <select> (one tap opens the phone's picker).
function FilterPill({
  label,
  value,
  options,
  onChange,
  testId,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; short?: string }[];
  onChange: (v: string) => void;
  testId: string;
}) {
  const cur = options.find((o) => o.value === value) || options[0];
  return (
    <label className="rk-pick" data-testid={testId}>
      <span className="rk-pick-l">{cur.short || cur.label}</span>
      <Icon name="chev" className="icon rk-caret" />
      <select aria-label={label} value={cur.value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
