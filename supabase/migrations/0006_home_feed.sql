-- ============================================================================
-- Home feed ("Instagram for the gym") + kudos. Run after 0001-0005. Safe to
-- re-run.
--
--   feed_posts(limit, before)  - recent activity from ALL members, newest
--                                first, for the Home screen. Signed-in
--                                members only (a logged-out visitor gets
--                                nothing back).
--   toggle_kudos(post_id)      - give / take back a kudos on a post.
--
-- set_logs' own security rule only lets you read YOUR OWN sets, so the feed is
-- built by a security-definer function that hands back just the display-ready
-- shape (name, photo, machine, best set, kudos) -- never raw rows or emails.
-- ============================================================================

-- One row per (post, member) who gave kudos. Written only by toggle_kudos().
create table if not exists public.post_kudos (
  post_id bigint not null,
  uid uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, uid)
);

create index if not exists post_kudos_post_idx on public.post_kudos (post_id, created_at desc);

alter table public.post_kudos enable row level security;
-- No policies on purpose: nobody can read or write the table directly. Reads
-- go through feed_posts() and writes through toggle_kudos().

-- ---------------------------------------------------------------------------
-- feed_posts
--
-- A "post" is one member's visit to one machine: their sets on the same
-- machine (and mode) are grouped together until there's a 90-minute gap, so
-- doing 4 sets of lat pulldown makes ONE post that says "4 sets", not four.
-- If any set in the visit was a personal best, the post is a PB post and
-- shows that best set; otherwise it shows the heaviest set.
--
-- The post's id is the id of its first set, which never changes as more sets
-- are added -- so kudos stay attached to the right post.
-- Looks back 30 days. Pass p_before (the created_at of the last post you
-- have) to page further back.
-- ---------------------------------------------------------------------------
drop function if exists public.feed_posts(int, timestamptz);

create or replace function public.feed_posts(p_limit int default 15, p_before timestamptz default null)
returns table (
  post_id bigint,
  is_mine boolean,
  display_name text,
  avatar_url text,
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

grant execute on function public.feed_posts(int, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- toggle_kudos — tap once to give kudos, tap again to take it back. Returns
-- the new total and whether you now have one on the post.
-- ---------------------------------------------------------------------------
create or replace function public.toggle_kudos(p_post_id bigint)
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
  if not exists (select 1 from public.set_logs where id = p_post_id) then
    raise exception 'no such post';
  end if;

  if exists (select 1 from public.post_kudos where post_id = p_post_id and uid = v_uid) then
    delete from public.post_kudos where post_id = p_post_id and uid = v_uid;
    v_mine := false;
  else
    insert into public.post_kudos (post_id, uid) values (p_post_id, v_uid)
    on conflict do nothing;
    v_mine := true;
  end if;

  return jsonb_build_object(
    'count', (select count(*) from public.post_kudos where post_id = p_post_id),
    'mine', v_mine
  );
end;
$$;

grant execute on function public.toggle_kudos(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- "Reset all data" in the admin dashboard should clear the feed's kudos too.
-- Same as before (see 0003) plus the kudos table.
-- ---------------------------------------------------------------------------
create or replace function public.admin_reset_all_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  delete from public.post_kudos;
  delete from public.set_logs;
  delete from public.machine_stats;
  delete from public.tap_events;
  delete from public.feedback;
  delete from public.attendance;
end;
$$;

grant execute on function public.admin_reset_all_data() to authenticated;
