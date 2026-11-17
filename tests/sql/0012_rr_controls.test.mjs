// In-memory Postgres (PGlite) test for 0012_rr_controls.sql. See tests/README.md.
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
for (const f of fs.readdirSync(R).sort()) await db.exec(fs.readFileSync(R + f, "utf8"));
const A = "11111111-1111-1111-1111-111111111111", B = "22222222-2222-2222-2222-222222222222", S = "33333333-3333-3333-3333-333333333333";
await db.exec(`insert into auth.users(id,email,raw_user_meta_data) values
  ('${A}','asha.rao@x.com','{"full_name":"Asha Rao"}'),('${B}','bo@x.com','{"full_name":"Bo Lee"}'),('${S}','s@x.com','{"full_name":"Staff Sam"}')`);
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
const overview = async () => (await asRole("anon", null, `select public.rewards_overview() as r`))[0].r;

// --- gym settings
let st = (await asRole("anon", null, `select * from public.rr_settings`))[0];
ok(st && st.gym_name === "Club 360" && st.show_partners && st.show_shop, "gym defaults to Club 360, readable signed out");
let e = await errAs("authenticated", A, `update public.rr_settings set gym_name = 'Hacked'`);
ok(e, "members can't edit gym settings directly");
e = await errAs("authenticated", A, `select public.admin_save_rr_settings('{"gym_name":"x"}')`);
ok(e && e.code === "42501", "members can't use the staff save");
await as(S);
await q(`select public.admin_save_rr_settings('{"gym_location":"Baner, Pune","gym_logo_url":"https://x/logo.png","rewards_note":"Prizes handed out every Monday"}')`);
st = await one(`select * from public.rr_settings`);
ok(st.gym_name === "Club 360" && st.gym_location === "Baner, Pune" && st.gym_logo_url === "https://x/logo.png", "staff save changes only the fields sent");
e = await err(`select public.admin_save_rr_settings('{"gym_name":"  "}')`);
ok(e && e.code === "22023", "gym can't have an empty name");
await q(`select public.admin_save_rr_settings('{"show_shop":false}')`);
let ov = await overview();
ok(ov.settings && ov.settings.gym_location === "Baner, Pune" && ov.settings.show_shop === false && !("updated_by" in ov.settings), "overview carries gym + page settings (no staff id)");
await q(`select public.admin_save_rr_settings('{"show_shop":true}')`);

// --- photo bucket
const bucket = await one(`select * from storage.buckets where id = 'rr-media'`);
ok(bucket && bucket.public === true && bucket.allowed_mime_types.includes("image/png") && !bucket.allowed_mime_types.includes("image/svg+xml"), "public rr-media bucket, images only (no SVG)");
ok(!(await errAs("authenticated", S, `insert into storage.objects(bucket_id, name) values ('rr-media', 'prizes/hamper.jpg')`)), "staff can upload photos");
ok(await errAs("authenticated", A, `insert into storage.objects(bucket_id, name) values ('rr-media', 'prizes/fake.jpg')`), "members can't upload photos");
ok((await asRole("anon", null, `select count(*)::int c from storage.objects where bucket_id = 'rr-media'`))[0].c === 1, "anyone can see rr-media photos");
ok(await errAs("authenticated", A, `delete from storage.objects where bucket_id = 'rr-media'`) === null &&
   (await one(`select count(*)::int c from storage.objects where bucket_id = 'rr-media'`)).c === 1, "members can't delete photos");
await asRole("authenticated", S, `delete from storage.objects where bucket_id = 'rr-media'`);
ok((await one(`select count(*)::int c from storage.objects where bucket_id = 'rr-media'`)).c === 0, "staff can delete photos");

// --- prize photos
await as(S);
await q(`select public.admin_save_prizes('[{"rank_from":1,"rank_to":1,"title":"Gift hamper","sponsor_ids":["jersey-drip","clean-crate"],"image_url":"https://x/hamper.jpg"},{"rank_from":2,"rank_to":5,"title":"Partner coupons"}]', true)`);
ov = await overview();
ok(ov.season.prizes[0].image_url === "https://x/hamper.jpg" && ov.season.prizes[1].image_url === null, "prize photo on this week's prize");
ok((await one(`select image_url from public.prize_templates where rank_from = 1`)).image_url === "https://x/hamper.jpg", "prize photo kept for next weeks");
// a new season copies photos from the templates
await db.exec(`update public.seasons set ends_at = now() - interval '1 second', starts_at = now() - interval '7 days'`);
ov = await overview();
ok(ov.season.prizes[0].image_url === "https://x/hamper.jpg", "next season starts with the prize photo");

// --- brand cover + partial edits
await q(`select public.admin_save_sponsor('{"id":"clean-crate","cover_url":"https://x/cover.jpg"}')`);
const cc = await one(`select * from public.sponsors where id = 'clean-crate'`);
ok(cc.cover_url === "https://x/cover.jpg" && cc.name === "The Clean Crate" && cc.website_url === "https://www.thecleancratefoods.com", "brand cover saved without wiping other fields");
ov = await overview();
ok(ov.sponsors.find((s) => s.id === "clean-crate").cover_url === "https://x/cover.jpg", "cover in overview");
e = await err(`select public.admin_save_sponsor('{"id":"new-brand"}')`);
ok(e && e.code === "22023", "a new brand needs a name");

// --- the Friday challenge
const series = await one(`select * from public.challenge_series`);
ok(series && series.title === "Clean Crate Leg Press Challenge" && series.machine_id === "leg-press-08" && series.active, "Leg Press challenge seeded and on");
const sj = (await one(`select public._series_json(s) j from public.challenge_series s`)).j;
ok(sj.weekday === 5 && sj.start_time === "00:00" && sj.end_time === "24:00", "every Friday, all day (gym time): " + JSON.stringify([sj.weekday, sj.start_time, sj.end_time]));
ok((await one(`select count(*)::int c from public.challenges where title = 'Clean Crate Leg Day'`)).c === 0, "0011's draft sample removed");
const round = await one(`select * from public.challenges where series_id = ${series.id}`);
ok(round && new Date(round.ends_at) > new Date() && Number(new Date(round.ends_at) - new Date(round.starts_at)) === 86400000, "this week's (or next) Friday round exists, 24 h long");
ok((await one(`select extract(isodow from starts_at at time zone 'Asia/Kolkata')::int d from public.challenges where id = ${round.id}`)).d === 5, "round is on a Friday");
ov = await overview();
const ovc = ov.challenges.find((c) => c.series_id === Number(series.id));
ok(ovc && ovc.repeats === "weekly" && ovc.weekday === 5 && ovc.prize.includes("goodie bag"), "overview shows the weekly challenge");
await overview();
ok((await one(`select count(*)::int c from public.challenges where series_id = ${series.id}`)).c === 1, "calling again doesn't add rounds");

// a series that's live today, to test rounds end-to-end
const today = (await one(`select extract(isodow from now() at time zone 'Asia/Kolkata')::int d`)).d;
await as(S);
const sid = (await one(`select public.admin_save_series('{"title":"Deadlift Day","sponsor_id":"jersey-drip","metric":"best_lift","machine_id":"deadlift-10","weekday":"${today}","start_time":"00:00","end_time":"24:00","prize":"A jersey","join_xp":"15"}') id`)).id;
let live = await one(`select * from public.challenges where series_id = ${sid}`);
ok(live && new Date(live.starts_at) <= new Date() && new Date(live.ends_at) > new Date(), "a series on today's weekday is live now");
await as(A); await L("deadlift-10", 60, 5);
await as(B); await L("deadlift-10", 80, 3);
const synced = (await asRole("authenticated", A, `select public.sync_my_rewards() r`))[0].r;
ok(synced.some((x) => x.kind === "challenge" && x.xp === 15), "joining this week's round pays join XP");
ov = await overview();
let dl = ov.challenges.find((c) => c.series_id === Number(sid));
ok(dl && dl.leader.name === "Bo" && Number(dl.leader.value) === 80 && dl.last_result === null, "live round shows its leader");
// staff edit: wording/prize apply to the live round
await as(S);
await q(`select public.admin_save_series('{"id":"${sid}","title":"Deadlift Day","prize":"A signed jersey"}')`);
ok((await one(`select prize from public.challenges where id = ${live.id}`)).prize === "A signed jersey", "edit reaches the running round");
ok((await one(`select first_start from public.challenge_series where id = ${sid}`)).first_start.getTime() === new Date(live.starts_at).getTime(), "editing without times keeps the schedule");
// a week passes: the round ends, next week's is created, last result shown
await db.exec(`update public.challenges set starts_at = starts_at - interval '7 days', ends_at = ends_at - interval '7 days' where id = ${live.id}`);
await db.exec(`update public.set_logs set created_at = created_at - interval '7 days' where machine_id = 'deadlift-10'`);
await db.exec(`update public.challenge_series set first_start = first_start - interval '7 days', first_end = first_end - interval '7 days' where id = ${sid}`);
ov = await overview();
const rounds = await q(`select * from public.challenges where series_id = ${sid} order by starts_at`);
ok(rounds.length === 2 && new Date(rounds[1].starts_at) > new Date(rounds[0].starts_at), "next round created after the last one ended");
dl = ov.challenges.filter((c) => c.series_id === Number(sid));
ok(dl.length === 1 && dl[0].id === Number(rounds[1].id), "members see only the current round");
ok(dl[0].last_result && dl[0].last_result.name === "Bo" && Number(dl[0].last_result.value) === 80, "last week's winner shown on the new round");
const award = (await one(`select public.admin_award_challenge(${rounds[0].id}) r`)).r;
ok(award.length === 1, "last week's round is awarded on its own");
ok((await one(`select title, rank from public.redemptions where uid = '${B}' and source = 'challenge'`)).title === "A signed jersey", "winner gets the round's prize");
// rescheduling rebuilds rounds that haven't started
const nextDay = today === 7 ? 1 : today + 1;
await q(`select public.admin_save_series('{"id":"${sid}","title":"Deadlift Day","weekday":"${nextDay}","start_time":"06:00","end_time":"22:00"}')`);
const after = await q(`select * from public.challenges where series_id = ${sid} and starts_at > now() order by starts_at`);
ok(after.length === 1 && new Date(after[0].ends_at) - new Date(after[0].starts_at) === 16 * 3600000, "next round uses the new times: " + JSON.stringify(after.map((r) => [r.starts_at, r.ends_at])));
ok((await one(`select count(*)::int c from public.challenges where id = ${rounds[1].id}`)).c === 1, "the round already running isn't cut short");
ov = await overview();
ok(ov.challenges.filter((c) => c.series_id === Number(sid)).map((c) => c.id).join() === String(rounds[1].id), "members still see the running round first");
const sj2 = (await one(`select public._series_json(s) j from public.challenge_series s where id = ${sid}`)).j;
ok(sj2.weekday === nextDay && sj2.start_time === "06:00" && sj2.end_time === "22:00", "series shows the new day and times");
// switching a series off hides it
await q(`select public.admin_save_series('{"id":"${sid}","title":"Deadlift Day","active":false}')`);
ov = await overview();
ok(!ov.challenges.some((c) => c.series_id === Number(sid)), "switched-off series disappears");
// validation
for (const [p, why] of [
  [`{"title":"x"}`, "short name"],
  [`{"title":"Valid","weekday":"9"}`, "bad weekday"],
  [`{"title":"Valid","start_time":"20:00","end_time":"08:00"}`, "end before start"],
  [`{"title":"Valid","start_time":"25:99"}`, "bad time"],
]) {
  const x = await err(`select public.admin_save_series('${p}')`);
  ok(x && x.code === "22023", "series refused: " + why);
}
e = await errAs("authenticated", A, `select public.admin_save_series('{"title":"Mine"}')`);
ok(e && e.code === "42501", "members can't create challenges");
ok(await errAs("authenticated", A, `insert into public.challenge_series(title, first_start, first_end) values ('x', now(), now() + interval '1 hour')`), "members can't write series directly");

// --- staff data
await as(S);
const rr = (await one(`select public.admin_rr_data() r`)).r;
ok(rr.settings.gym_location === "Baner, Pune" && rr.series.length === 2, "R&R data: settings + both series");
const fri = rr.series.find((x) => x.title === "Clean Crate Leg Press Challenge");
ok(fri.weekday === 5 && fri.next && fri.next.starts_at, "R&R data: series day + next round");
ok(rr.season && rr.rewards && rr.sponsors && rr.redemptions, "R&R data includes everything from the Rewards tab");
ok(rr.season_prizes[0].image_url === "https://x/hamper.jpg", "R&R data has prize photos");
ok(rr.challenges.every((c) => c.top.every((t) => !String(t.name).includes("@"))), "no emails in challenge boards");
// leader on the race
await as(A); await L("lat-pulldown-01", 40, 10);
ov = await overview();
ok(ov.season.leader && ["Asha", "Bo"].includes(ov.season.leader.name), "race shows who's winning (first name)");

// --- logging + idempotency
const acts = (await q(`select action from public.staff_actions`)).map((x) => x.action);
ok(["save_rr_settings", "save_series", "save_prizes", "save_sponsor"].every((a) => acts.includes(a)), "staff changes logged");
await db.exec(fs.readFileSync(R + "0012_rr_controls.sql", "utf8"));
ok((await one(`select count(*)::int c from public.challenge_series`)).c === 2, "re-running 0012 doesn't re-seed");
ok((await one(`select gym_location from public.rr_settings`)).gym_location === "Baner, Pune", "re-running keeps settings");
ok((await one(`select image_url from public.prize_templates where rank_from = 1`)).image_url === "https://x/hamper.jpg", "re-running keeps prize photos");
await as(A); await q(`select public.delete_my_account()`);
ok((await one(`select count(*)::int c from public.profiles where id = '${A}'`)).c === 0, "account delete still works");
console.log("pass", pass, "fail", fail);
