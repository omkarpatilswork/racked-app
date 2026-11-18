"use client";

// R&R Controls → Feed: gym notices and partner offers that show on everyone's
// Home feed. Pinned ones sit at the top (members can hide them for
// themselves) until their end date. Shows a live preview while editing.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import Sheet from "@/components/Sheet";
import PhotoField from "@/components/rnr/PhotoField";
import { LoadError, SkeletonList, needsMigration } from "@/components/admin/shared";
import { NoticeCard, OfferCard } from "@/components/feed/cards";
import { adminDeleteGymPost, adminGymPosts, adminSaveGymPost, type AdminGymPost, type GymPost } from "@/lib/feed";
import { friendlyDbError } from "@/lib/data";
import { toast } from "@/lib/toast";
import type { AdminRrData, Client } from "@/lib/rewards";

const STATUS: Record<AdminGymPost["status"], { label: string; cls: string }> = {
  live: { label: "Live", cls: "pill-yellow" },
  scheduled: { label: "Scheduled", cls: "rw-pill" },
  ended: { label: "Ended", cls: "rw-pill" },
  off: { label: "Off", cls: "rw-pill" },
};

const shortDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";
function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : "");
function errMsg(err: unknown) {
  const friendly = friendlyDbError(err);
  if (friendly) return friendly;
  const m = (err as { message?: string })?.message;
  return m && m.length < 90 && !/^[A-Z0-9]{5}$/.test(m) ? m : "That didn't go through. Try again.";
}

export default function FeedAdmin({ supabase, data }: { supabase: Client; data: AdminRrData }) {
  const [rows, setRows] = useState<AdminGymPost[] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [editing, setEditing] = useState<Partial<AdminGymPost> | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(() => {
    adminGymPosts(supabase)
      .then((r) => {
        setRows(r);
        setState("ready");
      })
      .catch((err) => setState(needsMigration(err) ? "missing" : "error"));
  }, [supabase]);
  useEffect(load, [load]);

  async function quick(p: AdminGymPost, patch: { pinned?: boolean; active?: boolean }) {
    setBusy(p.id);
    try {
      await adminSaveGymPost(supabase, { id: p.id, ...patch });
      toast(patch.pinned !== undefined ? (patch.pinned ? "Pinned to the top" : "Unpinned") : patch.active ? "Showing on the feed" : "Taken off the feed");
      load();
    } catch (e) {
      toast(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  if (state === "missing") {
    return (
      <div className="card" data-testid="needs-0014">
        <div className="row" style={{ justifyContent: "flex-start", gap: 12 }}>
          <span className="tapin-icons" aria-hidden="true">
            <Icon name="megaphone" />
          </span>
          <div>
            <b>Turn on the feed</b>
            <div className="faint" style={{ fontSize: 13, marginTop: 2 }}>
              Run database update <span className="num">0014_social_feed.sql</span> in Supabase → SQL Editor, then refresh.
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (state === "error") return <LoadError onRetry={load} />;

  return (
    <>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <p className="faint" style={{ margin: 0, fontSize: 13, flex: 1 }}>
          Notices and partner offers on everyone&rsquo;s Home feed. Pin one to keep it at the top until it ends.
        </p>
        <span style={{ display: "flex", gap: 6, flex: "none" }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing({ kind: "notice", active: true, pinned: false })} data-testid="new-notice">
            + Notice
          </button>
          <button type="button" className="btn btn-yellow btn-sm" onClick={() => setEditing({ kind: "offer", active: true, pinned: false })} data-testid="new-offer">
            + Offer
          </button>
        </span>
      </div>
      <Link href="/admin/photos" className="list-row rr-feed-reports" data-testid="feed-reports-link">
        <Icon name="flag" />
        <span style={{ flex: 1 }}>
          Reported posts and comments
          <span className="faint" style={{ display: "block", fontSize: 12.5 }}>
            Members&rsquo; reports land here. Keep, hide or delete.
          </span>
        </span>
        <Icon name="chev" />
      </Link>
      {rows === null ? (
        <SkeletonList rows={3} height={96} />
      ) : rows.length === 0 ? (
        <div className="card center" style={{ padding: 22 }} data-testid="gym-posts-empty">
          <b>Nothing posted yet</b>
          <p className="faint" style={{ margin: "4px 0 0", fontSize: 13 }}>
            Try a notice (holiday timings, a new machine) or an offer from a partner brand.
          </p>
        </div>
      ) : (
        <div className="stack">
          {rows.map((p) => (
            <article key={p.id} className="card rr-gp" data-testid="admin-gym-post">
              <div className="rr-gp-top">
                <span className={`pill ${p.kind === "offer" ? "pill-yellow" : "rw-pill"}`}>
                  <Icon name={p.kind === "offer" ? "tag" : "megaphone"} /> {p.kind === "offer" ? "Offer" : "Notice"}
                </span>
                <span className={`pill ${STATUS[p.status].cls}`} data-testid="gp-status">
                  {STATUS[p.status].label}
                </span>
                {p.pinned && (
                  <span className="pill rw-pill">
                    <Icon name="pin" /> Pinned
                  </span>
                )}
              </div>
              <h3 className="rr-gp-title">{p.title}</h3>
              {p.body && <p className="rr-gp-body">{p.body}</p>}
              <div className="faint" style={{ fontSize: 12.5 }}>
                {[p.sponsor?.name, p.code ? `Code ${p.code}` : null, `From ${shortDate(p.starts_at)}`, p.ends_at ? `until ${shortDate(p.ends_at)}` : "no end date"].filter(Boolean).join(" · ")}
              </div>
              <div className="rw-ch-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(p)} data-testid="edit-gym-post">
                  <Icon name="edit" /> Edit
                </button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy === p.id} onClick={() => quick(p, { pinned: !p.pinned })} data-testid="pin-gym-post">
                  <Icon name="pin" /> {p.pinned ? "Unpin" : "Pin"}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy === p.id} onClick={() => quick(p, { active: !p.active })} data-testid="toggle-gym-post">
                  {p.active ? "Turn off" : "Turn on"}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {editing && (
        <GymPostForm
          supabase={supabase}
          value={editing}
          data={data}
          onClose={() => setEditing(null)}
          onSave={async (p) => {
            await adminSaveGymPost(supabase, p);
            toast(editing.id ? "Saved" : p.kind === "offer" ? "Offer posted" : "Notice posted");
            setEditing(null);
            load();
          }}
          onDelete={
            editing.id
              ? async () => {
                  await adminDeleteGymPost(supabase, editing.id!);
                  toast("Deleted");
                  setEditing(null);
                  load();
                }
              : undefined
          }
        />
      )}
    </>
  );
}

function GymPostForm({
  supabase,
  value,
  data,
  onSave,
  onDelete,
  onClose,
}: {
  supabase: Client;
  value: Partial<AdminGymPost>;
  data: AdminRrData;
  onSave: (p: Record<string, unknown>) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}) {
  const [f, setF] = useState({
    kind: (value.kind || "notice") as "notice" | "offer",
    title: value.title || "",
    body: value.body || "",
    image_url: value.image_url || "",
    sponsor_id: value.sponsor_id || "",
    reward_id: value.reward_id ? String(value.reward_id) : "",
    code: value.code || "",
    cta_label: value.cta_label || "",
    cta_url: value.cta_url || "",
    pinned: value.pinned ?? false,
    active: value.active ?? true,
    starts_at: toLocalInput(value.starts_at),
    ends_at: toLocalInput(value.ends_at),
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => (setF((x) => ({ ...x, [k]: v })), setErr(null));
  const sponsor = data.sponsors.find((s) => s.id === f.sponsor_id) || null;
  const rewards = data.rewards.filter((r) => r.active && (!f.sponsor_id || !r.sponsor_id || r.sponsor_id === f.sponsor_id));
  const reward = data.rewards.find((r) => String(r.id) === f.reward_id) || null;
  const offer = f.kind === "offer";

  const preview: GymPost = useMemo(
    () => ({
      id: value.id || 0,
      kind: f.kind,
      title: f.title.trim() || (offer ? "Your offer headline" : "Your notice headline"),
      body: f.body.trim() || null,
      image_url: f.image_url || null,
      code: offer ? f.code.trim() || null : null,
      cta_label: f.cta_label.trim() || null,
      cta_url: f.cta_url.trim() || null,
      reward_id: offer && reward ? reward.id : null,
      pinned: f.pinned,
      starts_at: fromLocalInput(f.starts_at) || new Date().toISOString(),
      ends_at: fromLocalInput(f.ends_at) || null,
      sponsor: offer && sponsor ? { id: sponsor.id, name: sponsor.name, logo_url: sponsor.logo_url, website_url: sponsor.website_url } : null,
      reward: offer && reward ? { id: reward.id, title: reward.title, xp_cost: reward.xp_cost } : null,
    }),
    [f, offer, sponsor, reward, value.id]
  );

  async function save() {
    if (!f.title.trim()) return setErr("Give it a title");
    const url = f.cta_url.trim();
    if (url && !/^https?:\/\/\S+$/i.test(url)) return setErr("The button link must start with https://");
    const start = fromLocalInput(f.starts_at);
    const end = fromLocalInput(f.ends_at);
    if (end && new Date(end).getTime() <= (start ? new Date(start).getTime() : Date.now())) return setErr("The end has to be after the start");
    setBusy(true);
    setErr(null);
    try {
      await onSave({
        ...(value.id ? { id: value.id } : {}),
        kind: f.kind,
        title: f.title.trim(),
        body: f.body.trim(),
        image_url: f.image_url,
        sponsor_id: offer ? f.sponsor_id : "",
        reward_id: offer ? f.reward_id : "",
        code: offer ? f.code.trim() : "",
        cta_label: f.cta_label.trim(),
        cta_url: url,
        pinned: f.pinned,
        active: f.active,
        starts_at: start,
        ends_at: end,
      });
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={busy ? () => undefined : onClose} title={value.id ? "Edit" : offer ? "New offer" : "New notice"} testId="gym-post-form">
      <div className="stack">
        <div className="chip-row" role="radiogroup" aria-label="Kind">
          {(["notice", "offer"] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={f.kind === k} className={`chip${f.kind === k ? " on" : ""}`} onClick={() => set("kind", k)} data-testid={`gp-kind-${k}`}>
              <Icon name={k === "offer" ? "tag" : "megaphone"} /> {k === "offer" ? "Partner offer" : "Gym notice"}
            </button>
          ))}
        </div>
        <Field id="gp-title" label="Title" hint={`${f.title.length}/80`}>
          <input id="gp-title" className="field" maxLength={80} value={f.title} onChange={(e) => set("title", e.target.value)} placeholder={offer ? "15% off any jersey" : "Closed Sunday for Diwali"} data-testid="gp-title" />
        </Field>
        <Field id="gp-body" label="Text (optional)" hint={`${f.body.length}/400`}>
          <textarea id="gp-body" className="field" rows={3} maxLength={400} value={f.body} onChange={(e) => set("body", e.target.value)} placeholder={offer ? "For Club 360 members this week. Name and number printed free." : "Open again Monday from 6 am."} data-testid="gp-body" />
        </Field>
        <PhotoField supabase={supabase} label="Photo (optional)" hint="A wide photo works best." value={f.image_url} onChange={(u) => set("image_url", u)} folder="feed" testId="gp-photo" />
        {offer && (
          <>
            <Field id="gp-brand" label="Brand">
              <select id="gp-brand" className="field" value={f.sponsor_id} onChange={(e) => set("sponsor_id", e.target.value)} data-testid="gp-brand">
                <option value="">No brand (from the gym)</option>
                {data.sponsors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="gp-code" label="Discount code (optional)" hint="Members tap it to copy.">
              <input id="gp-code" className="field num" maxLength={40} value={f.code} onChange={(e) => set("code", e.target.value.toUpperCase())} placeholder="RACKED15" data-testid="gp-code" />
            </Field>
            <Field id="gp-reward" label="XP shop item (optional)" hint="Adds a Claim button that opens the shop.">
              <select id="gp-reward" className="field" value={f.reward_id} onChange={(e) => set("reward_id", e.target.value)} data-testid="gp-reward">
                <option value="">None</option>
                {rewards.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                    {r.xp_cost ? ` · ${r.xp_cost} XP` : ""}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
        <div className="rw-form-row">
          <Field id="gp-cta-label" label="Button text">
            <input id="gp-cta-label" className="field" maxLength={30} value={f.cta_label} onChange={(e) => set("cta_label", e.target.value)} placeholder={offer ? "Shop now" : "Read more"} data-testid="gp-cta-label" />
          </Field>
          <Field id="gp-cta-url" label="Button link" hint={offer ? "Empty = the brand's website." : "Empty = no button."}>
            <input id="gp-cta-url" className="field" inputMode="url" value={f.cta_url} onChange={(e) => set("cta_url", e.target.value)} placeholder="https://…" data-testid="gp-cta-url" />
          </Field>
        </div>
        <div className="rw-form-row">
          <Field id="gp-start" label="Starts" hint="Empty = now.">
            <input id="gp-start" type="datetime-local" className="field" value={f.starts_at} onChange={(e) => set("starts_at", e.target.value)} data-testid="gp-start" />
          </Field>
          <Field id="gp-end" label="Ends" hint="Empty = until you turn it off.">
            <input id="gp-end" type="datetime-local" className="field" value={f.ends_at} onChange={(e) => set("ends_at", e.target.value)} data-testid="gp-end" />
          </Field>
        </div>
        <button type="button" className="list-row" role="switch" aria-checked={f.pinned} onClick={() => set("pinned", !f.pinned)} style={{ padding: "12px 2px" }} data-testid="gp-pinned">
          <span style={{ flex: 1 }}>
            Pin to the top of Home
            <span className="faint" style={{ display: "block", fontSize: 12.5 }}>
              Stays first until it ends. Members can hide it for themselves.
            </span>
          </span>
          <span className="switch" aria-hidden="true">
            <i />
          </span>
        </button>
        <button type="button" className="list-row" role="switch" aria-checked={f.active} onClick={() => set("active", !f.active)} style={{ padding: "12px 2px" }} data-testid="gp-active">
          <span style={{ flex: 1 }}>Show on the feed</span>
          <span className="switch" aria-hidden="true">
            <i />
          </span>
        </button>
        <div>
          <div className="list-title">Preview</div>
          <div className="home-page rr-gp-preview" data-testid="gp-preview" ref={(el) => el?.setAttribute("inert", "")}>
            {offer ? <OfferCard post={preview} /> : <NoticeCard post={preview} now={Date.now()} />}
          </div>
        </div>
      </div>
      {err && (
        <p className="field-error" role="alert">
          {err}
        </p>
      )}
      <button type="button" className="btn btn-yellow" style={{ marginTop: 14 }} disabled={busy} onClick={save} data-testid="save-gym-post">
        {busy ? "Saving…" : value.id ? "Save" : offer ? "Post offer" : "Post notice"}
      </button>
      {onDelete && (
        <button
          type="button"
          className={`btn ${confirmDel ? "btn-danger" : "btn-ghost"}`}
          style={{ marginTop: 8, ...(confirmDel ? {} : { color: "var(--danger)" }) }}
          disabled={busy}
          onClick={async () => {
            if (!confirmDel) return setConfirmDel(true);
            setBusy(true);
            try {
              await onDelete();
            } catch (e) {
              setErr(errMsg(e));
              setConfirmDel(false);
            } finally {
              setBusy(false);
            }
          }}
          data-testid="delete-gym-post"
        >
          {confirmDel ? "Tap again to delete for good" : "Delete"}
        </button>
      )}
    </Sheet>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}
