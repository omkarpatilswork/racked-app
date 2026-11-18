// In-memory Postgres (PGlite) test for 0014_social_feed.sql. See tests/README.md.
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
const files = fs.readdirSync(R).filter((f) => f.endsWith(".sql") && f < "0015").sort();
for (const f of files) await db.exec(fs.readFileSync(R + f, "utf8"));
const A = "11111111-1111-1111-1111-111111111111", B = "22222222-2222-2222-2222-222222222222", C = "44444444-4444-4444-4444-444444444444",
  D = "55555555-5555-5555-5555-555555555555", S = "33333333-3333-3333-3333-333333333333";
await db.exec(`insert into auth.users(id,email,raw_user_meta_data) values
  ('${A}','asha.rao@x.com','{"full_name":"Asha Rao"}'),('${B}','bo@x.com','{"full_name":"Bo Lee"}'),
  ('${C}','chris.secret99@gmail.com','{}'),('${D}','dev@x.com','{"full_name":"Dev K"}'),('${S}','s@x.com','{"full_name":"Staff Sam"}')`);
await db.exec(`update public.profiles set is_staff=true where id='${S}'`);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const as = async (u) => db.exec(`select set_config('app.uid','${u || ""}',false)`);
const q = async (sql) => (await db.query(sql)).rows;
const one = async (sql) => (await q(sql))[0];
const shift = async () => db.exec(`update public.set_logs set created_at = created_at - interval '9 seconds'; update public.feed_comments set created_at = created_at - interval '4 seconds'`);
const asRole = async (role, u, sql) => {
  const prev = (await db.query(`select coalesce(current_setting('app.uid', true), '') v`)).rows[0].v;
  await db.exec(`select set_config('app.uid','${u || ""}',false); set role ${role};`);
  try { return (await db.query(sql)).rows; } finally { await db.exec(`reset role; select set_config('app.uid','${prev}',false)`); }
};
const errAs = async (role, u, sql) => { try { await asRole(role, u, sql); return null; } catch (e) { return e; } };
const lit = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'`;
const str = (t) => `'${String(t).replace(/'/g, "''")}'`;
const upload = async (u, name) => { await asRole("authenticated", u, `insert into storage.objects(bucket_id, name) values ('pump-photos', '${u}/${name}')`); return `${u}/${name}`; };
const post = (u, kind, body, media = [], machine = null, mode = null, weeks = null) =>
  asRole("authenticated", u, `select public.create_wall_post('${kind}', ${body === null ? "null" : str(body)}, ${lit(media)}::jsonb, ${machine ? `'${machine}'` : "null"}, ${mode ? `'${mode}'` : "null"}, ${weeks ?? "null"}) id`).then((r) => Number(r[0].id));
const postErr = async (u, kind, body, media = [], weeks = null) => { try { await post(u, kind, body, media, null, null, weeks); return null; } catch (e) { return e; } };
const feed = async (u, filter = "all", before = null, limit = 15) =>
  (await asRole("authenticated", u, `select public.home_feed(${before ? `'${before}'` : "null"}, ${limit}, '${filter}') f`))[0].f;
const L = async (u, m, w, r) => { await asRole("authenticated", u, `select public.log_set('${m}', null, ${w}, ${r})`); await shift(); };

// --- posting rules
let e = await errAs("anon", null, `select public.home_feed()`);
ok(e, "signed-out visitors can't read the feed");
const t1 = await post(A, "text", "  First leg day back.\n\n\n\nLet's go  ");
ok(t1 > 0, "text post");
ok((await one(`select body from public.wall_posts where id = ${t1}`)).body === "First leg day back.\n\nLet's go", "text tidied (trimmed, one blank line max)");
for (const [b, why] of [["check out www.gains.com", "www link"], ["buy at gymshark.com today", "bare domain"], ["https://x.y", "http link"], ["mail me a@gmail.com", "email"]]) {
  e = await postErr(A, "text", b);
  ok(e && e.code === "RK201", "links blocked: " + why);
}
ok(await post(A, "text", "Hit 5.5 kg more than last week, e.g. 102.5 kg") > 0, "numbers with dots are fine");
e = await postErr(A, "text", "x".repeat(281));
ok(e && e.code === "RK202", "281 characters refused");
e = await postErr(A, "text", "   ");
ok(e && e.code === "RK204", "empty post refused");
const pa1 = await upload(A, "post-a1.jpg"), pa2 = await upload(A, "post-a2.jpg");
e = await postErr(A, "text", "hi", [{ path: pa1 }]);
ok(e && e.code === "RK204", "text posts don't take photos");
e = await postErr(A, "photo", "no photos", []);
ok(e && e.code === "RK205", "photo post needs a photo");
e = await postErr(A, "photo", null, [{ path: `${A}/never-uploaded.jpg` }]);
ok(e && e.code === "RK205", "photo must be uploaded first");
const pb1 = await upload(B, "post-b1.jpg");
e = await postErr(A, "photo", null, [{ path: pb1 }]);
ok(e && e.code === "RK205", "can't post someone else's file");
e = await postErr(A, "photo", null, [1, 2, 3, 4, 5].map((i) => ({ path: `${A}/p${i}.jpg` })));
ok(e && e.code === "RK205", "5 photos refused");
const p1 = await post(A, "photo", "Back day pump", [{ path: pa1 }, { path: pa2 }], "lat-pulldown-01");
ok(p1 > 0 && (await one(`select count(*)::int c from public.wall_media where post_id = ${p1}`)).c === 2, "photo post with 2 photos + machine tag");
e = await postErr(A, "photo", null, [{ path: pa1 }]);
ok(e && e.code === "RK205", "a photo can't be posted twice");
const ta = await upload(A, "t-before.jpg"), tb = await upload(A, "t-after.jpg");
e = await postErr(A, "transformation", "x", [{ path: ta, label: "before" }, { path: tb, label: "before" }]);
ok(e && e.code === "RK205", "transformation needs a before AND an after");
e = await postErr(A, "transformation", "x", [{ path: ta, label: "before" }, { path: tb, label: "after" }], 0);
ok(e && e.code === "RK205", "weeks apart must be 1+");
const tr = await post(A, "transformation", "12 weeks of showing up", [{ path: tb, label: "after" }, { path: ta, label: "before" }], null, null, 12);
ok((await one(`select weeks_apart from public.wall_posts where id = ${tr}`)).weeks_apart === 12, "transformation saved with weeks apart");
const tagged = await post(B, "text", "Pec fly finisher", [], "pec-fly-rear-delt-04", "pec-fly");
const tg = await one(`select machine_id, mode from public.wall_posts where id = ${tagged}`);
ok(tg.machine_id === "pec-fly-rear-delt-04" && tg.mode === "pec-fly", "dual machine tag keeps its side");
const bogus = await post(B, "text", "Made-up machine", [], "made-up-99");
ok((await one(`select machine_id from public.wall_posts where id = ${bogus}`)).machine_id === null, "unknown machine tag dropped");
for (let i = 0; i < 8; i++) await post(B, "text", `Post ${i}`);
e = await postErr(B, "text", "one too many");
ok(e && e.code === "RK203", "10 posts a day max");
ok(await errAs("authenticated", A, `select * from public.wall_posts`), "no direct reads of posts");
ok(await errAs("authenticated", A, `insert into public.wall_posts(uid, kind, body) values ('${A}', 'text', 'sneaky')`), "no direct writes");

// --- feed
await L(A, "lat-pulldown-01", 40, 10);
await L(B, "leg-press-08", 120, 8);
await asRole("authenticated", A, `select public.sync_my_rewards()`);
const pp = await upload(C, "pump-pre.jpg");
await asRole("authenticated", C, `select public.add_pump_photo('pre', '${pp}', true)`);
let f = await feed(B, "all", null, 30);
const types = new Set(f.items.map((i) => i.type));
ok(["wall", "set", "pump", "milestone"].every((t) => types.has(t)), "feed mixes posts, workouts, pump checks, milestones: " + [...types].join(","));
ok(f.items.every((x, i) => i === 0 || new Date(f.items[i - 1].at) >= new Date(x.at)), "newest first");
const tx = f.items.find((i) => i.type === "wall" && i.id === tr);
ok(tx && tx.kind === "transformation" && tx.weeks_apart === 12 && tx.media.map((m) => m.label).join() === "before,after", "transformation: before first, then after");
ok(tx.display_name === "Asha Rao" && tx.is_mine === false, "name shown, not mine for Bo");
const ms = f.items.find((i) => i.type === "milestone");
ok(ms && ms.kind === "badge" && ms.name === "Asha" && ms.title, "badge milestone with first name");
const fj = JSON.stringify(f);
const noPaths = JSON.stringify(f, (k, v) => (k === "path" || k === "pre_path" || k === "post_path" ? undefined : v));
ok(!noPaths.includes(A) && !noPaths.includes(B) && !fj.includes("@"), "no user ids (outside photo file paths) or emails in the feed");
f = await feed(B);
ok(f.items.length === 15 && f.has_more === true, "page of 15, more to come");
const f2 = await feed(B, "all", f.items[14].at);
ok(f2.items.length > 0 && f2.items.every((x) => new Date(x.at) < new Date(f.items[14].at)), "next page continues from the cursor");
ok((await feed(B, "posts", null, 30)).items.every((i) => i.type === "wall" && i.kind === "text"), "Posts filter: text posts only");
const photos = (await feed(B, "photos", null, 30)).items;
ok(photos.length >= 2 && photos.every((i) => (i.type === "wall" && i.kind === "photo") || i.type === "pump"), "Photos filter: photo posts + pump checks");
ok((await feed(B, "transformations")).items.every((i) => i.kind === "transformation"), "Transformations filter");
await L(A, "lat-pulldown-01", 50, 8);
const prs = (await feed(B, "prs")).items;
ok(prs.length >= 1 && prs.every((i) => i.type === "set" && i.has_pb), "PRs filter: PB workouts only");

// --- photos: who can open the files
const vis = async (u, path) => (await asRole("authenticated", u, `select count(*)::int c from storage.objects where name = '${path}'`))[0].c === 1;
const stray = await upload(A, "not-posted.jpg");
ok(await vis(B, pa1), "members can open a posted photo");
ok(!(await vis(B, stray)), "but not other files in someone's folder");
ok(await vis(A, stray), "owners see their own files");

// --- kudos
const kud = async (u, id) => (await asRole("authenticated", u, `select public.toggle_wall_kudos(${id}) r`))[0].r;
let k = await kud(B, p1);
ok(k.count === 1 && k.mine === true, "kudos given");
await kud(C, p1);
f = await feed(A);
const kp = f.items.find((i) => i.type === "wall" && i.id === p1);
ok(kp.kudos_count === 2 && kp.kudos_names.includes("Bo") && kp.kudos_names.includes("Chris"), "kudos names (first names only): " + JSON.stringify(kp.kudos_names));
k = await kud(B, p1);
ok(k.count === 1 && k.mine === false, "kudos taken back");

// --- comments
const addC = (u, type, id, body) => asRole("authenticated", u, `select public.add_comment('${type}', ${id}, ${str(body)}) c`).then((r) => r[0].c);
const cErr = async (u, type, id, body) => { try { await addC(u, type, id, body); return null; } catch (x) { return x; } };
const c1 = await addC(B, "wall", p1, "Beast mode");
ok(c1.id && c1.is_mine && c1.display_name === "Bo Lee", "comment on a post");
await shift();
const setPost = f.items.find((i) => i.type === "set" && i.has_pb) || (await feed(A, "prs")).items[0];
const c2 = await addC(C, "set", setPost.id, "PB machine!");
await shift();
const pumpItem = (await feed(A, "photos")).items.find((i) => i.type === "pump");
const c3 = await addC(A, "photo", pumpItem.id, "Looking strong");
ok(c2.id && c3.id, "comments on a PR and a pump check");
await shift();
for (const [b, why] of [["www.spam.com", "link"], ["", "empty"], ["y".repeat(281), "too long"]]) {
  e = await cErr(D, "wall", p1, b);
  ok(e && ["RK201", "RK204", "RK202"].includes(e.code), "comment refused: " + why);
}
e = await cErr(D, "wall", 999999, "hello?");
ok(e && e.code === "RK206", "can't comment on a post that isn't there");
await addC(D, "wall", p1, "first");
e = await cErr(D, "wall", p1, "second straight away");
ok(e && e.code === "RK203", "a few seconds between comments");
await shift();
let list = (await asRole("authenticated", A, `select public.list_comments('wall', ${p1}) l`))[0].l;
ok(list.length === 2 && list[0].body === "Beast mode" && list[1].body === "first", "comments listed oldest first");
f = await feed(A);
const withC = f.items.find((i) => i.type === "wall" && i.id === p1);
ok(withC.comment_count === 2 && withC.last_comment.body === "first" && withC.last_comment.name === "Dev", "feed shows comment count + latest comment");
ok(f.items.find((i) => i.type === "set" && i.id === setPost.id)?.comment_count >= 1 || (await feed(A, "prs")).items.find((i) => i.id === setPost.id).comment_count === 1, "PR card has its comment count");
e = await errAs("authenticated", C, `select public.delete_comment(${c1.id})`);
ok(e && e.code === "42501", "can't delete someone else's comment");
await asRole("authenticated", B, `select public.delete_comment(${c1.id})`);
ok((await one(`select count(*)::int c from public.feed_comments where id = ${c1.id}`)).c === 0, "delete your own comment");

// --- reports + staff review
const rep = (u, id, why) => asRole("authenticated", u, `select public.report_wall_post(${id}, ${why ? str(why) : "null"})`);
await rep(A, p1, "mine");
ok((await one(`select count(*)::int c from public.wall_reports where post_id = ${p1}`)).c === 0, "can't report your own post");
const bad = await post(C, "text", "Something rude");
await rep(A, bad, "Rude"); await rep(B, bad, null);
ok((await one(`select hidden from public.wall_posts where id = ${bad}`)).hidden === false, "2 reports: still shown");
await rep(D, bad, "Not okay");
ok((await one(`select hidden from public.wall_posts where id = ${bad}`)).hidden === true, "3 reports: hidden");
ok(!(await feed(A, "posts", null, 30)).items.some((i) => i.id === bad), "hidden post gone from others' feeds");
const own = (await feed(C, "posts", null, 30)).items.find((i) => i.id === bad);
ok(own && own.hidden === true, "the author still sees it, marked hidden");
e = await errAs("authenticated", A, `select public.toggle_wall_kudos(${bad})`);
ok(e && e.code === "RK206", "no kudos on a hidden post");
e = await cErr(B, "wall", bad, "hmm");
ok(e && e.code === "RK206", "no comments on a hidden post");
e = await errAs("authenticated", A, `select public.admin_feed_reports()`);
ok(e && e.code === "42501", "members can't see reports");
await as(S);
let reps = (await one(`select public.admin_feed_reports() r`)).r;
const rp = reps.posts.find((p) => p.id === bad);
ok(rp && rp.reports === 3 && rp.reasons.includes("Rude") && rp.author && !rp.author.includes("@") && rp.hidden, "staff see the reported post, count and reasons");
await q(`select public.admin_set_post_hidden(${bad}, false)`);
ok((await one(`select hidden from public.wall_posts where id = ${bad}`)).hidden === false && (await one(`select count(*)::int c from public.wall_reports where post_id = ${bad}`)).c === 0, "staff keep: shown again, reports cleared");
reps = (await one(`select public.admin_feed_reports() r`)).r;
ok(!reps.posts.some((p) => p.id === bad), "kept post leaves the queue");
await rep(A, bad, "again"); await rep(B, bad, null); await rep(D, bad, null);
ok((await one(`select hidden from public.wall_posts where id = ${bad}`)).hidden === false, "after a staff review, reports don't auto-hide it again");
await as(S); await q(`select public.admin_set_post_hidden(${bad}, true)`);
ok((await one(`select hidden, hidden_by_staff from public.wall_posts where id = ${bad}`)).hidden_by_staff === true, "staff can hide a post");
// comment reports
const rc = await addC(B, "wall", p1, "rude comment");
await shift();
for (const u of [A, C, D]) await asRole("authenticated", u, `select public.report_comment(${rc.id}, 'mean')`);
ok((await one(`select hidden from public.feed_comments where id = ${rc.id}`)).hidden === true, "3 comment reports: hidden");
list = (await asRole("authenticated", A, `select public.list_comments('wall', ${p1}) l`))[0].l;
ok(!list.some((c) => c.id === rc.id), "hidden comment not listed for others");
list = (await asRole("authenticated", B, `select public.list_comments('wall', ${p1}) l`))[0].l;
ok(list.some((c) => c.id === rc.id && c.hidden), "author sees their hidden comment");
await as(S);
reps = (await one(`select public.admin_feed_reports() r`)).r;
ok(reps.comments.some((c) => c.id === rc.id && c.reports === 3 && c.author === "Bo Lee"), "staff see reported comments");
await q(`select public.admin_set_comment_hidden(${rc.id}, false)`);
ok((await one(`select hidden from public.feed_comments where id = ${rc.id}`)).hidden === false, "staff keep a comment");
await q(`select public.delete_comment(${rc.id})`);
ok((await one(`select count(*)::int c from public.feed_comments where id = ${rc.id}`)).c === 0, "staff can delete any comment");

// --- edit + delete
await asRole("authenticated", A, `select public.edit_wall_post(${t1}, 'Leg day done.', 'leg-press-08', null)`);
const ed = await one(`select body, machine_id, edited_at from public.wall_posts where id = ${t1}`);
ok(ed.body === "Leg day done." && ed.machine_id === "leg-press-08" && ed.edited_at, "edit your own post");
ok((await feed(A, "posts", null, 30)).items.find((i) => i.id === t1).edited === true, "feed marks it edited");
e = await errAs("authenticated", B, `select public.edit_wall_post(${t1}, 'hacked')`);
ok(e && e.code === "RK206", "can't edit someone else's post");
e = await errAs("authenticated", A, `select public.edit_wall_post(${t1}, 'see www.x.com')`);
ok(e && e.code === "RK201", "no links when editing either");
e = await errAs("authenticated", B, `select public.delete_wall_post(${p1})`);
ok(e && e.code === "42501", "can't delete someone else's post");
const paths = (await asRole("authenticated", A, `select public.delete_wall_post(${p1}) p`))[0].p;
ok(paths.length === 2 && paths.includes(pa1), "delete your post: its photo files come back to remove");
ok((await one(`select count(*)::int c from public.feed_comments where target_type = 'wall' and target_id = ${p1}`)).c === 0, "its comments go too");
ok(!(await vis(B, pa1)), "deleted post's photos can't be opened by others");
await as(S);
const sp = (await one(`select public.delete_wall_post(${tagged}) p`)).p;
ok(Array.isArray(sp) && (await one(`select count(*)::int c from public.staff_actions where action = 'delete_post'`)).c === 1, "staff can delete any post (logged)");

// --- notices + offers
e = await errAs("authenticated", A, `select public.admin_save_gym_post('{"kind":"notice","title":"x"}')`);
ok(e && e.code === "42501", "members can't post notices");
await as(S);
const n1 = (await one(`select public.admin_save_gym_post('{"kind":"notice","title":"Closed Sunday for Diwali","body":"Open again Monday 6 am.","pinned":true}') id`)).id;
const prod = (await one(`select id from public.rewards order by id limit 1`)).id;
await db.exec(`update public.rewards set active = true where id = ${prod}`);
const o1 = (await one(`select public.admin_save_gym_post(${lit({ kind: "offer", title: "15% off jerseys", body: "This week only", sponsor_id: "jersey-drip", reward_id: String(prod), code: "RACKED15", cta_label: "Shop now", cta_url: "https://jerseydrip.shop" })}) id`)).id;
const fut = (await one(`select public.admin_save_gym_post(${lit({ kind: "notice", title: "Coming soon", starts_at: new Date(Date.now() + 86400000).toISOString() })}) id`)).id;
const old = (await one(`select public.admin_save_gym_post(${lit({ kind: "notice", title: "Old news", starts_at: new Date(Date.now() - 3 * 86400000).toISOString(), ends_at: new Date(Date.now() - 86400000).toISOString() })}) id`)).id;
for (const [p, why] of [
  [{ kind: "offer", title: "x", cta_url: "javascript:alert(1)" }, "bad link"],
  [{ kind: "notice", title: "x", starts_at: "2026-01-02T00:00:00Z", ends_at: "2026-01-01T00:00:00Z" }, "ends before start"],
  [{ kind: "offer", title: "x", sponsor_id: "nobody" }, "unknown brand"],
  [{ kind: "notice", title: "" }, "no title"],
  [{ kind: "ad", title: "x" }, "bad kind"],
]) {
  e = null; try { await q(`select public.admin_save_gym_post(${lit(p)})`); } catch (x) { e = x; }
  ok(e && e.code === "22023", "gym post refused: " + why);
}
f = await feed(B);
ok(f.pinned.length === 1 && f.pinned[0].id === Number(n1) && f.pinned[0].title.includes("Diwali"), "pinned notice on top");
ok(!f.items.some((i) => i.type === "gym" && i.id === Number(n1)), "pinned notice not repeated in the list");
const off = f.items.find((i) => i.type === "gym" && i.id === Number(o1));
ok(off && off.kind === "offer" && off.sponsor.name === "Jersey Drip" && off.code === "RACKED15" && off.reward && off.cta_url === "https://jerseydrip.shop", "offer in the feed with brand, code, link, shop item");
ok(!JSON.stringify(f).includes("Coming soon") && !JSON.stringify(f).includes("Old news"), "scheduled and ended posts stay out");
ok((await feed(B, "gym")).items.every((i) => i.type === "gym"), "Gym filter: notices + offers");
ok((await feed(B, "all", f.items[3].at)).pinned.length === 0, "pinned only on the first page");
await as(S);
await q(`select public.admin_save_gym_post(${lit({ id: String(o1), pinned: true })})`);
const o1row = await one(`select title, code, pinned, sponsor_id from public.gym_posts where id = ${o1}`);
ok(o1row.pinned && o1row.title === "15% off jerseys" && o1row.code === "RACKED15" && o1row.sponsor_id === "jersey-drip", "editing changes only what's sent");
const all = (await one(`select public.admin_gym_posts() r`)).r;
ok(["live", "scheduled", "ended"].every((s) => all.some((g) => g.status === s)), "staff list shows live / scheduled / ended");
await q(`select public.admin_save_gym_post(${lit({ id: String(n1), active: false })})`);
ok((await feed(B)).pinned.length === 1 && (await feed(B)).pinned[0].id === Number(o1), "switched-off notice disappears");
await q(`select public.admin_delete_gym_post(${fut})`);
ok((await one(`select count(*)::int c from public.gym_posts where id = ${fut}`)).c === 0, "staff delete a gym post");
ok((await q(`select action from public.staff_actions where action like '%gym_post'`)).length >= 4, "gym post changes logged");

// --- account deletion
const cOnA = await addC(B, "wall", tr, "Huge change!");
await as(A); await q(`select public.delete_my_account()`);
ok((await one(`select count(*)::int c from public.wall_posts where uid = '${A}'`)).c === 0, "deleting an account deletes their posts");
ok((await one(`select count(*)::int c from public.feed_comments where id = ${cOnA.id}`)).c === 0, "...and comments on those posts");
ok((await one(`select count(*)::int c from public.feed_comments where uid = '${A}'`)).c === 0, "...and their comments");

// --- safe to run again
await db.exec(fs.readFileSync(R + "0014_social_feed.sql", "utf8"));
ok((await one(`select count(*)::int c from public.wall_posts`)).c > 0 && (await one(`select count(*)::int c from public.gym_posts`)).c === 3, "re-running keeps posts and gym posts");
console.log("pass", pass, "fail", fail);
process.exit(fail ? 1 : 0);
