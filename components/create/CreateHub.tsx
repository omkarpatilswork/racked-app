"use client";

// The + button's menu and composers: a post (text and/or up to 4 photos), a
// transformation (before + after), today's pump check, and "log a set"
// (tap or scan a sticker, or pick one of the 10 machines).
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
import { MachineSelect } from "@/components/feed/HomeFeed";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";
import { createPost, hasLink, notifyFeedChanged, onOpenCreate, type CreateTarget } from "@/lib/feed";
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
      {view === "post" && <PostComposer photosFirst={focusPhotos} onClose={() => setView(null)} onBack={() => setView("menu")} />}
      {view === "transformation" && <TransformationComposer onClose={() => setView(null)} onBack={() => setView("menu")} />}
      {view === "pump" && (
        <Sheet open onClose={() => setView(null)} title="Today's pump check" testId="pump-sheet">
          <p className="faint" style={{ margin: "0 0 12px", fontSize: 13.5 }}>
            A before and an after photo for today. Both optional; they show on the feed and your profile.
          </p>
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
  const active = activeId ? MACHINE_MAP[activeId] : null;
  const tiles: { v: View; icon: string; title: string; sub: string }[] = [
    { v: "post", icon: "pen", title: "Post", sub: "Say something, share photos, tag a machine" },
    { v: "transformation", icon: "compare", title: "Transformation", sub: "Before and after" },
    { v: "pump", icon: "camera", title: "Pump check", sub: "Today's photos" },
  ];
  return (
    <Sheet open onClose={onClose} title="Create" testId="create-menu" className="cx-sheet">
      <div className="cx-tiles">
        {tiles.map((t) => (
          <button key={t.v} type="button" className={`cx-tile t-${t.v}`} onClick={() => onPick(t.v)} data-testid={`create-${t.v}`}>
            <span className="cx-tile-ic" aria-hidden="true">
              <Icon name={t.icon} />
            </span>
            <span className="cx-tile-copy">
              <b>{t.title}</b>
              <small>{t.sub}</small>
            </span>
            {t.v === "post" && <Icon name="chev" />}
          </button>
        ))}
      </div>

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
        {active && (
          <Link href={`/machine/${active.id}/log`} className="cx-resume" onClick={onClose} data-testid="create-resume">
            <Icon name="flame" /> You&rsquo;re at {active.name}. Log your next set
            <Icon name="chev" />
          </Link>
        )}
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

function PostComposer({ photosFirst, onClose, onBack }: { photosFirst: boolean; onClose: () => void; onBack: () => void }) {
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
      <div className="cx-who">
        <Avatar name={profile?.display_name} url={profile?.avatar_url} size={36} />
        <span>
          <b>{profile?.display_name || "You"}</b>
          <small>Posting to the gym feed · members only</small>
        </span>
      </div>
      <label className="sr-only" htmlFor="cx-text">
        What&rsquo;s happening at the gym?
      </label>
      <textarea
        id="cx-text"
        className="cx-text"
        rows={picks.length ? 2 : 4}
        placeholder={photosFirst ? "Say something about it (optional)" : "What's happening at the gym? A win, a question, a shout-out…"}
        value={text}
        onChange={(e) => (setText(e.target.value), setErr(null))}
        data-autofocus={photosFirst ? undefined : ""}
        data-testid="post-text"
      />
      <div className="fx-compose-foot">
        <span className="faint">No links, please</span>
        <span className={`num${left < 0 ? " over" : left < 40 ? " low" : ""}`}>{left}</span>
      </div>

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
        {picks.length < 4 && (
          <button type="button" className={`cx-add${picks.length ? "" : " wide"}${photosFirst && !picks.length ? " lead" : ""}`} onClick={() => file.current?.click()} disabled={busy} data-testid="add-photos">
            <Icon name="image" />
            <span>{picks.length ? "Add" : "Add photos"}</span>
            {!picks.length && <small>Up to 4</small>}
          </button>
        )}
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

      <label className="field-label" htmlFor="cx-machine" style={{ marginTop: 12 }}>
        Tag a machine (optional)
      </label>
      <MachineSelect id="cx-machine" value={machine} onChange={setMachine} />

      {err && (
        <p className="field-error" role="alert">
          {err}
        </p>
      )}
      <div className="cx-foot">
        <button type="button" className="btn btn-ghost" onClick={onBack} disabled={busy}>
          Back
        </button>
        <button type="button" className="btn btn-yellow" onClick={submit} disabled={!canPost} data-testid="post-submit">
          {busy ? progress || "Posting…" : "Post"}
        </button>
      </div>
    </Sheet>
  );
}

const WEEKS = [2, 4, 6, 8, 12, 16, 20, 24, 36, 52, 104];

function TransformationComposer({ onClose, onBack }: { onClose: () => void; onBack: () => void }) {
  const { session } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [before, setBefore] = useState<Pick | null>(null);
  const [after, setAfter] = useState<Pick | null>(null);
  const [weeks, setWeeks] = useState("");
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
        weeks: weeks ? Number(weeks) : null,
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
      <div className="cx-slots">
        {slot("Before", before, bRef, setBefore, "before")}
        {slot("After", after, aRef, setAfter, "after")}
      </div>
      <label className="field-label" htmlFor="cx-weeks" style={{ marginTop: 12 }}>
        Time between them (optional)
      </label>
      <select id="cx-weeks" className="field" value={weeks} onChange={(e) => setWeeks(e.target.value)} data-testid="weeks">
        <option value="">Don&rsquo;t say</option>
        {WEEKS.map((w) => (
          <option key={w} value={w}>
            {w === 52 ? "1 year" : w === 104 ? "2 years" : `${w} weeks`}
          </option>
        ))}
      </select>
      <label className="field-label" htmlFor="cx-cap" style={{ marginTop: 12 }}>
        Caption (optional)
      </label>
      <textarea id="cx-cap" className="field fx-textarea" rows={2} value={text} onChange={(e) => (setText(e.target.value), setErr(null))} placeholder="What changed? What kept you going?" data-testid="transformation-text" />
      <div className="fx-compose-foot">
        <span className="faint">Only members can see it. Delete it any time.</span>
        <span className={`num${left < 0 ? " over" : ""}`}>{left}</span>
      </div>
      {err && (
        <p className="field-error" role="alert">
          {err}
        </p>
      )}
      <div className="cx-foot">
        <button type="button" className="btn btn-ghost" onClick={onBack} disabled={busy}>
          Back
        </button>
        <button type="button" className="btn btn-yellow" onClick={submit} disabled={!before || !after || busy || left < 0} data-testid="transformation-submit">
          {busy ? "Posting…" : "Post"}
        </button>
      </div>
    </Sheet>
  );
}
