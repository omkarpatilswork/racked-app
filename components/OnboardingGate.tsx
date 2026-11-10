"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

// Sends a brand-new member to the short welcome (/welcome) the first time
// they're signed in, then back to wherever they were going (e.g. the machine
// they just tapped). Only a profile with onboarded_at === null triggers it:
// if migration 0009 hasn't been run the field is missing (undefined) and
// nobody is redirected.
const SKIP = ["/welcome", "/tv", "/auth", "/privacy", "/admin", "/offline", "/about"];

export default function OnboardingGate() {
  const { session, profile } = useAuth();
  const pathname = usePathname() || "/";
  const router = useRouter();

  useEffect(() => {
    if (!session || !profile) return;
    if (profile.onboarded_at !== null) return;
    // the landing page sends members on to /home itself
    if (pathname === "/" || SKIP.some((p) => pathname.startsWith(p))) return;
    try {
      if (window.sessionStorage.getItem("racked:welcome-skipped") === "1") return;
    } catch {
      /* ignore */
    }
    const next = pathname + (typeof window !== "undefined" ? window.location.search : "");
    router.replace(`/welcome?next=${encodeURIComponent(next)}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id, profile?.onboarded_at, pathname, router]);

  return null;
}
