"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import ConfirmSheet from "@/components/ConfirmSheet";
import Sheet from "@/components/Sheet";
import { LoadError, SkeletonList, needsMigration } from "@/components/admin/shared";
import PhotoField from "@/components/rnr/PhotoField";
import FeedAdmin from "@/components/rnr/FeedAdmin";
import GymMark from "@/components/GymMark";
import { gymFromRow, setGymCache } from "@/lib/gym";
import { adminMemberSearch, friendlyDbError, type StaffMember } from "@/lib/data";
import { adminSetMemberBody } from "@/lib/body";
import { MACHINES, MACHINE_MAP } from "@/lib/machines";
import {
  buildLoop,
  cleanTvSlides,
  DEFAULT_TV_SLIDES,
  loopSeconds,
  SECONDS_MAX,
  SECONDS_MIN,
  SLIDE_KINDS,
  TIMES_MAX,
  type SlideKind,
  type TvSlideSettings,
} from "@/lib/tvSlides";
import { toast } from "@/lib/toast";
import {
  adminAddRewardCodes,
  adminAwardChallenge,
  adminAwardSeason,
  adminBonusXp,
  adminDeleteProduct,
  adminRrData,
  adminSaveRrSettings,
  adminSaveSeries,
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
  WEEKDAYS,
  type AdminChallengeRow,
  type AdminRrData,
  type AdminSeries,
  type RrSettings,
  type AdminReward,
  type AdminSponsor,
  type Client,
  type PrizeRow,
} from "@/lib/rewards";

const SECTIONS = [
  { key: "race", label: "This week's prize", icon: "gift" },
  { key: "feed", label: "Feed", icon: "megaphone" },
  { key: "challenges", label: "Challenges", icon: "flame" },
  { key: "partners", label: "Partners", icon: "star" },
  { key: "shop", label: "XP shop", icon: "ticket" },
  { key: "handout", label: "Hand out", icon: "check" },
  { key: "tv", label: "TV", icon: "tv" },
  { key: "gym", label: "Gym & page", icon: "home" },
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

export default function RrConsole({ supabase, section, onSection }: { supabase: Client; section: Section; onSection: (s: Section) => void }) {
  const [data, setData] = useState<AdminRrData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const setSection = onSection;

  const load = useCallback(() => {
    adminRrData(supabase)
      .then((d) => {
        setData(d);
        setState("ready");
      })
      .catch((err) => setState(needsMigration(err) ? "missing" : "error"));
  }, [supabase]);
  useEffect(load, [load]);

  const sponsors = useMemo(() => Object.fromEntries((data?.sponsors || []).map((s) => [s.id, s])), [data]);
  const toHandOut = (data?.redemptions || []).filter((r) => r.status === "issued").length;
  const toAwardRounds = (data?.challenges || []).filter((c) => !c.awarded_at && c.players > 0 && new Date(c.ends_at).getTime() <= Date.now()).length;

  if (state === "missing") {
    return (
      <div className="card" data-testid="needs-0012">
        <div className="row" style={{ justifyContent: "flex-start", gap: 12 }}>
          <span className="tapin-icons" aria-hidden="true">
            <Icon name="gift" />
          </span>
          <div>
            <b>Turn on R&amp;R Controls</b>
            <div className="faint" style={{ fontSize: 13, marginTop: 2 }}>
              Run database updates <span className="num">0011_rewards.sql</span> and then <span className="num">0012_rr_controls.sql</span> in Supabase → SQL Editor, then refresh.
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (state === "error") return <LoadError onRetry={load} />;

  return (
    <div className="stack-lg" data-testid="rr-console">
      <nav className="staff-tabs" aria-label="R&R sections">
        <div className="scroll-row">
        {SECTIONS.map((s) => (
          <button key={s.key} type="button" className="chip" aria-pressed={section === s.key} aria-current={section === s.key ? "page" : undefined} onClick={() => setSection(s.key)} data-testid={`rw-sec-${s.key}`}>
            <Icon name={s.icon} /> {s.label}
            {s.key === "handout" && toHandOut > 0 && <span className="count">{toHandOut}</span>}
            {s.key === "race" && (data?.to_award.length || 0) > 0 && <span className="count">{data!.to_award.length}</span>}
            {s.key === "challenges" && toAwardRounds > 0 && <span className="count">{toAwardRounds}</span>}
          </button>
        ))}
        </div>
      </nav>
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
      ) : section === "partners" ? (
        <PartnersAdmin supabase={supabase} data={data} reload={load} />
      ) : section === "tv" ? (
        <TvSection supabase={supabase} data={data} reload={load} />
      ) : section === "feed" ? (
        <FeedAdmin supabase={supabase} data={data} />
      ) : (
        <GymSection supabase={supabase} settings={data.settings} reload={load} />
      )}
    </div>
  );
}

type SectionProps = { supabase: Client; data: AdminRrData; reload: () => void };
export type { Section as RrSection };
export { SECTIONS as RR_SECTIONS };

// ---- prize race ------------------------------------------------------------
function RaceSection({ supabase, data, sponsors, reload }: SectionProps & { sponsors: Record<string, AdminSponsor> }) {
  const [awarding, setAwarding] = useState<AdminRrData["to_award"][number] | null>(null);
  const [busy, setBusy] = useState(false);
  const [editPrizes, setEditPrizes] = useState(false);
  const s = data.season;
  const strength = data.scoring === "strength";

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
      <section className="card" data-testid="rw-admin-prizes">
        <div className="row">
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>This week&rsquo;s prizes</div>
            <div className="faint" style={{ fontSize: 12.5 }}>What members see first on the Rewards page</div>
          </div>
          <button type="button" className="btn btn-yellow btn-sm" onClick={() => setEditPrizes(true)} data-testid="edit-prizes">
            <Icon name="edit" /> Edit
          </button>
        </div>
        <ul className="rw-admin-list">
          {data.templates.map((p, i) => (
            <li key={i}>
              <span className="rw-prize-rank-l">{prizeRankLabel(p)}</span>
              {p.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.image_url} alt="" className="rr-thumb" />
              ) : (
                <span className="rr-thumb rr-thumb-empty" aria-hidden="true">
                  <Icon name="camera" />
                </span>
              )}
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
        <p className="field-hint">Every new week starts with these prizes. Add a photo so members can see what they&rsquo;re playing for. Winners get a claim code to show at the desk (or a code from a linked XP shop item).</p>
      </section>

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
        {strength && data.live_boards ? (
          <div className="rr-race-split" data-testid="rr-live-boards">
            {(["men", "women"] as const).map((d) => (
              <div key={d}>
                <div className="list-title" style={{ marginTop: 14 }}>
                  {d === "men" ? "Men" : "Women"} · live top 10
                </div>
                {data.live_boards![d].length === 0 ? (
                  <p className="faint" style={{ fontSize: 13, margin: 0 }}>
                    Nobody yet.
                  </p>
                ) : (
                  <ol className="rw-board" style={{ marginTop: 4 }}>
                    {data.live_boards![d].map((r) => (
                      <li key={r.rank}>
                        <span className="r num">{r.rank}</span>
                        <span className="n">
                          {r.name}
                          {r.demo && <span className="pill rw-pill" style={{ marginLeft: 6, fontSize: 10.5 }}>Sample</span>}
                          {r.flagged > 0 && <span className="flag-pill" style={{ marginLeft: 8 }}>{r.flagged} to review</span>}
                        </span>
                        <span className="s num">{fmtXp(r.score)} pts</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ))}
            <p className="field-hint">Strength points: each member&rsquo;s best ×BW (kg ÷ body weight) on every machine this week × 100, added up. Sample members never win.</p>
          </div>
        ) : null}
        {strength && data.live_boards ? null : (
          <div className="list-title" style={{ marginTop: 14 }}>
            Live top 10
          </div>
        )}
        {strength && data.live_boards ? null : data.live_board.length === 0 ? (
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
        if (strength && t.boards) return <AwardCardBw key={t.id} supabase={supabase} t={t} onAward={() => setAwarding(t)} reload={reload} />;
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
                    {x.winners.length
                      ? x.winners.map((w) => `${w.division === "men" ? "Men " : w.division === "women" ? "Women " : ""}#${w.rank} ${w.name}`).join(" · ")
                      : "No winners"}
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
            {strength
              ? "The Men's and Women's winners each get their prize and a claim code in the app (top 3 get the Podium badge). Weigh the winners at the desk first. This can't be undone."
              : "Each winner gets their prize and a claim code in the app (and the top 3 get the Podium badge). This can't be undone, so check the Review queue first."}
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
          supabase={supabase}
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

// A finished week, Men's and Women's races (0015): who wins what, their body
// weight as they entered it, and a quick desk weigh-in before awarding.
function AwardCardBw({
  supabase,
  t,
  onAward,
  reload,
}: {
  supabase: Client;
  t: AdminRrData["to_award"][number];
  onAward: () => void;
  reload: () => void;
}) {
  const [weigh, setWeigh] = useState<{ uid: string; name: string; kg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const boards = t.boards!;
  const all = [...boards.men, ...boards.women];
  const flagged = all.filter((b) => b.flagged > 0 && b.prize);
  const unchecked = all.filter((b) => b.prize && !b.checked_at);
  return (
    <section className="card rw-award-card" data-testid="rw-to-award">
      <div className="eyebrow accent">Ended · ready to award</div>
      <div style={{ fontWeight: 800, fontSize: 17, marginTop: 2 }}>{t.title}</div>
      {flagged.length > 0 && (
        <p className="flag-pill" style={{ marginTop: 10, whiteSpace: "normal" }}>
          {flagged.map((f) => f.name).join(", ")} still {flagged.length === 1 ? "has" : "have"} sets waiting in Review. Approve or remove them first so the board is right.
        </p>
      )}
      {unchecked.length > 0 && (
        <p className="field-hint" style={{ marginTop: 8 }}>
          Weigh the winners at the desk before you award: tap <b>Weigh in</b> to enter what the scale says. It corrects their sets for the weeks not yet awarded.
        </p>
      )}
      {(["men", "women"] as const).map((d) => (
        <div key={d}>
          <div className="list-title" style={{ marginTop: 12 }}>
            {d === "men" ? "Men" : "Women"}
          </div>
          {boards[d].length === 0 ? (
            <p className="faint" style={{ fontSize: 13, margin: 0 }}>
              Nobody on this board.
            </p>
          ) : (
            <ol className="rw-board" style={{ marginTop: 4 }}>
              {boards[d].map((b) => (
                <li key={b.uid} data-testid={`award-row-${d}`}>
                  <span className="r num">{b.rank}</span>
                  <span className="n">
                    {b.name}
                    <span className="faint" style={{ display: "block", fontSize: 12, fontWeight: 600 }}>
                      {b.prize || "No prize"} · {b.body_kg ? `${b.body_kg} kg ${b.checked_at ? "(weighed)" : "(their entry)"}` : "no body weight"}
                    </span>
                  </span>
                  <span className="s num">{fmtXp(b.score)} pts</span>
                  {b.prize && (
                    <button type="button" className={`btn btn-sm ${b.checked_at ? "btn-ghost" : "btn-outline"}`} onClick={() => setWeigh({ uid: b.uid, name: b.name, kg: b.body_kg ? String(b.body_kg) : "" })} data-testid="weigh-in">
                      {b.checked_at ? <Icon name="check" /> : null} Weigh in
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      ))}
      <button type="button" className="btn btn-yellow" style={{ marginTop: 12 }} onClick={onAward} disabled={all.length === 0} data-testid="award-season">
        <Icon name="trophy" /> Award prizes
      </button>
      {weigh && (
        <Sheet open onClose={busy ? () => undefined : () => setWeigh(null)} title={`Weigh in: ${weigh.name}`} testId="weigh-sheet">
          <Field id="wi-kg" label="Body weight on the scale (kg)" hint="Saved as checked at the desk. Their sets in weeks not yet awarded use it.">
            <input id="wi-kg" className="field num" inputMode="decimal" type="number" step="0.1" value={weigh.kg} onChange={(e) => setWeigh({ ...weigh, kg: e.target.value })} data-testid="weigh-kg" />
          </Field>
          <button
            type="button"
            className="btn btn-yellow"
            style={{ marginTop: 14 }}
            disabled={busy || !(Number(weigh.kg) >= 25 && Number(weigh.kg) <= 300)}
            onClick={async () => {
              setBusy(true);
              try {
                await adminSetMemberBody(supabase, weigh.uid, Number(weigh.kg));
                toast("Weighed in. The board is updated.");
                setWeigh(null);
                reload();
              } catch (err) {
                toast(errMsg(err));
              } finally {
                setBusy(false);
              }
            }}
            data-testid="weigh-save"
          >
            {busy ? "Saving…" : "Save weigh-in"}
          </button>
        </Sheet>
      )}
    </section>
  );
}

function PrizeEditor({
  supabase,
  initial,
  sponsors,
  rewards,
  onSave,
  onClose,
}: {
  supabase: Client;
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
            <div style={{ marginTop: 10 }}>
              <PhotoField
                supabase={supabase}
                label="Photo of the prize"
                hint="Shown big on the Rewards page and Home. A clear photo of the hamper works best."
                value={r.image_url || ""}
                onChange={(url) => set(i, { image_url: url || null })}
                folder="prizes"
                testId={`prize-photo-${i}`}
              />
            </div>
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
  const [cancelling, setCancelling] = useState<AdminRrData["redemptions"][number] | null>(null);
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

  const row = (r: AdminRrData["redemptions"][number]) => (
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
          supabase={supabase}
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
  supabase,
  value,
  sponsors,
  onSave,
  onClose,
}: {
  supabase: Client;
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
        <PhotoField supabase={supabase} label="Photo (optional)" value={f.image_url} onChange={(u) => set("image_url", u)} folder="shop" testId="reward-photo" />
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
  const [editing, setEditing] = useState<Partial<AdminChallengeRow> | null>(null);
  const [series, setSeries] = useState<Partial<AdminSeries> | null>(null);
  const [awarding, setAwarding] = useState<AdminChallengeRow | null>(null);
  const [busy, setBusy] = useState(false);
  const names = Object.fromEntries(data.sponsors.map((s) => [s.id, s.name]));
  const now = Date.now();
  const toAward = data.challenges.filter((c) => !c.awarded_at && c.players > 0 && new Date(c.ends_at).getTime() <= now);
  const oneOffs = data.challenges.filter((c) => c.series_id === null && !toAward.includes(c));
  const pastRounds = data.challenges.filter((c) => c.series_id !== null && c.awarded_at).slice(0, 6);
  const when = (x: AdminSeries) => `Every ${WEEKDAYS[x.weekday - 1]} · ${x.start_time === "00:00" && x.end_time === "24:00" ? "all day" : `${x.start_time}–${x.end_time}`}`;

  return (
    <>
      {toAward.length > 0 && (
        <section>
          <div className="list-title">Ready to award · {toAward.length}</div>
          <div className="stack">
            {toAward.map((c) => (
              <article key={c.id} className="card rw-award-card" style={{ padding: 16 }} data-testid="round-to-award">
                <div className="eyebrow accent">Ended {shortDate(c.ends_at)}</div>
                <div style={{ fontWeight: 800, fontSize: 15.5, marginTop: 2 }}>{c.title}</div>
                {c.tops ? (
                  (["men", "women"] as const).map((d) => (
                    <div key={d}>
                      <div className="list-title" style={{ marginTop: 10 }}>
                        {d === "men" ? "Men" : "Women"}
                      </div>
                      <ol className="rw-board" style={{ marginTop: 4 }}>
                        {c.tops![d].length === 0 && <li className="faint">Nobody</li>}
                        {c.tops![d].map((t) => (
                          <li key={t.rank}>
                            <span className="r num">{t.rank}</span>
                            <span className="n">
                              {t.name}
                              {t.demo && <span className="pill rw-pill" style={{ marginLeft: 6, fontSize: 10.5 }}>Sample</span>}
                            </span>
                            <span className="s num">{metricValue(c.metric, Number(t.value), t.reps, true)}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))
                ) : (
                  <ol className="rw-board" style={{ marginTop: 8 }}>
                    {c.top.map((t) => (
                      <li key={t.rank}>
                        <span className="r num">{t.rank}</span>
                        <span className="n">{t.name}</span>
                        <span className="s num">{metricValue(c.metric, t.value, t.reps, data.scoring === "strength")}</span>
                      </li>
                    ))}
                  </ol>
                )}
                <button type="button" className="btn btn-yellow btn-sm" style={{ marginTop: 10 }} onClick={() => setAwarding(c)} data-testid="award-challenge">
                  <Icon name="trophy" /> Award {c.tops ? (c.winners > 1 ? `top ${c.winners} Men + Women` : "the Men's and Women's winners") : c.winners > 1 ? `top ${c.winners}` : "the winner"}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="row">
          <div className="list-title" style={{ margin: 0 }}>
            Weekly challenges
          </div>
          <button
            type="button"
            className="btn btn-yellow btn-sm"
            onClick={() => setSeries({ metric: "best_lift", winners: 1, join_xp: 20, active: true, weekday: 5, start_time: "00:00", end_time: "24:00" })}
            data-testid="new-series"
          >
            + Weekly
          </button>
        </div>
        <p className="faint" style={{ margin: "6px 0 10px", fontSize: 13 }}>
          Repeat on the same day every week, like the Friday Leg Press challenge. Each week has its own winner.
        </p>
        <div className="stack">
          {data.series.map((x) => (
            <article key={x.id} className="card" style={{ padding: 16 }} data-testid="admin-series">
              <div className="row" style={{ alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <div className="eyebrow">{x.sponsor_id ? names[x.sponsor_id] || x.sponsor_id : "Racked"}</div>
                  <div style={{ fontWeight: 800, fontSize: 15.5, marginTop: 2 }}>{x.title}</div>
                  <div className="faint" style={{ fontSize: 12.5, marginTop: 2 }}>
                    {when(x)} · {metricLabel(x.metric, data.scoring === "strength")}
                    {x.machine_id && MACHINE_MAP[x.machine_id] ? ` · ${MACHINE_MAP[x.machine_id].name}` : ""}
                  </div>
                  {x.prize && (
                    <div style={{ fontSize: 13, marginTop: 6 }}>
                      <b>Prize:</b> {x.prize}
                    </div>
                  )}
                  {x.active && x.next && (
                    <div className="faint" style={{ fontSize: 12.5, marginTop: 4 }} data-testid="series-next">
                      {new Date(x.next.starts_at).getTime() <= now ? `Live now · ${x.next.players} joined` : `Next: ${shortDate(x.next.starts_at)}`}
                    </div>
                  )}
                </div>
                <span className={`pill ${x.active ? "pill-yellow" : "rw-pill"}`}>{x.active ? "On" : "Off"}</span>
              </div>
              <div className="rw-ch-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSeries(x)} data-testid="edit-series">
                  <Icon name="edit" /> Edit
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={async () => {
                    try {
                      await adminSaveSeries(supabase, { id: x.id, title: x.title, active: !x.active });
                      toast(x.active ? "Switched off" : "Switched on");
                      reload();
                    } catch (err) {
                      toast(errMsg(err));
                    }
                  }}
                >
                  {x.active ? "Switch off" : "Switch on"}
                </button>
              </div>
            </article>
          ))}
          {data.series.length === 0 && <div className="card empty">No weekly challenges yet.</div>}
        </div>
      </section>

      <section>
        <div className="row">
          <div className="list-title" style={{ margin: 0 }}>
            One-off challenges
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing({ metric: "best_lift", winners: 1, join_xp: 20, active: false })} data-testid="new-challenge">
            + One-off
          </button>
        </div>
        <div className="stack" style={{ marginTop: 10 }}>
          {oneOffs.map((c) => {
            const ended = new Date(c.ends_at).getTime() <= now;
            const status = c.awarded_at ? "Awarded" : ended ? "Ended" : !c.active ? "Off" : new Date(c.starts_at).getTime() > now ? "Upcoming" : "Live";
            return (
              <article key={c.id} className="card" style={{ padding: 16 }} data-testid="admin-challenge">
                <div className="row" style={{ alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="eyebrow">{c.sponsor_id ? names[c.sponsor_id] || c.sponsor_id : "Racked"}</div>
                    <div style={{ fontWeight: 800, fontSize: 15.5, marginTop: 2 }}>{c.title}</div>
                    <div className="faint" style={{ fontSize: 12.5, marginTop: 2 }}>
                      {metricLabel(c.metric, data.scoring === "strength")}
                      {c.machine_id && MACHINE_MAP[c.machine_id] ? ` · ${MACHINE_MAP[c.machine_id].name}` : ""} · {shortDate(c.starts_at)} → {shortDate(c.ends_at)}
                    </div>
                  </div>
                  <span className={`pill ${status === "Live" ? "pill-yellow" : "rw-pill"}`}>{status}</span>
                </div>
                {!c.awarded_at && (
                  <div className="rw-ch-actions">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(c)}>
                      <Icon name="edit" /> Edit
                    </button>
                  </div>
                )}
              </article>
            );
          })}
          {oneOffs.length === 0 && <p className="faint" style={{ fontSize: 13, margin: 0 }}>None right now.</p>}
        </div>
      </section>

      {pastRounds.length > 0 && (
        <section>
          <div className="list-title">Past weekly winners</div>
          <div className="card" style={{ padding: "6px 16px" }}>
            <ul className="rw-admin-list">
              {pastRounds.map((c) => (
                <li key={c.id}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b>{c.title}</b>
                    <span className="faint" style={{ display: "block", fontSize: 12.5 }}>
                      {shortDate(c.starts_at)} · {c.top[0] ? `${c.top[0].name} · ${metricValue(c.metric, c.top[0].value, c.top[0].reps, data.scoring === "strength")}` : "No entries"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

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
      {series && (
        <SeriesForm
          value={series}
          sponsors={data.sponsors}
          rewards={data.rewards}
          onClose={() => setSeries(null)}
          onSave={async (p) => {
            await adminSaveSeries(supabase, p);
            toast("Weekly challenge saved");
            setSeries(null);
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
            toast(`${w.length} winner${w.length === 1 ? "" : "s"} awarded. Hand out the prize from “Hand out”.`);
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

function SeriesForm({
  value,
  sponsors,
  rewards,
  onSave,
  onClose,
}: {
  value: Partial<AdminSeries>;
  sponsors: AdminSponsor[];
  rewards: AdminReward[];
  onSave: (p: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}) {
  const [f, setF] = useState({
    title: value.title || "",
    sponsor_id: value.sponsor_id || "",
    description: value.description || "",
    metric: value.metric || "best_lift",
    machine_id: value.machine_id || "",
    weekday: String(value.weekday ?? 5),
    allDay: (value.start_time ?? "00:00") === "00:00" && (value.end_time ?? "24:00") === "24:00",
    start_time: value.start_time && value.start_time !== "00:00" ? value.start_time : "06:00",
    end_time: value.end_time && value.end_time !== "24:00" ? value.end_time : "22:00",
    prize: value.prize || "",
    reward_id: value.reward_id == null ? "" : String(value.reward_id),
    winners: String(value.winners ?? 1),
    join_xp: String(value.join_xp ?? 20),
    active: value.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    if (f.title.trim().length < 2) return setErr("Give it a name");
    if (!f.allDay && f.end_time <= f.start_time) return setErr("The end time has to be after the start time");
    setBusy(true);
    setErr(null);
    try {
      await onSave({
        id: value.id ?? "",
        title: f.title,
        sponsor_id: f.sponsor_id,
        description: f.description,
        metric: f.metric,
        machine_id: f.machine_id,
        weekday: f.weekday,
        start_time: f.allDay ? "00:00" : f.start_time,
        end_time: f.allDay ? "24:00" : f.end_time,
        prize: f.prize,
        reward_id: f.reward_id,
        winners: f.winners,
        join_xp: f.join_xp,
        active: f.active,
      });
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={busy ? () => undefined : onClose} title={value.id ? "Edit weekly challenge" : "New weekly challenge"} testId="series-form">
      <div className="stack">
        <Field id="sr-title" label="Name">
          <input id="sr-title" className="field" maxLength={80} value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Clean Crate Leg Press Challenge" />
        </Field>
        <Field id="sr-sp" label="Brand">
          <select id="sr-sp" className="field" value={f.sponsor_id} onChange={(e) => set("sponsor_id", e.target.value)}>
            <option value="">Racked / the gym</option>
            {sponsors.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="sr-desc" label="Description">
          <textarea id="sr-desc" className="field" maxLength={300} value={f.description} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <div className="rw-form-row">
          <Field id="sr-metric" label="Winner is">
            <select id="sr-metric" className="field" value={f.metric} onChange={(e) => set("metric", e.target.value)}>
              <option value="best_lift">Heaviest set</option>
              <option value="sets">Most sets</option>
              <option value="volume">Most volume</option>
            </select>
          </Field>
          <Field id="sr-machine" label="Machine">
            <select id="sr-machine" className="field" value={f.machine_id} onChange={(e) => set("machine_id", e.target.value)}>
              <option value="">Any machine</option>
              {MACHINES.map((mm) => (
                <option key={mm.id} value={mm.id}>
                  {mm.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field id="sr-day" label="Every">
          <select id="sr-day" className="field" value={f.weekday} onChange={(e) => set("weekday", e.target.value)}>
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={String(i + 1)}>
                {d}
              </option>
            ))}
          </select>
        </Field>
        <button type="button" className="list-row" role="switch" aria-checked={f.allDay} onClick={() => set("allDay", !f.allDay)} style={{ padding: "12px 2px" }}>
          <span style={{ flex: 1 }}>All day</span>
          <span className="switch" aria-hidden="true">
            <i />
          </span>
        </button>
        {!f.allDay && (
          <div className="rw-form-row">
            <Field id="sr-from" label="From">
              <input id="sr-from" type="time" className="field" value={f.start_time} onChange={(e) => set("start_time", e.target.value)} />
            </Field>
            <Field id="sr-to" label="To">
              <input id="sr-to" type="time" className="field" value={f.end_time} onChange={(e) => set("end_time", e.target.value)} />
            </Field>
          </div>
        )}
        <Field id="sr-prize" label="Prize">
          <input id="sr-prize" className="field" maxLength={120} value={f.prize} onChange={(e) => set("prize", e.target.value)} placeholder="e.g. A goodie bag from The Clean Crate" />
        </Field>
        <div className="rw-form-row">
          <Field id="sr-win" label="Winners">
            <input id="sr-win" className="field" inputMode="numeric" value={f.winners} onChange={(e) => set("winners", e.target.value)} />
          </Field>
          <Field id="sr-join" label="Join XP">
            <input id="sr-join" className="field" inputMode="numeric" value={f.join_xp} onChange={(e) => set("join_xp", e.target.value)} />
          </Field>
        </div>
        <Field id="sr-codes" label="Prize codes from (optional)">
          <select id="sr-codes" className="field" value={f.reward_id} onChange={(e) => set("reward_id", e.target.value)}>
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
        <p className="field-hint" style={{ margin: 0 }}>Times are gym time (India). Changing the day or times starts with the next round; a round that&rsquo;s running isn&rsquo;t cut short.</p>
      </div>
      {err && (
        <p className="field-error" role="alert">
          {err}
        </p>
      )}
      <button type="button" className="btn btn-yellow" style={{ marginTop: 14 }} disabled={busy} onClick={save} data-testid="save-series">
        {busy ? "Saving…" : "Save weekly challenge"}
      </button>
    </Sheet>
  );
}

function ChallengeForm({
  value,
  sponsors,
  rewards,
  onSave,
  onClose,
}: {
  value: Partial<AdminChallengeRow>;
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
          Brands on the Rewards page and the gym TV. App taps and TV QR scans are counted so you can report back to them.
        </p>
        <button type="button" className="btn btn-yellow btn-sm" onClick={() => setEditing({ active: true })} data-testid="new-sponsor">
          + New
        </button>
      </div>
      <div className="stack">
        {data.sponsors.map((sp) => (
          <article key={sp.id} className="card" style={{ padding: 16 }} data-testid="admin-sponsor">
            {sp.cover_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={sp.cover_url} alt="" className="rr-cover-thumb" />
            )}
            <div className="row" style={{ alignItems: "flex-start" }}>
              <div style={{ minWidth: 0, display: "flex", gap: 10, alignItems: "center" }}>
                {sp.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={sp.logo_url} alt="" className="rr-thumb" />
                ) : (
                  <span className="rr-thumb rr-thumb-empty" aria-hidden="true">
                    {sp.name.slice(0, 1)}
                  </span>
                )}
                <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{sp.name}</div>
                <div className="faint" style={{ fontSize: 12.5, marginTop: 2 }}>
                  {sp.tagline || sp.website_url || ""}
                </div>
                </div>
              </div>
              <span style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                <span className={`pill ${sp.active ? "pill-yellow" : "rw-pill"}`}>{sp.active ? "Shown" : "Hidden"}</span>
                {sp.active && sp.show_on_tv !== undefined && (
                  <span className="pill rw-pill" data-testid="sponsor-tv-pill">
                    <Icon name="tv" /> {sp.show_on_tv ? "On TV" : "Not on TV"}
                  </span>
                )}
              </span>
            </div>
            <div className="rw-stats" data-testid="sponsor-stats">
              <div>
                <b className="num">{Math.max(0, sp.clicks_30d - (data.tv_scans_30d?.[sp.id] || 0))}</b>
                <span>app taps · 30 days</span>
              </div>
              <div>
                <b className="num">{data.tv_scans_30d?.[sp.id] || 0}</b>
                <span>TV scans · 30 days</span>
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
          supabase={supabase}
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
          supabase={supabase}
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

function SponsorForm({
  supabase,
  value,
  onSave,
  onClose,
}: {
  supabase: Client;
  value: Partial<AdminSponsor>;
  onSave: (p: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}) {
  const isNew = !value.id;
  const [f, setF] = useState({
    id: value.id || "",
    name: value.name || "",
    tagline: value.tagline || "",
    blurb: value.blurb || "",
    website_url: value.website_url || "",
    instagram_url: value.instagram_url || "",
    logo_url: value.logo_url || "",
    cover_url: value.cover_url || "",
    category: value.category || "",
    sort: String(value.sort ?? 0),
    active: value.active ?? true,
    show_on_tv: value.show_on_tv ?? true,
    tv_headline: value.tv_headline || "",
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
        <PhotoField supabase={supabase} label="Logo" hint="Square works best. PNG keeps a see-through background." value={f.logo_url} onChange={(u) => set("logo_url", u)} folder="brands" shape="square" testId="brand-logo" />
        <PhotoField supabase={supabase} label="Cover photo" hint="A wide photo across the top of their card (products, store, athletes)." value={f.cover_url} onChange={(u) => set("cover_url", u)} folder="brands" testId="brand-cover" />
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
        <button type="button" className="list-row" role="switch" aria-checked={f.show_on_tv} onClick={() => set("show_on_tv", !f.show_on_tv)} style={{ padding: "12px 2px" }} data-testid="sponsor-on-tv">
          <span style={{ flex: 1 }}>
            Show an ad on the gym TV
            <span className="faint" style={{ display: "block", fontSize: 12.5 }}>
              Big product photo, name, price, website and a QR code to their site
            </span>
          </span>
          <span className="switch" aria-hidden="true">
            <i />
          </span>
        </button>
        {f.show_on_tv && (
          <Field id="sf-tvh" label="TV headline (optional)" hint="A few big words for the TV ad. Empty = the tagline.">
            <input id="sf-tvh" className="field" maxLength={60} value={f.tv_headline} onChange={(e) => set("tv_headline", e.target.value)} placeholder="Your name. Your number. Your jersey." />
          </Field>
        )}
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
  supabase,
  sponsor,
  value,
  onSave,
  onDelete,
  onClose,
}: {
  supabase: Client;
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
        <PhotoField supabase={supabase} label="Photo" value={f.image_url} onChange={(u) => set("image_url", u)} folder="products" shape="square" testId="product-photo" />
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

// ---- the gym TV --------------------------------------------------------------------
const KIND_SHORT: Record<string, string> = {
  join: "Join",
  howto: "How it works",
  board: "Board",
  open: "Board",
  today: "Push/Pull/Legs",
  prize: "Prize",
  challenge: "Challenge",
  partner: "Ad",
  winners: "Winners",
};

function fmtDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m ? `${m} min${s ? ` ${s} s` : ""}` : `${s} s`;
}

function TvSection({ supabase, data, reload }: SectionProps) {
  const supported = data.settings.tv_slides !== undefined;
  const saved = useMemo(() => cleanTvSlides(data.settings.tv_slides), [data.settings.tv_slides]);
  const [f, setF] = useState<TvSlideSettings>(saved);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(saved);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  // a loop where every kind has something to show (one board per machine)
  const preview = useMemo(() => {
    const boards = MACHINES.map((m) => ({ key: m.id, machineId: m.id, mode: "", machineNumber: m.number, title: m.name, unit: m.unit, entries: [], men: [], women: [] }));
    const anyLive = (data.challenges || []).some((c) => new Date(c.starts_at).getTime() <= Date.now() && new Date(c.ends_at).getTime() > Date.now());
    const slides = buildLoop(
      {
        boards,
        hasToday: true,
        hasPrize: true,
        challenges: [{ id: 0 } as never],
        liveChallenge: anyLive,
        partners: data.sponsors.filter((s) => s.active && s.show_on_tv !== false).map((s) => ({ ...s, tv_headline: s.tv_headline ?? null, products: s.products })),
        hasWinners: true,
      },
      f,
      0
    );
    return { slides, seconds: loopSeconds(slides, f) };
  }, [f, data]);

  const step = (kind: SlideKind, key: "times" | "seconds", d: number) =>
    setF((x) => {
      const def = SLIDE_KINDS.find((k) => k.kind === kind)!;
      const v = x[kind][key] + d;
      const next = key === "times" ? Math.min(TIMES_MAX, Math.max(def.minTimes, v)) : Math.min(SECONDS_MAX, Math.max(SECONDS_MIN, v));
      return { ...x, [kind]: { ...x[kind], [key]: next } };
    });

  async function save() {
    setBusy(true);
    try {
      await adminSaveRrSettings(supabase, { tv_slides: f });
      toast("TV updated. The screen picks it up within a minute.");
      reload();
    } catch (e) {
      toast(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  if (!supported) {
    return (
      <div className="card" data-testid="needs-0013">
        <div className="row" style={{ justifyContent: "flex-start", gap: 12 }}>
          <span className="tapin-icons" aria-hidden="true">
            <Icon name="tv" />
          </span>
          <div>
            <b>Turn on TV controls</b>
            <div className="faint" style={{ fontSize: 13, marginTop: 2 }}>
              Run database update <span className="num">0013_tv_house_lifts.sql</span> in Supabase → SQL Editor, then refresh.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="stack-lg" data-testid="rr-tv">
      <div className="row">
        <p className="faint" style={{ margin: 0, fontSize: 13, flex: 1 }}>
          What the gym TV shows, how many times in each loop and for how long. Key slides teach people how to join, so they come round most often.
        </p>
        {origin && (
          <a className="btn btn-ghost btn-sm" href={`${origin}/tv`} target="_blank" rel="noreferrer" data-testid="open-tv">
            <Icon name="external" /> Open TV
          </a>
        )}
      </div>

      <section className="card rr-tv-loop" aria-label="One loop of the TV" data-testid="tv-loop">
        <div className="row">
          <b>One loop</b>
          <span className="pill num" data-testid="tv-loop-time">
            {preview.slides.length} slides · {fmtDuration(preview.seconds)}
          </span>
        </div>
        <ol className="rr-tv-strip">
          {preview.slides.map((sl) => (
            <li key={sl.key} className={`k-${sl.kind}`}>
              {KIND_SHORT[sl.kind]}
            </li>
          ))}
        </ol>
        <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
          Slides with nothing to show are skipped (no prize set, nobody lifted today yet). Machine boards and partner ads take turns, so each loop shows the next ones.
        </p>
      </section>

      <div className="stack">
        {SLIDE_KINDS.map((k) => {
          const v = f[k.kind];
          return (
            <article key={k.kind} className={`card rr-tv-row${v.times === 0 ? " off" : ""}`} data-testid={`tv-kind-${k.kind}`}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <b>{k.label}</b>
                  {k.key && <span className="pill pill-yellow">Key</span>}
                  {v.times === 0 && <span className="pill rw-pill">Off</span>}
                </div>
                <div className="faint" style={{ fontSize: 12.5, marginTop: 2 }}>
                  {k.hint}
                </div>
              </div>
              <div className="rr-tv-steppers">
                <Stepper
                  label="Times per loop"
                  name={`${k.label}: times per loop`}
                  value={v.times}
                  min={k.minTimes}
                  max={TIMES_MAX}
                  onStep={(d) => step(k.kind, "times", d)}
                  testId={`tv-times-${k.kind}`}
                />
                <Stepper
                  label="Seconds"
                  name={`${k.label}: seconds`}
                  value={v.seconds}
                  min={SECONDS_MIN}
                  max={SECONDS_MAX}
                  disabled={v.times === 0}
                  onStep={(d) => step(k.kind, "seconds", d)}
                  testId={`tv-secs-${k.kind}`}
                />
              </div>
            </article>
          );
        })}
      </div>

      <div className="btn-row">
        <button type="button" className="btn btn-ghost" onClick={() => setF(DEFAULT_TV_SLIDES)} disabled={busy} data-testid="tv-defaults">
          Reset to suggested
        </button>
        <button type="button" className="btn btn-yellow" onClick={save} disabled={busy || !dirty} data-testid="tv-save">
          {busy ? "Saving…" : dirty ? "Save TV settings" : "Saved"}
        </button>
      </div>
    </div>
  );
}

function Stepper({
  label,
  name,
  value,
  min,
  max,
  disabled,
  onStep,
  testId,
}: {
  label: string;
  name: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onStep: (d: number) => void;
  testId: string;
}) {
  return (
    <div className={`rr-stepper${disabled ? " disabled" : ""}`} role="group" aria-label={name} data-testid={testId}>
      <span className="rr-stepper-label">{label}</span>
      <div className="rr-stepper-ctl">
        <button type="button" aria-label={`Less: ${name}`} disabled={disabled || value <= min} onClick={() => onStep(-1)} data-testid={`${testId}-down`}>
          <Icon name="minus" />
        </button>
        <output className="num" aria-live="polite">
          {value}
        </output>
        <button type="button" aria-label={`More: ${name}`} disabled={disabled || value >= max} onClick={() => onStep(1)} data-testid={`${testId}-up`}>
          <Icon name="plus" />
        </button>
      </div>
    </div>
  );
}

// ---- gym & page ------------------------------------------------------------------
function GymSection({ supabase, settings, reload }: { supabase: Client; settings: RrSettings; reload: () => void }) {
  const [f, setF] = useState({
    gym_name: settings.gym_name || "",
    gym_location: settings.gym_location || "",
    gym_logo_url: settings.gym_logo_url || "",
    gym_logo_dark_url: settings.gym_logo_dark_url || "",
    gym_instagram_url: settings.gym_instagram_url || "",
    gym_website_url: settings.gym_website_url || "",
    prize_headline: settings.prize_headline || "",
    rewards_note: settings.rewards_note || "",
    show_partners: settings.show_partners,
    show_shop: settings.show_shop,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const preview = gymFromRow(f);

  async function save() {
    if (!f.gym_name.trim()) return setErr("The gym needs a name");
    setBusy(true);
    setErr(null);
    try {
      await adminSaveRrSettings(supabase, f);
      setGymCache(gymFromRow(f));
      toast("Saved. It shows across the app and on share cards.");
      reload();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="card" data-testid="rr-gym">
        <div style={{ fontWeight: 800, fontSize: 16 }}>The gym</div>
        <p className="field-hint" style={{ marginTop: 2 }}>Shown on Home, Ranks, Profile, the gym TV, /join and share images.</p>
        <div className="rr-gym-preview">
          <div className="rr-gym-preview-light">
            <GymMark variant="lockup" gym={{ ...preview, logoDark: preview.logo || preview.logoDark }} label="Leaderboard" />
          </div>
          <div className="rr-gym-preview-dark">
            <GymMark variant="lockup" gym={preview} onDark label="Leaderboard" />
          </div>
        </div>
        <div className="stack" style={{ marginTop: 12 }}>
          <div className="rw-form-row">
            <Field id="gy-name" label="Name">
              <input id="gy-name" className="field" maxLength={60} value={f.gym_name} onChange={(e) => set("gym_name", e.target.value)} />
            </Field>
            <Field id="gy-loc" label="Location">
              <input id="gy-loc" className="field" maxLength={60} value={f.gym_location} onChange={(e) => set("gym_location", e.target.value)} placeholder="e.g. Baner, Pune" />
            </Field>
          </div>
          <PhotoField supabase={supabase} label="Logo for light backgrounds" hint="PNG with a see-through background works best (dark logo)." value={f.gym_logo_url} onChange={(u) => set("gym_logo_url", u)} folder="gym" shape="logo" testId="gym-logo" />
          <PhotoField supabase={supabase} label="Logo for dark backgrounds" hint="A white / light version for dark screens, the TV and share images." value={f.gym_logo_dark_url} onChange={(u) => set("gym_logo_dark_url", u)} folder="gym" shape="logo" testId="gym-logo-dark" />
          <div className="rw-form-row">
            <Field id="gy-ig" label="Instagram link">
              <input id="gy-ig" className="field" inputMode="url" value={f.gym_instagram_url} onChange={(e) => set("gym_instagram_url", e.target.value)} placeholder="https://instagram.com/…" />
            </Field>
            <Field id="gy-web" label="Website">
              <input id="gy-web" className="field" inputMode="url" value={f.gym_website_url} onChange={(e) => set("gym_website_url", e.target.value)} placeholder="https://…" />
            </Field>
          </div>
        </div>
      </section>

      <section className="card">
        <div style={{ fontWeight: 800, fontSize: 16 }}>Rewards page</div>
        <div className="stack" style={{ marginTop: 12 }}>
          <Field id="gy-head" label="Prize heading" hint="Leave empty for “This week's prize”.">
            <input id="gy-head" className="field" maxLength={60} value={f.prize_headline} onChange={(e) => set("prize_headline", e.target.value)} placeholder="This week's prize" />
          </Field>
          <Field id="gy-note" label="Note under the prize (optional)">
            <input id="gy-note" className="field" maxLength={160} value={f.rewards_note} onChange={(e) => set("rewards_note", e.target.value)} placeholder="e.g. Winners collect at the front desk every Monday" />
          </Field>
          <button type="button" className="list-row" role="switch" aria-checked={f.show_partners} onClick={() => set("show_partners", !f.show_partners)} style={{ padding: "12px 2px" }}>
            <span style={{ flex: 1 }}>Show the Partners tab</span>
            <span className="switch" aria-hidden="true">
              <i />
            </span>
          </button>
          <button type="button" className="list-row" role="switch" aria-checked={f.show_shop} onClick={() => set("show_shop", !f.show_shop)} style={{ padding: "12px 2px" }}>
            <span style={{ flex: 1 }}>Show the XP shop tab</span>
            <span className="switch" aria-hidden="true">
              <i />
            </span>
          </button>
        </div>
      </section>
      {err && (
        <p className="field-error" role="alert">
          {err}
        </p>
      )}
      <button type="button" className="btn btn-yellow" disabled={busy} onClick={save} data-testid="save-gym">
        {busy ? "Saving…" : "Save"}
      </button>
    </>
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
