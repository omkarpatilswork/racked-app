// Ported 1:1 from the Racked Artifact prototype's gamification logic.
// The authoritative copy for PB/XP/level now lives server-side in the
// log_set() Postgres function (supabase/migrations/0001_init.sql) so a
// spoofed client can't fabricate a PB — keep this file in sync with that
// SQL if either ever changes; this copy is used for client-side previews
// (e.g. "would this be a PB?" before submitting) and for overall/aggregate
// display math that doesn't need to be tamper-proof.

export const XP_TABLE = { logSet: 10, newPB: 50, threeSets: 20, returnDay: 25 } as const;

export function calculateVolume(weight: number, reps: number) {
  return Math.round(weight * reps);
}

export function calculatePB(
  existing: { weight: number; reps: number } | null,
  weight: number,
  reps: number
) {
  if (!existing || weight > existing.weight || (weight === existing.weight && reps > existing.reps)) {
    return true;
  }
  return false;
}

export function requirementForLevel(level: number) {
  return 200 + (level - 1) * 100;
}

export function calculateMachineLevel(xpTotal: number) {
  let level = 1;
  let remaining = xpTotal || 0;
  while (remaining >= requirementForLevel(level)) {
    remaining -= requirementForLevel(level);
    level++;
  }
  return { level, into: Math.round(remaining), need: requirementForLevel(level) };
}

export function checkChallengeCompletion(
  weight: number,
  reps: number,
  challenge?: { weight: number; reps: number }
) {
  if (!challenge) return false;
  return weight >= challenge.weight && reps >= challenge.reps;
}
