"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Icon from "@/components/Icon";
import BoltMark from "@/components/BoltMark";
import Avatar from "@/components/Avatar";
import SignInSheet from "@/components/SignInSheet";
import ConfirmSheet from "@/components/ConfirmSheet";
import GymMark from "@/components/GymMark";
import RrConsole, { RR_SECTIONS, type RrSection } from "@/components/rnr/RrConsole";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";

// R&R Controls (rewards & recognition): staff edit everything members see on
// the Rewards page — this week's prize, challenges, partner brands, the XP
// shop, handing out prizes, and the gym's name and logo.
export default function RrPage() {
  return (
    <Suspense fallback={null}>
      <RrControls />
    </Suspense>
  );
}

function RrControls() {
  const { session, profile, loading, signOut } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const params = useSearchParams();
  const [confirmOut, setConfirmOut] = useState(false);
  const asked = params.get("s");
  const section: RrSection = RR_SECTIONS.some((x) => x.key === asked) ? (asked as RrSection) : "race";

  function go(next: RrSection) {
    const q = new URLSearchParams(params.toString());
    if (next === "race") q.delete("s");
    else q.set("s", next);
    router.replace(`/rnr${q.toString() ? `?${q}` : ""}`, { scroll: false });
    window.scrollTo({ top: 0 });
  }

  if (loading) {
    return (
      <div className="page stack-lg" style={{ paddingTop: 70 }} aria-busy="true">
        <div className="skeleton" style={{ height: 40, width: "60%" }} />
        <div className="skeleton" style={{ height: 180, borderRadius: 22 }} />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="page stack-lg center" style={{ paddingTop: "14vh" }}>
        <div className="tapin-icons" style={{ margin: "0 auto", width: 60, height: 60, borderRadius: 20 }}>
          <Icon name="gift" />
        </div>
        <div className="eyebrow">Staff only</div>
        <h1 style={{ fontSize: 26, margin: 0 }}>R&amp;R Controls</h1>
        <p className="muted" style={{ margin: 0, maxWidth: 300, marginInline: "auto" }}>
          Sign in with the Google account your gym registered as staff.
        </p>
        <SignInSheet open onClose={() => router.push("/")} next="/rnr" title="Staff sign-in" />
      </div>
    );
  }

  if (!profile?.is_staff) {
    return (
      <div className="page stack-lg center" style={{ paddingTop: "14vh" }}>
        <div className="tapin-icons" style={{ margin: "0 auto", width: 60, height: 60, borderRadius: 20 }}>
          <Icon name="lock" />
        </div>
        <h1 style={{ fontSize: 24, margin: 0 }}>Not a staff account</h1>
        <p className="muted" style={{ margin: 0, maxWidth: 300, marginInline: "auto" }}>
          {profile?.display_name || "This account"} isn&rsquo;t set up as gym staff. Ask the owner to give you access.
        </p>
        <Link href="/home" className="btn btn-ghost" style={{ maxWidth: 240, margin: "8px auto 0" }}>
          Back to Racked
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="topbar">
        <Link href="/admin" className="brand" aria-label="Back to the staff console">
          <BoltMark className="brand-bolt" />
          <span className="brand-word">RACKED</span>
          <span className="brand-sub">R&amp;R</span>
        </Link>
        <div className="row" style={{ gap: 8 }}>
          <Link href="/admin" className="iconbtn" aria-label="Staff console">
            <Icon name="shield" />
          </Link>
          <Link href="/rewards" className="iconbtn" aria-label="See the Rewards page as members do">
            <Icon name="gift" />
          </Link>
          <button type="button" className="iconbtn" onClick={() => setConfirmOut(true)} aria-label="Sign out">
            <Icon name="logout" />
          </button>
        </div>
      </div>

      <div className="page stack-lg" data-testid="rr-page">
        <header className="row" style={{ alignItems: "center" }}>
          <div style={{ minWidth: 0 }}>
            <GymMark variant="chip" />
            <h1 style={{ fontSize: 26, margin: "10px 0 0" }}>R&amp;R Controls</h1>
            <p className="faint" style={{ margin: "4px 0 0", fontSize: 13 }}>
              Rewards &amp; recognition: everything members see on the Rewards page.
            </p>
          </div>
          <Avatar name={profile?.display_name} url={profile?.avatar_url} size={44} />
        </header>
        <RrConsole supabase={supabase} section={section} onSection={go} />
      </div>

      <ConfirmSheet
        open={confirmOut}
        title="Sign out?"
        body="You can sign back in any time with Google."
        confirmLabel="Sign out"
        onClose={() => setConfirmOut(false)}
        onConfirm={async () => {
          await signOut();
          setConfirmOut(false);
          router.replace("/home");
        }}
      />
    </>
  );
}
