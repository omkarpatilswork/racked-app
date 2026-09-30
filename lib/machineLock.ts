"use client";

import { useEffect, useState } from "react";
import type { Machine } from "@/lib/machines";

const STORAGE_KEY = "racked:unlocked-machine";
// A tap unlocks its machine for the rest of the browser tab, capped at 4
// hours so a tab left open at home overnight doesn't stay "at the gym"
// forever.
const UNLOCK_TTL_MS = 4 * 60 * 60 * 1000;

type UnlockRecord = { machineId: string; unlockedAt: number };

function readUnlock(): UnlockRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw) as Partial<UnlockRecord>;
    if (!rec.machineId || !rec.unlockedAt) return null;
    if (Date.now() - rec.unlockedAt > UNLOCK_TTL_MS) return null;
    return rec as UnlockRecord;
  } catch {
    return null;
  }
}

function writeUnlock(machineId: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ machineId, unlockedAt: Date.now() }));
  } catch {
    // sessionStorage unavailable (private browsing etc.) -- nothing to do;
    // useMachineLock will simply keep re-checking each navigation and this
    // tap's URL param will still unlock the current page itself.
  }
}

export type LockStatus = "checking" | "unlocked" | "locked";

// Gates a machine's pages behind an actual NFC tap, so people can't just
// click their way from one machine to another inside the app and log
// numbers for equipment they're not standing at. A tap is recognized by a
// ?tap=<code> query param matching that machine's own tapCode -- that
// param is only ever present when the link came from the physical sticker,
// since none of the app's own in-app links add it. Once verified, the
// machine stays "unlocked" (sessionStorage) so its Log/Guide/Feedback pages
// stay reachable for the rest of the visit -- the gate only blocks jumping
// to a *different* machine without a fresh tap.
export function useMachineLock(machine: Machine | undefined, tapParam: string | null): LockStatus {
  const [status, setStatus] = useState<LockStatus>("checking");

  useEffect(() => {
    if (!machine) return;
    if (tapParam && tapParam === machine.tapCode) {
      writeUnlock(machine.id);
      setStatus("unlocked");
      return;
    }
    const rec = readUnlock();
    setStatus(rec?.machineId === machine.id ? "unlocked" : "locked");
  }, [machine, tapParam]);

  return status;
}
