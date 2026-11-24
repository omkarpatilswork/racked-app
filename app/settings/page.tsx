"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import ConfirmSheet from "@/components/ConfirmSheet";
import SignInSheet from "@/components/SignInSheet";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { deleteMyAccount, setInstagramHandle, updateMyProfile } from "@/lib/data";
import { useMyBody } from "@/components/BodySheet";
import { CHOICE_LABEL, openBodySheet } from "@/lib/body";
import { cleanHandle } from "@/lib/instagram";
import { cleanDisplayName } from "@/lib/profileRules";
import { getThemePref, setThemePref, type ThemePref } from "@/lib/theme";
import { PREF_HAPTICS, PREF_REST, readPref, writePref } from "@/lib/prefs";
import { canPromptInstall, isIOS, isStandalone, onInstallChange, promptInstall } from "@/lib/install";
import { haptic } from "@/lib/haptics";
import { toast } from "@/lib/toast";

// Settings v2 (Nov 2026, Omi: simpler, less text): three groups, You · App ·
// Account, one line per row with the value on the right, short notes, and the
// Save button only once something changed.
export default function SettingsPage() {
  const { session, loading } = useAuth();
  const [signIn, setSignIn] = useState(false);
  return (
    <>
      <div className="topbar">
        <Link href="/profile" className="iconbtn" aria-label="Back to profile">
          <Icon name="back" />
        </Link>
        <div className="topbar-title">Settings</div>
        <div style={{ width: 42 }} />
      </div>
      <div className="page stack-lg">
        <section aria-labelledby="set-you">
          <div className="list-title" id="set-you">
            You
          </div>
          {loading ? (
            <div className="skeleton" style={{ height: 220, borderRadius: 22 }} />
          ) : session ? (
            <>
              <ProfileSection />
              <BodySection />
            </>
          ) : (
            <div className="card center">
              <p className="muted" style={{ marginTop: 0 }}>Sign in to edit your profile.</p>
              <button type="button" className="btn btn-yellow" onClick={() => setSignIn(true)}>
                <Icon name="google" /> Continue with Google
              </button>
            </div>
          )}
        </section>
        <AppSection />
        <AccountSection signedIn={!!session} />
        <p className="faint center" style={{ fontSize: 12, margin: "8px 0 0" }}>
          Racked × Bijlee
        </p>
      </div>
      <SignInSheet open={signIn} onClose={() => setSignIn(false)} next="/settings" />
    </>
  );
}

function ProfileSection() {
  const { profile, setProfileData, refreshProfile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [name, setName] = useState("");
  const [ig, setIg] = useState("");
  const [errors, setErrors] = useState<{ name?: string; ig?: string }>({});
  const [busy, setBusy] = useState(false);

  // Fill the form from the saved profile once (and again after a save) --
  // never while you're mid-edit, so switching apps to copy your handle
  // doesn't wipe what you typed.
  const syncedKey = useRef<string | null>(null);
  const touched = useRef(false);
  useEffect(() => {
    if (!profile) return;
    const key = `${profile.id}|${profile.display_name}|${profile.instagram_handle ?? ""}`;
    if (syncedKey.current === key) return;
    if (syncedKey.current && touched.current) return;
    syncedKey.current = key;
    setName(profile.display_name || "");
    setIg(profile.instagram_handle ? `@${profile.instagram_handle}` : "");
  }, [profile]);

  const dirty =
    !!profile &&
    (name.trim() !== (profile.display_name || "") || (cleanHandle(ig) ?? "") !== (profile.instagram_handle ?? ""));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || busy) return;
    const n = cleanDisplayName(name);
    const h = cleanHandle(ig);
    const nextErrors: { name?: string; ig?: string } = {};
    if (!n.ok) nextErrors.name = n.error;
    if (h === undefined) nextErrors.ig = "That doesn't look like an Instagram handle. Use letters, numbers, . and _ only.";
    setErrors(nextErrors);
    if (nextErrors.name || nextErrors.ig || !n.ok) return;
    setBusy(true);
    try {
      if (n.value !== profile.display_name) {
        try {
          const row = await updateMyProfile(supabase, { displayName: n.value });
          if (row) setProfileData({ ...profile, ...row });
        } catch (err) {
          // Database update 0009 not run yet: fall back to a plain update of
          // your own row (allowed by the existing row-level security rule).
          const code = (err as { code?: string })?.code;
          if (code !== "PGRST202" && code !== "42883") throw err;
          const { error } = await supabase.from("profiles").update({ display_name: n.value }).eq("id", profile.id);
          if (error) throw error;
        }
      }
      if ((h ?? "") !== (profile.instagram_handle ?? "")) {
        await setInstagramHandle(supabase, h ?? "");
      }
      touched.current = false;
      await refreshProfile();
      haptic("success");
      toast("Profile saved");
    } catch (err) {
      console.error(err);
      toast("Couldn't save — check your connection and try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={save} noValidate data-testid="profile-form" aria-labelledby="set-you">
      <div>
        <label className="field-label" htmlFor="display-name">
          Name
        </label>
        <input
          id="display-name"
          className="field"
          value={name}
          onChange={(e) => {
            touched.current = true;
            setName(e.target.value);
          }}
          maxLength={60}
          autoComplete="nickname"
          aria-invalid={!!errors.name}
          aria-describedby="display-name-hint"
        />
        {errors.name ? (
          <div className="field-error" id="display-name-hint" role="alert">
            {errors.name}
          </div>
        ) : (
          <div className="set-hint" id="display-name-hint">
            On boards and the feed.
          </div>
        )}
      </div>
      <div>
        <label className="field-label" htmlFor="ig-handle">
          Instagram <span className="faint">(optional)</span>
        </label>
        <input
          id="ig-handle"
          className="field"
          value={ig}
          onChange={(e) => {
            touched.current = true;
            setIg(e.target.value);
          }}
          placeholder="@yourhandle"
          maxLength={80}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={!!errors.ig}
          aria-describedby="ig-hint"
        />
        {errors.ig ? (
          <div className="field-error" id="ig-hint" role="alert">
            {errors.ig}
          </div>
        ) : (
          <div className="set-hint" id="ig-hint">
            Only members see it.
          </div>
        )}
      </div>
      {(dirty || busy) && (
        <button type="submit" className="btn btn-yellow" disabled={busy} data-testid="profile-save">
          {busy ? "Saving…" : "Save changes"}
        </button>
      )}
    </form>
  );
}

// Body weight + board (0015): boards rank by score (kg ÷ body weight × 100)
function BodySection() {
  const body = useMyBody();
  if (body === "off") return null;
  const b = body;
  const set = !!b?.body_kg;
  return (
    <div className="list" style={{ marginTop: 10 }}>
      <button type="button" className="list-row" onClick={openBodySheet} data-testid="settings-body">
        <span className="lr-icon">
          <Icon name="scale" />
        </span>
        <span className="lr-body">
          Body weight &amp; board
          <div className="lr-sub">{set ? "Only you see it" : "Add it to get a score"}</div>
        </span>
        {set && (
          <span className="lr-val">
            {b!.division === "men" || b!.division === "women" ? `${CHOICE_LABEL[b!.division]} · ` : ""}
            {b!.body_kg} kg
          </span>
        )}
        <Icon name="chev" />
      </button>
    </div>
  );
}

function AppSection() {
  const [pref, setPref] = useState<ThemePref>("dark");
  const [rest, setRest] = useState("90");
  const [vibe, setVibe] = useState(true);
  useEffect(() => {
    setPref(getThemePref());
    setRest(readPref(PREF_REST, "90"));
    setVibe(readPref(PREF_HAPTICS, "on") !== "off");
  }, []);
  const opts: { key: ThemePref; label: string; icon: string }[] = [
    { key: "dark", label: "Dark", icon: "moon" },
    { key: "light", label: "Light", icon: "sun" },
    { key: "system", label: "Auto", icon: "phone" },
  ];
  return (
    <section aria-labelledby="set-app">
      <div className="list-title" id="set-app">
        App
      </div>
      <div className="tabs set-theme" role="radiogroup" aria-label="Theme" data-testid="theme-picker">
        {opts.map((o) => (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={pref === o.key}
            className={`tab${pref === o.key ? " active" : ""}`}
            onClick={() => {
              setPref(o.key);
              setThemePref(o.key);
            }}
            style={{ gap: 6 }}
          >
            <Icon name={o.icon} /> {o.label}
          </button>
        ))}
      </div>
      <div className="list">
        <label className="list-row" htmlFor="rest-default">
          <span className="lr-icon">
            <Icon name="timer" />
          </span>
          <span className="lr-body">Rest timer</span>
          <select
            id="rest-default"
            className="rest-select"
            style={{ alignSelf: "center" }}
            value={rest}
            onChange={(e) => {
              setRest(e.target.value);
              writePref(PREF_REST, e.target.value);
            }}
          >
            <option value="60">1:00</option>
            <option value="90">1:30</option>
            <option value="120">2:00</option>
            <option value="180">3:00</option>
            <option value="0">Off</option>
          </select>
        </label>
        <button
          type="button"
          className="list-row"
          role="switch"
          aria-checked={vibe}
          onClick={() => {
            const next = !vibe;
            setVibe(next);
            writePref(PREF_HAPTICS, next ? "on" : "off");
            if (next) haptic("success");
          }}
          data-testid="settings-vibration"
        >
          <span className="lr-icon">
            <Icon name="phone" />
          </span>
          <span className="lr-body">
            Vibration
            <div className="lr-sub">Android</div>
          </span>
          <span className="switch" aria-hidden="true">
            <i />
          </span>
        </button>
        <InstallRow />
      </div>
    </section>
  );
}

// "Add to home screen": only on phones that can (not when already installed)
function InstallRow() {
  const [, force] = useState(0);
  const [standalone, setStandalone] = useState(true);
  const [ios, setIos] = useState(false);
  const [howTo, setHowTo] = useState(false);
  useEffect(() => {
    setStandalone(isStandalone());
    setIos(isIOS());
    return onInstallChange(() => force((n) => n + 1));
  }, []);
  if (standalone) return null;
  const can = canPromptInstall();
  if (!can && !ios) return null;
  return (
    <button
      type="button"
      className="list-row"
      aria-expanded={can ? undefined : howTo}
      onClick={async () => {
        if (can) {
          const ok = await promptInstall();
          if (ok) toast("Racked installed");
        } else setHowTo((v) => !v);
      }}
      data-testid="settings-install"
    >
      <span className="lr-icon">
        <Icon name="download" />
      </span>
      <span className="lr-body">
        Add to home screen
        {howTo && (
          <div className="lr-sub">
            In Safari: tap Share <Icon name="share" className="icon inline-icon" />, then Add to Home Screen.
          </div>
        )}
      </span>
      <Icon name="chev" />
    </button>
  );
}

function AccountSection({ signedIn }: { signedIn: boolean }) {
  const { session, profile, signOut } = useAuth();
  // Self-service delete needs database update 0009 (adds onboarded_at and
  // the delete function). Until it's run, don't offer a button that would
  // fail half-way.
  const canDelete = !!profile && "onboarded_at" in profile;
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [confirm, setConfirm] = useState<"signout" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <section aria-labelledby="set-account">
      <div className="list-title" id="set-account">
        Account
      </div>
      <div className="list">
        <Link href="/privacy" className="list-row" data-testid="settings-privacy">
          <span className="lr-icon">
            <Icon name="shield" />
          </span>
          <span className="lr-body">Privacy &amp; your data</span>
          <Icon name="chev" />
        </Link>
        {signedIn && (
          <>
            <div className="list-row" style={{ cursor: "default" }}>
              <span className="lr-icon">
                <Icon name="google" />
              </span>
              <span className="lr-body">
                Signed in with Google
                <div className="lr-sub">{session?.user.email}</div>
              </span>
            </div>
            <button type="button" className="list-row" onClick={() => setConfirm("signout")} data-testid="signout">
              <span className="lr-icon">
                <Icon name="logout" />
              </span>
              <span className="lr-body">Sign out</span>
            </button>
            {canDelete ? (
              <button type="button" className="list-row danger" onClick={() => setConfirm("delete")} data-testid="delete-account">
                <span className="lr-icon">
                  <Icon name="trash" />
                </span>
                <span className="lr-body">Delete account</span>
              </button>
            ) : (
              <div className="list-row" style={{ cursor: "default" }}>
                <span className="lr-icon">
                  <Icon name="trash" />
                </span>
                <span className="lr-body">
                  Delete account
                  <div className="lr-sub">Ask the front desk</div>
                </span>
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmSheet
        open={confirm === "signout"}
        title="Sign out?"
        body="Your sets and streak stay saved — sign back in any time with Google."
        confirmLabel="Sign out"
        busy={busy}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          setBusy(true);
          await signOut();
          setBusy(false);
          setConfirm(null);
          router.replace("/");
          toast("Signed out");
        }}
      />
      <ConfirmSheet
        open={confirm === "delete"}
        title="Delete your account?"
        body={
          <>
            This permanently deletes your profile, every set and personal best, your streak, kudos and progress photos.
            <b> It can&rsquo;t be undone.</b>
          </>
        }
        confirmLabel="Delete everything"
        danger
        typeToConfirm="DELETE"
        busy={busy}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          if (!session) return;
          setBusy(true);
          try {
            await deleteMyAccount(supabase, session.user.id);
            await signOut();
            setConfirm(null);
            router.replace("/");
            toast("Your account has been deleted");
          } catch (err) {
            console.error(err);
            toast("Couldn't delete your account — please try again");
          } finally {
            setBusy(false);
          }
        }}
      />
    </section>
  );
}
