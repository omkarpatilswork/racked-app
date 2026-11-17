// The gym TV's running order.
//
// Staff choose, for each kind of slide, how many times it shows per loop and
// for how long (R&R Controls -> TV, stored in rr_settings.tv_slides, 0013).
// One loop is built at a time:
//   * Join always opens the loop.
//   * Each kind's showings are spread evenly through the loop, and the same
//     kind never sits next to itself when that can be avoided.
//   * Machine boards, challenges and partner ads take turns: each loop picks
//     up where the last one stopped, so every machine and every brand gets
//     its turn.
//   * A kind with nothing to show (no prize this week, nobody lifted today)
//     is skipped; a gym where nobody has lifted yet gets one "every board is
//     open" slide in place of the boards.
import type { TvBoard } from "@/lib/data";
import type { Challenge, Sponsor, SponsorProduct } from "@/lib/rewards";

export type SlideKind = "join" | "howto" | "board" | "today" | "prize" | "challenge" | "partner" | "winners";
export type SlideSetting = { times: number; seconds: number };
export type TvSlideSettings = Record<SlideKind, SlideSetting>;

export const TIMES_MAX = 6;
export const SECONDS_MIN = 5;
export const SECONDS_MAX = 30;

export const SLIDE_KINDS: { kind: SlideKind; label: string; hint: string; minTimes: number; key?: boolean }[] = [
  { kind: "join", label: "Join Racked", hint: "Big QR code to sign up. Always opens the loop.", minTimes: 1, key: true },
  { kind: "howto", label: "How it works", hint: "Tap or scan the sticker, log your set, climb the board.", minTimes: 0, key: true },
  { kind: "board", label: "Machine boards", hint: "Top 3 on one machine. A different machine each time.", minTimes: 0, key: true },
  { kind: "today", label: "Push · Pull · Legs", hint: "How many people did push, pull and legs today. Skipped until someone logs a set.", minTimes: 0, key: true },
  { kind: "prize", label: "This week's prize", hint: "The prize, who's winning and how long is left.", minTimes: 0 },
  { kind: "challenge", label: "Challenges", hint: "Live and coming up. Gets one extra spot while one is live.", minTimes: 0 },
  { kind: "partner", label: "Partner ads", hint: "One brand each time, with its website and QR code.", minTimes: 0 },
  { kind: "winners", label: "Winners", hint: "Last week's prize winners.", minTimes: 0 },
];

export const DEFAULT_TV_SLIDES: TvSlideSettings = {
  join: { times: 2, seconds: 12 },
  howto: { times: 2, seconds: 12 },
  board: { times: 4, seconds: 10 },
  today: { times: 2, seconds: 10 },
  prize: { times: 1, seconds: 9 },
  challenge: { times: 1, seconds: 9 },
  partner: { times: 1, seconds: 8 },
  winners: { times: 1, seconds: 8 },
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const num = (v: unknown): number | null => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

// Same rules as the database's _tv_slides_clean(): missing or odd values fall
// back to the defaults, everything stays within limits.
export function cleanTvSlides(raw: unknown): TvSlideSettings {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, Record<string, unknown> | undefined>;
  const out = {} as TvSlideSettings;
  SLIDE_KINDS.forEach(({ kind, minTimes }) => {
    const d = DEFAULT_TV_SLIDES[kind];
    const s = src[kind] || {};
    out[kind] = {
      times: clamp(num(s.times) ?? d.times, minTimes, TIMES_MAX),
      seconds: clamp(num(s.seconds) ?? d.seconds, SECONDS_MIN, SECONDS_MAX),
    };
  });
  return out;
}

export type TvPartner = Pick<Sponsor, "id" | "name" | "tagline" | "logo_url" | "cover_url" | "website_url" | "products"> & {
  tv_headline: string | null;
};

export type Slide =
  | { kind: "join"; key: string }
  | { kind: "howto"; key: string }
  | { kind: "today"; key: string }
  | { kind: "prize"; key: string }
  | { kind: "winners"; key: string }
  | { kind: "open"; key: string }
  | { kind: "board"; key: string; board: TvBoard }
  | { kind: "challenge"; key: string; challenge: Challenge }
  | { kind: "partner"; key: string; partner: TvPartner; product: SponsorProduct | null };

export type LoopInput = {
  boards: TvBoard[]; // only boards with someone on them
  hasToday: boolean;
  hasPrize: boolean;
  challenges: Challenge[]; // live first, then coming up
  liveChallenge: boolean;
  partners: TvPartner[];
  hasWinners: boolean;
};

// How long a slide stays up.
export function slideSeconds(s: Slide, settings: TvSlideSettings) {
  const kind: SlideKind = s.kind === "open" ? "board" : s.kind;
  return settings[kind].seconds;
}

// Which picture a partner ad shows: products with a photo first, taking turns.
function partnerProduct(p: TvPartner, turn: number): SponsorProduct | null {
  const withPhoto = (p.products || []).filter((x) => x.image_url);
  const list = withPhoto.length ? withPhoto : p.products || [];
  return list.length ? list[turn % list.length] : null;
}

const ORDER: Slide["kind"][] = ["join", "howto", "board", "open", "today", "prize", "challenge", "partner", "winners"];

export function buildLoop(input: LoopInput, settings: TvSlideSettings, loop = 0): Slide[] {
  const L = Math.max(0, Math.floor(loop));
  const groups: Slide[][] = [];
  const t = settings;

  groups.push(Array.from({ length: Math.max(1, t.join.times) }, (_, i) => ({ kind: "join", key: `L${L}:join:${i}` }) as Slide));
  groups.push(Array.from({ length: t.howto.times }, (_, i) => ({ kind: "howto", key: `L${L}:howto:${i}` }) as Slide));

  if (t.board.times > 0) {
    const b = input.boards;
    if (b.length) {
      const n = Math.min(t.board.times, b.length);
      groups.push(Array.from({ length: n }, (_, i) => ({ kind: "board", key: `L${L}:board:${i}`, board: b[(L * n + i) % b.length] }) as Slide));
    } else {
      groups.push([{ kind: "open", key: `L${L}:open:0` }]);
    }
  }
  if (input.hasToday) groups.push(Array.from({ length: t.today.times }, (_, i) => ({ kind: "today", key: `L${L}:today:${i}` }) as Slide));
  if (input.hasPrize) groups.push(Array.from({ length: t.prize.times }, (_, i) => ({ kind: "prize", key: `L${L}:prize:${i}` }) as Slide));
  if (input.challenges.length && t.challenge.times > 0) {
    const c = input.challenges;
    const n = t.challenge.times + (input.liveChallenge ? 1 : 0);
    groups.push(Array.from({ length: n }, (_, i) => ({ kind: "challenge", key: `L${L}:challenge:${i}`, challenge: c[(L * n + i) % c.length] }) as Slide));
  }
  if (input.partners.length && t.partner.times > 0) {
    const p = input.partners;
    const n = t.partner.times;
    groups.push(
      Array.from({ length: n }, (_, i) => {
        const turn = L * n + i;
        const partner = p[turn % p.length];
        return { kind: "partner", key: `L${L}:partner:${i}`, partner, product: partnerProduct(partner, Math.floor(turn / p.length)) } as Slide;
      })
    );
  }
  if (input.hasWinners) groups.push(Array.from({ length: t.winners.times }, (_, i) => ({ kind: "winners", key: `L${L}:winners:${i}` }) as Slide));

  // spread each kind evenly through the loop; each kind starts at a slightly
  // different point so kinds with the same count interleave instead of bunching
  const live = groups.filter((g) => g.length);
  const total = live.reduce((s, g) => s + g.length, 0);
  const placed: { s: Slide; at: number }[] = [];
  live.forEach((g, gi) => {
    const phase = (gi + 0.5) / live.length;
    g.forEach((s, i) => {
      const at = s.kind === "join" && i === 0 ? -1 : ((i + phase) * total) / g.length;
      placed.push({ s, at });
    });
  });
  placed.sort((a, b) => a.at - b.at || ORDER.indexOf(a.s.kind) - ORDER.indexOf(b.s.kind));
  return avoidRepeats(placed.map((p) => p.s));
}

// Moves a slide away from a neighbour of the same kind, when another kind is
// available further on. Boards next to boards are fine when there's nothing
// else to show (they're different machines).
function avoidRepeats(list: Slide[]): Slide[] {
  const s = [...list];
  const kindAt = (i: number) => s[(i + s.length) % s.length].kind;
  for (let i = 1; i < s.length; i++) {
    if (kindAt(i) !== kindAt(i - 1)) continue;
    const j = s.findIndex((x, n) => n > i && x.kind !== s[i].kind && x.kind !== s[i - 1].kind);
    if (j > i) {
      const [moved] = s.splice(j, 1);
      s.splice(i, 0, moved);
    }
  }
  // the loop's last slide shouldn't be a Join right before the next loop's Join
  if (s.length > 2 && s[s.length - 1].kind === "join") {
    for (let i = s.length - 2; i > 0; i--) {
      if (s[i].kind !== "join" && s[i - 1].kind !== "join") {
        const [j] = s.splice(s.length - 1, 1);
        s.splice(i, 0, j);
        break;
      }
    }
  }
  return s;
}

// Total seconds one loop takes (shown in R&R Controls).
export function loopSeconds(slides: Slide[], settings: TvSlideSettings) {
  return slides.reduce((n, s) => n + slideSeconds(s, settings), 0);
}
