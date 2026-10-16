-- ============================================================================
-- Admin tools: time-period leaderboards, delete/reset controls for staff.
-- Run this after 0001_init.sql and 0002_leaderboard_views.sql.
--
-- Design choice: none of this grants raw DELETE on any table to
-- anon/authenticated. Every destructive action goes through a
-- `security definer` function (owned by the migration role, same pattern
-- as log_set()/record_tap() in 0001) that re-checks public.is_staff()
-- itself and raises if the caller isn't staff. That means a bug in a future
-- RLS policy can't accidentally expose bulk delete the way a blanket
-- "staff can delete" table policy could.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- _period_start(period) — shared boundary for "today" / "this week" /
-- "this month" / "all time", used by the leaderboard RPCs below. Runs in the
-- Postgres server's own timezone (UTC by default on Supabase) — see the
-- comment in lib/period.ts for the client-side implication of that.
-- ---------------------------------------------------------------------------
create or replace function public._period_start(p_period text)
returns timestamptz
language sql
immutable
as $$
  select case lower(coalesce(p_period, 'all'))
    when 'today' then date_trunc('day', now())
    when 'week'  then date_trunc('week', now())
    when 'month' then date_trunc('month', now())
    else '-infinity'::timestamptz
  end;
$$;

-- ---------------------------------------------------------------------------
-- leaderboard_overall(period) — period-scoped replacement for
-- v_overall_leaderboard. machine_stats is a cumulative all-time total with
-- no timestamp to filter on, so a "this week" leaderboard has to be rebuilt
-- from set_logs (the immutable per-set history) instead.
--
-- set_logs' own RLS policy only lets a member read their OWN rows (or
-- staff read everyone's) — exactly right for "my history", wrong for "the
-- whole gym's leaderboard". So this runs security definer and hands back
-- only the aggregated, already-public shape (same columns
-- v_overall_leaderboard exposed), never raw rows.
-- ---------------------------------------------------------------------------
create or replace function public.leaderboard_overall(p_period text default 'all')
returns table (
  uid uuid,
  display_name text,
  avatar_url text,
  total_xp int,
  total_sets int,
  total_volume numeric,
  pb_count int,
  unlocked int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as uid,
    p.display_name,
    p.avatar_url,
    sum(sl.xp_gain)::int as total_xp,
    count(sl.id)::int as total_sets,
    sum(sl.volume)::numeric as total_volume,
    count(*) filter (where sl.is_pb)::int as pb_count,
    count(distinct sl.machine_id)::int as unlocked
  from public.set_logs sl
  join public.profiles p on p.id = sl.uid
  where sl.created_at >= public._period_start(p_period)
  group by p.id, p.display_name, p.avatar_url
  order by total_xp desc;
$$;

grant execute on function public.leaderboard_overall(text) to authenticated;

-- ---------------------------------------------------------------------------
-- leaderboard_machine(machine, mode, period) — same idea, per machine.
-- "Best" for the period is the single set with the highest weight (ties
-- broken by reps, then by which was logged first) — not just the max
-- weight and max reps taken independently, which could stitch together two
-- unrelated sets into a PB that was never actually lifted.
--
-- xp/level are intentionally left as machine_stats' all-time cumulative
-- values regardless of which period is selected — a member's level badge
-- shouldn't reset just because you're looking at "This Week"; only the
-- ranked pb_weight/pb_reps/sets are period-scoped.
-- ---------------------------------------------------------------------------
create or replace function public.leaderboard_machine(
  p_machine_id text,
  p_mode text default '',
  p_period text default 'all'
)
returns table (
  machine_id text,
  mode text,
  uid uuid,
  display_name text,
  avatar_url text,
  pb_weight numeric,
  pb_reps int,
  xp int,
  level int,
  sets int,
  rank bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with period_sets as (
    select *
    from public.set_logs
    where machine_id = p_machine_id
      and coalesce(mode, '') = coalesce(p_mode, '')
      and created_at >= public._period_start(p_period)
  ),
  best as (
    select
      uid, weight, reps,
      row_number() over (partition by uid order by weight desc, reps desc, created_at asc) as rn
    from period_sets
  ),
  agg as (
    select uid, count(*)::int as sets
    from period_sets
    group by uid
  )
  select
    p_machine_id as machine_id,
    coalesce(p_mode, '') as mode,
    b.uid,
    pr.display_name,
    pr.avatar_url,
    b.weight as pb_weight,
    b.reps as pb_reps,
    coalesce(ms.xp, 0) as xp,
    coalesce(ms.level, 1) as level,
    a.sets,
    rank() over (order by b.weight desc, b.reps desc) as rank
  from best b
  join agg a on a.uid = b.uid
  join public.profiles pr on pr.id = b.uid
  left join public.machine_stats ms
    on ms.uid = b.uid and ms.machine_id = p_machine_id and ms.mode = coalesce(p_mode, '')
  where b.rn = 1
  order by rank;
$$;

grant execute on function public.leaderboard_machine(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- v_admin_set_logs — set_logs joined with the member's name/avatar, for the
-- admin dashboard's "Recent Sets" panel (so a staff member can spot and
-- delete an obviously-fake test entry: 999kg x 50 reps etc). security_invoker
-- means a non-staff caller only ever sees their own rows here too, same as
-- querying set_logs directly — this view adds no new exposure.
-- ---------------------------------------------------------------------------
create or replace view public.v_admin_set_logs
  with (security_invoker = true) as
select
  sl.id,
  sl.uid,
  p.display_name,
  p.avatar_url,
  sl.machine_id,
  sl.mode,
  sl.weight,
  sl.reps,
  sl.volume,
  sl.is_pb,
  sl.xp_gain,
  sl.created_at
from public.set_logs sl
join public.profiles p on p.id = sl.uid
order by sl.created_at desc;

grant select on public.v_admin_set_logs to authenticated;

-- ---------------------------------------------------------------------------
-- admin_delete_set_log(id) — delete one set entry and recompute that
-- member's machine_stats row (PB/XP/level/sets/sessions/volume) from
-- whatever set_logs rows remain, instead of leaving a stale aggregate
-- behind. If nothing remains for that (uid, machine, mode), the
-- machine_stats row is removed entirely — the machine goes back to "not
-- unlocked" for them, matching what set_logs now actually shows.
-- ---------------------------------------------------------------------------
create or replace function public.admin_delete_set_log(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.set_logs%rowtype;
  v_uid uuid;
  v_machine text;
  v_mode text;
  v_pb_weight numeric;
  v_pb_reps int;
  v_sets int;
  v_sessions int;
  v_volume numeric;
  v_xp int;
  v_last_date date;
  v_sets_today int;
  v_level int;
  v_remaining int;
  v_req int;
begin
  if not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;

  select * into v_row from public.set_logs where id = p_id;
  if not found then
    return;
  end if;

  v_uid := v_row.uid;
  v_machine := v_row.machine_id;
  v_mode := coalesce(v_row.mode, '');

  delete from public.set_logs where id = p_id;

  select
    count(*)::int,
    count(distinct created_at::date)::int,
    coalesce(sum(volume), 0)::numeric,
    coalesce(sum(xp_gain), 0)::int,
    max(created_at::date),
    count(*) filter (where created_at::date = current_date)::int
  into v_sets, v_sessions, v_volume, v_xp, v_last_date, v_sets_today
  from public.set_logs
  where uid = v_uid and machine_id = v_machine and coalesce(mode, '') = v_mode;

  if v_sets = 0 then
    delete from public.machine_stats
      where uid = v_uid and machine_id = v_machine and mode = v_mode;
    return;
  end if;

  select weight, reps into v_pb_weight, v_pb_reps
  from public.set_logs
  where uid = v_uid and machine_id = v_machine and coalesce(mode, '') = v_mode
  order by weight desc, reps desc
  limit 1;

  -- Same level ladder as log_set(): 200 + (level-1)*100 XP per level.
  v_level := 1;
  v_remaining := v_xp;
  loop
    v_req := 200 + (v_level - 1) * 100;
    exit when v_remaining < v_req;
    v_remaining := v_remaining - v_req;
    v_level := v_level + 1;
  end loop;

  update public.machine_stats set
    pb_weight = v_pb_weight,
    pb_reps = v_pb_reps,
    sets = v_sets,
    sessions = v_sessions,
    volume = v_volume,
    xp = v_xp,
    level = v_level,
    last_date = v_last_date,
    sets_today = v_sets_today,
    updated_at = now()
  where uid = v_uid and machine_id = v_machine and mode = v_mode;
end;
$$;

grant execute on function public.admin_delete_set_log(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_delete_feedback / admin_clear_feedback — remove one piece of
-- feedback, or wipe all feedback (optionally scoped to one machine).
-- ---------------------------------------------------------------------------
create or replace function public.admin_delete_feedback(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  delete from public.feedback where id = p_id;
end;
$$;

grant execute on function public.admin_delete_feedback(bigint) to authenticated;

create or replace function public.admin_clear_feedback(p_machine_id text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  if p_machine_id is null then
    delete from public.feedback;
  else
    delete from public.feedback where machine_id = p_machine_id;
  end if;
end;
$$;

grant execute on function public.admin_clear_feedback(text) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_reset_machine(machine_id) — wipe every member's stats/history/taps
-- for ONE machine (e.g. to clear test data you logged on just that
-- machine while building). Feedback for the machine is untouched — use
-- admin_clear_feedback(machine_id) separately if you want that gone too.
-- ---------------------------------------------------------------------------
create or replace function public.admin_reset_machine(p_machine_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  delete from public.set_logs where machine_id = p_machine_id;
  delete from public.machine_stats where machine_id = p_machine_id;
  delete from public.tap_events where machine_id = p_machine_id;
end;
$$;

grant execute on function public.admin_reset_machine(text) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_reset_all_data() — full factory reset: every member's sets, PBs,
-- taps, feedback and attendance, across every machine. Staff accounts
-- (profiles.is_staff) and auth logins are left alone — this only clears
-- gym-activity data, never accounts.
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
  delete from public.set_logs;
  delete from public.machine_stats;
  delete from public.tap_events;
  delete from public.feedback;
  delete from public.attendance;
end;
$$;

grant execute on function public.admin_reset_all_data() to authenticated;
