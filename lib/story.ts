// Story images (1080 x 1920, Instagram Story / WhatsApp Status size) for
// sharing a lift, a rank, a badge, a streak, a win or your week.
// Branded Racked x Bijlee x the gym (Club 360). Every machine has its own
// design: its own colour, movement drawing and background pattern. Two looks:
// "card" (a designed poster) or "photo" (the same info laid over your own gym
// photo). Drawn on a <canvas> in the browser; nothing is uploaded.
import { ICON_PATHS } from "@/components/Icon";
import { MACHINE_MAP } from "@/lib/machines";
import { SITE_URL } from "@/lib/site";
import type { Gym } from "@/lib/gym";

export const STORY_W = 1080;
export const STORY_H = 1920;

export type StoryData =
  | {
      kind: "lift";
      machineId: string;
      label: string; // "Leg Press" / "Pec Fly"
      weight: number;
      reps: number;
      unit: string; // "KG"
      isPb: boolean;
      best?: { weight: number; reps: number } | null; // shown when this isn't a PB
      gain?: number | null; // kg over the previous best, for a PB
      tag?: string; // replaces "NEW PB" / "SET LOGGED", e.g. "#2 · LEG PRESS CHALLENGE"
      sets?: number; // session sets, for a session share
    }
  | { kind: "rank"; rank: number; scope: string; value: string; of?: number; top?: { rank: number; name: string; value: string; me?: boolean }[] }
  | { kind: "badge"; title: string; description: string; icon: string; xp: number }
  | { kind: "streak"; days: number; next?: { days: number; xp: number } | null }
  | { kind: "win"; title: string; place?: number | null; what: string; sponsors?: string[] }
  | { kind: "week"; title: string; sets: number; volume: number; pbs: number; days: number; rankLine?: string | null }
  | { kind: "progress"; level: number; sets: number; volume: number; pbs: number; machines: string };

export type StoryOptions = {
  data: StoryData;
  gym: Gym;
  who?: string | null; // first name
  photo?: ImageBitmap | HTMLImageElement | null;
  date?: Date;
};

// ---- palettes + per-machine art -------------------------------------------
type Tone = { disc: [string, string, string]; accent: string; second: string; ink: string };
const TONES: Record<"red" | "yellow" | "ember" | "paper", Tone> = {
  red: { disc: ["#FF7A4D", "#FF482C", "#D9301A"], accent: "#FF6B4F", second: "#F4B424", ink: "#202018" },
  yellow: { disc: ["#FFD766", "#F4B424", "#D88C0B"], accent: "#F4B424", second: "#FF482C", ink: "#202018" },
  ember: { disc: ["#F4B424", "#FF7A2E", "#FF482C"], accent: "#FF8A3D", second: "#F4B424", ink: "#202018" },
  paper: { disc: ["#FFFFFF", "#F5F4EE", "#DCDBD1"], accent: "#F5F4EE", second: "#FF482C", ink: "#202018" },
};
type Motif = "rings" | "stripes" | "dots" | "speed" | "grid";
type Seg = number[];
type Pose = { head: [number, number]; body: Seg[]; gear: Seg[]; dots?: [number, number, number][] };

// Side or front view, in a 100 x 100 box.
const POSES: Record<string, Pose> = {
  "lat-pulldown-01": {
    head: [50, 33],
    body: [[50, 40, 50, 66], [50, 44, 37, 40, 30, 24], [50, 44, 63, 40, 70, 24], [50, 66, 41, 70, 41, 88], [50, 66, 59, 70, 59, 88]],
    gear: [[14, 24, 86, 24], [50, 24, 50, 6], [40, 6, 60, 6], [33, 72, 67, 72], [50, 72, 50, 95], [34, 95, 66, 95]],
    dots: [[40, 62, 3.2], [60, 62, 3.2]],
  },
  "chest-press-02": {
    head: [36, 29],
    body: [[35, 36, 37, 70], [36, 44, 52, 47, 67, 46], [37, 70, 57, 71, 57, 90]],
    gear: [[28, 28, 30, 72], [24, 74, 50, 74], [38, 74, 38, 95], [22, 95, 56, 95], [67, 37, 67, 55], [67, 46, 82, 18]],
    dots: [[83, 16, 3.4]],
  },
  "rowing-03": {
    head: [31, 29],
    body: [[30, 36, 33, 68], [31, 44, 47, 48, 61, 50], [33, 68, 52, 57, 71, 65]],
    gear: [[18, 70, 44, 70], [31, 70, 31, 95], [8, 95, 94, 95], [76, 55, 80, 82], [61, 50, 85, 50]],
    dots: [[87, 50, 3.4]],
  },
  "pec-fly-rear-delt-04": {
    head: [50, 30],
    body: [[50, 37, 50, 66], [50, 42, 30, 42, 30, 24], [50, 42, 70, 42, 70, 24], [50, 66, 41, 70, 41, 88], [50, 66, 59, 70, 59, 88]],
    gear: [[25, 20, 25, 48], [75, 20, 75, 48], [33, 72, 67, 72], [50, 72, 50, 95], [34, 95, 66, 95]],
  },
  "shoulder-press-05": {
    head: [50, 33],
    body: [[50, 40, 50, 66], [50, 44, 33, 41, 31, 21], [50, 44, 67, 41, 69, 21], [50, 66, 41, 70, 41, 88], [50, 66, 59, 70, 59, 88]],
    gear: [[23, 20, 39, 20], [61, 20, 77, 20], [31, 20, 31, 8], [69, 20, 69, 8], [33, 72, 67, 72], [50, 72, 50, 95], [34, 95, 66, 95]],
  },
  "biceps-preacher-06": {
    head: [27, 29],
    body: [[27, 36, 31, 70], [29, 44, 50, 58], [50, 58, 53, 38], [31, 70, 49, 72, 49, 90]],
    gear: [[37, 44, 61, 66], [57, 63, 57, 95], [18, 73, 42, 73], [30, 73, 30, 95], [16, 95, 66, 95]],
    dots: [[53, 36, 3.6]],
  },
  "squat-07": {
    head: [53, 21],
    body: [[50, 28, 38, 54], [49, 31, 58, 38, 52, 28], [38, 54, 60, 62, 50, 84, 61, 84]],
    gear: [[82, 8, 82, 92], [74, 26, 82, 26], [14, 92, 92, 92]],
    dots: [[47, 26, 7.5]],
  },
  "leg-press-08": {
    head: [16, 49],
    body: [[21, 55, 40, 76], [25, 60, 34, 71], [40, 76, 49, 50, 68, 54]],
    gear: [[8, 54, 33, 81], [33, 81, 52, 81], [48, 95, 94, 31], [63, 49, 78, 59]],
  },
  "leg-extension-09": {
    head: [32, 27],
    body: [[31, 34, 34, 68], [32, 42, 40, 56, 44, 70], [34, 68, 54, 68, 77, 59]],
    gear: [[24, 30, 26, 70], [22, 72, 58, 72], [38, 72, 38, 95], [20, 95, 60, 95], [56, 71, 78, 64]],
    dots: [[78, 64, 4.2]],
  },
  "deadlift-10": {
    head: [65, 29],
    body: [[61, 35, 38, 56], [58, 38, 56, 72], [38, 56, 48, 72, 44, 90]],
    gear: [[12, 92, 92, 92]],
    dots: [[55, 78, 11]],
  },
};

const ART: Record<string, { tone: keyof typeof TONES; motif: Motif }> = {
  "lat-pulldown-01": { tone: "yellow", motif: "rings" },
  "chest-press-02": { tone: "red", motif: "stripes" },
  "rowing-03": { tone: "ember", motif: "speed" },
  "pec-fly-rear-delt-04": { tone: "paper", motif: "dots" },
  "shoulder-press-05": { tone: "yellow", motif: "grid" },
  "biceps-preacher-06": { tone: "red", motif: "rings" },
  "squat-07": { tone: "ember", motif: "stripes" },
  "leg-press-08": { tone: "yellow", motif: "speed" },
  "leg-extension-09": { tone: "paper", motif: "grid" },
  "deadlift-10": { tone: "red", motif: "dots" },
};

// Each machine's colours + drawing, for the feed's PR cards (same look as the
// story images).
export function machineArt(machineId: string) {
  const art = ART[machineId] || { tone: "red" as const, motif: "rings" as Motif };
  return { tone: TONES[art.tone], toneName: art.tone, motif: art.motif, pose: POSES[machineId] || null };
}

// ---- fonts ------------------------------------------------------------------
function displayFamily() {
  const v = typeof window !== "undefined" ? getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim() : "";
  return v || '"Unbounded Variable", sans-serif';
}
const SANS = '"Manrope Variable", system-ui, sans-serif';
const MONO = '"JetBrains Mono Variable", ui-monospace, monospace';

export async function ensureStoryFonts() {
  const all = (async () => {
    await Promise.all([
      document.fonts.load(`900 100px ${displayFamily()}`),
      document.fonts.load(`800 40px ${displayFamily()}`),
      document.fonts.load(`700 44px ${SANS}`),
      document.fonts.load(`600 26px ${SANS}`),
      document.fonts.load(`700 30px ${MONO}`),
    ]);
    await document.fonts.ready;
  })();
  try {
    await Promise.race([all, new Promise((r) => setTimeout(r, 2500))]);
  } catch {
    /* draw with whatever loaded */
  }
}

// ---- small drawing helpers ------------------------------------------------
function drawBolt(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  const k = size / 1630;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(k, k);
  ctx.fillStyle = "#FF482C";
  ctx.beginPath();
  ctx.arc(815, 815, 815, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#202018";
  ctx.fill(new Path2D("M598 441L1368 439L1200 655L1290 659L1237 812L315 1239L684 775L482 775Z"));
  ctx.fillStyle = "#F4B424";
  ctx.fill(new Path2D("M598 441L232 905L431 905L315 1239L684 775L482 775Z"));
  ctx.restore();
}

function font(ctx: CanvasRenderingContext2D, weight: number, size: number, family: string) {
  ctx.font = `${weight} ${Math.round(size)}px ${family}`;
}

function fit(ctx: CanvasRenderingContext2D, text: string, maxW: number, weight: number, size: number, family: string, min = 24) {
  let s = size;
  font(ctx, weight, s, family);
  while (ctx.measureText(text).width > maxW && s > min) {
    s -= 4;
    font(ctx, weight, s, family);
  }
  return s;
}

function spaced(text: string) {
  return text.toUpperCase().split("").join(String.fromCharCode(8202));
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines = 3) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) {
      lines.push(line);
      line = w;
      if (lines.length === maxLines - 1) break;
    } else line = t;
  }
  const used = lines.join(" ").split(/\s+/).filter(Boolean).length + (line ? line.split(/\s+/).length : 0);
  if (used < words.length) line = `${line} ${words.slice(used).join(" ")}`;
  if (line) lines.push(line);
  if (lines.length > maxLines) lines.length = maxLines;
  const last = lines.length - 1;
  while (last >= 0 && ctx.measureText(lines[last]).width > maxW && lines[last].length > 3) lines[last] = lines[last].slice(0, -2).trimEnd() + "…";
  return lines;
}

function slab(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, bg = "#FF482C", fg = "#0D0D0A", shadow = "#F4B424", align: "left" | "center" = "left") {
  font(ctx, 800, size, displayFamily());
  const w = ctx.measureText(text).width + size * 1.1;
  const h = size * 1.55;
  const left = align === "center" ? x - w / 2 : x;
  ctx.save();
  ctx.translate(left, y);
  ctx.transform(1, 0, -0.18, 1, 0, 0);
  ctx.fillStyle = shadow;
  ctx.fillRect(size * 0.28, size * 0.28, w, h);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
  ctx.fillStyle = fg;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, left + size * 0.55 - (0.18 * h) / 2, y + h / 2 + size * 0.04);
  ctx.textBaseline = "alphabetic";
  return { w, h };
}

// Draws one of the app's 24 x 24 line icons, scaled.
function drawIcon(ctx: CanvasRenderingContext2D, name: string, cx: number, cy: number, size: number, color: string, lw = 1.8) {
  const svg = ICON_PATHS[name] || ICON_PATHS.star;
  const k = size / 24;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(k, k);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const attr = (tag: string, a: string) => {
    const m = tag.match(new RegExp(`\\s${a}="([^"]+)"`));
    return m ? m[1] : null;
  };
  for (const tag of svg.match(/<(path|circle|rect)[^>]*>/g) || []) {
    if (tag.startsWith("<path")) {
      const d = attr(tag, "d");
      if (d) ctx.stroke(new Path2D(d));
    } else if (tag.startsWith("<circle")) {
      ctx.beginPath();
      ctx.arc(Number(attr(tag, "cx")), Number(attr(tag, "cy")), Number(attr(tag, "r")), 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const x = Number(attr(tag, "x")), y = Number(attr(tag, "y")), w = Number(attr(tag, "width")), h = Number(attr(tag, "height"));
      const rx = Number(attr(tag, "rx") || 0);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, w, h, rx);
      else ctx.rect(x, y, w, h);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawPose(ctx: CanvasRenderingContext2D, pose: Pose, cx: number, cy: number, size: number, ink: string) {
  const s = size / 100;
  const X = (v: number) => cx - size / 2 + v * s;
  const Y = (v: number) => cy - size / 2 + v * s;
  const line = (seg: Seg) => {
    ctx.beginPath();
    ctx.moveTo(X(seg[0]), Y(seg[1]));
    for (let i = 2; i < seg.length; i += 2) ctx.lineTo(X(seg[i]), Y(seg[i + 1]));
    ctx.stroke();
  };
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.42;
  ctx.lineWidth = 3.2 * s;
  pose.gear.forEach(line);
  (pose.dots || []).forEach(([x, y, r]) => {
    ctx.beginPath();
    ctx.arc(X(x), Y(y), r * s, 0, Math.PI * 2);
    ctx.lineWidth = 2.6 * s;
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
  ctx.lineWidth = 6 * s;
  pose.body.forEach(line);
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.arc(X(pose.head[0]), Y(pose.head[1]), 6.6 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function disc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, tone: Tone) {
  const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  g.addColorStop(0, tone.disc[0]);
  g.addColorStop(0.55, tone.disc[1]);
  g.addColorStop(1, tone.disc[2]);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 24;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // a thin inner ring, like a medal
  ctx.save();
  ctx.strokeStyle = "rgba(32,32,24,0.18)";
  ctx.lineWidth = Math.max(3, r * 0.018);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function motif(ctx: CanvasRenderingContext2D, m: Motif, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.09;
  if (m === "rings") {
    ctx.lineWidth = 3;
    for (let r = 160; r < 1500; r += 90) {
      ctx.beginPath();
      ctx.arc(STORY_W * 0.5, 690, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (m === "stripes") {
    ctx.lineWidth = 26;
    for (let x = -STORY_H; x < STORY_W + STORY_H; x += 90) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + STORY_H * 0.6, STORY_H);
      ctx.stroke();
    }
  } else if (m === "dots") {
    for (let y = 30; y < STORY_H; y += 54) for (let x = 30 + ((y / 54) % 2) * 27; x < STORY_W; x += 54) ctx.fillRect(x - 3, y - 3, 6, 6);
  } else if (m === "speed") {
    ctx.lineWidth = 6;
    for (let i = 0; i < 26; i++) {
      const y = 120 + i * 68;
      const len = 220 + ((i * 137) % 520);
      const x = (i * 263) % STORY_W;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + len, y);
      ctx.stroke();
    }
  } else {
    ctx.lineWidth = 2;
    for (let x = 0; x <= STORY_W; x += 90) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, STORY_H);
      ctx.stroke();
    }
    for (let y = 0; y <= STORY_H; y += 90) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(STORY_W, y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
    setTimeout(() => resolve(null), 4000);
  });
}

function cover(ctx: CanvasRenderingContext2D, img: ImageBitmap | HTMLImageElement) {
  const iw = (img as HTMLImageElement).naturalWidth || img.width;
  const ih = (img as HTMLImageElement).naturalHeight || img.height;
  const k = Math.max(STORY_W / iw, STORY_H / ih);
  const w = iw * k;
  const h = ih * k;
  ctx.drawImage(img, (STORY_W - w) / 2, (STORY_H - h) / 2, w, h);
}

function fmtKg(n: number) {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

// ---- the frame: background, brand bar, footer -------------------------------
async function frame(ctx: CanvasRenderingContext2D, o: StoryOptions, tone: Tone, m: Motif | null) {
  if (o.photo) {
    cover(ctx, o.photo);
    const top = ctx.createLinearGradient(0, 0, 0, 420);
    top.addColorStop(0, "rgba(0,0,0,0.62)");
    top.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, STORY_W, 420);
    const bot = ctx.createLinearGradient(0, 860, 0, STORY_H);
    bot.addColorStop(0, "rgba(13,13,10,0)");
    bot.addColorStop(0.45, "rgba(13,13,10,0.72)");
    bot.addColorStop(1, "rgba(13,13,10,0.94)");
    ctx.fillStyle = bot;
    ctx.fillRect(0, 860, STORY_W, STORY_H - 860);
  } else {
    const bg = ctx.createLinearGradient(0, 0, 0, STORY_H);
    bg.addColorStop(0, "#1f1f19");
    bg.addColorStop(1, "#0b0b09");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, STORY_W, STORY_H);
    const glow = ctx.createRadialGradient(STORY_W * 0.5, 690, 40, STORY_W * 0.5, 690, 900);
    glow.addColorStop(0, hexA(tone.disc[1], 0.34));
    glow.addColorStop(1, hexA(tone.disc[1], 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, STORY_W, STORY_H);
    if (m) motif(ctx, m, tone.accent === "#F5F4EE" ? "#F5F4EE" : tone.accent);
  }

  // brand bar (kept below Instagram's own top bar)
  const y = 238;
  drawBolt(ctx, 118, y - 14, 64);
  ctx.textAlign = "left";
  font(ctx, 800, 44, displayFamily());
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText("RACKED", 166, y + 2);
  const rw = ctx.measureText("RACKED").width;
  font(ctx, 600, 21, MONO);
  ctx.fillStyle = "rgba(255,255,255,0.66)";
  ctx.fillText("× BIJLEE", 166 + rw + 14, y);

  // gym on the right: logo if there's one we can draw, else the name
  const right = STORY_W - 86;
  const logoUrl = o.gym.logoDark || o.gym.logo;
  const logo = logoUrl ? await loadImage(logoUrl) : null;
  font(ctx, 600, 19, MONO);
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.textAlign = "right";
  if (logo && logo.naturalWidth && logo.naturalHeight) {
    const ratio = logo.naturalWidth / logo.naturalHeight;
    const w = Math.min(260, ratio * 76);
    const h = w / ratio;
    ctx.drawImage(logo, right - w, y - 14 - h / 2, w, h);
    ctx.fillText(spaced("at"), right - w - 16, y);
  } else {
    font(ctx, 800, 34, displayFamily());
    ctx.fillStyle = "#FFFFFF";
    const name = o.gym.name.toUpperCase();
    ctx.fillText(name, right, y + 2);
    const nw = ctx.measureText(name).width;
    font(ctx, 600, 19, MONO);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText(spaced("at"), right - nw - 14, y);
  }

  // footer (kept above Instagram's reply bar)
  const fy = 1664;
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(86, fy - 58);
  ctx.lineTo(STORY_W - 86, fy - 58);
  ctx.stroke();
  const date = (o.date || new Date()).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  ctx.textAlign = "left";
  font(ctx, 600, 26, SANS);
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText(`${o.who ? `${o.who} · ` : ""}${date}`, 86, fy);
  ctx.textAlign = "right";
  font(ctx, 700, 22, MONO);
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText("#RACKEDBYBIJLEE", STORY_W - 86, fy);
  font(ctx, 600, 20, MONO);
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.textAlign = "center";
  ctx.fillText(`Log yours: ${host()}/join`, STORY_W / 2, fy + 48);
}

function host() {
  try {
    return new URL(SITE_URL).host;
  } catch {
    return "racked";
  }
}

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ---- the different stories --------------------------------------------------
function liftNumbers(ctx: CanvasRenderingContext2D, d: Extract<StoryData, { kind: "lift" }>, x: number, y: number, maxW: number, align: "center" | "left", scale = 1) {
  const kg = fmtKg(d.weight);
  const unit = d.unit.toUpperCase() === "KG" ? "KG" : d.unit.toUpperCase();
  const reps = `× ${d.reps}`;
  let big = 290 * scale;
  const measure = () => {
    font(ctx, 900, big, displayFamily());
    const a = ctx.measureText(kg).width;
    font(ctx, 800, big * 0.26, displayFamily());
    const b = ctx.measureText(unit).width;
    font(ctx, 800, big * 0.42, displayFamily());
    const c = ctx.measureText(reps).width;
    return { a, b, c, total: a + 14 * scale + b + 28 * scale + c };
  };
  let m = measure();
  while (m.total > maxW && big > 120) {
    big -= 10;
    m = measure();
  }
  let left = align === "center" ? x - m.total / 2 : x;
  ctx.textAlign = "left";
  ctx.fillStyle = "#FFFFFF";
  font(ctx, 900, big, displayFamily());
  ctx.fillText(kg, left, y);
  left += m.a + 14 * scale;
  font(ctx, 800, big * 0.26, displayFamily());
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.fillText(unit, left, y - big * 0.06);
  left += m.b + 28 * scale;
  font(ctx, 800, big * 0.42, displayFamily());
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(reps, left, y);
  return big;
}

function liftSub(d: Extract<StoryData, { kind: "lift" }>) {
  if (d.isPb && d.gain && d.gain > 0) return `+${fmtKg(d.gain)} kg on my last best`;
  if (d.isPb) return "First time on this machine";
  if (d.best) return `My best: ${fmtKg(d.best.weight)} kg × ${d.best.reps}`;
  if (d.sets) return `${d.sets} set${d.sets === 1 ? "" : "s"} today`;
  return "";
}

async function drawLift(ctx: CanvasRenderingContext2D, o: StoryOptions, d: Extract<StoryData, { kind: "lift" }>) {
  const machine = MACHINE_MAP[d.machineId];
  const art = ART[d.machineId] || { tone: "red" as const, motif: "rings" as Motif };
  const tone = TONES[art.tone];
  const pose = POSES[d.machineId] || POSES["chest-press-02"];
  const number = machine?.number || "00";
  const groupLabel = (machine?.group || "").toUpperCase();
  const tag = d.tag || (d.isPb ? "NEW PB" : "SET LOGGED");
  await frame(ctx, o, tone, art.motif);

  if (!o.photo) {
    // the machine number, huge, as an outline behind everything
    ctx.save();
    font(ctx, 900, 820, displayFamily());
    ctx.textAlign = "center";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.strokeText(number, STORY_W / 2, 1060);
    ctx.restore();

    disc(ctx, STORY_W / 2, 690, 290, tone);
    drawPose(ctx, pose, STORY_W / 2, 690, 440, tone.ink);
    slab(ctx, tag, STORY_W / 2 + 60, 900, 44, d.isPb ? "#FF482C" : "#F5F4EE", d.isPb ? "#0D0D0A" : "#202018", "#F4B424");

    ctx.textAlign = "center";
    font(ctx, 700, 28, MONO);
    ctx.fillStyle = tone.accent;
    ctx.fillText(spaced(`Machine ${number}${groupLabel ? ` · ${groupLabel}` : ""}`), STORY_W / 2, 1102);
    fit(ctx, d.label.toUpperCase(), STORY_W - 180, 800, 74, displayFamily(), 40);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(d.label.toUpperCase(), STORY_W / 2, 1186);
    liftNumbers(ctx, d, STORY_W / 2, 1430, STORY_W - 150, "center");
    const sub = liftSub(d);
    if (sub) {
      font(ctx, 700, 34, MONO);
      ctx.fillStyle = tone.second;
      ctx.textAlign = "center";
      ctx.fillText(sub, STORY_W / 2, 1528);
    }
  } else {
    // on your photo: a medal with the movement + the numbers along the bottom
    disc(ctx, 196, 1140, 120, tone);
    drawPose(ctx, pose, 196, 1140, 184, tone.ink);
    ctx.textAlign = "left";
    font(ctx, 700, 24, MONO);
    ctx.fillStyle = tone.accent;
    ctx.fillText(spaced(`Machine ${number}${groupLabel ? ` · ${groupLabel}` : ""}`), 350, 1110);
    fit(ctx, d.label.toUpperCase(), STORY_W - 440, 800, 60, displayFamily(), 34);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(d.label.toUpperCase(), 350, 1182);
    slab(ctx, tag, 92, 1260, 36, d.isPb ? "#FF482C" : "#F5F4EE", d.isPb ? "#0D0D0A" : "#202018", "#F4B424");
    liftNumbers(ctx, d, 86, 1536, STORY_W - 172, "left", 0.86);
    const sub = liftSub(d);
    if (sub) {
      font(ctx, 700, 30, MONO);
      ctx.fillStyle = tone.second;
      ctx.textAlign = "right";
      ctx.fillText(sub, STORY_W - 86, 1302);
    }
  }
}

type Block = { eyebrow: string; title: string; sub?: string; medal: { icon?: string; text?: string }; toneKey: keyof typeof TONES; motif: Motif };

function blockFor(d: Exclude<StoryData, { kind: "lift" }>, gymName: string): Block {
  switch (d.kind) {
    case "rank":
      return { eyebrow: `${gymName} leaderboard`, title: `#${d.rank} ${d.scope}`, sub: `${d.value}${d.of ? ` · ${d.rank} of ${d.of}` : ""}`, medal: { text: `#${d.rank}` }, toneKey: d.rank === 1 ? "yellow" : "red", motif: "rings" };
    case "badge":
      return { eyebrow: "Badge unlocked", title: d.title, sub: d.description, medal: { icon: d.icon }, toneKey: "yellow", motif: "dots" };
    case "streak":
      return { eyebrow: "Lifting streak", title: `${d.days} days in a row`, sub: d.next ? `${d.next.days - d.days} more for +${d.next.xp} XP` : "Every single day. Legend.", medal: { icon: "flame" }, toneKey: "ember", motif: "speed" };
    case "win":
      return { eyebrow: d.place ? `Winner · #${d.place}` : "Winner", title: d.title, sub: d.what, medal: { icon: "trophy" }, toneKey: "yellow", motif: "rings" };
    case "week":
      return { eyebrow: `My week at ${gymName}`, title: d.title, sub: d.rankLine || "", medal: { icon: "bolt" }, toneKey: "red", motif: "stripes" };
    case "progress":
      return { eyebrow: `My progress at ${gymName}`, title: `Level ${d.level}`, medal: { text: `LV${d.level}` }, toneKey: "ember", motif: "grid" };
  }
}

function stats(d: Exclude<StoryData, { kind: "lift" }>): [string, string][] | null {
  if (d.kind === "week") return [[String(d.sets), "sets"], [`${Math.round(d.volume).toLocaleString("en-IN")}`, "kg moved"], [String(d.pbs), d.pbs === 1 ? "PB" : "PBs"], [String(d.days), d.days === 1 ? "day" : "days"]];
  if (d.kind === "progress") return [[String(d.sets), "sets"], [`${Math.round(d.volume).toLocaleString("en-IN")}`, "kg moved"], [String(d.pbs), "PBs"], [d.machines.split(" ")[0], "machines"]];
  return null;
}

async function drawBlock(ctx: CanvasRenderingContext2D, o: StoryOptions, d: Exclude<StoryData, { kind: "lift" }>) {
  const b = blockFor(d, o.gym.name);
  const tone = TONES[b.toneKey];
  await frame(ctx, o, tone, b.motif);
  const photo = !!o.photo;
  const left = photo ? 86 : STORY_W / 2;
  const align: CanvasTextAlign = photo ? "left" : "center";
  const maxW = STORY_W - 172;

  // shrink long titles (a prize name) until they fit in 3 lines
  let ts = photo ? 78 : 88;
  font(ctx, 800, ts, displayFamily());
  let lines = wrap(ctx, b.title, maxW, 4);
  while ((lines.length > 3 || lines.some((l) => ctx.measureText(l).width > maxW)) && ts > 48) {
    ts -= 6;
    font(ctx, 800, ts, displayFamily());
    lines = wrap(ctx, b.title, maxW, 4);
  }
  lines = lines.slice(0, 3);
  const lh = Math.round(ts * 1.14);

  // on a photo the block sits at the bottom: work out how tall it is first
  const grid = stats(d);
  const below = (b.sub ? 110 : 0) + (grid ? 300 : 0) + (d.kind === "win" && d.sponsors?.length ? 50 : 0) + (d.kind === "badge" ? 80 : 0);
  const titleTop = Math.min(1320, 1548 - below - (lines.length - 1) * lh);

  const cx = photo ? 196 : STORY_W / 2;
  const cy = photo ? titleTop - 200 : 650;
  const r = photo ? 118 : 250;
  disc(ctx, cx, cy, r, tone);
  if (b.medal.icon) drawIcon(ctx, b.medal.icon, cx, cy, r * 1.1, tone.ink, 1.9);
  else if (b.medal.text) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    fit(ctx, b.medal.text, r * 1.45, 900, r * 0.82, displayFamily(), 30);
    ctx.fillStyle = tone.ink;
    ctx.fillText(b.medal.text, cx, cy + r * 0.04);
    ctx.textBaseline = "alphabetic";
  }

  let y = photo ? titleTop : 1020;
  if (photo) {
    ctx.textAlign = "left";
    font(ctx, 700, 26, MONO);
    ctx.fillStyle = tone.accent;
    fit(ctx, spaced(b.eyebrow), STORY_W - 350 - 86, 700, 26, MONO, 16);
    ctx.fillText(spaced(b.eyebrow), 350, cy + 10);
  } else {
    ctx.textAlign = "center";
    font(ctx, 700, 30, MONO);
    ctx.fillStyle = tone.accent;
    ctx.fillText(spaced(b.eyebrow), STORY_W / 2, y);
    y += 100;
  }
  ctx.textAlign = align;
  font(ctx, 800, ts, displayFamily());
  ctx.fillStyle = "#FFFFFF";
  lines.forEach((l, i) => ctx.fillText(l, left, y + i * lh));
  y += lines.length * lh + 6;
  if (b.sub) {
    font(ctx, 600, 36, SANS);
    ctx.fillStyle = "rgba(255,255,255,0.82)";
    wrap(ctx, b.sub, maxW, 2).forEach((l, i) => ctx.fillText(l, left, y + i * 48));
    y += 110;
  }

  if (grid) {
    const cols = 2;
    const gw = (maxW - 24) / cols;
    const gx = photo ? 86 : 86;
    grid.forEach(([v, label], i) => {
      const x = gx + (i % cols) * (gw + 24);
      const yy = y + Math.floor(i / cols) * 150;
      ctx.fillStyle = "rgba(255,255,255,0.07)";
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, yy - 20, gw, 132, 26);
      else ctx.rect(x, yy - 20, gw, 132);
      ctx.fill();
      ctx.textAlign = "left";
      fit(ctx, v, gw - 60, 900, 66, displayFamily(), 30);
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(v, x + 30, yy + 52);
      font(ctx, 600, 24, MONO);
      ctx.fillStyle = tone.accent;
      ctx.fillText(label.toUpperCase(), x + 30, yy + 92);
    });
  }

  if (d.kind === "rank" && d.top && d.top.length && !photo) {
    d.top.slice(0, 3).forEach((t, i) => {
      const yy = y + i * 84;
      ctx.fillStyle = t.me ? hexA(tone.disc[1], 0.28) : "rgba(255,255,255,0.06)";
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(86, yy - 18, maxW, 70, 20);
      else ctx.rect(86, yy - 18, maxW, 70);
      ctx.fill();
      ctx.textAlign = "left";
      font(ctx, 700, 30, MONO);
      ctx.fillStyle = tone.second;
      ctx.fillText(String(t.rank), 116, yy + 28);
      font(ctx, 700, 32, SANS);
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(t.me ? `${t.name} (me)` : t.name, 176, yy + 28);
      ctx.textAlign = "right";
      font(ctx, 700, 28, MONO);
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.fillText(t.value, STORY_W - 116, yy + 28);
    });
  }
  if (d.kind === "streak" && !photo) {
    const n = Math.min(d.days, 14);
    const size = 44;
    const gap = 14;
    const total = n * size + (n - 1) * gap;
    for (let i = 0; i < n; i++) {
      const x = STORY_W / 2 - total / 2 + i * (size + gap);
      ctx.fillStyle = i === n - 1 ? "#FF482C" : "#F4B424";
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, size, size, 12);
      else ctx.rect(x, y, size, size);
      ctx.fill();
    }
  }
  if (d.kind === "win" && d.sponsors && d.sponsors.length) {
    const t = `FROM ${d.sponsors.join(" × ").toUpperCase()}`;
    fit(ctx, t, maxW, 700, 30, MONO, 18);
    ctx.fillStyle = tone.second;
    ctx.textAlign = align;
    ctx.fillText(t, left, y + 10);
  }
  if (d.kind === "badge") {
    slab(ctx, `+${d.xp} XP`, photo ? 92 : STORY_W / 2, y + 4, 40, "#F4B424", "#202018", "#FF482C", photo ? "left" : "center");
  }
}

export async function renderStory(o: StoryOptions): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = STORY_W;
  canvas.height = STORY_H;
  const ctx = canvas.getContext("2d")!;
  await ensureStoryFonts();
  if (o.data.kind === "lift") await drawLift(ctx, o, o.data);
  else await drawBlock(ctx, o, o.data);
  return canvas;
}

export function storyBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), "image/png");
    } catch {
      resolve(null); // a drawn logo without CORS would make this throw
    }
  });
}

// The caption that goes with the image (WhatsApp uses it; Instagram ignores it).
export function storyCaption(d: StoryData, gymName: string) {
  const link = `${SITE_URL}/join`;
  switch (d.kind) {
    case "lift":
      return `${d.isPb ? "New PB" : "Logged"} on ${d.label}: ${fmtKg(d.weight)} ${d.unit.toLowerCase()} × ${d.reps} at ${gymName} 💪 #RackedByBijlee ${link}`;
    case "rank":
      return `#${d.rank} ${d.scope} on the ${gymName} leaderboard 🏆 #RackedByBijlee ${link}`;
    case "badge":
      return `Unlocked the ${d.title} badge at ${gymName} ⚡ #RackedByBijlee ${link}`;
    case "streak":
      return `${d.days}-day lifting streak at ${gymName} 🔥 #RackedByBijlee ${link}`;
    case "win":
      return `Won ${d.title} at ${gymName} 🏆 #RackedByBijlee ${link}`;
    case "week":
      return `My week at ${gymName}: ${d.sets} sets, ${Math.round(d.volume).toLocaleString("en-IN")} kg moved 💪 #RackedByBijlee ${link}`;
    case "progress":
      return `Level ${d.level} at ${gymName} — ${d.sets} sets, ${Math.round(d.volume).toLocaleString("en-IN")} kg moved 🔥 #RackedByBijlee ${link}`;
  }
}

export function storyFileName(d: StoryData) {
  const base = d.kind === "lift" ? `${d.isPb ? "pb" : "lift"}-${d.machineId}` : d.kind;
  return `racked-${base}.png`;
}
