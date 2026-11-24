"use client";

// On/off switches for features that are archived, not deleted.
//
// Home v4 (Nov 2026) keeps the first screen simple for launch: a slim
// streak / sets row, one big "Log a set" button, the composer bar and one
// feed. Everything switched off below still works and is still tested: flip
// it to true, push, and it's back on Home. Prizes, challenges and the
// body-weight ask keep working on Ranks, Rewards, the log screen, Settings
// and the TV whatever these say.
import { useEffect, useState } from "react";

export type FeatureKey = "homeLevel" | "homeBodyCard" | "homeFilters" | "homePrizeCard" | "homeChallengeCards";

export const FEATURES: Record<FeatureKey, boolean> = {
  /** Home: the level ring next to the streak and sets (level is on You). */
  homeLevel: false,
  /** Home: the "Get on the strength boards" card (the log screen asks once anyway). */
  homeBodyCard: false,
  /** Home feed: For you · PRs · Photos · Transformations · Posts · Gym tabs. */
  homeFilters: false,
  /** Home feed: the big "This week's prize" card. */
  homePrizeCard: false,
  /** Home feed: challenge cards (live and starting within 3 days). */
  homeChallengeCards: false,
};

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
