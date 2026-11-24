"use client";

// The switches themselves live in lib/featureFlags.ts (see there).
import { useEffect, useState } from "react";
import { FEATURES, type FeatureKey } from "@/lib/featureFlags";

export { FEATURES, RANKS_MISSIONS, featureOn, type FeatureKey } from "@/lib/featureFlags";

/** A switch, as a hook. Tests can turn one on in a browser with
 *  localStorage "racked:feature:<key>" = "on" (or "off"); members never do. */
export function useFeature(key: FeatureKey): boolean {
  const [on, setOn] = useState(FEATURES[key]);
  useEffect(() => {
    try {
      const v = localStorage.getItem(`racked:feature:${key}`);
      if (v === "on" || v === "off") setOn(v === "on");
    } catch {
      /* storage blocked: keep the default */
    }
  }, [key]);
  return on;
}
