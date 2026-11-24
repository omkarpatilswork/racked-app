"use client";

// "Get on the strength boards": pick Men / Women / Prefer not to say and add
// your body weight. Boards and prizes rank by ×BW (kg lifted ÷ body weight).
// Mounted once in the layout; any screen opens it with openBodySheet().
import { useEffect, useMemo, useState } from "react";
import Sheet from "@/components/Sheet";
import Icon from "@/components/Icon";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { BODY_CHANGED, CHOICE_LABEL, OPEN_BODY, fetchMyBody, saveMyBody, type BoardChoice, type MyBody } from "@/lib/body";
import { friendlyDbError, isMissingFunction } from "@/lib/data";
import { toast } from "@/lib/toast";
import { haptic } from "@/lib/haptics";

const LATER_KEY = "racked:body-later";

/** Your body settings, kept fresh after the sheet saves. null = loading,
 *  "off" = database update 0015 not run yet (no ×BW anywhere). */
export function useMyBody(): MyBody | null | "off" {
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const supabase = useMemo(() => createClient(), []);
  const [body, setBody] = useState<MyBody | null | "off">(null);
  useEffect(() => {
    if (!uid) {
      setBody(null);
      return;
    }
    let alive = true;
    const load = () =>
      fetchMyBody(supabase).then(
        (b) => alive && setBody(b),
        (e) => alive && setBody(isMissingFunction(e) ? "off" : { division: null, body_kg: null })
      );
    load();
    window.addEventListener(BODY_CHANGED, load);
    return () => {
      alive = false;
      window.removeEventListener(BODY_CHANGED, load);
    };
  }, [uid, supabase]);
  return body;
}

/** Ask now? Not if they tapped "Not now" in the last 3 days. */
export function shouldAskBody() {
  try {
    const t = Number(localStorage.getItem(LATER_KEY) || 0);
    return !t || Date.now() - t > 3 * 86400000;
  } catch {
    return true;
  }
}

const dateOf = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "");

export default function BodySheetHost() {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener(OPEN_BODY, on);
    return () => window.removeEventListener(OPEN_BODY, on);
  }, []);
  if (!open || !session) return null;
  return <BodySheet onClose={() => setOpen(false)} />;
}

function BodySheet({ onClose }: { onClose: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [cur, setCur] = useState<MyBody | null>(null);
  const [choice, setChoice] = useState<BoardChoice | null>(null);
  const [kg, setKg] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchMyBody(supabase)
      .then((b) => {
        setCur(b);
        setChoice(b.division);
        setKg(b.body_kg != null ? String(b.body_kg) : "");
      })
      .catch(() => setCur({ division: null, body_kg: null }));
  }, [supabase]);

  const first = !cur || cur.body_kg == null;
  const kgNum = Number(kg.replace(",", "."));
  const kgOk = kg.trim() !== "" && isFinite(kgNum) && kgNum >= 25 && kgNum <= 300;
  const kgLocked = !first && !!cur?.next_body_change;
  const divLocked = !first && !!cur?.next_division_change;
  const changed = first || (kgOk && kgNum !== cur?.body_kg) || choice !== cur?.division;

  async function save() {
    if (!choice) return setErr("Pick a board");
    if (!kgOk) return setErr("Body weight: 25 to 300 kg");
    setBusy(true);
    setErr(null);
    try {
      const next = await saveMyBody(supabase, choice !== cur?.division || first ? choice : null, first || kgNum !== cur?.body_kg ? Math.round(kgNum * 10) / 10 : null);
      haptic("success");
      try {
        localStorage.removeItem(LATER_KEY);
      } catch {
        /* ignore */
      }
      window.dispatchEvent(new Event(BODY_CHANGED));
      toast(first ? (next.division === "open" ? "Saved. You're on the All boards." : `You're on the ${CHOICE_LABEL[next.division as BoardChoice]}'s boards`) : "Saved");
      onClose();
    } catch (e) {
      setErr(friendlyDbError(e) || "Couldn't save that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function later() {
    try {
      localStorage.setItem(LATER_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    onClose();
  }

  const scoreEg = kgOk ? Math.round((60 / kgNum) * 100) : 80;
  return (
    <Sheet open onClose={onClose} title={first ? "Get on the strength boards" : "Body weight & board"} testId="body-sheet" className="bw-sheet">
      <p className="bw-lede">
        Your <b>score</b> = the weight you lift ÷ your body weight × 100, so everyone competes fairly for their size.
        {kgOk ? ` Lifting 60 kg at ${kgNum} kg = ${scoreEg}.` : " 60 kg lifted at 75 kg = 80."}
      </p>

      <div className="field-label" id="bw-board">
        Your board
      </div>
      <div className="bw-choices" role="radiogroup" aria-labelledby="bw-board">
        {(["men", "women", "open"] as BoardChoice[]).map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={choice === c}
            className={`bw-choice${choice === c ? " on" : ""}`}
            disabled={divLocked && c !== cur?.division}
            onClick={() => (setChoice(c), setErr(null))}
            data-testid={`bw-${c}`}
          >
            {c === "open" ? "Prefer not to say" : CHOICE_LABEL[c]}
          </button>
        ))}
      </div>
      <p className="field-hint">
        {choice === "open"
          ? "You'll be on the All boards. The weekly prizes are for the Men's and Women's boards."
          : divLocked
            ? `You can switch boards again from ${dateOf(cur?.next_division_change)}. Ask staff if it's wrong.`
            : "Men's and Women's boards each have their own prizes."}
      </p>

      <label className="field-label" htmlFor="bw-kg" style={{ marginTop: 14 }}>
        Body weight
      </label>
      <div className="bw-kg">
        <input
          id="bw-kg"
          className="field num"
          inputMode="decimal"
          type="number"
          step="0.1"
          min={25}
          max={300}
          placeholder="72.5"
          value={kg}
          disabled={kgLocked}
          onChange={(e) => (setKg(e.target.value), setErr(null))}
          data-testid="bw-kg"
          data-autofocus={first ? "" : undefined}
        />
        <span>kg</span>
      </div>
      <p className="field-hint">
        {kgLocked
          ? `You can update it again from ${dateOf(cur?.next_body_change)}.`
          : "Only you and gym staff see this number. You can update it once a week. Prize winners are weighed at the desk."}
        {cur?.checked_at ? (
          <span className="bw-checked">
            <Icon name="check" /> Checked at the desk {dateOf(cur.checked_at)}
          </span>
        ) : null}
      </p>

      {err && (
        <p className="field-error" role="alert">
          {err}
        </p>
      )}
      <div className="bw-foot">
        {first && (
          <button type="button" className="btn btn-ghost" onClick={later} data-testid="bw-later">
            Not now
          </button>
        )}
        <button type="button" className="btn btn-primary" disabled={busy || !choice || !kgOk || !changed} onClick={save} data-testid="bw-save">
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </Sheet>
  );
}
