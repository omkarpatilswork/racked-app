// Story sharing (Instagram Story / WhatsApp Status images) from every place it
// appears, against the mocked backend. Run: see tests/README.md
const { chromium } = require("playwright");
const fs = require("fs");
const { defaultState, setup } = require("./mock");
const BASE = process.env.BASE_URL || "http://localhost:3111";
let n = 0, bad = 0;
const check = (name, ok, extra = "") => { n++; if (!ok) bad++; console.log(ok ? "PASS" : "FAIL", name, ok ? "" : extra); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

async function open(browser, url, mut = (s) => s, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: opts.width || 390, height: 844 }, deviceScaleFactor: 1, timezoneId: "Asia/Kolkata", colorScheme: "dark", acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  if (opts.theme) await page.addInitScript((t) => localStorage.setItem("racked:theme", t), opts.theme);
  if (opts.webShare) {
    // pretend to be a phone that can share files, and record what's shared
    await page.addInitScript(() => {
      window.__shared = [];
      navigator.canShare = () => true;
      navigator.share = async (d) => {
        window.__shared.push({ text: d.text, files: (d.files || []).map((f) => ({ name: f.name, type: f.type, size: f.size })) });
      };
    });
  }
  const st = mut(defaultState()) || defaultState();
  await setup(ctx, page, st, BASE);
  await page.goto(BASE + url, { waitUntil: "networkidle" }).catch(() => {});
  return { ctx, page, st, errors };
}

// waits for the studio's preview, then reports what it rendered
async function studio(page) {
  await page.waitForSelector('[data-testid="share-studio"]', { timeout: 10000 });
  await page.waitForFunction(() => {
    const img = document.querySelector('[data-testid="share-preview"] img');
    return img && img.complete && img.naturalWidth > 0 && !img.classList.contains("dim");
  }, null, { timeout: 15000 });
  return page.evaluate(() => {
    const img = document.querySelector('[data-testid="share-preview"] img');
    const wa = document.querySelector('[data-testid="share-whatsapp"]');
    return { w: img.naturalWidth, h: img.naturalHeight, caption: decodeURIComponent((wa?.getAttribute("href") || "").split("text=")[1] || "") };
  });
}
async function closeStudio(page) {
  await page.keyboard.press("Escape");
  await sleep(300);
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });

  // 1. a new PB: share from the celebration
  {
    const { ctx, page, errors } = await open(browser, "/machine/lat-pulldown-01/log?tap=LP4K9X");
    await page.waitForSelector('[data-testid="log-submit"]');
    // tap + until the weight beats the 55 kg PB
    for (let i = 0; i < 8; i++) {
      const label = (await page.locator('[data-testid="log-submit"]').textContent()) || "";
      if (/(5[6-9]|[6-9]\d)\s*KG/i.test(label)) break;
      await page.getByRole("button", { name: /increase weight/i }).first().click().catch(() => {});
    }
    await page.locator('[data-testid="log-submit"]').click();
    await page.waitForSelector('[data-testid="pb-share"]', { timeout: 10000 });
    await page.locator('[data-testid="pb-share"]').click();
    const r = await studio(page);
    check("PB story is 1080 x 1920", r.w === 1080 && r.h === 1920, `${r.w}x${r.h}`);
    check("PB caption: lift, gym, hashtag, join link", /New PB on Lat Pulldown: \d+ kg × \d+ at Club 360/.test(r.caption) && r.caption.includes("#RackedByBijlee") && r.caption.includes("/join"), r.caption);
    check("studio sits above the PB celebration", await page.evaluate(() => {
      const s = document.querySelector('[data-testid="share-studio"]').closest(".sheet-backdrop");
      return Number(getComputedStyle(s).zIndex) >= 60;
    }));
    check("no phone share here: Save image is the main button", ((await page.locator('[data-testid="share-go"]').textContent()) || "").includes("Save image"));
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 8000 }), page.locator('[data-testid="share-go"]').click()]);
    check("saves a PNG named after the lift", dl.suggestedFilename() === "racked-pb-lat-pulldown-01.png", dl.suggestedFilename());
    // on my photo
    await page.locator('[data-testid="share-photo-input"]').setInputFiles({ name: "gym.png", mimeType: "image/png", buffer: PNG });
    await sleep(400);
    const r2 = await studio(page);
    check("'On my photo' look switches on with the picked photo", (await page.locator('[data-testid="share-style-photo"]').getAttribute("aria-selected")) === "true" && r2.w === 1080);
    check("'Change photo' offered", (await page.locator(".share-change").count()) === 1);
    await page.locator('[data-testid="share-style-card"]').click();
    await studio(page);
    check("back to the card look", (await page.locator('[data-testid="share-style-card"]').getAttribute("aria-selected")) === "true");
    check("no page errors (PB share)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // 2. phone share sheet (Web Share with files)
  {
    const { ctx, page } = await open(browser, "/machine/lat-pulldown-01?tap=LP4K9X", (s) => s, { webShare: true });
    await page.getByRole("button", { name: "Share your PB" }).click();
    await studio(page);
    check("phones get 'Share to Instagram / WhatsApp'", ((await page.locator('[data-testid="share-go"]').textContent()) || "").includes("Share to Instagram / WhatsApp"));
    await page.locator('[data-testid="share-go"]').click();
    await sleep(500);
    const shared = await page.evaluate(() => window.__shared);
    check("shares the PNG + caption to the phone", shared.length === 1 && shared[0].files[0].type === "image/png" && shared[0].files[0].size > 20000 && shared[0].text.includes("Lat Pulldown"), JSON.stringify(shared));
    check("machine best: caption", shared[0] && shared[0].text.includes("55 kg × 10"));
    await ctx.close();
  }

  // 3. today's best from the log screen (not a PB)
  {
    const { ctx, page } = await open(browser, "/machine/lat-pulldown-01/log?tap=LP4K9X");
    await page.waitForSelector('[data-testid="log-submit"]');
    await page.locator('[data-testid="log-submit"]').click();
    await page.waitForSelector('[data-testid="share-session"]', { timeout: 10000 });
    await page.locator('[data-testid="share-session"]').click();
    const r = await studio(page);
    check("session share: today's best set", r.caption.startsWith("Logged on Lat Pulldown"), r.caption);
    await ctx.close();
  }

  // 4. ranks: rank, streak, badge
  {
    const { ctx, page, errors } = await open(browser, "/leaderboard");
    await page.waitForSelector('[data-testid="share-rank"]');
    await page.locator('[data-testid="share-rank"]').click();
    let r = await studio(page);
    check("rank share", r.caption.startsWith("#3 this week on the Club 360 leaderboard"), r.caption);
    await closeStudio(page);
    await page.locator('[data-testid="share-streak"]').click();
    r = await studio(page);
    check("streak share", r.caption.startsWith("3-day lifting streak at Club 360"), r.caption);
    await closeStudio(page);
    await page.locator('[data-testid="share-badge-regular"]').click();
    r = await studio(page);
    check("badge share", r.caption.startsWith("Unlocked the Regular badge at Club 360"), r.caption);
    await closeStudio(page);
    check("no locked-badge share buttons", (await page.locator('[data-testid="share-badge-explorer"]').count()) === 0);
    check("no page errors (ranks share)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // 5. rewards: a win + a challenge
  {
    const { ctx, page } = await open(browser, "/rewards");
    await page.waitForSelector('[data-testid="share-win"]');
    await page.locator('[data-testid="share-win"]').first().click();
    let r = await studio(page);
    check("prize win share", r.caption.startsWith("Won Partner coupons at Club 360"), r.caption);
    await closeStudio(page);
    await page.locator('[data-testid="chal-share"]').click();
    r = await studio(page);
    check("challenge share uses the machine design", r.caption.includes("Leg Press") && r.w === 1080, r.caption);
    await ctx.close();
  }

  // 6. home: my week · profile: my progress
  {
    const { ctx, page } = await open(browser, "/home");
    await page.waitForSelector('[data-testid="share-week"]');
    await page.locator('[data-testid="share-week"]').click();
    let r = await studio(page);
    check("week share", r.caption.startsWith("My week at Club 360:"), r.caption);
    await ctx.close();
    const p = await open(browser, "/profile");
    await p.page.getByRole("button", { name: /Share progress/ }).click();
    r = await studio(p.page);
    check("progress share, no level while XP is archived", /^My progress at Club 360/.test(r.caption) && !r.caption.includes("Level"), r.caption);
    await p.ctx.close();
  }

  // 7. the gym's logo goes on the image (and a logo that can't be drawn doesn't break it)
  {
    const { ctx, page, errors } = await open(browser, "/profile", (s) => ((s.rewards.settings.gym_logo_dark_url = "https://placeholder.supabase.co/storage/v1/object/public/rr-media/gym/logo.png"), s));
    await page.getByRole("button", { name: /Share progress/ }).click();
    const r = await studio(page);
    check("story still made with a gym logo set", r.w === 1080);
    check("no page errors (logo)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // 8. accessibility of the studio, both themes
  const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
  for (const theme of ["dark", "light"]) {
    const { ctx, page } = await open(browser, "/machine/lat-pulldown-01?tap=LP4K9X", (s) => s, { width: 360, theme });
    await page.getByRole("button", { name: "Share your PB" }).click();
    await studio(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`studio @360 no sideways scroll (${theme})`, overflow <= 0, String(overflow));
    await page.addScriptTag({ content: axeSrc });
    const res = await page.evaluate(async () => {
      // eslint-disable-next-line no-undef
      const r = await axe.run(document.querySelector('[data-testid="share-studio"]'), { runOnly: ["wcag2a", "wcag2aa"], resultTypes: ["violations"] });
      return r.violations.filter((v) => ["serious", "critical"].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((x) => x.target.join(" ")).join(", ")}`);
    });
    check(`studio axe (${theme})`, res.length === 0, res.join(" || "));
    await ctx.close();
  }

  await browser.close();
  console.log(`${n - bad}/${n} passed`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
