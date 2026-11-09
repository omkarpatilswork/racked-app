// In-memory Postgres (PGlite) test for supabase/migrations. See tests/README.md.
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
grant usage on schema storage, auth to authenticated; grant select on storage.objects to authenticated; grant execute on function auth.uid() to authenticated;
create function storage.foldername(n text) returns text[] language sql as $$ select string_to_array(n,'/') $$;
`);
for (const f of fs.readdirSync(R).sort()) await db.exec(fs.readFileSync(R + f, "utf8"));
const A="11111111-1111-1111-1111-111111111111", B="22222222-2222-2222-2222-222222222222", S="33333333-3333-3333-3333-333333333333";
await db.exec(`insert into auth.users(id,email,raw_user_meta_data) values ('${A}','a@x.com','{"full_name":"Asha Rao"}'),('${B}','b@x.com','{"full_name":"Bo 100% Lee"}'),('${S}','s@x.com','{"full_name":"Staff Sam"}')`);
await db.exec(`update public.profiles set is_staff=true where id='${S}'`);
let pass=0, fail=0; const ok=(c,m)=>{ if(c)pass++; else {fail++; console.log("FAIL:",m);} };
const as = async (u)=>db.exec(`select set_config('app.uid','${u||""}',false)`);
const q = async (sql)=> (await db.query(sql)).rows;
const err = async (sql) => { try { await db.query(sql); return null; } catch (e) { return e; } };
const shift = async () => db.exec(`update public.set_logs set created_at = created_at - interval '9 seconds'`);
const L = async (m, mode, w, r) => { const x = await q(`select public.log_set('${m}', ${mode ? `'${mode}'` : "null"}, ${w}, ${r}) as r`); await shift(); return x; };
const asRole = async (u, sql) => { await db.exec(`select set_config('app.uid','${u||""}',false); set role authenticated;`); try { return (await db.query(sql)).rows; } finally { await db.exec("reset role"); } };

ok((await q(`select count(*)::int c from public.machine_limits`))[0].c === 10, "10 machine limits seeded");

// --- logging + limits
await as(A);
await L('lat-pulldown-01', null, 50, 10);
await L('lat-pulldown-01', null, 60, 8);
let e = await err(`select public.log_set('lat-pulldown-01', null, 300, 10)`);
ok(e && e.code === "RK001" && /150 kg max/.test(e.message), "300kg on lat pulldown refused with friendly message: " + (e && e.message));
e = await err(`select public.log_set('lat-pulldown-01', null, 50, 120)`);
ok(e && e.code === "RK002", "120 reps refused");
let st = (await q(`select pb_weight, sets from public.machine_stats where uid='${A}' and machine_id='lat-pulldown-01'`))[0];
ok(Number(st.pb_weight) === 60 && st.sets === 2, "refused sets changed nothing (pb 60, 2 sets)");
ok((await q(`select count(*)::int c from public.set_logs where uid='${A}'`))[0].c === 2, "refused sets not stored");

// --- flagging
await L('lat-pulldown-01', null, 100, 5);
let r = (await q(`select review_status, review_reason from public.set_logs where uid='${A}' and weight=100`))[0];
ok(r.review_status === "flagged" && /50 kg to 100 kg/.test(r.review_reason), "jump flagged vs first set today (50->100): " + r.review_reason);
await L('lat-pulldown-01', null, 65, 8);
ok((await q(`select review_status from public.set_logs where uid='${A}' and weight=65`))[0].review_status === null, "normal progression not flagged");
await L('lat-pulldown-01', null, 95, 5);
ok((await q(`select review_status from public.set_logs where uid='${A}' and weight=95`))[0].review_status === "flagged", "flagged set doesn't raise the baseline (95 still flagged)");
await L('chest-press-02', null, 130, 5);
ok((await q(`select review_status from public.set_logs where uid='${A}' and machine_id='chest-press-02'`))[0].review_status === "flagged", "first set near max flagged");
await as(B);
await L('lat-pulldown-01', null, 40, 10);
await L('lat-pulldown-01', null, 45, 10);

// --- new refusals
await as(A);
e = await err(`select public.log_set('made-up-machine', null, 2000, 200)`);
ok(e && e.code === "RK003", "unknown machine refused");
e = await err(`select public.log_set('squat-07', 'heavy', 100, 5)`);
ok(e && e.code === "RK003", "made-up side refused");
await L('pec-fly-rear-delt-04', 'pec-fly', 40, 10);
ok((await q(`select count(*)::int c from public.set_logs where machine_id='pec-fly-rear-delt-04' and mode='pec-fly'`))[0].c === 1, "real side of dual machine accepted");
e = await err(`select public.log_set('lat-pulldown-01', null, 60.01, 8)`);
ok(e && e.code === "RK004", "0.01 kg steps refused");
await L('lat-pulldown-01', null, 61.25, 8);
ok(true, "1.25 kg plate steps accepted");
await q(`select public.log_set('lat-pulldown-01', null, 60, 8)`);
e = await err(`select public.log_set('lat-pulldown-01', null, 60, 8)`);
ok(e && e.code === "RK005", "second set within 8 seconds refused");
await shift();
// climbing in small steps on day one is still caught
await L('rowing-03', null, 50, 10);
await L('rowing-03', null, 69.5, 10);
await L('rowing-03', null, 97, 10);
const climb = await q(`select weight, review_status from public.set_logs where uid='${A}' and machine_id='rowing-03' order by created_at`);
ok(climb[1].review_status === null && climb[2].review_status === "flagged", "step-climbing 50 -> 69.5 -> 97 flags the 97: " + JSON.stringify(climb));
// daily cap per machine
await db.exec(`alter table public.set_logs disable trigger guard_set_log`);
await db.exec(`insert into public.set_logs (uid, machine_id, mode, weight, reps, is_pb, xp_gain, created_at) select '${A}', 'leg-extension-09', null, 30, 10, false, 10, now() - (g || ' seconds')::interval * 20 from generate_series(1, 30) g`);
await db.exec(`alter table public.set_logs enable trigger guard_set_log`);
e = await err(`select public.log_set('leg-extension-09', null, 30, 10)`);
ok(e && e.code === "RK005" && /30 sets/.test(e.message), "31st set on one machine today refused");
await db.exec(`delete from public.set_logs where machine_id='leg-extension-09'`);

// --- non-staff blocked
await as(A);
for (const fn of [`admin_review_queue()`, `admin_approve_set(1)`, `admin_remove_set(1,'x')`, `admin_reset_member_machine('${B}','lat-pulldown-01')`, `admin_reset_machine_for_all('lat-pulldown-01')`, `admin_set_machine_limit('lat-pulldown-01', 999)`, `admin_member_search('')`, `admin_activity()`]) {
  const x = await err(`select * from public.${fn}`);
  ok(x && /staff only/.test(x.message), "non-staff blocked: " + fn);
}
const priv = await q(`select has_function_privilege('anon','public.admin_remove_set(bigint,text)','execute') a, has_function_privilege('anon','public.admin_review_queue(int)','execute') b, has_function_privilege('authenticated','public._log_staff_action(text,uuid,text,text)','execute') c`);
ok(!priv[0].a && !priv[0].b && !priv[0].c, "anon can't run staff tools; nobody can call the log helper directly");

// --- staff: review queue
await as(S);
let queue = await q(`select * from public.admin_review_queue()`);
ok(queue.length === 4, "queue has 4 flagged sets: " + queue.length);
const q100 = queue.find((x) => Number(x.weight) === 100);
ok(q100 && Number(q100.prev_best) === 65 && q100.display_name === "Asha Rao", "queue shows prev best + name");
// approve the chest press one
const chestId = queue.find((x) => x.machine_id === "chest-press-02").id;
await q(`select public.admin_approve_set(${chestId})`);
queue = await q(`select * from public.admin_review_queue()`);
ok(queue.length === 3 && !queue.some((x) => x.id === chestId), "approved set leaves the queue");
// remove the 100 and 95
await q(`select public.admin_remove_set(${q100.id}, '  Weight not possible   on this machine ')`);
const q95 = queue.find((x) => Number(x.weight) === 95);
await q(`select public.admin_remove_set(${q95.id}, null)`);
st = (await q(`select pb_weight, pb_reps, sets from public.machine_stats where uid='${A}' and machine_id='lat-pulldown-01'`))[0];
ok(Number(st.pb_weight) === 65 && st.sets === 5, "PB recalculated to 65 after removal: " + JSON.stringify(st));
ok((await q(`select count(*)::int c from public.admin_review_queue()`))[0].c === 1, "only the rowing climb left in the queue");
// period leaderboard no longer shows 100
const lb = await q(`select * from public.leaderboard_machine('lat-pulldown-01','','today')`);
ok(lb.every((x) => Number(x.pb_weight) < 100), "today's leaderboard no longer has the removed 100kg");
// notices
const notes = await asRole(A, `select kind, weight, reason from public.member_notices order by id`);
ok(notes.length === 2 && notes[0].kind === "set_removed" && Number(notes[0].weight) === 100 && notes[0].reason === "Weight not possible on this machine", "member sees removal note with cleaned reason: " + JSON.stringify(notes));
ok((await asRole(B, `select count(*)::int c from public.member_notices`))[0].c === 0, "other member can't see A's notes");
await asRole(A, `select public.mark_notices_seen(array(select id from public.member_notices)::bigint[])`);
ok((await q(`select count(*)::int c from public.member_notices where uid='${A}' and seen_at is null`))[0].c === 0, "notes marked seen");
ok((await asRole(B, `select public.mark_notices_seen(array(select id from public.member_notices)::bigint[])`)) && (await q(`select count(*)::int c from public.member_notices where seen_at is not null`))[0].c === 2, "can't mark others' notes");

// kudos on a removed set's post are cleaned up
await as(B);
const kpost = (await q(`select post_id from public.feed_posts(50,null) where display_name='Asha Rao' and machine_id='chest-press-02'`))[0].post_id;
await q(`select public.toggle_kudos(${kpost})`);
await as(S);
await q(`select public.admin_remove_set(${kpost}, 'Test entry')`);
ok((await q(`select count(*)::int c from public.post_kudos where post_id=${kpost}`))[0].c === 0, "kudos on removed set cleaned up");
// stats-only member still gets a note when reset
await db.exec(`insert into public.machine_stats (uid, machine_id, mode, pb_weight, pb_reps, sets, sessions, volume, xp, level, last_date, sets_today) values ('${B}','squat-07','',500,1,1,1,500,10,1,current_date,1)`);
await q(`select public.admin_reset_member_machine('${B}','squat-07','Repeated fake entries')`);
ok((await q(`select count(*)::int c from public.member_notices where uid='${B}' and machine_id='squat-07'`))[0].c === 1, "reset with stats-only still notifies");
// lowering a limit flags older sets above it
await q(`select public.admin_set_machine_limit('rowing-03', 60, 50, 40)`);
ok((await q(`select count(*)::int c from public.set_logs where machine_id='rowing-03' and review_status='flagged' and review_reason like 'Above this machine%'`))[0].c >= 1, "lowering a limit flags older sets above it");
await q(`select public.admin_set_machine_limit('rowing-03', 150, 50, 40)`);
// backfill on migration: an old 999 kg test entry gets flagged
await db.exec(`alter table public.set_logs disable trigger guard_set_log`);
await db.exec(`insert into public.set_logs (uid, machine_id, mode, weight, reps, is_pb, xp_gain, created_at) values ('${B}','deadlift-10',null,999,50,true,60, now() - interval '30 days')`);
await db.exec(`alter table public.set_logs enable trigger guard_set_log`);
await db.exec(fs.readFileSync(R + "0010_staff_moderation.sql", "utf8"));
ok((await q(`select review_status from public.set_logs where weight=999`))[0].review_status === "flagged", "re-running 0010 flags old over-max entries");
await db.exec(`delete from public.set_logs where weight=999`);

// --- reset one member on a machine
await as(S);
const n = (await q(`select public.admin_reset_member_machine('${A}','lat-pulldown-01','Logged for a friend') as n`))[0].n;
ok(n === 5, "reset member removed 5 sets: " + n);
ok((await q(`select count(*)::int c from public.machine_stats where uid='${A}' and machine_id='lat-pulldown-01'`))[0].c === 0, "A's lat stats gone");
ok((await q(`select count(*)::int c from public.machine_stats where uid='${B}' and machine_id='lat-pulldown-01'`))[0].c === 1, "B untouched");
ok((await q(`select count(*)::int c from public.machine_stats where uid='${A}' and machine_id='rowing-03'`))[0].c === 1, "A's other machine untouched");

// --- reset machine for all
await q(`select public.record_tap('lat-pulldown-01','nfc')`);
await as(A); await L('lat-pulldown-01', null, 50, 10);
await as(S);
const m = (await q(`select public.admin_reset_machine_for_all('lat-pulldown-01','Stack replaced') as m`))[0].m;
ok(m === 2, "machine reset affected 2 members: " + m);
ok((await q(`select count(*)::int c from public.set_logs where machine_id='lat-pulldown-01'`))[0].c === 0, "machine sets gone");
ok((await q(`select count(*)::int c from public.tap_events where machine_id='lat-pulldown-01'`))[0].c >= 1, "check-ins kept");
ok((await q(`select count(*)::int c from public.member_notices where kind='machine_reset'`))[0].c === 2, "both members notified");

// --- limits editing
await q(`select public.admin_set_machine_limit('lat-pulldown-01', 50, 30, 25)`);
await as(A);
e = await err(`select public.log_set('lat-pulldown-01', null, 55, 10)`);
ok(e && e.code === "RK001" && /50 kg max/.test(e.message), "new lower limit enforced");
await as(S);
for (const bad of [`('lat-pulldown-01', 0)`, `('lat-pulldown-01', 3000)`, `('lat-pulldown-01', 100, 0)`, `('lat-pulldown-01', 100, 50, 1)`]) {
  const x = await err(`select public.admin_set_machine_limit${bad}`);
  ok(x && x.code === "22023", "invalid limit rejected " + bad);
}
ok((await asRole(A, `select count(*)::int c from public.machine_limits`))[0].c === 10, "members can read limits");
const w = await err(`set role authenticated; update public.machine_limits set max_weight = 9999 where machine_id='squat-07'`); await db.exec("reset role");
ok(Number((await q(`select max_weight from public.machine_limits where machine_id='squat-07'`))[0].max_weight) === 250, "members can't change limits directly");

// --- search + activity
await as(S);
ok((await q(`select * from public.admin_member_search('asha')`)).length === 1, "search by name");
ok((await q(`select * from public.admin_member_search('%')`)).map((x) => x.display_name).join() === "Bo 100% Lee", "no wildcard injection");
const act = await q(`select * from public.admin_activity()`);
ok(act.length >= 6 && act[0].staff_name === "Staff Sam" && act.some((x) => x.action === "remove_set" && x.target_name === "Asha Rao"), "activity log with names: " + act.map((x) => x.action).join(","));
ok((await asRole(A, `select count(*)::int c from public.staff_actions`))[0].c === 0, "members can't read the activity log");

// --- re-run keeps edited limits; reset all clears notices
for (const f of ["0010_staff_moderation.sql"]) await db.exec(fs.readFileSync(R + f, "utf8"));
ok(Number((await q(`select max_weight from public.machine_limits where machine_id='lat-pulldown-01'`))[0].max_weight) === 50, "re-running 0010 keeps staff-edited limit");
await as(S); await q(`select public.admin_reset_all_data()`);
ok((await q(`select count(*)::int c from public.member_notices`))[0].c === 0, "reset all clears notices");
ok((await q(`select count(*)::int c from public.staff_actions where action='reset_all'`))[0].c === 1, "reset all is logged");
// account deletion still cascades with new tables
await as(A); await q(`select public.delete_my_account()`);
ok((await q(`select count(*)::int c from public.profiles where id='${A}'`))[0].c === 0, "account delete still works with new tables");
console.log("pass", pass, "fail", fail);
