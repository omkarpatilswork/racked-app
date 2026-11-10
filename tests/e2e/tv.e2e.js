// Gym TV (/tv) + the /join page its QR code opens (mocked backend).
// Run: see tests/README.md
const { chromium } = require("playwright");
const fs = require("fs");
const { defaultState, setup } = require("./mock");
const BASE = process.env.BASE_URL || "http://localhost:3111";
let n = 0, bad = 0;
const check = (name, ok, extra = "") => { n++; if (!ok) bad++; console.log(ok ? "PASS" : "FAIL", name, ok ? "" : extra); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const signedOut = (s) => ((s.signedIn = false), s);
const empty = (s) => ((s.signedIn = false), (s.tvBoards = []), (s.tvActivity = []), s);

async function open(browser, url, mut = (s) => s, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: opts.width || 1920, height: opts.height || 1080 }, timezoneId: "Asia/Kolkata" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  if (opts.theme) await page.addInitScript((t) => localStorage.setItem("racked:theme", t), opts.theme);
  if (opts.clock) await page.clock.install();
  const st = mut(defaultState()) || defaultState();
  await setup(ctx, page, st, BASE);
  await page.goto(BASE + url, { waitUntil: "networkidle" }).catch(() => {});
  return { ctx, page, st, errors };
}
const slideKind = (page) => page.locator("[data-testid^=slide-]").first().getAttribute("data-testid");

// every visible element of the current slide sits fully on screen (nothing
// cut off by the edge of the TV, nothing hidden under the footer)
async function offscreen(page) {
  return page.evaluate(() => {
    const W = window.innerWidth, H = window.innerHeight;
    const out = [];
    document.querySelectorAll(".tv *").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      if (el.closest(".tv-aurora") || el.closest(".tv-progress")) return;
      if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1) out.push(`${el.className || el.tagName} ${Math.round(r.right)}x${Math.round(r.bottom)}`);
    });
    // the slide body must not run into the footer bar
    const foot = document.querySelector(".tv-foot");
    const slide = document.querySelector("[data-testid^=slide-]");
    if (foot && slide) {
      const fTop = foot.getBoundingClientRect().top;
      slide.querySelectorAll("*").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width && r.height && r.bottom > fTop + 2) out.push(`under footer: ${el.className || el.tagName}`);
      });
    }
    return out.slice(0, 6);
  });
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });

  // ---- full rotation at 1080p
  {
    const { ctx, page, errors } = await open(browser, "/tv", signedOut);
    await page.waitForSelector('[data-testid="slide-join"]');
    check("TV opens on the 'Join Racked' slide", true);
    const qr = await page.locator('[data-testid="slide-join"] [data-testid="tv-qr"]').getAttribute("data-value");
    check("QR points at /join?src=tv on this site", qr === `${BASE}/join?src=tv`, qr);
    check("QR is drawn (svg)", (await page.locator('[data-testid="slide-join"] [data-testid="tv-qr"] svg').count()) === 1);
    check("join slide shows live proof", ((await page.locator('[data-testid="tv-proof"]').textContent()) || "").includes("5 lifters"));
    check("no corner QR on the join slide (big one is there)", (await page.locator('[data-testid="tv-corner-qr"]').count()) === 0);
    const dots = await page.locator(".tv-dots i").count();
    check("7 slides for 4 boards", dots === 7, String(dots));

    const kinds = [];
    const issues = [];
    for (let i = 0; i < dots; i++) {
      await sleep(1700);
      const k = await slideKind(page);
      kinds.push(k);
      const off = await offscreen(page);
      if (off.length) issues.push(`${i}:${k} ${off.join(", ")}`);
      if (k !== "slide-join") {
        if ((await page.locator('[data-testid="tv-corner-qr"]').count()) !== 1) issues.push(`${i}:${k} no corner QR`);
      }
      if (k === "slide-totals") {
        check("totals counts up to 22,280 kg", ((await page.locator('[data-testid="tv-kg"]').textContent()) || "").includes("22,280"));
        check("totals gives a fun equivalent", ((await page.locator(".tv-equiv").textContent()) || "").includes("elephants"));
      }
      if (k === "slide-board" && i === 2) {
        const t = (await page.locator('[data-testid="slide-board"]').textContent()) || "";
        check("first board is Lat Pulldown with a 'beat' challenge", t.includes("Lat Pulldown") && ((await page.locator('[data-testid="tv-beat"]').textContent()) || "").includes("Asha"));
        check("podium shows top 3", (await page.locator(".tv-pod:not(.empty)").count()) === 3);
        check("places 4-5 listed below", (await page.locator(".tv-row").count()) === 2);
      }
      if (k === "slide-board" && ((await page.locator('[data-testid="slide-board"]').textContent()) || "").includes("Chest Press")) {
        check("a board with one lifter invites #2 and #3", (await page.locator(".tv-pod.empty").count()) === 2);
      }
      await page.keyboard.press("ArrowRight");
    }
    check(
      "rotation order: join, totals, 3 boards, floor, board",
      kinds.join(",") === "slide-join,slide-totals,slide-board,slide-board,slide-board,slide-activity,slide-board",
      kinds.join(",")
    );
    check("nothing off-screen or under the footer at 1920x1080", issues.length === 0, issues.join(" | "));
    await sleep(1700);
    check("wraps back round to the join slide", (await slideKind(page)) === "slide-join");
    await page.keyboard.press("ArrowLeft");
    await sleep(400);
    check("left arrow goes back", (await slideKind(page)) === "slide-board");
    const body = (await page.locator("body").textContent()) || "";
    check("no emails or @handles on the TV", !body.includes("@") && !body.includes("omi.lifts"));
    check("nav hidden on the TV", (await page.locator(".bottom-nav").count()) === 0);
    check("no page errors (TV, full)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // ---- smaller / odd screens still fit
  for (const [w, h] of [[1280, 720], [1366, 768], [1920, 1200]]) {
    const { ctx, page, errors } = await open(browser, "/tv", signedOut, { width: w, height: h });
    await page.waitForSelector('[data-testid="slide-join"]');
    const issues = [];
    const dots = await page.locator(".tv-dots i").count();
    for (let i = 0; i < dots; i++) {
      await sleep(1500);
      const off = await offscreen(page);
      if (off.length) issues.push(`${i}:${await slideKind(page)} ${off.join(", ")}`);
      await page.keyboard.press("ArrowRight");
    }
    const scroll = await page.evaluate(() => [document.documentElement.scrollWidth - innerWidth, document.documentElement.scrollHeight - innerHeight]);
    check(`fits at ${w}x${h}`, issues.length === 0 && scroll[0] <= 0 && scroll[1] <= 0, issues.join(" | ") + " scroll " + scroll);
    check(`no page errors at ${w}x${h}`, errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // ---- empty gym (nobody has lifted yet)
  {
    const { ctx, page, errors } = await open(browser, "/tv", empty);
    await page.waitForSelector('[data-testid="slide-join"]');
    check("empty gym: just join + 'wide open' (no 0 kg slide)", (await page.locator(".tv-dots i").count()) === 2);
    check("empty gym: proof chip invites the first set", ((await page.locator('[data-testid="tv-proof"]').textContent()) || "").toLowerCase().includes("first set"));
    await page.keyboard.press("ArrowRight");
    await page.waitForSelector('[data-testid="slide-open"]');
    check("open slide lists all 10 machines as free", (await page.locator(".tv-open-cell").count()) === 10);
    await sleep(1500);
    const off = await offscreen(page);
    check("open slide fits", off.length === 0, off.join(", "));
    check("no page errors (TV, empty)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // ---- timing: auto-advance survives the 10s refresh; "Reconnecting" when the internet drops
  {
    const { ctx, page, st, errors } = await open(browser, "/tv", signedOut, { clock: true });
    await page.waitForSelector('[data-testid="slide-join"]');
    check("header says Live", ((await page.locator('[data-testid="tv-live"]').textContent()) || "").includes("Live"));
    await page.clock.fastForward(10_500); // a refresh lands mid-slide...
    await sleep(600);
    await page.clock.fastForward(2_000); // ...and the 12s join slide still ends on time
    await sleep(300);
    check("join slide advances after 12s even with a refresh mid-slide", (await slideKind(page)) === "slide-totals");
    st.failRpc.tv_boards = true;
    for (let i = 0; i < 5; i++) {
      await page.clock.fastForward(10_000);
      await sleep(300);
    }
    check("shows 'Reconnecting' when updates keep failing", ((await page.locator('[data-testid="tv-live"]').textContent()) || "").includes("Reconnecting"));
    check("keeps showing the last good slides meanwhile", (await page.locator("[data-testid^=slide-]").count()) === 1);
    st.failRpc.tv_boards = false;
    await page.clock.fastForward(10_000);
    await sleep(600);
    await page.clock.fastForward(1_000);
    await sleep(300);
    check("back to Live once the connection returns", ((await page.locator('[data-testid="tv-live"]').textContent()) || "").includes("Live"));
    await page.keyboard.press(" ");
    const before = await slideKind(page);
    await page.clock.fastForward(30_000);
    await sleep(300);
    check("space bar pauses the show", (await slideKind(page)) === before);
    check("no page errors (timing)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // ---- /join: the page behind the QR code
  {
    const { ctx, page, st, errors } = await open(browser, "/join?src=tv", signedOut, { width: 390, height: 844 });
    await page.waitForSelector('[data-testid="join-out"]');
    check("join: says they came from the gym screen", ((await page.locator('[data-testid="join-out"] .eyebrow').textContent()) || "").includes("gym screen"));
    await page.waitForSelector('[data-testid="join-live"]');
    const live = (await page.locator('[data-testid="join-live"]').textContent()) || "";
    check("join: live numbers from today", live.includes("5") && live.includes("32") && live.includes("Lifters"));
    check("join: shows a lift to beat (first name only)", ((await page.locator('[data-testid="join-beat"]').textContent()) || "").includes("Asha") && !live.includes("@"));
    check("join: explains what the TV shows", ((await page.locator('[data-testid="join-trust"]').textContent()) || "").includes("first name"));
    await page.locator('[data-testid="join-google"]').click();
    await sleep(800);
    const auth = st.calls.find((c) => c.startsWith("auth:authorize")) || "";
    check("join: one tap starts Google sign-in", auth.includes("provider=google"), auth);
    check("join: comes back to the home screen after sign-in", decodeURIComponent(decodeURIComponent(auth)).includes("/auth/callback?next=/"), auth);
    check("no page errors (join)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(browser, "/join", signedOut, { width: 390, height: 844 });
    await page.waitForSelector('[data-testid="join-out"]');
    check("join without ?src: neutral eyebrow", !((await page.locator('[data-testid="join-out"] .eyebrow').textContent()) || "").includes("gym screen"));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(browser, "/join?src=tv", empty, { width: 390, height: 844 });
    await page.waitForSelector('[data-testid="join-first"]');
    check("join (empty gym): 'your first set puts you at #1'", ((await page.locator('[data-testid="join-first"]').textContent()) || "").includes("#1"));
    await ctx.close();
  }
  {
    const { ctx, page, errors } = await open(browser, "/join?src=tv", (s) => ((s.signedIn = false), (s.failRpc.tv_boards = true), s), { width: 390, height: 844 });
    await page.waitForSelector('[data-testid="join-google"]');
    await sleep(800);
    check("join still works when live numbers fail", (await page.locator('[data-testid="join-google"]').isEnabled()) && errors.length === 0, errors.join(" | "));
    await ctx.close();
  }
  {
    const { ctx, page, st, errors } = await open(browser, "/join?src=tv", (s) => s, { width: 390, height: 844 });
    await page.waitForSelector('[data-testid="join-in"]');
    check("join (signed in): 'you're in' with first name", ((await page.locator('[data-testid="join-in"] h1').textContent()) || "").includes(st.profile.display_name.split(" ")[0]));
    check("join (signed in): no Google button", (await page.locator('[data-testid="join-google"]').count()) === 0);
    await page.locator('[data-testid="join-home"]').click();
    await page.waitForURL((u) => new URL(u).pathname === "/");
    check("join (signed in): 'Go to my home' works", true);
    check("no page errors (join signed in)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // ---- robots: /join is public, /tv is not indexed
  {
    const r = await fetch(BASE + "/robots.txt").then((x) => x.text());
    check("robots: /tv blocked, /join allowed", r.includes("Disallow: /tv") && !r.includes("/join"));
  }

  // ---- a11y + layout on /join
  const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
  for (const [label, mut] of [["out", signedOut], ["empty", empty], ["in", (s) => s]]) {
    for (const theme of ["dark", "light"]) {
      const { ctx, page, errors } = await open(browser, "/join?src=tv", mut, { width: 360, height: 780, theme });
      await sleep(1000);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check(`no sideways scroll /join ${label} (${theme})`, overflow <= 0, String(overflow));
      await page.addScriptTag({ content: axeSrc });
      const res = await page.evaluate(async () => {
        // eslint-disable-next-line no-undef
        const r = await axe.run(document, { runOnly: ["wcag2a", "wcag2aa"], resultTypes: ["violations"] });
        return r.violations.filter((v) => ["serious", "critical"].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((x) => x.target.join(" ")).join(", ")}`);
      });
      check(`axe: no serious issues /join ${label} (${theme})`, res.length === 0, res.join(" || "));
      check(`no page errors /join ${label} (${theme})`, errors.length === 0, errors.join(" | "));
      await ctx.close();
    }
  }

  await browser.close();
  console.log(`${n - bad}/${n} passed`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
