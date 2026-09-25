-- ============================================================================
-- Leaderboard views. Views re-run their query on every select, so a client
-- that has subscribed to postgres_changes on machine_stats and simply
-- re-queries these views on each change event gets a correct, live
-- leaderboard without any extra bookkeeping table to keep in sync.
-- ============================================================================

-- Overall leaderboard: total XP across every machine a member has touched.
-- security_invoker = true is essential here: without it a view runs with
-- the view OWNER's privileges and silently bypasses the RLS policies on
-- machine_stats/profiles for every caller. With it, each caller only ever
-- sees what their own row-level policies already allow.
create or replace view public.v_overall_leaderboard
  with (security_invoker = true) as
select
  ms.uid,
  p.display_name,
  p.avatar_url,
  sum(ms.xp)::int as total_xp,
  sum(ms.sets)::int as total_sets,
  sum(ms.volume)::numeric as total_volume,
  count(*)::int as pb_count,
  count(distinct ms.machine_id)::int as unlocked
from public.machine_stats ms
join public.profiles p on p.id = ms.uid
group by ms.uid, p.display_name, p.avatar_url;

-- Per-machine leaderboard (mode-aware, for the dual Pec Fly / Rear Delt machine).
create or replace view public.v_machine_leaderboard
  with (security_invoker = true) as
select
  ms.machine_id,
  ms.mode,
  ms.uid,
  p.display_name,
  p.avatar_url,
  ms.pb_weight,
  ms.pb_reps,
  ms.xp,
  ms.level,
  ms.sets,
  rank() over (
    partition by ms.machine_id, ms.mode
    order by ms.pb_weight desc, ms.pb_reps desc
  ) as rank
from public.machine_stats ms
join public.profiles p on p.id = ms.uid;

grant select on public.v_overall_leaderboard to authenticated;
grant select on public.v_machine_leaderboard to authenticated;

-- Views inherit RLS from their underlying tables' policies for the querying
-- role (thanks to security_invoker), so both are safe to expose to any
-- signed-in member — a caller only ever sees what machine_stats/profiles'
-- own select policies already allow them to see.

-- ---------------------------------------------------------------------------
-- Admin dashboard aggregates (staff-only via the underlying tables' RLS,
-- reinforced here with security_invoker so the view can't leak feedback or
-- tap analytics to a non-staff member who happens to query it directly).
-- ---------------------------------------------------------------------------
create or replace view public.v_admin_tap_counts
  with (security_invoker = true) as
select machine_id, count(*)::int as taps
from public.tap_events
group by machine_id;

create or replace view public.v_admin_feedback_summary
  with (security_invoker = true) as
select
  count(*)::int as feedback_count,
  round(avg(rating)::numeric, 2) as avg_rating,
  count(*) filter (where status = 'open')::int as open_count
from public.feedback;

grant select on public.v_admin_tap_counts to authenticated;
grant select on public.v_admin_feedback_summary to authenticated;
