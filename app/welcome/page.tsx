"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Icon from "@/components/Icon";
import BoltMark from "@/components/BoltMark";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { setInstagramHandle, updateMyProfile } from "@/lib/data";
import { cleanHandle } from "@/lib/instagram";
import { cleanDisplayName } from "@/lib/profileRules";
import { haptic } from "@/lib/haptics";
import { toast } from "@/lib/toast";
import { safeNext as safePath } from "@/lib/safeNext";

const SKIP_KEY = "racked:welcome-skipped";
function safeNext(raw: string | null) {
  const p = safePath(raw, "/home");
  return p.startsWith("/welcome") || p === "/" ? "/home" : p;
}

export default function WelcomePage() {
  return (
    <Suspense fallback={null}>
      <Welcome />
    </Suspense>
  );
}

function Welcome() {
  const { session, profile, loading, setProfileData, refreshProfile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [ig, setIg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !session) router.replace("/");
  }, [loading, session, router]);

  useEffect(() => {
    if (profile && !name) setName(profile.display_name || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  async function markDone(displayName?: string) {
    try {
      const row = await updateMyProfile(supabase, { displayName: displayName ?? null, onboarded: true });
      if (row && profile) setProfileData({ ...profile, ...row });
    } catch (err) {
      const code = (err as { code?: string })?.code;
      // database update 0009 not run yet -> nothing to mark; carry on
      if (code !== "PGRST202" && code !== "42883") throw err;
    }
  }

  async function finish(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    const n = cleanDisplayName(name);
    if (!n.ok) {
      setError(n.error);
      return;
    }
    const h = cleanHandle(ig);
    if (h === undefined) {
      setError("That Instagram handle doesn't look right — or leave it empty.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await markDone(n.value !== profile?.display_name ? n.value : undefined);
      if (h) await setInstagramHandle(supabase, h).catch(() => {});
      await refreshProfile();
      haptic("success");
      router.replace(next);
    } catch (err) {
      console.error(err);
      toast("Couldn't save — check your connection and try again");
      setBusy(false);
    }
  }

  async function skip() {
    if (busy) return;
    setBusy(true);
    try {
      await markDone();
    } catch {
      // Couldn't save (offline?). Remember the skip for this browser session
      // so the welcome doesn't bounce them straight back; it'll show again
      // next visit.
      try {
        window.sessionStorage.setItem(SKIP_KEY, "1");
      } catch {
        /* ignore */
      }
    }
    router.replace(next);
  }

  if (loading || !session) return null;

  const steps = 3;
  return (
    <div className="page stack-lg welcome" data-testid="welcome" style={{ paddingTop: "calc(16px + env(safe-area-inset-top, 0px))" }}>
      <div className="row">
        <div className="brand">
          <BoltMark className="brand-bolt" />
          <span className="brand-word">RACKED</span>
          <span className="brand-sub">× BIJLEE</span>
        </div>
        <button type="button" className="text-btn" onClick={skip} disabled={busy} data-testid="welcome-skip">
          Skip
        </button>
      </div>

      {step === 0 && (
        <section className="stack-lg" aria-labelledby="w0">
          <div className="ob-art" aria-hidden="true">
            <div className="ob-glyph">
              <Icon name="flame" />
            </div>
          </div>
          <div>
            <h1 id="w0" style={{ fontSize: 28, margin: "0 0 8px" }}>
              Welcome{profile?.display_name ? `, ${profile.display_name.split(" ")[0]}` : ""}.
            </h1>
            <p className="muted" style={{ margin: 0, fontSize: 15 }}>
              Racked turns this gym&rsquo;s machines into a live training log. Here&rsquo;s the 20-second version.
            </p>
          </div>
          <div className="stack">
            <div className="ob-step">
              <div className="n">
                <Icon name="bolt" />
              </div>
              <div>
                <b>Log in two taps</b>
                <span>Weight, reps, done. We remember your last set.</span>
              </div>
            </div>
            <div className="ob-step">
              <div className="n">
                <Icon name="trophy" />
              </div>
              <div>
                <b>Beat your best</b>
                <span>Personal bests, XP, levels and a streak that keeps you coming back.</span>
              </div>
            </div>
            <div className="ob-step">
              <div className="n">
                <Icon name="flame" />
              </div>
              <div>
                <b>Train together</b>
                <span>See what the gym is lifting and give kudos.</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="stack-lg" aria-labelledby="w1">
          <div className="ob-art" aria-hidden="true">
            <div className="ob-phone">
              <Icon name="phone" />
              <span className="ob-waves">
                <Icon name="nfc" />
              </span>
            </div>
          </div>
          <div>
            <h1 id="w1" style={{ fontSize: 28, margin: "0 0 8px" }}>
              Tap in at any machine
            </h1>
            <p className="muted" style={{ margin: 0, fontSize: 15 }}>
              Every machine has a Racked sticker. Sets can only be logged at the machine — that keeps the leaderboard honest.
            </p>
          </div>
          <div className="stack">
            <div className="ob-step">
              <div className="n">
                <Icon name="nfc" />
              </div>
              <div>
                <b>Hold your phone to the sticker</b>
                <span>The top of the phone, unlocked. Most phones open Racked instantly.</span>
              </div>
            </div>
            <div className="ob-step">
              <div className="n">
                <Icon name="qr" />
              </div>
              <div>
                <b>No NFC? Scan the QR code</b>
                <span>Point your camera at the code beside the sticker.</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {step === 2 && (
        <form className="stack-lg" onSubmit={finish} aria-labelledby="w2" noValidate>
          <div>
            <h1 id="w2" style={{ fontSize: 28, margin: "0 0 8px" }}>
              How should the gym see you?
            </h1>
            <p className="muted" style={{ margin: 0, fontSize: 15 }}>
              Your name shows on the feed and leaderboards. You can change it any time in Settings.
            </p>
          </div>
          <div className="card stack">
            <div>
              <label className="field-label" htmlFor="w-name">
                Display name
              </label>
              <input
                id="w-name"
                className="field"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                autoComplete="nickname"
                data-testid="welcome-name"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="w-ig">
                Instagram <span className="faint">(optional)</span>
              </label>
              <input
                id="w-ig"
                className="field"
                value={ig}
                onChange={(e) => setIg(e.target.value)}
                placeholder="@yourhandle"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
              <div className="field-hint">Shown next to your name for other members.</div>
            </div>
            {error && (
              <div className="field-error" role="alert">
                {error}
              </div>
            )}
          </div>
          <p className="faint" style={{ fontSize: 12.5, margin: 0 }}>
            Your sets and personal bests are visible to other signed-in members of this gym. Photos are only shared if you choose.{" "}
            <a href="/privacy" className="link" target="_blank" rel="noopener">
              Privacy
            </a>
          </p>
        </form>
      )}

      <div className="sticky-cta">
        <div className="ob-dots" aria-label={`Step ${step + 1} of ${steps}`} style={{ marginBottom: 14 }}>
          {Array.from({ length: steps }, (_, i) => (
            <i key={i} className={i === step ? "on" : ""} />
          ))}
        </div>
        {step < 2 ? (
          <button type="button" className="btn btn-yellow btn-lg" onClick={() => setStep((s) => s + 1)} data-testid="welcome-next">
            Next <Icon name="chev" />
          </button>
        ) : (
          <button type="button" className="btn btn-yellow btn-lg" onClick={() => finish()} disabled={busy} data-testid="welcome-finish">
            {busy ? "Saving…" : "Let's go"} {!busy && <Icon name="flame" />}
          </button>
        )}
        {step > 0 && (
          <button type="button" className="btn btn-ghost" style={{ marginTop: 10 }} onClick={() => setStep((s) => s - 1)} disabled={busy}>
            Back
          </button>
        )}
      </div>
    </div>
  );
}
