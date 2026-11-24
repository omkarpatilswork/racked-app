// In-memory Postgres (PGlite) test for 0016_ranks_board.sql. See tests/README.md.
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
const files = fs.readdirSync(R).filter((f) => f.endsWith(".sql") && f < "0017").sort();
for (const f of files) await db.exec(fs.readFileSync(R + f, "utf8"));

const A = "11111111-1111-1111-1111-111111111111", B = "22222222-2222-2222-2222-222222222222", C = "44444444-4444-4444-4444-444444444444",
  D = "55555555-5555-5555-5555-555555555555", E = "66666666-6666-6666-6666-666666666666";
await db.exec(`insert into auth.users(id,email,raw_user_meta_data) values
  ('${A}','asha@x.com','{"full_name":"Asha Rao"}'),('${B}','bo@x.com','{"full_name":"Bo Lee"}'),
  ('${C}','cara@x.com','{"full_name":"Cara Mehta"}'),('${D}','dev@x.com','{"full_name":"Dev Kumar"}'),
  ('${E}','eli@x.com','{"full_name":"Eli Paul"}')`);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const q = async (sql) => (await db.query(sql)).rows;
const asRole = async (role, u, sql) => {
  await db.exec(`select set_config('app.uid','${u || ""}',false); set role ${role};`);
  try { return (await db.query(sql)).rows; } finally { await db.exec(`reset role; select set_config('app.uid','',false)`); }
};
const errAs = async (role, u, sql) => { try { await asRole(role, u, sql); return null; } catch (e) { return e; } };
const shift = async () => db.exec(`update public.set_logs set created_at = created_at - interval '9 seconds'`);
const L = async (u, m, w, r) => { await asRole("authenticated", u, `select public.log_set('${m}', null, ${w}, ${r})`); await shift(); };
const body = (u, d, kg) => asRole("authenticated", u, `select public.set_my_body('${d}', ${kg})`);
const board = (u, metric, period, div = "all", machine = null, mode = "", limit = 50) =>
  asRole("authenticated", u, `select * from public.ranks_board('${metric}', '${period}', '${div}', ${machine ? `'${machine}'` : "null"}, '${mode}', ${limit})`);
const names = (rows) => rows.map((r) => r.name).join(",");

// --- people: Asha (women, 60 kg), Bo (men, 80 kg), Cara (women, 50 kg), Dev (men, 100 kg), Eli (no body weight)
await body(A, "women", 60);
await body(B, "men", 80);
await body(C, "women", 50);
await body(D, "men", 100);

// --- an old set (40 days ago) only counts for All time
await L(D, "leg-press-08", 200, 5);
await db.exec(`update public.set_logs set created_at = now() - interval '40 days' where uid = '${D}'`);

// --- this week
await L(A, "lat-pulldown-01", 45, 10); // 75
await L(A, "lat-pulldown-01", 48, 6);  // 80 (best score + heaviest on lat)
await L(A, "leg-press-08", 90, 10);    // 150
await L(B, "lat-pulldown-01", 60, 10); // 75
await L(B, "leg-press-08", 140, 8);    // 175
await L(C, "lat-pulldown-01", 40, 12); // 80
await L(D, "lat-pulldown-01", 70, 8);  // 70
await L(E, "lat-pulldown-01", 50, 10); // no body weight: no score
await L(E, "leg-press-08", 160, 10);

// --- access
let e = await errAs("anon", null, `select * from public.ranks_board('score','week','all',null,'',10)`);
ok(e, "signed out: refused (members only)");
const cols = (await q(`select string_agg(column_name::text, ',') c from (select unnest(proargnames) column_name from pg_proc where proname = 'ranks_board') x`))[0].c;
ok(!/uid|email|weight_kg|body/.test(cols.replace("p_", "")), "no ids or body weight in the columns: " + cols);

// --- score, this week, all machines = the prize race
let r = await board(A, "score", "week", "women");
ok(names(r) === "Asha,Cara" && Number(r[0].value) === 230 && Number(r[1].value) === 80, "women's race: Asha 80+150=230, Cara 80: " + JSON.stringify(r.map((x) => [x.name, x.value])));
ok(r[0].is_me === true && r[1].is_me === false, "is_me marks my row");
const race = await asRole("authenticated", A, `select * from public.season_division_board('women', null, 10)`);
ok(race.map((x) => x.name + x.score).join() === r.map((x) => x.name + Number(x.value)).join(), "same as the Rewards race");
r = await board(B, "score", "week", "men");
ok(names(r) === "Bo,Dev" && Number(r[0].value) === 250 && Number(r[1].value) === 70, "men's race: Bo 75+175, Dev 70 (old set not this week): " + JSON.stringify(r.map((x) => [x.name, x.value])));
r = await board(B, "score", "week", "all");
ok(!names(r).includes("Eli") && r.length === 4, "everyone: only people with a body weight get a score");

// --- score, all time, all machines: best on each machine, added up
r = await board(D, "score", "all", "men");
ok(names(r) === "Dev,Bo" && Number(r[0].value) === 270, "all time: Dev 70 + 200 (old leg press) = 270, ahead of Bo: " + JSON.stringify(r.map((x) => [x.name, x.value])));

// --- score, one machine
r = await board(A, "score", "week", "all", "lat-pulldown-01");
ok(names(r) === "Cara,Asha,Bo,Dev" && Number(r[0].value) === 80 && r[0].reps === 12 && r[1].reps === 6, "lat pulldown score: same 80, more reps first (Cara ×12, Asha ×6): " + JSON.stringify(r.map((x) => [x.name, x.value, x.reps])));
ok(r.every((x) => x.machine_id === "lat-pulldown-01"), "rows say which machine");

// --- kg moved
r = await board(E, "moved", "week", "all");
const moved = Object.fromEntries(r.map((x) => [x.name, Number(x.value)]));
ok(moved.Eli === 2100 && moved.Asha === 450 + 288 + 900 && moved.Bo === 600 + 1120, "kg moved = weight × reps added up: " + JSON.stringify(moved));
ok(r[0].name === "Eli" && r[0].is_me, "everyone: no body weight needed for kg moved, Eli on top");
r = await board(A, "moved", "week", "women");
ok(names(r) === "Asha,Cara", "women's kg moved");
r = await board(D, "moved", "all", "men");
ok(Number(r.find((x) => x.name === "Dev").value) === 1000 + 560, "all time kg moved includes the old set");
r = await board(B, "moved", "week", "all", "leg-press-08");
ok(names(r) === "Eli,Bo,Asha" && Number(r[0].value) === 1600, "kg moved on one machine: " + JSON.stringify(r.map((x) => [x.name, x.value])));

// --- heaviest
r = await board(B, "heaviest", "week", "all");
ok(r[0].name === "Eli" && Number(r[0].value) === 160 && r[0].machine_id === "leg-press-08" && r[0].reps === 10, "heaviest anywhere: Eli 160 kg on leg press");
r = await board(B, "heaviest", "all", "men");
ok(r[0].name === "Dev" && Number(r[0].value) === 200 && r[0].reps === 5, "all time heaviest: Dev 200 × 5");
r = await board(A, "heaviest", "week", "women", "lat-pulldown-01");
ok(names(r) === "Asha,Cara" && Number(r[0].value) === 48 && r[0].reps === 6, "women's heaviest on lat pulldown: Asha 48 × 6");

// --- house lifts: on one machine's score + heaviest boards, never in totals or kg moved
await q(`insert into public.house_lifts(machine_id, mode, name, weight, reps, lifted_on, body_kg, division)
         values ('lat-pulldown-01', '', 'Vikram', 95, 5, current_date - 1, 90, 'men'),
                ('lat-pulldown-01', '', 'Old Raj', 99, 3, current_date - 300, null, null)`);
r = await board(B, "heaviest", "all", "all", "lat-pulldown-01");
ok(r[0].name === "Old Raj" && r[0].house === true && r[1].name === "Vikram", "heaviest on a machine: house lifts included (all time)");
r = await board(B, "heaviest", "week", "men", "lat-pulldown-01");
ok(r[0].name === "Vikram" && !names(r).includes("Old Raj"), "this week, men: Vikram (no board set = only on Everyone, and too old)");
r = await board(B, "score", "week", "men", "lat-pulldown-01");
ok(r[0].name === "Vikram" && Number(r[0].value) === 106, "house lift score 95 ÷ 90 × 100 = 106");
r = await board(B, "moved", "week", "men");
ok(!names(r).includes("Vikram"), "house lifts never in kg moved");
r = await board(B, "score", "week", "men");
ok(!names(r).includes("Vikram"), "house lifts never in the race");

// --- flagged sets: out of the race, in other boards
await db.exec(`update public.set_logs set review_status = 'flagged' where uid = '${B}' and machine_id = 'leg-press-08'`);
r = await board(B, "score", "week", "men");
ok(Number(r.find((x) => x.name === "Bo").value) === 75, "flagged set leaves the race");
r = await board(B, "heaviest", "week", "men");
ok(r.find((x) => x.name === "Bo") && Number(r.find((x) => x.name === "Bo").value) === 140, "flagged set still on heaviest until staff remove it");
await db.exec(`update public.set_logs set review_status = null where uid = '${B}'`);

// --- my row even past the limit; limits; unknown input
r = await board(C, "score", "week", "all", null, "", 1);
ok(r.length === 2 && r[0].rank === 1 && r[1].is_me && r[1].name === "Cara", "limit 1 + my own row");
r = await board(A, "score", "week", "all", "no-such-machine");
ok(r.length === 0, "unknown machine: empty");
r = await board(A, "bogus", "week", "women");
ok(Number(r[0].value) === 230, "unknown metric falls back to score");
r = await board(A, "score", "whenever", "women");
ok(Number(r[0].value) === 230, "unknown period = this week");
r = await board(A, "moved", "week", "everyone");
ok(r.length === 5, "unknown division = everyone");
ok(r.every((x) => !/ /.test(x.name)), "first names only");

// --- members without a profile row don't show; deleted members drop off
await db.exec(`delete from public.profiles where id = '${E}'`);
r = await board(A, "moved", "week", "all");
ok(!names(r).includes("Eli"), "no profile, no row");

// --- re-run safe
await db.exec(fs.readFileSync(R + "0016_ranks_board.sql", "utf8"));
r = await board(A, "score", "week", "women");
ok(Number(r[0].value) === 230, "re-run 0016: same board");

console.log(`${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
