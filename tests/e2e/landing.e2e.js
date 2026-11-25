// Public landing page (/, /landing and /about) + the routing around it (mocked backend).
// Landing v2: the 5-step flow on the first screen, five app screens, For brands,
// One loop + For gyms; the old scroll walkthrough is switched off.
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
const FLOW = ["01Tap or scan", "02Sign in", "03Log your set", "04You\u2019re on the board", "05Compete & win"];

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });

  // ---- visitor lands on /
  {
    const { ctx, page, st, errors } = await open(browser, "/");
    await page.waitForSelector('[data-testid="landing"]');
    check("/ shows the landing page to visitors", true);
    const h1 = (await page.locator("h1").textContent()) || "";
    check("hero says what it is: Tap or scan. Log. Win", /tap or scan\.\s*log\./i.test(h1) && /win/i.test(h1), h1);
    check("no app bottom nav on the landing page", (await page.locator(".bottom-nav").count()) === 0);
    check("big CTA in the hero and at the end", (await page.locator('[data-testid="lp-hero-cta"], [data-testid="lp-final-cta"]').count()) === 2 && (await page.locator('[data-testid="lp-mid-cta"]').count()) === 0);
    check("nav: How it works · The app · For brands · For gyms", (await page.locator(".lp-nav-links a").evaluateAll((as) => as.map((a) => a.getAttribute("href")))).join(",") === "#how,#the-app,#brands,#gyms");
    check("one short line under the headline", ((await page.locator(".lp-lede").textContent()) || "").trim() === "The gym app with nothing to download.");
    check("hero phone shows the real Home screen", await page.locator('.lp-hero-phone img[src="/landing/app/home.webp"]').evaluate((i) => i.complete && i.naturalWidth === 600));
    check("For brands link next to the main button", (await page.locator('[data-testid="lp-hero-brands"]').getAttribute("href")) === "#brands");
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

  // ---- members skip the landing page at /; /landing and /about still show it
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
    const { ctx, page, errors } = await open(browser, "/landing", (s) => s);
    await page.waitForSelector('[data-testid="landing"]');
    await sleep(800);
    check("/landing shows the landing page to members too (no redirect)", new URL(page.url()).pathname === "/landing");
    check("/landing: no app nav, Open Racked", (await page.locator(".bottom-nav").count()) === 0 && /open racked/i.test((await page.locator('[data-testid="lp-hero-cta"]').textContent()) || ""));
    const canon = (await page.locator('link[rel="canonical"]').getAttribute("href")) || "";
    check("/landing: canonical is /", new URL(canon, BASE).pathname === "/", canon);
    check("no page errors (/landing as a member)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }
  for (const [url, hash] of [["/brands", "#brands"], ["/gyms", "#gyms"]]) {
    const { ctx, page } = await open(browser, url);
    await page.waitForSelector('[data-testid="landing"]');
    await sleep(700);
    const u = new URL(page.url());
    const top = await page.evaluate((h) => document.querySelector(h).getBoundingClientRect().top, hash);
    check(`${url} opens /landing${hash}, scrolled to it`, u.pathname === "/landing" && u.hash === hash && Math.abs(top) < 140, `${page.url()} top=${top}`);
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

  // ---- how it works: the 5-step flow, on the first screen (with and without motion)
  for (const reduce of [false, true]) {
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      const tag = `${w}px${reduce ? ", reduced motion" : ""}`;
      const { ctx, page, errors } = await open(browser, "/", out, { width: w, height: h, reduce });
      await page.waitForSelector('[data-testid="lp-flow"]');
      await sleep(600);
      const steps = await page.locator('[data-testid="lp-flow"] .lp3-t').allTextContents();
      check(`flow: 5 steps, tap/scan → sign in → log → board → win (${tag})`, steps.map((t) => t.trim()).join("|") === FLOW.join("|"), steps.join("|"));
      const fit = await page.evaluate(() => { const r = document.querySelector('[data-testid="lp-flow"] li:last-child').getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0; });
      check(`flow: all 5 steps on the first screen (${tag})`, fit);
      const anims = await page.locator('[data-testid="lp-flow"] li').evaluateAll((ls) => ls.map((l) => getComputedStyle(l, "::after").animationName));
      if (reduce) {
        const anim = await page.locator(".lp-hero-title .l1").evaluate((el) => getComputedStyle(el).animationName);
        check(`reduced motion: hero headline isn't animated (${tag})`, anim === "none", anim);
        const firstOn = await page.locator('[data-testid="lp-flow"] li').first().evaluate((l) => getComputedStyle(l, "::after").opacity);
        check(`reduced motion: no moving glow, step 1 lit (${tag})`, anims.every((a) => a === "none") && firstOn === "1", anims.join(",") + " " + firstOn);
      } else {
        check(`flow: the glow walks through the steps (${tag})`, anims.every((a) => a === "lp3Glow"), anims.join(","));
      }
      check(`old scroll walkthrough + "Built to keep you coming back" are off (${tag})`, (await page.locator(".lp-story, .lp-features").count()) === 0);
      check(`no page errors (flow, ${tag})`, errors.length === 0, errors.join(" | "));
      await ctx.close();
    }
  }

  // ---- the app, for brands, one loop + for gyms
  {
    const { ctx, page, errors } = await open(browser, "/", out, { reduce: true });
    await page.waitForSelector('[data-testid="lp-screens"]');
    await page.evaluate(() => document.querySelector("#the-app").scrollIntoView());
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="lp-screens"] img')].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 10000 }).catch(() => {});
    const caps = await page.locator('[data-testid="lp-screens"] figcaption b').allTextContents();
    check("the app: five real screens (Home, Log a set, Ranks, Rewards, You)", caps.join(",") === "Home,Log a set,Ranks,Rewards,You", caps.join(","));
    check("the app: every screenshot loads", await page.locator('[data-testid="lp-screens"] img').evaluateAll((is) => is.length === 5 && is.every((i) => i.complete && i.naturalWidth === 600)));
    check("the app: 4 short promises", (await page.locator(".lp3-pills li").allTextContents()).join(",") === "No download,Any phone,Fair play built in,Private by default");
    check("TV: 4 pills", (await page.locator(".lp-tv-facts.pills li").count()) === 4);
    await page.evaluate(() => document.querySelector("#brands").scrollIntoView());
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="lp-brand-ways"] img')].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 10000 }).catch(() => {});
    const ways = await page.locator('[data-testid="lp-brand-ways"] h3').allTextContents();
    check("brands: 4 ways in", ways.join(",") === "Weekly prizes,Your own challenge,Ads on the gym TV,Your page in the app", ways.join(","));
    check("brands: every picture loads", await page.locator('[data-testid="lp-brand-ways"] img').evaluateAll((is) => is.length === 4 && is.every((i) => i.complete && i.naturalWidth > 0)));
    check("brands: what they see (taps, scans, codes)", (await page.locator(".lp2-report li").allTextContents()).join(",") === "App taps,TV QR scans,Codes claimed");
    check("brands: partners at launch", (await page.locator(".lp2-logos span").allTextContents()).join(",") === "Jersey Drip,The Clean Crate");
    const cta = page.locator('[data-testid="lp-partner-cta"]');
    check("brands: Become a partner opens an Instagram DM in a new tab", (await cta.getAttribute("href")) === "https://ig.me/m/bijlee.run" && (await cta.getAttribute("target")) === "_blank" && ((await cta.getAttribute("rel")) || "").includes("noopener"));
    check("one loop: lifters → gyms → brands", (await page.locator(".lp2-node .who").allTextContents()).join(",") === "Lifters · free,Gyms,Brands");
    check("gyms: Talk to us", (await page.locator('[data-testid="lp-gym-cta"]').getAttribute("href")) === "https://ig.me/m/bijlee.run");
    check("Bijlee Run Club section and the giant RACKED are still there", (await page.locator(".lp-club .lp-club-head").count()) === 1 && (await page.locator(".lp-giant").count()) === 1 && (await page.locator('[data-testid="lp-final-cta"]').count()) === 1);
    check("footer links to brands + gyms", (await page.locator('.lp-footer a[href="#brands"], .lp-footer a[href="#gyms"]').count()) === 2);
    const words = await page.evaluate(() => (document.querySelector(".lp-hero").innerText + " " + document.querySelector("#the-app").innerText).split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length);
    check("short copy: first screen + the app under 150 words", words < 150, String(words));
    check("no page errors (sections)", errors.length === 0, errors.join(" | "));
    await ctx.close();
    const weights = await Promise.all(["home", "log", "ranks", "rewards", "you", "brand-prizes", "brand-challenge", "brand-tv", "brand-page"].map((n) => fetch(`${BASE}/landing/app/${n}.webp`).then(async (r) => (r.ok ? (await r.arrayBuffer()).byteLength : 1e9))));
    const total = weights.reduce((a, b) => a + b, 0);
    check("screenshots are light (all 9 under 400 KB)", total < 400 * 1024, `${Math.round(total / 1024)} KB`);
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
      const clipped = [...document.querySelectorAll(".lp-line, .lp-hero-title > span, .lp-club-head, .lp-final-title, .lp3-t, .lp2-fcopy h3, .lp2-node h3")]
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
    for (let y = 0; y < 12000; y += 800) { await page.evaluate((yy) => window.scrollTo(0, yy), y); await sleep(60); }
    await page.evaluate(() => window.scrollTo(0, 0));
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
