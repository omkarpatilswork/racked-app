// Ported 1:1 from the Racked Artifact prototype's canvas-drawn Strava-style
// share card. In a real deployed web app there's no sandboxed-iframe download
// restriction to work around, so the consuming component can just use a
// plain `<a download>` on the resulting blob — no special capability needed.

export type ShareCardData = {
  eyebrow: string;
  big: string;
  sub?: string;
  meta?: string;
  dateLabel?: string;
  fileTag: string;
  shareText?: string;
};

// The display font's real family name (next/font gives it a generated name),
// read from the same CSS variable the app uses.
function displayFamily() {
  const v = typeof window !== "undefined" ? getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim() : "";
  return v || '"Unbounded Variable", sans-serif';
}

async function ensureShareFonts() {
  // Never let a slow or stalled font download block the share card forever:
  // after 2.5s we draw with whatever is loaded (falling back to system fonts)
  // instead of leaving the share sheet stuck on its loading skeleton.
  const loadAll = (async () => {
    await Promise.all([
      document.fonts.load(`900 100px ${displayFamily()}`),
      document.fonts.load(`800 40px ${displayFamily()}`),
      document.fonts.load('700 44px "Manrope Variable"'),
      document.fonts.load('600 26px "Manrope Variable"'),
      document.fonts.load('700 30px "JetBrains Mono Variable"'),
      document.fonts.load('600 20px "JetBrains Mono Variable"'),
    ]);
    await document.fonts.ready;
  })();
  try {
    await Promise.race([loadAll, new Promise((resolve) => setTimeout(resolve, 2500))]);
  } catch {
    // Fonts API unavailable or a face failed to load -- draw with fallback fonts.
  }
}

// Native Instagram Stories size (9:16) so the card fills the screen edge to
// edge when posted, instead of landing as a small letterboxed feed-post
// crop with black bars above and below.
// The Bijlee Run Club bolt mark (same shapes as public/brand/bijlee-bolt.svg).
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

export async function drawShareCard(data: ShareCardData): Promise<HTMLCanvasElement> {
  const W = 1080;
  const H = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  await ensureShareFonts();

  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, "#202018");
  bgGrad.addColorStop(1, "#0D0D0A");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W * 0.86, H * 0.08, 10, W * 0.86, H * 0.08, W * 0.75);
  glow.addColorStop(0, "rgba(255,72,44,0.34)");
  glow.addColorStop(1, "rgba(255,72,44,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // wordmark: Bijlee bolt + RACKED
  drawBolt(ctx, 112, 129, 56);
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "left";
  ctx.font = `800 42px ${displayFamily()}`;
  ctx.fillText("RACKED", 156, 145);
  const rackedW = ctx.measureText("RACKED").width;
  ctx.font = '600 20px "JetBrains Mono Variable", monospace';
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.fillText("× BIJLEE", 156 + rackedW + 16, 145);

  // The whole stat block sits vertically centered in the frame -- the ratio
  // of empty space above/below is what makes a 9:16 export feel designed
  // for stories rather than a square card stretched to fit.
  const centerY = H * 0.52;

  // small accent line above the eyebrow, echoing the NFC sticker's minimal
  // orange-line motif so the share card reads as the same brand system.
  ctx.strokeStyle = "#FF482C";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 32, centerY - 210);
  ctx.lineTo(W / 2 + 32, centerY - 210);
  ctx.stroke();

  // eyebrow
  ctx.textAlign = "center";
  ctx.font = '700 30px "JetBrains Mono Variable", monospace';
  ctx.fillStyle = "#FF482C";
  ctx.fillText((data.eyebrow || "").toUpperCase().split("").join(" "), W / 2, centerY - 140);

  // big stat, auto-fit
  let bigSize = 170;
  ctx.font = `900 ${bigSize}px ${displayFamily()}`;
  while (ctx.measureText(data.big).width > W - 120 && bigSize > 70) {
    bigSize -= 6;
    ctx.font = `900 ${bigSize}px ${displayFamily()}`;
  }
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(data.big, W / 2, centerY + 40);

  // sub label
  if (data.sub) {
    ctx.font = '700 46px "Manrope Variable", sans-serif';
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.fillText(data.sub, W / 2, centerY + 130);
  }

  // meta line
  if (data.meta) {
    ctx.font = '700 30px "JetBrains Mono Variable", monospace';
    ctx.fillStyle = "#FF482C";
    ctx.fillText(data.meta, W / 2, centerY + 210);
  }

  // footer
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(90, H - 160);
  ctx.lineTo(W - 90, H - 160);
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.font = '600 26px "Manrope Variable", sans-serif';
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fillText(data.dateLabel || "", 90, H - 100);
  ctx.textAlign = "right";
  ctx.font = '700 22px "JetBrains Mono Variable", monospace';
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fillText("RACKED × BIJLEE", W - 90, H - 100);

  return canvas;
}
