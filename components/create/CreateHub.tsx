"use client";

// The + button: make something for the feed. Three rows — Post (text and/or
// up to 4 photos), Transformation (before + after), Pump check (today's pre
// and post photos) — plus "Log next set" on top only in the 4 hours after a
// tap or scan (machine pages are locked otherwise). The old "Log a set" box
// and the list of all 10 machines are the plusMachines switch.
// Opened from the bottom bar, the composer bar on Home, or empty states, via
// openCreate() in lib/feed.ts.
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Sheet from "@/components/Sheet";
import Icon from "@/components/Icon";
import Avatar from "@/components/Avatar";
import PumpCheckCard from "@/components/PumpCheckCard";
import SignInSheet from "@/components/SignInSheet";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { apartLabel, createPost, hasLink, notifyFeedChanged, onOpenCreate, type CreateTarget } from "@/lib/feed";
import { useFeature } from "@/lib/features";
import { friendlyDbError } from "@/lib/data";
import { getActiveMachineId } from "@/lib/machineLock";
import { MACHINE_MAP, MACHINES } from "@/lib/machines";
import { toast } from "@/lib/toast";
import { haptic } from "@/lib/haptics";

const MAX = 280;
type View = "menu" | "post" | "transformation" | "pump";

export default function CreateHub() {
  const { session } = useAuth();
  const [view, setView] = useState<View | null>(null);
  const [focusPhotos, setFocusPhotos] = useState(false);
  const [signIn, setSignIn] = useState(false);

  useEffect(
    () =>
      onOpenCreate((t: CreateTarget) => {
        if (!session) {
          setSignIn(true);
          return;
        }
        setFocusPhotos(t === "photo");
        setView(t === "photo" ? "post" : t === "machines" ? "menu" : t === "menu" ? "menu" : (t as View));
      }),
    [session]
  );

  return (
    <>
      {view === "menu" && <CreateMenu onPick={(v) => (setFocusPhotos(false), setView(v))} onClose={() => setView(null)} />}
      {view === "post" && <PostComposer photosFirst={focusPhotos} onClose={() => setView(null)} />}
      {view === "transformation" && <TransformationComposer onClose={() => setView(null)} />}
      {view === "pump" && (
        <Sheet open onClose={() => setView(null)} title="Today's pump check" testId="pump-sheet">
          <PumpCheckCard bare />
        </Sheet>
      )}
      <SignInSheet open={signIn} onClose={() => setSignIn(false)} next="/home" />
    </>
  );
}

function CreateMenu({ onPick, onClose }: { onPick: (v: View) => void; onClose: () => void }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  useEffect(() => setActiveId(getActiveMachineId()), []);
  const machinesOn = useFeature("plusMachines");
  const active = activeId ? MACHINE_MAP[activeId] : null;
  const rows: { v: View; icon: string; title: string; sub: string }[] = [
    { v: "post", icon: "pen", title: "Post", sub: "Words, photos or both" },
    { v: "transformation", icon: "compare", title: "Transformation", sub: "Then vs now" },
    { v: "pump", icon: "camera", title: "Pump check", sub: "Today’s pre & post photos" },
  ];
  return (
    <Sheet open onClose={onClose} title="Create" testId="create-menu" className="cx-sheet">
      {active && (
        <Link href={`/machine/${active.id}/log`} className="cx2-resume" onClick={onClose} data-testid="create-resume">
          <span className="cx2-resume-n num" aria-hidden="true">
            {active.number}
          </span>
          <span className="cx2-copy">
            <b>Log next set</b>
            <small>{active.name} · you&rsquo;re here</small>
          </span>
          <Icon name="chev" />
        </Link>
      )}
      <div className="cx2-list">
        {rows.map((t) => (
          <button key={t.v} type="button" className={`cx2-row t-${t.v}`} onClick={() => onPick(t.v)} data-testid={`create-${t.v}`}>
            <span className="cx2-ic" aria-hidden="true">
              <Icon name={t.icon} />
            </span>
            <span className="cx2-copy">
              <b>{t.title}</b>
              <small>{t.sub}</small>
            </span>
            <Icon name="chev" />
          </button>
        ))}
      </div>

      {machinesOn && (
        <>
          <div className="cx-log" data-testid="create-log">
            <div className="cx-log-head">
              <span className="cx-log-ic" aria-hidden="true">
                <Icon name="nfc" />
              </span>
              <div>
                <b>Log a set</b>
                <span>Tap or scan the sticker on any machine with your phone.</span>
              </div>
            </div>
          </div>
          <div className="cx-machines-head">
            <h3>All {MACHINES.length} machines</h3>
            <span>How to use them, who&rsquo;s top</span>
          </div>
          <ul className="cx-machines" data-testid="create-machines">
            {MACHINES.map((m) => (
              <li key={m.id}>
                <Link href={`/machine/${m.id}`} onClick={onClose}>
                  <span className="cx-mno num">{m.number}</span>
                  <span className="cx-mname">
                    <b>{m.name}</b>
                    <small>{m.muscles.slice(0, 2).join(" · ")}</small>
                  </span>
                  <Icon name="chev" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Sheet>
  );
}

type Pick = { file: File; url: string };

function usePicks(max: number) {
  const [picks, setPicks] = useState<Pick[]>([]);
  const ref = useRef(picks);
  ref.current = picks;
  useEffect(() => () => ref.current.forEach((p) => URL.revokeObjectURL(p.url)), []);
  const add = (files: FileList | null) => {
    if (!files) return 0;
    const ok = Array.from(files).filter((f) => /^image\//.test(f.type));
    const room = Math.max(0, max - ref.current.length);
    const next = ok.slice(0, room).map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPicks((p) => [...p, ...next]);
    return ok.length - next.length;
  };
  const remove = (i: number) =>
    setPicks((p) => {
      URL.revokeObjectURL(p[i].url);
      return p.filter((_, n) => n !== i);
    });
  return { picks, add, remove, setPicks };
}

function useAfterPost() {
  const router = useRouter();
  const pathname = usePathname();
  return () => {
    notifyFeedChanged();
    if (pathname !== "/home") router.push("/home");
  };
}

// "Tag a machine" as a pill; the native picker opens on top of it
function machineName(v: string) {
  const [id, mode] = v.split("|");
  const m = MACHINE_MAP[id];
  if (!m) return null;
  return `${m.number} ${(mode && m.modes?.[mode]?.label) || m.name}`;
}

function PostComposer({ photosFirst, onClose }: { photosFirst: boolean; onClose: () => void }) {
  const { session, profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [text, setText] = useState("");
  const [machine, setMachine] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { picks, add, remove } = usePicks(4);
  const file = useRef<HTMLInputElement>(null);
  const done = useAfterPost();
  const left = MAX - text.length;
  const canPost = (text.trim().length > 0 || picks.length > 0) && left >= 0 && !busy;
  const tagged = machine ? machineName(machine) : null;

  async function submit() {
    if (!session) return;
    if (hasLink(text)) return setErr("Links can't be posted. Write it out instead.");
    setBusy(true);
    setErr(null);
    try {
      const [id, mode] = machine.split("|");
      await createPost(
        supabase,
        session.user.id,
        { kind: picks.length ? "photo" : "text", body: text, files: picks.map((p) => ({ file: p.file })), machineId: id || null, mode: mode || null },
        (d, t) => setProgress(`Uploading ${d} of ${t}…`)
      );
      haptic("success");
      toast("Posted to the gym feed");
      onClose();
      done();
    } catch (e) {
      setErr(friendlyDbError(e) || "Couldn't post that. Check your connection and try again.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <Sheet open onClose={busy ? () => undefined : onClose} title="New post" testId="post-composer" className="cx-sheet">
      <div className="cx2-who">
        <Avatar name={profile?.display_name} url={profile?.avatar_url} size={32} />
        <span>
          <b>{profile?.display_name || "You"}</b>
          <small>Gym feed · members only</small>
        </span>
      </div>
      <label className="sr-only" htmlFor="cx-text">
        What&rsquo;s happening at the gym?
      </label>
      <textarea
        id="cx-text"
        className="cx-text"
        rows={picks.length ? 2 : 4}
        placeholder={photosFirst ? "Say something about it (optional)" : "What’s happening at the gym?"}
        value={text}
        onChange={(e) => (setText(e.target.value), setErr(null))}
        data-autofocus={photosFirst ? undefined : ""}
        data-testid="post-text"
      />
      {left < 40 && (
        <div className="cx2-count">
          <span className={`num${left < 0 ? " over" : " low"}`}>{left}</span>
        </div>
      )}

      {picks.length > 0 && (
        <div className="cx-photos" data-testid="post-photos">
          {picks.map((p, i) => (
            <div key={p.url} className="cx-thumb">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={`Photo ${i + 1}`} />
              <button type="button" onClick={() => remove(i)} aria-label={`Remove photo ${i + 1}`} disabled={busy}>
                <Icon name="x" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="cx2-tools">
        <button
          type="button"
          className={`cx2-tool${photosFirst && !picks.length ? " lead" : ""}${picks.length ? " on" : ""}`}
          onClick={() => file.current?.click()}
          disabled={busy || picks.length >= 4}
          data-testid="add-photos"
        >
          <Icon name="image" />
          <span className="cx2-tool-t">{picks.length ? `Photos ${picks.length}/4` : "Photos"}</span>
          {!picks.length && <small>up to 4</small>}
        </button>
        <label className={`cx2-tool${tagged ? " on" : ""}`} htmlFor="cx-machine">
          <Icon name="dumbbell" />
          <span className="cx2-tool-t">{tagged || "Tag a machine"}</span>
          <select id="cx-machine" className="cx2-tool-select" value={machine} onChange={(e) => setMachine(e.target.value)} disabled={busy} aria-label="Tag a machine (optional)">
            <option value="">No machine</option>
            {MACHINES.flatMap((m) =>
              m.dual && m.modes
                ? Object.entries(m.modes).map(([k, md]) => (
                    <option key={`${m.id}|${k}`} value={`${m.id}|${k}`}>
                      {m.number} {md.label}
                    </option>
                  ))
                : [
                    <option key={m.id} value={m.id}>
                      {m.number} {m.name}
                    </option>,
                  ]
            )}
          </select>
        </label>
        <input
          ref={file}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const skipped = add(e.target.files);
            if (skipped > 0) toast("Up to 4 photos per post");
            e.target.value = "";
          }}
          data-testid="post-file"
        />
      </div>

      {err && (
        <p className="field-error" role="alert">
          {err}
        </p>
      )}
      <button type="button" className="btn btn-yellow cx2-post" onClick={submit} disabled={!canPost} data-testid="post-submit">
        {busy ? progress || "Posting…" : "Post"}
      </button>
    </Sheet>
  );
}

// "How long apart?" (weeks); tap again to clear
const APART = [4, 8, 12, 26, 52, 104];

function TransformationComposer({ onClose }: { onClose: () => void }) {
  const { session } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [before, setBefore] = useState<Pick | null>(null);
  const [after, setAfter] = useState<Pick | null>(null);
  const [weeks, setWeeks] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const bRef = useRef<HTMLInputElement>(null);
  const aRef = useRef<HTMLInputElement>(null);
  const done = useAfterPost();
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);
  const pick = (files: FileList | null, set: (p: Pick) => void) => {
    const f = files?.[0];
    if (!f || !/^image\//.test(f.type)) return;
    const url = URL.createObjectURL(f);
    urls.current.push(url);
    set({ file: f, url });
  };
  const left = MAX - text.length;

  async function submit() {
    if (!session || !before || !after) return;
    if (hasLink(text)) return setErr("Links can't be posted. Write it out instead.");
    setBusy(true);
    setErr(null);
    try {
      await createPost(supabase, session.user.id, {
        kind: "transformation",
        body: text,
        files: [
          { file: before.file, label: "before" },
          { file: after.file, label: "after" },
        ],
        weeks,
      });
      haptic("success");
      toast("Transformation posted");
      onClose();
      done();
    } catch (e) {
      setErr(friendlyDbError(e) || "Couldn't post that. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const slot = (label: string, p: Pick | null, ref: React.RefObject<HTMLInputElement>, set: (p: Pick) => void, id: string) => (
    <button type="button" className={`cx-slot${p ? " has" : ""}`} onClick={() => ref.current?.click()} disabled={busy} data-testid={`slot-${id}`}>
      {p ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.url} alt={`${label} photo`} />
      ) : (
        <span className="cx-slot-empty">
          <Icon name="camera" />
          Add photo
        </span>
      )}
      <span className="fx-media-tag l">{label}</span>
      <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => (pick(e.target.files, set), (e.target.value = ""))} data-testid={`file-${id}`} />
    </button>
  );

  return (
    <Sheet open onClose={busy ? () => undefined : onClose} title="New transformation" testId="transformation-composer" className="cx-sheet">
      <div className="cx-slots cx2-slots">
        {slot("Before", before, bRef, setBefore, "before")}
        {slot("After", after, aRef, setAfter, "after")}
      </div>
      <div className="cx2-label" id="cx-weeks-l">
        How long apart? <span className="faint">(optional)</span>
      </div>
      <div className="cx2-chips" role="group" aria-labelledby="cx-weeks-l" data-testid="weeks">
        {APART.map((w) => (
          <button key={w} type="button" aria-pressed={weeks === w} className={weeks === w ? "on" : ""} onClick={() => setWeeks(weeks === w ? null : w)} disabled={busy} data-testid={`weeks-${w}`}>
            {apartLabel(w)}
          </button>
        ))}
      </div>
      <label className="sr-only" htmlFor="cx-cap">
        Caption (optional)
      </label>
      <input
        id="cx-cap"
        className="field cx2-cap"
        maxLength={MAX}
        value={text}
        onChange={(e) => (setText(e.target.value), setErr(null))}
        placeholder="What changed? (optional)"
        data-testid="transformation-text"
      />
      {err && (
        <p className="field-error" role="alert">
          {err}
        </p>
      )}
      <button type="button" className="btn btn-yellow cx2-post" onClick={submit} disabled={!before || !after || busy || left < 0} data-testid="transformation-submit">
        {busy ? "Posting…" : "Post"}
      </button>
    </Sheet>
  );
}
