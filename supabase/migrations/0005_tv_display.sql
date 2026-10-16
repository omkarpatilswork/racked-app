-- ============================================================================
-- Gym TV screen (/tv). Run after 0001-0004. Safe to re-run.
--
-- 1. Makes "today / this week / this month" follow YOUR gym's clock instead of
--    the database server's (UTC). Without this, "today" would reset at
--    5:30 AM India time. To use another timezone, change the one line inside
--    app_timezone() below and run this file again.
-- 2. Adds two read-only functions the public TV page calls. They are the ONLY
--    thing the logged-out TV can reach: first names + best lifts + anonymous
--    counts. No emails, no user ids, no photos, no raw tables.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- The gym's timezone. <<< change this one line if the gym isn't in India >>>
-- ---------------------------------------------------------------------------
create or replace function public.app_timezone()
returns text
language sql
immutable
as $$ select 'Asia/Kolkata'::text $$;

-- Same boundaries as before, but measured on the gym's clock. Now `stable`
-- (it depends on now()), which is what the leaderboard functions already are.
create or replace function public._period_start(p_period text)
returns timestamptz
language sql
stable
as $$
  select case lower(coalesce(p_period, 'all'))
    when 'today' then date_trunc('day',   now() at time zone public.app_timezone()) at time zone public.app_timezone()
    when 'week'  then date_trunc('week',  now() at time zone public.app_timezone()) at time zone public.app_timezone()
    when 'month' then date_trunc('month', now() at time zone public.app_timezone()) at time zone public.app_timezone()
    else '-infinity'::timestamptz
  end;
$$;

-- ---------------------------------------------------------------------------
-- tv_boards(period, limit) — the top N lifters for EVERY machine (and every
-- mode of a dual machine) in one call. Each person's entry is their single
-- best set in the period (heaviest weight, then most reps, then earliest).
-- Only a first name is returned (capped at 14 characters), never an email.
-- ---------------------------------------------------------------------------
create or replace function public.tv_boards(p_period text default 'today', p_limit int default 5)
returns table (
  machine_id text,
  mode text,
  rank bigint,
  name text,
  pb_weight numeric,
  pb_reps int,
  sets int
)
language sql
stable
security definer
set search_path = public
as $$
  with period_sets as (
    select uid, machine_id, coalesce(mode, '') as mode, weight, reps, created_at
    from public.set_logs
    where created_at >= public._period_start(p_period)
  ),
  best as (
    select
      uid, machine_id, mode, weight, reps,
      row_number() over (
        partition by machine_id, mode, uid
        order by weight desc, reps desc, created_at asc
      ) as rn,
      count(*) over (partition by machine_id, mode, uid)::int as sets
    from period_sets
  ),
  ranked as (
    select
      b.machine_id, b.mode, b.uid, b.weight, b.reps, b.sets,
      rank() over (partition by b.machine_id, b.mode order by b.weight desc, b.reps desc) as rank
    from best b
    where b.rn = 1
  )
  select
    r.machine_id,
    r.mode,
    r.rank,
    left(
      initcap(
        coalesce(
          nullif(split_part(split_part(trim(pr.display_name), '@', 1), ' ', 1), ''),
          'Lifter'
        )
      ),
      14
    ) as name,
    r.weight as pb_weight,
    r.reps as pb_reps,
    r.sets
  from ranked r
  join public.profiles pr on pr.id = r.uid
  where r.rank <= greatest(coalesce(p_limit, 5), 1)
  order by r.machine_id, r.mode, r.rank;
$$;

-- ---------------------------------------------------------------------------
-- tv_activity(period) — who trained what, anonymised. One row per
-- (person, machine, mode). `person` is a throw-away number that only means
-- "same human" inside this one response, so the page can count DISTINCT
-- lifters per muscle group (someone who hits lat pulldown AND rows counts
-- once under Back) without ever being given a real id.
-- ---------------------------------------------------------------------------
create or replace function public.tv_activity(p_period text default 'today')
returns table (
  person int,
  machine_id text,
  mode text,
  sets int,
  volume numeric,
  pbs int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (dense_rank() over (order by sl.uid))::int as person,
    sl.machine_id,
    coalesce(sl.mode, '') as mode,
    count(*)::int as sets,
    coalesce(sum(sl.weight * sl.reps), 0)::numeric as volume,
    (count(*) filter (where sl.is_pb))::int as pbs
  from public.set_logs sl
  where sl.created_at >= public._period_start(p_period)
  group by sl.uid, sl.machine_id, coalesce(sl.mode, '');
$$;

-- The TV is a plain public link with nobody logged in, so these two must be
-- callable by the anonymous role as well as by signed-in members.
grant execute on function public.tv_boards(text, int)  to anon, authenticated;
grant execute on function public.tv_activity(text)     to anon, authenticated;
