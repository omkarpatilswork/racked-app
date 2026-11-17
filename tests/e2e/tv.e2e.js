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

  // ---- full rotation at 1080p (default slide settings)
  {
    const { ctx, page, errors } = await open(browser, "/tv", signedOut);
    await page.waitForSelector('[data-testid="slide-join"]');
    check("TV opens on the 'Join Racked' slide", true);
    const qr = await page.locator('[data-testid="slide-join"] [data-testid="tv-qr"]').getAttribute("data-value");
    check("QR points at /join?src=tv on this site", qr === `${BASE}/join?src=tv`, qr);
    check("QR is drawn (svg)", (await page.locator('[data-testid="slide-join"] [data-testid="tv-qr"] svg').count()) === 1);
    check("join slide shows live proof", ((await page.locator('[data-testid="tv-proof"]').textContent()) || "").includes("5 lifters"));
    check("no corner QR on the join slide (big one is there)", (await page.locator('[data-testid="tv-corner-qr"]').count()) === 0);
    await sleep(900);
    const qrBox = await page.evaluate(() => {
      const card = document.querySelector(".tv-qr-card").getBoundingClientRect();
      const svg = document.querySelector('[data-testid="slide-join"] [data-testid="tv-qr"] svg').getBoundingClientRect();
      return { dx: Math.abs(card.left + card.width / 2 - (svg.left + svg.width / 2)) };
    });
    check("join QR sits in the middle of its card", qrBox.dx <= 2, JSON.stringify(qrBox));
    check("footer says tap or scan the sticker", ((await page.locator(".tv-foot-msg").textContent()) || "").includes("Tap or scan the sticker on any machine"));
    await sleep(1200);
    const dots = await page.locator(".tv-dots i").count();
    check("one loop = 15 slides with the suggested settings", dots === 15, String(dots));

    const kinds = [];
    const issues = [];
    const boards = [];
    for (let i = 0; i < dots; i++) {
      await sleep(1500);
      const k = await slideKind(page);
      kinds.push(k);
      const off = await offscreen(page);
      if (off.length) issues.push(`${i}:${k} ${off.join(", ")}`);
      const corner = await page.locator('[data-testid="tv-corner-qr"]').count();
      if ((k === "slide-join" || k === "slide-partner") !== (corner === 0)) issues.push(`${i}:${k} corner QR ${corner}`);
      const t = (await page.locator("[data-testid^=slide-]").first().textContent()) || "";
      if (k === "slide-board") {
        boards.push(t);
        if (t.includes("Lat Pulldown")) {
          check("Lat Pulldown: top 3 rows, 'Beat Asha?'", (await page.locator(".tv-mrow:not(.open)").count()) === 3 && ((await page.locator('[data-testid="tv-beat"]').textContent()) || "").includes("Beat Asha?"));
          check("#1 is highlighted", (await page.locator(".tv-mrow.r1").count()) === 1);
        }
        if (t.includes("Chest Press")) {
          check("short board filled with best-ever lifts, marked", (await page.locator(".tv-mrow.ever").count()) === 2 && (t.match(/Best ever/g) || []).length === 2 && t.includes("Vikram"), t);
          check("today's #1 stays #1 above the best-ever lifts", ((await page.locator(".tv-mrow").first().textContent()) || "").includes("Omi"));
        }
        if (t.includes("Pec Fly")) check("a board with one lifter shows open places", (await page.locator(".tv-mrow.open").count()) === 2);
      }
      if (k === "slide-today") {
        const n = async (x) => ((await page.locator(`[data-testid="tv-split-${x}"] .tv-split-n`).textContent()) || "").trim();
        check("push / pull / legs: people per split (someone doing two counts in both)", (await n("push")) === "2" && (await n("pull")) === "5" && (await n("legs")) === "2", `${await n("push")} ${await n("pull")} ${await n("legs")}`);
        check("push / pull / legs: the busiest is highlighted", (await page.locator(".tv-split-card.top").count()) === 1 && ((await page.locator(".tv-split-card.top").textContent()) || "").includes("Pull"));
        check("push / pull / legs: no kg totals or extra stats", !/kg|elephant|PB/i.test(t), t);
      }
      if (k === "slide-howto") check("how it works: 3 steps", (await page.locator(".tv-howto-steps li").count()) === 3 && t.includes("Tap or scan the sticker") && t.includes("Climb the board"));
      if (k === "slide-prizes") {
        check("prize: #1 wins, the prize, countdown", t.includes("#1 wins") && t.includes("Gift hamper") && /ends in \d+d/i.test(t), t.slice(0, 160));
        check("prize: who's winning (first name)", ((await page.locator('[data-testid="tv-prize-leader"]').textContent()) || "").includes("Asha is winning") && !t.includes("Rao"));
      }
      if (k === "slide-challenge") {
        check("challenge: live, title, leader, prize", /Live now/i.test(t) && t.includes("Leg Press Challenge") && t.includes("Rahul") && t.includes("goodie bag"), t.slice(0, 200));
      }
      if (k === "slide-partner") {
        const brand = (await page.locator('[data-testid="tv-ad-brand"]').textContent()) || "";
        const link = await page.locator('[data-testid="tv-ad-qr"] [data-testid="tv-qr"]').getAttribute("data-value");
        check("partner ad: brand + QR to /go/<brand>?src=tv", ["Jersey Drip", "The Clean Crate"].includes(brand) && new RegExp(`^${BASE}/go/(jersey-drip|clean-crate)\\?src=tv`).test(link || ""), `${brand} ${link}`);
        check("partner ad: website shown", /jerseydrip\.shop|thecleancratefoods\.com/.test((await page.locator('[data-testid="tv-ad-site"]').textContent()) || ""));
      }
      if (k === "slide-winners") check("winners: last week's top 3", (await page.locator(".tv-win-card").count()) === 3 && t.includes("Well lifted, Asha!"));
      await page.keyboard.press("ArrowRight");
    }
    const count = (k) => kinds.filter((x) => x === k).length;
    check(
      "times per loop: Join 2, How 2, Boards 4, Push/Pull/Legs 2, Prize 1, Challenge 2 (live), Ad 1, Winners 1",
      count("slide-join") === 2 && count("slide-howto") === 2 && count("slide-board") === 4 && count("slide-today") === 2 && count("slide-prizes") === 1 && count("slide-challenge") === 2 && count("slide-partner") === 1 && count("slide-winners") === 1,
      kinds.join(",")
    );
    check("Join opens the loop", kinds[0] === "slide-join");
    check("no slide kind sits next to itself (boards aside)", kinds.every((k, i) => i === 0 || k === "slide-board" || k !== kinds[i - 1]), kinds.join(","));
    check("all 4 machines with lifts get a board", ["Lat Pulldown", "Chest Press", "Leg Press", "Pec Fly"].every((n) => boards.some((b) => b.includes(n))));
    check("nothing off-screen, corner QR right everywhere", issues.length === 0, issues.join(" | "));
    await sleep(1500);
    check("wraps round to the next loop's Join", (await slideKind(page)) === "slide-join" && (await page.locator(".tv-dots i").count()) === 15);
    await page.keyboard.press("ArrowLeft");
    await sleep(500);
    check("left arrow goes back to the last loop's end", (await slideKind(page)) === kinds[kinds.length - 1]);
    const body = (await page.locator("body").textContent()) || "";
    check("no emails or @handles on the TV", !body.includes("@") && !body.includes("omi.lifts"));
    check("no gym branding on the TV (Omi's call)", !body.includes("Club 360"));
    check("nav hidden on the TV", (await page.locator(".bottom-nav").count()) === 0);
    check("no page errors (TV, full)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // ---- staff settings from R&R: times per loop, seconds, turns
  {
    const tv = { join: { times: 1, seconds: 5 }, howto: { times: 0 }, today: { times: 0 }, prize: { times: 0 }, challenge: { times: 0 }, winners: { times: 0 }, board: { times: 2, seconds: 6 }, partner: { times: 1 } };
    const { ctx, page, errors } = await open(browser, "/tv", (s) => (signedOut(s), (s.rewards.settings.tv_slides = tv), s), { clock: true });
    await page.waitForSelector('[data-testid="slide-join"]');
    await page.clock.fastForward(1000);
    await sleep(500);
    check("custom loop: Join 1 + Boards 2 + Ad 1 = 4 slides", (await page.locator(".tv-dots i").count()) === 4, String(await page.locator(".tv-dots i").count()));
    const seen = [];
    for (let i = 0; i < 8; i++) {
      const k = await slideKind(page);
      const t = (await page.locator("[data-testid^=slide-]").first().textContent()) || "";
      seen.push(k === "slide-board" ? `board:${t.match(/Lat Pulldown|Chest Press|Leg Press|Pec Fly/)?.[0]}` : k === "slide-partner" ? `ad:${(await page.locator('[data-testid="tv-ad-brand"]').textContent()) || ""}` : k);
      await page.clock.fastForward(k === "slide-join" ? 5100 : k === "slide-board" ? 6100 : 8100);
      await sleep(350);
    }
    check("switched-off slides never show", !seen.some((x) => /howto|today|prizes|challenge|winners/.test(x)), seen.join(" "));
    const loop1 = seen.slice(0, 4).filter((x) => x.startsWith("board:")), loop2 = seen.slice(4, 8).filter((x) => x.startsWith("board:"));
    check("machine boards take turns across loops", loop1.length === 2 && loop2.length === 2 && loop1.every((b) => !loop2.includes(b)), seen.join(" "));
    const ads = seen.filter((x) => x.startsWith("ad:"));
    check("partner ads take turns across loops", ads.length === 2 && ads[0] !== ads[1], ads.join(" "));
    check("seconds per slide follow the settings", seen[0] === "slide-join" && seen[4] === "slide-join");
    check("no page errors (custom settings)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // ---- smaller / odd screens still fit
  for (const [w, h] of [[1280, 720], [1366, 768], [1920, 1200]]) {
    const { ctx, page, errors } = await open(browser, "/tv", signedOut, { width: w, height: h });
    await page.waitForSelector('[data-testid="slide-join"]');
    await sleep(1000);
    const issues = [];
    const dots = await page.locator(".tv-dots i").count();
    for (let i = 0; i < dots; i++) {
      await sleep(1300);
      const off = await offscreen(page);
      if (off.length) issues.push(`${i}:${await slideKind(page)} ${off.join(", ")}`);
      await page.keyboard.press("ArrowRight");
    }
    const scroll = await page.evaluate(() => [document.documentElement.scrollWidth - innerWidth, document.documentElement.scrollHeight - innerHeight]);
    check(`fits at ${w}x${h}`, issues.length === 0 && scroll[0] <= 0 && scroll[1] <= 0, issues.join(" | ") + " scroll " + scroll);
    check(`no page errors at ${w}x${h}`, errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // ---- empty gym (nobody has lifted yet, no house lifts)
  {
    const { ctx, page, errors } = await open(browser, "/tv", empty);
    await page.waitForSelector('[data-testid="slide-join"]');
    await sleep(1000);
    check("empty gym: no 'today' slide, one 'wide open' slide (10 in all)", (await page.locator(".tv-dots i").count()) === 10, String(await page.locator(".tv-dots i").count()));
    check("empty gym: proof chip invites the first set", ((await page.locator('[data-testid="tv-proof"]').textContent()) || "").toLowerCase().includes("first set"));
    let found = false;
    for (let i = 0; i < 10 && !found; i++) {
      await page.keyboard.press("ArrowRight");
      await sleep(250);
      found = (await page.locator('[data-testid="slide-open"]').count()) === 1;
    }
    check("open slide lists all 10 machines as free", found && (await page.locator(".tv-open-cell").count()) === 10);
    await sleep(1500);
    const off = await offscreen(page);
    check("open slide fits", off.length === 0, off.join(", "));
    check("no page errors (TV, empty)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // ---- rewards not set up (0011 not run): boards only, nothing breaks
  {
    const { ctx, page, errors } = await open(browser, "/tv", (s) => (signedOut(s), (s.missingRpc.tv_feed = true), (s.missingRpc.rewards_overview = true), s));
    await page.waitForSelector('[data-testid="slide-join"]');
    await sleep(1200);
    check("without rewards: Join, How, Boards, Today only (10)", (await page.locator(".tv-dots i").count()) === 10, String(await page.locator(".tv-dots i").count()));
    check("no page errors (TV, no rewards)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // ---- database update 0013 not run yet: falls back to the old feeds
  {
    const { ctx, page, st, errors } = await open(browser, "/tv", (s) => (signedOut(s), (s.missingRpc.tv_feed = true), (s.missingRpc.machine_boards = true), s));
    await page.waitForSelector('[data-testid="slide-join"]');
    await sleep(1200);
    check("before 0013: same 15-slide loop from the old feeds", (await page.locator(".tv-dots i").count()) === 15, String(await page.locator(".tv-dots i").count()));
    check("before 0013: boards from tv_boards", st.calls.some((c) => c.includes("rpc/tv_boards")) && st.calls.some((c) => c.includes("rpc/rewards_overview")));
    let chest = "";
    for (let i = 0; i < 15 && !chest; i++) {
      await page.keyboard.press("ArrowRight");
      await sleep(300);
      const t = (await page.locator('[data-testid="slide-board"]').textContent().catch(() => "")) || "";
      if (t.includes("Chest Press")) chest = t;
    }
    check("before 0013: no best-ever rows", chest && !chest.includes("Best ever"), chest);
    check("no page errors (before 0013)", errors.length === 0, errors.join(" | "));
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
    check("join slide advances after 12s even with a refresh mid-slide", (await slideKind(page)) !== "slide-join");
    st.failRpc.machine_boards = true;
    for (let i = 0; i < 5; i++) {
      await page.clock.fastForward(10_000);
      await sleep(300);
    }
    check("shows 'Reconnecting' when updates keep failing", ((await page.locator('[data-testid="tv-live"]').textContent()) || "").includes("Reconnecting"));
    check("keeps showing the last good slides meanwhile", (await page.locator("[data-testid^=slide-]").count()) === 1);
    st.failRpc.machine_boards = false;
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

  // ---- /go/<brand>: the partner QR's link (counts the scan, then the brand's site)
  {
    const r = await fetch(BASE + "/go/clean-crate?src=tv&p=5", { redirect: "manual" });
    const loc = r.headers.get("location") || "";
    check("/go answers with a redirect, never cached", r.status === 302 || r.status === 307, String(r.status));
    check("/go: no database here, so it lands on Partners", loc.endsWith("/rewards?tab=partners"), loc);
    check("/go: not cached", (r.headers.get("cache-control") || "").includes("no-store"));
    const bad = await fetch(BASE + "/go/..%2Fadmin", { redirect: "manual" });
    check("/go: odd brand ids go to Partners too", (bad.headers.get("location") || "").endsWith("/rewards?tab=partners"), bad.headers.get("location"));
  }

  // ---- /join: the page behind the QR code
  {
    const { ctx, page, st, errors } = await open(browser, "/join?src=tv", signedOut, { width: 390, height: 844 });
    await page.waitForSelector('[data-testid="join-out"]');
    check("join: says they came from the gym screen", /You scanned the Club 360 screen/.test((await page.locator('[data-testid="join-out"] .eyebrow').first().textContent()) || ""));
    check("join: shows the gym", ((await page.locator('[data-testid="join-out"] [data-testid="gym-mark"]').textContent()) || "").includes("Club 360"));
    await page.waitForSelector('[data-testid="join-live"]');
    const live = (await page.locator('[data-testid="join-live"]').textContent()) || "";
    check("join: live numbers from today", live.includes("5") && live.includes("32") && live.includes("Lifters"));
    check("join: shows a lift to beat (first name only)", ((await page.locator('[data-testid="join-beat"]').textContent()) || "").includes("Asha") && !live.includes("@"));
    check("join: explains what the TV shows", ((await page.locator('[data-testid="join-trust"]').textContent()) || "").includes("first name"));
    await page.locator('[data-testid="join-google"]').click();
    await sleep(800);
    const auth = st.calls.find((c) => c.startsWith("auth:authorize")) || "";
    check("join: one tap starts Google sign-in", auth.includes("provider=google"), auth);
    check("join: comes back to the home screen after sign-in", decodeURIComponent(decodeURIComponent(auth)).includes("/auth/callback?next=/home"), auth);
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
    await page.waitForURL((u) => new URL(u).pathname === "/home");
    check("join (signed in): 'Go to my home' works", true);
    check("no page errors (join signed in)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // ---- robots: /join is public, /tv is not indexed
  {
    const r = await fetch(BASE + "/robots.txt").then((x) => x.text());
    check("robots: /tv and /go blocked, /join allowed", r.includes("Disallow: /tv") && r.includes("Disallow: /go") && !r.includes("/join"));
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
