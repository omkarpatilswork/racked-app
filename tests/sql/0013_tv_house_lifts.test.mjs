// In-memory Postgres (PGlite) test for 0013_tv_house_lifts.sql. See tests/README.md.
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
grant usage on schema storage, auth to authenticated, anon; grant select, insert, update, delete on storage.objects to authenticated; grant select on storage.objects to anon;
grant execute on function auth.uid() to authenticated, anon;
create function storage.foldername(n text) returns text[] language sql as $$ select string_to_array(n,'/') $$;
`);
const files = fs.readdirSync(R).filter((f) => f.endsWith(".sql") && f < "0014").sort();
for (const f of files) await db.exec(fs.readFileSync(R + f, "utf8"));
const A = "11111111-1111-1111-1111-111111111111", B = "22222222-2222-2222-2222-222222222222", C = "44444444-4444-4444-4444-444444444444", S = "33333333-3333-3333-3333-333333333333";
await db.exec(`insert into auth.users(id,email,raw_user_meta_data) values
  ('${A}','asha.rao@x.com','{"full_name":"Asha Rao"}'),('${B}','bo@x.com','{"full_name":"Bo Lee"}'),
  ('${C}','chris.secret99@gmail.com','{}'),('${S}','s@x.com','{"full_name":"Staff Sam"}')`);
await db.exec(`update public.profiles set is_staff=true where id='${S}'`);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const as = async (u) => db.exec(`select set_config('app.uid','${u || ""}',false)`);
const q = async (sql) => (await db.query(sql)).rows;
const one = async (sql) => (await q(sql))[0];
const err = async (sql) => { try { await db.query(sql); return null; } catch (e) { return e; } };
const shift = async () => db.exec(`update public.set_logs set created_at = created_at - interval '9 seconds'`);
const L = async (m, w, r) => { await q(`select public.log_set('${m}', null, ${w}, ${r})`); await shift(); };
const asRole = async (role, u, sql) => {
  const prev = (await db.query(`select coalesce(current_setting('app.uid', true), '') v`)).rows[0].v;
  await db.exec(`select set_config('app.uid','${u || ""}',false); set role ${role};`);
  try { return (await db.query(sql)).rows; } finally { await db.exec(`reset role; select set_config('app.uid','${prev}',false)`); }
};
const errAs = async (role, u, sql) => { try { await asRole(role, u, sql); return null; } catch (e) { return e; } };
const today = (await one(`select (now() at time zone 'Asia/Kolkata')::date::text d`)).d;
const daysAgo = async (n) => (await one(`select ((now() at time zone 'Asia/Kolkata')::date - ${n})::text d`)).d;
const boards = async (period, limit = 5, fill = 3) =>
  asRole("anon", null, `select * from public.machine_boards('${period}', ${limit}, ${fill})`);
const lp = (rows) => rows.filter((r) => r.machine_id === "leg-press-08");

// --- house lifts: staff only
const save = (p) => `select public.admin_save_house_lift('${JSON.stringify(p)}') id`;
let e = await errAs("authenticated", A, save({ machine_id: "leg-press-08", name: "Vikram", weight: 180, reps: 6 }));
ok(e && e.code === "42501", "members can't add house lifts");
ok(await errAs("authenticated", A, `select * from public.house_lifts`), "members can't read the table");
ok(await errAs("anon", null, `select * from public.house_lifts`), "signed-out can't read the table");
ok(await errAs("authenticated", S, `insert into public.house_lifts(machine_id, name, weight, reps, lifted_on) values ('leg-press-08','X',10,1,current_date)`), "nobody writes the table directly");
await as(S);
const old = await daysAgo(45);
const v = (await one(save({ machine_id: "leg-press-08", name: "  Vikram  ", weight: 180, reps: 6, lifted_on: old }))).id;
ok(v, "staff add a house lift");
let row = await one(`select * from public.house_lifts where id = ${v}`);
ok(row.name === "Vikram" && Number(row.weight) === 180 && row.mode === "" && row.created_by === S, "name trimmed, saved with who added it");
for (const [p, why] of [
  [{ machine_id: "leg-press-08", name: "", weight: 100, reps: 5 }, "no name"],
  [{ machine_id: "leg-press-08", name: "A very long name here", weight: 100, reps: 5 }, "name too long"],
  [{ machine_id: "leg-press-08", name: "me@mail.com", weight: 100, reps: 5 }, "email as name"],
  [{ machine_id: "made-up-99", name: "Raj", weight: 100, reps: 5 }, "unknown machine"],
  [{ machine_id: "pec-fly-rear-delt-04", name: "Raj", weight: 30, reps: 5 }, "dual machine without a side"],
  [{ machine_id: "leg-press-08", name: "Raj", weight: 900, reps: 5 }, "over the machine max"],
  [{ machine_id: "leg-press-08", name: "Raj", weight: 100.3, reps: 5 }, "not a 0.25 kg step"],
  [{ machine_id: "leg-press-08", name: "Raj", weight: 100, reps: 0 }, "zero reps"],
  [{ machine_id: "leg-press-08", name: "Raj", weight: 100, reps: 5, lifted_on: "2999-01-01" }, "future date"],
  [{ machine_id: "leg-press-08", name: "Raj", weight: 100, reps: 5, lifted_on: "not-a-date" }, "bad date"],
]) {
  const x = await err(save(p));
  ok(x && x.code === "22023", "house lift refused: " + why + (x ? "" : " (accepted)"));
}
const pf = (await one(save({ machine_id: "pec-fly-rear-delt-04", mode: "pec-fly", name: "Raj", weight: 40, reps: 10 }))).id;
ok((await one(`select mode, lifted_on::text d from public.house_lifts where id = ${pf}`)).mode === "pec-fly", "dual machine: side saved");
ok((await one(`select lifted_on::text d from public.house_lifts where id = ${pf}`)).d === today, "date defaults to today (gym time)");
await q(save({ id: pf, machine_id: "pec-fly-rear-delt-04", mode: "pec-fly", name: "Raj", weight: 42.5, reps: 8 }));
ok(Number((await one(`select weight from public.house_lifts where id = ${pf}`)).weight) === 42.5, "staff can edit a house lift");
let list = (await one(`select public.admin_house_lifts() r`)).r;
ok(list.length === 2 && list.some((x) => x.name === "Vikram" && x.added_by === "Staff Sam"), "staff list shows house lifts + who added them");
e = await errAs("authenticated", A, `select public.admin_house_lifts()`);
ok(e && e.code === "42501", "members can't list house lifts");

// --- boards: members + house lifts, short boards filled with best-ever lifts
await as(B); await L("leg-press-08", 120, 8);
await db.exec(`update public.set_logs set created_at = now() - interval '40 days' where uid = '${B}'`);
await as(A); await L("leg-press-08", 100, 10); await L("leg-press-08", 90, 12);
let rows = lp(await boards("today"));
ok(rows.length === 3, "today's Leg Press board has 3 places: " + JSON.stringify(rows.map((r) => [r.rank, r.name, Number(r.pb_weight), r.best_ever])));
ok(rows[0].name === "Asha" && Number(rows[0].pb_weight) === 100 && rows[0].best_ever === false && Number(rows[0].rank) === 1 && rows[0].sets === 2, "#1 today: Asha's best set today (2 sets)");
ok(rows[1].name === "Vikram" && rows[1].best_ever === true && Number(rows[1].rank) === 2, "spare place 1: house lift best ever");
ok(rows[2].name === "Bo" && rows[2].best_ever === true && Number(rows[2].pb_weight) === 120, "spare place 2: member's best ever (from 40 days ago)");
ok(!rows.some((r) => "uid" in r || "display_name" in r), "public boards: no ids");
rows = lp(await boards("today", 5, 0));
ok(rows.length === 1 && !rows[0].best_ever, "fill 0: only today's lifters");
rows = lp(await boards("all"));
ok(rows.map((r) => r.name).join() === "Vikram,Bo,Asha" && rows.every((r) => !r.best_ever), "all time: everyone ranked, nothing marked best ever");
rows = lp(await boards("month"));
ok(rows.map((r) => `${r.name}:${r.best_ever}`).join() === "Asha:false,Vikram:true,Bo:true", "this month: Asha, then best-ever lifts from before the month: " + JSON.stringify(rows.map((r) => `${r.name}:${r.best_ever}`)));
// three people today: no filling
await as(C); await L("leg-press-08", 60, 10);
await as(S); await q(save({ machine_id: "leg-press-08", name: "Meera", weight: 70, reps: 10 }));
rows = lp(await boards("today"));
ok(rows.length === 3 && rows.every((r) => !r.best_ever), "3+ lifters today: no best-ever rows");
ok(rows.map((r) => r.name).join() === "Asha,Meera,Chris", "a house lift dated today counts today; email names never shown: " + rows.map((r) => r.name).join());
rows = lp(await boards("today", 2, 3));
ok(rows.length === 2, "limit wins over fill");
// a machine nobody has used is simply missing
ok(!(await boards("today")).some((r) => r.machine_id === "rowing-03"), "unused machine: no board");
// dual machine boards keep their side
rows = (await boards("today")).filter((r) => r.machine_id === "pec-fly-rear-delt-04");
ok(rows.length === 1 && rows[0].mode === "pec-fly" && rows[0].name === "Raj", "house lift on a dual machine's side");

// --- the app's one-machine board
let mb = await asRole("authenticated", A, `select * from public.machine_board('leg-press-08', '', 'today', 3)`);
ok(mb.length === 3 && mb.every((r) => !r.best_ever), "app board: everyone today");
const house = mb.find((r) => r.house);
ok(house && house.uid === null && house.display_name === "Meera" && house.avatar_url === null, "house lifts: no id, no photo");
ok(mb.find((r) => r.uid === A).display_name === "Asha Rao" && !mb.some((r) => String(r.display_name).includes("@")), "member names as on other boards (never an email)");
mb = await asRole("authenticated", A, `select * from public.machine_board('leg-press-08', '', 'week', 0)`);
ok(mb.every((r) => !r.best_ever), "app board: fill 0");
await db.exec(`update public.set_logs set created_at = now() - interval '40 days' where uid = '${C}'`);
await db.exec(`delete from public.house_lifts where name = 'Meera'`);
mb = await asRole("authenticated", A, `select * from public.machine_board('leg-press-08', '', 'today')`);
ok(mb.length === 3 && mb[0].uid === A && mb.slice(1).every((r) => r.best_ever) && Number(mb[1].xp) === 0 && mb[1].house, "app board: today + 2 best-ever (house lift first)");
mb = await asRole("authenticated", A, `select * from public.machine_board('leg-press-08')`);
ok(mb.length === 4 && mb[0].display_name === "Vikram" && Number(mb.find((r) => r.uid === A).xp) > 0, "app board defaults to all time, keeps XP/level");
ok(await errAs("anon", null, `select * from public.machine_board('leg-press-08')`), "app board needs sign-in");

// --- house lifts never touch XP, prizes, challenges or the gym's totals
const act = await asRole("anon", null, `select * from public.tv_activity('all')`);
ok(act.reduce((n, r) => n + r.sets, 0) === (await one(`select count(*)::int c from public.set_logs`)).c, "gym totals: members' sets only");
const sb = await asRole("anon", null, `select * from public.season_board(null, 10)`);
ok(!sb.some((r) => ["Vikram", "Raj"].includes(r.name)), "prize race: members only");
ok((await one(`select count(*)::int c from public.xp_ledger where uid is null`)).c === 0, "no XP without a member");
await as(S); await q(`select public.admin_delete_house_lift(${pf})`);
ok((await one(`select count(*)::int c from public.house_lifts where id = ${pf}`)).c === 0, "staff can remove a house lift");
e = await errAs("authenticated", A, `select public.admin_delete_house_lift(${v})`);
ok(e && e.code === "42501" && (await one(`select count(*)::int c from public.house_lifts where id = ${v}`)).c === 1, "members can't remove house lifts");
const acts = (await q(`select action, detail from public.staff_actions where action like 'house_lift%'`));
ok(acts.some((a) => a.action === "house_lift" && a.detail.includes("Vikram 180 kg × 6")) && acts.some((a) => a.action === "house_lift_removed"), "house lift changes are logged");

// --- TV slide settings
let st = (await asRole("anon", null, `select tv_slides from public.rr_settings`))[0].tv_slides;
ok(st && Object.keys(st).length === 8 && st.join.times === 2 && st.join.seconds === 12 && st.board.times === 4 && st.board.seconds === 10 && st.partner.seconds === 8, "default TV slides: " + JSON.stringify(st));
await as(S);
await q(`select public.admin_save_rr_settings('{"tv_slides":{"board":{"times":5},"partner":{"times":2,"seconds":"15"}}}')`);
st = (await one(`select tv_slides from public.rr_settings`)).tv_slides;
ok(st.board.times === 5 && st.board.seconds === 10 && st.partner.times === 2 && st.partner.seconds === 15 && st.join.times === 2, "save changes only what's sent: " + JSON.stringify(st));
await q(`select public.admin_save_rr_settings('{"tv_slides":{"join":{"times":0},"howto":{"times":0},"board":{"times":99,"seconds":2},"today":{"seconds":300},"prize":{"times":"lots"}}}')`);
st = (await one(`select tv_slides from public.rr_settings`)).tv_slides;
ok(st.join.times === 1 && st.howto.times === 0 && st.board.times === 6 && st.board.seconds === 5 && st.today.seconds === 30 && st.prize.times === 1, "kept within limits (Join always on): " + JSON.stringify(st));
e = await err(`select public.admin_save_rr_settings('{"tv_slides":"fast"}')`);
ok(e && e.code === "22023", "TV settings must be an object");
await q(`select public.admin_save_rr_settings('{"gym_location":"Baner, Pune"}')`);
ok((await one(`select tv_slides from public.rr_settings`)).tv_slides.board.times === 6, "saving gym details keeps the TV settings");
e = await errAs("authenticated", A, `select public.admin_save_rr_settings('{"tv_slides":{"board":{"times":1}}}')`);
ok(e && e.code === "42501", "members can't change the TV");
ok((await one(`select detail from public.staff_actions where action = 'save_rr_settings' order by id desc offset 1 limit 1`)).detail === "TV slide settings saved", "TV changes logged as such");

// --- partner ads
let sp = await one(`select show_on_tv, tv_headline from public.sponsors where id = 'jersey-drip'`);
ok(sp.show_on_tv === true && sp.tv_headline === null, "brands are on the TV by default");
await q(`select public.admin_save_sponsor('{"id":"jersey-drip","tv_headline":"${"Jerseys with your name on them. ".repeat(3)}"}')`);
sp = await one(`select name, website_url, show_on_tv, tv_headline from public.sponsors where id = 'jersey-drip'`);
ok(sp.tv_headline.length <= 60 && sp.name === "Jersey Drip" && sp.website_url === "https://jerseydrip.shop", "TV headline saved (max 60), other fields kept");
await q(`select public.admin_save_sponsor('{"id":"clean-crate","show_on_tv":false}')`);
let feed = (await asRole("anon", null, `select public.tv_feed() f`))[0].f;
ok(feed.tv_partners.length === 1 && feed.tv_partners[0].id === "jersey-drip" && feed.tv_partners[0].tv_headline, "TV feed: only brands switched on for the TV");
ok(feed.tv_slides && feed.tv_slides.board.times === 6, "TV feed: slide settings");
ok(feed.season && Array.isArray(feed.season_top) && feed.sponsors.length === 2 && Array.isArray(feed.challenges), "TV feed: race, brands, challenges");
ok(feed.season_top.every((r) => r.name && !String(r.name).includes("@") && !("uid" in r)), "TV feed: race top 5 by first name");
ok(!JSON.stringify(feed).includes("chris.secret") && !JSON.stringify(feed).includes("updated_by"), "TV feed: no emails, no staff ids");
await q(`select public.admin_save_sponsor('{"id":"clean-crate","show_on_tv":true}')`);

// --- visits: app taps vs TV scans
await db.exec(`delete from public.sponsor_clicks`);
const prod = (await one(`select id from public.sponsor_products where sponsor_id = 'jersey-drip' order by sort limit 1`)).id;
let url = (await asRole("authenticated", A, `select public.track_sponsor_click(p_sponsor_id => 'jersey-drip', p_product_id => ${prod}) u`))[0].u;
ok(url === "https://jerseydrip.shop", "old two-argument call still works, returns the link");
ok((await one(`select source from public.sponsor_clicks`)).source === "app", "app taps counted as app");
url = (await asRole("anon", null, `select public.track_sponsor_click('clean-crate', null, 'tv') u`))[0].u;
ok(url === "https://www.thecleancratefoods.com", "TV scan: brand website");
await asRole("anon", null, `select public.track_sponsor_click('clean-crate', null, 'tv')`);
ok((await one(`select count(*)::int c from public.sponsor_clicks where source = 'tv'`)).c === 2, "each TV scan counts (no sign-in to dedupe)");
await asRole("anon", null, `select public.track_sponsor_click('clean-crate', null, 'hacker')`);
ok((await one(`select count(*)::int c from public.sponsor_clicks where source = 'app'`)).c === 2, "unknown source counted as app");
await asRole("authenticated", A, `select public.track_sponsor_click('jersey-drip', ${prod})`);
ok((await one(`select count(*)::int c from public.sponsor_clicks where uid = '${A}'`)).c === 1, "same member, same link within 30 s: counted once");
await db.exec(`update public.sponsors set active = false where id = 'jersey-drip'`);
url = (await asRole("anon", null, `select public.track_sponsor_click('jersey-drip', null, 'tv') u`))[0].u;
ok(url === null && (await one(`select count(*)::int c from public.sponsor_clicks where sponsor_id = 'jersey-drip'`)).c === 1, "switched-off brand: no link, not counted");
await db.exec(`update public.sponsors set active = true where id = 'jersey-drip'`);
await db.exec(`insert into public.sponsor_clicks (sponsor_id, source) select 'clean-crate', 'tv' from generate_series(1, 70)`);
await asRole("anon", null, `select public.track_sponsor_click('clean-crate', null, 'tv')`);
ok((await one(`select count(*)::int c from public.sponsor_clicks where sponsor_id = 'clean-crate'`)).c === 73, "at most 60 a minute per brand");
await as(S);
const rr = (await one(`select public.admin_rr_data() r`)).r;
ok(rr.tv_scans_30d["clean-crate"] === 72 && !rr.tv_scans_30d["jersey-drip"], "staff see TV scans per brand: " + JSON.stringify(rr.tv_scans_30d));
ok(rr.settings.tv_slides && rr.sponsors.find((s) => s.id === "jersey-drip").tv_headline, "R&R data carries TV settings + headlines");
ok(await errAs("authenticated", A, `select * from public.sponsor_clicks`) === null && (await asRole("authenticated", A, `select count(*)::int c from public.sponsor_clicks`))[0].c === 0, "members can't see visit data");

// --- safe to run again
await db.exec(fs.readFileSync(R + "0013_tv_house_lifts.sql", "utf8"));
ok((await one(`select tv_slides from public.rr_settings`)).tv_slides.board.times === 6, "re-running keeps TV settings");
ok((await one(`select count(*)::int c from public.house_lifts`)).c === 1, "re-running keeps house lifts");
ok((await one(`select tv_headline from public.sponsors where id = 'jersey-drip'`)).tv_headline, "re-running keeps TV headlines");
ok((await q(`select 1 from pg_proc where proname = 'track_sponsor_click'`)).length === 1, "one track_sponsor_click (no ambiguous overloads)");
await as(S); await q(`select public.admin_reset_all_data()`);
ok((await one(`select count(*)::int c from public.house_lifts`)).c === 1, "reset-all keeps house lifts (staff content)");
rows = lp(await boards("today"));
ok(rows.length === 1 && rows[0].name === "Vikram" && rows[0].best_ever, "after a reset: house lift still fills the board");
await as(A); await q(`select public.delete_my_account()`);
ok((await one(`select count(*)::int c from public.profiles where id = '${A}'`)).c === 0, "account delete still works");
console.log("pass", pass, "fail", fail);
process.exit(fail ? 1 : 0);
