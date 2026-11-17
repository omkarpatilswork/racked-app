"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Topbar from "@/components/Topbar";
import Icon from "@/components/Icon";
import Avatar from "@/components/Avatar";
import GymMark from "@/components/GymMark";
import SignInSheet from "@/components/SignInSheet";
import {
  BoardSheet,
  HowXpSheet,
  MyRewardsSection,
  PartnersSection,
  RedeemSheet,
  ShopSection,
  WalletCard,
  WinnersCard,
  type SponsorMap,
} from "@/components/rewards/parts";
import { ChallengesBlock, PrizeHero } from "@/components/rewards/win";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/data";
import { useGym } from "@/lib/gym";
import { toast } from "@/lib/toast";
import { BIJLEE_INSTAGRAM } from "@/lib/site";
import {
  awardsToast,
  fetchChallengeBoard,
  fetchMyRewards,
  fetchRewardsOverview,
  fetchSeasonBoard,
  fmtXp,
  isMissingRewards,
  metricValue,
  redeemReward,
  syncMyRewards,
  trackSponsorClick,
  type BoardRow,
  type Challenge,
  type ChallengeRow,
  type MyRewards,
  type RedeemResult,
  type RewardsOverview,
  type ShopItem,
} from "@/lib/rewards";

type Tab = "win" | "partners" | "shop";
type BoardView = { title: string; sub?: string; kind: "season" } | { title: string; sub?: string; kind: "challenge"; c: Challenge };

export default function RewardsPage() {
  return (
    <Suspense fallback={null}>
      <RewardsInner />
    </Suspense>
  );
}

function RewardsInner() {
  const { session, profile, loading } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const params = useSearchParams();
  const gym = useGym();
  const signedIn = !!session;

  const [ov, setOv] = useState<RewardsOverview | null>(null);
  const [me, setMe] = useState<MyRewards | null>(null);
  const [top, setTop] = useState<BoardRow[] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [now, setNow] = useState(() => Date.now());
  const [how, setHow] = useState(false);
  const [signIn, setSignIn] = useState(false);
  const [board, setBoard] = useState<BoardView | null>(null);
  const [boardRows, setBoardRows] = useState<(BoardRow | ChallengeRow)[] | null>(null);
  const [redeemItem, setRedeemItem] = useState<ShopItem | null>(null);
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [redeemErr, setRedeemErr] = useState<string | null>(null);
  const [redeemRes, setRedeemRes] = useState<RedeemResult | null>(null);
  const loadId = useRef(0);

  const showPartners = ov?.settings?.show_partners !== false;
  const showShop = ov?.settings?.show_shop !== false;
  const asked = params.get("tab");
  const tab: Tab = asked === "partners" && showPartners ? "partners" : asked === "shop" && showShop ? "shop" : "win";
  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: "win", label: "Win", icon: "trophy" },
    ...(showPartners ? [{ key: "partners" as Tab, label: "Partners", icon: "star" }] : []),
    ...(showShop ? [{ key: "shop" as Tab, label: "Shop", icon: "ticket" }] : []),
  ];
  function go(t: Tab) {
    const next = new URLSearchParams(params.toString());
    if (t === "win") next.delete("tab");
    else next.set("tab", t);
    const qs = next.toString();
    router.replace(`/rewards${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  const load = useCallback(
    async (opts: { sync?: boolean } = {}) => {
      const id = ++loadId.current;
      try {
        const [o] = await Promise.all([
          fetchRewardsOverview(supabase),
          (async () => {
            if (!signedIn) return;
            if (opts.sync) {
              try {
                const t = awardsToast(await syncMyRewards(supabase));
                if (t) toast(t);
              } catch {
                /* a failed sync never blocks the page */
              }
            }
            const m = await fetchMyRewards(supabase);
            if (id === loadId.current) setMe(m);
          })(),
        ]);
        if (id !== loadId.current) return;
        setOv(o);
        setState("ready");
        fetchSeasonBoard(supabase, null, 5)
          .then((rows) => id === loadId.current && setTop(rows))
          .catch(() => id === loadId.current && setTop([]));
      } catch (err) {
        if (id !== loadId.current) return;
        setState(isMissingRewards(err) ? "missing" : "error");
      }
    },
    [supabase, signedIn]
  );

  useEffect(() => {
    if (loading) return;
    if (!signedIn) setMe(null);
    load({ sync: true });
  }, [loading, signedIn, load]);

  // keep the countdowns ticking, and refresh when you come back to the tab
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    const onVis = () => {
      if (document.visibilityState === "visible") {
        setNow(Date.now());
        load({ sync: true });
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  const sponsors: SponsorMap = useMemo(() => Object.fromEntries((ov?.sponsors || []).map((s) => [s.id, s])), [ov]);
  const ready = (me?.redemptions || []).filter((r) => r.status === "issued");

  function openSeasonBoard() {
    if (!ov?.season) return;
    setBoard({ kind: "season", title: ov.season.title, sub: `${ov.season.players} lifter${ov.season.players === 1 ? "" : "s"} · XP earned this ${ov.season.period}` });
    setBoardRows(null);
    fetchSeasonBoard(supabase, null, 50).then(setBoardRows, () => setBoardRows([]));
  }

  function openChallengeBoard(c: Challenge) {
    setBoard({ kind: "challenge", c, title: c.title, sub: `${c.players} lifter${c.players === 1 ? "" : "s"}` });
    setBoardRows(null);
    fetchChallengeBoard(supabase, c.id, 50).then(setBoardRows, () => setBoardRows([]));
  }

  function startRedeem(item: ShopItem) {
    setRedeemErr(null);
    setRedeemRes(null);
    setRedeemItem(item);
  }

  async function confirmRedeem() {
    if (!redeemItem || redeemBusy) return;
    setRedeemBusy(true);
    setRedeemErr(null);
    try {
      const res = await redeemReward(supabase, redeemItem.id);
      setRedeemRes(res);
      load();
    } catch (err) {
      setRedeemErr(friendlyDbError(err) ?? "Couldn't redeem that. Check your connection and try again.");
    } finally {
      setRedeemBusy(false);
    }
  }

  function closeRedeem() {
    setRedeemItem(null);
    setRedeemRes(null);
    setRedeemErr(null);
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
      <div className="page stack-lg rw-page">
        <header className="rw-head">
          <div style={{ minWidth: 0 }}>
            <GymMark variant="chip" label="Rewards at" />
            <h1>Rewards</h1>
          </div>
          {me && (
            <button type="button" className="rw-xp-chip" onClick={() => setHow(true)} data-testid="rw-xp-chip" aria-label={`${fmtXp(me.wallet.balance)} XP to spend. How XP works`}>
              <span className="num">{fmtXp(me.wallet.balance)}</span> XP
            </button>
          )}
        </header>

        {state === "loading" || loading ? (
          <RewardsSkeleton />
        ) : state === "missing" ? (
          <div className="card empty" data-testid="rw-soon">
            <span className="tapin-icons" style={{ margin: "0 auto 12px" }} aria-hidden="true">
              <Icon name="gift" />
            </span>
            <div style={{ fontWeight: 800, color: "var(--ink)" }}>Rewards are on the way</div>
            <p style={{ margin: "4px 0 0", fontSize: 13.5 }}>Weekly prizes, challenges and partner goodies are coming to {gym.name} very soon.</p>
          </div>
        ) : state === "error" || !ov ? (
          <div className="card empty" data-testid="rw-error">
            <div style={{ fontWeight: 800, color: "var(--ink)" }}>Couldn&rsquo;t load rewards</div>
            <p style={{ margin: "4px 0 14px", fontSize: 13.5 }}>Check your connection and try again.</p>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              style={{ margin: "0 auto" }}
              onClick={() => {
                setState("loading");
                load();
              }}
            >
              <Icon name="refresh" /> Try again
            </button>
          </div>
        ) : (
          <>
            {tabs.length > 1 && (
              <div className="rw-tabs" role="tablist" aria-label="Rewards sections" style={{ ["--n" as string]: tabs.length, ["--i" as string]: tabs.findIndex((t) => t.key === tab) }}>
                <span className="rw-tabs-glider" aria-hidden="true" />
                {tabs.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.key}
                    className={tab === t.key ? "on" : ""}
                    onClick={() => go(t.key)}
                    data-testid={`rw-tab-${t.key}`}
                  >
                    <Icon name={t.icon} />
                    {t.label}
                  </button>
                ))}
              </div>
            )}

            {tab === "win" && (
              <div className="stack-lg rw-panel" key="win" role="tabpanel">
                {!signedIn && (
                  <button type="button" className="rw-signin-strip" onClick={() => setSignIn(true)} data-testid="rw-signin">
                    <span>
                      <b>Sign in to join the race</b>
                      <span>Your sets count towards this week&rsquo;s prize.</span>
                    </span>
                    <span className="rw-signin-go">
                      <i className="g-chip" aria-hidden="true">
                        <Icon name="google" />
                      </i>
                      Sign in
                    </span>
                  </button>
                )}
                <PrizeHero ov={ov} me={me} top={top} sponsors={sponsors} now={now} onBoard={openSeasonBoard} onHow={() => setHow(true)} />
                {ready.length > 0 && <MyRewardsSection list={ready} sponsors={sponsors} />}
                <ChallengesBlock list={ov.challenges} me={me} sponsors={sponsors} now={now} onBoard={openChallengeBoard} />
                <WinnersCard last={ov.last_winners} />
                <Link href="/leaderboard#progress" className="action-card" data-testid="rw-progress-link">
                  <div className="glyph yellow">
                    <Icon name="flame" />
                  </div>
                  <div className="body">
                    <div className="title">Streaks, missions &amp; badges</div>
                    <div className="sub">Bonus XP that counts towards the prize. On the Ranks page.</div>
                  </div>
                  <div className="chev">
                    <Icon name="chev" />
                  </div>
                </Link>
              </div>
            )}

            {tab === "partners" && (
              <div className="stack-lg rw-panel" key="partners" role="tabpanel">
                <PartnersSection sponsors={ov.sponsors} gymName={gym.name} onClick={(sid, pid) => trackSponsorClick(supabase, sid, pid ?? null)} />
                <a className="rw-brand-cta" href={BIJLEE_INSTAGRAM} target="_blank" rel="noopener" data-testid="rw-brand-cta">
                  <span className="eyebrow">For brands</span>
                  <b>Put your brand in front of lifters</b>
                  <span>Prizes, challenges and a spot on the {gym.name} TV. Message Bijlee Run Club to partner with Racked.</span>
                  <span className="rw-brand-go">
                    @bijlee.run <Icon name="external" />
                  </span>
                </a>
              </div>
            )}

            {tab === "shop" && (
              <div className="stack-lg rw-panel" key="shop" role="tabpanel">
                {me ? (
                  <WalletCard me={me} onHow={() => setHow(true)} />
                ) : !signedIn ? (
                  <button type="button" className="rw-signin-strip" onClick={() => setSignIn(true)} data-testid="rw-signin">
                    <span>
                      <b>Sign in to spend your XP</b>
                      <span>Every set you log earns XP for the shop.</span>
                    </span>
                    <span className="rw-signin-go">
                      <i className="g-chip" aria-hidden="true">
                        <Icon name="google" />
                      </i>
                      Sign in
                    </span>
                  </button>
                ) : (
                  <div className="skeleton" style={{ height: 180, borderRadius: 28 }} />
                )}
                <ShopSection items={ov.shop} me={me} sponsors={sponsors} signedIn={signedIn} onRedeem={startRedeem} onSignIn={() => setSignIn(true)} />
                {me && <MyRewardsSection list={me.redemptions} sponsors={sponsors} />}
              </div>
            )}
          </>
        )}
      </div>

      <HowXpSheet open={how} onClose={() => setHow(false)} ov={ov} />
      <BoardSheet
        open={!!board}
        onClose={() => setBoard(null)}
        title={board?.title || ""}
        sub={board?.sub}
        rows={boardRows}
        format={(r) =>
          board?.kind === "challenge" ? metricValue(board.c.metric, (r as ChallengeRow).value, (r as ChallengeRow).reps) : `${fmtXp((r as BoardRow).score)} XP`
        }
      />
      <RedeemSheet
        item={redeemItem}
        result={redeemRes}
        balance={me?.wallet.balance ?? 0}
        sponsors={sponsors}
        busy={redeemBusy}
        error={redeemErr}
        onConfirm={confirmRedeem}
        onClose={closeRedeem}
      />
      <SignInSheet open={signIn} onClose={() => setSignIn(false)} next={tab === "win" ? "/rewards" : `/rewards?tab=${tab}`} />
    </>
  );
}

function RewardsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading rewards" className="stack-lg">
      <div className="skeleton" style={{ height: 46, borderRadius: 16 }} />
      <div className="skeleton" style={{ height: 420, borderRadius: 28 }} />
      <div className="skeleton" style={{ height: 240, borderRadius: 22 }} />
    </div>
  );
}
