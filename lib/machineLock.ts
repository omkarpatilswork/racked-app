"use client";

import { useEffect, useState } from "react";
import type { Machine } from "@/lib/machines";

const STORAGE_KEY = "racked:unlocked-machine";
// A tap unlocks its machine for the rest of the browser tab, capped at 4
// hours so a tab left open at home overnight doesn't stay "at the gym"
// forever.
const UNLOCK_TTL_MS = 4 * 60 * 60 * 1000;

// How a visit got in: the machine's NFC sticker or its QR code.
export type TapSource = "nfc" | "qr";

type UnlockRecord = { machineId: string; unlockedAt: number; source?: TapSource };

// Works out which physical entry point a ?tap=<code> came from. NFC stickers
// and QR codes carry *different* codes for the same machine, so the code that
// matched is the source -- it can't be spoofed by editing a separate
// "source" URL parameter, and old NFC tags (programmed before QR existed)
// keep resolving to "nfc" without being reprogrammed.
export function resolveTapSource(machine: Machine | undefined, tapParam: string | null): TapSource | null {
  if (!machine || !tapParam) return null;
  if (tapParam === machine.tapCode) return "nfc";
  if (tapParam === machine.qrCode) return "qr";
  return null;
}

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

function writeUnlock(machineId: string, source: TapSource) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ machineId, unlockedAt: Date.now(), source }));
  } catch {
    // sessionStorage unavailable (private browsing etc.) -- nothing to do;
    // useMachineLock will simply keep re-checking each navigation and this
    // tap's URL param will still unlock the current page itself.
  }
}

// A refresh, a double-fired effect or a quick back-and-forth would otherwise
// log the same physical scan several times. Returns true the first time a
// given machine is claimed, then false for the next 60 seconds.
const TAP_DEDUPE_KEY = "racked:last-recorded-tap";
const TAP_DEDUPE_MS = 60 * 1000;

export function claimTapRecord(machineId: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.sessionStorage.getItem(TAP_DEDUPE_KEY);
    if (raw) {
      const last = JSON.parse(raw) as { machineId?: string; at?: number };
      if (last.machineId === machineId && last.at && Date.now() - last.at < TAP_DEDUPE_MS) return false;
    }
    window.sessionStorage.setItem(TAP_DEDUPE_KEY, JSON.stringify({ machineId, at: Date.now() }));
  } catch {
    // sessionStorage unavailable -- better to over-count a scan than drop it.
  }
  return true;
}

export type LockStatus = "checking" | "unlocked" | "locked";

// Gates a machine's pages behind an actual scan of its NFC sticker or QR
// code, so people can't just click their way from one machine to another
// inside the app and log numbers for equipment they're not standing at. A
// scan is recognized by a ?tap=<code> query param matching that machine's
// own tapCode (NFC) or qrCode (QR) -- that param is only ever present when
// the link came from the physical sticker, since none of the app's own
// in-app links add it. Once verified, the
// machine stays "unlocked" (sessionStorage) so its Log/Guide/Feedback pages
// stay reachable for the rest of the visit -- the gate only blocks jumping
// to a *different* machine without a fresh tap.
export function useMachineLock(machine: Machine | undefined, tapParam: string | null): LockStatus {
  const [status, setStatus] = useState<LockStatus>("checking");

  useEffect(() => {
    if (!machine) return;
    const source = resolveTapSource(machine, tapParam);
    if (source) {
      writeUnlock(machine.id, source);
      setStatus("unlocked");
      return;
    }
    const rec = readUnlock();
    setStatus(rec?.machineId === machine.id ? "unlocked" : "locked");
  }, [machine, tapParam]);

  return status;
}
