// Home feed (0014): the feed cards, filters, kudos, comments, posting from the
// + button, edit / delete / report, notices and offers, and the fallback when
// 0014 isn't run yet. Against the mocked backend. Run: see tests/README.md
const { chromium } = require("playwright");
const fs = require("fs");
const { defaultState, setup } = require("./mock");
const BASE = process.env.BASE_URL || "http://localhost:3111";
let n = 0, bad = 0;
const check = (name, ok, extra = "") => { n++; if (!ok) bad++; console.log(ok ? "PASS" : "FAIL", name, ok ? "" : extra); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const img = (name) => ({ name, mimeType: "image/png", buffer: PNG });
const calls = (st, name) => st.calls.filter((c) => c.startsWith("POST rpc/" + name + " ") || c === "POST rpc/" + name);
const body = (c) => { try { return JSON.parse(c.slice(c.indexOf("{"))); } catch { return {}; } };
const text = async (page, sel) => ((await page.locator(sel).first().textContent()) || "").replace(/\s+/g, " ").trim();
const count = (page, sel) => page.locator(sel).count();

async function open(browser, url, mut = (s) => s, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: opts.width || 390, height: 844 }, deviceScaleFactor: 1, timezoneId: "Asia/Kolkata", colorScheme: opts.theme || "dark" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  if (opts.theme) await page.addInitScript((t) => localStorage.setItem("racked:theme", t), opts.theme);
  const st = mut(defaultState()) || defaultState();
  st.feedPhotos = [{ item_id: 77, is_mine: false, display_name: "Kabir S", avatar_url: null, instagram_handle: null, day: "2026-11-18", pre_photo_id: 77, pre_path: "u5/pre.jpg", post_photo_id: 78, post_path: "u5/post.jpg", created_at: new Date(Date.now() - 95 * 60000).toISOString(), kudos_count: 3, kudos_mine: false, kudos_names: ["Asha"] }];
  if (opts.after) opts.after(st);
  await setup(ctx, page, st, BASE);
  await page.goto(BASE + url, { waitUntil: "networkidle" }).catch(() => {});
  return { ctx, page, st, errors };
}

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

  // 1. the page: header, one-line stats, composer, every card type
  {
    const { ctx, page, st, errors } = await open(browser, "/home");
    await page.waitForSelector('[data-testid="feed-text"]');
    check("greeting + gym chip", (await count(page, ".hx-top h1")) === 1 && (await text(page, 'header [data-testid="gym-mark"]')).includes("Club 360"));
    const you = await text(page, '[data-testid="you-line"]');
    check("stats on one slim line: streak, level, sets this week", /day streak/.test(you) && /level/.test(you) && /sets? this week/.test(you), you);
    check("stats line is a single row", await page.evaluate(() => {
      const t = [...document.querySelectorAll('[data-testid="you-line"] > *')].map((e) => Math.round(e.getBoundingClientRect().top));
      return t.length === 3 && new Set(t).size === 1;
    }));
    check("composer is there", (await count(page, '[data-testid="composer-open"]')) === 1 && (await count(page, '[data-testid="composer-photo"]')) === 1);
    check("home_feed asked once for the first page", calls(st, "home_feed").length >= 1 && body(calls(st, "home_feed")[0]).p_filter === "all");
    const order = await page.evaluate(() => [...document.querySelectorAll(".fx-feed > *")].slice(0, 2).map((e) => e.getAttribute("data-testid")));
    check("'You won' first, then the pinned notice", order[0] === "rw-won-card" && order[1] === "feed-notice", order.join(","));
    check("pinned notice says Pinned", (await text(page, '[data-testid="feed-notice"]')).includes("Pinned") && (await text(page, '[data-testid="feed-notice"]')).includes("Closed Sunday for Diwali"));
    for (const id of ["feed-text", "feed-photo", "feed-transformation", "feed-pr", "feed-workout", "photo-card", "feed-offer", "feed-milestone", "feed-prize", "feed-challenge", "feed-winners"])
      check(`card shows: ${id}`, (await count(page, `[data-testid="${id}"]`)) >= 1);
    const rahul = page.locator('[data-testid="feed-text"]').filter({ hasText: "Rahul Mehta" });
    check("text post: big text + machine tag", (await rahul.locator(".fx-body.big").count()) === 1 && ((await rahul.locator('[data-testid="machine-tag"]').textContent()) || "").includes("Squat"));
    check("tag opens the machine guide", (await rahul.locator('[data-testid="machine-tag"]').getAttribute("href")) === "/machine/squat-07/guide");
    const neha = page.locator('[data-testid="feed-photo"]').first();
    check("photo post: 2 photos with a counter", ((await neha.textContent()) || "").includes("1/2") && (await neha.locator("img").count()) === 2);
    check("photo post: last comment preview", ((await neha.locator('[data-testid="last-comment"]').textContent()) || "").includes("Those gloves are clean"));
    const tr = page.locator('[data-testid="feed-transformation"]');
    check("transformation: before / after + weeks apart", ((await tr.textContent()) || "").includes("12 weeks apart") && (await tr.locator('input[type="range"]').count()) === 1);
    const pr = page.locator('[data-testid="feed-pr"]');
    check("PR card: machine plate with the lift", ((await pr.textContent()) || "").includes("New PB") && ((await pr.textContent()) || "").includes("Lat Pulldown") && (await pr.locator(".fx-plate").count()) === 1);
    check("PR lift is read out once for screen readers", ((await pr.locator(".sr-only").first().textContent()) || "").includes("times"));
    check("normal workout is a compact row", ((await text(page, '[data-testid="feed-workout"]'))).includes("logged"));
    const offer = page.locator('[data-testid="feed-offer"]');
    check("offer: brand, code, shop button, claim with XP", ((await offer.textContent()) || "").includes("Jersey Drip") && ((await offer.locator('[data-testid="offer-code"]').textContent()) || "").includes("RACKED15") && (await offer.locator('[data-testid="offer-cta"]').count()) === 1 && ((await offer.locator('[data-testid="offer-xp"]').textContent()) || "").includes("1,000"));
    const cta = (await offer.locator('[data-testid="offer-cta"]').getAttribute("href")) || "";
    check("offer link is tagged for the partner", cta.includes("jerseydrip.shop") && cta.includes("utm_source=racked"), cta);
    check("milestones: streak + badge", (await page.locator('[data-testid="feed-milestone"]').allTextContents()).join(" ").includes("14-day") && (await page.locator('[data-testid="feed-milestone"]').allTextContents()).join(" ").includes("Explorer"));
    check("no old Home boxes", (await count(page, '[data-testid="rw-teaser"], [data-testid="machines-card"], [data-testid="rw-live-challenge"]')) === 0);
    check("caught up at the end", (await count(page, ".fx-caught-up")) === 1 || (await count(page, '[data-testid="load-more"]')) === 1);
    check("my own post shows as You with my initial", ((await page.locator('[data-testid="feed-text"]').filter({ hasText: "First week" }).locator(".fx-name b").textContent()) || "") === "You");
    check("no page errors (feed)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // 2. filters
  {
    const { ctx, page, st, errors } = await open(browser, "/home");
    await page.waitForSelector('[data-testid="feed-text"]');
    check("6 filters, For you selected", (await count(page, '[data-testid^="filter-"]')) === 6 && (await page.locator('[data-testid="filter-all"]').getAttribute("aria-selected")) === "true");
    const only = async (key, want, none) => {
      await page.locator(`[data-testid="filter-${key}"]`).click();
      await page.waitForFunction((k) => document.querySelector(`[data-testid="filter-${k}"]`)?.getAttribute("aria-selected") === "true", key);
      await sleep(500);
      const last = body(calls(st, "home_feed").pop());
      const has = await count(page, want.map((w) => `[data-testid="${w}"]`).join(", "));
      const not = none.length ? await count(page, none.map((w) => `.fx-feed [data-testid="${w}"]`).join(", ")) : 0;
      check(`filter ${key}: asks for ${key}, shows only those`, last.p_filter === key && has >= 1 && not === 0, `${last.p_filter} has=${has} not=${not}`);
    };
    await only("prs", ["feed-pr"], ["feed-text", "feed-photo", "feed-transformation", "photo-card", "feed-offer"]);
    await only("photos", ["feed-photo", "photo-card"], ["feed-text", "feed-transformation", "feed-pr"]);
    await only("transformations", ["feed-transformation"], ["feed-text", "feed-photo", "feed-pr"]);
    await only("posts", ["feed-text"], ["feed-photo", "feed-transformation", "feed-pr", "photo-card"]);
    await only("gym", ["feed-offer", "feed-notice"], ["feed-text", "feed-photo", "feed-pr"]);
    check("gym filter leads with the prize", (await page.evaluate(() => [...document.querySelectorAll(".fx-feed > *")].map((e) => e.getAttribute("data-testid")))).filter((x) => x !== "rw-won-card" && x !== "feed-notice")[0] === "feed-prize");
    check("no page errors (filters)", errors.length === 0, errors.join(" | "));
    await ctx.close();
    const e = await open(browser, "/home", (s) => ((s.wallPosts = s.wallPosts.filter((w) => w.kind !== "transformation")), s));
    await e.page.waitForSelector('[data-testid="feed-text"]');
    await e.page.locator('[data-testid="filter-transformations"]').click();
    await e.page.waitForSelector('[data-testid="feed-empty"]');
    check("empty filter: friendly empty state", (await text(e.page, '[data-testid="feed-empty"]')).length > 10);
    await e.page.locator('[data-testid="feed-empty"] button').click();
    check("empty state button opens the right composer", (await e.page.locator('[data-testid="transformation-composer"]').count()) === 1);
    await e.ctx.close();
  }

  // 3. kudos (button + double-tap)
  {
    const { ctx, page, st, errors } = await open(browser, "/home");
    await page.waitForSelector('[data-testid="feed-text"]');
    const rahul = page.locator('[data-testid="feed-text"]').filter({ hasText: "Rahul Mehta" });
    const k = rahul.locator('[data-testid="kudos"]');
    const before = Number(((await k.textContent()) || "0").replace(/\D/g, "")) || 0;
    await k.click();
    await sleep(400);
    check("kudos: toggle_wall_kudos called", calls(st, "toggle_wall_kudos").length === 1 && body(calls(st, "toggle_wall_kudos")[0]).p_id === 301);
    check("kudos: count goes up and button is pressed", Number(((await k.textContent()) || "0").replace(/\D/g, "")) === before + 1 && (await k.getAttribute("aria-pressed")) === "true");
    const neha = page.locator('[data-testid="feed-photo"]').first();
    await neha.locator(".fx-tap").first().dblclick();
    await sleep(400);
    check("double-tap a photo gives kudos", calls(st, "toggle_wall_kudos").some((c) => body(c).p_id === 302) && (await neha.locator(".fx-burst").count()) === 1);
    await neha.locator(".fx-tap").first().dblclick();
    await sleep(400);
    check("double-tap again doesn't take it back", calls(st, "toggle_wall_kudos").filter((c) => body(c).p_id === 302).length === 1);
    const pr = page.locator('[data-testid="feed-pr"]');
    await pr.locator('[data-testid="kudos"]').click();
    await sleep(400);
    check("kudos on a PR uses the set kudos", calls(st, "toggle_kudos").length === 1 && body(calls(st, "toggle_kudos")[0]).p_post_id === 11);
    check("no page errors (kudos)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // 4. comments
  {
    const { ctx, page, st, errors } = await open(browser, "/home");
    await page.waitForSelector('[data-testid="feed-photo"]');
    const neha = page.locator('[data-testid="feed-photo"]').first();
    await neha.locator('[data-testid="comment-btn"]').click();
    await page.waitForSelector('[data-testid="comments-sheet"] [data-testid="comment"]');
    const sheet = page.locator('[data-testid="comments-sheet"]');
    check("comments sheet: dialog with the comment", (await sheet.getAttribute("role")) === "dialog" && ((await sheet.textContent()) || "").includes("Those gloves are clean"));
    await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect && a.effect.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => null))));
    check("sheet sits on the bottom of the screen", await page.evaluate(() => {
      const r = document.querySelector('[data-testid="comments-sheet"]').getBoundingClientRect();
      return Math.abs(r.bottom - window.innerHeight) < 2;
    }));
    check("comments: list_comments for the post", body(calls(st, "list_comments")[0]).p_type === "wall" && body(calls(st, "list_comments")[0]).p_id === 302);
    await page.locator('[data-testid="comment-input"]').fill("Check this www.example.com");
    await page.locator('[data-testid="comment-send"]').click();
    await sleep(300);
    check("links refused before sending", calls(st, "add_comment").length === 0 && ((await sheet.textContent()) || "").includes("Links can't be posted"));
    await page.locator('[data-testid="comment-input"]').fill("Strong back day!");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="comments-sheet"] [data-testid="comment"]').length === 2);
    check("comment added (Enter sends)", calls(st, "add_comment").length === 1 && body(calls(st, "add_comment")[0]).p_body === "Strong back day!");
    check("input cleared", (await page.locator('[data-testid="comment-input"]').inputValue()) === "");
    // report someone else's
    await sheet.locator('[data-testid="comment"]').first().locator("button.fx-more").click();
    await page.locator('[data-testid="report-comment"]').click();
    await sleep(300);
    check("report a comment", calls(st, "report_comment").length === 1);
    // delete mine
    await sheet.locator('[data-testid="comment"]').last().locator("button.fx-more").click();
    await page.locator('[data-testid="delete-comment"]').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="comments-sheet"] [data-testid="comment"]').length === 1);
    check("delete my comment", calls(st, "delete_comment").length === 1);
    await page.locator('[data-testid="comment-input"]').fill("Gloves look great");
    await page.locator('[data-testid="comment-send"]').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="comments-sheet"] [data-testid="comment"]').length === 2);
    await page.keyboard.press("Escape");
    await sleep(300);
    check("card updates: count + my last comment", ((await neha.locator('[data-testid="comment-btn"]').textContent()) || "").includes("2") && ((await neha.locator('[data-testid="last-comment"]').textContent()) || "").includes("Gloves look great"));
    check("no page errors (comments)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // 5. edit / delete my post, report someone else's
  {
    const { ctx, page, st, errors } = await open(browser, "/home");
    await page.waitForSelector('[data-testid="feed-text"]');
    const mine = page.locator('[data-testid="feed-text"]').filter({ hasText: "First week" });
    await mine.locator('[data-testid="post-menu"]').click();
    check("my post menu: edit + delete, no report", (await count(page, '[data-testid="menu-edit"]')) === 1 && (await count(page, '[data-testid="menu-delete"]')) === 1 && (await count(page, '[data-testid="menu-report"]')) === 0);
    await page.locator('[data-testid="menu-edit"]').click();
    const ta = page.locator('[data-testid="edit-post"] textarea');
    await ta.fill("First week on Racked. Hooked for good.");
    await page.locator('[data-testid="save-edit"]').click();
    await sleep(500);
    check("edit saves", calls(st, "edit_wall_post").length === 1 && body(calls(st, "edit_wall_post")[0]).p_body === "First week on Racked. Hooked for good.");
    check("edited text shows", ((await page.locator('[data-testid="feed-text"]').filter({ hasText: "Hooked for good" }).count()) === 1));
    await page.locator('[data-testid="feed-text"]').filter({ hasText: "Hooked for good" }).locator('[data-testid="post-menu"]').click();
    await page.locator('[data-testid="menu-edit"]').click();
    await ta.fill("Read www.racked.app");
    await page.locator('[data-testid="save-edit"]').click();
    await sleep(300);
    check("edit refuses links", calls(st, "edit_wall_post").length === 1 && ((await text(page, '[data-testid="edit-post"]'))).includes("Links"));
    await page.keyboard.press("Escape");
    await sleep(200);
    await page.locator('[data-testid="feed-text"]').filter({ hasText: "Hooked for good" }).locator('[data-testid="post-menu"]').click();
    await page.locator('[data-testid="menu-delete"]').click();
    await page.locator('[data-testid="confirm-yes"]').click();
    await sleep(500);
    check("delete asks first, then removes the post", calls(st, "delete_wall_post").length === 1 && (await page.locator('[data-testid="feed-text"]').filter({ hasText: "Hooked" }).count()) === 0);
    const rahul = page.locator('[data-testid="feed-text"]').filter({ hasText: "Rahul Mehta" });
    await rahul.locator('[data-testid="post-menu"]').click();
    check("someone else's post: report only", (await count(page, '[data-testid="menu-report"]')) === 1 && (await count(page, '[data-testid="menu-edit"]')) === 0);
    await page.locator('[data-testid="menu-report"]').click();
    await page.locator('[data-testid="report-sheet"] button', { hasText: "Spam or selling" }).click();
    await sleep(300);
    check("report sends a reason", calls(st, "report_wall_post").length === 1 && body(calls(st, "report_wall_post")[0]).p_reason === "Spam or selling");
    check("no page errors (menus)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // 6. the + button: menu, machines, posting
  {
    const { ctx, page, st, errors } = await open(browser, "/home");
    await page.waitForSelector('[data-testid="feed-text"]');
    const plus = page.locator('[data-testid="nav-plus"]');
    check("+ sits in the middle of the nav", (await page.locator(".bottom-nav > *").nth(2).getAttribute("data-testid")) === "nav-plus" && (await plus.getAttribute("aria-label")) !== null);
    await plus.click();
    const menu = page.locator('[data-testid="create-menu"]');
    check("create menu: post, transformation, pump check", (await count(page, '[data-testid="create-post"]')) === 1 && (await count(page, '[data-testid="create-transformation"]')) === 1 && (await count(page, '[data-testid="create-pump"]')) === 1);
    check("create menu: how to log a set", ((await text(page, '[data-testid="create-log"]'))).includes("Tap or scan the sticker"));
    const links = await page.locator('[data-testid="create-machines"] a').evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    check("all 10 machines are in the menu", links.length === 10 && links.every((h) => /^\/machine\/[a-z-]+-\d\d$/.test(h)), links.join(","));
    check("menu titles fit their tiles", await page.evaluate(() => [...document.querySelectorAll(".cx-tile b")].every((b) => b.scrollWidth <= b.clientWidth + 1)));
    check("menu: no axe issues", (await axe(page)).length === 0);
    await page.locator('[data-testid="create-machines"] a').nth(6).click();
    await page.waitForURL(/\/machine\/squat-07$/, { timeout: 10000 });
    check("machine link opens the machine", page.url().endsWith("/machine/squat-07") && (await menu.count()) === 0);
    await page.goto(BASE + "/home", { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="feed-text"]');

    // a text + photos post, tagged to a machine
    await page.locator('[data-testid="nav-plus"]').click();
    await page.locator('[data-testid="create-post"]').click();
    const comp = page.locator('[data-testid="post-composer"]');
    check("composer opens with the text box focused", (await comp.count()) === 1 && (await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))) === "post-text");
    check("post button off while empty", await page.locator('[data-testid="post-submit"]').isDisabled());
    await page.locator('[data-testid="post-text"]').fill("Go to www.example.com for gloves");
    await page.locator('[data-testid="post-submit"]').click();
    await sleep(300);
    check("composer refuses links", calls(st, "create_wall_post").length === 0 && ((await comp.textContent()) || "").includes("Links"));
    await page.locator('[data-testid="post-text"]').fill("Hit 140 on leg press today. Who's next?");
    await page.locator('[data-testid="post-file"]').setInputFiles([img("a.png"), img("b.png")]);
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="post-photos"] img').length === 2);
    check("2 photos picked with previews", (await page.locator('[data-testid="post-photos"] img').count()) === 2);
    await page.locator('[data-testid="post-composer"] select').selectOption({ index: 8 });
    await page.locator('[data-testid="post-submit"]').click();
    await page.waitForSelector('[data-testid="post-composer"]', { state: "detached", timeout: 10000 });
    const ups = st.calls.filter((c) => c.startsWith("storage:upload pump-photos/"));
    const cr = body(calls(st, "create_wall_post")[0]);
    check("photos go to the private bucket under my folder", ups.length === 2 && ups.every((u) => u.includes("pump-photos/" + st.profile.id + "/")), ups.join(","));
    check("create_wall_post: photo post with text, 2 photos, machine tag", cr.p_kind === "photo" && cr.p_body === "Hit 140 on leg press today. Who's next?" && (cr.p_media || []).length === 2 && !!cr.p_machine_id, JSON.stringify(cr));
    await page.waitForFunction(() => (document.querySelector(".fx-feed [data-testid='feed-photo']")?.textContent || "").includes("Hit 140"), null, { timeout: 8000 });
    check("new post shows at the top of the feed", ((await text(page, '[data-testid="feed-photo"]'))).includes("You"));

    // a transformation
    await page.locator('[data-testid="nav-plus"]').click();
    await page.locator('[data-testid="create-transformation"]').click();
    check("transformation: needs both photos", await page.locator('[data-testid="transformation-submit"]').isDisabled());
    await page.locator('[data-testid="file-before"]').setInputFiles(img("before.png"));
    await page.locator('[data-testid="file-after"]').setInputFiles(img("after.png"));
    await page.locator('[data-testid="weeks"]').selectOption("12");
    await page.locator('[data-testid="transformation-text"]').fill("10 weeks of Racked");
    await page.locator('[data-testid="transformation-submit"]').click();
    await page.waitForSelector('[data-testid="transformation-composer"]', { state: "detached", timeout: 10000 });
    const tr = body(calls(st, "create_wall_post")[1]);
    check("create_wall_post: transformation with before + after + weeks", tr.p_kind === "transformation" && tr.p_weeks === 12 && JSON.stringify((tr.p_media || []).map((m) => m.label)) === '["before","after"]', JSON.stringify(tr));

    // pump check from the + menu
    await page.locator('[data-testid="nav-plus"]').click();
    await page.locator('[data-testid="create-pump"]').click();
    await page.waitForSelector('[data-testid="pump-sheet"] [data-testid="pump-card"]', { timeout: 8000 }).catch(() => {});
    check("pump check opens in a sheet", (await page.locator('[data-testid="pump-sheet"] [data-testid="pump-card"]').count()) === 1);
    await page.keyboard.press("Escape");
    // composer bar + photo button
    await page.locator('[data-testid="composer-photo"]').click();
    check("photo button opens the composer", (await count(page, '[data-testid="post-composer"]')) === 1);
    await page.keyboard.press("Escape");
    check("no page errors (+ button)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // 7. + from another page posts and comes back Home
  {
    const { ctx, page, st, errors } = await open(browser, "/leaderboard");
    await page.waitForSelector('[data-testid="nav-plus"]');
    await page.locator('[data-testid="nav-plus"]').click();
    await page.locator('[data-testid="create-post"]').click();
    await page.locator('[data-testid="post-text"]').fill("Ranks page post");
    await page.locator('[data-testid="post-submit"]').click();
    await page.waitForURL(/\/home$/, { timeout: 10000 });
    await page.waitForFunction(() => (document.querySelector(".fx-feed")?.textContent || "").includes("Ranks page post"), null, { timeout: 8000 });
    check("posting from Ranks lands on Home with the post", calls(st, "create_wall_post").length === 1);
    check("no page errors (+ elsewhere)", errors.length === 0, errors.join(" | "));
    await ctx.close();
    // signed out: + asks to sign in
    const o = await open(browser, "/leaderboard", (s) => ((s.signedIn = false), s));
    await o.page.waitForSelector('[data-testid="nav-plus"]');
    await o.page.locator('[data-testid="nav-plus"]').click();
    check("signed out: + opens sign in", (await o.page.locator('[data-testid="signin-sheet"]').count()) === 1);
    await o.ctx.close();
  }

  // 8. notices: dismiss a pinned one, it stays dismissed
  {
    const { ctx, page, errors } = await open(browser, "/home");
    await page.waitForSelector('[data-testid="feed-notice"]');
    await page.locator('[data-testid="dismiss-notice"]').click();
    await sleep(300);
    check("dismiss hides the pinned notice", (await count(page, '[data-testid="feed-notice"]')) === 0);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="feed-text"]');
    check("still hidden after reload", (await count(page, '[data-testid="feed-notice"]')) === 0);
    check("no page errors (notices)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // 9. paging: load more
  {
    const { ctx, page, st, errors } = await open(browser, "/home", (s) => s, {
      after: (s) => {
        const now = Date.now();
        for (let i = 0; i < 24; i++) s.wallPosts.push({ id: 500 + i, kind: "text", body: `Older post ${i}`, machine_id: null, mode: "", weeks_apart: null, created_at: new Date(now - (600 + i * 30) * 60000).toISOString(), edited: false, is_mine: false, hidden: false, display_name: "Neha Kulkarni", avatar_url: null, instagram_handle: null, media: [], kudos_count: 0, kudos_mine: false, kudos_names: [] });
      },
    });
    await page.waitForSelector('[data-testid="feed-text"]');
    const first = await count(page, ".fx-feed [data-testid^='feed-text']");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForFunction(() => document.querySelectorAll(".fx-feed [data-testid='feed-text']").length > 10, null, { timeout: 8000 }).catch(() => {});
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(800);
    const pages = calls(st, "home_feed").filter((c) => body(c).p_before);
    check("scrolling to the end loads the next page", pages.length >= 1 && (await count(page, ".fx-feed [data-testid='feed-text']")) > first);
    const keys = await page.evaluate(() => [...document.querySelectorAll(".fx-feed [data-testid='feed-text']")].map((e) => e.textContent));
    check("no duplicates across pages", new Set(keys).size === keys.length);
    check("no page errors (paging)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // 10. before 0014: falls back to workouts + pump photos
  {
    const { ctx, page, errors } = await open(browser, "/home", (s) => ((s.missingRpc.home_feed = true), s));
    await page.waitForSelector('[data-testid="feed-pr"]');
    check("before 0014: workouts + PRs still show", (await count(page, '[data-testid="feed-pr"]')) === 1 && (await count(page, '[data-testid="feed-workout"]')) >= 1);
    check("before 0014: no member posts", (await count(page, '[data-testid="feed-text"]')) === 0);
    await page.locator('[data-testid="filter-posts"]').click();
    await page.waitForSelector('[data-testid="feed-empty"]');
    check("before 0014: posts filter explains", (await text(page, '[data-testid="feed-empty"]')).includes("next app update"));
    check("no page errors (before 0014)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // 11. resume card when I'm at a machine
  {
    const { ctx, page, errors } = await open(browser, "/home", (s) => s, {});
    await page.waitForSelector('[data-testid="feed-text"]');
    check("no resume card when I'm not at a machine", (await count(page, '[data-testid="resume-card"]')) === 0);
    await page.evaluate(() => sessionStorage.setItem("racked:unlocked-machine", JSON.stringify({ machineId: "lat-pulldown-01", unlockedAt: Date.now(), source: "nfc" })));
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="resume-card"]');
    check("resume card goes back to logging", ((await text(page, '[data-testid="resume-card"]'))).includes("Lat Pulldown") && (await page.locator('[data-testid="resume-card"]').getAttribute("href")) === "/machine/lat-pulldown-01/log");
    await page.locator('[data-testid="nav-plus"]').click();
    check("+ menu offers the same shortcut", ((await text(page, '[data-testid="create-resume"]'))).includes("Lat Pulldown"));
    check("no page errors (resume)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // 13. staff: R&R Controls → Feed (notices + offers)
  {
    const { ctx, page, st, errors } = await open(browser, "/rnr?s=feed", (s) => ((s.profile.is_staff = true), s));
    await page.waitForSelector('[data-testid="admin-gym-post"]');
    check("R&R has a Feed section", (await page.locator('[data-testid="rw-sec-feed"]').getAttribute("aria-pressed")) === "true");
    check("lists notices + offers with status", (await count(page, '[data-testid="admin-gym-post"]')) === 2 && (await page.locator('[data-testid="gp-status"]').allTextContents()).every((t) => t.trim() === "Live"));
    check("links to reported posts", (await page.locator('[data-testid="feed-reports-link"]').getAttribute("href")) === "/admin/photos");
    // new notice
    await page.locator('[data-testid="new-notice"]').click();
    await page.waitForSelector('[data-testid="gym-post-form"]');
    check("new notice: preview shows a placeholder card", (await page.locator('[data-testid="gp-preview"] [data-testid="feed-notice"]').count()) === 1);
    await page.locator('[data-testid="save-gym-post"]').click();
    check("needs a title", ((await text(page, '[data-testid="gym-post-form"] .field-error'))).includes("title"));
    await page.locator('[data-testid="gp-title"]').fill("New cable machine is in");
    await page.locator('[data-testid="gp-body"]').fill("Next to the leg press. Staff can show you how.");
    check("preview updates as you type", ((await text(page, '[data-testid="gp-preview"]'))).includes("New cable machine is in"));
    await page.locator('[data-testid="gp-cta-url"]').fill("example.com");
    await page.locator('[data-testid="save-gym-post"]').click();
    check("button link must be https", ((await text(page, '[data-testid="gym-post-form"] .field-error'))).includes("https://") && calls(st, "admin_save_gym_post").length === 0);
    await page.locator('[data-testid="gp-cta-url"]').fill("");
    await page.locator('[data-testid="gp-pinned"]').click();
    check("pinned preview says Pinned", ((await text(page, '[data-testid="gp-preview"]'))).includes("Pinned"));
    await page.locator('[data-testid="save-gym-post"]').click();
    await page.waitForSelector('[data-testid="gym-post-form"]', { state: "detached" });
    const saved = body(calls(st, "admin_save_gym_post")[0]).p || {};
    check("saves a pinned notice", saved.kind === "notice" && saved.title === "New cable machine is in" && saved.pinned === true && saved.active === true && !saved.id, JSON.stringify(saved));
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="admin-gym-post"]').length === 3);
    check("shows in the list", (await count(page, '[data-testid="admin-gym-post"]')) === 3);
    // new offer with brand + code + shop item
    await page.locator('[data-testid="new-offer"]').click();
    await page.locator('[data-testid="gp-title"]').fill("Free shaker with any protein");
    await page.locator('[data-testid="gp-brand"]').selectOption("clean-crate");
    await page.locator('[data-testid="gp-code"]').fill("racked10");
    check("code is upper-cased", (await page.locator('[data-testid="gp-code"]').inputValue()) === "RACKED10");
    check("offer preview: brand + code", ((await text(page, '[data-testid="gp-preview"]'))).includes("The Clean Crate") && ((await text(page, '[data-testid="gp-preview"]'))).includes("RACKED10"));
    check("preview can't be clicked", await page.evaluate(() => document.querySelector('[data-testid="gp-preview"]').hasAttribute("inert")));
    await page.locator('[data-testid="save-gym-post"]').click();
    await page.waitForSelector('[data-testid="gym-post-form"]', { state: "detached" });
    const offer = body(calls(st, "admin_save_gym_post")[1]).p || {};
    check("saves an offer with brand + code", offer.kind === "offer" && offer.sponsor_id === "clean-crate" && offer.code === "RACKED10", JSON.stringify(offer));
    // quick pin / turn off
    const first = page.locator('[data-testid="admin-gym-post"]').filter({ hasText: "Closed Sunday" });
    await first.locator('[data-testid="pin-gym-post"]').click();
    await sleep(400);
    check("quick unpin", JSON.stringify(body(calls(st, "admin_save_gym_post").pop()).p) === JSON.stringify({ id: 41, pinned: false }));
    await page.locator('[data-testid="admin-gym-post"]').filter({ hasText: "15% off" }).locator('[data-testid="toggle-gym-post"]').click();
    await sleep(400);
    check("quick turn off", JSON.stringify(body(calls(st, "admin_save_gym_post").pop()).p) === JSON.stringify({ id: 42, active: false }));
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="admin-gym-post"]')].some((e) => e.textContent.includes("15% off") && e.textContent.includes("Off")));
    // edit + delete (tap twice)
    await page.locator('[data-testid="admin-gym-post"]').filter({ hasText: "New cable machine" }).locator('[data-testid="edit-gym-post"]').click();
    check("edit keeps the values", (await page.locator('[data-testid="gp-title"]').inputValue()) === "New cable machine is in");
    await page.locator('[data-testid="delete-gym-post"]').click();
    check("delete asks again first", calls(st, "admin_delete_gym_post").length === 0 && ((await text(page, '[data-testid="delete-gym-post"]'))).includes("again"));
    await page.locator('[data-testid="delete-gym-post"]').click();
    await page.waitForSelector('[data-testid="gym-post-form"]', { state: "detached" });
    await page.waitForFunction(() => ![...document.querySelectorAll('[data-testid="admin-gym-post"]')].some((e) => e.textContent.includes("New cable machine")), null, { timeout: 5000 }).catch(() => {});
    check("deleted", calls(st, "admin_delete_gym_post").length === 1 && (await page.locator('[data-testid="admin-gym-post"]').filter({ hasText: "New cable machine" }).count()) === 0);
    const res = await axe(page);
    check("axe: R&R Feed", res.length === 0, res.join(" || "));
    check("no page errors (R&R Feed)", errors.length === 0, errors.join(" | "));
    await ctx.close();
    // before 0014
    const m = await open(browser, "/rnr?s=feed", (s) => ((s.profile.is_staff = true), (s.missingRpc.admin_gym_posts = true), s));
    await m.page.waitForSelector('[data-testid="needs-0014"]');
    check("before 0014: asks to run the update", ((await text(m.page, '[data-testid="needs-0014"]'))).includes("0014_social_feed.sql"));
    await m.ctx.close();
  }

  // 14. staff: Reports (posts, comments, pump photos)
  {
    const reported = (s) => {
      s.profile.is_staff = true;
      s.feedReports = {
        posts: [
          { id: 302, kind: "photo", body: "Back day done. New gloves from Jersey Drip.", machine_id: "lat-pulldown-01", mode: "", weeks_apart: null, created_at: new Date(Date.now() - 25 * 60000).toISOString(), edited: false, is_mine: false, hidden: true, hidden_by_staff: false, display_name: "Neha Kulkarni", avatar_url: null, instagram_handle: null, media: [{ path: "u4/p1.jpg", label: null }, { path: "u4/p2.jpg", label: null }], kudos_count: 5, kudos_mine: false, kudos_names: [], author: "Neha", reports: 3, reasons: ["Spam or selling", "Spam or selling", "Something else"] },
          { id: 301, kind: "text", body: "Anyone up for legs at 7 tomorrow?", machine_id: null, mode: "", weeks_apart: null, created_at: new Date(Date.now() - 8 * 60000).toISOString(), edited: false, is_mine: false, hidden: false, hidden_by_staff: false, display_name: "Rahul Mehta", avatar_url: null, instagram_handle: null, media: [], kudos_count: 2, kudos_mine: false, kudos_names: [], author: "Rahul", reports: 1, reasons: ["Rude or hurtful"] },
        ],
        comments: [{ id: 701, body: "Those gloves are clean", created_at: new Date(Date.now() - 20 * 60000).toISOString(), hidden: false, target_type: "wall", target_id: 302, author: "Rahul", reports: 1, reasons: [] }],
      };
      return s;
    };
    const { ctx, page, st, errors } = await open(browser, "/admin", reported);
    await page.waitForSelector('[data-testid="reports-link"]');
    await page.waitForSelector('[data-testid="reports-count"]');
    check("staff overview: Reports with a count", ((await text(page, '[data-testid="reports-count"]'))) === "3");
    await page.locator('[data-testid="reports-link"]').click();
    await page.waitForSelector('[data-testid="reported-post"]');
    check("reports: posts + comments listed", (await count(page, '[data-testid="reported-post"]')) === 2 && (await count(page, '[data-testid="reported-comment"]')) === 1);
    const hidden = page.locator('[data-testid="reported-post"]').first();
    check("auto-hidden post: photos, HIDDEN, 3 reports, reasons once", (await hidden.locator("img").count()) === 2 && ((await hidden.textContent()) || "").includes("HIDDEN") && ((await hidden.textContent()) || "").includes("3 reports") && ((await hidden.textContent()) || "").split("Spam or selling").length === 2);
    check("hidden post has no Hide button", (await hidden.locator('[data-testid="hide-post"]').count()) === 0);
    await hidden.locator('[data-testid="keep-post"]').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="reported-post"]').length === 1);
    check("keep: admin_set_post_hidden(false)", body(calls(st, "admin_set_post_hidden")[0]).p_hidden === false && body(calls(st, "admin_set_post_hidden")[0]).p_id === 302);
    await page.locator('[data-testid="reported-post"] [data-testid="hide-post"]').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="reported-post"]').length === 0);
    check("hide: admin_set_post_hidden(true)", body(calls(st, "admin_set_post_hidden")[1]).p_hidden === true);
    await page.locator('[data-testid="delete-reported-comment"]').click();
    await page.locator('[data-testid="confirm-yes"]').click();
    await sleep(500);
    check("delete a reported comment (after confirming)", calls(st, "delete_comment").length === 1 && body(calls(st, "delete_comment")[0]).p_id === 701);
    const res = await axe(page);
    check("axe: reports", res.length === 0, res.join(" || "));
    check("no page errors (reports)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // 12. 360px, light + dark: no sideways scroll, axe clean (feed + comments)
  for (const theme of ["dark", "light"]) {
    const { ctx, page, errors } = await open(browser, "/home", (s) => s, { width: 360, theme });
    await page.waitForSelector('[data-testid="feed-text"]');
    for (let y = 0; y < 8000; y += 700) { await page.evaluate((yy) => window.scrollTo(0, yy), y); await sleep(60); }
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(400);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`no sideways scroll /home @360 (${theme})`, overflow <= 0, String(overflow));
    const wide = await page.evaluate(() => [...document.querySelectorAll(".fx-feed *")].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1 && !e.closest(".fx-carousel, .fx-filters, .fx-plate")).map((e) => e.className).slice(0, 4));
    check(`nothing sticks out of the cards @360 (${theme})`, wide.length === 0, wide.join(" | "));
    const res = await axe(page);
    check(`axe: feed (${theme})`, res.length === 0, res.join(" || "));
    await page.locator('[data-testid="feed-photo"] [data-testid="comment-btn"]').first().click();
    await page.waitForSelector('[data-testid="comments-sheet"] [data-testid="comment"]');
    const res2 = await axe(page);
    check(`axe: comments (${theme})`, res2.length === 0, res2.join(" || "));
    check(`no page errors (${theme})`, errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${n - bad}/${n} passed`);
  process.exit(bad ? 1 : 0);
})();
