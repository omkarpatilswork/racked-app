-- ============================================================================
-- 0010_staff_moderation.sql
--
-- Keeping the leaderboards honest.
--
--   1. machine_limits -- the real max weight (and reps) for each machine.
--      Staff can change them from the staff page. A set above the limit is
--      refused by the database, whatever app or tool sent it.
--      Also refused: unknown machines or sides, odd weights (not in 0.25 kg
--      steps), and logging faster than a real person could (two sets within
--      8 seconds, more than 30 sets on one machine or 120 in total per day).
--   2. Suspicious sets are saved but flagged for staff review:
--        * more than 40% (and at least 10 kg) above the member's best from
--          before today on that machine -- so climbing in small steps within
--          one session is caught too, or
--        * a member's very first set on a machine at 70%+ of its max.
--      Old sets already above a machine's max are flagged when this runs.
--   3. Staff tools: review queue (approve / remove), remove any set, reset
--      one member on one machine, reset a whole machine, edit limits.
--      PBs, XP and leaderboards recalculate automatically.
--   4. member_notices -- when staff remove something, the member sees a short
--      note in the app explaining why.
--   5. staff_actions -- an activity log of every staff action.
--
-- Safe to run more than once (staff-edited limits are kept).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Machine limits
-- ---------------------------------------------------------------------------
create table if not exists public.machine_limits (
  machine_id text primary key,
  max_weight numeric not null check (max_weight > 0 and max_weight <= 2000),
  max_reps int not null default 50 check (max_reps between 1 and 200),
  -- flag a set if it beats the member's previous best by more than this %
  jump_pct int not null default 40 check (jump_pct between 5 and 500),
  -- sides of a dual machine that may be logged ('{}' = single machine)
  allowed_modes text[] not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

alter table public.machine_limits enable row level security;
drop policy if exists "signed-in members can read machine limits" on public.machine_limits;
create policy "signed-in members can read machine limits"
  on public.machine_limits for select
  to authenticated
  using (true);
-- no insert/update/delete policies: only admin_set_machine_limit() writes

-- Generous starting values. Staff should set each machine's real stack max
-- on the staff page (Machines tab). Existing rows are never overwritten.
insert into public.machine_limits (machine_id, max_weight, max_reps) values
  ('lat-pulldown-01', 150, 50),
  ('chest-press-02', 150, 50),
  ('rowing-03', 150, 50),
  ('pec-fly-rear-delt-04', 120, 50),
  ('shoulder-press-05', 120, 50),
  ('biceps-preacher-06', 80, 50),
  ('squat-07', 250, 50),
  ('leg-press-08', 400, 50),
  ('leg-extension-09', 150, 50),
  ('deadlift-10', 250, 50)
on conflict (machine_id) do nothing;

alter table public.machine_limits add column if not exists allowed_modes text[] not null default '{}';
update public.machine_limits set allowed_modes = '{pec-fly,rear-delt}'
 where machine_id = 'pec-fly-rear-delt-04' and allowed_modes = '{}';

-- ---------------------------------------------------------------------------
-- 2. Review fields on every set + the guard that runs on every new set
-- ---------------------------------------------------------------------------
alter table public.set_logs add column if not exists review_status text;
alter table public.set_logs add column if not exists review_reason text;
alter table public.set_logs add column if not exists reviewed_by uuid references public.profiles (id) on delete set null;
alter table public.set_logs add column if not exists reviewed_at timestamptz;
alter table public.set_logs drop constraint if exists set_logs_review_status_check;
alter table public.set_logs add constraint set_logs_review_status_check
  check (review_status is null or review_status in ('flagged', 'approved'));
create index if not exists set_logs_flagged_idx on public.set_logs (created_at desc) where review_status = 'flagged';
create index if not exists set_logs_uid_machine_idx on public.set_logs (uid, machine_id, created_at desc);

create or replace function public._guard_set_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lim public.machine_limits%rowtype;
  v_today timestamptz := (date_trunc('day', now() at time zone public.app_timezone()) at time zone public.app_timezone());
  v_base numeric;
  v_first_today numeric;
  v_n int;
begin
  -- Refusals. The error text is shown to the member as-is.
  select * into v_lim from public.machine_limits where machine_id = new.machine_id;
  if v_lim.machine_id is null then
    raise exception 'This machine isn''t set up in Racked yet. Please tell the front desk.'
      using errcode = 'RK003';
  end if;
  if coalesce(new.mode, '') <> '' and not (new.mode = any (v_lim.allowed_modes)) then
    raise exception 'That side of the machine isn''t recognised. Re-scan the sticker and try again.'
      using errcode = 'RK003';
  end if;
  if new.weight > v_lim.max_weight then
    raise exception 'That''s more than this machine goes up to (% kg max). Check the weight and try again.',
      trim_scale(v_lim.max_weight)
      using errcode = 'RK001';
  end if;
  if new.reps > v_lim.max_reps then
    raise exception 'That''s more reps than one set can have here (% max). Check the reps and try again.',
      v_lim.max_reps
      using errcode = 'RK002';
  end if;
  if (new.weight * 4) <> trunc(new.weight * 4) then
    raise exception 'Weights go up in steps of 0.25 kg. Check the weight and try again.'
      using errcode = 'RK004';
  end if;
  if exists (select 1 from public.set_logs where uid = new.uid and created_at > now() - interval '8 seconds') then
    raise exception 'You just logged a set. Give it a few seconds before the next one.'
      using errcode = 'RK005';
  end if;
  select count(*) into v_n from public.set_logs
   where uid = new.uid and machine_id = new.machine_id and created_at >= v_today;
  if v_n >= 30 then
    raise exception 'That''s 30 sets on this machine today, the daily maximum. See you tomorrow!'
      using errcode = 'RK005';
  end if;
  select count(*) into v_n from public.set_logs where uid = new.uid and created_at >= v_today;
  if v_n >= 120 then
    raise exception 'That''s 120 sets today, the daily maximum. See you tomorrow!'
      using errcode = 'RK005';
  end if;

  -- Suspicious: save it, but flag it for staff.
  if new.review_status is null then
    -- best from BEFORE today (ignoring flagged sets) ...
    select max(weight) into v_base
      from public.set_logs
     where uid = new.uid and machine_id = new.machine_id
       and coalesce(mode, '') = coalesce(new.mode, '')
       and coalesce(review_status, '') <> 'flagged'
       and created_at < v_today;
    -- ... or, on a member's first day here, their first set today
    if v_base is null then
      select weight into v_first_today
        from public.set_logs
       where uid = new.uid and machine_id = new.machine_id
         and coalesce(mode, '') = coalesce(new.mode, '')
         and coalesce(review_status, '') <> 'flagged'
       order by created_at
       limit 1;
      v_base := v_first_today;
    end if;

    if v_base is null then
      if new.weight >= 0.7 * v_lim.max_weight then
        new.review_status := 'flagged';
        new.review_reason := format('First set on this machine at %s kg, near its %s kg max',
          trim_scale(new.weight), trim_scale(v_lim.max_weight));
      end if;
    elsif new.weight - v_base >= 10
      and new.weight > v_base * (1 + v_lim.jump_pct / 100.0) then
      new.review_status := 'flagged';
      new.review_reason := format('Jumped from %s kg to %s kg (+%s%%)',
        trim_scale(v_base), trim_scale(new.weight), round(100 * (new.weight - v_base) / v_base));
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_set_log on public.set_logs;
create trigger guard_set_log
  before insert on public.set_logs
  for each row execute function public._guard_set_log();

-- Sets logged before limits existed that are above a machine's max go
-- straight into the review queue.
create or replace function public._flag_over_limit(p_machine_id text default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  update public.set_logs s
     set review_status = 'flagged',
         review_reason = format('Above this machine''s %s kg / %s rep max', trim_scale(l.max_weight), l.max_reps)
    from public.machine_limits l
   where l.machine_id = s.machine_id
     and (p_machine_id is null or s.machine_id = p_machine_id)
     and coalesce(s.review_status, '') <> 'flagged'
     and (s.weight > l.max_weight or s.reps > l.max_reps);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public._flag_over_limit(text) from public, anon, authenticated;

-- The staff "recent sets" view now also shows review status (columns added
-- at the end, so existing queries keep working).
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
  sl.created_at,
  sl.review_status,
  sl.review_reason
from public.set_logs sl
join public.profiles p on p.id = sl.uid
order by sl.created_at desc;

grant select on public.v_admin_set_logs to authenticated;

select public._flag_over_limit(null);

-- ---------------------------------------------------------------------------
-- 3. Notes to members + staff activity log
-- ---------------------------------------------------------------------------
create table if not exists public.member_notices (
  id bigint generated always as identity primary key,
  uid uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('set_removed', 'member_machine_reset', 'machine_reset')),
  machine_id text,
  mode text,
  weight numeric,
  reps int,
  set_at timestamptz,
  reason text,
  created_at timestamptz not null default now(),
  seen_at timestamptz
);
create index if not exists member_notices_unseen_idx on public.member_notices (uid, created_at desc) where seen_at is null;

alter table public.member_notices enable row level security;
drop policy if exists "members read their own notices" on public.member_notices;
create policy "members read their own notices"
  on public.member_notices for select
  to authenticated
  using (uid = auth.uid());

create or replace function public.mark_notices_seen(p_ids bigint[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.member_notices
     set seen_at = now()
   where uid = auth.uid() and id = any(p_ids) and seen_at is null;
$$;
revoke all on function public.mark_notices_seen(bigint[]) from public, anon;
grant execute on function public.mark_notices_seen(bigint[]) to authenticated;

create table if not exists public.staff_actions (
  id bigint generated always as identity primary key,
  staff_uid uuid references public.profiles (id) on delete set null,
  action text not null,
  target_uid uuid references public.profiles (id) on delete set null,
  machine_id text,
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists staff_actions_created_idx on public.staff_actions (created_at desc);

alter table public.staff_actions enable row level security;
drop policy if exists "staff read the activity log" on public.staff_actions;
create policy "staff read the activity log"
  on public.staff_actions for select
  to authenticated
  using (public.is_staff());

create or replace function public._log_staff_action(p_action text, p_target uuid, p_machine text, p_detail text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.staff_actions (staff_uid, action, target_uid, machine_id, detail)
  values (auth.uid(), p_action, p_target, p_machine, left(p_detail, 500));
$$;
revoke all on function public._log_staff_action(text, uuid, text, text) from public, anon, authenticated;

-- Short, cleaned-up reason text (staff pick a preset or type their own).
create or replace function public._clean_reason(p_reason text)
returns text
language sql
immutable
as $$
  select nullif(left(regexp_replace(trim(coalesce(p_reason, '')), '\s+', ' ', 'g'), 200), '');
$$;

-- ---------------------------------------------------------------------------
-- 4. Staff tools
-- ---------------------------------------------------------------------------

-- The review queue: every flagged set, newest first, with the member's
-- previous best on that machine for context.
create or replace function public.admin_review_queue(p_limit int default 100)
returns table (
  id bigint,
  uid uuid,
  display_name text,
  avatar_url text,
  machine_id text,
  mode text,
  weight numeric,
  reps int,
  is_pb boolean,
  review_reason text,
  created_at timestamptz,
  prev_best numeric,
  member_sets int
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
    s.id, s.uid, pr.display_name, pr.avatar_url, s.machine_id, s.mode,
    s.weight, s.reps, s.is_pb, s.review_reason, s.created_at,
    (select max(o.weight) from public.set_logs o
      where o.uid = s.uid and o.machine_id = s.machine_id
        and coalesce(o.mode, '') = coalesce(s.mode, '')
        and o.id <> s.id and coalesce(o.review_status, '') <> 'flagged') as prev_best,
    (select count(*)::int from public.set_logs o
      where o.uid = s.uid and o.machine_id = s.machine_id) as member_sets
  from public.set_logs s
  join public.profiles pr on pr.id = s.uid
  where s.review_status = 'flagged'
  order by s.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 300);
end;
$$;

-- Approve: the set is fine, take it off the queue.
create or replace function public.admin_approve_set(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.set_logs%rowtype;
begin
  if not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  update public.set_logs
     set review_status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_id
  returning * into v_row;
  if found then
    perform public._log_staff_action('approve_set', v_row.uid, v_row.machine_id,
      format('%s kg x %s', trim_scale(v_row.weight), v_row.reps));
  end if;
end;
$$;

-- Remove one set (flagged or not). The member's PB / XP / level on that
-- machine are recalculated from what's left (admin_delete_set_log), they get
-- a note in the app, and it's written to the activity log.
create or replace function public.admin_remove_set(p_id bigint, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.set_logs%rowtype;
  v_reason text := public._clean_reason(p_reason);
begin
  if not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  select * into v_row from public.set_logs where id = p_id;
  if not found then
    return;
  end if;
  delete from public.post_kudos where post_id = p_id;
  perform public.admin_delete_set_log(p_id);
  insert into public.member_notices (uid, kind, machine_id, mode, weight, reps, set_at, reason)
  values (v_row.uid, 'set_removed', v_row.machine_id, v_row.mode, v_row.weight, v_row.reps, v_row.created_at, v_reason);
  perform public._log_staff_action('remove_set', v_row.uid, v_row.machine_id,
    format('%s kg x %s%s', trim_scale(v_row.weight), v_row.reps, coalesce(' - ' || v_reason, '')));
end;
$$;

-- Reset ONE member on ONE machine (both sides of a dual machine): their sets
-- and stats there are wiped; nobody else is touched. Returns sets removed.
create or replace function public.admin_reset_member_machine(p_uid uuid, p_machine_id text, p_reason text default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := public._clean_reason(p_reason);
  v_count int;
  v_stats int;
begin
  if not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  delete from public.post_kudos
   where post_id in (select id from public.set_logs where uid = p_uid and machine_id = p_machine_id);
  delete from public.set_logs where uid = p_uid and machine_id = p_machine_id;
  get diagnostics v_count = row_count;
  delete from public.machine_stats where uid = p_uid and machine_id = p_machine_id;
  get diagnostics v_stats = row_count;
  if v_count > 0 or v_stats > 0 then
    insert into public.member_notices (uid, kind, machine_id, reason)
    values (p_uid, 'member_machine_reset', p_machine_id, v_reason);
  end if;
  perform public._log_staff_action('reset_member_machine', p_uid, p_machine_id,
    format('%s sets removed%s', v_count, coalesce(' - ' || v_reason, '')));
  return v_count;
end;
$$;

-- Reset a WHOLE machine for everyone (e.g. the stack was changed, or test
-- data). Sets and stats go; check-in counts are kept for the gym's stats.
-- Every affected member gets a note. Returns members affected.
create or replace function public.admin_reset_machine_for_all(p_machine_id text, p_reason text default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := public._clean_reason(p_reason);
  v_members int;
begin
  if not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  insert into public.member_notices (uid, kind, machine_id, reason)
  select distinct uid, 'machine_reset', p_machine_id, v_reason
    from public.machine_stats
   where machine_id = p_machine_id;
  get diagnostics v_members = row_count;
  delete from public.post_kudos
   where post_id in (select id from public.set_logs where machine_id = p_machine_id);
  delete from public.set_logs where machine_id = p_machine_id;
  delete from public.machine_stats where machine_id = p_machine_id;
  perform public._log_staff_action('reset_machine', null, p_machine_id,
    format('%s members affected%s', v_members, coalesce(' - ' || v_reason, '')));
  return v_members;
end;
$$;

-- Change a machine's limits.
create or replace function public.admin_set_machine_limit(
  p_machine_id text,
  p_max_weight numeric,
  p_max_reps int default 50,
  p_jump_pct int default 40
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  if p_machine_id is null or length(p_machine_id) = 0 or length(p_machine_id) > 64 then
    raise exception 'invalid machine' using errcode = '22023';
  end if;
  if p_max_weight is null or p_max_weight <= 0 or p_max_weight > 2000 then
    raise exception 'Max weight must be between 1 and 2000 kg' using errcode = '22023';
  end if;
  if p_max_reps is null or p_max_reps < 1 or p_max_reps > 200 then
    raise exception 'Max reps must be between 1 and 200' using errcode = '22023';
  end if;
  if p_jump_pct is null or p_jump_pct < 5 or p_jump_pct > 500 then
    raise exception 'Jump alert must be between 5%% and 500%%' using errcode = '22023';
  end if;
  insert into public.machine_limits (machine_id, max_weight, max_reps, jump_pct, updated_at, updated_by)
  values (p_machine_id, p_max_weight, p_max_reps, p_jump_pct, now(), auth.uid())
  on conflict (machine_id) do update
    set max_weight = excluded.max_weight,
        max_reps = excluded.max_reps,
        jump_pct = excluded.jump_pct,
        updated_at = now(),
        updated_by = auth.uid();
  perform public._flag_over_limit(p_machine_id);
  perform public._log_staff_action('set_limit', null, p_machine_id,
    format('max %s kg, %s reps, flag jumps over %s%%', trim_scale(p_max_weight), p_max_reps, p_jump_pct));
end;
$$;

-- Find members by name (staff only). Plain text match, no wildcards.
create or replace function public.admin_member_search(p_query text default '', p_limit int default 30)
returns table (
  id uuid,
  display_name text,
  avatar_url text,
  is_staff boolean,
  total_sets int,
  last_set_at timestamptz,
  flagged int,
  joined_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text := lower(trim(coalesce(p_query, '')));
begin
  if not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  return query
  select
    p.id, p.display_name, p.avatar_url, p.is_staff,
    coalesce(s.total, 0)::int, s.last_at, coalesce(s.flagged, 0)::int, p.created_at
  from public.profiles p
  left join (
    select sl.uid,
           count(*) as total,
           max(sl.created_at) as last_at,
           count(*) filter (where sl.review_status = 'flagged') as flagged
      from public.set_logs sl
     group by sl.uid
  ) s on s.uid = p.id
  where v_q = '' or position(v_q in lower(p.display_name)) > 0
  order by s.last_at desc nulls last, p.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$$;

-- Staff activity log with names.
create or replace function public.admin_activity(p_limit int default 50)
returns table (
  id bigint,
  staff_name text,
  action text,
  target_name text,
  machine_id text,
  detail text,
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
  select a.id, coalesce(st.display_name, 'Staff'), a.action, tg.display_name, a.machine_id, a.detail, a.created_at
    from public.staff_actions a
    left join public.profiles st on st.id = a.staff_uid
    left join public.profiles tg on tg.id = a.target_uid
   order by a.created_at desc
   limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

-- Full factory reset now also clears member notes and is logged.
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
  delete from public.member_notices;
  perform public._log_staff_action('reset_all', null, null, 'All gym activity data wiped');
end;
$$;

-- Old one-step machine reset: now logged too (kept for compatibility).
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
  perform public._log_staff_action('reset_machine', null, p_machine_id, 'Sets, stats and check-ins wiped');
end;
$$;

-- Permissions: staff functions can be called by signed-in users (each one
-- re-checks is_staff() inside); never by anonymous visitors.
revoke all on function public.admin_review_queue(int) from public, anon;
revoke all on function public.admin_approve_set(bigint) from public, anon;
revoke all on function public.admin_remove_set(bigint, text) from public, anon;
revoke all on function public.admin_reset_member_machine(uuid, text, text) from public, anon;
revoke all on function public.admin_reset_machine_for_all(text, text) from public, anon;
revoke all on function public.admin_set_machine_limit(text, numeric, int, int) from public, anon;
revoke all on function public.admin_member_search(text, int) from public, anon;
revoke all on function public.admin_activity(int) from public, anon;
grant execute on function public.admin_review_queue(int) to authenticated;
grant execute on function public.admin_approve_set(bigint) to authenticated;
grant execute on function public.admin_remove_set(bigint, text) to authenticated;
grant execute on function public.admin_reset_member_machine(uuid, text, text) to authenticated;
grant execute on function public.admin_reset_machine_for_all(text, text) to authenticated;
grant execute on function public.admin_set_machine_limit(text, numeric, int, int) to authenticated;
grant execute on function public.admin_member_search(text, int) to authenticated;
grant execute on function public.admin_activity(int) to authenticated;
grant execute on function public.admin_reset_all_data() to authenticated;
grant execute on function public.admin_reset_machine(text) to authenticated;
