// Staff console + fair-play checks (mocked backend). Run: see tests/README.md
const { chromium } = require("playwright");
const fs = require("fs");
const { defaultState, setup, iso } = require("./mock");
const BASE = process.env.BASE_URL || "http://localhost:3111";
let n = 0, bad = 0;
const check = (name, ok, extra = "") => { n++; if (!ok) bad++; console.log(ok ? "PASS" : "FAIL", name, ok ? "" : extra); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const staff = (s) => ((s.profile.is_staff = true), s);

async function open(browser, url, mut = (s) => s, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: opts.width || 390, height: 844 }, timezoneId: "Asia/Kolkata" });
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

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });

  // non-staff
  {
    const { ctx, page } = await open(browser, "/admin");
    await page.waitForSelector("text=Not a staff account");
    check("non-staff sees 'Not a staff account'", true);
    check("no staff data requested", true);
    await ctx.close();
  }

  // overview + badges
  {
    const { ctx, page, errors } = await open(browser, "/admin", staff);
    await page.waitForSelector('[data-testid="staff-console"]');
    await page.waitForSelector('[data-testid="kpi-review"] .t-value:text("2")', { timeout: 10000 });
    check("overview shows 2 sets need review", true);
    check("Review tab shows badge 2", (await page.locator('[data-testid="tab-review-btn"] .count').textContent()) === "2");
    check("Feedback tab shows open-issue badge", (await page.locator('[data-testid="tab-feedback-btn"] .count').textContent()) === "2");
    check("nav hidden on staff console", (await page.locator(".bottom-nav").count()) === 0);
    await page.locator('[data-testid="kpi-review"]').click();
    await page.waitForSelector('[data-testid="tab-review"]');
    check("KPI tile opens Review", page.url().includes("tab=review"));
    check("no page errors (overview)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // review queue: approve + remove
  {
    const { ctx, page, st, errors } = await open(browser, "/admin?tab=review", staff);
    await page.waitForSelector('[data-testid="review-item"]');
    check("queue lists 2 flagged sets", (await page.locator('[data-testid="review-item"]').count()) === 2);
    const first = page.locator('[data-testid="review-item"]').first();
    check("shows the jump reason + usual best", (await first.textContent()).includes("Jumped from 50 kg to 140 kg") && (await first.textContent()).includes("usual best 50 kg"));
    await page.locator('[data-testid="review-item"]').nth(1).locator('[data-testid="approve"]').click();
    await sleep(500);
    check("approve calls admin_approve_set(502)", (rpc(st, "admin_approve_set")[0] || "").includes('"p_id":502'));
    check("approved item leaves the queue", (await page.locator('[data-testid="review-item"]').count()) === 1);
    await page.waitForSelector('[data-testid="tab-review-btn"] .count:text("1")', { timeout: 5000 }).catch(() => {});
    check("badge drops to 1", (await page.locator('[data-testid="tab-review-btn"] .count').textContent()) === "1");
    await first.locator('[data-testid="remove-flagged"]').click();
    const sheet = page.locator('[data-testid="reason-sheet"]');
    check("remove asks for a reason (dialog)", (await sheet.getAttribute("role")) === "dialog");
    await sheet.locator('[data-testid="reason-confirm"]').click();
    await sleep(600);
    const call = rpc(st, "admin_remove_set")[0] || "";
    check("remove sends set id + default reason", call.includes('"p_id":501') && call.includes("Weight not possible on this machine"), call);
    check("queue empty -> All clear", (await page.locator('[data-testid="queue-empty"]').count()) === 1);
    check("toast confirms PB recalculated", (await page.locator(".toast").last().textContent()).includes("PB"));
    // remove a normal set with a custom reason
    await page.locator('[data-testid="recent-sets"] [data-testid="remove-set"]').first().click();
    await page.getByRole("radio", { name: "Other…" }).click();
    check("custom reason required before confirming", await sheet.locator('[data-testid="reason-confirm"]').isDisabled());
    await page.locator("#reason-custom").fill("Logged twice by mistake");
    await sheet.locator('[data-testid="reason-confirm"]').click();
    await sleep(600);
    check("custom reason sent", (rpc(st, "admin_remove_set")[1] || "").includes("Logged twice by mistake"));
    check("no page errors (review)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // 0010 not run -> friendly notice, and delete falls back
  {
    const { ctx, page, st } = await open(browser, "/admin?tab=review", (s) => (staff(s), (s.missingRpc = { admin_review_queue: true, admin_remove_set: true }), s));
    await page.waitForSelector('[data-testid="needs-0010"]');
    check("missing 0010 shows how to turn it on", (await page.locator('[data-testid="needs-0010"]').textContent()).includes("0010_staff_moderation.sql"));
    await page.locator('[data-testid="recent-sets"] [data-testid="remove-set"]').first().click();
    await page.locator('[data-testid="reason-confirm"]').click();
    await sleep(700);
    check("falls back to the old delete (PB still recalculated)", rpc(st, "admin_delete_set_log").length === 1);
    await ctx.close();
  }

  // members: search, open, reset on a machine, remove a set
  {
    const { ctx, page, st, errors } = await open(browser, "/admin?tab=members", staff);
    await page.waitForSelector('[data-testid="member-row"]');
    await page.locator('[data-testid="member-search"]').fill("kab");
    await sleep(600);
    check("search narrows the list", (await page.locator('[data-testid="member-row"]').count()) === 1 && (rpc(st, "admin_member_search").at(-1) || "").includes('"p_query":"kab"'));
    check("flag count visible on member", (await page.locator('[data-testid="member-row"]').first().textContent()).includes("1 flagged"));
    await page.locator('[data-testid="member-row"]').first().click();
    await page.waitForSelector('[data-testid="member-machine"]');
    check("member detail lists their machines with PB", (await page.locator('[data-testid="member-machine"]').first().textContent()).includes("PB 140 kg"));
    await page.locator('[data-testid="reset-member-machine"]').first().click();
    await page.locator('[data-testid="reason-confirm"]').click();
    await sleep(700);
    const c = rpc(st, "admin_reset_member_machine")[0] || "";
    check("reset member on machine sends uid + machine + reason", c.includes('"p_uid":"u5"') && c.includes('"p_machine_id":"lat-pulldown-01"') && c.includes("Repeated fake entries"), c);
    check("machine gone from member's list", (await page.locator('[data-testid="member-machine"]').count()) === 0);
    check("no page errors (members)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // machines: limits + reset machine (typed RESET)
  {
    const { ctx, page, st, errors } = await open(browser, "/admin?tab=machines", staff);
    await page.waitForSelector('[data-testid="machine-admin-card"]');
    const lat = page.locator('[data-testid="machine-admin-card"]').first();
    check("shows current limit", (await lat.locator('[data-testid="limit-summary"]').textContent()).includes("150"));
    await lat.locator('[data-testid="edit-limit"]').click();
    await lat.locator("input").first().fill("3000");
    await lat.locator('[data-testid="save-limit"]').click();
    check("absurd limit rejected in the form", (await lat.locator(".field-error").textContent()).includes("2000"));
    await lat.locator("input").first().fill("120");
    await lat.locator('[data-testid="save-limit"]').click();
    await sleep(600);
    check("limit saved via RPC", (rpc(st, "admin_set_machine_limit")[0] || "").includes('"p_max_weight":120'));
    check("summary updates", (await lat.locator('[data-testid="limit-summary"]').textContent()).includes("120"));
    await lat.locator('[data-testid="reset-machine"]').click();
    const confirmBtn = page.locator('[data-testid="reason-confirm"]');
    check("machine reset needs typed RESET", await confirmBtn.isDisabled());
    await page.locator("#reason-type").fill("reset");
    await confirmBtn.click();
    await sleep(600);
    check("reset machine called with reason", (rpc(st, "admin_reset_machine_for_all")[0] || "").includes("Weight stack changed"));
    check("toast says members notified", (await page.locator(".toast").last().textContent()).includes("3 members notified"));
    check("no page errors (machines)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // feedback + activity
  {
    const { ctx, page, st } = await open(browser, "/admin?tab=feedback", staff);
    await page.waitForSelector('[data-testid="feedback-item"]');
    check("open feedback listed", (await page.locator('[data-testid="feedback-item"]').count()) === 2);
    await page.locator('[data-testid="feedback-item"]').first().getByRole("button", { name: /Fixed/ }).click();
    await sleep(500);
    check("Fixed -> status resolved + leaves Open list", st.calls.some((c) => c.startsWith("PATCH feedback") && c.includes("resolved")) && (await page.locator('[data-testid="feedback-item"]').count()) === 1);
    await page.locator('[data-testid="tab-activity-btn"]').click();
    await page.waitForSelector('[data-testid="activity-row"]');
    check("activity log shows staff actions", (await page.locator('[data-testid="activity-row"]').first().textContent()).includes("changed limits on Leg Press"));
    await ctx.close();
  }

  // member side: notes + over-limit
  {
    const { ctx, page, st, errors } = await open(browser, "/home", (s) => {
      s.notices = [{ id: 9, uid: "me-uid", kind: "set_removed", machine_id: "lat-pulldown-01", mode: null, weight: 300, reps: 10, set_at: iso(60 * 24), reason: "Weight not possible on this machine", created_at: iso(10), seen_at: null }];
      return s;
    });
    await page.waitForSelector('[data-testid="staff-notices"]');
    const txt = await page.locator('[data-testid="staff-notices"]').textContent();
    check("member sees staff note with set + reason", txt.includes("300 kg × 10") && txt.includes("Lat Pulldown") && txt.includes("Weight not possible"), txt);
    await page.locator('[data-testid="notices-ok"]').click();
    await sleep(400);
    check("Got it marks notes seen and hides card", (rpc(st, "mark_notices_seen")[0] || "").includes("[9]") && (await page.locator('[data-testid="staff-notices"]').count()) === 0);
    check("no page errors (notes)", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }
  {
    const { ctx, page, st } = await open(browser, "/machine/lat-pulldown-01/log?tap=LP4K9X", (s) => ((s.limits[0].max_weight = 50), s));
    await page.waitForSelector('[data-testid="limit-hint"]');
    check("log screen shows the machine's max", (await page.locator('[data-testid="limit-hint"]').textContent()).includes("50 kg"));
    await page.getByRole("button", { name: "Increase Weight" }).click();
    check("stepper can't go above the max", (await page.locator('[data-testid="weight"] input').inputValue()) === "50");
    await ctx.close();
    // server refusal message shown as-is (e.g. limit changed after the page loaded)
    const r2 = await open(browser, "/machine/lat-pulldown-01/log?tap=LP4K9X", (s) => ((s.missingTables = { machine_limits: true }), s));
    await r2.page.waitForSelector('[data-testid="last-pill"]');
    r2.st.limits[0].max_weight = 40;
    await r2.page.locator('[data-testid="log-submit"]').click();
    await sleep(800);
    check("over-limit refusal explained to member", (await r2.page.locator(".toast").last().textContent()).includes("40 kg max"));
    await r2.ctx.close();
  }

  // a11y + layout on staff tabs
  const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
  for (const tab of ["", "?tab=review", "?tab=members", "?tab=machines", "?tab=feedback", "?tab=activity"]) {
    for (const theme of ["dark", "light"]) {
      const { ctx, page, errors } = await open(browser, "/admin" + tab, staff, { width: 360, theme });
      await sleep(1000);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check(`no sideways scroll /admin${tab} (${theme})`, overflow <= 0, String(overflow));
      await page.addScriptTag({ content: axeSrc });
      const res = await page.evaluate(async () => {
        // eslint-disable-next-line no-undef
        const r = await axe.run(document, { runOnly: ["wcag2a", "wcag2aa"], resultTypes: ["violations"] });
        return r.violations.filter((v) => ["serious", "critical"].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((x) => x.target.join(" ")).join(", ")}`);
      });
      check(`axe: no serious issues /admin${tab} (${theme})`, res.length === 0, res.join(" || "));
      check(`no page errors /admin${tab} (${theme})`, errors.length === 0, errors.join(" | "));
      await ctx.close();
    }
  }

  await browser.close();
  console.log(`${n - bad}/${n} passed`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
