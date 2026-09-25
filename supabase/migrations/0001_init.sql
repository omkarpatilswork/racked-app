-- ============================================================================
-- Racked by Bijlee — initial schema
-- Run this once against a fresh Supabase project (SQL Editor, or `supabase db push`).
-- Mirrors the gamification/attendance/leaderboard logic from the Racked
-- Artifact prototype, but moves set-logging into a single atomic RPC
-- (log_set) instead of a client-side read-modify-write, so concurrent taps
-- from the same person on two devices can't race or corrupt a PB.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Base privileges. Every Supabase project already grants anon/authenticated
-- broad table privileges by default and expects Row Level Security to do
-- the actual restricting (RLS only ever narrows what a GRANT already
-- allows — it can't grant access on its own). These statements just make
-- that explicit and self-contained, so this migration behaves the same way
-- if it's ever run against a plain Postgres database that doesn't have
-- Supabase's usual defaults pre-applied.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;

-- ---------------------------------------------------------------------------
-- profiles — one row per signed-in member, auto-created on first Google sign-in
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Member',
  avatar_url text,
  is_staff boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are readable by any signed-in member"
  on public.profiles for select
  to authenticated
  using (true);

create policy "members can update their own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Auto-create a profile row whenever someone signs in for the first time.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1),
      'Member'
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- is_staff() — small helper other policies use to gate the admin dashboard.
-- IMPORTANT: there is no self-serve way to become staff (by design). After
-- your first Google sign-in, promote yourself once from the Supabase SQL
-- editor:
--   update public.profiles set is_staff = true where id = '<your-user-id>';
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_staff from public.profiles where id = auth.uid()), false);
$$;

-- Prevent members from promoting themselves to staff by editing their own
-- profile row via the app's normal authenticated API — only an existing
-- staff member can flip someone else's flag that way. A direct connection
-- with no JWT (the Supabase SQL editor, the service-role key, this
-- migration itself) has auth.uid() = null and is always allowed through:
-- that's the trusted bootstrap path the README uses to make the very first
-- admin, and it's already an inherently trusted context (RLS doesn't apply
-- to it either).
create or replace function public.protect_is_staff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_staff is distinct from old.is_staff
     and auth.uid() is not null
     and not public.is_staff() then
    new.is_staff := old.is_staff;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_is_staff_trigger on public.profiles;
create trigger protect_is_staff_trigger
  before update on public.profiles
  for each row execute function public.protect_is_staff();

create policy "staff can update any profile"
  on public.profiles for update
  to authenticated
  using (public.is_staff())
  with check (true);

-- ---------------------------------------------------------------------------
-- machine_stats — one row per (uid, machine, mode): the PB + XP + level the
-- leaderboards read from. Written ONLY through log_set() below — there is no
-- direct INSERT/UPDATE policy for clients, so a PB can't be spoofed by
-- calling the table API directly.
-- ---------------------------------------------------------------------------
create table if not exists public.machine_stats (
  uid uuid not null references public.profiles (id) on delete cascade,
  machine_id text not null,
  mode text not null default '',
  pb_weight numeric(7, 2) not null,
  pb_reps int not null,
  sets int not null default 0,
  sessions int not null default 0,
  volume numeric(10, 2) not null default 0,
  xp int not null default 0,
  level int not null default 1,
  last_date date not null,
  sets_today int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (uid, machine_id, mode)
);

create index if not exists machine_stats_leaderboard_idx
  on public.machine_stats (machine_id, mode, pb_weight desc, pb_reps desc);

alter table public.machine_stats enable row level security;

create policy "machine_stats are readable by any signed-in member"
  on public.machine_stats for select
  to authenticated
  using (true);

-- No insert/update/delete policies on purpose: writes only happen inside
-- log_set(), which runs as the table owner (security definer).

-- ---------------------------------------------------------------------------
-- set_logs — immutable history of every set ever logged (personal history,
-- admin analytics). Also written only by log_set().
-- ---------------------------------------------------------------------------
create table if not exists public.set_logs (
  id bigint generated always as identity primary key,
  uid uuid not null references public.profiles (id) on delete cascade,
  machine_id text not null,
  mode text,
  weight numeric(7, 2) not null,
  reps int not null,
  volume numeric(10, 2) generated always as (weight * reps) stored,
  is_pb boolean not null default false,
  xp_gain int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists set_logs_uid_idx on public.set_logs (uid, created_at desc);
create index if not exists set_logs_machine_idx on public.set_logs (machine_id, created_at desc);

alter table public.set_logs enable row level security;

create policy "members can read their own set history"
  on public.set_logs for select
  to authenticated
  using (uid = auth.uid() or public.is_staff());

-- ---------------------------------------------------------------------------
-- attendance — one row per (uid, date). Members toggle their own days
-- directly (no anti-cheat needed here, same as the prototype); log_set()
-- also auto-marks "today" when a set is logged.
-- ---------------------------------------------------------------------------
create table if not exists public.attendance (
  uid uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  present boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (uid, date)
);

alter table public.attendance enable row level security;

create policy "members can read their own attendance"
  on public.attendance for select
  to authenticated
  using (uid = auth.uid() or public.is_staff());

create policy "members can mark their own attendance"
  on public.attendance for insert
  to authenticated
  with check (uid = auth.uid() and date <= current_date);

create policy "members can update their own attendance"
  on public.attendance for update
  to authenticated
  using (uid = auth.uid())
  with check (uid = auth.uid() and date <= current_date);

-- ---------------------------------------------------------------------------
-- feedback — per-machine star rating + optional issue chips + comment.
-- Signed-in members are attributed; the form also allows a fully anonymous
-- submission (uid null), matching the prototype's "no login required to
-- leave feedback" behavior.
-- ---------------------------------------------------------------------------
create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  uid uuid references public.profiles (id) on delete set null,
  display_name text not null default 'Anonymous',
  machine_id text not null,
  rating int not null check (rating between 1 and 5),
  issues text[] not null default '{}',
  comment text,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

create policy "anyone can submit feedback"
  on public.feedback for insert
  to anon, authenticated
  with check (uid is null or uid = auth.uid());

create policy "only staff can read feedback"
  on public.feedback for select
  to authenticated
  using (public.is_staff());

create policy "only staff can update feedback status"
  on public.feedback for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- tap_events — one row per machine-page view, for the admin "most tapped
-- machines" panel. No login required to record a tap (an NFC tap on a
-- physical sticker happens before anyone signs in).
-- ---------------------------------------------------------------------------
create table if not exists public.tap_events (
  id bigint generated always as identity primary key,
  machine_id text not null,
  uid uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists tap_events_machine_idx on public.tap_events (machine_id, created_at desc);

alter table public.tap_events enable row level security;

create policy "anyone can record a tap"
  on public.tap_events for insert
  to anon, authenticated
  with check (true);

create policy "only staff can read tap analytics"
  on public.tap_events for select
  to authenticated
  using (public.is_staff());

-- ---------------------------------------------------------------------------
-- log_set(...) — the one and only way a PB / XP / level gets written.
-- Atomic (row-locked with `for update`), so two devices logging at once for
-- the same person can't corrupt the aggregate. Mirrors calculatePB /
-- calculateXP / calculateMachineLevel from lib/gamification.ts exactly —
-- keep the two in sync if either changes.
-- ---------------------------------------------------------------------------
create or replace function public.log_set(
  p_machine_id text,
  p_mode text,
  p_weight numeric,
  p_reps int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_mode text := coalesce(p_mode, '');
  v_existing public.machine_stats%rowtype;
  v_found boolean := false;
  v_is_pb boolean;
  v_volume numeric := p_weight * p_reps;
  v_today date := current_date;
  v_is_new_day boolean;
  v_sets_today int;
  v_xp_gain int := 10; -- XP_TABLE.logSet
  v_pb_weight numeric;
  v_pb_reps int;
  v_total_xp int;
  v_total_sets int;
  v_level int;
  v_remaining int;
  v_req int;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_weight is null or p_weight <= 0 or p_weight > 2000 then
    raise exception 'invalid weight';
  end if;
  if p_reps is null or p_reps <= 0 or p_reps > 200 then
    raise exception 'invalid reps';
  end if;
  if p_machine_id is null or length(p_machine_id) = 0 or length(p_machine_id) > 64 then
    raise exception 'invalid machine id';
  end if;

  select * into v_existing from public.machine_stats
    where uid = v_uid and machine_id = p_machine_id and mode = v_mode
    for update;
  v_found := found;

  v_is_pb := (not v_found)
    or (p_weight > v_existing.pb_weight)
    or (p_weight = v_existing.pb_weight and p_reps > v_existing.pb_reps);
  v_is_new_day := (not v_found) or (v_existing.last_date <> v_today);
  v_sets_today := case when v_found and v_existing.last_date = v_today
                        then v_existing.sets_today + 1
                        else 1 end;

  if v_is_pb then v_xp_gain := v_xp_gain + 50; end if;              -- XP_TABLE.newPB
  if v_sets_today = 3 then v_xp_gain := v_xp_gain + 20; end if;     -- XP_TABLE.threeSets
  if v_is_new_day and v_found then v_xp_gain := v_xp_gain + 25; end if; -- XP_TABLE.returnDay

  v_pb_weight := case when v_is_pb then p_weight else v_existing.pb_weight end;
  v_pb_reps := case when v_is_pb then p_reps else v_existing.pb_reps end;

  insert into public.machine_stats as ms
    (uid, machine_id, mode, pb_weight, pb_reps, sets, sessions, volume, xp, level, last_date, sets_today, updated_at)
  values
    (v_uid, p_machine_id, v_mode, p_weight, p_reps, 1, 1, v_volume, v_xp_gain, 1, v_today, v_sets_today, now())
  on conflict (uid, machine_id, mode) do update set
    pb_weight  = v_pb_weight,
    pb_reps    = v_pb_reps,
    sets       = ms.sets + 1,
    sessions   = ms.sessions + (case when v_is_new_day then 1 else 0 end),
    volume     = ms.volume + v_volume,
    xp         = ms.xp + v_xp_gain,
    last_date  = v_today,
    sets_today = v_sets_today,
    updated_at = now()
  returning xp, sets into v_total_xp, v_total_sets;

  -- requirementForLevel(level) = 200 + (level-1)*100, same ladder as the client.
  v_level := 1;
  v_remaining := v_total_xp;
  loop
    v_req := 200 + (v_level - 1) * 100;
    exit when v_remaining < v_req;
    v_remaining := v_remaining - v_req;
    v_level := v_level + 1;
  end loop;

  update public.machine_stats
    set level = v_level
    where uid = v_uid and machine_id = p_machine_id and mode = v_mode;

  insert into public.set_logs (uid, machine_id, mode, weight, reps, is_pb, xp_gain)
  values (v_uid, p_machine_id, nullif(v_mode, ''), p_weight, p_reps, v_is_pb, v_xp_gain);

  -- Logging a set means you were at the gym today.
  insert into public.attendance (uid, date, present, updated_at)
  values (v_uid, v_today, true, now())
  on conflict (uid, date) do nothing;

  return jsonb_build_object(
    'isPb', v_is_pb,
    'weight', p_weight,
    'reps', p_reps,
    'pbWeight', v_pb_weight,
    'pbReps', v_pb_reps,
    'previousPb', case when v_found
      then jsonb_build_object('weight', v_existing.pb_weight, 'reps', v_existing.pb_reps)
      else null end,
    'xpGain', v_xp_gain,
    'totalXp', v_total_xp,
    'totalSets', v_total_sets,
    'level', v_level
  );
end;
$$;

grant execute on function public.log_set(text, text, numeric, int) to authenticated;

-- ---------------------------------------------------------------------------
-- record_tap(machine_id) — logs an NFC tap; callable by anon so it fires the
-- instant someone lands on a machine page, before they've signed in.
-- ---------------------------------------------------------------------------
create or replace function public.record_tap(p_machine_id text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.tap_events (machine_id, uid)
  values (p_machine_id, auth.uid());
$$;

grant execute on function public.record_tap(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Explicit table grants (belt-and-suspenders alongside the ALTER DEFAULT
-- PRIVILEGES at the top of this file — that statement only applies to
-- tables created after it runs; these cover the same tables directly so
-- this migration doesn't depend on statement ordering). Row Level Security
-- policies above are what actually restrict which rows anon/authenticated
-- can see or touch — these GRANTs just allow the table to be queried at
-- all, same as Supabase's own project defaults.
-- ---------------------------------------------------------------------------
grant select on public.profiles to anon, authenticated;
grant update on public.profiles to authenticated;
grant select on public.machine_stats to authenticated;
grant select on public.set_logs to authenticated;
grant select, insert, update on public.attendance to authenticated;
grant insert on public.feedback to anon, authenticated;
grant select, update on public.feedback to authenticated;
grant insert on public.tap_events to anon, authenticated;
grant select on public.tap_events to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime — the leaderboard and admin dashboard subscribe to these so
-- everyone's screen updates the instant someone else logs a set.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'machine_stats'
  ) then
    alter publication supabase_realtime add table public.machine_stats;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'attendance'
  ) then
    alter publication supabase_realtime add table public.attendance;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'feedback'
  ) then
    alter publication supabase_realtime add table public.feedback;
  end if;
end $$;
