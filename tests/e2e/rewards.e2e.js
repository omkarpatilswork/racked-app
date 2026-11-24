// Rewards (/rewards: Win / Partners; the XP Shop is archived), Ranks (/leaderboard), the Home
// cards, the Profile gym card, log-page bonus toasts and R&R Controls (/rnr),
// against the mocked backend. Run: see tests/README.md
const { chromium } = require("playwright");
const fs = require("fs");
const { defaultState, setup } = require("./mock");
const BASE = process.env.BASE_URL || "http://localhost:3111";
let n = 0, bad = 0;
const check = (name, ok, extra = "") => { n++; if (!ok) bad++; console.log(ok ? "PASS" : "FAIL", name, ok ? "" : extra); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const staff = (s) => ((s.profile.is_staff = true), s);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

async function open(browser, url, mut = (s) => s, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: opts.width || 390, height: 844 }, deviceScaleFactor: 1, timezoneId: "Asia/Kolkata", colorScheme: "dark" });
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
const rpc = (st, name) => st.calls.filter((c) => c.startsWith("POST rpc/" + name));
const text = async (page, sel) => ((await page.locator(sel).first().textContent()) || "").replace(/\s+/g, " ").trim();

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });

  // 1. Win tab (Rewards v2): prizes, your place, one challenge, last week
  {
    const { ctx, page, st, errors } = await open(browser, "/rewards", (s) => ((s.rewards.syncAwards = [{ kind: "badge", id: "regular", title: "Regular", xp: 75 }]), s));
    await page.waitForSelector('[data-testid="rw-prize"]');
    await page.waitForSelector('[data-testid="chal-row"]');
    check("syncs rewards on open", rpc(st, "sync_my_rewards").length >= 1);
    const toasts = (await page.locator(".toast").allTextContents()).join(" | ");
    check("new badge toast, no XP", toasts.includes("Badge unlocked: Regular") && !toasts.includes("XP"), toasts);
    check("gym shown: Rewards at Club 360", (await text(page, '.rw-head [data-testid="gym-mark"]')).includes("Club 360") && (await text(page, ".rw-head")).includes("Baner, Pune"));
    check("no XP anywhere on Rewards", (await page.locator('[data-testid="rw-xp-chip"]').count()) === 0 && !(await text(page, ".rw-page")).includes("XP"), await text(page, ".rw-page"));
    check("two tabs: Win, Partners (Shop archived)", (await page.locator(".rw-tabs [role=tab]").allTextContents()).map((t) => t.trim()).join(",") === "Win,Partners");
    check("Rewards nav tab active", (await page.locator('.bottom-nav a[aria-current="page"]').getAttribute("href")) === "/rewards");
    const prize = await text(page, '[data-testid="rw-prize"]');
    check("prizes: title + countdown", /This week.s prizes/.test(prize) && (await text(page, '[data-testid="rw-prize-headline"]')) === "Top of the week wins" && /\d+d \d+h left/.test(await text(page, '[data-testid="rw-countdown"]')), prize);
    check("#1 big: name + brand", (await text(page, '[data-testid="prize-1"] .rw2-rank')) === "#1" && (await text(page, '[data-testid="prize-1"]')).includes("Training jersey") && (await page.locator('[data-testid="prize-1"] [data-testid="brand-link-jersey-drip"]').count()) === 1);
    check("#1 without a photo: branded tile, no photo note", (await page.locator('[data-testid="prize-1"] .rw2-tile.empty').count()) === 1 && (await page.locator('[data-testid="prize-1"] .rw2-note').count()) === 0);
    check("#2 its own row (partner product photo)", (await text(page, '[data-testid="prize-2"]')).includes("Discovery Box") && (await page.locator('[data-testid="prize-2"] img.rw2-img').count()) === 1 && (await page.locator('[data-testid="prize-2"] [data-testid="brand-link-clean-crate"]').count()) === 1);
    const cp = await text(page, '[data-testid="prize-3"]');
    check("#3–10 one coupon row, both brands", cp.includes("#3–10") && cp.includes("Partner coupons") && cp.includes("Jersey Drip × The Clean Crate") && (await page.locator('[data-testid="prize-3"].rw2-coupon').count()) === 1, cp);
    check("staff note under the prizes", prize.includes("Winners collect at the front desk every Monday"));
    check("no second prize board on Rewards", (await page.locator('.rw-mini-board, [data-testid="rw-board-btn"]').count()) === 0);
    check("your place in plain words", (await text(page, '[data-testid="rw-you"] b')) === "You're #3 this week" && (await text(page, '[data-testid="rw-you"] small')) === "41 points to pass Rahul", await text(page, '[data-testid="rw-you"]'));
    check("who's #1 + link to the full race in Ranks", (await text(page, '[data-testid="rw-leader"]')).includes("Asha") && (await page.locator('[data-testid="rw-race-link"]').getAttribute("href")) === "/leaderboard");
    check("ready prize code at the very top", (await text(page, '[data-testid="rw-mine"]')).includes("RK-7F3A2C") &&
      (await page.evaluate(() => document.querySelector('[data-testid="rw-mine"]').getBoundingClientRect().top < document.querySelector('[data-testid="rw-prize"]').getBoundingClientRect().top)));
    const ch = await text(page, '[data-testid="rw-challenges"]');
    check("one special challenge, weekly", (await page.locator('[data-testid="rw-challenges"]').count()) === 1 && ch.includes("Every Friday") && ch.includes("Clean Crate Leg Press Challenge") && ch.includes("08 Leg Press") && ch.includes("Heaviest set") && /(Today|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday) · /.test(ch), ch);
    check("challenge: what winners get", (await text(page, '[data-testid="chal-prize"]')).includes("Winners get") && (await text(page, '[data-testid="chal-prize"]')).includes("A goodie bag from The Clean Crate") && (await page.locator('[data-testid="chal-prize"] [data-testid="brand-link-clean-crate"]').count()) === 1);
    check("challenge: live", (await text(page, '[data-testid="chal-status"]')).startsWith("Live now"));
    const rows = await page.locator('[data-testid="chal-row"]').allTextContents();
    check("challenge: its own board on the card, you marked", rows.length === 3 && rows[0].includes("Rahul") && rows[0].includes("140 kg") && rows[1].includes("You") && (await page.locator('[data-testid="chal-row"].me').count()) === 1, rows.join(" | "));
    check("challenge: no Men/Women switch without 0015", (await page.locator('[data-testid="chal-div-men"]').count()) === 0);
    check("challenge: go to the machine + share", (await page.locator('[data-testid="chal-go"]').getAttribute("href")) === "/machine/leg-press-08" && (await page.locator('[data-testid="chal-share"]').count()) === 1);
    check("no streak / missions / badges link", (await page.locator('[data-testid="rw-progress-link"], [data-testid="rw-missions"], [data-testid="rw-streak"], [data-testid="rw-badges"]').count()) === 0);
    check("last winners in one line", (await text(page, '[data-testid="rw-last-winners"]')) === "Week of 9 Nov: Asha won", await text(page, '[data-testid="rw-last-winners"]'));
    await page.locator('[data-testid="rw-last-winners"]').click();
    await page.waitForSelector('[data-testid="winners-sheet"]');
    check("last winners: tap for the list", (await text(page, '[data-testid="winners-sheet"]')).includes("Rahul"));
    await page.keyboard.press("Escape");
    await sleep(300);
    check("first names only", !(await text(page, ".rw-page")).includes("Rao") && !(await text(page, ".rw-page")).includes("@"));
    check("no emails on the page", !((await page.locator("body").textContent()) || "").includes("@example.com"));

    // a brand name opens its card on Partners
    await page.locator('[data-testid="prize-1"] [data-testid="brand-link-jersey-drip"]').click();
    await page.waitForSelector('[data-testid="rw-partners"]');
    await sleep(500);
    check("brand link -> Partners tab on that brand", page.url().endsWith("/rewards?tab=partners&brand=jersey-drip"));
    check("brand card highlighted + on screen", await page.evaluate(() => {
      const el = document.querySelector('[data-testid="partner-jersey-drip"]');
      const r = el.getBoundingClientRect();
      return el.classList.contains("rw-flash") && r.top < innerHeight && r.bottom > 0;
    }));
    await page.locator('[data-testid="rw-tab-win"]').click();
    await page.waitForSelector('[data-testid="rw-prize"]');
    check("back to Win drops the brand", page.url().endsWith("/rewards"));

    // Partners tab
    await page.locator('[data-testid="rw-tab-partners"]').click();
    await page.waitForSelector('[data-testid="rw-partners"]');
    check("partners tab in the URL", page.url().endsWith("/rewards?tab=partners"));
    check("partners: both brands with products", (await page.locator('[data-testid="partner-jersey-drip"] .rw-product').count()) === 2 && (await page.locator('[data-testid="partner-clean-crate"] .rw-product').count()) === 2);
    const href = await page.locator('[data-testid="visit-clean-crate"]').getAttribute("href");
    check("partner links carry utm tags", href.includes("utm_source=racked") && href.includes("utm_campaign=rewards"));
    const [popup] = await Promise.all([ctx.waitForEvent("page"), page.locator('[data-testid="visit-clean-crate"]').click()]);
    await popup.close().catch(() => {});
    await sleep(300);
    check("partner click counted", (rpc(st, "track_sponsor_click")[0] || "").includes('"p_sponsor_id":"clean-crate"'));
    check("brand partnership CTA", (await page.locator('[data-testid="rw-brand-cta"]').getAttribute("href")).includes("instagram.com/bijlee.run"));
    check("no page errors (rewards)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // 1b. a prize photo from R&R: shown with the small "for reference" note;
  // an old ?tab=shop link lands on Win while the shop is archived
  {
    const { ctx, page, errors } = await open(browser, "/rewards?tab=shop", (s) => ((s.rewards.overview.season.prizes[0].image_url = "data:image/png;base64," + PNG.toString("base64")), s));
    await page.waitForSelector('[data-testid="rw-prize"]');
    check("prize photo shown big", (await page.locator('[data-testid="prize-1"] img.rw2-img').getAttribute("src")).startsWith("data:image/png"));
    check("small note: photo for reference", (await text(page, '[data-testid="prize-1"] .rw2-note')) === "Photo for reference. The prize you get may look different.");
    check("?tab=shop while archived: Win, no Shop tab", (await page.locator('[data-testid="rw-tab-shop"]').count()) === 0 && (await page.locator('[data-testid="rw-tab-win"]').getAttribute("aria-selected")) === "true");
    check("no page errors (prize photo)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // 2. archived XP Shop + XP, switched back on (lib/features.ts) still work
  const SHOP = { features: ["rewardsShop", "xp"] };
  {
    const { ctx, page, errors } = await open(browser, "/rewards", (s) => ((s.rewards.syncAwards = [{ kind: "badge", id: "regular", title: "Regular", xp: 75 }]), s), SHOP);
    await page.waitForSelector('[data-testid="rw-prize"]');
    check("archived on: badge toast with XP", (await page.locator(".toast").allTextContents()).some((t) => t.includes("Badge unlocked: Regular · +75 XP")));
    check("archived on: XP chip + three tabs", (await text(page, '[data-testid="rw-xp-chip"]')).includes("1,540") && (await page.locator(".rw-tabs [role=tab]").allTextContents()).map((t) => t.trim()).join(",") === "Win,Partners,Shop");
    await page.locator('[data-testid="rw-tab-shop"]').click();
    await page.waitForSelector('[data-testid="rw-wallet"]');
    check("shop: wallet with on-hold XP", (await text(page, '[data-testid="rw-balance"]')).includes("1,540") && (await text(page, '[data-testid="rw-on-hold"]')).includes("60"));
    check("shop states", (await page.locator('[data-testid="redeem-11"]').isEnabled()) && (await text(page, '[data-testid="redeem-13"]')).includes("1,460 XP to go") && (await text(page, '[data-testid="redeem-14"]')).includes("All gone"));
    await page.locator('[data-testid="redeem-11"]').click();
    await page.waitForSelector('[data-testid="redeem-sheet"]');
    check("confirm shows the maths", (await text(page, '[data-testid="redeem-sheet"]')).includes("= 940 XP left"));
    await page.locator('[data-testid="redeem-confirm"]').click();
    await page.waitForSelector('[data-testid="redeem-result"]');
    check("result: claim code", (await text(page, '[data-testid="redeem-code"]')).includes("RK-4D21FA"));
    await page.getByRole("button", { name: "Done" }).click();
    await sleep(700);
    check("balance drops, item claimed", (await text(page, '[data-testid="rw-balance"]')).includes("940") && (await text(page, '[data-testid="redeem-11"]')).includes("Claimed"));
    check("XP chip updates too", (await text(page, '[data-testid="rw-xp-chip"]')).includes("940"));
    await page.getByRole("button", { name: /How XP works/ }).first().click();
    check("How XP works sheet", (await text(page, '[data-testid="how-xp-sheet"]')).includes("Friday"));
    await page.keyboard.press("Escape");
    check("no page errors (shop)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(browser, "/rewards?tab=shop", (s) => ((s.rewards.overview.settings.show_shop = false), s), SHOP);
    await page.waitForSelector('[data-testid="rw-prize"]');
    check("shop tab hidden when switched off in R&R (falls back to Win)", (await page.locator('[data-testid="rw-tab-shop"]').count()) === 0);
    await ctx.close();
  }

  // 3. redeem refused by the server
  {
    const { ctx, page, st } = await open(browser, "/rewards?tab=shop", (s) => ((s.rewards.my.wallet.balance = 5000), s), SHOP);
    await page.waitForSelector('[data-testid="redeem-12"]');
    st.rewards.my.wallet.balance = 10;
    await page.locator('[data-testid="redeem-12"]').click();
    await page.locator('[data-testid="redeem-confirm"]').click();
    await page.waitForSelector('[data-testid="redeem-error"]');
    check("server refusal explained", (await text(page, '[data-testid="redeem-error"]')).includes("more XP"));
    await ctx.close();
  }

  // 4. signed out
  {
    const { ctx, page, st, errors } = await open(browser, "/rewards", (s) => ((s.signedIn = false), s));
    await page.waitForSelector('[data-testid="rw-prize"]');
    check("signed out: sign-in strip + prizes", (await page.locator('[data-testid="rw-signin"]').count()) === 1 && (await text(page, '[data-testid="rw-prize"]')).includes("Training jersey"));
    check("signed out: no member calls", rpc(st, "my_rewards").length === 0 && rpc(st, "sync_my_rewards").length === 0);
    check("signed out: who's winning, no 'you' place", (await text(page, '[data-testid="rw-you"]')) === "Who's winning right now" && (await page.locator(".rw2-race-rank").count()) === 0);
    await page.waitForSelector('[data-testid="chal-row"]');
    check("signed out: challenge board, nobody marked", (await page.locator('[data-testid="chal-row"]').count()) === 3 && (await page.locator('[data-testid="chal-row"].me').count()) === 0 && (await page.locator('[data-testid="chal-share"]').count()) === 0);
    check("no page errors (signed out)", errors.length === 0, errors.join(" | "));
    await ctx.close();
    const so = await open(browser, "/rewards?tab=shop", (s) => ((s.signedIn = false), s), SHOP);
    await so.page.waitForSelector('[data-testid="redeem-11"]');
    check("signed out (shop on): redeem asks to sign in", (await text(so.page, '[data-testid="redeem-11"]')).includes("Sign in"));
    await so.page.locator('[data-testid="redeem-11"]').click();
    check("signed out (shop on): sign-in sheet opens", (await so.page.locator('[data-testid="signin-sheet"]').count()) === 1);
    await so.ctx.close();
  }

  // 5. database updates not run yet
  {
    const { ctx, page, errors } = await open(browser, "/rewards", (s) => ((s.missingRpc.rewards_overview = true), (s.missingRpc.my_rewards = true), (s.missingRpc.sync_my_rewards = true), (s.missingTables = { rr_settings: true }), s));
    await page.waitForSelector('[data-testid="rw-soon"]');
    check("before 0011: friendly 'on the way' card, gym name still shown", (await text(page, '[data-testid="rw-soon"]')).includes("Club 360"));
    check("no page errors (no 0011)", errors.length === 0, errors.join(" | "));
    await ctx.close();
    const h = await open(browser, "/home", (s) => ((s.missingRpc.my_rewards = true), (s.missingRpc.sync_my_rewards = true), (s.missingRpc.rewards_overview = true), s));
    await h.page.waitForSelector('[data-testid="tile-week"]');
    await h.page.waitForSelector('[data-testid="feed-text"]');
    check("before 0011: home feed has no prize / challenge / won cards", (await h.page.locator('[data-testid="feed-prize"], [data-testid="feed-challenge"], [data-testid="rw-won-card"], [data-testid="feed-winners"]').count()) === 0);
    check("before 0011: home still fine", h.errors.length === 0, h.errors.join(" | "));
    await h.ctx.close();
    const l = await open(browser, "/leaderboard", (s) => ((s.missingRpc.season_board = true), (s.missingRpc.rewards_overview = true), (s.missingRpc.my_rewards = true), s));
    await l.page.waitForSelector('[data-testid="rk-unavailable"]');
    check("before 0011: Ranks says the board is on its way, no progress", (await l.page.locator('[data-testid="lb-progress"]').count()) === 0 && (await l.page.locator('[data-testid="rk-filters"]').count()) === 1);
    check("before 0011: ranks still fine", l.errors.length === 0, l.errors.join(" | "));
    await l.ctx.close();
  }

  // 6. Home: winners and "You won" only; the prize and challenge cards are
  // archived (lib/features.ts) and still work when switched on
  {
    const plain = await open(browser, "/home");
    await plain.page.waitForSelector('[data-testid="feed-winners"]');
    check("home feed: no prize card, no challenge cards", (await plain.page.locator('[data-testid="feed-prize"], [data-testid="feed-challenge"]').count()) === 0);
    check("home feed: winners + 'You won' still there", (await plain.page.locator('[data-testid="rw-won-card"]').count()) === 1 && (await text(plain.page, '[data-testid="feed-winners"]')).includes("Asha"));
    await plain.ctx.close();
    const { ctx, page, errors } = await open(browser, "/home", (s) => s, { features: ["homePrizeCard", "homeChallengeCards"] });
    await page.waitForSelector('[data-testid="feed-prize"]');
    check("home: Training at Club 360", (await text(page, 'header [data-testid="gym-mark"]')).includes("Club 360"));
    const t = await text(page, '[data-testid="feed-prize"]');
    check("home feed: this week's prize + who's winning", /This week.s prize/.test(t) && t.includes("Training jersey") && t.includes("Asha leads") && t.includes("You're #3"), t);
    check("home feed: prize card opens Rewards", (await page.locator('[data-testid="feed-prize"]').getAttribute("href")) === "/rewards");
    const ch = await text(page, '[data-testid="feed-challenge"]');
    check("home feed: live Friday challenge", ch.includes("Live now") && ch.includes("Rahul leads"), ch);
    check("home feed: 'You won' card on top", (await text(page, '[data-testid="rw-won-card"]')).includes("RK-7F3A2C"));
    check("home feed: last week's winners", (await text(page, '[data-testid="feed-winners"]')).includes("Asha"));
    check("home: no old reward boxes", (await page.locator('[data-testid="rw-teaser"], [data-testid="rw-live-challenge"], [data-testid="machines-card"]').count()) === 0);
    check("no page errors (home)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // 7. Ranks (v2; this suite runs without 0015/0016: the weekly race only)
  {
    const { ctx, page, st, errors } = await open(browser, "/leaderboard");
    await page.waitForSelector('[data-testid="leaderboard"]');
    const hero = await text(page, '[data-testid="lbx-hero"]');
    check("ranks: small Club 360 card with Week ends in, no Powered by", hero.includes("Leaderboard") && hero.includes("Club 360") && /Week ends in \d/.test(hero) && !hero.includes("Powered by"), hero);
    check("ranks: This week is the default", (await page.locator('[data-testid="lb-tab-week"]').getAttribute("aria-selected")) === "true" && rpc(st, "season_board").length >= 1);
    check("ranks: no board filter before 0015", (await page.locator('[data-testid="rk-board"]').count()) === 0 && (await page.locator('[data-testid="rk-filters"] select').count()) === 2);
    check("ranks: list + one prize line", (await page.locator('[data-testid="rk-row"]').count()) === 6 && (await text(page, '[data-testid="lb-prize-race"]')).includes("#1 wins a prize"));
    const you = await text(page, '[data-testid="my-rank"]');
    check("ranks: pinned 'you' bar with the gap", you.includes("#3") && you.includes("You · 380") && you.includes("41 points to pass Rahul"), you);
    check("ranks: progress section, no XP", (await page.locator('[data-testid="lb-progress"] [data-testid="rw-streak"]').count()) === 1 &&
      (await text(page, '[data-testid="mission-volume5k"]')).includes("4,200 / 5,000 kg") && (await page.locator(".rw-badges li.got").count()) === 3 && !(await text(page, '[data-testid="lb-progress"]')).includes("XP"));
    await page.locator('[data-testid="share-rank"]').click();
    await sleep(600);
    check("ranks: share your rank", (await page.locator(".sheet-backdrop").count()) === 1 && (await page.locator(".sheet-backdrop").textContent()).includes("Close"));
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await sleep(300);
    await page.locator('[data-testid="lb-tab-all"]').click();
    await page.waitForURL(/tab=all/);
    await page.waitForSelector('[data-testid="rk-unavailable"]');
    check("ranks: All time needs 0016 here", (await text(page, '[data-testid="rk-unavailable"]')).includes("on its way"));
    check("no page errors (ranks)", errors.length === 0, errors.join(" | "));
    await ctx.close();
    const old = await open(browser, "/leaderboard?tab=overall");
    await old.page.waitForSelector('[data-testid="lb-tab-all"]');
    check("ranks: old ?tab=overall links still work", (await old.page.locator('[data-testid="lb-tab-all"]').getAttribute("aria-selected")) === "true");
    await old.ctx.close();
  }

  // 8. You v2: Settings in words, gym line, one stats row, attendance, bests
  {
    const { ctx, page, errors } = await open(browser, "/profile");
    await page.waitForSelector('[data-testid="you-best"]');
    const set = page.locator('[data-testid="open-settings"]');
    check("you: a 'Settings' button with the word", (await set.textContent()).trim() === "Settings" && (await set.getAttribute("href")) === "/settings");
    const head = await text(page, '[data-testid="profile-header"]');
    check("you: name, @handle, gym + member since in one line", head.includes("Omi Patil") && head.includes("@omi.lifts") && /Club 360 member since \w+ \d{4}/.test(await text(page, '[data-testid="you-gym"]')), head);
    check("you: Edit profile + Share progress", (await page.locator('[data-testid="edit-profile"]').getAttribute("href")) === "/settings" && (await page.getByRole("button", { name: /Share progress/ }).count()) === 1);
    const sv = (await page.locator('[data-testid="you-stats"] > div').evaluateAll((els) => els.map((e) => e.querySelector("b").textContent + " " + e.querySelector("span").textContent))).join(" · ");
    check("you: one stats row (sets · kg moved · PBs · machines)", sv === "73 sets · 43.6k kg moved · 3 PBs · 3/10 machines", sv);
    check("you: no gym card, no leaderboard button", (await page.locator('[data-testid="your-gym"], [data-testid="gym-leaderboard-link"]').count()) === 0);
    check("you: attendance with the streak pill, no explanation line", (await text(page, '[data-testid="you-streak"]')) === "3 days" && !(await text(page, '[data-testid="you-attendance"]')).includes("marks the day"));
    check("you: progress photos without the paragraph, small buttons", !(await text(page, '[data-testid="progress-photos"]')).includes("optional") && (await text(page, '[data-testid="slot-pre-empty"]')) === "Pre photo" && (await page.locator('[data-testid="slot-pre-empty"]').getAttribute("aria-label")) === "Add pre photo");
    const bests = await page.locator('[data-testid="you-best"]').allTextContents();
    check("you: your bests, one line each, machine order", bests.length === 3 && bests[0].includes("01") && bests[0].includes("Lat Pulldown") && bests[0].includes("55 kg × 10") && bests[2].includes("Leg Press"), bests.join(" | "));
    check("you: bests link to the machine + All machines", (await page.locator('[data-testid="you-best"]').first().getAttribute("href")) === "/machine/lat-pulldown-01" && (await page.locator('[data-testid="you-bests"] a[href="/machines"]').count()) === 1);
    check("profile: no level or XP while XP is archived", (await page.locator('[data-testid="profile-level"]').count()) === 0 && !(await text(page, ".page")).includes("XP") && !(await text(page, '[data-testid="profile-header"]')).includes("Level"));
    await page.locator('[data-testid="open-settings"]').click();
    await page.waitForURL(/\/settings$/);
    check("you: Settings opens Settings", (await page.locator('[data-testid="profile-form"]').count()) === 1);
    check("no page errors (profile)", errors.length === 0, errors.join(" | "));
    await ctx.close();
    const g = await open(browser, "/profile", (s) => s, { features: ["youGymCard"] });
    await g.page.waitForSelector('[data-testid="your-gym"]');
    const gc = await text(g.page, '[data-testid="your-gym"]');
    check("archived gym card switched on: still works", gc.includes("Your gym") && gc.includes("Club 360") && gc.includes("Baner, Pune") && gc.includes("Member since") && (await g.page.locator('[data-testid="you-gym"]').count()) === 0 &&
      (await g.page.locator('[data-testid="your-gym"] a[href="https://instagram.com/club360"]').count()) === 1 && (await g.page.locator('[data-testid="gym-leaderboard-link"]').getAttribute("href")) === "/leaderboard");
    await g.ctx.close();
    const x = await open(browser, "/profile", (s) => s, { features: ["xp"] });
    await x.page.waitForSelector('[data-testid="profile-level"]');
    check("profile (XP switched on): level is back", (await text(x.page, '[data-testid="profile-level"]')).includes("XP") && (await text(x.page, '[data-testid="profile-header"]')).includes("Level"));
    await x.ctx.close();
    const n = await open(browser, "/profile", (s) => ((s.stats = []), s));
    await n.page.waitForSelector('[data-testid="you-bests"] .empty');
    check("you: brand new member, bests say how to start", (await text(n.page, '[data-testid="you-bests"]')).includes("Tap or scan any machine"));
    await n.ctx.close();
  }

  // 9. logging a set: mission toast, no XP (XP is archived; back when switched on)
  {
    const { ctx, page, st } = await open(browser, "/machine/lat-pulldown-01/log?tap=LP4K9X");
    await page.waitForSelector('[data-testid="log-submit"]');
    st.rewards.syncAwards = [{ kind: "mission", id: "sets15", title: "Log 15 sets", xp: 60 }];
    await page.locator('[data-testid="log-submit"]').click();
    await sleep(2000);
    const toasts = (await page.locator(".toast").allTextContents()).join(" | ");
    check("log: set + mission toasts, no XP", toasts.includes("Mission complete: Log 15 sets") && toasts.includes("logged") && !toasts.includes("XP"), toasts);
    await ctx.close();
    const x = await open(browser, "/machine/lat-pulldown-01/log?tap=LP4K9X", (s) => s, { features: ["xp"] });
    await x.page.waitForSelector('[data-testid="log-submit"]');
    x.st.rewards.syncAwards = [{ kind: "mission", id: "sets15", title: "Log 15 sets", xp: 60 }];
    await x.page.locator('[data-testid="log-submit"]').click();
    await sleep(2000);
    const t2 = (await x.page.locator(".toast").allTextContents()).join(" | ");
    check("log (XP switched on): +XP is back", t2.includes("Mission complete: Log 15 sets · +60 XP") && / · \+\d+ XP/.test(t2), t2);
    await x.ctx.close();
  }

  // 10. R&R Controls
  {
    const s0 = await open(browser, "/admin", staff);
    await s0.page.waitForSelector('[data-testid="open-rnr"]');
    check("staff console links to R&R Controls", (await s0.page.locator('[data-testid="open-rnr"]').getAttribute("href")) === "/rnr");
    await s0.page.goto(BASE + "/admin?tab=rewards");
    await s0.page.waitForURL(/\/rnr$/, { timeout: 10000 }).catch(() => {});
    check("old staff Rewards tab redirects to /rnr", s0.page.url().endsWith("/rnr"));
    await s0.ctx.close();

    const { ctx, page, st, errors } = await open(browser, "/rnr", staff);
    await page.waitForSelector('[data-testid="rr-console"]');
    check("rnr: title + gym", (await text(page, '[data-testid="rr-page"] header')).includes("R&R Controls") && (await text(page, '[data-testid="rr-page"] header')).includes("Club 360"));
    check("rnr: no member nav", (await page.locator(".bottom-nav").count()) === 0);
    check("rnr: prizes come first", await page.evaluate(() => document.querySelector('[data-testid="rw-admin-prizes"]').getBoundingClientRect().top < document.querySelector('[data-testid="rw-admin-season"]').getBoundingClientRect().top));
    await page.locator('[data-testid="edit-prizes"]').click();
    await page.waitForSelector('[data-testid="prize-editor"]');
    check("rnr: prizes already #1 · #2 · #3–10", (await text(page, '[data-testid="prize-ladder"]')).startsWith("✓") && (await page.locator('[data-testid="prize-ladder"]').isDisabled()));
    await page.locator('[data-testid="prize-photo-0-file"]').setInputFiles({ name: "hamper.png", mimeType: "image/png", buffer: PNG });
    await page.waitForFunction(() => !!document.querySelector('[data-testid="prize-photo-0"] .rr-photo-preview.has img'), null, { timeout: 8000 }).catch(() => {});
    check("rnr: prize photo uploads to rr-media", st.calls.some((c) => c.startsWith("storage:upload prizes/")));
    await page.locator('[data-testid="save-prizes"]').click();
    await sleep(600);
    const saved = rpc(st, "admin_save_prizes")[0] || "";
    check("rnr: prize saved with its photo", saved.includes("/storage/v1/object/public/rr-media/prizes/"), saved.slice(0, 300));
    await page.locator('[data-testid="award-season"]').click();
    await page.locator('[data-testid="confirm-sheet"] button:has-text("Award prizes")').last().click();
    await sleep(600);
    check("rnr: award last week", (rpc(st, "admin_award_season")[0] || "").includes('"p_season_id":6'));

    // challenges
    await page.locator('[data-testid="rw-sec-challenges"]').click();
    await page.waitForSelector('[data-testid="admin-series"]');
    check("rnr: Friday challenge listed as weekly", (await text(page, '[data-testid="admin-series"]')).includes("Every Friday · all day") && (await text(page, '[data-testid="series-next"]')).includes("Live now"));
    check("rnr: last Friday's round ready to award", (await page.locator('[data-testid="round-to-award"]').count()) === 1 && (await text(page, '[data-testid="round-to-award"]')).includes("Asha Rao"));
    await page.locator('[data-testid="award-challenge"]').click();
    await page.locator('[data-testid="confirm-sheet"] button:has-text("Award")').last().click();
    await sleep(600);
    check("rnr: award the round", (rpc(st, "admin_award_challenge")[0] || "").includes('"p_id":2'));
    await page.locator('[data-testid="new-series"]').click();
    await page.locator("#sr-title").fill("Jersey Drip Deadlift Sunday");
    await page.locator("#sr-machine").selectOption("deadlift-10");
    await page.locator("#sr-day").selectOption("7");
    await page.getByRole("switch", { name: "All day" }).click();
    await page.locator("#sr-from").fill("07:00");
    await page.locator("#sr-to").fill("11:00");
    await page.locator('[data-testid="save-series"]').click();
    await sleep(600);
    const ser = rpc(st, "admin_save_series")[0] || "";
    check("rnr: new weekly challenge (Sunday 07:00–11:00)", ser.includes('"weekday":"7"') && ser.includes('"start_time":"07:00"') && ser.includes('"end_time":"11:00"') && ser.includes("deadlift-10"), ser.slice(0, 300));

    // partners: logo upload
    await page.locator('[data-testid="rw-sec-partners"]').click();
    await page.waitForSelector('[data-testid="admin-sponsor"]');
    await page.locator('[data-testid="admin-sponsor"]').first().getByRole("button", { name: "Edit brand" }).click();
    await page.waitForSelector('[data-testid="sponsor-form"]');
    await page.locator('[data-testid="brand-cover-file"]').setInputFiles({ name: "cover.jpg", mimeType: "image/png", buffer: PNG });
    await sleep(800);
    await page.locator('[data-testid="save-sponsor"]').click();
    await sleep(600);
    check("rnr: brand cover photo saved", (rpc(st, "admin_save_sponsor")[0] || "").includes("rr-media/brands/"));

    // partners: the TV ad switch + headline, app taps vs TV scans
    const jd = page.locator('[data-testid="admin-sponsor"]').first();
    check("rnr: brand shows TV scans apart from app taps", /43\s*app taps/.test(await text(page, '[data-testid="sponsor-stats"]')) && /9\s*TV scans/.test(await text(page, '[data-testid="sponsor-stats"]')), await text(page, '[data-testid="sponsor-stats"]'));
    check("rnr: on-TV pill", (await jd.locator('[data-testid="sponsor-tv-pill"]').textContent()).includes("On TV") && (await page.locator('[data-testid="sponsor-tv-pill"]').nth(1).textContent()).includes("Not on TV"));
    await jd.getByRole("button", { name: "Edit brand" }).click();
    await page.waitForSelector('[data-testid="sponsor-form"]');
    check("rnr: brand form has the TV switch (on)", (await page.locator('[data-testid="sponsor-on-tv"]').getAttribute("aria-checked")) === "true");
    await page.locator("#sf-tvh").fill("Wear your name.");
    await page.locator('[data-testid="save-sponsor"]').click();
    await sleep(600);
    const tvSave = rpc(st, "admin_save_sponsor").pop() || "";
    check("rnr: TV headline + switch saved", tvSave.includes('"show_on_tv":true') && tvSave.includes('"tv_headline":"Wear your name."'), tvSave.slice(0, 400));
    await page.locator('[data-testid="admin-sponsor"]').nth(1).getByRole("button", { name: "Edit brand" }).click();
    await page.waitForSelector('[data-testid="sponsor-form"]');
    check("rnr: a brand off the TV hides the headline box", (await page.locator('[data-testid="sponsor-on-tv"]').getAttribute("aria-checked")) === "false" && (await page.locator("#sf-tvh").count()) === 0);
    await page.keyboard.press("Escape");
    await sleep(400);

    // TV: times per loop + seconds
    await page.locator('[data-testid="rw-sec-tv"]').click();
    await page.waitForSelector('[data-testid="rr-tv"]');
    check("rnr TV: 8 kinds of slide", (await page.locator('[data-testid^="tv-kind-"]').count()) === 8);
    check("rnr TV: the 4 key slides marked", (await page.locator('[data-testid^="tv-kind-"] .pill-yellow').count()) === 4);
    check("rnr TV: one loop = 15 slides, about 2.5 min", (await text(page, '[data-testid="tv-loop-time"]')) === "15 slides · 2 min 31 s", await text(page, '[data-testid="tv-loop-time"]'));
    check("rnr TV: link to open the TV", ((await page.locator('[data-testid="open-tv"]').getAttribute("href")) || "").endsWith("/tv"));
    check("rnr TV: nothing to save yet", await page.locator('[data-testid="tv-save"]').isDisabled());
    await page.locator('[data-testid="tv-times-board-up"]').click();
    check("rnr TV: more boards -> longer loop", (await text(page, '[data-testid="tv-loop-time"]')) === "16 slides · 2 min 41 s", await text(page, '[data-testid="tv-loop-time"]'));
    await page.locator('[data-testid="tv-times-howto-down"]').click();
    await page.locator('[data-testid="tv-times-howto-down"]').click();
    check("rnr TV: a slide can be switched off", (await text(page, '[data-testid="tv-kind-howto"]')).includes("Off") && (await page.locator('[data-testid="tv-secs-howto-up"]').isDisabled()) && (await page.locator('[data-testid="tv-times-howto-down"]').isDisabled()));
    await page.locator('[data-testid="tv-times-join-down"]').click();
    check("rnr TV: Join can't go below once", await page.locator('[data-testid="tv-times-join-down"]').isDisabled());
    for (let i = 0; i < 3; i++) await page.locator('[data-testid="tv-secs-join-up"]').click();
    check("rnr TV: loop preview starts with Join", ((await page.locator(".rr-tv-strip li").first().textContent()) || "").includes("Join"));
    await page.locator('[data-testid="tv-save"]').click();
    await sleep(600);
    const tvs = rpc(st, "admin_save_rr_settings").pop() || "";
    check("rnr TV: saved", tvs.includes('"board":{"times":5,"seconds":10}') && tvs.includes('"howto":{"times":0,"seconds":12}') && tvs.includes('"join":{"times":1,"seconds":15}'), tvs.slice(0, 400));
    check("rnr TV: toast says the screen updates", (await page.locator(".toast").allTextContents()).some((t) => t.includes("TV updated")));
    await page.locator('[data-testid="tv-defaults"]').click();
    check("rnr TV: back to the suggested settings", (await text(page, '[data-testid="tv-loop-time"]')) === "15 slides · 2 min 31 s");

    // gym & page
    await page.locator('[data-testid="rw-sec-gym"]').click();
    await page.waitForSelector('[data-testid="rr-gym"]');
    await page.locator("#gy-loc").fill("Baner");
    await page.locator('[data-testid="gym-logo-dark-file"]').setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
    await sleep(800);
    await page.getByRole("switch", { name: "Show the XP shop tab" }).click();
    await page.locator('[data-testid="save-gym"]').click();
    await sleep(600);
    const g = rpc(st, "admin_save_rr_settings").pop() || "";
    check("rnr: gym + page settings saved", g.includes('"gym_location":"Baner"') && g.includes("rr-media/gym/") && g.includes('"show_shop":false'), g.slice(0, 300));
    check("rnr: logo preview shows", (await page.locator(".rr-gym-preview img").count()) >= 1);
    check("no page errors (rnr)", errors.length === 0, errors.join(" | "));
    await ctx.close();

    const m = await open(browser, "/rnr", (s) => ((s.profile.is_staff = true), (s.missingRpc.admin_rr_data = true), s));
    await m.page.waitForSelector('[data-testid="needs-0012"]');
    check("rnr: asks to run 0011 + 0012", (await text(m.page, '[data-testid="needs-0012"]')).includes("0012_rr_controls.sql"));
    await m.ctx.close();
    const m13 = await open(browser, "/rnr?s=tv", (s) => ((s.profile.is_staff = true), delete s.rewards.settings.tv_slides, s));
    await m13.page.waitForSelector('[data-testid="needs-0013"]');
    check("rnr TV: asks to run 0013 first", (await text(m13.page, '[data-testid="needs-0013"]')).includes("0013_tv_house_lifts.sql"));
    await m13.ctx.close();
    const mem = await open(browser, "/rnr");
    await mem.page.waitForSelector("text=Not a staff account");
    check("rnr: members are kept out", (await mem.page.locator('[data-testid="rr-console"]').count()) === 0);
    await mem.ctx.close();

    // one tap turns the old "#1 / #2–5" prizes into #1 · #2 · #3–10 coupons
    const lad = await open(browser, "/rnr", (s) => {
      s.profile.is_staff = true;
      const old = [
        { id: 1, rank_from: 1, rank_to: 1, title: "Gift hamper", description: null, sponsor_ids: ["jersey-drip"], image_url: "https://placeholder.supabase.co/storage/v1/object/public/rr-media/prizes/h.png" },
        { id: 2, rank_from: 2, rank_to: 5, title: "", description: null, sponsor_ids: ["clean-crate"] },
      ];
      s.rewards.admin.templates = old;
      s.rewards.admin.season_prizes = old;
      return s;
    });
    await lad.page.waitForSelector('[data-testid="edit-prizes"]');
    await lad.page.locator('[data-testid="edit-prizes"]').click();
    await lad.page.waitForSelector('[data-testid="prize-ladder"]');
    await lad.page.locator('[data-testid="prize-ladder"]').click();
    check("rnr ladder: three prizes, places 1 · 2 · 3–10", (await lad.page.locator(".rw-prize-edit").count()) === 3 &&
      (await lad.page.locator("#pf-1").inputValue()) === "2" && (await lad.page.locator("#pt-1").inputValue()) === "2" && (await lad.page.locator("#pf-2").inputValue()) === "3" && (await lad.page.locator("#pt-2").inputValue()) === "10");
    check("rnr ladder: keeps what was typed, names the coupons", (await lad.page.locator("#pn-0").inputValue()) === "Gift hamper" && (await lad.page.locator("#pn-2").inputValue()) === "Partner coupons");
    await lad.page.locator("#pn-1").fill("Discovery Box");
    await lad.page.locator('[data-testid="save-prizes"]').click();
    await sleep(600);
    const ls = rpc(lad.st, "admin_save_prizes")[0] || "";
    check("rnr ladder: saved with the #1 photo kept", ls.includes('"rank_to":10') && ls.includes("Discovery Box") && ls.includes("rr-media/prizes/h.png"), ls.slice(0, 400));
    check("no page errors (rnr ladder)", lad.errors.length === 0, lad.errors.join(" | "));
    await lad.ctx.close();
  }

  // 11. 360px + axe
  const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
  const pages = [
    ["/rewards", "dark", {}], ["/rewards", "light", {}], ["/rewards?tab=partners", "dark", {}], ["/rewards?tab=shop", "light", { features: ["rewardsShop", "xp"] }], ["/rewards", "dark", { out: true }],
    ["/leaderboard", "dark", {}], ["/leaderboard", "light", {}], ["/leaderboard?tab=machine", "dark", {}], ["/profile", "light", {}], ["/profile", "dark", {}], ["/settings", "dark", {}], ["/settings", "light", {}], ["/settings", "dark", { out: true }],
    ["/rnr", "dark", { staff: true }], ["/rnr?s=challenges", "light", { staff: true }], ["/rnr?s=partners", "dark", { staff: true }], ["/rnr?s=gym", "light", { staff: true }], ["/rnr?s=tv", "dark", { staff: true }], ["/rnr?s=tv", "light", { staff: true }], ["/rnr?s=handout", "dark", { staff: true }],
  ];
  for (const [url, theme, o] of pages) {
    const label = `${url} (${theme}${o.out ? ", signed out" : ""})`;
    const { ctx, page, errors } = await open(browser, url, (s) => ((s.signedIn = !o.out), (s.profile.is_staff = !!o.staff), s), { width: 360, theme, features: o.features });
    await sleep(1300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`@360 no sideways scroll ${label}`, overflow <= 0, String(overflow));
    await page.addScriptTag({ content: axeSrc });
    const res = await page.evaluate(async () => {
      // eslint-disable-next-line no-undef
      const r = await axe.run(document, { runOnly: ["wcag2a", "wcag2aa"], resultTypes: ["violations"] });
      return r.violations.filter((v) => ["serious", "critical"].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((x) => x.target.join(" ")).join(", ")}`);
    });
    check(`axe ${label}`, res.length === 0, res.join(" || "));
    check(`no page errors ${label}`, errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  await browser.close();
  console.log(`${n - bad}/${n} passed`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
