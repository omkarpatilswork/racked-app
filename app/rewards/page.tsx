"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import Icon from "@/components/Icon";
import Avatar from "@/components/Avatar";
import SignInSheet from "@/components/SignInSheet";
import {
  BadgesSection,
  BoardSheet,
  ChallengesSection,
  HowXpSheet,
  MissionsCard,
  MyRewardsSection,
  PartnersSection,
  RedeemSheet,
  SeasonCard,
  ShopSection,
  SignInCard,
  StreakCard,
  WalletCard,
  WinnersCard,
  type SponsorMap,
} from "@/components/rewards/parts";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/data";
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

type BoardView = { title: string; sub?: string; kind: "season" } | { title: string; sub?: string; kind: "challenge"; c: Challenge };

export default function RewardsPage() {
  const { session, profile, loading } = useAuth();
  const supabase = useMemo(() => createClient(), []);
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

  // prizes / codes waiting to be collected go right under the wallet
  const hasReady = !!me?.redemptions.some((r) => r.status === "issued");

  function openSeasonBoard() {
    if (!ov?.season) return;
    setBoard({ kind: "season", title: ov.season.title, sub: `${ov.season.players} lifter${ov.season.players === 1 ? "" : "s"} · XP this ${ov.season.period}` });
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

  function scrollToShop() {
    document.getElementById("shop")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
        {state === "loading" || loading ? (
          <RewardsSkeleton />
        ) : state === "missing" ? (
          <div className="card empty" data-testid="rw-soon">
            <span className="tapin-icons" style={{ margin: "0 auto 12px" }} aria-hidden="true">
              <Icon name="gift" />
            </span>
            <div style={{ fontWeight: 800, color: "var(--ink)" }}>Rewards are on the way</div>
            <p style={{ margin: "4px 0 0", fontSize: 13.5 }}>Missions, prizes and partner goodies are coming to Racked very soon.</p>
          </div>
        ) : state === "error" || !ov ? (
          <div className="card empty" data-testid="rw-error">
            <div style={{ fontWeight: 800, color: "var(--ink)" }}>Couldn&rsquo;t load rewards</div>
            <p style={{ margin: "4px 0 14px", fontSize: 13.5 }}>Check your connection and try again.</p>
            <button type="button" className="btn btn-primary btn-sm" style={{ margin: "0 auto" }} onClick={() => {
                setState("loading");
                load();
              }}>
              <Icon name="refresh" /> Try again
            </button>
          </div>
        ) : (
          <>
            {signedIn && me ? (
              <WalletCard me={me} onHow={() => setHow(true)} onShop={scrollToShop} />
            ) : !signedIn ? (
              <SignInCard onSignIn={() => setSignIn(true)} />
            ) : (
              <div className="skeleton" style={{ height: 200, borderRadius: 28 }} />
            )}

            {hasReady && me && <MyRewardsSection list={me.redemptions} sponsors={sponsors} />}
            <SeasonCard ov={ov} me={me} top={top} sponsors={sponsors} now={now} onBoard={openSeasonBoard} />
            <MissionsCard defs={ov.missions} me={me} />
            <StreakCard steps={ov.streak_steps} me={me} />
            <ChallengesSection list={ov.challenges} me={me} sponsors={sponsors} now={now} onBoard={openChallengeBoard} />
            {!hasReady && me && <MyRewardsSection list={me.redemptions} sponsors={sponsors} />}
            <ShopSection items={ov.shop} me={me} sponsors={sponsors} signedIn={signedIn} onRedeem={startRedeem} onSignIn={() => setSignIn(true)} />
            <BadgesSection defs={ov.badges} me={me} />
            <WinnersCard last={ov.last_winners} />
            <PartnersSection sponsors={ov.sponsors} onClick={(sid, pid) => trackSponsorClick(supabase, sid, pid ?? null)} />

            <a className="rw-brand-cta" href={BIJLEE_INSTAGRAM} target="_blank" rel="noopener" data-testid="rw-brand-cta">
              <span className="eyebrow">For brands</span>
              <b>Put your brand in front of lifters</b>
              <span>Prizes, challenges and a spot on the gym TV. Message Bijlee Run Club to partner with Racked.</span>
              <span className="rw-brand-go">
                @bijlee.run <Icon name="external" />
              </span>
            </a>
            {!signedIn && (
              <button type="button" className="btn btn-yellow" onClick={() => setSignIn(true)}>
                Sign in to start earning XP
              </button>
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
      <SignInSheet open={signIn} onClose={() => setSignIn(false)} next="/rewards" />
    </>
  );
}

function RewardsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading rewards" className="stack-lg">
      <div className="skeleton" style={{ height: 220, borderRadius: 28 }} />
      <div className="skeleton" style={{ height: 300, borderRadius: 28 }} />
      <div className="skeleton" style={{ height: 240, borderRadius: 22 }} />
    </div>
  );
}
