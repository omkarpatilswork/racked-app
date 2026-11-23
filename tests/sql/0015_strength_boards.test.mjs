// In-memory Postgres (PGlite) test for 0015_strength_boards.sql. See tests/README.md.
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
const files = fs.readdirSync(R).filter((f) => f.endsWith(".sql") && f < "0016").sort();
for (const f of files) await db.exec(fs.readFileSync(R + f, "utf8"));
ok0();
function ok0() {}
const A = "11111111-1111-1111-1111-111111111111", B = "22222222-2222-2222-2222-222222222222", C = "44444444-4444-4444-4444-444444444444",
  D = "55555555-5555-5555-5555-555555555555", E = "66666666-6666-6666-6666-666666666666", S = "33333333-3333-3333-3333-333333333333",
  X = "dddddddd-dddd-4ddd-8ddd-000000000001"; // a demo account
await db.exec(`insert into auth.users(id,email,raw_user_meta_data) values
  ('${A}','asha@x.com','{"full_name":"Asha Rao"}'),('${B}','bo@x.com','{"full_name":"Bo Lee"}'),
  ('${C}','cara@x.com','{"full_name":"Cara M"}'),('${D}','dev@x.com','{"full_name":"Dev K"}'),
  ('${E}','eli@x.com','{"full_name":"Eli P"}'),('${S}','s@x.com','{"full_name":"Staff Sam"}'),
  ('${X}','demo1@demo.racked.invalid','{"full_name":"Demo Dan"}')`);
await db.exec(`update public.profiles set is_staff=true where id='${S}'`);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const q = async (sql) => (await db.query(sql)).rows;
const one = async (sql) => (await q(sql))[0];
const asRole = async (role, u, sql) => {
  await db.exec(`select set_config('app.uid','${u || ""}',false); set role ${role};`);
  try { return (await db.query(sql)).rows; } finally { await db.exec(`reset role; select set_config('app.uid','',false)`); }
};
const errAs = async (role, u, sql) => { try { await asRole(role, u, sql); return null; } catch (e) { return e; } };
const shift = async () => db.exec(`update public.set_logs set created_at = created_at - interval '9 seconds'`);
const L = async (u, m, w, r) => { await asRole("authenticated", u, `select public.log_set('${m}', null, ${w}, ${r})`); await shift(); };
const body = (u, d, kg) => asRole("authenticated", u, `select public.set_my_body(${d ? `'${d}'` : "null"}, ${kg ?? "null"}) b`).then((r) => r[0].b);
const bodyErr = async (u, d, kg) => { try { await body(u, d, kg); return null; } catch (e) { return e; } };
const ago = async (u, field, iv) => db.exec(`update public.member_body set ${field} = now() - interval '${iv}' where uid = '${u}'`);

// --- body weight + board
ok((await one(`select count(*)::int c from information_schema.tables where table_name = 'member_body'`)).c === 1, "member_body table");
let e = await errAs("anon", null, `select public.my_body()`);
ok(e, "signed out: no body data");
let b = (await asRole("authenticated", A, `select public.my_body() b`))[0].b;
ok(b.division === null && b.body_kg === null, "nothing set yet");
await L(A, "lat-pulldown-01", 50, 10); // a set before telling us her weight
e = await bodyErr(A, "women", null);
ok(e && e.code === "RK303", "first time needs a body weight");
e = await bodyErr(A, null, 60);
ok(e && e.code === "RK303", "first time needs a board");
e = await bodyErr(A, "ladies", 60);
ok(e && e.code === "RK303", "only men / women / open");
e = await bodyErr(A, "women", 12);
ok(e && e.code === "RK303", "body weight range");
b = await body(A, "women", 62.46);
ok(b.division === "women" && Number(b.body_kg) === 62.5, "saved, rounded to 0.1 kg");
ok((await one(`select body_kg from public.set_logs where uid = '${A}'`)).body_kg == 62.5, "sets from before count at that weight");
b = await body(A, null, 61.5);
ok(Number(b.body_kg) === 61.5, "typo fixed within 15 minutes");
ok((await one(`select body_kg from public.set_logs where uid = '${A}'`)).body_kg == 61.5, "typo fix corrects sets since");
await ago(A, "body_set_at", "1 hour");
e = await bodyErr(A, null, 58);
ok(e && e.code === "RK301", "then once a week");
b = (await asRole("authenticated", A, `select public.my_body() b`))[0].b;
ok(b.next_body_change !== null, "my_body says when the next change is allowed");
await ago(A, "body_set_at", "8 days");
b = await body(A, null, 60);
ok(Number(b.body_kg) === 60, "a week later: new weight");
ok((await one(`select body_kg from public.set_logs where uid = '${A}'`)).body_kg == 61.5, "old sets keep the weight on the day");
await ago(A, "division_set_at", "1 hour");
e = await bodyErr(A, "men", null);
ok(e && e.code === "RK302", "board change: once a month");
await ago(A, "division_set_at", "31 days");
b = await body(A, "open", null);
ok(b.division === "open", "a month later: board change ok");
await ago(A, "division_set_at", "31 days");
await body(A, "women", null);
// RLS: own row only, no writes
await body(B, "men", 80);
let rows = await asRole("authenticated", A, `select uid from public.member_body`);
ok(rows.length === 1 && rows[0].uid === A, "members only read their own body row");
e = await errAs("authenticated", A, `update public.member_body set body_kg = 40 where uid = '${A}'`);
ok(e || (await one(`select body_kg from public.member_body where uid='${A}'`)).body_kg == 60, "no direct writes");
e = await errAs("anon", null, `select * from public.member_body`);
ok(e, "visitors can't read body data");
ok(!(await one(`select count(*)::int c from information_schema.columns where table_name='profiles' and column_name in ('body_kg','division')`)).c, "nothing added to the public profile");

// --- every set remembers the body weight on the day
await L(A, "lat-pulldown-01", 45, 8);
ok((await one(`select body_kg from public.set_logs where uid = '${A}' order by id desc limit 1`)).body_kg == 60, "new sets get today's weight");
await L(C, "lat-pulldown-01", 40, 10); // no body weight yet
ok((await one(`select body_kg from public.set_logs where uid = '${C}'`)).body_kg === null, "no weight yet: none stored");

// --- machine boards by ×BW
await body(C, "women", 50);  // 40/50 = 0.80
await body(D, "men", 60);
await L(D, "lat-pulldown-01", 50, 6);   // 0.83
await L(B, "lat-pulldown-01", 64, 10);  // 0.80 (more kg, less ×BW)
await body(E, "open", 70);
await L(E, "lat-pulldown-01", 70, 5);   // 1.00, prefer not to say
await body(X, "men", 75);
await L(X, "lat-pulldown-01", 60, 8);   // demo: 0.80
const board = (u, div, period = "all") => asRole("authenticated", u, `select * from public.strength_board('lat-pulldown-01', '', '${period}', '${div}', 0)`);
rows = await board(A, "men");
ok(rows.map((r) => r.display_name.split(" ")[0]).join(",") === "Dev,Bo,Demo", "men's board ranks by ×BW, not kg: " + rows.map((r) => r.display_name + " " + r.ratio).join(","));
ok(Number(rows[0].ratio) === 0.83 && Number(rows[1].ratio) === 0.8, "ratios to 2 places");
ok(rows.every((r) => r.weight === null), "no kg on other people's rows");
rows = await board(A, "women");
ok(rows.length === 2 && rows[0].display_name.startsWith("Asha") && rows[1].display_name.startsWith("Cara"), "women's board (0.81 beats 0.80): " + rows.map((r) => r.display_name + " " + r.ratio).join(","));
const me = rows.find((r) => r.is_me);
ok(me && Number(me.weight) === 50 && Number(me.ratio) === 0.81, "my own row shows my kg (best: 50 kg at 61.5 = 0.81)");
rows = await board(A, "all");
ok(rows[0].display_name.startsWith("Eli") && rows.length === 6, "All: everyone with a body weight, incl. prefer not to say");
rows = await asRole("anon", null, `select * from public.strength_boards('all', 5, 0)`);
ok(rows.length > 0 && !("weight" in rows[0]) && !("uid" in rows[0]), "public boards: no kg, no ids");
ok(rows.filter((r) => r.machine_id === "lat-pulldown-01" && r.division === "men").map((r) => r.name).join(",") === "Dev,Bo,Demo", "TV: men's board");
ok(rows.filter((r) => r.machine_id === "lat-pulldown-01" && r.division === "women").map((r) => r.name).join(",") === "Asha,Cara", "TV: women's board");
ok(!rows.some((r) => r.name === "Eli"), "prefer-not-to-say isn't on the Men's/Women's TV boards");
// best-ever filling on a short period board
await db.exec(`update public.set_logs set created_at = now() - interval '3 days' where uid in ('${B}', '${X}')`);
rows = (await asRole("anon", null, `select * from public.strength_boards('today', 5, 3)`)).filter((r) => r.machine_id === "lat-pulldown-01" && r.division === "men");
ok(rows.length === 3 && rows[0].name === "Dev" && !rows[0].best_ever && rows.slice(1).every((r) => r.best_ever), "today: best-ever ×BW fills the spare places");
// house lifts need a body weight + board
await db.exec(`select set_config('app.uid','${S}',false)`);
e = null; try { await q(`select public.admin_save_house_lift('{"machine_id":"lat-pulldown-01","name":"Meera","weight":45,"reps":10}'::jsonb)`); } catch (x) { e = x; }
ok(e && /body weight/i.test(e.message), "house lift needs a body weight");
e = null; try { await q(`select public.admin_save_house_lift('{"machine_id":"lat-pulldown-01","name":"Meera","weight":45,"reps":10,"body_kg":50}'::jsonb)`); } catch (x) { e = x; }
ok(e && /Women/.test(e.message), "and a board");
await q(`select public.admin_save_house_lift('{"machine_id":"lat-pulldown-01","name":"Meera","weight":45,"reps":10,"body_kg":50,"division":"women"}'::jsonb)`);
await db.exec(`insert into public.house_lifts (machine_id, mode, name, weight, reps, lifted_on) values ('lat-pulldown-01', '', 'Old', 90, 5, current_date)`);
await db.exec(`select set_config('app.uid','',false)`);
rows = (await asRole("anon", null, `select * from public.strength_boards('all', 5, 0)`)).filter((r) => r.machine_id === "lat-pulldown-01");
ok(rows.find((r) => r.name === "Meera" && r.division === "women" && Number(r.ratio) === 0.9 && r.rank == 1), "house lift with body weight ranks by ×BW");
ok(!rows.some((r) => r.name === "Old"), "older house lifts without a body weight stay off ×BW boards");
const hl = (await asRole("authenticated", S, `select public.admin_house_lifts() h`))[0].h;
ok(hl.find((h) => h.name === "Meera").ratio == 0.9 && hl.find((h) => h.name === "Old").body_kg === null, "staff list shows ×BW and the ones missing a weight");

// --- the weekly prize: strength points per race
await L(D, "leg-press-08", 120, 8);   // 2.00 -> 200
await L(B, "leg-press-08", 140, 10);  // 1.75 -> 175 ; B: 80 + 175 = 255 ; D: 83 + 200 = 283
await L(A, "leg-press-08", 90, 10);   // 1.50 -> 150 ; A: 75 (45/60) ... best lat this week
await L(C, "leg-press-08", 70, 12);   // 1.40 -> 140 ; C: 80 + 140 = 220
await db.exec(`update public.set_logs set created_at = now() - interval '1 minute' where uid in ('${B}', '${X}') and machine_id = 'lat-pulldown-01'`);
const season = Number((await one(`select public._ensure_current_season() id`)).id);
let pts = await q(`select uid, division, score from public._strength_points(${season}) order by score desc`);
const P = Object.fromEntries(pts.map((r) => [r.uid, r]));
ok(P[D].score === 283 && P[B].score === 255, "points = best ×BW per machine × 100, added up: " + JSON.stringify(pts.map((r) => r.score)));
ok(P[A].score === 81 + 150 || P[A].score === 75 + 150, "a member's best on each machine this week");
ok(P[E].division === "open", "prefer-not-to-say has points but no race");
rows = await asRole("anon", null, `select * from public.season_division_board('men')`);
ok(rows.map((r) => r.name).join(",") === "Dev,Bo,Demo", "men's race: " + rows.map((r) => r.name + " " + r.score).join(","));
rows = await asRole("anon", null, `select * from public.season_division_board('women')`);
ok(rows[0].name === "Asha" || rows[0].name === "Cara", "women's race");
rows = await asRole("anon", null, `select * from public.season_division_board('all')`);
ok(rows.length === 6, "All: everyone together");
let ov = (await asRole("anon", null, `select public.rewards_overview() o`))[0].o;
ok(ov.scoring === "strength" && ov.season.leaders.men.name === "Dev" && ov.season.leaders.women, "overview: a leader per race");
ok(ov.season.players_by.men === 3 && ov.season.players_by.women === 2, "players per race");
let my = (await asRole("authenticated", B, `select public.my_rewards() m`))[0].m;
ok(my.season.division === "men" && my.season.rank === 2 && my.season.score === 255 && my.season.ahead.name === "Dev" && my.season.players === 3, "my place in my race + who's ahead");
ok(my.body.division === "men" && Number(my.body.body_kg) === 80, "my_rewards includes my body settings");
my = (await asRole("authenticated", E, `select public.my_rewards() m`))[0].m;
ok(my.season.rank === null && my.season.division === null && my.season.score === 100, "prefer not to say: points, no race place");

// --- awarding a finished week: Men's and Women's winners, demo left out
await db.exec(`
  insert into public.seasons (period, starts_at, ends_at, title) values ('week', now() - interval '14 days', now() - interval '7 days', 'Old week');
  insert into public.season_prizes (season_id, rank_from, rank_to, title, sort) select id, 1, 1, 'Hamper', 1 from public.seasons where title = 'Old week';
  insert into public.season_prizes (season_id, rank_from, rank_to, title, sort) select id, 2, 3, 'Coupon', 2 from public.seasons where title = 'Old week';`);
const old = Number((await one(`select id from public.seasons where title = 'Old week'`)).id);
await L(X, "chest-press-02", 75, 10);  // demo: 1.00 -> would win the men's race
await L(D, "chest-press-02", 45, 10);  // 0.75
await L(B, "chest-press-02", 50, 10);  // 0.63
await L(C, "chest-press-02", 30, 10);  // 0.60
await db.exec(`update public.set_logs set created_at = now() - interval '10 days' where machine_id = 'chest-press-02'`);
const adm = (await asRole("authenticated", S, `select public.admin_rr_data() d`))[0].d;
const ta = adm.to_award.find((t) => t.id === old);
ok(ta && ta.boards.men.map((r) => r.name.split(" ")[0]).join(",") === "Dev,Bo", "award preview: men's race without demo accounts");
ok(ta.boards.men[0].body_kg == 60 && ta.boards.men[0].prize === "Hamper" && ta.boards.men[0].uid === D, "preview shows body weight for the desk check");
ok(ta.boards.women[0].name.startsWith("Cara"), "award preview: women's race");
ok(adm.live_boards.men.some((r) => r.demo), "live board marks demo accounts");
const won = (await asRole("authenticated", S, `select public.admin_award_season(${old}) w`))[0].w;
ok(won.length === 3 && won.filter((w) => w.division === "men").length === 2 && won.filter((w) => w.division === "women").length === 1, "prizes per race: " + JSON.stringify(won.map((w) => w.division + w.rank)));
ok(!won.some((w) => w.uid === X), "demo accounts never win");
ok((await q(`select * from public.season_winners where season_id = ${old} and rank = 1`)).length === 2, "a #1 in each race");
ok((await one(`select count(*)::int c from public.redemptions where season_id = ${old} and source = 'prize'`)).c === 3, "a prize code for each winner");
ov = (await asRole("anon", null, `select public.rewards_overview() o`))[0].o;
ok(ov.last_winners.scoring === "strength" && ov.last_winners.winners.every((w) => w.division === "men" || w.division === "women"), "last winners carry the race");
my = (await asRole("authenticated", D, `select public.my_rewards() m`))[0].m;
ok(my.redemptions.some((r) => r.source === "prize" && r.title === "Hamper"), "the men's winner has his prize");

// --- challenges by ×BW
await db.exec(`insert into public.challenges (title, metric, machine_id, starts_at, ends_at, winners, active)
  values ('Leg day', 'best_lift', 'leg-press-08', now() - interval '1 day', now() + interval '1 day', 1, true),
         ('Volume', 'volume', 'leg-press-08', now() - interval '1 day', now() + interval '1 day', 1, true),
         ('Sets', 'sets', null, now() - interval '1 day', now() + interval '1 day', 1, true)`);
const ch = Object.fromEntries((await q(`select id, title from public.challenges`)).map((r) => [r.title, Number(r.id)]));
rows = await asRole("anon", null, `select * from public.challenge_division_board(${ch["Leg day"]}, 'men')`);
ok(rows.map((r) => r.name).join(",") === "Dev,Bo" && Number(rows[0].value) === 2, "best lift: men's board by ×BW");
ok(!("weight" in rows[0]), "challenge boards: no kg");
rows = await asRole("anon", null, `select * from public.challenge_division_board(${ch["Leg day"]}, 'women')`);
ok(rows[0].name === "Asha" && Number(rows[0].value) === 1.5, "best lift: women's board");
rows = await asRole("anon", null, `select * from public.challenge_division_board(${ch["Volume"]}, 'men')`);
ok(Number(rows[0].value) === 17.5 && rows[0].name === "Bo", "volume: kg moved ÷ body weight (1400 ÷ 80)");
rows = await asRole("anon", null, `select * from public.challenge_division_board(${ch["Sets"]}, 'all')`);
ok(rows.length >= 5, "sets: everyone, any board");
ov = (await asRole("anon", null, `select public.rewards_overview() o`))[0].o;
const c1 = ov.challenges.find((c) => c.id === ch["Leg day"]);
ok(c1.leaders.men.name === "Dev" && c1.leaders.women.name === "Asha", "overview: challenge leader per race");
my = (await asRole("authenticated", C, `select public.my_rewards() m`))[0].m;
ok(my.challenges.find((c) => c.id === ch["Leg day"]).rank === 2 && my.challenges.find((c) => c.id === ch["Leg day"]).division === "women", "my challenge place in my race");
await db.exec(`update public.challenges set starts_at = now() - interval '3 days', ends_at = now() - interval '1 hour' where id = ${ch["Leg day"]}`);
await db.exec(`update public.set_logs set created_at = now() - interval '2 hours' where machine_id = 'leg-press-08'`);
await L(X, "leg-press-08", 200, 5); await db.exec(`update public.set_logs set created_at = now() - interval '2 hours' where uid = '${X}' and machine_id = 'leg-press-08'`);
const cw = (await asRole("authenticated", S, `select public.admin_award_challenge(${ch["Leg day"]}) w`))[0].w;
ok(cw.length === 2 && cw.some((w) => w.division === "men" && w.uid === D) && cw.some((w) => w.division === "women" && w.uid === A), "challenge winners per race, demo left out: " + JSON.stringify(cw));

// --- staff weigh-in at the desk
e = await errAs("authenticated", A, `select public.admin_set_member_body('${B}', 70)`);
ok(e, "members can't weigh others");
await L(B, "shoulder-press-05", 40, 8);
b = (await asRole("authenticated", S, `select public.admin_set_member_body('${B}', 100) b`))[0].b;
ok(Number(b.body_kg) === 100 && b.checked_at, "weigh-in saved and marked checked");
ok((await one(`select body_kg from public.set_logs where uid = '${B}' and machine_id = 'shoulder-press-05'`)).body_kg == 100, "weigh-in corrects this week's sets");
ok((await one(`select body_kg from public.set_logs where uid = '${B}' and machine_id = 'chest-press-02'`)).body_kg == 80, "awarded weeks stay as they were");
b = (await asRole("authenticated", S, `select public.admin_member_body('${B}') b`))[0].b;
ok(b.checked_by === "Staff S" || b.checked_by?.startsWith("Staff"), "who checked it");
ok((await one(`select count(*)::int c from public.staff_actions where action = 'body_check'`)).c === 1, "logged (without the number)");
b = await body(B, null, 95);
ok(b.checked_at === null || b.checked_at === undefined, "a member's own change clears the desk check");

// --- re-run safe, delete cascades
await db.exec(fs.readFileSync(R + "0015_strength_boards.sql", "utf8"));
ok((await one(`select count(*)::int c from public.member_body`)).c >= 6 && (await one(`select count(*)::int c from public.season_winners where season_id = ${old}`)).c === 3, "re-running keeps everything");
await asRole("authenticated", C, `select public.delete_my_account()`).catch(() => null);
await db.exec(`delete from auth.users where id = '${C}'`);
ok((await one(`select count(*)::int c from public.member_body where uid = '${C}'`)).c === 0, "deleting an account removes body data");

console.log(`pass ${pass} fail ${fail}`);
process.exit(fail ? 1 : 0);
