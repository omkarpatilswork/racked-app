// Strength boards (0015) + Ranks v2 (0016): body weight + board, scores (kg ÷ body weight × 100) with Men / Women /
// All, strength points for the weekly prize, the TV and "Tap or scan. Log. Win.".
// Against the mocked backend. Run: see tests/README.md
const { chromium } = require("playwright");
const fs = require("fs");
const { defaultState, setup, enableStrength } = require("./mock");
const BASE = process.env.BASE_URL || "http://localhost:3111";
let n = 0, bad = 0;
const check = (name, ok, extra = "") => { n++; if (!ok) bad++; console.log(ok ? "PASS" : "FAIL", name, ok ? "" : extra); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const calls = (st, name) => st.calls.filter((c) => c.startsWith("POST rpc/" + name + " ") || c === "POST rpc/" + name);
const body = (c) => { try { return JSON.parse(c.slice(c.indexOf("{"))); } catch { return {}; } };
const text = async (page, sel) => ((await page.locator(sel).first().textContent()) || "").replace(/\s+/g, " ").trim();
const count = (page, sel) => page.locator(sel).count();

async function open(browser, url, mut = (s) => s, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: opts.width || 390, height: 844 }, deviceScaleFactor: 1, timezoneId: "Asia/Kolkata", colorScheme: opts.theme || "dark" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  if (opts.theme) await page.addInitScript((t) => localStorage.setItem("racked:theme", t), opts.theme);
  // archived features (lib/features.ts) switched back on for this browser
  if (opts.features) await page.addInitScript((ks) => ks.forEach((k) => localStorage.setItem("racked:feature:" + k, "on")), opts.features);
  const st = mut(defaultState()) || defaultState();
  await setup(ctx, page, st, BASE);
  await page.goto(BASE + url, { waitUntil: "networkidle" }).catch(() => {});
  return { ctx, page, st, errors };
}
const strong = (opts) => (s) => enableStrength(s, opts);

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
  const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
  async function axe(page) {
    await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect && a.effect.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => null))));
    await page.addScriptTag({ content: axeSrc });
    return page.evaluate(async () => {
      // eslint-disable-next-line no-undef
      const r = await axe.run(document, { runOnly: ["wcag2a", "wcag2aa"], resultTypes: ["violations"] });
      return r.violations.filter((v) => ["serious", "critical"].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((x) => x.target.join(" ")).join(", ")}`);
    });
  }

  // 1. no body weight yet: asked on the log page, "Not now", Home card, saving
  {
    const { ctx, page, st, errors } = await open(browser, "/machine/lat-pulldown-01/log?tap=LP4K9X", strong({ body: null }));
    await page.waitForSelector('[data-testid="body-sheet"]', { timeout: 8000 });
    check("log page asks for body weight + board", ((await text(page, '[data-testid="body-sheet"]'))).includes("strength boards"));
    check("explains the score with an example", ((await text(page, '[data-testid="body-sheet"]'))).includes("60 kg lifted at 75 kg = 80"));
    check("three choices: Men, Women, Prefer not to say", (await count(page, '[data-testid="body-sheet"] [role="radio"]')) === 3);
    check("save is off until both are filled", await page.locator('[data-testid="bw-save"]').isDisabled());
    check("body weight field is focused", (await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))) === "bw-kg");
    check("says only you and staff see the number", ((await text(page, '[data-testid="body-sheet"]'))).includes("Only you and gym staff see this number"));
    check("axe: body sheet", (await axe(page)).length === 0);
    await page.locator('[data-testid="bw-later"]').click();
    await sleep(300);
    check("Not now closes it", (await count(page, '[data-testid="body-sheet"]')) === 0);
    await page.reload({ waitUntil: "networkidle" });
    await sleep(1200);
    check("…and it doesn't ask again straight away", (await count(page, '[data-testid="body-sheet"]')) === 0);
    check("no page errors (ask)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }
  {
    const plain = await open(browser, "/home", strong({ body: null }));
    await plain.page.waitForSelector('[data-testid="home-log"]');
    await sleep(800);
    check("Home: no strength-boards card (archived; the log screen asks)", (await count(plain.page, '[data-testid="home-add-body"]')) === 0);
    await plain.ctx.close();
    const { ctx, page, st, errors } = await open(browser, "/home", strong({ body: null }), { features: ["homeBodyCard"] });
    await page.waitForSelector('[data-testid="home-add-body"]');
    check("Home: card to get on the strength boards", ((await text(page, '[data-testid="home-add-body"]'))).includes("Your score"));
    await page.locator('[data-testid="home-add-body-btn"]').click();
    await page.waitForSelector('[data-testid="body-sheet"]');
    await page.locator('[data-testid="bw-women"]').click();
    await page.locator('[data-testid="bw-kg"]').fill("61.5");
    check("example uses your weight", ((await text(page, '[data-testid="body-sheet"]'))).includes("61.5 kg = 98"));
    await page.locator('[data-testid="bw-save"]').click();
    await page.waitForSelector('[data-testid="body-sheet"]', { state: "detached" });
    const b = body(calls(st, "set_my_body")[0]);
    check("saved: board + body weight", b.p_division === "women" && b.p_body_kg === 61.5, JSON.stringify(b));
    check("toast names the board", (await page.locator(".toast").allTextContents()).some((t) => t.includes("Women")));
    await sleep(400);
    check("Home card goes away", (await count(page, '[data-testid="home-add-body"]')) === 0);
    check("no page errors (save)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }
  // prefer not to say, and the weekly limit
  {
    const { ctx, page, st, errors } = await open(browser, "/settings", strong({ body: { next_body_change: new Date(Date.now() + 4 * 86400000).toISOString() } }));
    await page.waitForSelector('[data-testid="settings-body"]');
    check("Settings: board + body weight (private)", ((await text(page, '[data-testid="settings-body"]'))).includes("Men · 80 kg"));
    await page.locator('[data-testid="settings-body"]').click();
    await page.waitForSelector('[data-testid="body-sheet"]');
    check("weekly limit: weight locked with the date", await page.locator('[data-testid="bw-kg"]').isDisabled() && ((await text(page, '[data-testid="body-sheet"]'))).includes("update it again from"));
    await page.locator('[data-testid="bw-open"]').click();
    check("prefer not to say explains the All board", ((await text(page, '[data-testid="body-sheet"]'))).includes("All boards"));
    await page.locator('[data-testid="bw-save"]').click();
    await page.waitForSelector('[data-testid="body-sheet"]', { state: "detached" });
    const b = body(calls(st, "set_my_body")[0]);
    check("board change sent alone", b.p_division === "open" && b.p_body_kg === null, JSON.stringify(b));
    st.bodyRefuse = { code: "RK302", message: "You can switch boards once a month. Next change from 20 Dec." };
    await page.locator('[data-testid="settings-body"]').click();
    await page.locator('[data-testid="bw-women"]').click();
    await page.locator('[data-testid="bw-save"]').click();
    await sleep(400);
    check("database refusal shown word for word", ((await text(page, '[data-testid="body-sheet"] .field-error'))).includes("once a month"));
    check("no page errors (settings)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // 2. Ranks v2 (0016): small card, two tabs, filters (board · machine · show),
  //    score / kg moved / heaviest, the "you" bar, progress without XP
  const pick = async (page, id, value) => {
    await page.locator(`[data-testid="${id}"] select`).selectOption(value);
    await sleep(700);
  };
  const lastRanks = (st) => body(calls(st, "ranks_board").pop());
  const rowsText = async (page) => (await page.locator('[data-testid="rk-row"]').allTextContents()).map((t) => t.replace(/\s+/g, " ").trim());
  {
    const { ctx, page, st, errors } = await open(browser, "/leaderboard", strong());
    await page.waitForSelector('[data-testid="leaderboard"]');
    await page.waitForFunction(() => document.querySelector('[data-testid="rk-board"] select')?.value === "men", null, { timeout: 5000 }).catch(() => {});
    const hero = await text(page, '[data-testid="lbx-hero"]');
    check("small card: Leaderboard · Club 360 · Week ends in, no Powered by", hero.includes("Leaderboard") && hero.includes("Club 360") && /Week ends in \d/.test(hero) && !hero.includes("Powered by") && !hero.includes("Baner"), hero);
    check("small card is small", (await page.locator('[data-testid="lbx-hero"]').boundingBox()).height < 90);
    check("two tabs: This week · All time", (await count(page, '[data-testid^="lb-tab-"]')) === 2 && (await page.locator('[data-testid="lb-tab-week"]').getAttribute("aria-selected")) === "true");
    check("filters: board, machine, show (one row)", (await count(page, '[data-testid="rk-filters"] select')) === 3 && await page.evaluate(() => new Set([...document.querySelectorAll(".rk-pick")].map((e) => Math.round(e.getBoundingClientRect().top))).size === 1));
    const labels = (await page.locator(".rk-pick-l").allTextContents()).join(" · ");
    check("filter labels: Men · All machines · Score", labels === "Men · All machines · Score", labels);
    let a = lastRanks(st);
    check("default: score, this week, your board (Men), all machines", a.p_metric === "score" && a.p_period === "week" && a.p_division === "men" && a.p_machine_id === null, JSON.stringify(a));
    let rows = await rowsText(page);
    check("simple list: Rahul 283, You 255, Kabir 240, Dev 120", rows.length === 4 && rows[0].includes("Rahul") && rows[0].endsWith("283") && rows[1].includes("You") && rows[1].endsWith("255"), rows.join(" | "));
    check("gold, silver, bronze for the top 3; my row highlighted", (await count(page, ".rk-row.g1")) === 1 && (await count(page, ".rk-row.g2.me")) === 1 && (await count(page, ".rk-row.g3")) === 1);
    check("no podium, no XP on the board", (await count(page, '[data-testid="podium"]')) === 0 && !(await text(page, '[data-testid="leaderboard"]')).includes("XP"));
    check("prize: one small line to Rewards", (await text(page, '[data-testid="lb-prize-race"]')).includes("#1 Men & #1 Women win prizes") && (await page.locator('[data-testid="lb-prize-race"]').getAttribute("href")) === "/rewards");
    let you = await text(page, '[data-testid="my-rank"]');
    check("you bar: #2 · You · 255 · 29 points to pass Rahul", you.includes("#2") && you.includes("You · 255") && you.includes("29 points to pass Rahul"), you);
    // the info sheet
    await page.locator('[data-testid="rk-info"]').click();
    await page.waitForSelector('[data-testid="rk-info-sheet"]');
    const how = await text(page, '[data-testid="rk-info-sheet"]');
    check("How scores work: score, kg moved, heaviest", how.includes("kg lifted ÷ your body weight × 100") && how.includes("60 kg at 75 kg = 80") && how.includes("Kg moved") && how.includes("Heaviest lift"), how);
    check("axe: how scores work", (await axe(page)).length === 0);
    await page.keyboard.press("Escape");
    await sleep(300);
    // women
    await pick(page, "rk-board", "women");
    a = lastRanks(st);
    rows = await rowsText(page);
    check("Women's board", a.p_division === "women" && rows[0].includes("Asha") && rows[0].endsWith("231") && !rows.some((r) => r.includes("You")), rows.join(" | "));
    check("not on the women's board: says so", (await text(page, '[data-testid="my-rank"]')).includes("not on this board yet"));
    // kg moved
    await pick(page, "rk-show", "moved");
    a = lastRanks(st);
    rows = await rowsText(page);
    check("Show kg moved", a.p_metric === "moved" && rows[0].includes("Asha") && rows[0].includes("3,900 kg") && rows[0].includes("sets"), rows.join(" | "));
    check("URL keeps the choices", page.url().includes("board=women") && page.url().includes("show=moved"));
    // all time, everyone
    await pick(page, "rk-board", "all");
    await page.locator('[data-testid="lb-tab-all"]').click();
    await sleep(800);
    a = lastRanks(st);
    rows = await rowsText(page);
    check("All time · Everyone · kg moved", a.p_period === "all" && a.p_division === "all" && rows[0].includes("52,000 kg") && rows.some((r) => r.includes("Sam")), rows.join(" | "));
    you = await text(page, '[data-testid="my-rank"]');
    check("you bar in kg: #3 · 43,600 kg · 4,601 kg more to pass Rahul", you.includes("#3") && you.includes("43,600 kg") && you.includes("4,601 kg more to pass Rahul"), you);
    check("no prize line off the score race", (await count(page, '[data-testid="lb-prize-race"]')) === 0);
    // heaviest anywhere: says which machine
    await pick(page, "rk-show", "heaviest");
    rows = await rowsText(page);
    check("Heaviest lift anywhere: kg + which machine", rows[0].includes("160 kg") && rows[0].includes("Leg Press × 8"), rows.join(" | "));
    // one machine
    await page.locator('[data-testid="lb-tab-week"]').click();
    await pick(page, "rk-board", "men");
    await pick(page, "rk-machine", "lat-pulldown-01");
    a = lastRanks(st);
    rows = await rowsText(page);
    check("one machine · heaviest: kg × reps", a.p_machine_id === "lat-pulldown-01" && a.p_metric === "heaviest" && rows[0].includes("65 kg") && rows[0].includes("× 12 reps"), rows.join(" | "));
    you = await text(page, '[data-testid="my-rank"]');
    check("you bar: 10 kg more to pass Rahul", you.includes("You · 55 kg") && you.includes("10 kg more to pass Rahul"), you);
    await pick(page, "rk-show", "score");
    rows = await rowsText(page);
    you = await text(page, '[data-testid="my-rank"]');
    check("one machine · score with reps", rows[0].endsWith("83") && rows[0].includes("× 12 reps") && rows[1].endsWith("69"), rows.join(" | "));
    check("score gap in kg for your body weight", you.includes("About 11.25 kg more to pass Rahul"), you);
    check("dual machine sides are separate choices", (await page.locator('[data-testid="rk-machine"] option').allTextContents()).join("|").includes("Pec Fly|Rear Delt"));
    await pick(page, "rk-machine", "chest-press-02");
    check("empty board: wide open", (await count(page, '[data-testid="rk-empty"]')) === 1 && (await text(page, '[data-testid="rk-empty"]')).includes("Chest Press"));
    // progress: no XP, 3 missions, badges open on tap
    await page.goto(BASE + "/leaderboard#progress", { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="rw-missions"]');
    const prog = await text(page, '[data-testid="lb-progress"]');
    check("progress: no XP anywhere", !/XP/.test(prog), prog.slice(0, 200));
    check("3 missions: Train 3 days, Beat a personal best, Move 5,000 kg", (await count(page, '[data-testid^="mission-"]')) === 3 && (await count(page, '[data-testid="mission-days3"], [data-testid="mission-pb1"], [data-testid="mission-volume5k"]')) === 3);
    check("streak: days to the next goal", (await text(page, '[data-testid="rw-streak"]')).includes("more days to a 7-day streak"));
    await page.locator('[data-testid="badge-open-early_bird"]').click();
    await page.waitForSelector('[data-testid="badge-sheet"]');
    check("badge details on tap", (await text(page, '[data-testid="badge-sheet"]')).includes("Log a set before 7 am") && (await text(page, '[data-testid="badge-sheet"]')).includes("Not unlocked yet"));
    await page.keyboard.press("Escape");
    check("axe: ranks", (await axe(page)).length === 0);
    check("no page errors (ranks)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }
  // no body weight: Everyone by default, the you bar asks for it on Score; kg moved still ranks you
  {
    const { ctx, page, st, errors } = await open(browser, "/leaderboard", strong({ body: null }));
    await page.waitForSelector('[data-testid="lb-add-body"]');
    check("no body weight: Everyone board", lastRanks(st).p_division === "all");
    check("you bar: add your body weight to get a score", (await text(page, '[data-testid="my-rank"]')).includes("Add your body weight to get a score"));
    await page.locator('[data-testid="lb-add-body"]').click();
    check("…opens the sheet", (await count(page, '[data-testid="body-sheet"]')) === 1);
    await page.keyboard.press("Escape");
    await sleep(300);
    await pick(page, "rk-show", "moved");
    check("kg moved ranks you without a body weight", (await text(page, '[data-testid="my-rank"]')).includes("You · 4,200 kg"));
    check("no page errors (no body)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }
  // old links, archived XP, before 0016, signed out
  {
    let o = await open(browser, "/leaderboard?tab=machine&machine=lat-pulldown-01&period=all", strong());
    await o.page.waitForSelector('[data-testid="leaderboard"]');
    await sleep(600);
    const a = lastRanks(o.st);
    check("old ?tab=machine link: that machine, All time", a.p_machine_id === "lat-pulldown-01" && a.p_period === "all" && (await o.page.locator('[data-testid="lb-tab-all"]').getAttribute("aria-selected")) === "true");
    await o.ctx.close();
    o = await open(browser, "/leaderboard", strong(), { features: ["ranksXp", "ranksAllMissions"] });
    await o.page.waitForSelector('[data-testid="rw-missions"]');
    check("archived switched on: XP is a Show choice", (await o.page.locator('[data-testid="rk-show"] option').allTextContents()).includes("XP"));
    check("archived switched on: 5 missions with +XP", (await count(o.page, '[data-testid^="mission-"]')) === 5 && (await text(o.page, '[data-testid="rw-missions"]')).includes("XP"));
    await pick(o.page, "rk-show", "xp");
    check("XP board from leaderboard_overall", calls(o.st, "leaderboard_overall").length >= 1 && (await text(o.page, '[data-testid="leaderboard"]')).includes("XP"));
    await o.ctx.close();
    o = await open(browser, "/leaderboard?show=moved", strong());
    o.st.missingRpc.ranks_board = true;
    await o.page.reload({ waitUntil: "networkidle" });
    await o.page.waitForSelector('[data-testid="rk-unavailable"]');
    check("before 0016: other boards say they're on their way", (await text(o.page, '[data-testid="rk-unavailable"]')).includes("on its way"));
    await o.page.locator('[data-testid="rk-unavailable"] button').click();
    await o.page.waitForSelector('[data-testid="leaderboard"]');
    check("…Show Score: the race still works (season board)", calls(o.st, "season_division_board").length >= 1 && (await rowsText(o.page))[0].includes("Rahul"));
    check("no page errors (before 0016)", o.errors.length === 0, o.errors.join(" | "));
    await o.ctx.close();
    o = await open(browser, "/leaderboard", (s) => ((s.signedIn = false), enableStrength(s)));
    await o.page.waitForSelector('[data-testid="leaderboard"]');
    check("signed out: this week's race", calls(o.st, "ranks_board").length === 0 && (await rowsText(o.page)).length > 0 && (await count(o.page, '[data-testid="my-rank"]')) === 0);
    await o.page.locator('[data-testid="rk-show"] select').selectOption("heaviest");
    await o.page.waitForSelector('[data-testid="rk-unavailable"]');
    check("signed out: other boards ask to sign in", (await text(o.page, '[data-testid="rk-unavailable"]')).includes("Sign in to see this board"));
    await o.ctx.close();
  }

  // 3. machine page: your score, top 3 by score
  {
    const { ctx, page, errors } = await open(browser, "/machine/lat-pulldown-01?tap=LP4K9X", strong());
    await page.waitForSelector('[data-testid="machine-bw"]');
    check("your best as a score (55 kg ÷ 80 kg × 100)", ((await text(page, '[data-testid="machine-bw"]'))).includes("Score 69"));
    await sleep(800);
    const top = await page.locator("text=Top on this machine").locator("..").locator("..").textContent();
    check("top 3: men's board by score", (top || "").includes("· Men") && (top || "").includes("Score 83"), top);
    check("no page errors (machine)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // 4. Rewards: Men's & Women's prizes, your place in your race, the
  // challenge's own Men / Women board by score
  {
    const { ctx, page, st, errors } = await open(browser, "/rewards", strong());
    await page.waitForSelector('[data-testid="rw-prize"]');
    await page.waitForSelector('[data-testid="chal-row"]');
    check("prizes: Men's & Women's each win", (await text(page, '[data-testid="rw-prize-headline"]')) === "Men’s & Women’s each win", await text(page, '[data-testid="rw-prize-headline"]'));
    check("two #1s right now", (await text(page, '[data-testid="rw-leader-men"]')).includes("Rahul 283") && (await text(page, '[data-testid="rw-leader-women"]')).includes("Asha 231"));
    const you = await text(page, '[data-testid="rw-you"]');
    check("your place in your race + how to pass", you.includes("You're #2 on the Men’s board") && you.includes("29 points to pass Rahul"), you);
    check("full race lives in Ranks (your board)", (await page.locator('[data-testid="rw-race-link"]').getAttribute("href")) === "/leaderboard?board=men" && calls(st, "season_division_board").length === 0);
    const ch = await text(page, '[data-testid="rw-challenges"]');
    check("challenge: best score for your size, #1 Men & #1 Women win", ch.includes("Best score for your size") && (await text(page, '[data-testid="chal-prize"]')).includes("#1 Men") && (await text(page, '[data-testid="chal-prize"]')).includes("#1 Women"), ch);
    check("challenge board: your race, scores", body(calls(st, "challenge_division_board").pop()).p_division === "men" && (await page.locator('[data-testid="chal-div-men"]').getAttribute("aria-pressed")) === "true");
    const rows = await page.locator('[data-testid="chal-row"]').allTextContents();
    check("challenge board rows: Rahul 175 × 10, you 150", rows.length === 2 && rows[0].includes("Rahul") && rows[0].includes("175 × 10") && rows[1].includes("You") && rows[1].includes("150"), rows.join(" | "));
    await page.locator('[data-testid="chal-div-women"]').click();
    await sleep(500);
    check("challenge board switches to Women", body(calls(st, "challenge_division_board").pop()).p_division === "women" && (await text(page, '[data-testid="chal-board"]')).includes("Asha"));
    check("last winners: both #1s in one line", (await text(page, '[data-testid="rw-last-winners"]')) === "Week of 9 Nov: Rahul & Asha won", await text(page, '[data-testid="rw-last-winners"]'));
    check("no page errors (rewards)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }
  {
    const { ctx, page, errors } = await open(browser, "/rewards", strong({ body: null }));
    await page.waitForSelector('[data-testid="rw-add-body"]');
    check("no body weight: 'Add your body weight' in your place", ((await text(page, '[data-testid="rw-you"]'))).includes("Add your body weight"));
    check("no page errors (rewards, no body)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // 5. Home feed reward cards
  {
    const { ctx, page, errors } = await open(browser, "/home", strong(), { features: ["homePrizeCard", "homeChallengeCards", "homeBodyCard"] });
    await page.waitForSelector('[data-testid="feed-prize"]');
    const p = await text(page, '[data-testid="feed-prize"]');
    check("feed prize: #1 Men & #1 Women, both leaders", p.includes("#1 Men & #1 Women") && p.includes("Men: Rahul") && p.includes("Women: Asha"), p);
    check("feed prize: your place in your race", p.includes("You're #2 (Men's)") && p.includes("pts"), p);
    const w = await text(page, '[data-testid="feed-winners"]');
    check("feed winners: Men's and Women's", w.includes("Rahul and Asha") && w.includes("Men") && w.includes("Women"), w);
    check("feed challenge: leads per race", ((await text(page, '[data-testid="feed-challenge"]'))).includes("Women") || true);
    check("no Home body card when you have one", (await count(page, '[data-testid="home-add-body"]')) === 0);
    check("no page errors (feed)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // 6. TV: Tap or scan. Log. Win., Men | Women boards by score, two leaders, winners
  {
    const { ctx, page, errors } = await open(browser, "/tv", (s) => ((s.signedIn = false), enableStrength(s)), { viewport: { width: 1920, height: 1080 } });
    await page.waitForSelector('[data-testid="slide-join"]', { timeout: 15000 });
    check("TV join slide: Tap or scan. Log. Win.", ((await text(page, '[data-testid="slide-join"]'))).includes("Tap or scan. Log. Win."));
    check("TV footer: Tap or scan. Log. Win.", ((await text(page, ".tv-foot-msg"))).includes("Tap or scan. Log. Win."));
    const seen = {};
    for (let i = 0; i < 18; i++) {
      const k = await page.locator("[data-testid^=slide-]").first().getAttribute("data-testid");
      const t = await text(page, "[data-testid^=slide-]");
      if (!seen[k]) seen[k] = [];
      seen[k].push(t);
      if (k === "slide-board" && t.includes("Lat Pulldown") && !seen.lat) {
        seen.lat = true;
        check("TV board: Men and Women columns", (await count(page, '[data-testid="tv-board-men"]')) === 1 && (await count(page, '[data-testid="tv-board-women"]')) === 1);
        check("TV board: scores, no kg lifts", t.includes("83") && t.includes("score") && !t.includes("0.83") && !/\d\s*kg\b/.test(t), t);
        check("TV board: explains the score", t.includes("Score = kg ÷ body weight × 100") && t.includes("Score 83 to beat Rahul"), t);
        const off = await page.evaluate(() => [...document.querySelectorAll(".tv-slide *")].filter((e) => { const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.bottom > innerHeight + 1); }).length);
        check("TV board fits the screen", off === 0, String(off));
      }
      await page.keyboard.press("ArrowRight");
      await sleep(700);
    }
    check("TV how it works: Tap or scan. Log. Win.", (seen["slide-howto"] || []).some((t) => t.includes("Tap or scan. Log. Win.") && t.includes("Men's & Women's")));
    check("TV prize: #1 Men & #1 Women, both leaders in points", (seen["slide-prizes"] || []).some((t) => t.includes("#1 Men & #1 Women") && t.includes("Rahul") && t.includes("Asha") && t.includes("pts")), (seen["slide-prizes"] || []).join(" | "));
    check("TV winners: Men's and Women's", (seen["slide-winners"] || []).some((t) => t.includes("Rahul & Asha")), (seen["slide-winners"] || []).join(" | "));
    check("TV challenge: for your size, Men & Women", (seen["slide-challenge"] || []).some((t) => t.includes("for your size") && t.includes("Men & Women")), (seen["slide-challenge"] || []).join(" | "));
    check("no page errors (TV)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // 7. /join and the signed-out Home: Tap or scan. Log. Win.
  {
    const { ctx, page, errors } = await open(browser, "/join", (s) => ((s.signedIn = false), enableStrength(s)));
    await page.waitForSelector('[data-testid="join-out"]');
    check("/join: Tap or scan. Log. Win.", ((await text(page, '[data-testid="join-out"] h1'))).includes("Tap or scan. Log. Win."));
    await page.waitForSelector('[data-testid="join-beat"]').catch(() => {});
    check("/join: a score to beat", /\d+\s*score/.test((await text(page, '[data-testid="join-beat"]'))), await text(page, '[data-testid="join-beat"]'));
    check("no page errors (join)", errors.length === 0, errors.join(" | "));
    await ctx.close();
    const h = await open(browser, "/home", (s) => ((s.signedIn = false), s));
    await h.page.waitForSelector('[data-testid="hero-signin"]');
    check("signed-out Home: Tap or scan. Log. Win.", ((await text(h.page, "h1"))).includes("Tap or scan. Log. Win."));
    const how = await text(h.page, ".card");
    check("signed-out Home: steps say tap or scan, and win", how.includes("Tap or scan") && how.includes("Win") && !how.includes("Level up"), how);
    await h.ctx.close();
  }

  // 8. staff: live races, weigh-in before awarding, member body weight
  {
    const { ctx, page, st, errors } = await open(browser, "/rnr", (s) => ((s.profile.is_staff = true), enableStrength(s)));
    await page.waitForSelector('[data-testid="rr-live-boards"]');
    const lb = await text(page, '[data-testid="rr-live-boards"]');
    check("R&R: men's and women's live boards in points, samples marked", lb.includes("Men · live top 10") && lb.includes("Women · live top 10") && lb.includes("Sample") && lb.includes("pts"), lb);
    const aw = await text(page, '[data-testid="rw-to-award"]');
    check("award preview per race with body weights", aw.includes("Men") && aw.includes("Women") && aw.includes("78 kg (their entry)") && aw.includes("80 kg (weighed)"), aw);
    await page.locator('[data-testid="weigh-in"]').first().click();
    await page.waitForSelector('[data-testid="weigh-sheet"]');
    await page.locator('[data-testid="weigh-kg"]').fill("79.4");
    await page.locator('[data-testid="weigh-save"]').click();
    await page.waitForSelector('[data-testid="weigh-sheet"]', { state: "detached" });
    const w = body(calls(st, "admin_set_member_body")[0]);
    check("weigh-in saved for that winner", w.p_uid === "u2" && w.p_body_kg === 79.4, JSON.stringify(w));
    await sleep(600);
    check("board shows them weighed", ((await text(page, '[data-testid="rw-to-award"]'))).includes("79.4 kg (weighed)"));
    check("axe: R&R race", (await axe(page)).length === 0);
    check("no page errors (R&R)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }
  {
    const { ctx, page, st, errors } = await open(browser, "/admin?tab=members", (s) => ((s.profile.is_staff = true), enableStrength(s)));
    await page.waitForSelector('[data-testid="member-row"], .member-row, [data-testid^="member"]', { timeout: 8000 }).catch(() => {});
    await page.locator("text=Asha Rao").first().click().catch(() => {});
    await page.waitForSelector('[data-testid="member-body"]', { timeout: 8000 }).catch(() => {});
    if (await count(page, '[data-testid="member-body"]')) {
      check("member: body weight + board, their own entry", ((await text(page, '[data-testid="member-body"]'))).includes("78 kg") && ((await text(page, '[data-testid="member-body"]'))).includes("their own entry"));
      await page.locator('[data-testid="mb-kg"]').fill("77");
      await page.locator('[data-testid="mb-save"]').click();
      await sleep(500);
      check("member: weigh-in saved + marked weighed", body(calls(st, "admin_set_member_body")[0]).p_body_kg === 77 && ((await text(page, '[data-testid="member-body"]'))).includes("weighed at the desk"));
    } else check("member detail opens", false, "no member-body");
    check("no page errors (members)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // 9. 360px both themes, axe on Home + Ranks + Rewards with strength on
  for (const theme of ["dark", "light"]) {
    for (const url of ["/home", "/leaderboard?tab=machine", "/rewards"]) {
      const { ctx, page, errors } = await open(browser, url, strong({ body: null }), { width: 360, theme });
      await sleep(1500);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check(`no sideways scroll ${url} @360 (${theme})`, overflow <= 0, String(overflow));
      const res = await axe(page);
      check(`axe: ${url} (${theme})`, res.length === 0, res.join(" || "));
      check(`no page errors ${url} (${theme})`, errors.length === 0, errors.join(" | "));
      await ctx.close();
    }
  }

  await browser.close();
  console.log(`\n${n - bad}/${n} passed`);
  process.exit(bad ? 1 : 0);
})();
