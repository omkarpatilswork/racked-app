-- ============================================================================
-- Pre / post "pump" photos. Run after 0001-0006. Safe to re-run.
--
-- Each member can add ONE "pre" and ONE "post" photo per day. Photos are
-- stored in a PRIVATE storage bucket (no public links). A photo is visible to:
--   * its owner (always),
--   * other signed-in members, only while it is marked "shared" and has not
--     been hidden by reports/staff,
--   * staff.
-- Shared photos appear in the Home feed (one post per member per day, pre and
-- post side by side) and everyone's own photos build their Profile timeline.
--
-- Safety: members can mark a photo private or delete it any time; other
-- members can report a post; 3 different reporters automatically hide a
-- photo until staff review it (admin > Photo reports).
-- ============================================================================

-- A name that is safe to show other members (never an email address).
create or replace function public._public_name(p_name text)
returns text
language sql
immutable
as $$
  select left(
    case when p_name like '%@%' then initcap(split_part(trim(p_name), '@', 1))
         else coalesce(nullif(trim(p_name), ''), 'Member') end,
    40);
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.pump_photos (
  id bigint generated always as identity primary key,
  uid uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('pre', 'post')),
  day date not null,
  path text not null unique,           -- <uid>/<file> inside the pump-photos bucket
  shared boolean not null default true, -- show in the gym feed
  hidden boolean not null default false, -- hidden by reports / staff
  created_at timestamptz not null default now(),
  unique (uid, day, kind)
);

create index if not exists pump_photos_uid_day_idx on public.pump_photos (uid, day desc);
create index if not exists pump_photos_feed_idx on public.pump_photos (created_at desc)
  where shared and not hidden;

alter table public.pump_photos enable row level security;

drop policy if exists "see own and shared photos" on public.pump_photos;
create policy "see own and shared photos"
  on public.pump_photos for select
  to authenticated
  using (uid = auth.uid() or (shared and not hidden) or public.is_staff());
-- No insert/update/delete policies: all writes go through the functions below.

create table if not exists public.photo_kudos (
  item_id bigint not null,   -- id of the earliest visible photo in the day's post
  uid uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, uid)
);
alter table public.photo_kudos enable row level security;

create table if not exists public.photo_reports (
  id bigint generated always as identity primary key,
  photo_id bigint not null references public.pump_photos (id) on delete cascade,
  reporter uuid not null references public.profiles (id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  unique (photo_id, reporter)
);
alter table public.photo_reports enable row level security;
-- (no policies on kudos/reports: only the functions below touch them)

-- ---------------------------------------------------------------------------
-- Private storage bucket + rules. 5 MB cap, images only.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pump-photos', 'pump-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Upload: only into your own folder (<your user id>/...).
drop policy if exists "pump photos: upload to own folder" on storage.objects;
create policy "pump photos: upload to own folder"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'pump-photos' and split_part(name, '/', 1) = auth.uid()::text);

-- View: your own files, files whose photo you're allowed to see (shared and
-- not hidden -- the pump_photos rule above does the filtering), or staff.
drop policy if exists "pump photos: view own or shared" on storage.objects;
create policy "pump photos: view own or shared"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'pump-photos'
    and (
      split_part(name, '/', 1) = auth.uid()::text
      or public.is_staff()
      or exists (select 1 from public.pump_photos p where p.path = storage.objects.name)
    )
  );

-- Delete: your own files, or staff.
drop policy if exists "pump photos: delete own or staff" on storage.objects;
create policy "pump photos: delete own or staff"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'pump-photos'
    and (split_part(name, '/', 1) = auth.uid()::text or public.is_staff())
  );

-- ---------------------------------------------------------------------------
-- add_pump_photo: record an uploaded file as today's pre/post photo. Replaces
-- an existing photo of the same kind for that day; returns the old file's
-- path so the app can delete it from storage.
-- p_day is the member's local date (so it matches their attendance calendar);
-- it must be within a day of the gym's own date.
-- ---------------------------------------------------------------------------
create or replace function public.add_pump_photo(
  p_kind text,
  p_path text,
  p_shared boolean default true,
  p_day date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone public.app_timezone())::date;
  v_day date;
  v_old_path text;
  v_id bigint;
begin
  if v_uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if p_kind not in ('pre', 'post') then
    raise exception 'kind must be pre or post';
  end if;
  if split_part(p_path, '/', 1) <> v_uid::text or p_path like '%..%' or p_path !~ '^[0-9a-f-]+/[A-Za-z0-9._-]+$' then
    raise exception 'bad file path';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'pump-photos' and name = p_path) then
    raise exception 'file was not uploaded';
  end if;

  v_day := coalesce(p_day, v_today);
  if abs(v_day - v_today) > 1 then
    raise exception 'bad day';
  end if;

  select path into v_old_path from public.pump_photos
   where uid = v_uid and day = v_day and kind = p_kind;
  delete from public.pump_photos where uid = v_uid and day = v_day and kind = p_kind;

  insert into public.pump_photos (uid, kind, day, path, shared)
  values (v_uid, p_kind, v_day, p_path, coalesce(p_shared, true))
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'old_path', v_old_path);
end;
$$;

-- Share to / hide from the gym feed.
create or replace function public.set_pump_photo_shared(p_id bigint, p_shared boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  update public.pump_photos set shared = coalesce(p_shared, false)
   where id = p_id and uid = auth.uid();
  if not found then
    raise exception 'no such photo';
  end if;
end;
$$;

-- Delete a photo (yours, or any if you're staff). Returns the storage path so
-- the app can remove the file itself.
create or replace function public.delete_pump_photo(p_id bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_path text;
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  delete from public.pump_photos
   where id = p_id and (uid = auth.uid() or public.is_staff())
  returning path into v_path;
  if v_path is null then
    raise exception 'no such photo';
  end if;
  return v_path;
end;
$$;

-- ---------------------------------------------------------------------------
-- report_photos: report a post (its pre and/or post photo). Three different
-- reporters hide a photo automatically until staff look at it.
-- ---------------------------------------------------------------------------
create or replace function public.report_photos(p_ids bigint[], p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
begin
  if v_uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  foreach v_id in array coalesce(p_ids, '{}'::bigint[]) loop
    -- only photos you're allowed to see, and never your own
    if exists (select 1 from public.pump_photos
                where id = v_id and uid <> v_uid and shared and not hidden) then
      insert into public.photo_reports (photo_id, reporter, reason)
      values (v_id, v_uid, left(nullif(trim(p_reason), ''), 200))
      on conflict (photo_id, reporter) do nothing;
      if (select count(*) from public.photo_reports where photo_id = v_id) >= 3 then
        update public.pump_photos set hidden = true where id = v_id;
      end if;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- feed_photos: shared pump photos for the Home feed. One post per member per
-- day (pre and post together). Same paging as feed_posts: pass the last
-- created_at you have as p_before. Signed-in members only.
-- ---------------------------------------------------------------------------
drop function if exists public.feed_photos(int, timestamptz);

create or replace function public.feed_photos(p_limit int default 15, p_before timestamptz default null)
returns table (
  item_id bigint,
  is_mine boolean,
  display_name text,
  avatar_url text,
  day date,
  pre_photo_id bigint,
  pre_path text,
  post_photo_id bigint,
  post_path text,
  created_at timestamptz,
  kudos_count int,
  kudos_mine boolean,
  kudos_names text[]
)
language sql
stable
security definer
set search_path = public
as $$
  with vis as (
    select p.*
    from public.pump_photos p
    where auth.uid() is not null
      and p.shared and not p.hidden
      and p.created_at >= now() - interval '30 days'
  ),
  days as (
    select
      v.uid,
      v.day,
      min(v.id) as item_id,
      max(v.created_at) as created_at,
      max(v.id)   filter (where v.kind = 'pre')  as pre_photo_id,
      max(v.path) filter (where v.kind = 'pre')  as pre_path,
      max(v.id)   filter (where v.kind = 'post') as post_photo_id,
      max(v.path) filter (where v.kind = 'post') as post_path
    from vis v
    group by v.uid, v.day
  )
  select
    d.item_id,
    (d.uid = auth.uid()) as is_mine,
    public._public_name(pr.display_name) as display_name,
    pr.avatar_url,
    d.day,
    d.pre_photo_id,
    d.pre_path,
    d.post_photo_id,
    d.post_path,
    d.created_at,
    (select count(*)::int from public.photo_kudos k where k.item_id = d.item_id) as kudos_count,
    exists (select 1 from public.photo_kudos k where k.item_id = d.item_id and k.uid = auth.uid()) as kudos_mine,
    coalesce((
      select array_agg(s.n)
      from (
        select left(initcap(coalesce(
                 nullif(split_part(split_part(trim(p2.display_name), '@', 1), ' ', 1), ''), 'Lifter')), 14) as n
        from public.photo_kudos k2
        join public.profiles p2 on p2.id = k2.uid
        where k2.item_id = d.item_id and k2.uid <> auth.uid()
        order by k2.created_at desc
        limit 2
      ) s
    ), '{}'::text[]) as kudos_names
  from days d
  join public.profiles pr on pr.id = d.uid
  where d.created_at < coalesce(p_before, 'infinity'::timestamptz)
  order by d.created_at desc
  limit least(greatest(coalesce(p_limit, 15), 1), 50);
$$;

create or replace function public.toggle_photo_kudos(p_item_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_mine boolean;
begin
  if v_uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if not exists (select 1 from public.pump_photos where id = p_item_id and shared and not hidden) then
    raise exception 'no such post';
  end if;
  if exists (select 1 from public.photo_kudos where item_id = p_item_id and uid = v_uid) then
    delete from public.photo_kudos where item_id = p_item_id and uid = v_uid;
    v_mine := false;
  else
    insert into public.photo_kudos (item_id, uid) values (p_item_id, v_uid) on conflict do nothing;
    v_mine := true;
  end if;
  return jsonb_build_object(
    'count', (select count(*) from public.photo_kudos where item_id = p_item_id),
    'mine', v_mine
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff moderation: reported / hidden photos, and hide / restore.
-- (Deleting uses delete_pump_photo above, which lets staff delete any photo.)
-- ---------------------------------------------------------------------------
create or replace function public.admin_pump_reports()
returns table (
  id bigint,
  display_name text,
  kind text,
  day date,
  path text,
  shared boolean,
  hidden boolean,
  report_count int,
  reasons text[],
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  return query
    select
      p.id,
      public._public_name(pr.display_name),
      p.kind,
      p.day,
      p.path,
      p.shared,
      p.hidden,
      (select count(*)::int from public.photo_reports r where r.photo_id = p.id),
      coalesce((select array_agg(r.reason) from public.photo_reports r
                 where r.photo_id = p.id and r.reason is not null), '{}'::text[]),
      p.created_at
    from public.pump_photos p
    join public.profiles pr on pr.id = p.uid
    where p.hidden or exists (select 1 from public.photo_reports r where r.photo_id = p.id)
    order by (select count(*) from public.photo_reports r where r.photo_id = p.id) desc, p.created_at desc
    limit 100;
end;
$$;

create or replace function public.admin_set_photo_hidden(p_id bigint, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  update public.pump_photos set hidden = coalesce(p_hidden, false) where id = p_id;
  if not coalesce(p_hidden, false) then
    -- restoring a photo clears its reports so it isn't instantly re-hidden
    delete from public.photo_reports where photo_id = p_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissions: signed-in members only.
-- ---------------------------------------------------------------------------
revoke all on function public.add_pump_photo(text, text, boolean, date) from public, anon;
revoke all on function public.set_pump_photo_shared(bigint, boolean) from public, anon;
revoke all on function public.delete_pump_photo(bigint) from public, anon;
revoke all on function public.report_photos(bigint[], text) from public, anon;
revoke all on function public.feed_photos(int, timestamptz) from public, anon;
revoke all on function public.toggle_photo_kudos(bigint) from public, anon;
revoke all on function public.admin_pump_reports() from public, anon;
revoke all on function public.admin_set_photo_hidden(bigint, boolean) from public, anon;

grant execute on function public.add_pump_photo(text, text, boolean, date) to authenticated;
grant execute on function public.set_pump_photo_shared(bigint, boolean) to authenticated;
grant execute on function public.delete_pump_photo(bigint) to authenticated;
grant execute on function public.report_photos(bigint[], text) to authenticated;
grant execute on function public.feed_photos(int, timestamptz) to authenticated;
grant execute on function public.toggle_photo_kudos(bigint) to authenticated;
grant execute on function public.admin_pump_reports() to authenticated;
grant execute on function public.admin_set_photo_hidden(bigint, boolean) to authenticated;
