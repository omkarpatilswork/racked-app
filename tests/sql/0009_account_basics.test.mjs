// In-memory Postgres (PGlite) test for supabase/migrations. See tests/README.md.
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
const R=new URL("../../supabase/migrations/", import.meta.url).pathname;
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
create function storage.foldername(n text) returns text[] language sql as $$ select string_to_array(n,'/') $$;
`);
const A="11111111-1111-1111-1111-111111111111", B="22222222-2222-2222-2222-222222222222", C="33333333-3333-3333-3333-333333333333";
const files=fs.readdirSync(R).sort();
for (const f of files) {
  if (f.startsWith("0009")) {
    // existing members before 0009
    await db.exec(`insert into auth.users(id,email,raw_user_meta_data) values ('${A}','a@x.com','{"full_name":"Asha Rao"}'),('${B}','b@x.com','{"full_name":"Bo Lee"}')`);
  }
  await db.exec(fs.readFileSync(R+f,"utf8")); console.log("ok", f);
}
const as = async (u)=>db.exec(`select set_config('app.uid','${u||""}',false)`);
const q = async (sql)=> (await db.query(sql)).rows;
let pass=0, fail=0; const ok=(c,m)=>{ if(c)pass++; else {fail++; console.log("FAIL:",m);} };
let r = await q(`select id, onboarded_at from public.profiles order by id`);
ok(r.length===2 && r.every(x=>x.onboarded_at), "existing members backfilled as onboarded");
// new member after migration -> not onboarded
await db.exec(`insert into auth.users(id,email,raw_user_meta_data) values ('${C}','c@x.com','{"full_name":"Cara New"}')`);
r = await q(`select onboarded_at from public.profiles where id='${C}'`);
ok(r[0].onboarded_at===null, "new member not onboarded");
// rerun 0009 is a no-op for C
await db.exec(fs.readFileSync(R+"0009_account_basics.sql","utf8"));
r = await q(`select onboarded_at from public.profiles where id='${C}'`);
ok(r[0].onboarded_at===null, "re-run doesn't mark new member onboarded");
// update_my_profile
await as(C);
r = await q(`select public.update_my_profile('  Cara    Lifts  ', true) as p`);
ok(r[0].p.display_name==="Cara Lifts" && r[0].p.onboarded_at, "name cleaned + onboarded");
r = await q(`select public.update_my_profile(null, false) as p`);
ok(r[0].p.display_name==="Cara Lifts" && r[0].p.onboarded_at, "null name keeps name; onboarded stays");
for (const bad of ["a","x".repeat(41),"me@mail.com","<b>hi</b>","   "]) {
  let t=false; try { await q(`select public.update_my_profile('${bad}', false)`);} catch(e){t=true}
  ok(t,"reject name "+JSON.stringify(bad));
}
r = await q(`select public.update_my_profile('Ça Ñoño 💪', false) as p`);
ok(r[0].p.display_name==="Ça Ñoño 💪", "unicode + emoji name ok");
// cannot touch is_staff via function; other user's row unchanged
r = await q(`select display_name from public.profiles where id='${A}'`);
ok(r[0].display_name==="Asha Rao","other profile untouched");
await as(null); let t=false; try{ await q(`select public.update_my_profile('Nobody', true)`);}catch(e){t=true} ok(t,"signed-out blocked");
// delete account with data everywhere
await as(A);
await q(`select public.log_set('lat-pulldown-01', null, 40, 10)`);
await db.exec(`insert into storage.objects(bucket_id,name) values ('pump-photos','${A}/p1.jpg')`);
await q(`select public.add_pump_photo('pre','${A}/p1.jpg', true, null)`);
await as(B);
await q(`select public.log_set('lat-pulldown-01', null, 50, 8)`);
const bpost = (await q(`select post_id from public.feed_posts(10,null) where is_mine=false`))[0].post_id;
await q(`select public.toggle_kudos(${bpost})`);
const ph = (await q(`select item_id from public.feed_photos(10,null)`))[0].item_id;
await q(`select public.toggle_photo_kudos(${ph})`);
await as(A);
await q(`select public.toggle_kudos((select post_id from public.feed_posts(10,null) where is_mine=false limit 1))`);
await db.exec(`insert into public.feedback(uid, display_name, machine_id, rating) values ('${A}','Asha','lat-pulldown-01',5)`);
await q(`select public.record_tap('lat-pulldown-01','nfc')`);
await q(`select public.delete_my_account()`);
const cnt = async (t, col="uid") => (await q(`select count(*)::int c from public.${t} where ${col}='${A}'`))[0].c;
ok((await q(`select count(*)::int c from auth.users where id='${A}'`))[0].c===0, "auth user gone");
for (const t of ["profiles:id","machine_stats","set_logs","pump_photos","post_kudos","photo_kudos","attendance"]) {
  const [tb,col]=t.split(":"); ok(await cnt(tb, col||"uid")===0, tb+" rows gone");
}
ok((await q(`select count(*)::int c from public.feedback where uid is null`))[0].c===1, "feedback kept, unlinked");
ok((await q(`select count(*)::int c from public.tap_events where uid is null`))[0].c>=1, "taps kept, unlinked");
// B still fine, feed no longer shows A
await as(B);
const fp = await q(`select display_name from public.feed_posts(10,null)`);
ok(fp.every(x=>x.display_name!=="Asha Rao"), "deleted member not in feed");
ok((await q(`select count(*)::int c from public.leaderboard_overall('all') where display_name='Asha Rao'`))[0].c===0, "not on leaderboard");
await as(null); t=false; try{ await q(`select public.delete_my_account()`);}catch(e){t=true} ok(t,"signed-out delete blocked");
// anon can't execute
const g = await q(`select has_function_privilege('anon','public.delete_my_account()','execute') a, has_function_privilege('authenticated','public.delete_my_account()','execute') b`);
ok(g[0].a===false && g[0].b===true, "grants: anon no, authenticated yes");
console.log("pass",pass,"fail",fail);
