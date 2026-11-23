// In-memory Postgres (PGlite) test for supabase/demo/demo_seed.sql + demo_remove.sql.
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
process.on("unhandledRejection", (e) => { console.log("ERROR:", e.message); process.exit(1); });
const R = new URL("../../supabase/migrations/", import.meta.url).pathname;
const DEMO = new URL("../../supabase/demo/", import.meta.url).pathname;
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated;
create schema auth;
create table auth.users(id uuid primary key, instance_id uuid, aud varchar(255), role varchar(255), email varchar(255),
  encrypted_password varchar(255), email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb default '{}',
  created_at timestamptz, updated_at timestamptz, confirmation_token varchar(255), recovery_token varchar(255),
  email_change_token_new varchar(255), email_change varchar(255), is_sso_user boolean not null default false);
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
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const q = async (sql) => (await db.query(sql)).rows;
const one = async (sql) => (await q(sql))[0];
const asRole = async (role, u, sql) => {
  await db.exec(`select set_config('app.uid','${u || ""}',false); set role ${role};`);
  try { return (await db.query(sql)).rows; } finally { await db.exec(`reset role; select set_config('app.uid','',false)`); }
};

// before 0015: refuses politely
for (const f of fs.readdirSync(R).filter((f) => f.endsWith(".sql") && f < "0015").sort()) await db.exec(fs.readFileSync(R + f, "utf8"));
let e = null; try { await db.exec(fs.readFileSync(DEMO + "demo_seed.sql", "utf8")); } catch (x) { e = x; }
ok(e && /0015/.test(e.message), "needs 0015 first");
await db.exec(fs.readFileSync(R + "0015_strength_boards.sql", "utf8"));

// a real member with real data
const A = "11111111-1111-1111-1111-111111111111", S = "33333333-3333-3333-3333-333333333333";
await db.exec(`insert into auth.users(id,email,raw_user_meta_data) values ('${A}','asha@x.com','{"full_name":"Asha Rao"}'),('${S}','s@x.com','{"full_name":"Staff Sam"}');
  update public.profiles set is_staff = true where id = '${S}';`);
await asRole("authenticated", A, `select public.set_my_body('women', 60)`);
await asRole("authenticated", A, `select public.log_set('lat-pulldown-01', null, 40, 10)`);
await db.exec(`update public.set_logs set created_at = created_at - interval '2 minutes'`);
const realBefore = await one(`select (select count(*) from public.set_logs where uid = '${A}')::int s, (select count(*) from public.member_body)::int b`);

// seed
await db.exec(fs.readFileSync(DEMO + "demo_seed.sql", "utf8"));
const n = async (sql) => Number((await one(sql)).c);
ok(await n(`select count(*) c from public.profiles where id::text like 'dddddddd-dddd-4ddd-8ddd-%'`) === 20, "20 sample members");
ok(await n(`select count(*) c from auth.users where email like '%@demo.racked.invalid' and encrypted_password = '' and confirmation_token = ''`) === 20, "sign-in rows with no password (can't sign in)");
ok(await n(`select count(*) c from public.member_body where uid::text like 'dddddddd%' and division = 'men'`) === 12, "12 on the Men's board");
ok(await n(`select count(*) c from public.member_body where uid::text like 'dddddddd%' and division = 'women'`) === 7, "7 on the Women's board");
const sets = await n(`select count(*) c from public.set_logs where uid::text like 'dddddddd%'`);
ok(sets > 400, "lots of sets: " + sets);
ok(await n(`select count(*) c from public.set_logs where uid::text like 'dddddddd%' and created_at > now()`) === 0, "nothing in the future");
ok(await n(`select count(*) c from public.set_logs where uid::text like 'dddddddd%' and created_at >= date_trunc('day', now() at time zone public.app_timezone()) at time zone public.app_timezone()`) > 50, "busy today");
ok(await n(`select count(distinct machine_id) c from public.set_logs where uid::text like 'dddddddd%'`) === 10, "all 10 machines");
ok(await n(`select count(*) c from public.set_logs where uid::text like 'dddddddd%' and body_kg is null`) === 0, "every set has a body weight");
ok(await n(`select count(*) c from public.set_logs where uid::text like 'dddddddd%' and is_pb`) > 50, "PRs");
ok(await n(`select count(*) c from public.set_logs where uid::text like 'dddddddd%' and review_status = 'flagged'`) < 10, "hardly any flagged sets");
ok(await n(`select count(*) c from public.machine_stats where uid::text like 'dddddddd%'`) > 100 &&
   await n(`select count(*) c from public.machine_stats where uid::text like 'dddddddd%' and level > 1`) > 0, "machine stats + levels");
ok(await n(`select count(*) c from public.wall_posts where uid::text like 'dddddddd%'`) === 12, "12 posts");
ok(await n(`select count(*) c from public.wall_media m join public.wall_posts w on w.id = m.post_id where w.kind = 'transformation' and m.path like 'demo/%'`) === 4, "transformations with before + after (bundled pictures)");
ok(await n(`select count(*) c from public.feed_comments where uid::text like 'dddddddd%'`) > 15, "comments");
ok(await n(`select count(*) c from public.pump_photos where uid::text like 'dddddddd%'`) === 8, "pump checks");
ok(await n(`select count(*) c from public.gym_posts where created_by::text like 'dddddddd%'`) >= 1, "sample notice");
// what members see
const board = await asRole("anon", null, `select * from public.strength_boards('today', 5, 3)`);
ok(board.filter((r) => r.division === "men").length > 10 && board.filter((r) => r.division === "women").length > 5, "TV boards are full");
const feed = (await asRole("authenticated", A, `select public.home_feed(null, 60, 'all') f`))[0].f;
const types = new Set(feed.items.map((i) => i.type));
ok(types.has("wall") && types.has("set") && types.has("milestone") && feed.pinned.length === 1, "feed: posts, workouts, milestones, pinned notice: " + [...types].join(","));
const ov = (await asRole("anon", null, `select public.rewards_overview() o`))[0].o;
ok(ov.season.leaders.men && ov.season.leaders.women, "prize race has a Men's and a Women's leader");
ok(ov.challenges.some((c) => c.title === "Leg Press Week (sample)" && c.leaders.men), "sample challenge with leaders");
ok(ov.last_winners && ov.last_winners.winners.some((w) => w.division === "women"), "last week's winners (no real lifts that week)");
const my = (await asRole("authenticated", A, `select public.my_rewards() m`))[0].m;
ok(my.season.division === "women" && my.season.players >= 3 && my.season.rank !== null, "a real member races the samples on her board");
// demo can't win this week
await db.exec(`update public.seasons set ends_at = now() - interval '1 second' where starts_at <= now() and ends_at > now()`);
const sid = Number((await one(`select id from public.seasons where ends_at < now() and awarded_at is null order by ends_at desc limit 1`)).id);
await db.exec(`select set_config('app.uid','${S}',false)`);
const won = (await one(`select public.admin_award_season(${sid}) w`)).w;
await db.exec(`select set_config('app.uid','',false)`);
ok(won.length >= 1 && won.every((w) => !w.uid.startsWith("dddddddd")), "awarding: only real members win");

// run again: refreshed, not doubled
await db.exec(`update public.seasons set awarded_at = null where id = ${sid}; delete from public.season_winners where season_id = ${sid}; delete from public.redemptions where season_id = ${sid};
  update public.seasons set ends_at = starts_at + interval '7 days' where id = ${sid};`);
await db.exec(fs.readFileSync(DEMO + "demo_seed.sql", "utf8"));
ok(await n(`select count(*) c from public.profiles where id::text like 'dddddddd%'`) === 20 && await n(`select count(*) c from public.wall_posts where uid::text like 'dddddddd%'`) === 12, "running it again refreshes (no doubles)");
ok(await n(`select count(*) c from public.challenges where title = 'Leg Press Week (sample)'`) === 1, "one sample challenge");

// real member comments on a sample post, then remove everything
const wp = Number((await one(`select id from public.wall_posts where uid::text like 'dddddddd%' order by id limit 1`)).id);
await asRole("authenticated", A, `select public.add_comment('wall', ${wp}, 'nice')`);
const lastSeason = await one(`select id, awarded_at from public.seasons where id in (select val::bigint from public._demo_seeded where key like 'season_awarded:%')`);
await db.exec(fs.readFileSync(DEMO + "demo_remove.sql", "utf8"));
ok(await n(`select count(*) c from public.profiles where id::text like 'dddddddd%'`) === 0, "removed: no sample members");
ok(await n(`select count(*) c from public.set_logs where uid::text like 'dddddddd%'`) === 0 && await n(`select count(*) c from public.wall_posts`) === 0 &&
   await n(`select count(*) c from public.member_body where uid::text like 'dddddddd%'`) === 0, "removed: their sets, posts, body weights");
ok(await n(`select count(*) c from public.feed_comments`) === 0, "removed: comments on sample posts, even real members'");
ok(await n(`select count(*) c from public.gym_posts`) === 0 && await n(`select count(*) c from public.challenges where title like '%(sample)'`) === 0, "removed: sample notice, offer, challenge");
ok(await n(`select count(*) c from information_schema.tables where table_name = '_demo_seeded'`) === 0, "removed: bookkeeping table");
if (lastSeason) ok((await one(`select awarded_at from public.seasons where id = ${lastSeason.id}`)) === undefined || (await one(`select awarded_at from public.seasons where id = ${lastSeason.id}`)).awarded_at === null, "last week is back to 'not awarded'");
const realAfter = await one(`select (select count(*) from public.set_logs where uid = '${A}')::int s, (select count(*) from public.member_body)::int b`);
ok(realAfter.s === realBefore.s && realAfter.b === realBefore.b, "real members untouched");
await db.exec(fs.readFileSync(DEMO + "demo_remove.sql", "utf8"));
ok(true, "removing twice is fine");

console.log(`pass ${pass} fail ${fail}`);
process.exit(fail ? 1 : 0);
