-- ============================================================================
-- 0008_instagram_handle.sql
--
-- Optional Instagram handle on a member's profile. When a member adds one,
-- it shows next to their name on Home-feed posts (lifts, PBs and pump photos)
-- and on their own Profile. It is shown ONLY to signed-in members (the feed
-- functions return nothing to signed-out visitors) and is never put on the
-- public gym TV screen.
--
-- Safe to run more than once.
-- ============================================================================

alter table public.profiles add column if not exists instagram_handle text;

-- Instagram's own rules: 1-30 letters / numbers / periods / underscores,
-- no two periods in a row, cannot end with a period. Stored lower-case,
-- without the @.
alter table public.profiles drop constraint if exists profiles_instagram_handle_format;
alter table public.profiles add constraint profiles_instagram_handle_format
  check (
    instagram_handle is null
    or (instagram_handle ~ '^[a-z0-9._]{1,30}$'
        and instagram_handle !~ '\.\.'
        and instagram_handle !~ '\.$')
  );

-- Turn whatever the member typed ("@Omi.fit", "instagram.com/omi.fit/",
-- "https://www.instagram.com/omi.fit?igsh=abc") into a clean handle, or
-- raise an error if it can't be a real handle.
create or replace function public._clean_instagram_handle(p_raw text)
returns text
language plpgsql
immutable
as $$
declare
  h text := lower(trim(coalesce(p_raw, '')));
begin
  if h = '' then
    return null;
  end if;
  -- pasted profile link -> keep just the handle part
  h := regexp_replace(h, '^(https?://)?(www\.)?instagram\.com/', '');
  h := split_part(split_part(split_part(h, '?', 1), '#', 1), '/', 1);
  h := regexp_replace(h, '^@+', '');
  if h = '' then
    return null;
  end if;
  if h !~ '^[a-z0-9._]{1,30}$' or h ~ '\.\.' or h ~ '\.$' then
    raise exception 'That does not look like an Instagram handle' using errcode = '22023';
  end if;
  return h;
end;
$$;

-- The member sets (or clears, by sending empty text) their own handle.
create or replace function public.set_instagram_handle(p_handle text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  h text;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  h := public._clean_instagram_handle(p_handle);
  update public.profiles set instagram_handle = h where id = auth.uid();
  return h;
end;
$$;

grant execute on function public.set_instagram_handle(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Feed functions: same as before, plus the instagram_handle column.
-- (The return type changes, so the old versions are dropped first.)
-- ---------------------------------------------------------------------------
drop function if exists public.feed_posts(int, timestamptz);
drop function if exists public.feed_photos(int, timestamptz);

create or replace function public.feed_posts(p_limit int default 15, p_before timestamptz default null)
returns table (
  post_id bigint,
  is_mine boolean,
  display_name text,
  avatar_url text,
  instagram_handle text,
  machine_id text,
  mode text,
  sets int,
  weight numeric,
  reps int,
  volume numeric,
  xp int,
  has_pb boolean,
  started_at timestamptz,
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
  with recent as (
    select id, uid, machine_id, coalesce(mode, '') as mode, weight, reps, volume, is_pb, xp_gain, created_at
    from public.set_logs
    where auth.uid() is not null
      and created_at >= now() - interval '30 days'
  ),
  flagged as (
    select r.*,
      case
        when lag(r.created_at) over w is null then 1
        when r.created_at - lag(r.created_at) over w > interval '90 minutes' then 1
        else 0
      end as new_grp
    from recent r
    window w as (partition by r.uid, r.machine_id, r.mode order by r.created_at, r.id)
  ),
  grouped as (
    select f.*,
      sum(f.new_grp) over (partition by f.uid, f.machine_id, f.mode order by f.created_at, f.id) as grp
    from flagged f
  ),
  posts as (
    select
      min(g.id) as post_id,
      g.uid,
      g.machine_id,
      g.mode,
      count(*)::int as sets,
      sum(g.volume) as volume,
      sum(g.xp_gain)::int as xp,
      bool_or(g.is_pb) as has_pb,
      min(g.created_at) as started_at,
      max(g.created_at) as created_at,
      -- the set to show: best PB set if there was a PB, else the heaviest set
      (array_agg(g.weight order by g.is_pb desc, g.weight desc, g.reps desc))[1] as weight,
      (array_agg(g.reps   order by g.is_pb desc, g.weight desc, g.reps desc))[1] as reps
    from grouped g
    group by g.uid, g.machine_id, g.mode, g.grp
  )
  select
    p.post_id,
    (p.uid = auth.uid()) as is_mine,
    -- never show an email address to other members, even if a profile's
    -- display name was ever set to one
    left(case when pr.display_name like '%@%' then initcap(split_part(trim(pr.display_name), '@', 1))
              else pr.display_name end, 40) as display_name,
    pr.avatar_url,
    pr.instagram_handle,
    p.machine_id,
    p.mode,
    p.sets,
    p.weight,
    p.reps,
    p.volume,
    p.xp,
    p.has_pb,
    p.started_at,
    p.created_at,
    (select count(*)::int from public.post_kudos k where k.post_id = p.post_id) as kudos_count,
    exists (select 1 from public.post_kudos k where k.post_id = p.post_id and k.uid = auth.uid()) as kudos_mine,
    coalesce((
      select array_agg(s.n)
      from (
        select left(initcap(coalesce(
                 nullif(split_part(split_part(trim(p2.display_name), '@', 1), ' ', 1), ''), 'Lifter')), 14) as n
        from public.post_kudos k2
        join public.profiles p2 on p2.id = k2.uid
        where k2.post_id = p.post_id and k2.uid <> auth.uid()
        order by k2.created_at desc
        limit 2
      ) s
    ), '{}'::text[]) as kudos_names
  from posts p
  join public.profiles pr on pr.id = p.uid
  where p.created_at < coalesce(p_before, 'infinity'::timestamptz)
  order by p.created_at desc
  limit least(greatest(coalesce(p_limit, 15), 1), 50);
$$;

create or replace function public.feed_photos(p_limit int default 15, p_before timestamptz default null)
returns table (
  item_id bigint,
  is_mine boolean,
  display_name text,
  avatar_url text,
  instagram_handle text,
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
    pr.instagram_handle,
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

grant execute on function public.feed_posts(int, timestamptz) to authenticated;
grant execute on function public.feed_photos(int, timestamptz) to authenticated;
