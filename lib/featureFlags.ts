// On/off switches for features that are archived, not deleted.
//
// Home v4 and Ranks v2 (Nov 2026) keep things simple for launch. Home: a slim
// streak / sets row, one big "Log a set" button, the composer bar and one
// feed. Ranks: score, kg moved and heaviest lift, no XP, 3 missions.
// Rewards v2: Win · Partners, no XP, no Shop.
// Everything switched off below still works and is still tested: flip
// it to true, push, and it's back on Home. Prizes, challenges and the
// body-weight ask keep working on Ranks, Rewards, the log screen, Settings
// and the TV whatever these say.
// No React here: lib/rewards.ts and lib/story.ts read featureOn() and are also
// imported by server code. Components use useFeature() from lib/features.ts.
export type FeatureKey =
  | "homeLevel"
  | "homeBodyCard"
  | "homeFilters"
  | "homePrizeCard"
  | "homeChallengeCards"
  | "ranksXp"
  | "ranksAllMissions"
  | "rewardsShop"
  | "xp";

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
  /** Ranks: XP as a 4th "Show" choice (the old XP boards) and the +XP labels
   *  on streak steps, missions and badges. XP still counts in the background. */
  ranksXp: false,
  /** Ranks: all 5 weekly missions (off = Train 3 days, Beat a PB, Move 5,000 kg). */
  ranksAllMissions: false,
  /** Rewards: the Shop tab (spend XP on partner goodies). Off until the shop opens. */
  rewardsShop: false,
  /** XP shown to members outside Ranks: Rewards (chip, How XP works, +XP for
   *  joining), set toasts, the PB celebration, feed PR cards, partner offers'
   *  "Claim with XP", levels on You and machine pages. XP still counts. */
  xp: false,
};

/** The 3 weekly missions shown on Ranks while ranksAllMissions is off. */
export const RANKS_MISSIONS = ["days3", "pb1", "volume5k"];

/** A switch, read once (for code that isn't a component, e.g. toasts). */
export function featureOn(key: FeatureKey): boolean {
  try {
    const v = typeof window !== "undefined" ? localStorage.getItem(`racked:feature:${key}`) : null;
    if (v === "on" || v === "off") return v === "on";
  } catch {
    /* storage blocked */
  }
  return FEATURES[key];
}
