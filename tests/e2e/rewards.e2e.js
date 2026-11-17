// Rewards (/rewards), the Home teaser, log-page bonus toasts and Staff ->
// Rewards (mocked backend). Run: see tests/README.md
const { chromium } = require("playwright");
const fs = require("fs");
const { defaultState, setup } = require("./mock");
const BASE = process.env.BASE_URL || "http://localhost:3111";
let n = 0, bad = 0;
const check = (name, ok, extra = "") => { n++; if (!ok) bad++; console.log(ok ? "PASS" : "FAIL", name, ok ? "" : extra); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const staff = (s) => ((s.profile.is_staff = true), s);

async function open(browser, url, mut = (s) => s, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: opts.width || 390, height: 844 }, deviceScaleFactor: 1, timezoneId: "Asia/Kolkata", colorScheme: "dark" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  if (opts.theme) await page.addInitScript((t) => localStorage.setItem("racked:theme", t), opts.theme);
  const st = mut(defaultState()) || defaultState();
  await setup(ctx, page, st, BASE);
  await page.goto(BASE + url, { waitUntil: "networkidle" }).catch(() => {});
  return { ctx, page, st, errors };
}
const rpc = (st, name) => st.calls.filter((c) => c.startsWith("POST rpc/" + name));
const text = async (page, sel) => ((await page.locator(sel).first().textContent()) || "").replace(/\s+/g, " ").trim();

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });

  // 1. member: the whole page
  {
    const { ctx, page, st, errors } = await open(browser, "/rewards", (s) => ((s.rewards.syncAwards = [{ kind: "badge", id: "regular", title: "Regular", xp: 75 }]), s));
    await page.waitForSelector('[data-testid="rw-wallet"]');
    check("syncs bonus XP on open", rpc(st, "sync_my_rewards").length >= 1);
    check("new badge toast", (await page.locator(".toast").allTextContents()).some((t) => t.includes("Badge unlocked: Regular · +75 XP")));
    check("wallet: XP to spend", (await text(page, '[data-testid="rw-balance"]')).includes("1,540"));
    check("wallet: XP on hold shown", (await text(page, '[data-testid="rw-on-hold"]')).includes("60"));
    check("wallet: spending never lowers level", (await text(page, '[data-testid="rw-wallet"]')).includes("never lowers your level"));
    check("Rewards tab active", (await page.locator('.bottom-nav a[aria-current="page"]').getAttribute("href")) === "/rewards");
    const season = await text(page, '[data-testid="rw-season"]');
    check("race: title + countdown", season.includes("Week of 16 Nov") && /\d+d \d+h/.test(await text(page, '[data-testid="rw-countdown"]')));
    check("race: my rank and gap to the next person", (await text(page, '[data-testid="rw-myrank"]')).includes("#3") && (await text(page, '[data-testid="rw-myrank"]')).includes("41 XP to pass Rahul"));
    check("race: prizes with partner names", season.includes("Gift hamper") && season.includes("#2–5") && season.includes("Jersey Drip × The Clean Crate"));
    check("race: top 5 with me marked", (await page.locator(".rw-mini-board li").count()) === 5 && (await text(page, ".rw-mini-board li.me")).includes("Omi (you)"));
    check("race: first names only", !season.includes("Rao") && !season.includes("@"));
    await page.locator('[data-testid="rw-board-btn"]').click();
    await page.waitForSelector('[data-testid="board-sheet"] .rw-board li');
    check("full board sheet lists everyone", (await page.locator('[data-testid="board-sheet"] .rw-board li').count()) === 6);
    await page.keyboard.press("Escape");
    check("missions: 2 done, progress shown", (await page.locator(".rw-mission-list li.done").count()) === 2 && (await text(page, '[data-testid="mission-sets15"]')).includes("9 / 15"));
    check("missions: volume progress in kg", (await text(page, '[data-testid="mission-volume5k"]')).includes("4,200 / 5,000 kg"));
    check("streak: 3 days, next bonus", (await text(page, '[data-testid="rw-streak"]')).includes("3-day lifting streak") && (await text(page, '[data-testid="rw-streak"]')).includes("4 more days for +75 XP"));
    const ch = await text(page, '[data-testid="challenge-3"]');
    check("challenge: sponsor, goal, leader, me", ch.includes("The Clean Crate challenge") && ch.includes("Heaviest set · Leg Press") && ch.includes("Rahul · 140 kg × 10") && ch.includes("#2 · 120 kg × 12"));
    check("challenge: links to the machine", (await page.locator('[data-testid="challenge-3"] a[href="/machine/leg-press-08"]').count()) === 1);
    check("your rewards: prize with code, above the race", (await text(page, '[data-testid="rw-mine"]')).includes("RK-7F3A2C") &&
      (await page.evaluate(() => document.querySelector('[data-testid="rw-mine"]').getBoundingClientRect().top < document.querySelector('[data-testid="rw-season"]').getBoundingClientRect().top)));
    // shop states
    check("shop: affordable item can be redeemed", await page.locator('[data-testid="redeem-11"]').isEnabled());
    check("shop: too expensive shows XP to go", (await text(page, '[data-testid="redeem-13"]')).includes("1,460 XP to go") && !(await page.locator('[data-testid="redeem-13"]').isEnabled()));
    check("shop: sold out", (await text(page, '[data-testid="redeem-14"]')).includes("All gone"));
    check("shop: stock left badge", (await text(page, '[data-testid="shop-11"]')).includes("18 left"));
    // redeem
    await page.locator('[data-testid="redeem-11"]').click();
    await page.waitForSelector('[data-testid="redeem-sheet"]');
    check("confirm shows the maths", (await text(page, '[data-testid="redeem-sheet"]')).includes("= 940 XP left"));
    await page.locator('[data-testid="redeem-confirm"]').click();
    await page.waitForSelector('[data-testid="redeem-result"]');
    check("redeem sends the reward id", (rpc(st, "redeem_reward")[0] || "").includes('"p_reward_id":11'));
    check("result: claim code + desk hint", (await text(page, '[data-testid="redeem-code"]')).includes("RK-4D21FA") && (await text(page, '[data-testid="redeem-result"]')).includes("front desk"));
    await page.getByRole("button", { name: "Done" }).click();
    await sleep(700);
    check("balance drops after redeeming", (await text(page, '[data-testid="rw-balance"]')).includes("940"));
    check("item now shows Claimed", (await text(page, '[data-testid="redeem-11"]')).includes("Claimed"));
    // error from the server is shown in the sheet
    st.rewards.my.claimed_rewards = {};
    st.rewards.my.wallet.balance = 5000;
    st.rewards.overview.shop[1].xp_cost = 99999;
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await sleep(900);
    // badges + partners
    check("badges: 3 of 9 unlocked", (await page.locator(".rw-badges li.got").count()) === 3 && (await text(page, '[data-testid="rw-badges"]')).includes("3/9 unlocked"));
    check("partners: both brands with products", (await page.locator('[data-testid="partner-jersey-drip"] .rw-product').count()) === 2 && (await page.locator('[data-testid="partner-clean-crate"] .rw-product').count()) === 2);
    const href = await page.locator('[data-testid="visit-clean-crate"]').getAttribute("href");
    check("partner links carry utm tags", href.includes("utm_source=racked") && href.includes("utm_campaign=rewards") && href.startsWith("https://www.thecleancratefoods.com"));
    check("partner links open in a new tab safely", (await page.locator('[data-testid="visit-clean-crate"]').getAttribute("target")) === "_blank" && (await page.locator('[data-testid="visit-clean-crate"]').getAttribute("rel")).includes("noopener"));
    const [popup] = await Promise.all([ctx.waitForEvent("page"), page.locator('[data-testid="visit-clean-crate"]').click()]);
    await popup.close().catch(() => {});
    await sleep(300);
    check("partner click counted", (rpc(st, "track_sponsor_click")[0] || "").includes('"p_sponsor_id":"clean-crate"'));
    check("last winners", (await text(page, '[data-testid="rw-winners"]')).includes("Week of 9 Nov"));
    check("brand partnership CTA", (await page.locator('[data-testid="rw-brand-cta"]').getAttribute("href")).includes("instagram.com/bijlee.run"));
    await page.getByRole("button", { name: "How XP works" }).click();
    check("How XP works sheet", (await text(page, '[data-testid="how-xp-sheet"]')).includes("Fair play"));
    await page.keyboard.press("Escape");
    const body = (await page.locator("body").textContent()) || "";
    check("no emails on the page", !body.includes("@example.com"));
    check("no page errors (rewards)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // 2. redeem refused by the server -> message in the sheet
  {
    const { ctx, page, st } = await open(browser, "/rewards", (s) => ((s.rewards.my.wallet.balance = 5000), s));
    await page.waitForSelector('[data-testid="redeem-12"]');
    st.rewards.my.wallet.balance = 10; // someone spent it elsewhere meanwhile
    await page.locator('[data-testid="redeem-12"]').click();
    await page.locator('[data-testid="redeem-confirm"]').click();
    await page.waitForSelector('[data-testid="redeem-error"]');
    check("server refusal explained", (await text(page, '[data-testid="redeem-error"]')).includes("more XP"));
    await ctx.close();
  }

  // 3. signed out
  {
    const { ctx, page, st, errors } = await open(browser, "/rewards", (s) => ((s.signedIn = false), s));
    await page.waitForSelector('[data-testid="rw-signin"]');
    check("signed out: sign-in card instead of wallet", (await page.locator('[data-testid="rw-wallet"]').count()) === 0);
    check("signed out: no member calls", rpc(st, "my_rewards").length === 0 && rpc(st, "sync_my_rewards").length === 0);
    check("signed out: prizes + shop still visible", (await text(page, '[data-testid="rw-season"]')).includes("Gift hamper") && (await page.locator(".rw-item").count()) === 4);
    check("signed out: redeem asks to sign in", (await text(page, '[data-testid="redeem-11"]')).includes("Sign in"));
    await page.locator('[data-testid="redeem-11"]').click();
    check("signed out: sign-in sheet opens", (await page.locator('[data-testid="signin-sheet"]').count()) === 1);
    check("no page errors (signed out)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // 4. database update not run yet
  {
    const { ctx, page, errors } = await open(browser, "/rewards", (s) => ((s.missingRpc.rewards_overview = true), (s.missingRpc.my_rewards = true), (s.missingRpc.sync_my_rewards = true), s));
    await page.waitForSelector('[data-testid="rw-soon"]');
    check("before 0011: friendly 'on the way' card", (await text(page, '[data-testid="rw-soon"]')).includes("on the way"));
    check("no page errors (no 0011)", errors.length === 0, errors.join(" | "));
    await ctx.close();
    const h = await open(browser, "/home", (s) => ((s.missingRpc.my_rewards = true), (s.missingRpc.sync_my_rewards = true), s));
    await h.page.waitForSelector('[data-testid="tile-week"]');
    check("before 0011: home has no rewards teaser", (await h.page.locator('[data-testid="rw-teaser"]').count()) === 0);
    check("before 0011: home still fine", h.errors.length === 0, h.errors.join(" | "));
    await h.ctx.close();
  }

  // 5. home: machines card, teaser, prize card
  {
    const { ctx, page, errors } = await open(browser, "/home");
    await page.waitForSelector('[data-testid="rw-teaser"]');
    check("home: all machines card", (await page.locator('[data-testid="machines-card"]').getAttribute("href")) === "/machines");
    check("home: XP + race position", (await text(page, '[data-testid="rw-teaser"]')).includes("1,540 XP to spend") && (await text(page, '[data-testid="rw-teaser"]')).includes("#3 in Week of 16 Nov"));
    check("home: 'You won' card with code", (await text(page, '[data-testid="rw-won-card"]')).includes("RK-7F3A2C"));
    await page.locator('[data-testid="machines-card"]').click();
    await page.waitForURL(/\/machines$/);
    check("Home tab stays active on /machines", (await page.locator('.bottom-nav a[aria-current="page"]').getAttribute("href")) === "/home");
    check("no page errors (home)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // 6. logging a set pays mission XP with a toast
  {
    const { ctx, page, st } = await open(browser, "/machine/lat-pulldown-01/log?tap=LP4K9X", (s) => ((s.rewards.syncAwards = [{ kind: "mission", id: "sets15", title: "Log 15 sets", xp: 60 }]), s));
    await page.waitForSelector('[data-testid="log-submit"]');
    st.rewards.syncAwards = [{ kind: "mission", id: "sets15", title: "Log 15 sets", xp: 60 }];
    await page.locator('[data-testid="log-submit"]').click();
    await sleep(2000);
    const toasts = (await page.locator(".toast").allTextContents()).join(" | ");
    check("log: syncs after the set", rpc(st, "sync_my_rewards").length >= 1);
    check("log: mission toast", toasts.includes("Mission complete: Log 15 sets · +60 XP"), toasts);
    await ctx.close();
  }

  // 7. staff -> Rewards
  {
    const { ctx, page, st, errors } = await open(browser, "/admin?tab=rewards", staff);
    await page.waitForSelector('[data-testid="tab-rewards"]');
    check("staff: live board with flagged warning", (await text(page, '[data-testid="rw-admin-season"]')).includes("1 to review"));
    check("staff: ended season ready to award", (await page.locator('[data-testid="rw-to-award"]').count()) === 1 && (await text(page, '[data-testid="rw-to-award"]')).includes("still has sets waiting in Review"));
    await page.locator('[data-testid="award-season"]').click();
    await page.locator('[data-testid="confirm-sheet"] .btn-yellow, [data-testid="confirm-sheet"] button:has-text("Award prizes")').last().click();
    await sleep(700);
    check("staff: award sends the season", (rpc(st, "admin_award_season")[0] || "").includes('"p_season_id":6'));
    check("staff: awarded season leaves the list", (await page.locator('[data-testid="rw-to-award"]').count()) === 0);
    await page.locator('[data-testid="period-month"]').click();
    await sleep(500);
    check("staff: switch to monthly", (rpc(st, "admin_set_season_period")[0] || "").includes('"p_period":"month"'));
    await page.locator('[data-testid="edit-prizes"]').click();
    await page.waitForSelector('[data-testid="prize-editor"]');
    await page.locator("#pn-0").fill("Mega hamper");
    await page.getByRole("button", { name: "+ Add a prize" }).click();
    await page.locator("#pn-2").fill("Free protein shake");
    await page.locator('[data-testid="save-prizes"]').click();
    await sleep(600);
    const saved = rpc(st, "admin_save_prizes")[0] || "";
    check("staff: prizes saved (3 rows, new one at #6)", saved.includes("Mega hamper") && saved.includes('"rank_from":6') && saved.includes("Free protein shake"), saved.slice(0, 300));
    // hand out
    await page.locator('[data-testid="rw-sec-handout"]').click();
    await page.waitForSelector('[data-testid="handout-row"]');
    await page.locator("#rw-code-search").fill("91bc");
    check("staff: find by claim code", (await page.locator('[data-testid="handout-row"]').count()) === 1);
    await page.locator('[data-testid="hand-over"]').click();
    await sleep(600);
    check("staff: handed over", (rpc(st, "admin_update_redemption")[0] || "").includes('"p_status":"fulfilled"'));
    // shop
    await page.locator('[data-testid="rw-sec-shop"]').click();
    await page.waitForSelector('[data-testid="admin-reward"]');
    await page.locator('[data-testid="admin-reward"]').nth(3).locator('[data-testid="toggle-reward"]').click();
    await sleep(500);
    check("staff: switch a reward on", (rpc(st, "admin_save_reward")[0] || "").includes('"active":true'));
    await page.locator('[data-testid="admin-reward"]').nth(1).getByRole("button", { name: "Codes" }).click();
    await page.getByRole("tab", { name: "Unique codes" }).click();
    await page.locator('[data-testid="codes-sheet"] textarea').fill("JD-1\nJD-2\nJD-3");
    await page.locator('[data-testid="save-codes"]').click();
    await sleep(500);
    check("staff: paste unique codes", (rpc(st, "admin_add_reward_codes")[0] || "").includes('"p_shared":false') && (rpc(st, "admin_add_reward_codes")[0] || "").includes("JD-3"));
    await page.locator('[data-testid="new-reward"]').click();
    await page.locator("#rf-title").fill("Shaker bottle");
    await page.locator("#rf-xp").fill("800");
    await page.locator('[data-testid="save-reward"]').click();
    await sleep(500);
    check("staff: new reward saved (starts off)", (rpc(st, "admin_save_reward").pop() || "").includes('"title":"Shaker bottle"') && (rpc(st, "admin_save_reward").pop() || "").includes('"active":false'));
    // challenges
    await page.locator('[data-testid="rw-sec-challenges"]').click();
    await page.locator('[data-testid="new-challenge"]').click();
    await page.locator("#cf-title").fill("Jersey Drip Deadlift Day");
    await page.locator("#cf-machine").selectOption("deadlift-10");
    await page.locator('[data-testid="save-challenge"]').click();
    await sleep(500);
    const chs = rpc(st, "admin_save_challenge")[0] || "";
    check("staff: new challenge on a machine", chs.includes("Deadlift Day") && chs.includes('"machine_id":"deadlift-10"') && chs.includes('"ends_at":"20'), chs.slice(0, 300));
    // partners
    await page.locator('[data-testid="rw-sec-partners"]').click();
    await page.waitForSelector('[data-testid="sponsor-stats"]');
    check("staff: sponsor click stats", (await text(page, '[data-testid="sponsor-stats"]')).includes("clicks · 7 days"));
    await page.locator('[data-testid="new-sponsor"]').click();
    await page.locator("#sf-name").fill("Fast&Up");
    await page.locator('[data-testid="save-sponsor"]').click();
    await sleep(500);
    check("staff: new brand gets a clean id", (rpc(st, "admin_save_sponsor")[0] || "").includes('"id":"fast-up"'));
    check("no page errors (staff rewards)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // 8. staff before 0011
  {
    const { ctx, page } = await open(browser, "/admin?tab=rewards", (s) => (staff(s), (s.missingRpc.admin_rewards_data = true), s));
    await page.waitForSelector('[data-testid="needs-0011"]');
    check("staff: asks to run 0011", (await text(page, '[data-testid="needs-0011"]')).includes("0011_rewards.sql"));
    await ctx.close();
  }

  // 9. 360px + axe on the Rewards page, both themes, signed in and out
  const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
  for (const [theme, out] of [["dark", false], ["light", false], ["dark", true]]) {
    const { ctx, page, errors } = await open(browser, "/rewards", (s) => ((s.signedIn = !out), s), { width: 360, theme });
    await sleep(1000);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`rewards @360 no sideways scroll (${theme}${out ? ", signed out" : ""})`, overflow <= 0, String(overflow));
    await page.addScriptTag({ content: axeSrc });
    const res = await page.evaluate(async () => {
      // eslint-disable-next-line no-undef
      const r = await axe.run(document, { runOnly: ["wcag2a", "wcag2aa"], resultTypes: ["violations"] });
      return r.violations.filter((v) => ["serious", "critical"].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((x) => x.target.join(" ")).join(", ")}`);
    });
    check(`rewards axe (${theme}${out ? ", signed out" : ""})`, res.length === 0, res.join(" || "));
    check(`no page errors @360 (${theme})`, errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  await browser.close();
  console.log(`${n - bad}/${n} passed`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
