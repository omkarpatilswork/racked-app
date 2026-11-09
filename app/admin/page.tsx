"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Icon from "@/components/Icon";
import Avatar from "@/components/Avatar";
import ConfirmSheet from "@/components/ConfirmSheet";
import SignInSheet from "@/components/SignInSheet";
import OverviewTab from "@/components/admin/OverviewTab";
import ReviewTab from "@/components/admin/ReviewTab";
import MembersTab from "@/components/admin/MembersTab";
import MachinesTab from "@/components/admin/MachinesTab";
import FeedbackTab from "@/components/admin/FeedbackTab";
import ActivityTab from "@/components/admin/ActivityTab";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { fetchAdminFeedback, fetchFlaggedCount } from "@/lib/data";

const TABS = [
  { key: "overview", label: "Overview", icon: "chartbar" },
  { key: "review", label: "Review", icon: "shield" },
  { key: "members", label: "Members", icon: "user" },
  { key: "machines", label: "Machines", icon: "grid" },
  { key: "feedback", label: "Feedback", icon: "msg" },
  { key: "activity", label: "Activity", icon: "timer" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function AdminPage() {
  return (
    <Suspense fallback={null}>
      <StaffConsole />
    </Suspense>
  );
}

function StaffConsole() {
  const { session, profile, loading, signOut } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const params = useSearchParams();
  const tabParam = params.get("tab") as TabKey | null;
  const tab: TabKey = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : "overview";
  const [flagged, setFlagged] = useState<number | null>(null);
  const [openIssues, setOpenIssues] = useState<number | null>(null);
  const [confirmOut, setConfirmOut] = useState(false);
  const isStaff = !!profile?.is_staff;

  const refreshCounts = useCallback(() => {
    fetchFlaggedCount(supabase).then(setFlagged);
    fetchAdminFeedback(supabase, { period: "all", status: "open" })
      .then((rows) => setOpenIssues(rows.filter((f) => (f.issues || []).some((i) => i !== "good")).length))
      .catch(() => setOpenIssues(null));
  }, [supabase]);

  useEffect(() => {
    if (!isStaff) return;
    refreshCounts();
    const t = setInterval(refreshCounts, 60_000);
    return () => clearInterval(t);
  }, [isStaff, refreshCounts]);

  function go(next: TabKey) {
    const q = new URLSearchParams(params.toString());
    if (next === "overview") q.delete("tab");
    else q.set("tab", next);
    router.replace(`/admin${q.toString() ? `?${q}` : ""}`, { scroll: false });
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
          <Icon name="shield" />
        </div>
        <div className="eyebrow">Staff only</div>
        <h1 style={{ fontSize: 26, margin: 0 }}>Racked staff console</h1>
        <p className="muted" style={{ margin: 0, maxWidth: 300, marginInline: "auto" }}>
          Sign in with the Google account your gym registered as staff.
        </p>
        <SignInSheet open onClose={() => router.push("/")} next="/admin" title="Staff sign-in" />
      </div>
    );
  }

  if (!isStaff) {
    return (
      <div className="page stack-lg center" style={{ paddingTop: "14vh" }}>
        <div className="tapin-icons" style={{ margin: "0 auto", width: 60, height: 60, borderRadius: 20 }}>
          <Icon name="lock" />
        </div>
        <h1 style={{ fontSize: 24, margin: 0 }}>Not a staff account</h1>
        <p className="muted" style={{ margin: 0, maxWidth: 300, marginInline: "auto" }}>
          {profile?.display_name || "This account"} isn&rsquo;t set up as gym staff. Ask the owner to give you access.
        </p>
        <Link href="/" className="btn btn-ghost" style={{ maxWidth: 240, margin: "8px auto 0" }}>
          Back to Racked
        </Link>
      </div>
    );
  }

  const badge = (key: TabKey) => (key === "review" ? flagged : key === "feedback" ? openIssues : null);

  return (
    <>
      <div className="topbar">
        <Link href="/" className="brand" aria-label="Back to the member app">
          <span className="dot" />
          RACKED <span className="brand-sub">STAFF</span>
        </Link>
        <div className="row" style={{ gap: 8 }}>
          <Link href="/" className="iconbtn" aria-label="Open the member app">
            <Icon name="home" />
          </Link>
          <button type="button" className="iconbtn" onClick={() => setConfirmOut(true)} aria-label="Sign out">
            <Icon name="logout" />
          </button>
        </div>
      </div>

      <div className="page stack-lg" data-testid="staff-console">
        <header className="row" style={{ alignItems: "center" }}>
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })}</div>
            <h1 style={{ fontSize: 26, margin: "6px 0 0" }}>Staff console</h1>
          </div>
          <Avatar name={profile?.display_name} url={profile?.avatar_url} size={44} />
        </header>

        <nav className="staff-tabs" aria-label="Staff sections">
          <div className="scroll-row">
            {TABS.map((t) => {
              const n = badge(t.key);
              return (
                <button
                  key={t.key}
                  type="button"
                  className="chip"
                  aria-current={tab === t.key ? "page" : undefined}
                  aria-pressed={tab === t.key}
                  onClick={() => go(t.key)}
                  data-testid={`tab-${t.key}-btn`}
                >
                  <Icon name={t.icon} /> {t.label}
                  {n ? <span className="count" aria-label={`${n} waiting`}>{n}</span> : null}
                </button>
              );
            })}
          </div>
        </nav>

        {tab === "overview" && <OverviewTab supabase={supabase} flagged={flagged} onGo={go} />}
        {tab === "review" && <ReviewTab supabase={supabase} onChanged={refreshCounts} />}
        {tab === "members" && <MembersTab supabase={supabase} onChanged={refreshCounts} />}
        {tab === "machines" && <MachinesTab supabase={supabase} onChanged={refreshCounts} />}
        {tab === "feedback" && <FeedbackTab supabase={supabase} onChanged={refreshCounts} />}
        {tab === "activity" && <ActivityTab supabase={supabase} />}
      </div>

      <ConfirmSheet
        open={confirmOut}
        title="Sign out of staff?"
        body="You can sign back in any time with Google."
        confirmLabel="Sign out"
        onClose={() => setConfirmOut(false)}
        onConfirm={async () => {
          await signOut();
          setConfirmOut(false);
          router.replace("/");
        }}
      />
    </>
  );
}
