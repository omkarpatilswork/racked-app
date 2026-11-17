// In-memory Postgres (PGlite) test for 0011_rewards.sql. See tests/README.md.
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
process.on("unhandledRejection", (e) => { console.log("ERROR:", e.message); process.exit(1); });
const R = process.argv[2] || new URL("../../supabase/migrations/", import.meta.url).pathname;
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated;
create schema auth; create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true),'')::uuid $$;
create publication supabase_realtime;
create schema storage;
create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid() primary key, bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
grant usage on schema storage, auth to authenticated, anon; grant select on storage.objects to authenticated; grant execute on function auth.uid() to authenticated, anon;
create function storage.foldername(n text) returns text[] language sql as $$ select string_to_array(n,'/') $$;
`);
for (const f of fs.readdirSync(R).sort()) await db.exec(fs.readFileSync(R + f, "utf8"));
const A = "11111111-1111-1111-1111-111111111111", B = "22222222-2222-2222-2222-222222222222",
  S = "33333333-3333-3333-3333-333333333333", C = "44444444-4444-4444-4444-444444444444";
await db.exec(`insert into auth.users(id,email,raw_user_meta_data) values
  ('${A}','asha.rao@x.com','{"full_name":"Asha Rao"}'),('${B}','bo@x.com','{"full_name":"Bo Lee"}'),
  ('${S}','s@x.com','{"full_name":"Staff Sam"}'),('${C}','chris.secret@x.com','{}')`);
await db.exec(`update public.profiles set is_staff=true where id='${S}'`);
await db.exec(`update public.profiles set display_name='chris.secret@x.com' where id='${C}'`);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const as = async (u) => db.exec(`select set_config('app.uid','${u || ""}',false)`);
const q = async (sql) => (await db.query(sql)).rows;
const one = async (sql) => (await q(sql))[0];
const err = async (sql) => { try { await db.query(sql); return null; } catch (e) { return e; } };
const shift = async () => db.exec(`update public.set_logs set created_at = created_at - interval '9 seconds'`);
const L = async (m, mode, w, r) => { const x = await q(`select public.log_set('${m}', ${mode ? `'${mode}'` : "null"}, ${w}, ${r}) as r`); await shift(); return x; };
// run as a member / signed-out visitor, then go back to whoever we were
const asRole = async (role, u, sql) => {
  const prev = (await db.query(`select coalesce(current_setting('app.uid', true), '') v`)).rows[0].v;
  await db.exec(`select set_config('app.uid','${u || ""}',false); set role ${role};`);
  try { return (await db.query(sql)).rows; } finally { await db.exec(`reset role; select set_config('app.uid','${prev}',false)`); }
};
const errAs = async (role, u, sql) => { try { await asRole(role, u, sql); return null; } catch (e) { return e; } };
const sync = async (u) => (await asRole("authenticated", u, `select public.sync_my_rewards() as r`))[0].r;
const mine = async (u) => (await asRole("authenticated", u, `select public.my_rewards() as r`))[0].r;

// --- seeds
ok((await one(`select count(*)::int c from public.sponsors`)).c === 2, "2 sponsors seeded");
ok((await one(`select count(*)::int c from public.sponsor_products`)).c === 8, "8 sponsor products seeded");
ok((await one(`select count(*)::int c from public.rewards where active`)).c === 0, "shop items start switched off");
ok((await one(`select count(*)::int c from public.prize_templates`)).c === 2, "2 prize rows seeded");
ok((await one(`select season_period p from public.rewards_settings`)).p === "week", "seasons start weekly");

// --- public overview works signed out, shows no drafts
let ov = (await asRole("anon", null, `select public.rewards_overview() as r`))[0].r;
ok(ov.period === "week" && ov.season && /^Week of /.test(ov.season.title), "overview has a weekly season: " + (ov.season && ov.season.title));
ok(ov.season.prizes.length === 2 && ov.season.prizes[0].title.includes("hamper"), "season got the template prizes");
ok(ov.sponsors.length === 2 && ov.sponsors[1].products.length === 4, "sponsors + products in overview");
ok(ov.shop.length === 0 && ov.challenges.length === 0, "drafts hidden from members");
ok(ov.missions.length === 5 && ov.badges.length === 9 && ov.streak_steps.length === 4, "game rules in overview");
ok((await one(`select count(*)::int c from public.seasons`)).c === 1, "one season created");
await asRole("anon", null, `select public.rewards_overview()`);
ok((await one(`select count(*)::int c from public.seasons`)).c === 1, "calling again doesn't create another season");

// --- direct writes blocked
for (const sql of [
  `insert into public.xp_ledger(uid,amount,kind,ref) values ('${A}',99999,'bonus','x')`,
  `update public.rewards set active=true`,
  `insert into public.redemptions(uid,source,title) values ('${A}','shop','free')`,
  `update public.rewards_settings set season_period='month'`,
]) {
  const e = await errAs("authenticated", A, sql);
  ok(e && /permission denied|row-level security/.test(e.message), "members can't write directly: " + sql.slice(0, 40) + " -> " + (e && e.message));
}
ok((await asRole("authenticated", A, `select count(*)::int c from public.reward_codes`))[0].c === 0, "members can't read codes");
let e = await errAs("anon", null, `select public.sync_my_rewards()`);
ok(e, "signed-out can't sync");
e = await errAs("anon", null, `select public.redeem_reward(1)`);
ok(e, "signed-out can't redeem");
e = await errAs("authenticated", A, `select public.admin_rewards_data()`);
ok(e && e.code === "42501", "members can't open staff rewards");

// --- missions, badges, streak
await as(A);
await L("lat-pulldown-01", null, 50, 10);
let n = await sync(A);
ok(n.some((x) => x.id === "first_set" && x.xp === 20), "first set badge: " + JSON.stringify(n));
ok((await sync(A)).length === 0, "sync again pays nothing twice");
for (const [m, w] of [["lat-pulldown-01", 50], ["chest-press-02", 30], ["rowing-03", 30], ["shoulder-press-05", 20]]) {
  await as(A); await L(m, null, w, 10);
}
await as(A); await L("lat-pulldown-01", null, 52.5, 10); // beats an existing best
n = await sync(A);
ok(n.some((x) => x.id === "machines4") && n.some((x) => x.id === "pb1") && n.some((x) => x.id === "first_pb"),
  "4 machines + PB mission + first PB badge: " + n.map((x) => x.id).join(","));
let me = await mine(A);
const setXp = (await one(`select sum(xp_gain)::int s from public.set_logs where uid='${A}'`)).s;
const bonus = (await one(`select sum(amount)::int s from public.xp_ledger where uid='${A}'`)).s;
ok(me.wallet.training === setXp && me.wallet.bonus === bonus && me.wallet.balance === setXp + bonus, "wallet = set XP + bonus: " + JSON.stringify(me.wallet));
ok(me.missions_done.includes("machines4") && me.missions_done.includes("pb1") && !me.missions_done.includes("sets15"), "missions done listed");
ok(me.week.sets === 6 && me.week.machines === 4 && me.week.pbs === 1, "week metrics: " + JSON.stringify(me.week));
ok(["first_set", "first_pb"].every((id) => me.badges.some((b) => b.id === id)) && me.season.rank === 1 && me.season.score === setXp + bonus, "badges + season rank: " + JSON.stringify(me.season));

// streak from set days (not attendance): put sets on the 2 previous days
await db.exec(`insert into public.set_logs(uid, machine_id, weight, reps, xp_gain, created_at) values
  ('${A}','squat-07',40,10,10, now() - interval '1 day'), ('${A}','squat-07',40,10,10, now() - interval '2 days')`);
n = await sync(A);
ok(n.some((x) => x.kind === "streak" && x.id === "3" && x.xp === 30), "3-day lifting streak bonus: " + JSON.stringify(n));
me = await mine(A);
ok(me.streak.days === 3 && me.streak.claimed.includes(3), "streak shows 3 days");
// ticking attendance by hand doesn't make a streak
await as(B);
await db.exec(`insert into public.attendance(uid, day) select '${B}', (now() at time zone 'Asia/Kolkata')::date - g from generate_series(1,6) g on conflict do nothing`).catch(() => {});
await L("lat-pulldown-01", null, 40, 10);
await sync(B);
me = await mine(B);
ok(me.streak.days === 1, "hand-ticked attendance doesn't count as a streak: " + me.streak.days);

// flagged sets: on hold, not spendable, not in season score
await as(B);
await L("chest-press-02", null, 30, 10);
await L("chest-press-02", null, 120, 5); // big jump -> flagged
const flaggedXp = (await one(`select coalesce(sum(xp_gain),0)::int s from public.set_logs where uid='${B}' and review_status='flagged'`)).s;
me = await mine(B);
ok(flaggedXp > 0 && me.wallet.on_hold === flaggedXp, "flagged XP is on hold: " + JSON.stringify(me.wallet));
const bScore = (await asRole("anon", null, `select * from public.season_board()`)).find((x) => x.name === "Bo");
ok(bScore && bScore.score === me.wallet.training + me.wallet.bonus, "flagged XP not in season score");

// --- public board: first names only, never emails
await as(C); await L("deadlift-10", null, 40, 5);
const board = await asRole("anon", null, `select * from public.season_board(null, 10)`);
ok(board.length === 3 && board[0].name === "Asha" && board[0].rank === 1, "board ranks by season XP: " + JSON.stringify(board));
ok(board.every((x) => !/@|rao|secret/i.test(x.name)), "board shows first names only: " + board.map((x) => x.name).join(","));
ok(board.find((x) => x.name === "Chris.secret") === undefined && board.some((x) => x.name === "Chris"), "email names cut to first part");
const meRow = (await asRole("authenticated", B, `select * from public.season_board()`)).find((x) => x.is_me);
ok(meRow && meRow.name === "Bo", "is_me marks my row");

// --- XP shop
await as(S);
const rid = (await one(`select id from public.rewards where title like 'Protein oats%'`)).id;
await q(`select public.admin_save_reward('{"id":"${rid}","title":"Protein oats, 1 pack","xp_cost":"100","stock":"2","active":true,"code_mode":"desk","per_member_limit":"1"}')`);
ov = (await asRole("anon", null, `select public.rewards_overview() as r`))[0].r;
ok(ov.shop.length === 1 && ov.shop[0].stock_left === 2, "switched-on reward shows in shop");
await as(A);
const balBefore = (await mine(A)).wallet.balance;
let red = (await asRole("authenticated", A, `select public.redeem_reward(${rid}) as r`))[0].r;
ok(/^RK-[0-9A-F]{6}$/.test(red.code) && red.balance === balBefore - 100, "redeem gives a claim code and spends XP: " + JSON.stringify(red));
me = await mine(A);
ok(me.wallet.balance === balBefore - 100 && me.wallet.lifetime === me.wallet.training + me.wallet.bonus, "spending keeps lifetime XP (level) intact");
ok(me.redemptions.length === 1 && me.redemptions[0].status === "issued", "redemption listed");
e = await errAs("authenticated", A, `select public.redeem_reward(${rid})`);
ok(e && e.code === "RK103", "per-member limit: " + (e && e.message));
// not enough XP
await as(S);
await q(`select public.admin_save_reward('{"title":"Big prize","xp_cost":"999999","active":true}')`);
const big = (await one(`select id from public.rewards where title='Big prize'`)).id;
e = await errAs("authenticated", B, `select public.redeem_reward(${big})`);
ok(e && e.code === "RK104" && /more XP/.test(e.message), "not enough XP: " + (e && e.message));
// on-hold XP can't be spent
const bBal = (await mine(B)).wallet.balance;
await as(S);
await q(`select public.admin_save_reward('{"title":"Edge","xp_cost":"${bBal + 1}","active":true,"stock":"5"}')`);
const edge = (await one(`select id from public.rewards where title='Edge'`)).id;
e = await errAs("authenticated", B, `select public.redeem_reward(${edge})`);
ok(e && e.code === "RK104", "on-hold XP can't be spent");
// stock runs out
await as(S); await q(`select public.admin_save_reward('{"id":"${rid}","title":"Protein oats, 1 pack","xp_cost":"20","stock":"1"}')`);
e = await errAs("authenticated", B, `select public.redeem_reward(${rid})`);
ok(e && e.code === "RK102", "out of stock: " + (e && e.message));
// inactive refused
await as(S); await q(`select public.admin_save_reward('{"id":"${big}","title":"Big prize","active":false}')`);
e = await errAs("authenticated", A, `select public.redeem_reward(${big})`);
ok(e && e.code === "RK101", "switched-off reward refused");
// pool codes: unique code each, then sold out
await as(S);
await q(`select public.admin_save_reward('{"title":"Jersey ₹150 off","xp_cost":"10","active":true,"per_member_limit":"1"}')`);
const pool = (await one(`select id from public.rewards where title like 'Jersey ₹150%'`)).id;
ok((await one(`select public.admin_add_reward_codes(${pool}, E'JD-AAA\\nJD-BBB\\nJD-AAA\\n', false) n`)).n === 2, "codes pasted, duplicates skipped");
const c1 = (await asRole("authenticated", A, `select public.redeem_reward(${pool}) as r`))[0].r.code;
const c2 = (await asRole("authenticated", C, `select public.redeem_reward(${pool}) as r`))[0].r.code;
ok(c1 === "JD-AAA" && c2 === "JD-BBB", "each member gets their own code: " + c1 + " " + c2);
e = await errAs("authenticated", B, `select public.redeem_reward(${pool})`);
ok(e && e.code === "RK102", "no codes left");
// shared code
await as(S);
await q(`select public.admin_save_reward('{"title":"Clean Crate 10% off","xp_cost":"5","active":true,"per_member_limit":"3"}')`);
const sh = (await one(`select id from public.rewards where title like 'Clean Crate 10%'`)).id;
await q(`select public.admin_add_reward_codes(${sh}, 'RACKED10', true)`);
ok((await asRole("authenticated", B, `select public.redeem_reward(${sh}) as r`))[0].r.code === "RACKED10", "shared code handed out");
// cancel refunds XP; hand-over marks fulfilled
const balA = (await mine(A)).wallet.balance;
const redA = (await one(`select id from public.redemptions where uid='${A}' and reward_id=${rid}`)).id;
await as(S); await q(`select public.admin_update_redemption(${redA}, 'cancelled')`);
ok((await mine(A)).wallet.balance === balA + 100, "cancel refunds the XP");
e = await err(`select public.admin_update_redemption(${redA}, 'fulfilled')`);
ok(e && e.code === "RK112", "can't hand over a cancelled one");
const redP = (await one(`select id from public.redemptions where uid='${C}'`)).id;
await q(`select public.admin_update_redemption(${redP}, 'fulfilled')`);
ok((await one(`select status from public.redemptions where id=${redP}`)).status === "fulfilled", "handed over");
ok((await asRole("authenticated", B, `select count(*)::int c from public.redemptions`))[0].c === 1, "members only see their own redemptions");

// --- season award
// make a finished season last week with set logs in it
await db.exec(`insert into public.seasons(period, starts_at, ends_at, title) values ('week', now() - interval '20 days', now() - interval '13 days', 'Old week')`);
const old = (await one(`select id from public.seasons where title='Old week'`)).id;
await db.exec(`insert into public.season_prizes(season_id, rank_from, rank_to, title, sponsor_ids, sort) values
  (${old}, 1, 1, 'Hamper', '{jersey-drip,clean-crate}', 1), (${old}, 2, 2, 'Coupon', '{clean-crate}', 2)`);
await db.exec(`insert into public.set_logs(uid, machine_id, weight, reps, xp_gain, created_at, review_status) values
  ('${B}','squat-07',60,10,300, now() - interval '15 days', 'approved'),
  ('${A}','squat-07',60,10,200, now() - interval '15 days', 'approved'),
  ('${C}','squat-07',60,10,900, now() - interval '15 days', 'flagged')`);
await as(S);
const ad = await one(`select public.admin_rewards_data() as r`);
const toAward = ad.r.to_award.find((x) => x.id === Number(old));
ok(toAward && toAward.board[0].name === "Bo Lee" && toAward.board.length >= 2, "staff preview of winners (flagged excluded): " + JSON.stringify(toAward && toAward.board));
ok(ad.r.live_board.every((x) => !/@/.test(x.name)), "staff view hides emails");
e = await err(`select public.admin_award_season((select id from public.seasons where title like 'Week of%' limit 1))`);
ok(e && e.code === "RK111", "can't award a running season");
await db.exec(`insert into public.seasons(period, starts_at, ends_at, title) values ('week', now() - interval '40 days', now() - interval '33 days', 'Empty week')`);
ok(!(await one(`select public.admin_rewards_data() as r`)).r.to_award.some((x) => x.title === "Empty week"), "weeks nobody trained aren't listed to award");
const won = (await one(`select public.admin_award_season(${old}) as r`)).r;
ok(won.length === 2 && won[0].prize === "Hamper" && won[0].uid === B && won[1].uid === A, "winners awarded: " + JSON.stringify(won));
e = await err(`select public.admin_award_season(${old})`);
ok(e && e.code === "RK110", "can't award twice");
me = await mine(B);
const prize = me.redemptions.find((x) => x.source === "prize");
ok(prize && prize.title === "Hamper" && /^RK-/.test(prize.code) && prize.rank === 1, "winner sees prize with claim code");
ok(me.badges.some((b) => b.id === "podium"), "podium badge for top 3");
ov = (await asRole("anon", null, `select public.rewards_overview() as r`))[0].r;
ok(ov.last_winners && ov.last_winners.season === "Old week" && ov.last_winners.winners[0].name === "Bo", "last winners on overview (first names)");

// --- challenge
await as(S);
const chId = (await one(`select id from public.challenges limit 1`)).id;
await q(`select public.admin_save_challenge('{"id":"${chId}","title":"Clean Crate Leg Day","active":true,"starts_at":"${new Date(Date.now() - 3600e3).toISOString()}","ends_at":"${new Date(Date.now() + 86400e3).toISOString()}"}')`);
await as(A); await L("leg-press-08", null, 100, 8);
await as(B); await L("leg-press-08", null, 80, 8);
n = await sync(A);
ok(n.some((x) => x.kind === "challenge" && x.xp === 20), "joining a challenge pays join XP");
ov = (await asRole("anon", null, `select public.rewards_overview() as r`))[0].r;
ok(ov.challenges.length === 1 && ov.challenges[0].leader.name === "Asha" && Number(ov.challenges[0].leader.value) === 100, "challenge leader shown");
const cb = await asRole("authenticated", B, `select * from public.challenge_board(${chId})`);
ok(cb.length === 2 && cb[1].is_me && cb[1].name === "Bo", "challenge board");
await as(S);
e = await err(`select public.admin_award_challenge(${chId})`);
ok(e && e.code === "RK111", "can't award a running challenge");
await db.exec(`update public.challenges set ends_at = now() where id=${chId}`);
const cw = (await one(`select public.admin_award_challenge(${chId}) as r`)).r;
ok(cw.length === 1 && cw[0].uid === A, "challenge winner awarded");

// --- settings + prizes
await q(`select public.admin_set_season_period('month')`);
ok((await one(`select season_period p from public.rewards_settings`)).p === "month", "switched to monthly");
e = await err(`select public.admin_set_season_period('day')`);
ok(e && e.code === "22023", "bad period refused");
await q(`select public.admin_save_prizes('[{"rank_from":1,"rank_to":1,"title":"Mega hamper","sponsor_ids":["jersey-drip"]},{"rank_from":2,"rank_to":10,"title":"10% coupon"}]', true)`);
ov = (await asRole("anon", null, `select public.rewards_overview() as r`))[0].r;
ok(ov.season.prizes.length === 2 && ov.season.prizes[0].title === "Mega hamper" && ov.season.prizes[1].rank_to === 10, "prizes updated on the live season");
// the running weekly season continues; the next one is monthly and starts where it ends
await db.exec(`update public.seasons set ends_at = now() - interval '1 second' where title like 'Week of%'`);
await db.exec(`update public.seasons set starts_at = ends_at - interval '7 days' where title like 'Week of%'`);
ov = (await asRole("anon", null, `select public.rewards_overview() as r`))[0].r;
ok(ov.season.period === "month" && !/^Week/.test(ov.season.title), "next season is monthly: " + ov.season.title);

// --- sponsors + clicks
await as(S);
await q(`select public.admin_save_sponsor('{"id":"fast-fuel","name":"Fast Fuel","tagline":"Electrolytes","website_url":"https://example.com","active":true}')`);
e = await err(`select public.admin_save_sponsor('{"id":"Bad Id!","name":"x"}')`);
ok(e && e.code === "22023", "bad sponsor id refused");
const pid = (await one(`select public.admin_save_product('{"sponsor_id":"fast-fuel","title":"Lemon sachets","price_text":"₹199"}') id`)).id;
await asRole("anon", null, `select public.track_sponsor_click('fast-fuel', ${pid})`);
await asRole("authenticated", A, `select public.track_sponsor_click('clean-crate', null)`);
await asRole("anon", null, `select public.track_sponsor_click('not-a-sponsor', null)`);
ok((await one(`select count(*)::int c from public.sponsor_clicks`)).c === 2, "clicks counted (unknown sponsor ignored)");
await asRole("authenticated", A, `select public.track_sponsor_click('clean-crate', null)`);
ok((await one(`select count(*)::int c from public.sponsor_clicks`)).c === 2, "same member clicking again within 30 s isn't double-counted");
for (let i = 0; i < 70; i++) await asRole("anon", null, `select public.track_sponsor_click('jersey-drip', null)`);
ok((await one(`select count(*)::int c from public.sponsor_clicks where sponsor_id='jersey-drip'`)).c === 60, "click flood capped at 60 a minute per brand");
const sp = (await one(`select public.admin_rewards_data() as r`)).r.sponsors.find((x) => x.id === "fast-fuel");
ok(sp && sp.clicks_7d === 1 && sp.products.length === 1, "sponsor clicks in staff view");
await q(`select public.admin_delete_product(${pid})`);
ok((await one(`select count(*)::int c from public.sponsor_products where sponsor_id='fast-fuel'`)).c === 0, "product deleted");

// --- bonus XP + logging
await q(`select public.admin_bonus_xp('${C}', 50, 'Event day')`);
ok((await mine(C)).wallet.bonus >= 50, "bonus XP given");
e = await err(`select public.admin_bonus_xp('${C}', 99999, 'x')`);
ok(e && e.code === "22023", "huge bonus refused");
const acts = (await q(`select action from public.staff_actions`)).map((x) => x.action);
ok(["save_reward", "award_season", "award_challenge", "season_period", "save_prizes", "reward_cancelled", "reward_handed_over", "bonus_xp", "add_codes"].every((a) => acts.includes(a)),
  "staff actions logged: " + [...new Set(acts)].join(","));

// --- re-run is safe, account delete still cascades
for (const f of ["0011_rewards.sql"]) await db.exec(fs.readFileSync(R + f, "utf8"));
ok((await one(`select count(*)::int c from public.sponsors`)).c === 3 && (await one(`select count(*)::int c from public.prize_templates`)).c === 2, "re-running 0011 keeps staff edits");
ok((await one(`select title from public.prize_templates order by sort limit 1`)).title === "Mega hamper", "re-run keeps edited prizes");
await as(A); await q(`select public.delete_my_account()`);
ok((await one(`select count(*)::int c from public.xp_ledger where uid='${A}'`)).c === 0, "account delete removes XP history");
await as(S); await q(`select public.admin_reset_all_data()`);
ok((await one(`select (select count(*) from public.xp_ledger) + (select count(*) from public.redemptions) + (select count(*) from public.seasons) c`)).c == 0, "reset all clears XP, rewards and seasons");
ok((await one(`select count(*)::int c from public.sponsors`)).c === 3 && (await one(`select count(*)::int c from public.rewards`)).c > 0, "reset all keeps sponsors and shop items");
ok((await one(`select count(*)::int c from public.reward_codes where redemption_id is not null`)).c === 0, "reset removes used codes (never re-issued)");
ok((await one(`select count(*)::int c from public.season_winners where uid='${A}'`)).c === 0, "account delete removes winner rows");
console.log("pass", pass, "fail", fail);
