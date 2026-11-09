// In-memory Postgres (PGlite) test for supabase/migrations. See tests/README.md.
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
process.on("unhandledRejection", (e) => { console.log("ERROR:", e.message); process.exit(1); });
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
grant usage on schema storage, auth to authenticated; grant select on storage.objects to authenticated; grant execute on function auth.uid() to authenticated;
create function storage.foldername(n text) returns text[] language sql as $$ select string_to_array(n,'/') $$;
`);
const A="11111111-1111-1111-1111-111111111111", B="22222222-2222-2222-2222-222222222222", S="33333333-3333-3333-3333-333333333333";
for (const f of fs.readdirSync(R).sort()) await db.exec(fs.readFileSync(R+f,"utf8"));
await db.exec(fs.readFileSync(R+"0009_account_basics.sql","utf8")); // idempotent
await db.exec(`insert into auth.users(id,email,raw_user_meta_data) values ('${A}','a@x.com','{"full_name":"Asha"}'),('${B}','b@x.com','{"full_name":"Bo"}'),('${S}','s@x.com','{"full_name":"Staff"}')`);
await db.exec(`update public.profiles set is_staff=true where id='${S}'`);
let pass=0, fail=0; const ok=(c,m)=>{ if(c)pass++; else {fail++; console.log("FAIL:",m);} };
const q = async (sql)=> (await db.query(sql)).rows;
const asUser = async (u, sql) => { await db.exec(`select set_config('app.uid','${u}',false); set role authenticated;`); try { return (await db.query(sql)).rows; } finally { await db.exec(`reset role;`); } };
// A: one private photo, one shared, one private-but-reported
await db.exec(`select set_config('app.uid','${A}',false)`);
for (const [f,sh] of [["priv",false],["pub",true],["rep",false]]) {
  await db.exec(`insert into storage.objects(bucket_id,name) values ('pump-photos','${A}/${f}.jpg')`);
}
await q(`select public.add_pump_photo('pre','${A}/priv.jpg', false, null)`);
await q(`select public.add_pump_photo('post','${A}/pub.jpg', true, null)`);
await q(`select public.add_pump_photo('pre','${A}/rep.jpg', true, (current_date - 1))`);
// B reports rep while shared, then A makes it private
const repId=(await q(`select id from public.pump_photos where path='${A}/rep.jpg'`))[0].id;
await db.exec(`select set_config('app.uid','${B}',false)`); await q(`select public.report_photos(array[${repId}]::bigint[], 'spam')`);
await db.exec(`select set_config('app.uid','${A}',false)`); await q(`select public.set_pump_photo_shared(${repId}, false)`);
const seen = async (u) => (await asUser(u, `select name from storage.objects where bucket_id='pump-photos' order by name`)).map(r=>r.name.split('/')[1]);
const rows = async (u) => (await asUser(u, `select path from public.pump_photos order by path`)).map(r=>r.path.split('/')[1]);
ok(JSON.stringify(await seen(A))==='["priv.jpg","pub.jpg","rep.jpg"]', "owner sees all own files "+await seen(A));
ok(JSON.stringify(await seen(B))==='["pub.jpg"]', "other member sees only shared "+await seen(B));
ok(JSON.stringify(await seen(S))==='["pub.jpg","rep.jpg"]', "staff sees shared + reported, NOT private "+await seen(S));
ok(JSON.stringify(await rows(S))==='["pub.jpg","rep.jpg"]', "staff rows: shared + reported "+await rows(S));
// admin report function still works for staff
await db.exec(`select set_config('app.uid','${S}',false)`);
ok((await q(`select count(*)::int c from public.admin_pump_reports()`))[0].c===1, "admin report list still shows reported photo");
// constraint: direct update with huge name rejected, normal update fine
let t=false; try { await asUser(A, `update public.profiles set display_name='${"x".repeat(81)}' where id='${A}'`);} catch(e){t=true}
ok(t,"81-char name rejected on direct update");
await asUser(A, `update public.profiles set display_name='Asha R' where id='${A}'`);
ok((await q(`select display_name from public.profiles where id='${A}'`))[0].display_name==="Asha R","normal direct update fine");
// sign-up still works with a long-ish google name
await db.exec(`insert into auth.users(id,email,raw_user_meta_data) values ('44444444-4444-4444-4444-444444444444','d@x.com','{"full_name":"${"Long Name ".repeat(6).trim()}"}')`);
ok((await q(`select count(*)::int c from public.profiles where id='44444444-4444-4444-4444-444444444444'`))[0].c===1,"new sign-up with 59-char name ok");
console.log("pass",pass,"fail",fail);
