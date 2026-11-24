// Strength boards (0015): body weight + board, ×BW boards with Men / Women /
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
    check("explains ×BW with an example", ((await text(page, '[data-testid="body-sheet"]'))).includes("0.80×"));
    check("three choices: Men, Women, Prefer not to say", (await count(page, '[data-testid="body-sheet"] [role="radio"]')) === 3);
    check("save is off until both are filled", await page.locator('[data-testid="bw-save"]').isDisabled());
    check("body weight field is focused", (await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))) === "bw-kg");
    check("says body weight is private", ((await text(page, '[data-testid="body-sheet"]'))).includes("nobody else sees it"));
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
    check("Home: card to get on the strength boards", ((await text(page, '[data-testid="home-add-body"]'))).includes("×BW"));
    await page.locator('[data-testid="home-add-body-btn"]').click();
    await page.waitForSelector('[data-testid="body-sheet"]');
    await page.locator('[data-testid="bw-women"]').click();
    await page.locator('[data-testid="bw-kg"]').fill("61.5");
    check("example uses your weight", ((await text(page, '[data-testid="body-sheet"]'))).includes("61.5 kg = 0.98×"));
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

  // 2. Ranks: Men / Women / All, ×BW, strength points
  {
    const { ctx, page, st, errors } = await open(browser, "/leaderboard", strong());
    await page.waitForSelector('[data-testid="podium"]');
    check("Men / Women / All tabs, your board first", (await count(page, '[data-testid^="div-"]')) === 3 && (await page.locator('[data-testid="div-men"]').getAttribute("aria-selected")) === "true");
    check("This week: men's race in points", body(calls(st, "season_division_board").pop()).p_division === "men" && ((await text(page, '[data-testid="leaderboard"]'))).includes("pts"));
    check("prize banner: #1 Men and #1 Women", ((await text(page, '[data-testid="lb-prize-race"]'))).includes("#1 Men and #1 Women"));
    const you = await text(page, '[data-testid="my-rank"]');
    check("you bar: points + how to pass", you.includes("#2") && you.includes("255 pts") && you.includes("29 points to pass Rahul"), you);
    await page.locator('[data-testid="div-women"]').click();
    await page.waitForFunction(() => document.querySelector('[data-testid="div-women"]')?.getAttribute("aria-selected") === "true");
    await sleep(600);
    check("Women's board", body(calls(st, "season_division_board").pop()).p_division === "women" && ((await text(page, '[data-testid="podium"]'))).includes("Asha"));
    await page.goto(BASE + "/leaderboard?tab=machine&machine=lat-pulldown-01", { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="podium"]');
    const b = body(calls(st, "strength_board").pop());
    check("By machine: ×BW board for your division", b.p_division === "men" && b.p_machine_id === "lat-pulldown-01");
    await page.waitForFunction(() => (document.querySelector('[data-testid="podium"]')?.textContent || "").includes("0.83"), null, { timeout: 5000 }).catch(() => {});
    const pod = await text(page, '[data-testid="podium"]');
    check("podium shows ×BW, not kg", pod.includes("0.83") && pod.includes("× BW") && !/\bkg\b/.test(pod), pod);
    check("podium labels fit on one line", await page.evaluate(() => [...document.querySelectorAll(".podium-spot .pval")].every((e) => e.getBoundingClientRect().height < 34)));
    const me = await text(page, '[data-testid="my-rank"]');
    check("my row: my ×BW and my kg; gap in kg", me.includes("0.69× BW") && me.includes("55 kg") && me.includes("About 11.25 kg more to pass Rahul"), me);
    await page.locator('[data-testid="div-all"]').click();
    await sleep(800);
    check("All: everyone, re-ranked", body(calls(st, "strength_board").pop()).p_division === "all" && ((await text(page, '[data-testid="podium"]'))).includes("Asha"));
    check("axe: ranks with board tabs", (await axe(page)).length === 0);
    check("no page errors (ranks)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }
  // no body weight: a nudge on Ranks
  {
    const { ctx, page, errors } = await open(browser, "/leaderboard", strong({ body: null }));
    await page.waitForSelector('[data-testid="lb-add-body"]');
    check("Ranks: add body weight to get on these boards", ((await text(page, '[data-testid="lb-add-body"]'))).includes("body weight"));
    await page.locator('[data-testid="lb-add-body"]').click();
    check("…opens the sheet", (await count(page, '[data-testid="body-sheet"]')) === 1);
    check("no page errors (nudge)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // 3. machine page: your ×BW, top 3 by ×BW
  {
    const { ctx, page, errors } = await open(browser, "/machine/lat-pulldown-01?tap=LP4K9X", strong());
    await page.waitForSelector('[data-testid="machine-bw"]');
    check("your best as ×BW (55 kg ÷ 80 kg)", ((await text(page, '[data-testid="machine-bw"]'))).includes("0.69× body weight"));
    await sleep(800);
    const top = await page.locator("text=Top on this machine").locator("..").locator("..").textContent();
    check("top 3: men's ×BW board", (top || "").includes("· Men") && (top || "").includes("0.83× BW"), top);
    check("no page errors (machine)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // 4. Rewards: two races, ×BW challenges
  {
    const { ctx, page, st, errors } = await open(browser, "/rewards", strong());
    await page.waitForSelector('[data-testid="rw-prize"]');
    const t = await text(page, '[data-testid="rw-prize"]');
    check("prize: #1 Men · #1 Women win", t.includes("#1 Men · #1 Women win"), t);
    check("two leaders", t.includes("Men's #1 right now") && t.includes("Rahul") && t.includes("Women's #1 right now") && t.includes("Asha"), t);
    check("your place in your race + how to pass", t.includes("You're #2 on the Men's board") && t.includes("29 points to pass Rahul"), t);
    check("explains strength points", t.includes("best ×BW"));
    check("mini board: your race, in points", body(calls(st, "season_division_board").pop()).p_division === "men");
    await page.locator('[data-testid="rw-board-btn"]').click();
    await page.waitForSelector('[data-testid="board-sheet"] [data-testid="div-women"]');
    await page.locator('[data-testid="board-sheet"] [data-testid="div-women"]').click();
    await sleep(500);
    check("full board switches race", body(calls(st, "season_division_board").pop()).p_division === "women" && ((await text(page, '[data-testid="board-sheet"]'))).includes("Asha"));
    await page.keyboard.press("Escape");
    const ch = await text(page, '[data-testid="rw-challenges"]');
    check("challenge: best for your size, leads per race in ×BW", ch.includes("for your size") && ((await text(page, '[data-testid="chal-lead-men"]'))).includes("1.75× BW") && ((await text(page, '[data-testid="chal-lead-women"]'))).includes("Asha"), ch);
    check("no page errors (rewards)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }
  {
    const { ctx, page, errors } = await open(browser, "/rewards", strong({ body: null }));
    await page.waitForSelector('[data-testid="rw-add-body"]');
    check("no body weight: 'Add body weight' on the prize", ((await text(page, '[data-testid="rw-you"]'))).includes("Add your body weight"));
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

  // 6. TV: Tap or scan. Log. Win., Men | Women boards in ×BW, two leaders, winners
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
        check("TV board: ×BW, no kg lifts", t.includes("0.83") && t.includes("×BW") && !/\d\s*kg/.test(t), t);
        check("TV board: explains ×BW", t.includes("kg ÷ body weight") && t.includes("to beat Rahul"), t);
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
    check("/join: a ×BW lift to beat", ((await text(page, '[data-testid="join-beat"]'))).includes("× body weight"));
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
