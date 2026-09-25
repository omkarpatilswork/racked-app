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

async function ensureShareFonts() {
  try {
    await Promise.all([
      document.fonts.load("900 100px Unbounded"),
      document.fonts.load("800 40px Unbounded"),
      document.fonts.load("700 44px Manrope"),
      document.fonts.load("600 26px Manrope"),
      document.fonts.load('700 30px "JetBrains Mono"'),
      document.fonts.load('600 20px "JetBrains Mono"'),
    ]);
    await document.fonts.ready;
  } catch {
    // Fonts API unavailable or a face failed to load -- draw with fallback fonts.
  }
}

export async function drawShareCard(data: ShareCardData): Promise<HTMLCanvasElement> {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  await ensureShareFonts();

  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, "#17171B");
  bgGrad.addColorStop(1, "#0A0A0B");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W * 0.88, H * 0.1, 10, W * 0.88, H * 0.1, W * 0.65);
  glow.addColorStop(0, "rgba(255,106,70,0.38)");
  glow.addColorStop(1, "rgba(255,106,70,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // wordmark
  ctx.fillStyle = "#FF6A46";
  ctx.beginPath();
  ctx.arc(90, 100, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "left";
  ctx.font = "800 42px Unbounded, sans-serif";
  ctx.fillText("RACKED", 118, 114);
  const rackedW = ctx.measureText("RACKED").width;
  ctx.font = '600 20px "JetBrains Mono", monospace';
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.fillText("× BIJLEE", 118 + rackedW + 16, 114);

  // eyebrow
  ctx.textAlign = "center";
  ctx.font = '700 30px "JetBrains Mono", monospace';
  ctx.fillStyle = "#FF6A46";
  ctx.fillText((data.eyebrow || "").toUpperCase().split("").join(" "), W / 2, 460);

  // big stat, auto-fit
  let bigSize = 170;
  ctx.font = `900 ${bigSize}px Unbounded, sans-serif`;
  while (ctx.measureText(data.big).width > W - 120 && bigSize > 70) {
    bigSize -= 6;
    ctx.font = `900 ${bigSize}px Unbounded, sans-serif`;
  }
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(data.big, W / 2, 640);

  // sub label
  if (data.sub) {
    ctx.font = "700 46px Manrope, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.fillText(data.sub, W / 2, 725);
  }

  // meta line
  if (data.meta) {
    ctx.font = '700 30px "JetBrains Mono", monospace';
    ctx.fillStyle = "#FF6A46";
    ctx.fillText(data.meta, W / 2, 800);
  }

  // footer
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(90, H - 140);
  ctx.lineTo(W - 90, H - 140);
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.font = "600 26px Manrope, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fillText(data.dateLabel || "", 90, H - 88);
  ctx.textAlign = "right";
  ctx.font = '700 22px "JetBrains Mono", monospace';
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fillText("RACKED × BIJLEE", W - 90, H - 88);

  return canvas;
}
