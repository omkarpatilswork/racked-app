"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import ConfirmSheet from "@/components/ConfirmSheet";
import Sheet from "@/components/Sheet";
import { LoadError, SkeletonList, needsMigration } from "@/components/admin/shared";
import { adminMemberSearch, friendlyDbError, type StaffMember } from "@/lib/data";
import { MACHINES, MACHINE_MAP } from "@/lib/machines";
import { toast } from "@/lib/toast";
import {
  adminAddRewardCodes,
  adminAwardChallenge,
  adminAwardSeason,
  adminBonusXp,
  adminDeleteProduct,
  adminRewardsData,
  adminSaveChallenge,
  adminSavePrizes,
  adminSaveProduct,
  adminSaveReward,
  adminSaveSponsor,
  adminSetSeasonPeriod,
  adminUpdateRedemption,
  fmtXp,
  metricLabel,
  metricValue,
  prizeRankLabel,
  timeLeft,
  type AdminChallenge,
  type AdminRewardsData,
  type AdminReward,
  type AdminSponsor,
  type Client,
  type PrizeRow,
} from "@/lib/rewards";

const SECTIONS = [
  { key: "race", label: "Prize race" },
  { key: "handout", label: "Hand out" },
  { key: "shop", label: "XP shop" },
  { key: "challenges", label: "Challenges" },
  { key: "partners", label: "Partners" },
] as const;
type Section = (typeof SECTIONS)[number]["key"];

function errMsg(err: unknown, fallback = "That didn't go through — try again") {
  const friendly = friendlyDbError(err);
  if (friendly) return friendly;
  const m = (err as { message?: string })?.message;
  return m && m.length < 90 && !/^[A-Z0-9]{5}$/.test(m) ? m : fallback;
}

const shortDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";

// <input type="datetime-local"> wants local "YYYY-MM-DDTHH:mm"
function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : "");

export default function RewardsTab({ supabase }: { supabase: Client }) {
  const [data, setData] = useState<AdminRewardsData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [section, setSection] = useState<Section>("race");

  const load = useCallback(() => {
    adminRewardsData(supabase)
      .then((d) => {
        setData(d);
        setState("ready");
      })
      .catch((err) => setState(needsMigration(err) ? "missing" : "error"));
  }, [supabase]);
  useEffect(load, [load]);

  const sponsors = useMemo(() => Object.fromEntries((data?.sponsors || []).map((s) => [s.id, s])), [data]);
  const toHandOut = (data?.redemptions || []).filter((r) => r.status === "issued").length;

  if (state === "missing") {
    return (
      <div className="card" data-testid="needs-0011">
        <div className="row" style={{ justifyContent: "flex-start", gap: 12 }}>
          <span className="tapin-icons" aria-hidden="true">
            <Icon name="gift" />
          </span>
          <div>
            <b>Turn on Rewards</b>
            <div className="faint" style={{ fontSize: 13, marginTop: 2 }}>
              Run database update <span className="num">0011_rewards.sql</span> in Supabase → SQL Editor, then refresh.
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (state === "error") return <LoadError onRetry={load} />;

  return (
    <div className="stack-lg" data-testid="tab-rewards">
      <div className="scroll-row" aria-label="Rewards sections">
        {SECTIONS.map((s) => (
          <button key={s.key} type="button" className="chip" aria-pressed={section === s.key} onClick={() => setSection(s.key)} data-testid={`rw-sec-${s.key}`}>
            {s.label}
            {s.key === "handout" && toHandOut > 0 && <span className="count">{toHandOut}</span>}
            {s.key === "race" && (data?.to_award.length || 0) > 0 && <span className="count">{data!.to_award.length}</span>}
          </button>
        ))}
      </div>
      {!data ? (
        <SkeletonList rows={4} height={96} />
      ) : section === "race" ? (
        <RaceSection supabase={supabase} data={data} sponsors={sponsors} reload={load} />
      ) : section === "handout" ? (
        <HandOutSection supabase={supabase} data={data} sponsors={sponsors} reload={load} />
      ) : section === "shop" ? (
        <ShopAdmin supabase={supabase} data={data} reload={load} />
      ) : section === "challenges" ? (
        <ChallengesAdmin supabase={supabase} data={data} reload={load} />
      ) : (
        <PartnersAdmin supabase={supabase} data={data} reload={load} />
      )}
    </div>
  );
}

type SectionProps = { supabase: Client; data: AdminRewardsData; reload: () => void };

// ---- prize race ------------------------------------------------------------
function RaceSection({ supabase, data, sponsors, reload }: SectionProps & { sponsors: Record<string, AdminSponsor> }) {
  const [awarding, setAwarding] = useState<AdminRewardsData["to_award"][number] | null>(null);
  const [busy, setBusy] = useState(false);
  const [editPrizes, setEditPrizes] = useState(false);
  const s = data.season;

  async function setPeriod(p: "week" | "month") {
    if (p === data.period) return;
    try {
      await adminSetSeasonPeriod(supabase, p);
      toast(p === "week" ? "Seasons are weekly from the next season" : "Seasons are monthly from the next season");
      reload();
    } catch (err) {
      toast(errMsg(err));
    }
  }

  return (
    <>
      <section className="card" data-testid="rw-admin-season">
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div>
            <div className="eyebrow">Running now</div>
            <div style={{ fontWeight: 800, fontSize: 17, marginTop: 2 }}>{s.title}</div>
            <div className="faint" style={{ fontSize: 13, marginTop: 2 }}>
              Ends {shortDate(s.ends_at)} · in {timeLeft(s.ends_at)}
            </div>
          </div>
          <span className="pill rw-pill">{s.period === "month" ? "Monthly" : "Weekly"}</span>
        </div>
        <div className="list-title" style={{ marginTop: 14 }}>
          Live top 10
        </div>
        {data.live_board.length === 0 ? (
          <p className="faint" style={{ fontSize: 13, margin: 0 }}>
            Nobody has earned XP this season yet.
          </p>
        ) : (
          <ol className="rw-board" style={{ marginTop: 4 }}>
            {data.live_board.map((r) => (
              <li key={r.rank}>
                <span className="r num">{r.rank}</span>
                <span className="n">
                  {r.name}
                  {r.flagged > 0 && <span className="flag-pill" style={{ marginLeft: 8 }}>{r.flagged} to review</span>}
                </span>
                <span className="s num">{fmtXp(r.score)} XP</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {data.to_award.map((t) => {
        const flagged = t.board.filter((b) => b.flagged > 0 && b.prize);
        return (
          <section key={t.id} className="card rw-award-card" data-testid="rw-to-award">
            <div className="eyebrow accent">Ended · ready to award</div>
            <div style={{ fontWeight: 800, fontSize: 17, marginTop: 2 }}>{t.title}</div>
            {flagged.length > 0 && (
              <p className="flag-pill" style={{ marginTop: 10, whiteSpace: "normal" }}>
                {flagged.map((f) => f.name).join(", ")} still {flagged.length === 1 ? "has" : "have"} sets waiting in Review. Approve or remove them first so the board is right.
              </p>
            )}
            <ol className="rw-board" style={{ marginTop: 8 }}>
              {t.board.map((b) => (
                <li key={b.rank}>
                  <span className="r num">{b.rank}</span>
                  <span className="n">
                    {b.name}
                    <span className="faint" style={{ display: "block", fontSize: 12, fontWeight: 600 }}>
                      {b.prize || "No prize"}
                    </span>
                  </span>
                  <span className="s num">{fmtXp(b.score)} XP</span>
                </li>
              ))}
            </ol>
            <button type="button" className="btn btn-yellow" style={{ marginTop: 12 }} onClick={() => setAwarding(t)} disabled={t.board.length === 0} data-testid="award-season">
              <Icon name="trophy" /> Award prizes
            </button>
          </section>
        );
      })}

      <section className="card">
        <div className="row">
          <div style={{ fontWeight: 800 }}>Season length</div>
        </div>
        <div className="tabs" role="tablist" aria-label="Season length" style={{ marginTop: 10 }}>
          <button role="tab" aria-selected={data.period === "week"} className={`tab${data.period === "week" ? " active" : ""}`} onClick={() => setPeriod("week")}>
            Weekly
          </button>
          <button role="tab" aria-selected={data.period === "month"} className={`tab${data.period === "month" ? " active" : ""}`} onClick={() => setPeriod("month")} data-testid="period-month">
            Monthly
          </button>
        </div>
        <p className="field-hint">Weekly builds hype at launch; switch to monthly later. A change starts with the next season, so the one running now isn&rsquo;t cut short.</p>
      </section>

      <section className="card" data-testid="rw-admin-prizes">
        <div className="row">
          <div style={{ fontWeight: 800 }}>Prizes</div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditPrizes(true)} data-testid="edit-prizes">
            <Icon name="edit" /> Edit
          </button>
        </div>
        <ul className="rw-admin-list">
          {data.templates.map((p, i) => (
            <li key={i}>
              <span className="rw-prize-rank-l">{prizeRankLabel(p)}</span>
              <span>
                <b>{p.title}</b>
                <span className="faint" style={{ display: "block", fontSize: 12.5 }}>
                  {(p.sponsor_ids || []).map((id) => sponsors[id]?.name || id).join(" × ") || "No sponsor"}
                </span>
              </span>
            </li>
          ))}
          {data.templates.length === 0 && <li className="faint">No prizes set.</li>}
        </ul>
        <p className="field-hint">Every new season starts with these prizes. Winners get a claim code to show at the desk (or a code from a linked XP shop item).</p>
      </section>

      {data.seasons.some((x) => x.awarded_at) && (
        <section>
          <div className="list-title">Past winners</div>
          <div className="stack">
            {data.seasons
              .filter((x) => x.awarded_at)
              .map((x) => (
                <div key={x.id} className="card" style={{ padding: 14 }}>
                  <b>{x.title}</b>
                  <div className="faint" style={{ fontSize: 13, marginTop: 4 }}>
                    {x.winners.length ? x.winners.map((w) => `#${w.rank} ${w.name}`).join(" · ") : "No winners"}
                  </div>
                </div>
              ))}
          </div>
        </section>
      )}

      <ConfirmSheet
        open={!!awarding}
        title={`Award ${awarding?.title ?? ""}?`}
        body={
          <>
            Each winner gets their prize and a claim code in the app (and the top 3 get the Podium badge). This can&rsquo;t be undone, so check the
            Review queue first.
          </>
        }
        confirmLabel="Award prizes"
        busy={busy}
        onClose={() => setAwarding(null)}
        onConfirm={async () => {
          if (!awarding) return;
          setBusy(true);
          try {
            const won = await adminAwardSeason(supabase, awarding.id);
            toast(`${won.length} prize${won.length === 1 ? "" : "s"} awarded. Hand them out from “Hand out”.`);
            setAwarding(null);
            reload();
          } catch (err) {
            toast(errMsg(err));
          } finally {
            setBusy(false);
          }
        }}
      />
      {editPrizes && (
        <PrizeEditor
          initial={data.templates}
          sponsors={data.sponsors}
          rewards={data.rewards}
          onClose={() => setEditPrizes(false)}
          onSave={async (rows) => {
            await adminSavePrizes(supabase, rows, true);
            toast("Prizes saved for this season and the next ones");
            setEditPrizes(false);
            reload();
          }}
        />
      )}
    </>
  );
}

function PrizeEditor({
  initial,
  sponsors,
  rewards,
  onSave,
  onClose,
}: {
  initial: PrizeRow[];
  sponsors: AdminSponsor[];
  rewards: AdminReward[];
  onSave: (rows: PrizeRow[]) => Promise<void>;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<PrizeRow[]>(() =>
    initial.length ? initial.map((p) => ({ ...p, sponsor_ids: [...(p.sponsor_ids || [])] })) : [{ rank_from: 1, rank_to: 1, title: "", description: null, sponsor_ids: [] }]
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (i: number, patch: Partial<PrizeRow>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function save() {
    for (const r of rows) {
      if (!r.title.trim()) return setErr("Every prize needs a name");
      if (!(r.rank_from >= 1) || !(r.rank_to >= r.rank_from) || r.rank_to > 50) return setErr("Check the places: from 1 up to 50, “to” not below “from”");
    }
    setBusy(true);
    setErr(null);
    try {
      await onSave(rows);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={busy ? () => undefined : onClose} title="Season prizes" testId="prize-editor">
      <div className="stack">
        {rows.map((r, i) => (
          <div key={i} className="card rw-prize-edit" style={{ padding: 14 }}>
            <div className="rw-form-row">
              <div>
                <label className="field-label" htmlFor={`pf-${i}`}>
                  From place
                </label>
                <input id={`pf-${i}`} className="field" inputMode="numeric" value={r.rank_from} onChange={(e) => set(i, { rank_from: Number(e.target.value) || 0 })} />
              </div>
              <div>
                <label className="field-label" htmlFor={`pt-${i}`}>
                  To place
                </label>
                <input id={`pt-${i}`} className="field" inputMode="numeric" value={r.rank_to} onChange={(e) => set(i, { rank_to: Number(e.target.value) || 0 })} />
              </div>
            </div>
            <label className="field-label" htmlFor={`pn-${i}`} style={{ marginTop: 10 }}>
              Prize
            </label>
            <input id={`pn-${i}`} className="field" value={r.title} maxLength={90} placeholder="e.g. Gift hamper" onChange={(e) => set(i, { title: e.target.value })} />
            <div className="field-label" style={{ marginTop: 10 }}>
              From
            </div>
            <div className="chip-row">
              {sponsors.map((sp) => {
                const on = r.sponsor_ids.includes(sp.id);
                return (
                  <button
                    key={sp.id}
                    type="button"
                    className="chip"
                    aria-pressed={on}
                    onClick={() => set(i, { sponsor_ids: on ? r.sponsor_ids.filter((x) => x !== sp.id) : [...r.sponsor_ids, sp.id] })}
                  >
                    {sp.name}
                  </button>
                );
              })}
            </div>
            <label className="field-label" htmlFor={`pr-${i}`} style={{ marginTop: 10 }}>
              Codes from (optional)
            </label>
            <select id={`pr-${i}`} className="field" value={r.reward_id ?? ""} onChange={(e) => set(i, { reward_id: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Claim code shown at the desk</option>
              {rewards
                .filter((x) => x.code_mode !== "desk")
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.title} ({x.code_mode === "pool" ? `${x.codes_left} codes left` : "shared code"})
                  </option>
                ))}
            </select>
            {rows.length > 1 && (
              <button type="button" className="text-btn" style={{ color: "var(--danger)", paddingBottom: 0 }} onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>
                Remove this prize
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            const last = rows[rows.length - 1];
            const from = last ? last.rank_to + 1 : 1;
            setRows((x) => [...x, { rank_from: from, rank_to: from, title: "", description: null, sponsor_ids: [] }]);
          }}
        >
          + Add a prize
        </button>
      </div>
      {err && (
        <p className="field-error" role="alert">
          {err}
        </p>
      )}
      <button type="button" className="btn btn-yellow" style={{ marginTop: 14 }} disabled={busy} onClick={save} data-testid="save-prizes">
        {busy ? "Saving…" : "Save prizes"}
      </button>
      <p className="field-hint center">Also updates the season running now (unless it&rsquo;s already been awarded).</p>
    </Sheet>
  );
}

// ---- hand out ------------------------------------------------------------------
function HandOutSection({ supabase, data, sponsors, reload }: SectionProps & { sponsors: Record<string, AdminSponsor> }) {
  const [q, setQ] = useState("");
  const [cancelling, setCancelling] = useState<AdminRewardsData["redemptions"][number] | null>(null);
  const [busy, setBusy] = useState(false);
  const term = q.trim().toLowerCase();
  const list = data.redemptions.filter(
    (r) => !term || (r.code || "").toLowerCase().includes(term) || r.member.toLowerCase().includes(term) || r.title.toLowerCase().includes(term)
  );
  const issued = list.filter((r) => r.status === "issued");
  const done = list.filter((r) => r.status !== "issued").slice(0, 20);

  async function handOver(id: number) {
    try {
      await adminUpdateRedemption(supabase, id, "fulfilled");
      toast("Marked as handed over");
      reload();
    } catch (err) {
      toast(errMsg(err));
    }
  }

  const row = (r: AdminRewardsData["redemptions"][number]) => (
    <li key={r.id} className={`rw-mine-row ${r.status}`} data-testid="handout-row">
      <span className={`rw-m-ic${r.source !== "shop" ? " prize" : ""}`} aria-hidden="true">
        <Icon name={r.source === "shop" ? "ticket" : "trophy"} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <b>{r.member}</b>
        <span className="rw-mine-sub">
          {r.title}
          {r.sponsor_id && sponsors[r.sponsor_id] ? ` · ${sponsors[r.sponsor_id].name}` : ""}
        </span>
        <span className="rw-mine-sub">
          {r.source === "shop" ? `XP shop · ${fmtXp(r.xp_spent)} XP` : r.source === "prize" ? `Prize · #${r.rank}` : `Challenge · #${r.rank}`} · {shortDate(r.created_at)}
        </span>
        {r.code && <span className="rw-code-static num">{r.code}</span>}
        {r.status === "issued" && (
          <span className="rw-ch-actions" style={{ marginTop: 10 }}>
            <button type="button" className="btn btn-yellow btn-sm" onClick={() => handOver(r.id)} data-testid="hand-over">
              <Icon name="check" /> Handed over
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCancelling(r)}>
              Cancel
            </button>
          </span>
        )}
      </span>
      {r.status !== "issued" && <span className={`rw-status ${r.status}`}>{r.status === "fulfilled" ? "Handed over" : "Cancelled"}</span>}
    </li>
  );

  return (
    <>
      <section>
        <label className="field-label" htmlFor="rw-code-search">
          Find by claim code or name
        </label>
        <input id="rw-code-search" className="field" placeholder="e.g. RK-7F3A2C" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      </section>
      <section>
        <div className="list-title">To hand out · {issued.length}</div>
        {issued.length === 0 ? (
          <div className="card empty" style={{ padding: 18 }}>
            {term ? "No matching rewards waiting." : "Nothing waiting. Prizes and XP-shop claims show up here."}
          </div>
        ) : (
          <ul className="card rw-mine-list">{issued.map(row)}</ul>
        )}
      </section>
      {done.length > 0 && (
        <section>
          <div className="list-title">Done</div>
          <ul className="card rw-mine-list">{done.map(row)}</ul>
        </section>
      )}
      <BonusXpCard supabase={supabase} onDone={reload} />
      <ConfirmSheet
        open={!!cancelling}
        title="Cancel this reward?"
        body={
          cancelling?.source === "shop"
            ? `${cancelling.member} gets their ${fmtXp(cancelling.xp_spent)} XP back.`
            : `${cancelling?.member ?? "The member"} will see it as cancelled.`
        }
        confirmLabel="Cancel reward"
        danger
        busy={busy}
        onClose={() => setCancelling(null)}
        onConfirm={async () => {
          if (!cancelling) return;
          setBusy(true);
          try {
            await adminUpdateRedemption(supabase, cancelling.id, "cancelled");
            toast(cancelling.source === "shop" ? "Cancelled · XP refunded" : "Cancelled");
            setCancelling(null);
            reload();
          } catch (err) {
            toast(errMsg(err));
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}

function BonusXpCard({ supabase, onDone }: { supabase: Client; onDone: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<StaffMember[]>([]);
  const [who, setWho] = useState<StaffMember | null>(null);
  const [amount, setAmount] = useState("50");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (who || q.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      adminMemberSearch(supabase, q.trim()).then((r) => setResults(r.slice(0, 5)), () => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, who, supabase]);

  async function give() {
    const n = Math.round(Number(amount));
    if (!who || !n) return;
    setBusy(true);
    try {
      await adminBonusXp(supabase, who.id, n, reason.trim() || "Bonus XP");
      toast(`${n > 0 ? "+" : ""}${n} XP for ${who.display_name}`);
      setWho(null);
      setQ("");
      setReason("");
      onDone();
    } catch (err) {
      toast(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div style={{ fontWeight: 800 }}>Give bonus XP</div>
      <p className="field-hint" style={{ marginTop: 2 }}>
        For events, a challenge you ran offline, or to fix a mistake (use a minus number to take XP back).
      </p>
      {who ? (
        <div className="row" style={{ marginTop: 10 }}>
          <b>{who.display_name}</b>
          <button type="button" className="text-btn" onClick={() => setWho(null)}>
            Change
          </button>
        </div>
      ) : (
        <>
          <input className="field" style={{ marginTop: 10 }} placeholder="Search a member" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search a member" />
          {results.length > 0 && (
            <div className="chip-row" style={{ marginTop: 8 }}>
              {results.map((m) => (
                <button key={m.id} type="button" className="chip" onClick={() => setWho(m)}>
                  {m.display_name}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      <div className="rw-form-row" style={{ marginTop: 10 }}>
        <div>
          <label className="field-label" htmlFor="bx-amt">
            XP
          </label>
          <input id="bx-amt" className="field" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div style={{ flex: 2 }}>
          <label className="field-label" htmlFor="bx-why">
            Reason
          </label>
          <input id="bx-why" className="field" maxLength={80} value={reason} placeholder="e.g. Run club meetup" onChange={(e) => setReason(e.target.value)} />
        </div>
      </div>
      <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 12 }} disabled={!who || busy || !Number(amount)} onClick={give}>
        Give XP
      </button>
    </section>
  );
}

// ---- XP shop ---------------------------------------------------------------------
function ShopAdmin({ supabase, data, reload }: SectionProps) {
  const [editing, setEditing] = useState<Partial<AdminReward> | null>(null);
  const [codesFor, setCodesFor] = useState<AdminReward | null>(null);
  const names = Object.fromEntries(data.sponsors.map((s) => [s.id, s.name]));
  return (
    <>
      <div className="row">
        <p className="faint" style={{ margin: 0, fontSize: 13, flex: 1 }}>
          What members can buy with XP. Items stay hidden until switched on.
        </p>
        <button type="button" className="btn btn-yellow btn-sm" onClick={() => setEditing({ code_mode: "desk", per_member_limit: 1, active: false })} data-testid="new-reward">
          + New
        </button>
      </div>
      <div className="stack">
        {data.rewards.map((r) => (
          <article key={r.id} className="card" style={{ padding: 16 }} data-testid="admin-reward">
            <div className="row" style={{ alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <div className="eyebrow">{r.sponsor_id ? names[r.sponsor_id] || r.sponsor_id : "Racked"}</div>
                <div style={{ fontWeight: 800, fontSize: 15.5, marginTop: 2 }}>{r.title}</div>
              </div>
              <span className={`pill ${r.active ? "pill-yellow" : "rw-pill"}`}>{r.active ? "Live" : "Off"}</span>
            </div>
            <div className="chip-row" style={{ marginTop: 10 }}>
              <span className="pill rw-pill num">{r.xp_cost ? `${fmtXp(r.xp_cost)} XP` : "Prize only"}</span>
              <span className="pill rw-pill">{r.stock === null ? "No stock limit" : `${Math.max(0, r.stock - r.issued)} of ${r.stock} left`}</span>
              <span className="pill rw-pill">{r.issued} claimed</span>
              <span className="pill rw-pill">
                {r.code_mode === "desk" ? "Desk claim code" : r.code_mode === "shared" ? `Code: ${r.shared_code || "not set"}` : `${r.codes_left} codes left`}
              </span>
            </div>
            <div className="rw-ch-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(r)}>
                <Icon name="edit" /> Edit
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCodesFor(r)}>
                <Icon name="ticket" /> Codes
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={async () => {
                  try {
                    await adminSaveReward(supabase, { id: r.id, title: r.title, active: !r.active });
                    toast(r.active ? "Switched off" : "Live in the XP shop");
                    reload();
                  } catch (err) {
                    toast(errMsg(err));
                  }
                }}
                data-testid="toggle-reward"
              >
                {r.active ? "Switch off" : "Switch on"}
              </button>
            </div>
          </article>
        ))}
      </div>
      {editing && (
        <RewardForm
          value={editing}
          sponsors={data.sponsors}
          onClose={() => setEditing(null)}
          onSave={async (p) => {
            await adminSaveReward(supabase, p);
            toast("Saved");
            setEditing(null);
            reload();
          }}
        />
      )}
      {codesFor && (
        <CodesSheet
          reward={codesFor}
          onClose={() => setCodesFor(null)}
          onSave={async (codes, shared) => {
            const n = await adminAddRewardCodes(supabase, codesFor.id, codes, shared);
            toast(shared ? "Code saved" : `${n} code${n === 1 ? "" : "s"} added`);
            setCodesFor(null);
            reload();
          }}
        />
      )}
    </>
  );
}

function RewardForm({
  value,
  sponsors,
  onSave,
  onClose,
}: {
  value: Partial<AdminReward>;
  sponsors: AdminSponsor[];
  onSave: (p: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}) {
  const [f, setF] = useState({
    title: value.title || "",
    sponsor_id: value.sponsor_id || "",
    description: value.description || "",
    how_to_use: value.how_to_use || "",
    image_url: value.image_url || "",
    xp_cost: value.xp_cost == null ? "" : String(value.xp_cost),
    stock: value.stock == null ? "" : String(value.stock),
    per_member_limit: String(value.per_member_limit ?? 1),
    code_mode: value.code_mode || "desk",
    valid_until: toLocalInput(value.valid_until),
    active: !!value.active,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    if (f.title.trim().length < 2) return setErr("Give it a name");
    if (f.xp_cost && !(Number(f.xp_cost) >= 1)) return setErr("XP price must be a number");
    setBusy(true);
    setErr(null);
    try {
      await onSave({ ...f, id: value.id ?? "", valid_until: fromLocalInput(f.valid_until) });
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={busy ? () => undefined : onClose} title={value.id ? "Edit reward" : "New reward"} testId="reward-form">
      <div className="stack">
        <Field id="rf-title" label="Name">
          <input id="rf-title" className="field" maxLength={80} value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. ₹150 off at Jersey Drip" />
        </Field>
        <Field id="rf-sp" label="Brand">
          <select id="rf-sp" className="field" value={f.sponsor_id} onChange={(e) => set("sponsor_id", e.target.value)}>
            <option value="">Racked / the gym</option>
            {sponsors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="rf-desc" label="Description">
          <textarea id="rf-desc" className="field" maxLength={300} value={f.description} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <div className="rw-form-row">
          <Field id="rf-xp" label="XP price" hint="Empty = prize only">
            <input id="rf-xp" className="field" inputMode="numeric" value={f.xp_cost} onChange={(e) => set("xp_cost", e.target.value)} />
          </Field>
          <Field id="rf-stock" label="Stock" hint="Empty = no limit">
            <input id="rf-stock" className="field" inputMode="numeric" value={f.stock} onChange={(e) => set("stock", e.target.value)} />
          </Field>
          <Field id="rf-lim" label="Per member">
            <input id="rf-lim" className="field" inputMode="numeric" value={f.per_member_limit} onChange={(e) => set("per_member_limit", e.target.value)} />
          </Field>
        </div>
        <Field id="rf-mode" label="How members get it">
          <select id="rf-mode" className="field" value={f.code_mode} onChange={(e) => set("code_mode", e.target.value)}>
            <option value="desk">Claim code, collected at the front desk</option>
            <option value="shared">One discount code for everyone</option>
            <option value="pool">A unique code each (paste a list)</option>
          </select>
        </Field>
        <Field id="rf-how" label="How to use it (shown with the code)">
          <input id="rf-how" className="field" maxLength={200} value={f.how_to_use} onChange={(e) => set("how_to_use", e.target.value)} placeholder="e.g. Use at checkout on jerseydrip.shop" />
        </Field>
        <Field id="rf-img" label="Picture link (optional)">
          <input id="rf-img" className="field" inputMode="url" value={f.image_url} onChange={(e) => set("image_url", e.target.value)} placeholder="https://…" />
        </Field>
        <Field id="rf-until" label="Available until (optional)">
          <input id="rf-until" type="datetime-local" className="field" value={f.valid_until} onChange={(e) => set("valid_until", e.target.value)} />
        </Field>
        <button type="button" className="list-row" role="switch" aria-checked={f.active} onClick={() => set("active", !f.active)} style={{ padding: "12px 2px" }}>
          <span style={{ flex: 1 }}>Live in the XP shop</span>
          <span className="switch" aria-hidden="true">
            <i />
          </span>
        </button>
      </div>
      {err && (
        <p className="field-error" role="alert">
          {err}
        </p>
      )}
      <button type="button" className="btn btn-yellow" style={{ marginTop: 14 }} disabled={busy} onClick={save} data-testid="save-reward">
        {busy ? "Saving…" : "Save"}
      </button>
    </Sheet>
  );
}

function CodesSheet({ reward, onSave, onClose }: { reward: AdminReward; onSave: (codes: string, shared: boolean) => Promise<void>; onClose: () => void }) {
  const [shared, setShared] = useState(reward.code_mode === "shared");
  const [codes, setCodes] = useState(reward.code_mode === "shared" ? reward.shared_code || "" : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Sheet open onClose={busy ? () => undefined : onClose} title={`Codes: ${reward.title}`} testId="codes-sheet">
      <div className="tabs" role="tablist" aria-label="Code type">
        <button role="tab" aria-selected={shared} className={`tab${shared ? " active" : ""}`} onClick={() => setShared(true)}>
          One code for all
        </button>
        <button role="tab" aria-selected={!shared} className={`tab${!shared ? " active" : ""}`} onClick={() => setShared(false)}>
          Unique codes
        </button>
      </div>
      <p className="field-hint">
        {shared
          ? "Everyone who redeems sees this same code, e.g. RACKED10."
          : `Paste the brand's codes, one per line. Each member gets the next unused one. ${reward.codes_left} left now.`}
      </p>
      {shared ? (
        <input className="field" style={{ marginTop: 10 }} value={codes} onChange={(e) => setCodes(e.target.value)} placeholder="RACKED10" aria-label="Code" />
      ) : (
        <textarea className="field" style={{ marginTop: 10, minHeight: 140 }} value={codes} onChange={(e) => setCodes(e.target.value)} placeholder={"JD-XXXX-1\nJD-XXXX-2"} aria-label="Codes" />
      )}
      {err && (
        <p className="field-error" role="alert">
          {err}
        </p>
      )}
      <button
        type="button"
        className="btn btn-yellow"
        style={{ marginTop: 14 }}
        disabled={busy || !codes.trim()}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            await onSave(codes, shared);
          } catch (e) {
            setErr(errMsg(e));
          } finally {
            setBusy(false);
          }
        }}
        data-testid="save-codes"
      >
        {busy ? "Saving…" : shared ? "Save code" : "Add codes"}
      </button>
    </Sheet>
  );
}

// ---- challenges --------------------------------------------------------------------
function ChallengesAdmin({ supabase, data, reload }: SectionProps) {
  const [editing, setEditing] = useState<Partial<AdminChallenge> | null>(null);
  const [awarding, setAwarding] = useState<AdminChallenge | null>(null);
  const [busy, setBusy] = useState(false);
  const names = Object.fromEntries(data.sponsors.map((s) => [s.id, s.name]));
  const now = Date.now();
  return (
    <>
      <div className="row">
        <p className="faint" style={{ margin: 0, fontSize: 13, flex: 1 }}>
          Short brand-backed contests on one machine. Members get join XP when they log a set that counts.
        </p>
        <button
          type="button"
          className="btn btn-yellow btn-sm"
          onClick={() => setEditing({ metric: "best_lift", winners: 1, join_xp: 20, active: false })}
          data-testid="new-challenge"
        >
          + New
        </button>
      </div>
      <div className="stack">
        {data.challenges.map((c) => {
          const ended = new Date(c.ends_at).getTime() <= now;
          const status = c.awarded_at ? "Awarded" : ended ? "Ended" : !c.active ? "Off" : new Date(c.starts_at).getTime() > now ? "Upcoming" : "Live";
          return (
            <article key={c.id} className="card" style={{ padding: 16 }} data-testid="admin-challenge">
              <div className="row" style={{ alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <div className="eyebrow">{c.sponsor_id ? names[c.sponsor_id] || c.sponsor_id : "Racked"}</div>
                  <div style={{ fontWeight: 800, fontSize: 15.5, marginTop: 2 }}>{c.title}</div>
                  <div className="faint" style={{ fontSize: 12.5, marginTop: 2 }}>
                    {metricLabel(c.metric)}
                    {c.machine_id && MACHINE_MAP[c.machine_id] ? ` · ${MACHINE_MAP[c.machine_id].name}` : ""} · {shortDate(c.starts_at)} → {shortDate(c.ends_at)}
                  </div>
                </div>
                <span className={`pill ${status === "Live" ? "pill-yellow" : "rw-pill"}`}>{status}</span>
              </div>
              {c.top.length > 0 && (
                <ol className="rw-board" style={{ marginTop: 8 }}>
                  {c.top.map((t) => (
                    <li key={t.rank}>
                      <span className="r num">{t.rank}</span>
                      <span className="n">{t.name}</span>
                      <span className="s num">{metricValue(c.metric, t.value, t.reps)}</span>
                    </li>
                  ))}
                </ol>
              )}
              <div className="rw-ch-actions">
                {!c.awarded_at && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(c)}>
                    <Icon name="edit" /> Edit
                  </button>
                )}
                {ended && !c.awarded_at && c.players > 0 && (
                  <button type="button" className="btn btn-yellow btn-sm" onClick={() => setAwarding(c)} data-testid="award-challenge">
                    <Icon name="trophy" /> Award winner{c.winners > 1 ? "s" : ""}
                  </button>
                )}
              </div>
            </article>
          );
        })}
        {data.challenges.length === 0 && <div className="card empty">No challenges yet.</div>}
      </div>
      {editing && (
        <ChallengeForm
          value={editing}
          sponsors={data.sponsors}
          rewards={data.rewards}
          onClose={() => setEditing(null)}
          onSave={async (p) => {
            await adminSaveChallenge(supabase, p);
            toast("Challenge saved");
            setEditing(null);
            reload();
          }}
        />
      )}
      <ConfirmSheet
        open={!!awarding}
        title={`Award ${awarding?.title ?? ""}?`}
        body={`The top ${awarding?.winners ?? 1} get${awarding?.winners === 1 ? "s" : ""} “${awarding?.prize || awarding?.title || ""}” with a claim code. Check the Review queue first.`}
        confirmLabel="Award"
        busy={busy}
        onClose={() => setAwarding(null)}
        onConfirm={async () => {
          if (!awarding) return;
          setBusy(true);
          try {
            const w = await adminAwardChallenge(supabase, awarding.id);
            toast(`${w.length} winner${w.length === 1 ? "" : "s"} awarded`);
            setAwarding(null);
            reload();
          } catch (err) {
            toast(errMsg(err));
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}

function ChallengeForm({
  value,
  sponsors,
  rewards,
  onSave,
  onClose,
}: {
  value: Partial<AdminChallenge>;
  sponsors: AdminSponsor[];
  rewards: AdminReward[];
  onSave: (p: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}) {
  const weekFromNow = new Date(Date.now() + 7 * 86400000).toISOString();
  const [f, setF] = useState({
    title: value.title || "",
    sponsor_id: value.sponsor_id || "",
    description: value.description || "",
    metric: value.metric || "best_lift",
    machine_id: value.machine_id || "",
    starts_at: toLocalInput(value.starts_at || new Date().toISOString()),
    ends_at: toLocalInput(value.ends_at || weekFromNow),
    prize: value.prize || "",
    reward_id: value.reward_id == null ? "" : String(value.reward_id),
    winners: String(value.winners ?? 1),
    join_xp: String(value.join_xp ?? 20),
    active: !!value.active,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const m = f.machine_id ? MACHINE_MAP[f.machine_id] : null;

  async function save() {
    if (f.title.trim().length < 2) return setErr("Give it a name");
    if (!f.starts_at || !f.ends_at || new Date(f.ends_at) <= new Date(f.starts_at)) return setErr("The end has to be after the start");
    setBusy(true);
    setErr(null);
    try {
      await onSave({
        ...f,
        id: value.id ?? "",
        mode: m?.dual ? value.mode || "" : "",
        starts_at: fromLocalInput(f.starts_at),
        ends_at: fromLocalInput(f.ends_at),
      });
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={busy ? () => undefined : onClose} title={value.id ? "Edit challenge" : "New challenge"} testId="challenge-form">
      <div className="stack">
        <Field id="cf-title" label="Name">
          <input id="cf-title" className="field" maxLength={80} value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Clean Crate Leg Day" />
        </Field>
        <Field id="cf-sp" label="Brand">
          <select id="cf-sp" className="field" value={f.sponsor_id} onChange={(e) => set("sponsor_id", e.target.value)}>
            <option value="">Racked / the gym</option>
            {sponsors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="cf-desc" label="Description">
          <textarea id="cf-desc" className="field" maxLength={300} value={f.description} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <div className="rw-form-row">
          <Field id="cf-metric" label="Winner is">
            <select id="cf-metric" className="field" value={f.metric} onChange={(e) => set("metric", e.target.value)}>
              <option value="best_lift">Heaviest set</option>
              <option value="sets">Most sets</option>
              <option value="volume">Most volume</option>
            </select>
          </Field>
          <Field id="cf-machine" label="Machine">
            <select id="cf-machine" className="field" value={f.machine_id} onChange={(e) => set("machine_id", e.target.value)}>
              <option value="">Any machine</option>
              {MACHINES.map((mm) => (
                <option key={mm.id} value={mm.id}>
                  {mm.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="rw-form-row">
          <Field id="cf-start" label="Starts">
            <input id="cf-start" type="datetime-local" className="field" value={f.starts_at} onChange={(e) => set("starts_at", e.target.value)} />
          </Field>
          <Field id="cf-end" label="Ends">
            <input id="cf-end" type="datetime-local" className="field" value={f.ends_at} onChange={(e) => set("ends_at", e.target.value)} />
          </Field>
        </div>
        <Field id="cf-prize" label="Prize">
          <input id="cf-prize" className="field" maxLength={120} value={f.prize} onChange={(e) => set("prize", e.target.value)} placeholder="e.g. A box of protein oats" />
        </Field>
        <div className="rw-form-row">
          <Field id="cf-win" label="Winners">
            <input id="cf-win" className="field" inputMode="numeric" value={f.winners} onChange={(e) => set("winners", e.target.value)} />
          </Field>
          <Field id="cf-join" label="Join XP">
            <input id="cf-join" className="field" inputMode="numeric" value={f.join_xp} onChange={(e) => set("join_xp", e.target.value)} />
          </Field>
        </div>
        <Field id="cf-codes" label="Prize codes from (optional)">
          <select id="cf-codes" className="field" value={f.reward_id} onChange={(e) => set("reward_id", e.target.value)}>
            <option value="">Claim code shown at the desk</option>
            {rewards
              .filter((x) => x.code_mode !== "desk")
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.title}
                </option>
              ))}
          </select>
        </Field>
        <button type="button" className="list-row" role="switch" aria-checked={f.active} onClick={() => set("active", !f.active)} style={{ padding: "12px 2px" }}>
          <span style={{ flex: 1 }}>Show to members</span>
          <span className="switch" aria-hidden="true">
            <i />
          </span>
        </button>
      </div>
      {err && (
        <p className="field-error" role="alert">
          {err}
        </p>
      )}
      <button type="button" className="btn btn-yellow" style={{ marginTop: 14 }} disabled={busy} onClick={save} data-testid="save-challenge">
        {busy ? "Saving…" : "Save challenge"}
      </button>
    </Sheet>
  );
}

// ---- partners ----------------------------------------------------------------------
function PartnersAdmin({ supabase, data, reload }: SectionProps) {
  const [editing, setEditing] = useState<Partial<AdminSponsor> | null>(null);
  const [product, setProduct] = useState<{ sponsor: AdminSponsor; p: Partial<AdminSponsor["products"][number]> } | null>(null);
  return (
    <>
      <div className="row">
        <p className="faint" style={{ margin: 0, fontSize: 13, flex: 1 }}>
          Brands shown on the Rewards page. Clicks are counted so you can report back to them.
        </p>
        <button type="button" className="btn btn-yellow btn-sm" onClick={() => setEditing({ active: true })} data-testid="new-sponsor">
          + New
        </button>
      </div>
      <div className="stack">
        {data.sponsors.map((sp) => (
          <article key={sp.id} className="card" style={{ padding: 16 }} data-testid="admin-sponsor">
            <div className="row" style={{ alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{sp.name}</div>
                <div className="faint" style={{ fontSize: 12.5, marginTop: 2 }}>
                  {sp.tagline || sp.website_url || ""}
                </div>
              </div>
              <span className={`pill ${sp.active ? "pill-yellow" : "rw-pill"}`}>{sp.active ? "Shown" : "Hidden"}</span>
            </div>
            <div className="rw-stats" data-testid="sponsor-stats">
              <div>
                <b className="num">{sp.clicks_7d}</b>
                <span>clicks · 7 days</span>
              </div>
              <div>
                <b className="num">{sp.clicks_30d}</b>
                <span>clicks · 30 days</span>
              </div>
              <div>
                <b className="num">{sp.redeemed_30d}</b>
                <span>rewards · 30 days</span>
              </div>
            </div>
            <div className="list-title" style={{ marginTop: 12 }}>
              Products · {sp.products.length}
            </div>
            <ul className="rw-admin-list">
              {sp.products.map((p) => (
                <li key={p.id}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b>{p.title}</b>
                    <span className="faint" style={{ display: "block", fontSize: 12.5 }}>
                      {[p.subtitle, p.price_text].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <button type="button" className="text-btn" onClick={() => setProduct({ sponsor: sp, p })}>
                    Edit
                  </button>
                </li>
              ))}
            </ul>
            <div className="rw-ch-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(sp)}>
                <Icon name="edit" /> Edit brand
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setProduct({ sponsor: sp, p: { active: true } })}>
                + Product
              </button>
            </div>
          </article>
        ))}
      </div>
      {editing && (
        <SponsorForm
          value={editing}
          onClose={() => setEditing(null)}
          onSave={async (p) => {
            await adminSaveSponsor(supabase, p);
            toast("Brand saved");
            setEditing(null);
            reload();
          }}
        />
      )}
      {product && (
        <ProductForm
          sponsor={product.sponsor}
          value={product.p}
          onClose={() => setProduct(null)}
          onDelete={
            product.p.id
              ? async () => {
                  await adminDeleteProduct(supabase, product.p.id!);
                  toast("Product removed");
                  setProduct(null);
                  reload();
                }
              : undefined
          }
          onSave={async (p) => {
            await adminSaveProduct(supabase, p);
            toast("Product saved");
            setProduct(null);
            reload();
          }}
        />
      )}
    </>
  );
}

function SponsorForm({ value, onSave, onClose }: { value: Partial<AdminSponsor>; onSave: (p: Record<string, unknown>) => Promise<void>; onClose: () => void }) {
  const isNew = !value.id;
  const [f, setF] = useState({
    id: value.id || "",
    name: value.name || "",
    tagline: value.tagline || "",
    blurb: value.blurb || "",
    website_url: value.website_url || "",
    instagram_url: value.instagram_url || "",
    logo_url: value.logo_url || "",
    category: value.category || "",
    sort: String(value.sort ?? 0),
    active: value.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string | boolean) =>
    setF((x) => {
      const next = { ...x, [k]: v };
      if (k === "name" && isNew) next.id = String(v).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
      return next;
    });
  return (
    <Sheet open onClose={busy ? () => undefined : onClose} title={isNew ? "New brand" : `Edit ${value.name}`} testId="sponsor-form">
      <div className="stack">
        <Field id="sf-name" label="Name">
          <input id="sf-name" className="field" maxLength={60} value={f.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field id="sf-tag" label="One-line tagline">
          <input id="sf-tag" className="field" maxLength={90} value={f.tagline} onChange={(e) => set("tagline", e.target.value)} />
        </Field>
        <Field id="sf-blurb" label="About (a sentence or two)">
          <textarea id="sf-blurb" className="field" maxLength={400} value={f.blurb} onChange={(e) => set("blurb", e.target.value)} />
        </Field>
        <Field id="sf-web" label="Website">
          <input id="sf-web" className="field" inputMode="url" value={f.website_url} onChange={(e) => set("website_url", e.target.value)} placeholder="https://…" />
        </Field>
        <Field id="sf-ig" label="Instagram link (optional)">
          <input id="sf-ig" className="field" inputMode="url" value={f.instagram_url} onChange={(e) => set("instagram_url", e.target.value)} placeholder="https://instagram.com/…" />
        </Field>
        <Field id="sf-logo" label="Logo link (optional)">
          <input id="sf-logo" className="field" inputMode="url" value={f.logo_url} onChange={(e) => set("logo_url", e.target.value)} placeholder="https://…" />
        </Field>
        <div className="rw-form-row">
          <Field id="sf-cat" label="Category">
            <input id="sf-cat" className="field" maxLength={30} value={f.category} onChange={(e) => set("category", e.target.value)} placeholder="Nutrition" />
          </Field>
          <Field id="sf-sort" label="Order">
            <input id="sf-sort" className="field" inputMode="numeric" value={f.sort} onChange={(e) => set("sort", e.target.value)} />
          </Field>
        </div>
        <button type="button" className="list-row" role="switch" aria-checked={f.active} onClick={() => set("active", !f.active)} style={{ padding: "12px 2px" }}>
          <span style={{ flex: 1 }}>Show on the Rewards page</span>
          <span className="switch" aria-hidden="true">
            <i />
          </span>
        </button>
      </div>
      {err && (
        <p className="field-error" role="alert">
          {err}
        </p>
      )}
      <button
        type="button"
        className="btn btn-yellow"
        style={{ marginTop: 14 }}
        disabled={busy}
        onClick={async () => {
          if (!f.name.trim()) return setErr("Give the brand a name");
          setBusy(true);
          setErr(null);
          try {
            await onSave(f);
          } catch (e) {
            setErr(errMsg(e));
          } finally {
            setBusy(false);
          }
        }}
        data-testid="save-sponsor"
      >
        {busy ? "Saving…" : "Save brand"}
      </button>
    </Sheet>
  );
}

function ProductForm({
  sponsor,
  value,
  onSave,
  onDelete,
  onClose,
}: {
  sponsor: AdminSponsor;
  value: Partial<AdminSponsor["products"][number]>;
  onSave: (p: Record<string, unknown>) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}) {
  const [f, setF] = useState({
    title: value.title || "",
    subtitle: value.subtitle || "",
    price_text: value.price_text || "",
    image_url: value.image_url || "",
    url: value.url || "",
    sort: String(value.sort ?? sponsor.products.length + 1),
    active: value.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet open onClose={busy ? () => undefined : onClose} title={value.id ? "Edit product" : `New ${sponsor.name} product`} testId="product-form">
      <div className="stack">
        <Field id="pf-title" label="Name">
          <input id="pf-title" className="field" maxLength={80} value={f.title} onChange={(e) => set("title", e.target.value)} />
        </Field>
        <Field id="pf-sub" label="Short detail">
          <input id="pf-sub" className="field" maxLength={80} value={f.subtitle} onChange={(e) => set("subtitle", e.target.value)} placeholder="e.g. 15 g protein · box of 4" />
        </Field>
        <div className="rw-form-row">
          <Field id="pf-price" label="Price">
            <input id="pf-price" className="field" maxLength={20} value={f.price_text} onChange={(e) => set("price_text", e.target.value)} placeholder="₹379" />
          </Field>
          <Field id="pf-sort" label="Order">
            <input id="pf-sort" className="field" inputMode="numeric" value={f.sort} onChange={(e) => set("sort", e.target.value)} />
          </Field>
        </div>
        <Field id="pf-img" label="Picture link">
          <input id="pf-img" className="field" inputMode="url" value={f.image_url} onChange={(e) => set("image_url", e.target.value)} placeholder="https://…" />
        </Field>
        <Field id="pf-url" label="Product page link">
          <input id="pf-url" className="field" inputMode="url" value={f.url} onChange={(e) => set("url", e.target.value)} placeholder={sponsor.website_url || "https://…"} />
        </Field>
      </div>
      {err && (
        <p className="field-error" role="alert">
          {err}
        </p>
      )}
      <button
        type="button"
        className="btn btn-yellow"
        style={{ marginTop: 14 }}
        disabled={busy}
        onClick={() => {
          if (f.title.trim().length < 2) return setErr("Give the product a name");
          run(() => onSave({ ...f, id: value.id ?? "", sponsor_id: sponsor.id }));
        }}
        data-testid="save-product"
      >
        {busy ? "Saving…" : "Save product"}
      </button>
      {onDelete && (
        <button type="button" className="btn btn-ghost" style={{ marginTop: 10, color: "var(--danger)" }} disabled={busy} onClick={() => run(onDelete)}>
          Remove product
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
