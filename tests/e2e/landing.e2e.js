// Public landing page (/ and /about) + the routing around it (mocked backend).
// Run: see tests/README.md
const { chromium } = require("playwright");
const fs = require("fs");
const { defaultState, setup } = require("./mock");
const BASE = process.env.BASE_URL || "http://localhost:3111";
let n = 0, bad = 0;
const check = (name, ok, extra = "") => { n++; if (!ok) bad++; console.log(ok ? "PASS" : "FAIL", name, ok ? "" : extra); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = (s) => ((s.signedIn = false), s);

async function open(browser, url, mut = out, opts = {}) {
  const ctx = await browser.newContext({
    viewport: { width: opts.width || 1440, height: opts.height || 900 },
    timezoneId: "Asia/Kolkata",
    reducedMotion: opts.reduce ? "reduce" : "no-preference",
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const st = mut(defaultState()) || defaultState();
  await setup(ctx, page, st, BASE);
  await page.goto(BASE + url, { waitUntil: "networkidle" }).catch(() => {});
  return { ctx, page, st, errors };
}
const scrollToStep = (page, i) =>
  page.evaluate((i) => {
    const m = document.querySelector(`[data-step-marker="${i}"]`);
    window.scrollTo(0, m.getBoundingClientRect().top + window.scrollY + 40);
  }, i);

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });

  // ---- visitor lands on /
  {
    const { ctx, page, st, errors } = await open(browser, "/");
    await page.waitForSelector('[data-testid="landing"]');
    check("/ shows the landing page to visitors", true);
    const h1 = (await page.locator("h1").textContent()) || "";
    check("hero says what it is", /tap\. lift\./i.test(h1) && /board/i.test(h1), h1);
    check("no app bottom nav on the landing page", (await page.locator(".bottom-nav").count()) === 0);
    check("big CTA in hero, after walkthrough and at the end", (await page.locator('[data-testid="lp-hero-cta"], [data-testid="lp-mid-cta"], [data-testid="lp-final-cta"]').count()) === 3);
    await page.waitForFunction(() => (document.querySelector('[data-testid="lp-ticker"]')?.textContent || "").includes("lifters"));
    const tick = (await page.locator('[data-testid="lp-ticker"] .sr-only').textContent()) || "";
    check("live ticker shows today's real numbers", tick.includes("5 lifters") && tick.includes("32 sets") && tick.includes("22,280 kg moved") && tick.includes("4 new PBs"), tick);
    check("ticker never shows emails or handles", !tick.includes("@"));
    const ig = page.locator('a[href="https://www.instagram.com/bijlee.run/"]').first();
    check("links to Bijlee Instagram in a new tab", (await ig.getAttribute("target")) === "_blank" && ((await ig.getAttribute("rel")) || "").includes("noopener"));
    check("links to bijlee.run", (await page.locator('a[href="https://www.bijlee.run"]').count()) >= 1);
    await page.locator('[data-testid="lp-hero-cta"]').click();
    await sleep(800);
    const auth = st.calls.find((c) => c.startsWith("auth:authorize")) || "";
    check("hero CTA starts Google sign-in", auth.includes("provider=google"), auth);
    check("...and lands in the app (/home) afterwards", decodeURIComponent(decodeURIComponent(auth)).includes("/auth/callback?next=/home"), auth);
    check("no page errors (landing)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // ---- members skip the landing page; /about still shows it
  {
    const { ctx, page, errors } = await open(browser, "/", (s) => s);
    await page.waitForURL((u) => new URL(u).pathname === "/home", { timeout: 15000 });
    check("signed-in member at / goes to /home", true);
    await page.waitForSelector('[data-testid="tile-week"]', { timeout: 15000 }).catch(() => {});
    check("app home renders at /home", (await page.locator('[data-testid="tile-week"]').count()) === 1);
    const home = page.locator('.bottom-nav a[aria-current="page"]');
    check("bottom nav Home tab is /home and active", (await home.getAttribute("href")) === "/home");
    check("no page errors (member redirect)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(browser, "/about", (s) => s);
    await page.waitForSelector('[data-testid="landing"]');
    await sleep(800);
    check("/about shows the landing page to members too", new URL(page.url()).pathname === "/about");
    const cta = page.locator('[data-testid="lp-hero-cta"]');
    check("member CTA says Open Racked and links to /home", (await cta.getAttribute("href")) === "/home" && /open racked/i.test((await cta.textContent()) || ""));
    await ctx.close();
  }

  // ---- empty gym / data down
  {
    const { ctx, page } = await open(browser, "/", (s) => ((s.signedIn = false), (s.tvBoards = []), (s.tvActivity = []), s));
    await page.waitForFunction(() => (document.querySelector('[data-testid="lp-ticker"] .sr-only')?.textContent || "").includes("Nobody"));
    check("empty gym: ticker invites the first set", ((await page.locator('[data-testid="lp-ticker"] .sr-only').textContent()) || "").includes("first set takes #1"));
    await ctx.close();
  }
  {
    const { ctx, page, errors } = await open(browser, "/", (s) => ((s.signedIn = false), (s.failRpc.tv_activity = true), s));
    await sleep(1500);
    const tick = (await page.locator('[data-testid="lp-ticker"] .sr-only').textContent()) || "";
    check("data down: ticker falls back to brand lines", tick.includes("Built by Bijlee Run Club"), tick);
    check("data down: page still works", (await page.locator('[data-testid="lp-hero-cta"]').isEnabled()) && errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // ---- the walkthrough follows the scroll (with and without motion)
  for (const reduce of [false, true]) {
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      const tag = `${w}px${reduce ? ", reduced motion" : ""}`;
      const { ctx, page, errors } = await open(browser, "/", out, { width: w, height: h, reduce });
      await page.waitForSelector('[data-testid="landing"]');
      const seen = [];
      for (let i = 0; i < 4; i++) {
        await scrollToStep(page, i);
        await sleep(reduce ? 500 : 1600);
        const cur = await page.locator('[data-testid="lp-steps"] li[aria-current="step"]').evaluate((el) => [...el.parentNode.children].indexOf(el)).catch(() => -1);
        const on = await page.locator(".lp-story .ps.on").getAttribute("data-screen").catch(() => null);
        seen.push(`${cur}/${on}`);
      }
      check(`walkthrough steps 1→4 follow the scroll (${tag})`, seen.join(",") === "0/0,1/1,2/2,3/3", seen.join(","));
      if (w === 1440) {
        await page.locator(".lp-step-btn").first().click();
        await sleep(reduce ? 600 : 1800);
        check(`clicking a step jumps to it (${tag})`, (await page.locator(".lp-story .ps.on").getAttribute("data-screen")) === "0");
        const kg = (await page.locator(".lp-story .ps-weight-val").textContent()) || "";
        check(`log screen ends on 60 kg (${tag})`, kg.trim() === "60", kg);
      }
      if (reduce) {
        const anim = await page.locator(".lp-hero-title .l1").evaluate((el) => getComputedStyle(el).animationName);
        check(`reduced motion: hero headline isn't animated (${tag})`, anim === "none", anim);
      }
      check(`no page errors (walkthrough, ${tag})`, errors.length === 0, errors.join(" | "));
      await ctx.close();
    }
  }

  // ---- live gym TV + FAQ
  {
    const { ctx, page, errors } = await open(browser, "/");
    check("TV isn't loaded until you get near it", (await page.locator('[data-testid="lp-tv-frame"]').count()) === 0);
    await page.evaluate(() => document.querySelector("#tv").scrollIntoView());
    await page.waitForSelector('[data-testid="lp-tv-frame"]', { timeout: 10000 });
    check("TV section embeds the real /tv", ((await page.locator('[data-testid="lp-tv-frame"]').getAttribute("src")) || "").startsWith("/tv"));
    const frame = page.frameLocator('[data-testid="lp-tv-frame"]');
    await frame.locator("[data-testid^=slide-]").first().waitFor({ timeout: 15000 }).catch(() => {});
    check("embedded TV is running", (await frame.locator("[data-testid^=slide-]").count()) === 1);
    const qa = page.locator(".lp-qa").filter({ hasText: "Where can I use it?" });
    await qa.locator("summary").click();
    check("FAQ opens on click", (await qa.getAttribute("open")) !== null);
    check("FAQ answer mentions Pune", ((await qa.locator("p").textContent()) || "").includes("Pune"));
    check("no page errors (TV + FAQ)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // ---- metadata, manifest, sitemap
  {
    const { ctx, page } = await open(browser, "/");
    check("link preview image set", ((await page.locator('meta[property="og:image"]').getAttribute("content")) || "").endsWith("/og.png"));
    check("title names Racked by Bijlee", (await page.title()).includes("Racked by Bijlee"));
    const og = await fetch(BASE + "/og.png");
    check("og.png is served", og.ok && (og.headers.get("content-type") || "").includes("image/png"));
    const man = await fetch(BASE + "/manifest.webmanifest").then((r) => r.json());
    check("installed app opens on /home", man.start_url === "/home");
    const sm = await fetch(BASE + "/sitemap.xml").then((r) => r.text());
    check("sitemap lists / and /join", sm.includes("/join") && /<loc>[^<]+\/<\/loc>/.test(sm));
    const rb = await fetch(BASE + "/robots.txt").then((r) => r.text());
    check("robots points at the sitemap", rb.includes("Sitemap:") && rb.includes("Disallow: /tv"));
    await ctx.close();
  }

  // ---- layout: nothing sideways, no clipped headlines, every width.
  // Measured with reduced motion so scroll animations that haven't played
  // yet (words still scaled up) don't count as overflow.
  for (const [w, h] of [[360, 740], [390, 844], [768, 1024], [1280, 800], [1440, 900], [1920, 1080]]) {
    const { ctx, page, errors } = await open(browser, "/", out, { width: w, height: h, reduce: true });
    await page.waitForSelector('[data-testid="landing"]');
    await sleep(1200);
    const res = await page.evaluate(() => {
      const W = window.innerWidth;
      const over = document.documentElement.scrollWidth - W;
      const clipped = [...document.querySelectorAll(".lp-line, .lp-hero-title > span, .lp-club-head, .lp-final-title")]
        .filter((el) => el.scrollWidth > el.clientWidth + 2)
        .map((el) => el.textContent.trim().slice(0, 24));
      const off = [...document.querySelectorAll(".lp-hero-title > span, .lp-hero-actions, .lp-nav > *")]
        .filter((el) => el.getBoundingClientRect().right > W + 1)
        .map((el) => el.className || el.tagName);
      const navOverlap = (() => {
        const a = document.querySelector(".lp-lockup")?.getBoundingClientRect();
        const b = document.querySelector('[data-testid="lp-nav-cta"]')?.getBoundingClientRect();
        return a && b && a.right > b.left - 4;
      })();
      return { over, clipped, off, navOverlap };
    });
    check(`no sideways scroll at ${w}px`, res.over <= 0, String(res.over));
    check(`no clipped headlines at ${w}px`, res.clipped.length === 0, res.clipped.join(" | "));
    check(`hero + nav fit at ${w}px`, res.off.length === 0 && !res.navOverlap, res.off.join(",") + (res.navOverlap ? " nav overlap" : ""));
    check(`no page errors at ${w}px`, errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // ---- accessibility
  const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
  for (const [w, h] of [[390, 844], [1440, 900]]) {
    const { ctx, page } = await open(browser, "/", out, { width: w, height: h, reduce: true });
    await sleep(1200);
    await page.addScriptTag({ content: axeSrc });
    const res = await page.evaluate(async () => {
      // eslint-disable-next-line no-undef
      const r = await axe.run(document, { runOnly: ["wcag2a", "wcag2aa"], resultTypes: ["violations"] });
      return r.violations.filter((v) => ["serious", "critical"].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((x) => x.target.join(" ")).join(", ")}`);
    });
    check(`axe: no serious issues on the landing page (${w}px)`, res.length === 0, res.join(" || "));
    const h1s = await page.locator("h1").count();
    check(`one h1 (${w}px)`, h1s === 1, String(h1s));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(browser, "/", out, { width: 1440, height: 900 });
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement?.className || document.activeElement?.tagName);
    check("keyboard: Tab reaches the nav", /lp-lockup|lp-nav|skip/.test(focused) || focused === "A", focused);
    await ctx.close();
  }

  await browser.close();
  console.log(`${n - bad}/${n} passed`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
