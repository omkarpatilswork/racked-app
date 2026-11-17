"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import { toast } from "@/lib/toast";
import {
  awardsToast,
  challengeStatus,
  fetchMyRewards,
  fetchRewardsOverview,
  metricValue,
  syncMyRewards,
  timeLeft,
  type Client,
  type MyRewards,
  type RewardsOverview,
} from "@/lib/rewards";

// Home: a gold "You won" card per prize waiting to be collected, a "live now"
// card while a special challenge is running, and this week's prize with who's
// winning it. Shows nothing if rewards aren't switched on yet (0011 not run).
export default function RewardsTeaser({ supabase }: { supabase: Client }) {
  const [me, setMe] = useState<MyRewards | null>(null);
  const [ov, setOv] = useState<RewardsOverview | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const t = awardsToast(await syncMyRewards(supabase));
        if (t && alive) toast(t);
      } catch {
        /* ignore */
      }
      const [m, o] = await Promise.allSettled([fetchMyRewards(supabase), fetchRewardsOverview(supabase)]);
      if (!alive) return;
      if (m.status === "fulfilled") setMe(m.value);
      if (o.status === "fulfilled") setOv(o.value);
    })();
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [supabase]);

  if (!me && !ov) return null;
  const won = (me?.redemptions || []).filter((r) => r.source !== "shop" && r.status === "issued");
  const live = (ov?.challenges || []).filter((c) => challengeStatus(c, now).live);
  const s = ov?.season;
  const prize = s?.prizes[0];
  const myRank = me?.season?.rank ?? null;
  const leader = s?.leader;
  const who = !leader
    ? "Nobody on the board yet. Your first set takes #1"
    : myRank === 1
      ? "You're winning it right now!"
      : `${leader.name} is winning${myRank ? ` · you're #${myRank}` : ""}`;

  return (
    <>
      {won.map((r) => (
        <Link key={r.id} href="/rewards#mine" className="action-card rw-won" data-testid="rw-won-card">
          <div className="glyph">
            <Icon name="trophy" />
          </div>
          <div className="body">
            <div className="eyebrow" style={{ fontSize: 10 }}>
              You won{r.rank ? ` · #${r.rank}` : ""}
            </div>
            <div className="title">{r.title}</div>
            <div className="sub">{r.code ? `Show code ${r.code} at the front desk` : "Collect it at the front desk"}</div>
          </div>
          <div className="chev">
            <Icon name="chev" />
          </div>
        </Link>
      ))}
      {live.map((c) => (
        <Link key={c.id} href="/rewards#challenges" className="action-card rw-live-card" data-testid="rw-live-challenge">
          <div className="glyph yellow">
            <Icon name="flame" />
          </div>
          <div className="body">
            <div className="eyebrow accent" style={{ fontSize: 10 }}>
              <i className="rw-live-dot" aria-hidden="true" /> Live now · ends in {timeLeft(c.ends_at, now)}
            </div>
            <div className="title">{c.title}</div>
            <div className="sub">
              {c.leader ? `${c.leader.name} leads · ${metricValue(c.metric, c.leader.value, c.leader.reps)}` : c.prize ? `Win ${c.prize.replace(/^an? /i, "a ")}` : "Be the first on the board"}
            </div>
          </div>
          <div className="chev">
            <Icon name="chev" />
          </div>
        </Link>
      ))}
      {s && prize && (
        <Link href="/rewards" className="action-card rw-teaser rw-prize-teaser" data-testid="rw-teaser">
          <div className="glyph gold rw-teaser-art">
            {prize.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={prize.image_url} alt="" />
            ) : (
              <Icon name="gift" />
            )}
          </div>
          <div className="body">
            <div className="eyebrow" style={{ fontSize: 10 }}>
              This {s.period === "month" ? "month" : "week"}&rsquo;s prize · ends in {timeLeft(s.ends_at, now)}
            </div>
            <div className="title">{prize.title}</div>
            <div className="sub">{who}</div>
          </div>
          <div className="chev">
            <Icon name="chev" />
          </div>
        </Link>
      )}
    </>
  );
}
