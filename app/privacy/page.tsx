import type { Metadata } from "next";
import Link from "next/link";
import Icon from "@/components/Icon";

export const metadata: Metadata = {
  title: "Privacy & your data",
  description: "What Racked stores, who can see it, and how to delete it.",
};

export default function PrivacyPage() {
  return (
    <>
      <div className="topbar">
        <Link href="/settings" className="iconbtn" aria-label="Back">
          <Icon name="back" />
        </Link>
        <div className="topbar-title">Privacy</div>
        <div style={{ width: 42 }} />
      </div>
      <article className="page prose" style={{ paddingBottom: 24 }}>
        <h1 style={{ fontSize: 26, margin: "8px 0 6px" }}>Your data, in plain words</h1>
        <p>A short summary of what Racked keeps, who can see it, and how to remove it.</p>

        <h2>What we store</h2>
        <ul>
          <li>
            <b>From Google sign-in:</b> your name, email address and profile picture. Your email is only used to sign you in — it&rsquo;s never shown to
            other members.
          </li>
          <li>
            <b>What you log:</b> each set (machine, weight, reps, time), your personal bests, XP, levels and the days you trained.
          </li>
          <li>
            <b>Only if you add them:</b> your Instagram handle, pre/post workout photos, posts and comments, kudos you give, and feedback you send about a machine.
          </li>
          <li>
            <b>For the strength boards:</b> your body weight and your board (Men, Women or Prefer not to say). Each set remembers your body
            weight on the day, so boards can rank by your score (kg lifted ÷ body weight × 100).
          </li>
          <li>
            <b>Machine taps:</b> which machine was tapped or scanned and when, so the gym can see which equipment gets used.
          </li>
          <li>
            <b>On your phone:</b> small settings like light/dark mode, rest-timer length and vibration, plus a sign-in cookie.
          </li>
        </ul>

        <h2>Who can see what</h2>
        <ul>
          <li>
            <b>Other signed-in members</b> see your display name, picture, sets and personal bests on the gym feed and leaderboards, your Instagram handle
            if you added one, and any photos you chose to share.
          </li>
          <li>
            <b>The gym TV screen</b> (public, shown in the gym) shows first names and top lifts only.
          </li>
          <li>
            <b>Your body weight</b> is never shown to other members or on the TV. Only you and gym staff (who weigh prize winners at the
            desk) see the number. Members who sign in can see your score, kg moved and heaviest lifts on the Ranks page, so someone comparing
            your score and your heaviest lift on the same machine could work out a rough body weight. Which board you&rsquo;re on
            (Men&rsquo;s or Women&rsquo;s) shows wherever you rank.
          </li>
          <li>
            <b>Gym staff</b> can see logged sets and machine feedback, plus photos that are shared or have been reported — so they can keep
            things fair and safe. Photos you keep as &ldquo;Only me&rdquo; are visible to you alone.
          </li>
          <li>
            <b>Photos</b> are stored privately and shown through short-lived links. Turn sharing off or delete a photo any time from your Profile.
          </li>
        </ul>

        <h2>Where it&rsquo;s kept</h2>
        <p>Racked runs on Supabase (database, sign-in and photo storage) and Vercel (website hosting).</p>

        <h2>Deleting your account</h2>
        <p>
          Go to <Link href="/settings" className="link">Settings</Link> → <b>Delete account</b>. This permanently removes your profile, every set and
          personal best, your streak, kudos and photos. Machine feedback and tap counts stay in the gym&rsquo;s totals but are no longer linked to you.
        </p>

        <h2>Questions</h2>
        <p>Ask at the front desk or message the Bijlee team and we&rsquo;ll help.</p>
      </article>
    </>
  );
}
