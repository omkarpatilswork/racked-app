// End-to-end checks for the main member flows (mocked backend).
// Run: see tests/README.md
const { chromium } = require("playwright");
const fs = require("fs");
const { defaultState, setup } = require("./mock");
const BASE = process.env.BASE_URL || "http://localhost:3111";
let n = 0, bad = 0;
const check = (name, ok, extra = "") => { n++; if (!ok) bad++; console.log(ok ? "PASS" : "FAIL", name, ok ? "" : extra); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
const rpcCalls = (st, name) => st.calls.filter((c) => c.startsWith("POST rpc/" + name));

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });

  // 1. signed-out home + sign-in sheet a11y
  {
    const { ctx, page, errors } = await open(browser, "/", (s) => ((s.signedIn = false), s));
    await page.waitForSelector('[data-testid="hero-signin"]');
    check("signed-out home shows how it works", (await page.getByText("How it works").count()) === 1);
    check("bottom nav has 4 tabs", (await page.locator(".bottom-nav a").count()) === 4);
    await page.locator('[data-testid="hero-signin"]').click();
    const sheet = page.locator('[data-testid="signin-sheet"]');
    check("sign-in sheet is a modal dialog", (await sheet.getAttribute("role")) === "dialog" && (await sheet.getAttribute("aria-modal")) === "true");
    await page.keyboard.press("Escape");
    check("Escape closes the sheet", (await sheet.count()) === 0);
    check("focus returns to the button", await page.evaluate(() => document.activeElement?.getAttribute("data-testid")) === "hero-signin");
    check("no page errors (signed out)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // 2. onboarding redirect + finish
  {
    const { ctx, page, st, errors } = await open(browser, "/machine/lat-pulldown-01?tap=LP4K9X", (s) => ((s.profile.onboarded_at = null), s));
    await page.waitForURL(/\/welcome\?next=/, { timeout: 15000 });
    check("new member is sent to /welcome with next", decodeURIComponent(page.url()).includes("next=/machine/lat-pulldown-01?tap=LP4K9X"));
    check("nav hidden during welcome", (await page.locator(".bottom-nav").count()) === 0);
    await page.locator('[data-testid="welcome-next"]').click();
    await page.locator('[data-testid="welcome-next"]').click();
    await page.locator('[data-testid="welcome-name"]').fill("a");
    await page.locator('[data-testid="welcome-finish"]').click();
    check("too-short name shows an error", (await page.locator(".field-error").textContent())?.includes("2 to 40"));
    check("nothing saved yet", rpcCalls(st, "update_my_profile").length === 0);
    await page.locator('[data-testid="welcome-name"]').fill("  Omi   P ");
    await page.locator('[data-testid="welcome-finish"]').click();
    await page.waitForURL(/\/machine\/lat-pulldown-01\?tap=LP4K9X/, { timeout: 15000 });
    const call = rpcCalls(st, "update_my_profile")[0] || "";
    check("finish saves name + onboarded", call.includes('"p_display_name":"Omi P"') && call.includes('"p_onboarded":true'), call);
    check("returned to the tapped machine", page.url().endsWith("/machine/lat-pulldown-01?tap=LP4K9X"));
    check("no page errors (onboarding)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }
  // 2b. skip
  {
    const { ctx, page, st } = await open(browser, "/leaderboard", (s) => ((s.profile.onboarded_at = null), s));
    await page.waitForURL(/\/welcome/, { timeout: 15000 });
    await page.locator('[data-testid="welcome-skip"]').click();
    await page.waitForURL(/\/leaderboard$/, { timeout: 15000 });
    check("skip marks onboarded and continues", (rpcCalls(st, "update_my_profile")[0] || "").includes('"p_onboarded":true'));
    await ctx.close();
  }
  // 2b'. skip fails (offline/RPC error) -> not trapped; crafted next can't leave the site
  {
    const { ctx, page } = await open(browser, "/welcome?next=%2F%09%2Fevil.com", (s) => ((s.profile.onboarded_at = null), (s.failRpc.update_my_profile = true), s));
    await page.waitForSelector('[data-testid="welcome-skip"]');
    await page.locator('[data-testid="welcome-skip"]').click();
    await sleep(2500);
    const u = new URL(page.url());
    check("crafted next stays on this site", u.host === "localhost:3111", page.url());
    check("failed skip doesn't bounce back to welcome", !u.pathname.startsWith("/welcome"), page.url());
    await ctx.close();
  }
  // 2d. settings hides delete when 0009 isn't run
  {
    const { ctx, page } = await open(browser, "/settings", (s) => (delete s.profile.onboarded_at, s));
    await page.waitForSelector('[data-testid="signout"]');
    check("no delete button before 0009", (await page.locator('[data-testid="delete-account"]').count()) === 0);
    await ctx.close();
  }
  // 2c. migration not run -> field missing -> no redirect
  {
    const { ctx, page } = await open(browser, "/", (s) => (delete s.profile.onboarded_at, s));
    await sleep(1500);
    check("no welcome redirect when 0009 isn't run", !page.url().includes("/welcome"));
    await ctx.close();
  }

  // 3. log flow: starts from last set, logs, rest timer
  {
    const { ctx, page, st, errors } = await open(browser, "/machine/lat-pulldown-01/log?tap=LP4K9X");
    await page.waitForSelector('[data-testid="last-pill"]', { timeout: 15000 });
    const w = await page.locator('[data-testid="weight"] input').inputValue();
    check("weight starts at last set (50), not PB (55)", w === "50", w);
    check("CTA shows the set", (await page.locator('[data-testid="log-submit"]').textContent()).includes("50KG × 10"));
    await page.getByRole("button", { name: "Increase Weight" }).click();
    check("+ adds one step (5kg)", (await page.locator('[data-testid="weight"] input').inputValue()) === "55");
    await page.locator('[data-testid="log-submit"]').click();
    await page.waitForSelector('[data-testid="rest-timer"]', { timeout: 10000 });
    const call = rpcCalls(st, "log_set")[0] || "";
    check("log_set called with 55 × 10", call.includes('"p_weight":55') && call.includes('"p_reps":10'), call);
    check("toast confirms the set", (await page.locator(".toast").first().textContent()).includes("Set 1 logged"));
    const t1 = await page.locator(".rest-ring").textContent();
    await sleep(2200);
    const t2 = await page.locator(".rest-ring").textContent();
    check("rest timer counts down", /^1:2\d|^1:30/.test(t1) && t1 !== t2, `${t1} -> ${t2}`);
    check("session list shows the set", (await page.locator('[data-testid="session-sets"] li').count()) === 1);
    check("CTA now says Log another", (await page.locator('[data-testid="log-submit"]').textContent()).includes("Log another"));
    await page.getByRole("button", { name: "Skip" }).click();
    check("rest can be skipped", (await page.locator('[data-testid="rest-timer"]').count()) === 0);
    // PB
    for (let i = 0; i < 1; i++) await page.getByRole("button", { name: "Increase Weight" }).click();
    await page.locator('[data-testid="log-submit"]').click();
    await page.waitForSelector('[data-testid="pb-celebration"]', { timeout: 10000 });
    check("PB celebration opens for 60kg", (await page.locator('[data-testid="pb-celebration"] .big').textContent()).includes("60"));
    check("PB primary button is focused", await page.evaluate(() => document.activeElement?.getAttribute("data-testid")) === "pb-continue");
    await page.locator('[data-testid="pb-continue"]').click();
    check("Keep going returns to logging", (await page.locator('[data-testid="pb-celebration"]').count()) === 0 && (await page.locator('[data-testid="session-sets"] li').count()) === 2);
    await page.locator('[data-testid="finish"]').click();
    await page.waitForURL(/\/machine\/lat-pulldown-01$/, { timeout: 10000 });
    check("Done goes back to the machine", true);
    check("no page errors (log flow)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // 4. offline guard
  {
    const { ctx, page, st } = await open(browser, "/machine/lat-pulldown-01/log?tap=LP4K9X");
    await page.waitForSelector('[data-testid="log-submit"]');
    await ctx.setOffline(true);
    await page.waitForSelector('[data-testid="net-banner"]', { timeout: 5000 });
    check("offline banner shows", (await page.locator('[data-testid="net-banner"]').textContent()).includes("offline"));
    await page.locator('[data-testid="log-submit"]').click();
    await sleep(300);
    check("offline: set not sent, toast explains", rpcCalls(st, "log_set").length === 0 && (await page.locator(".toast").last().textContent()).includes("offline"));
    await ctx.setOffline(false);
    await page.waitForSelector(".net-banner.back", { timeout: 5000 });
    check("back-online message", true);
    await ctx.close();
  }
  // 4b. failed save keeps values
  {
    const { ctx, page } = await open(browser, "/machine/lat-pulldown-01/log?tap=LP4K9X", (s) => ((s.failRpc.log_set = true), s));
    await page.waitForSelector('[data-testid="last-pill"]');
    await page.locator('[data-testid="log-submit"]').click();
    await sleep(800);
    check("server error: friendly toast, values kept", (await page.locator(".toast").last().textContent()).includes("Couldn't save") && (await page.locator('[data-testid="weight"] input').inputValue()) === "50");
    await ctx.close();
  }

  // 5. settings
  {
    const { ctx, page, st, errors } = await open(browser, "/settings", (s) => ((s.storageFiles = [{ name: "a.jpg", id: "1" }, { name: "b.jpg", id: "2" }]), s));
    await page.waitForSelector('[data-testid="profile-form"]');
    await page.locator("#display-name").fill("me@mail.com");
    await page.locator('[data-testid="profile-save"]').click();
    check("name with @ rejected in form", (await page.locator("#display-name-hint").textContent()).includes("@"));
    await page.locator("#display-name").fill("Omkar P");
    await page.locator('[data-testid="profile-save"]').click();
    await sleep(800);
    check("valid name saved via RPC", (rpcCalls(st, "update_my_profile")[0] || "").includes("Omkar P"));
    await page.locator("#ig-handle").fill("https://www.instagram.com/Omi.Strong/?igsh=x");
    await page.locator('[data-testid="profile-save"]').click();
    await sleep(800);
    check("pasted Instagram link saved as handle", (rpcCalls(st, "set_instagram_handle").at(-1) || "").includes('"p_handle":"omi.strong"'), rpcCalls(st, "set_instagram_handle").join());
    await page.getByRole("radio", { name: /Light/ }).click();
    check("theme switches to light instantly", (await page.evaluate(() => document.documentElement.dataset.theme)) === "light");
    await page.reload({ waitUntil: "networkidle" });
    check("theme persists after reload", (await page.evaluate(() => document.documentElement.dataset.theme)) === "light");
    // delete account
    await page.locator('[data-testid="delete-account"]').click();
    const yes = page.locator('[data-testid="confirm-yes"]');
    check("delete disabled until DELETE typed", await yes.isDisabled());
    await page.locator("#confirm-type").fill("delete");
    check("typing delete enables it", !(await yes.isDisabled()));
    await yes.click();
    await page.waitForURL(BASE + "/", { timeout: 10000 });
    check("delete_my_account called, signed out, home", st.deleted === true && st.calls.some((c) => c.startsWith("auth:logout")));
    const del = st.calls.find((c) => c.startsWith("storage:delete")) || "";
    check("photo files removed before account delete", del.includes("me-uid/a.jpg") && del.includes("me-uid/b.jpg") && st.calls.indexOf(del) < st.calls.findIndex((c) => c.includes("rpc/delete_my_account")), del);
    check("no page errors (settings)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }
  // 5b. sign out confirm
  {
    const { ctx, page, st } = await open(browser, "/settings");
    await page.waitForSelector('[data-testid="signout"]');
    await page.locator('[data-testid="signout"]').click();
    check("sign out asks first", (await page.locator('[data-testid="confirm-sheet"]').count()) === 1 && !st.calls.some((c) => c.startsWith("auth:logout")));
    await page.locator('[data-testid="confirm-yes"]').click();
    await page.waitForURL(BASE + "/", { timeout: 10000 });
    check("then signs out", st.calls.some((c) => c.startsWith("auth:logout")));
    await ctx.close();
  }

  // 6. leaderboard + error state
  {
    const { ctx, page } = await open(browser, "/leaderboard");
    await page.waitForSelector('[data-testid="podium"]');
    check("podium shows top 3", (await page.locator(".podium-spot .pname").count()) === 3);
    check("rest of list below podium", (await page.locator(".lb-row").count()) === 2);
    await ctx.close();
    const r = await open(browser, "/leaderboard", (s) => ((s.failRpc.leaderboard_overall = true), s));
    await r.page.waitForSelector("text=Couldn’t load the leaderboard", { timeout: 10000 });
    check("leaderboard error state with retry", (await r.page.getByRole("button", { name: /Try again/ }).count()) === 1);
    await r.ctx.close();
  }

  // 7. locked machine is helpful; guide open without tap
  {
    const { ctx, page } = await open(browser, "/machine/chest-press-02");
    await page.waitForSelector('[data-testid="locked-machine"]');
    check("locked page explains how to tap in", (await page.getByText("Tap the sticker").count()) === 1);
    await page.getByRole("link", { name: /How to use it/ }).click();
    await page.waitForURL(/guide/);
    await page.waitForSelector(".exercise-stage");
    check("guide readable without a tap", (await page.getByText("Common Mistakes").count()) === 1);
    await ctx.close();
  }

  // 8. home bento + resume card
  {
    const { ctx, page } = await open(browser, "/machine/lat-pulldown-01?tap=LP4K9X");
    await page.waitForSelector('[data-testid="log-cta"]');
    await page.getByRole("link", { name: "Home" }).click();
    await page.waitForSelector('[data-testid="resume-card"]');
    check("home offers 'You're at Lat Pulldown'", (await page.locator('[data-testid="resume-card"]').textContent()).includes("Lat Pulldown"));
    await page.waitForFunction(() => /\d/.test(document.querySelector('[data-testid="tile-streak"] .t-value')?.textContent || ""), null, { timeout: 8000 }).catch(() => {});
    check("streak tile shows days", /\d/.test(await page.locator('[data-testid="tile-streak"] .t-value').textContent()));
    await ctx.close();
  }

  // 9. headers, manifest, sw, offline page, robots
  {
    const ctx = await browser.newContext();
    const r = await ctx.request.get(BASE + "/privacy");
    const h = r.headers();
    check("security headers present", h["x-content-type-options"] === "nosniff" && h["referrer-policy"] && h["x-frame-options"] === "SAMEORIGIN" && (h["content-security-policy"] || "").includes("frame-ancestors"), JSON.stringify(h));
    check("no x-powered-by", !h["x-powered-by"]);
    const m = await (await ctx.request.get(BASE + "/manifest.webmanifest")).json();
    check("manifest: standalone + maskable icon", m.display === "standalone" && m.icons.some((i) => i.purpose === "maskable"));
    for (const p of ["/sw.js", "/offline.html", "/icons/icon-192.png", "/icons/maskable-512.png", "/icons/apple-touch-icon.png", "/icon.svg", "/robots.txt"]) {
      check("served " + p, (await ctx.request.get(BASE + p)).status() === 200);
    }
    await ctx.close();
  }

  // 10. no horizontal overflow at 360px; axe scan
  const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
  for (const [url, theme] of [["/", "dark"], ["/", "light"], ["/machine/lat-pulldown-01?tap=LP4K9X", "dark"], ["/machine/lat-pulldown-01/log?tap=LP4K9X", "dark"], ["/machine/lat-pulldown-01/log?tap=LP4K9X", "light"], ["/leaderboard", "dark"], ["/leaderboard", "light"], ["/profile", "dark"], ["/settings", "dark"], ["/settings", "light"], ["/machines", "dark"], ["/privacy", "dark"]]) {
    const { ctx, page, errors } = await open(browser, url, (s) => s, { width: 360, theme });
    await sleep(900);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`no sideways scroll ${url} @360 (${theme})`, overflow <= 0, String(overflow));
    await page.addScriptTag({ content: axeSrc });
    const res = await page.evaluate(async () => {
      // eslint-disable-next-line no-undef
      const r = await axe.run(document, { runOnly: ["wcag2a", "wcag2aa"], resultTypes: ["violations"] });
      return r.violations.filter((v) => ["serious", "critical"].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(", ")}`);
    });
    check(`axe: no serious issues ${url} (${theme})`, res.length === 0, res.join(" || "));
    check(`no page errors ${url} (${theme})`, errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  await browser.close();
  console.log(`${n - bad}/${n} passed`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
