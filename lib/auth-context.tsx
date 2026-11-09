"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/database.types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  // true while we don't yet know if someone is signed in (first load)
  loading: boolean;
  // replace the cached profile after a save, without another round trip
  setProfileData: (p: Profile | null) => void;
  signInWithGoogle: (next?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(
    async (uid: string) => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", uid)
        .single();
      setProfile(data ?? null);
    },
    [supabase]
  );

  useEffect(() => {
    let active = true;
    let lastUid: string | null = null;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession((prev) => prev ?? data.session);
      if (data.session && data.session.user.id !== lastUid) {
        lastUid = data.session.user.id;
        loadProfile(lastUid);
      }
      setLoading(false);
    });

    // auth-js re-emits SIGNED_IN with a fresh object every time the tab
    // becomes visible again. Keep the existing session object (and skip the
    // profile reload) unless something actually changed, so screens don't
    // reset what you were typing when you come back to the app.
    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession((prev) =>
        prev && newSession && prev.user.id === newSession.user.id && prev.access_token === newSession.access_token
          ? prev
          : newSession
      );
      const uid = newSession?.user.id ?? null;
      if (!uid) {
        lastUid = null;
        setProfile(null);
      } else if (uid !== lastUid || event === "USER_UPDATED") {
        lastUid = uid;
        loadProfile(uid);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase, loadProfile]);

  const signInWithGoogle = useCallback(
    async (next?: string) => {
      const redirectTo = new URL("/auth/callback", window.location.origin);
      if (next) redirectTo.searchParams.set("next", next);
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: redirectTo.toString() },
      });
    },
    [supabase]
  );

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      setSession(null);
      setProfile(null);
    }
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    if (session) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  return (
    <AuthContext.Provider
      value={{ session, profile, loading, setProfileData: setProfile, signInWithGoogle, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
