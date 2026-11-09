"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { applyTheme, getThemePref } from "@/lib/theme";
import { toast } from "@/lib/toast";
import { captureInstallPrompt } from "@/lib/install";

// App-wide side effects that don't render anything:
//  - keep "System" theme in sync if the phone switches light/dark
//  - register the service worker (installable app + offline page), prod only
//  - show a friendly message if Google sign-in failed and bounced back
function Effects() {
  const params = useSearchParams();

  useEffect(() => {
    applyTheme(getThemePref());
    const mq = window.matchMedia?.("(prefers-color-scheme: light)");
    const onChange = () => {
      if (getThemePref() === "system") applyTheme("system");
    };
    mq?.addEventListener?.("change", onChange);
    return () => mq?.removeEventListener?.("change", onChange);
  }, []);

  useEffect(() => captureInstallPrompt(), []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const register = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  useEffect(() => {
    if (params.get("auth_error")) {
      toast("Sign-in didn't finish — please try again");
      const url = new URL(window.location.href);
      url.searchParams.delete("auth_error");
      window.history.replaceState(null, "", url.toString());
    }
  }, [params]);

  return null;
}

export default function AppEffects() {
  return (
    <Suspense fallback={null}>
      <Effects />
    </Suspense>
  );
}
