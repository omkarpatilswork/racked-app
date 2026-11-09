// Shared wording for fair-play moderation: staff reason presets and the
// note a member sees when staff remove something of theirs.
import { MACHINE_MAP } from "@/lib/machines";
import type { MemberNotice } from "@/lib/data";

export const REMOVE_SET_REASONS = [
  "Weight not possible on this machine",
  "Looks like a typo",
  "Logged for someone else",
  "Test entry",
];
export const RESET_MEMBER_REASONS = ["Repeated fake entries", "Logged for someone else", "Member asked for a reset"];
export const RESET_MACHINE_REASONS = ["Weight stack changed", "Machine replaced", "Test data"];

export function machineLabel(machineId: string | null | undefined, mode?: string | null) {
  if (!machineId) return "a machine";
  const m = MACHINE_MAP[machineId];
  if (!m) return machineId;
  if (m.dual && mode && m.modes?.[mode]) return m.modes[mode].label;
  return m.name;
}

export function fmtNum(n: number | null | undefined) {
  if (n == null) return "–";
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: 1 });
}

// "Gym staff removed your 300 kg × 10 set on Lat Pulldown (9 Nov)."
export function noticeText(n: MemberNotice): { title: string; body: string } {
  const machine = machineLabel(n.machine_id, n.mode);
  const reason = n.reason ? ` Reason: ${n.reason}.` : "";
  if (n.kind === "set_removed") {
    const when = n.set_at ? ` (${new Date(n.set_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })})` : "";
    return {
      title: "A set was removed",
      body: `Gym staff removed your ${fmtNum(n.weight)} kg × ${n.reps} set on ${machine}${when}. Your PB and XP have been updated.${reason}`,
    };
  }
  if (n.kind === "member_machine_reset") {
    return {
      title: `${machine} history reset`,
      body: `Gym staff reset your sets and PB on ${machine}. Your next set there starts fresh.${reason}`,
    };
  }
  return {
    title: `${machine} was reset`,
    body: `Gym staff reset ${machine} for everyone, so its leaderboard starts fresh.${reason}`,
  };
}
