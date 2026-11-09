"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";

// A small pill at the top of the screen when the phone loses connection
// (common in basement gyms), and a brief "back online" when it returns.
export default function NetworkStatus() {
  const [state, setState] = useState<"online" | "offline" | "back">("online");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) setState("offline");
    const off = () => {
      if (timer.current) clearTimeout(timer.current);
      setState("offline");
    };
    const on = () => {
      setState("back");
      timer.current = setTimeout(() => setState("online"), 2500);
    };
    window.addEventListener("offline", off);
    window.addEventListener("online", on);
    return () => {
      window.removeEventListener("offline", off);
      window.removeEventListener("online", on);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (state === "online") return null;
  return (
    <div className={`net-banner${state === "back" ? " back" : ""}`} role="status" aria-live="polite" data-testid="net-banner">
      <Icon name={state === "back" ? "check" : "offline"} />
      {state === "back" ? "Back online" : "You're offline — sets will need a connection"}
    </div>
  );
}
