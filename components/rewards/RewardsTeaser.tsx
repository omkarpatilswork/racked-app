"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import { toast } from "@/lib/toast";
import { awardsToast, fetchMyRewards, fmtXp, syncMyRewards, timeLeft, type Client, type MyRewards } from "@/lib/rewards";

// Home: "You won!" card for prizes waiting to be collected, and a link into
// Rewards with your XP and where you are in the prize race. Shows nothing if
// rewards aren't switched on yet (0011 not run) or can't load.
export default function RewardsTeaser({ supabase }: { supabase: Client }) {
  const [me, setMe] = useState<MyRewards | null>(null);

  useEffect(() => {
    let alive = true;
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
        /* rewards not available */
      }
    })();
    return () => {
      alive = false;
    };
  }, [supabase]);

  if (!me) return null;
  const won = me.redemptions.filter((r) => r.source !== "shop" && r.status === "issued");
  const s = me.season;
  const sub = s
    ? s.rank
      ? `#${s.rank} in ${s.title} · ends in ${timeLeft(s.ends_at)}`
      : s.top_prize
        ? `Win: ${s.top_prize}`
        : `Prize race ends in ${timeLeft(s.ends_at)}`
    : "Missions, streaks and partner prizes";

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
      <Link href="/rewards" className="action-card rw-teaser" data-testid="rw-teaser">
        <div className="glyph gold">
          <Icon name="gift" />
        </div>
        <div className="body">
          <div className="title">
            <span className="num">{fmtXp(me.wallet.balance)}</span> XP to spend
          </div>
          <div className="sub">{sub}</div>
        </div>
        <div className="chev">
          <Icon name="chev" />
        </div>
      </Link>
    </>
  );
}
