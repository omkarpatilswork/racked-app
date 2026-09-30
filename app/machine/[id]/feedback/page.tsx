"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { notFound, useSearchParams } from "next/navigation";
import Icon from "@/components/Icon";
import SignInSheet from "@/components/SignInSheet";
import LockedMachine from "@/components/LockedMachine";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { submitFeedback } from "@/lib/data";
import { toast } from "@/lib/toast";
import { useMachineLock } from "@/lib/machineLock";
import { MACHINE_MAP } from "@/lib/machines";

const ISSUE_OPTIONS: [string, string, string][] = [
  ["good", "👍", "Everything is good"],
  ["clean", "🧹", "Needs cleaning"],
  ["broken", "🔧", "Machine not working"],
  ["seat", "🪑", "Seat / adjustment issue"],
  ["stack", "⚙️", "Weight stack issue"],
  ["damaged", "🏋️", "Equipment damaged"],
  ["other", "", "Other"],
];

export default function FeedbackPage({ params }: { params: { id: string } }) {
  return (
    <Suspense fallback={null}>
      <FeedbackPageInner params={params} />
    </Suspense>
  );
}

function FeedbackPageInner({ params }: { params: { id: string } }) {
  const machine = MACHINE_MAP[params.id];
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode");
  const { session, profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [rating, setRating] = useState(0);
  const [issues, setIssues] = useState<Set<string>>(new Set());
  const [showDetails, setShowDetails] = useState(false);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const lockStatus = useMachineLock(machine, searchParams.get("tap"));

  if (!machine) return notFound();
  if (lockStatus === "checking") return null;
  if (lockStatus === "locked") return <LockedMachine machine={machine} />;

  function toggleIssue(key: string) {
    setIssues((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    if (key === "good" && rating === 0) setRating(5);
  }

  async function handleSubmit() {
    if (rating === 0) {
      toast('Tap a star or "Everything is good" first');
      return;
    }
    setSubmitting(true);
    try {
      await submitFeedback(supabase, {
        uid: session?.user.id ?? null,
        displayName: profile?.display_name || "Anonymous",
        machineId: machine.id,
        rating,
        issues: [...issues],
        comment,
      });
      setDone(true);
    } catch (err) {
      console.error(err);
      toast("Could not send feedback — try again");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="stack-lg center" style={{ paddingTop: 40 }}>
        <div style={{ color: "var(--good)" }}>
          <Icon name="check" />
        </div>
        <h1 style={{ fontSize: 24, margin: "10px 0 2px" }}>Thanks! 🙌</h1>
        <p className="muted" style={{ margin: 0 }}>Your feedback has been sent to the gym team.</p>
        <div className="pill" style={{ margin: "14px auto" }}>
          {machine.name} #{machine.number}
        </div>
        <Link href={`/machine/${machine.id}`} className="btn btn-outline" style={{ maxWidth: 220, margin: "8px auto 0" }}>
          Back to Machine
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="topbar">
        <Link href={`/machine/${machine.id}${mode ? `?mode=${mode}` : ""}`} className="iconbtn" aria-label="Back">
          <Icon name="back" />
        </Link>
        <div style={{ width: 38 }} />
      </div>
      <div className="stack-lg">
        <div className="center">
          <div className="eyebrow">Give feedback</div>
          <h1 style={{ fontSize: 22, margin: "6px 0 0" }}>How was this machine?</h1>
        </div>
        <div className="rating">
          {[1, 2, 3, 4, 5].map((v) => (
            <button key={v} type="button" className={v <= rating ? "on" : ""} onClick={() => setRating(v)}>
              <Icon name="star" />
            </button>
          ))}
        </div>
        <div className="chip-row" style={{ justifyContent: "center" }}>
          {ISSUE_OPTIONS.map(([k, e, label]) => (
            <button
              key={k}
              type="button"
              className={`issue-chip${issues.has(k) ? " on" : ""}`}
              onClick={() => toggleIssue(k)}
            >
              {e ? `${e} ` : ""}
              {label}
            </button>
          ))}
        </div>
        <div>
          {!showDetails ? (
            <button type="button" className="btn btn-ghost btn-sm" style={{ margin: "0 auto", display: "flex" }} onClick={() => setShowDetails(true)}>
              + Add details (optional)
            </button>
          ) : (
            <div style={{ marginTop: 10 }}>
              <textarea
                className="field"
                placeholder="Tell us more..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
          )}
        </div>
        <button className="btn btn-primary" style={{ padding: 18 }} onClick={handleSubmit} disabled={submitting}>
          {submitting ? "SENDING…" : "SUBMIT FEEDBACK"}
        </button>
        {!session && (
          <p className="faint center" style={{ fontSize: 12, margin: 0 }}>
            Submitting anonymously.{" "}
            <a className="link" href="#" onClick={(e) => { e.preventDefault(); setShowSignIn(true); }}>
              Sign in
            </a>{" "}
            to let the gym know it&rsquo;s you.
          </p>
        )}
      </div>
      {showSignIn && (
        <SignInSheet
          open
          onClose={() => setShowSignIn(false)}
          next={`/machine/${machine.id}/feedback${mode ? `?mode=${mode}` : ""}`}
        />
      )}
    </>
  );
}
