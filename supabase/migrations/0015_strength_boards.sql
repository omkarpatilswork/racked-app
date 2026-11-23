-- ============================================================================
-- 0015_strength_boards.sql — Racked by Bijlee
--
-- Boards and prizes by strength for your size, with Men and Women boards.
--
--   * Body weight + board (Men / Women / Prefer not to say) per member, in
--     its own table (never on the public profile). Members set it once and
--     can update body weight once a week (a typo can be fixed within 15
--     minutes); the board once a month. Staff can weigh someone at the desk.
--   * Every set remembers the body weight on the day ("×BW" = kg lifted ÷
--     body weight). Changing your weight later never rewrites old sets; a
--     staff weigh-in corrects the sets of the prize weeks still running.
--   * Machine boards, the TV, challenges and the weekly prize rank by ×BW.
--     Public boards show ×BW and reps, never kg (kg + ×BW would give away
--     someone's body weight).
--   * Weekly prize: strength points = your best ×BW on each machine that
--     week × 100, added up (0.80× on Lat Pulldown = 80 points). A Men's and a
--     Women's race, each with the full prize list. Ties: whoever got there
--     first. XP is unchanged: levels, missions, streaks and the shop.
--   * Challenges: best lift = best ×BW, volume = kg moved ÷ body weight,
--     sets = sets. Winners per board.
--   * House lifts get a body weight + board too (only those show on ×BW
--     boards).
--   * Demo accounts (supabase/demo/demo_seed.sql) show on boards but never
--     win prizes or challenges.
--
-- Run after 0014. Safe to run more than once. If you ever run 0011, 0012 or
-- 0013 again, run 0015 again straight after.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Body weight + board
-- ---------------------------------------------------------------------------
create table if not exists public.member_body (
  uid uuid primary key references public.profiles (id) on delete cascade,
  division text check (division in ('men', 'women', 'open')),
  body_kg numeric(5, 1) check (body_kg between 25 and 300),
  body_set_at timestamptz,
  division_set_at timestamptz,
  checked_at timestamptz,
  checked_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.member_body enable row level security;
revoke all on public.member_body from anon, authenticated;
grant select on public.member_body to authenticated;
drop policy if exists "members read their own body row" on public.member_body;
create policy "members read their own body row" on public.member_body
  for select to authenticated using (uid = auth.uid());

-- every set keeps the body weight on the day
alter table public.set_logs add column if not exists body_kg numeric(5, 1);

create or replace function public._set_body_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select b.body_kg into new.body_kg from public.member_body b where b.uid = new.uid;
  return new;
end;
$$;
revoke all on function public._set_body_snapshot() from public, anon, authenticated;
drop trigger if exists set_body_snapshot on public.set_logs;
create trigger set_body_snapshot before insert on public.set_logs
  for each row execute function public._set_body_snapshot();

-- house lifts: body weight + board
alter table public.house_lifts add column if not exists body_kg numeric(5, 1);
alter table public.house_lifts add column if not exists division text;
alter table public.house_lifts drop constraint if exists house_lifts_body_kg_check;
alter table public.house_lifts add constraint house_lifts_body_kg_check check (body_kg is null or body_kg between 25 and 300);
alter table public.house_lifts drop constraint if exists house_lifts_division_check;
alter table public.house_lifts add constraint house_lifts_division_check check (division is null or division in ('men', 'women'));

-- sample people from supabase/demo/ (fixed id pattern): on the boards, never
-- given prizes
create or replace function public._is_demo(p_uid uuid)
returns boolean
language sql
immutable
as $$
  select p_uid is not null and p_uid::text like 'dddddddd-dddd-4ddd-8ddd-%';
$$;

create or replace function public._body_json(b public.member_body)
returns jsonb
language sql
stable
as $$
  select case when b.uid is null then jsonb_build_object('division', null, 'body_kg', null) else jsonb_build_object(
    'division', b.division,
    'body_kg', b.body_kg,
    'body_set_at', b.body_set_at,
    'division_set_at', b.division_set_at,
    'checked_at', b.checked_at,
    'next_body_change', case when b.body_set_at is null then null
                             when b.body_set_at > now() - interval '15 minutes' then null
                             when b.body_set_at > now() - interval '7 days' then b.body_set_at + interval '7 days' end,
    'next_division_change', case when b.division_set_at is null then null
                                 when b.division_set_at > now() - interval '15 minutes' then null
                                 when b.division_set_at > now() - interval '30 days' then b.division_set_at + interval '30 days' end) end;
$$;
revoke all on function public._body_json(public.member_body) from public, anon, authenticated;

create or replace function public.my_body()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  b public.member_body;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  select * into b from public.member_body where uid = auth.uid();
  return public._body_json(b);
end;
$$;

-- p_division: 'men' | 'women' | 'open' (prefer not to say) | null = keep
-- p_body_kg: 25-300 (rounded to 0.1) | null = keep
create or replace function public.set_my_body(p_division text, p_body_kg numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  b public.member_body;
  v_kg numeric(5, 1) := round(p_body_kg, 1);
  v_div text := nullif(trim(coalesce(p_division, '')), '');
  v_quick_kg boolean;
  v_quick_div boolean;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if v_div is not null and v_div not in ('men', 'women', 'open') then
    raise exception 'Pick Men, Women or Prefer not to say' using errcode = 'RK303';
  end if;
  if v_kg is not null and (v_kg < 25 or v_kg > 300) then
    raise exception 'Body weight: 25 to 300 kg' using errcode = 'RK303';
  end if;
  select * into b from public.member_body where uid = v_uid for update;

  if b.uid is null then
    if v_kg is null or v_div is null then
      raise exception 'Add your body weight and pick a board' using errcode = 'RK303';
    end if;
    insert into public.member_body (uid, division, body_kg, body_set_at, division_set_at)
    values (v_uid, v_div, v_kg, now(), now());
    -- sets logged before now count at this weight
    update public.set_logs set body_kg = v_kg where uid = v_uid and body_kg is null;
    select * into b from public.member_body where uid = v_uid;
    return public._body_json(b);
  end if;

  v_quick_kg := b.body_set_at is not null and b.body_set_at > now() - interval '15 minutes';
  v_quick_div := b.division_set_at is not null and b.division_set_at > now() - interval '15 minutes';

  if v_kg is not null and v_kg is distinct from b.body_kg then
    if b.body_kg is not null and not v_quick_kg and b.body_set_at > now() - interval '7 days' then
      raise exception 'You can update your body weight once a week. Next change from %.',
        to_char((b.body_set_at + interval '7 days') at time zone public.app_timezone(), 'FMDD Mon')
        using errcode = 'RK301';
    end if;
    if v_quick_kg then
      -- fixing a typo: keep the clock, correct the sets since
      update public.member_body set body_kg = v_kg, checked_at = null, checked_by = null, updated_at = now() where uid = v_uid;
      update public.set_logs set body_kg = v_kg where uid = v_uid and (body_kg is null or body_kg = b.body_kg);
    else
      update public.member_body set body_kg = v_kg, body_set_at = now(), checked_at = null, checked_by = null, updated_at = now() where uid = v_uid;
      update public.set_logs set body_kg = v_kg where uid = v_uid and body_kg is null;
    end if;
  end if;

  if v_div is not null and v_div is distinct from b.division then
    if b.division is not null and not v_quick_div and b.division_set_at > now() - interval '30 days' then
      raise exception 'You can switch boards once a month. Next change from %. Ask staff if it''s wrong.',
        to_char((b.division_set_at + interval '30 days') at time zone public.app_timezone(), 'FMDD Mon')
        using errcode = 'RK302';
    end if;
    update public.member_body
       set division = v_div, division_set_at = case when v_quick_div then division_set_at else now() end, updated_at = now()
     where uid = v_uid;
  end if;

  select * into b from public.member_body where uid = v_uid;
  return public._body_json(b);
end;
$$;

-- staff: see / set a member's body weight + board (a weigh-in at the desk).
-- A weigh-in also corrects the member's sets in prize weeks not awarded yet.
create or replace function public.admin_member_body(p_uid uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  b public.member_body;
begin
  perform public._require_staff();
  select * into b from public.member_body where uid = p_uid;
  return public._body_json(b) || jsonb_build_object('checked_by', (select public._public_name(display_name) from public.profiles where id = b.checked_by));
end;
$$;

create or replace function public.admin_set_member_body(p_uid uuid, p_body_kg numeric, p_division text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kg numeric(5, 1) := round(p_body_kg, 1);
  v_div text := nullif(trim(coalesce(p_division, '')), '');
  v_from timestamptz;
  b public.member_body;
begin
  perform public._require_staff();
  if not exists (select 1 from public.profiles where id = p_uid) then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;
  if v_kg is null or v_kg < 25 or v_kg > 300 then
    raise exception 'Body weight: 25 to 300 kg' using errcode = 'RK303';
  end if;
  if v_div is not null and v_div not in ('men', 'women', 'open') then
    raise exception 'Pick Men, Women or Prefer not to say' using errcode = 'RK303';
  end if;
  insert into public.member_body as mb (uid, division, body_kg, body_set_at, division_set_at, checked_at, checked_by)
  values (p_uid, coalesce(v_div, 'open'), v_kg, now(), now(), now(), auth.uid())
  on conflict (uid) do update set
    body_kg = excluded.body_kg,
    body_set_at = now(),
    division = coalesce(v_div, mb.division, 'open'),
    division_set_at = case when v_div is not null and v_div is distinct from mb.division then now()
                           else coalesce(mb.division_set_at, now()) end,
    checked_at = now(),
    checked_by = auth.uid(),
    updated_at = now();
  select least(coalesce(min(s.starts_at), now()), date_trunc('week', now()))
    into v_from
    from public.seasons s
   where s.awarded_at is null and s.ends_at > now() - interval '120 days';
  update public.set_logs set body_kg = v_kg where uid = p_uid and (body_kg is null or created_at >= v_from);
  perform public._log_staff_action('body_check', p_uid, null, 'Body weight checked at the desk');
  select * into b from public.member_body where uid = p_uid;
  return public._body_json(b);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. House lifts: + body weight and board
-- p: {id?, machine_id, mode, name, weight, reps, lifted_on, body_kg, division}
-- ---------------------------------------------------------------------------
create or replace function public.admin_save_house_lift(p jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint := nullif(p->>'id', '')::bigint;
  v_machine text := trim(coalesce(p->>'machine_id', ''));
  v_mode text := trim(coalesce(p->>'mode', ''));
  v_name text := regexp_replace(trim(coalesce(p->>'name', '')), '\s+', ' ', 'g');
  v_weight numeric;
  v_reps int;
  v_day date;
  v_bw numeric(5, 1);
  v_div text := nullif(trim(coalesce(p->>'division', '')), '');
  v_today date := (now() at time zone public.app_timezone())::date;
  v_lim public.machine_limits%rowtype;
begin
  perform public._require_staff();
  if char_length(v_name) < 1 then
    raise exception 'Add the lifter''s name' using errcode = '22023';
  end if;
  if char_length(v_name) > 16 then
    raise exception 'Keep the name short: 16 letters at most (a first name is best)' using errcode = '22023';
  end if;
  if v_name ~ '[@/:]' then
    raise exception 'Just a name, please (no emails or links)' using errcode = '22023';
  end if;
  select * into v_lim from public.machine_limits where machine_id = v_machine;
  if v_lim.machine_id is null then
    raise exception 'Pick a machine' using errcode = '22023';
  end if;
  if coalesce(array_length(v_lim.allowed_modes, 1), 0) > 0 then
    if not (v_mode = any (v_lim.allowed_modes)) then
      raise exception 'Pick which side of the machine' using errcode = '22023';
    end if;
  else
    v_mode := '';
  end if;
  begin
    v_weight := nullif(p->>'weight', '')::numeric;
    v_reps := nullif(p->>'reps', '')::int;
    v_day := coalesce(nullif(p->>'lifted_on', '')::date, v_today);
    v_bw := round(nullif(p->>'body_kg', '')::numeric, 1);
  exception when others then
    raise exception 'Check the weight, reps, body weight and date' using errcode = '22023';
  end;
  if v_weight is null or v_weight <= 0 then
    raise exception 'Add the weight' using errcode = '22023';
  end if;
  if v_weight > v_lim.max_weight then
    raise exception 'That''s more than this machine goes up to (% kg max)', trim_scale(v_lim.max_weight) using errcode = '22023';
  end if;
  if (v_weight * 4) <> trunc(v_weight * 4) then
    raise exception 'Weights go up in steps of 0.25 kg' using errcode = '22023';
  end if;
  if v_reps is null or v_reps < 1 or v_reps > least(v_lim.max_reps, 100) then
    raise exception 'Reps: 1 to %', least(v_lim.max_reps, 100) using errcode = '22023';
  end if;
  if v_day > v_today then
    raise exception 'The date can''t be in the future' using errcode = '22023';
  end if;
  if v_day < date '2020-01-01' then
    raise exception 'Check the date' using errcode = '22023';
  end if;
  if v_bw is null or v_bw < 25 or v_bw > 300 then
    raise exception 'Add their body weight (25 to 300 kg): boards rank by ×BW' using errcode = '22023';
  end if;
  if v_div is null or v_div not in ('men', 'women') then
    raise exception 'Pick the Men''s or Women''s board' using errcode = '22023';
  end if;

  if v_id is null then
    if (select count(*) from public.house_lifts where machine_id = v_machine and mode = v_mode) >= 20 then
      raise exception 'That''s 20 house lifts on this machine already. Remove one first.' using errcode = '22023';
    end if;
    insert into public.house_lifts (machine_id, mode, name, weight, reps, lifted_on, created_by, body_kg, division)
    values (v_machine, v_mode, v_name, v_weight, v_reps, v_day, auth.uid(), v_bw, v_div)
    returning id into v_id;
  else
    update public.house_lifts
       set machine_id = v_machine, mode = v_mode, name = v_name, weight = v_weight, reps = v_reps, lifted_on = v_day,
           body_kg = v_bw, division = v_div
     where id = v_id;
    if not found then
      raise exception 'That lift isn''t there any more' using errcode = 'P0002';
    end if;
  end if;
  perform public._log_staff_action('house_lift', null, v_machine,
    format('%s %s kg × %s (%s)', v_name, trim_scale(v_weight), v_reps, to_char(v_day, 'DD Mon YYYY')));
  return v_id;
end;
$$;

create or replace function public.admin_house_lifts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public._require_staff();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', h.id, 'machine_id', h.machine_id, 'mode', h.mode, 'name', h.name,
             'weight', h.weight, 'reps', h.reps, 'lifted_on', h.lifted_on, 'created_at', h.created_at,
             'body_kg', h.body_kg, 'division', h.division,
             'ratio', case when h.body_kg > 0 then round(h.weight / h.body_kg, 2) end,
             'added_by', public._public_name(pr.display_name))
           order by h.machine_id, h.mode, h.weight desc, h.reps desc)
      from public.house_lifts h
      left join public.profiles pr on pr.id = h.created_by), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Machine boards by ×BW
--
-- _bw_board(machine, mode, period, limit, fill, division): like _board (0013)
-- but ranked by kg ÷ body weight on the day. division 'men' | 'women' | 'all'
-- ('all' = everyone with a body weight, including "prefer not to say").
-- Fill rows (best_ever) work the same way: other people's best-ever ×BW.
-- ---------------------------------------------------------------------------
create or replace function public._bw_board(p_machine_id text, p_mode text, p_period text, p_limit int, p_fill int, p_division text)
returns table (
  machine_id text, mode text, division text, rank bigint, uid uuid, house_name text,
  weight numeric, reps int, ratio numeric, sets int, best_ever boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with since as (
    select public._period_start(p_period) as t
  ),
  mem as (
    select b.uid, coalesce(b.division, 'open') as division, b.body_kg
      from public.member_body b
     where b.body_kg is not null
       and (coalesce(p_division, 'all') = 'all' or b.division = p_division)
  ),
  lifts as (
    select 'm' || sl.uid::text as who, sl.uid, null::text as house_name, m.division, sl.machine_id,
           coalesce(sl.mode, '') as mode, sl.weight, sl.reps,
           sl.weight / coalesce(sl.body_kg, m.body_kg) as r, sl.created_at as at
      from public.set_logs sl
      join mem m on m.uid = sl.uid
     where (p_machine_id is null or (sl.machine_id = p_machine_id and coalesce(sl.mode, '') = coalesce(p_mode, '')))
    union all
    select 'h' || lower(h.name), null, h.name, h.division, h.machine_id, h.mode, h.weight, h.reps,
           h.weight / h.body_kg, (h.lifted_on + time '12:00') at time zone public.app_timezone()
      from public.house_lifts h
     where h.body_kg is not null and h.division is not null
       and (coalesce(p_division, 'all') = 'all' or h.division = p_division)
       and (p_machine_id is null or (h.machine_id = p_machine_id and h.mode = coalesce(p_mode, '')))
  ),
  per as (
    select distinct on (l.machine_id, l.mode, l.who)
           l.who, l.uid, l.house_name, l.division, l.machine_id, l.mode, l.weight, l.reps, l.r, l.at,
           count(*) over (partition by l.machine_id, l.mode, l.who)::int as n
      from lifts l, since
     where l.at >= since.t
     order by l.machine_id, l.mode, l.who, l.r desc, l.weight desc, l.reps desc, l.at
  ),
  cur as (
    select per.*, rank() over (partition by per.machine_id, per.mode order by round(per.r, 2) desc, per.reps desc) as rk
      from per
  ),
  shown as (
    select * from cur where p_limit is null or cur.rk <= p_limit
  ),
  counts as (
    select s.machine_id, s.mode, count(*)::int as k from shown s group by s.machine_id, s.mode
  ),
  ever as (
    select distinct on (l.machine_id, l.mode, l.who)
           l.who, l.uid, l.house_name, l.division, l.machine_id, l.mode, l.weight, l.reps, l.r, l.at,
           count(*) over (partition by l.machine_id, l.mode, l.who)::int as n
      from lifts l
     where coalesce(p_fill, 0) > 0
     order by l.machine_id, l.mode, l.who, l.r desc, l.weight desc, l.reps desc, l.at
  ),
  fill as (
    select e.*, row_number() over (partition by e.machine_id, e.mode order by e.r desc, e.reps desc, e.at) as fr
      from ever e
     where not exists (select 1 from cur c where c.machine_id = e.machine_id and c.mode = e.mode and c.who = e.who)
  )
  select s.machine_id, s.mode, s.division, s.rk, s.uid, s.house_name, s.weight, s.reps, round(s.r, 2), s.n, false
    from shown s
  union all
  select f.machine_id, f.mode, f.division, (coalesce(k.k, 0) + f.fr)::bigint, f.uid, f.house_name, f.weight, f.reps,
         round(f.r, 2), f.n, true
    from fill f
    left join counts k on k.machine_id = f.machine_id and k.mode = f.mode
   where coalesce(k.k, 0) + f.fr <= greatest(coalesce(p_fill, 0), 0)
     and (p_limit is null or coalesce(k.k, 0) + f.fr <= p_limit)
  order by 1, 2, 4;
$$;
revoke all on function public._bw_board(text, text, text, int, int, text) from public, anon, authenticated;

-- Every machine's Men's and Women's boards, for the TV, /join and the landing
-- page. Public: first names, ×BW and reps only (no kg, no ids).
create or replace function public.strength_boards(p_period text default 'today', p_limit int default 5, p_fill int default 3)
returns table (
  machine_id text, mode text, division text, rank bigint, name text,
  reps int, ratio numeric, sets int, best_ever boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select b.machine_id, b.mode, d.division, b.rank,
         case when b.uid is null then left(b.house_name, 16) else public._first_name(pr.display_name) end,
         b.reps, b.ratio, b.sets, b.best_ever
    from (values ('men'), ('women')) d(division)
    cross join lateral public._bw_board(null, null, p_period,
                       greatest(least(coalesce(p_limit, 5), 10), 1),
                       least(greatest(coalesce(p_fill, 3), 0), 5), d.division) b
    left join public.profiles pr on pr.id = b.uid
   where b.uid is null or pr.id is not null
   order by b.machine_id, b.mode, d.division, b.rank;
$$;
grant execute on function public.strength_boards(text, int, int) to anon, authenticated;

-- One machine's board in the app. kg only on your own row.
create or replace function public.strength_board(
  p_machine_id text, p_mode text default '', p_period text default 'all', p_division text default 'all', p_fill int default 3
)
returns table (
  machine_id text, mode text, division text, uid uuid, display_name text, avatar_url text,
  weight numeric, reps int, ratio numeric, xp int, level int, sets int, rank bigint,
  best_ever boolean, house boolean, is_me boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select b.machine_id, b.mode, b.division, b.uid,
         case when b.uid is null then b.house_name else public._public_name(pr.display_name) end,
         pr.avatar_url,
         case when b.uid = auth.uid() then b.weight end,
         b.reps, b.ratio, coalesce(ms.xp, 0), coalesce(ms.level, 1), b.sets, b.rank, b.best_ever, b.uid is null,
         coalesce(b.uid = auth.uid(), false)
    from public._bw_board(p_machine_id, coalesce(p_mode, ''), p_period, null, least(greatest(coalesce(p_fill, 3), 0), 5),
                          case when p_division in ('men', 'women') then p_division else 'all' end) b
    left join public.profiles pr on pr.id = b.uid
    left join public.machine_stats ms on ms.uid = b.uid and ms.machine_id = b.machine_id and ms.mode = b.mode
   where b.uid is null or pr.id is not null
   order by b.rank;
$$;
revoke all on function public.strength_board(text, text, text, text, int) from public, anon;
grant execute on function public.strength_board(text, text, text, text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The weekly prize: strength points, Men's and Women's races
-- ---------------------------------------------------------------------------
create or replace function public._strength_points(p_season_id bigint)
returns table (uid uuid, division text, score int, last_at timestamptz, flagged int)
language sql
stable
security definer
set search_path = public
as $$
  with w as (select starts_at, ends_at from public.seasons where id = p_season_id),
  s as (
    select sl.uid, sl.machine_id, coalesce(sl.mode, '') as mode,
           round(100 * sl.weight / coalesce(sl.body_kg, b.body_kg))::int as pts,
           sl.created_at as at, (sl.review_status is not distinct from 'flagged') as fl
      from public.set_logs sl
      join public.member_body b on b.uid = sl.uid
      cross join w
     where sl.created_at >= w.starts_at and sl.created_at < w.ends_at
       and coalesce(sl.body_kg, b.body_kg) is not null
  ),
  best as (
    select distinct on (s.uid, s.machine_id, s.mode) s.uid, s.pts, s.at
      from s where not s.fl
     order by s.uid, s.machine_id, s.mode, s.pts desc, s.at asc
  ),
  fl as (select s.uid, count(*)::int as n from s where s.fl group by s.uid)
  select bt.uid, coalesce(b.division, 'open'), sum(bt.pts)::int, max(bt.at), coalesce(max(fl.n), 0)::int
    from best bt
    join public.member_body b on b.uid = bt.uid
    left join fl on fl.uid = bt.uid
   group by bt.uid, b.division
  having sum(bt.pts) > 0;
$$;

-- Same signature as 0011, now strength points (every board together).
create or replace function public._season_scores(p_season_id bigint)
returns table (uid uuid, score int, last_at timestamptz, flagged int)
language sql
stable
security definer
set search_path = public
as $$
  select s.uid, s.score, s.last_at, s.flagged from public._strength_points(p_season_id) s;
$$;

-- Men's and Women's races. p_real_only leaves out demo accounts (awards).
create or replace function public._season_div_ranked(p_season_id bigint, p_real_only boolean default false)
returns table (division text, rank int, uid uuid, score int, flagged int)
language sql
stable
security definer
set search_path = public
as $$
  select s.division,
         (row_number() over (partition by s.division order by s.score desc, s.last_at asc nulls last, s.uid))::int,
         s.uid, s.score, s.flagged
    from public._strength_points(p_season_id) s
   where s.division in ('men', 'women')
     and (not coalesce(p_real_only, false) or not public._is_demo(s.uid));
$$;
revoke all on function public._strength_points(bigint), public._season_scores(bigint),
  public._season_div_ranked(bigint, boolean) from public, anon, authenticated;

-- Public board for one race ('men' | 'women') or everyone ('all').
create or replace function public.season_division_board(p_division text, p_season_id bigint default null, p_limit int default 10)
returns table (rank int, name text, score int, is_me boolean)
language sql
security definer
set search_path = public
as $$
  with sid as (select coalesce(p_season_id, public._ensure_current_season()) as id),
  rows as (
    select r.rank, r.uid, r.score from public._season_div_ranked((select id from sid)) r
     where p_division in ('men', 'women') and r.division = p_division
    union all
    select r.rank, r.uid, r.score from public._season_ranked((select id from sid)) r
     where coalesce(p_division, 'all') not in ('men', 'women')
  )
  select x.rank, public._first_name(p.display_name), x.score, coalesce(x.uid = auth.uid(), false)
    from rows x join public.profiles p on p.id = x.uid
   order by x.rank
   limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;
grant execute on function public.season_division_board(text, bigint, int) to anon, authenticated;

-- winners per race
alter table public.season_winners add column if not exists division text not null default 'all';
alter table public.season_winners drop constraint if exists season_winners_division_check;
alter table public.season_winners add constraint season_winners_division_check check (division in ('all', 'men', 'women'));
do $$
begin
  if exists (select 1 from pg_constraint c
              where c.conrelid = 'public.season_winners'::regclass and c.contype = 'p' and array_length(c.conkey, 1) = 2) then
    alter table public.season_winners drop constraint season_winners_pkey;
    alter table public.season_winners add constraint season_winners_pkey primary key (season_id, division, rank);
  end if;
end;
$$;

create or replace function public.admin_award_season(p_season_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.seasons;
  w record;
  v_prize public.season_prizes;
  v_red bigint;
  v_out jsonb := '[]'::jsonb;
  v_max int;
begin
  perform public._require_staff();
  select * into s from public.seasons where id = p_season_id for update;
  if not found then
    raise exception 'Season not found' using errcode = 'P0002';
  end if;
  if s.awarded_at is not null then
    raise exception 'This season''s prizes were already awarded' using errcode = 'RK110';
  end if;
  if s.ends_at > now() then
    raise exception 'This season is still running' using errcode = 'RK111';
  end if;
  select coalesce(max(rank_to), 0) into v_max from public.season_prizes where season_id = s.id;
  for w in select * from public._season_div_ranked(s.id, true) where rank <= v_max order by division, rank loop
    select * into v_prize from public.season_prizes
     where season_id = s.id and w.rank between rank_from and rank_to order by sort limit 1;
    if v_prize.id is null then
      continue;
    end if;
    insert into public.redemptions (uid, reward_id, source, title, sponsor_id, season_id, rank)
    values (w.uid, v_prize.reward_id, 'prize', v_prize.title, v_prize.sponsor_ids[1], s.id, w.rank)
    returning id into v_red;
    update public.redemptions set code = public._prize_code(v_prize.reward_id, v_red) where id = v_red;
    insert into public.season_winners (season_id, division, rank, uid, score, prize_id, redemption_id)
    values (s.id, w.division, w.rank, w.uid, w.score, v_prize.id, v_red);
    if w.rank <= 3 then
      insert into public.xp_ledger (uid, amount, kind, ref, title)
      select w.uid, b.xp, 'badge', 'badge:podium', b.title from public._badge_defs() b where b.id = 'podium'
      on conflict (uid, kind, ref) do nothing;
    end if;
    v_out := v_out || jsonb_build_object('division', w.division, 'rank', w.rank, 'uid', w.uid, 'score', w.score, 'prize', v_prize.title);
    v_prize := null;
  end loop;
  update public.seasons set awarded_at = now(), awarded_by = auth.uid() where id = s.id;
  perform public._log_staff_action('award_season', null, null, s.title || ': ' || jsonb_array_length(v_out) || ' prizes awarded');
  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Challenges by ×BW, Men's and Women's winners
-- ---------------------------------------------------------------------------
-- Each person's entry: best lift = best ×BW (kg ÷ body weight on the day),
-- volume = sum of kg × reps ÷ body weight, sets = number of sets.
create or replace function public._challenge_entries(p_id bigint)
returns table (uid uuid, division text, value numeric, reps int, weight numeric, at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  with c as (select * from public.challenges where id = p_id),
  s as (
    select sl.uid, coalesce(b.division, 'open') as division, sl.weight, sl.reps, sl.created_at,
           coalesce(sl.body_kg, b.body_kg) as bw
      from public.set_logs sl
      left join public.member_body b on b.uid = sl.uid
      cross join c
     where sl.created_at >= c.starts_at and sl.created_at < c.ends_at
       and sl.review_status is distinct from 'flagged'
       and (c.machine_id is null or sl.machine_id = c.machine_id)
       and (c.mode is null or sl.mode = c.mode)
  ),
  best as (
    select distinct on (s.uid) s.uid, s.division, round(s.weight / s.bw, 2) as value, s.reps, s.weight, s.created_at as at
      from s where s.bw is not null
     order by s.uid, s.weight / s.bw desc, s.reps desc, s.created_at asc
  ),
  agg as (
    select s.uid, s.division,
           case (select metric from c) when 'sets' then count(*)::numeric
                else round(sum(s.weight * s.reps / s.bw), 1) end as value,
           null::int as reps, null::numeric as weight, max(s.created_at) as at
      from s
     where (select metric from c) = 'sets' or s.bw is not null
     group by s.uid, s.division
  )
  select * from best where (select metric from c) = 'best_lift'
  union all
  select * from agg where (select metric from c) <> 'best_lift';
$$;

-- Same signature as 0011: everyone together.
create or replace function public._challenge_scores(p_id bigint)
returns table (rank int, uid uuid, value numeric, reps int)
language sql
stable
security definer
set search_path = public
as $$
  select (row_number() over (order by e.value desc, e.reps desc nulls last, e.at asc, e.uid))::int, e.uid, e.value, e.reps
    from public._challenge_entries(p_id) e;
$$;

create or replace function public._challenge_div_scores(p_id bigint, p_real_only boolean default false)
returns table (division text, rank int, uid uuid, value numeric, reps int, weight numeric)
language sql
stable
security definer
set search_path = public
as $$
  select e.division,
         (row_number() over (partition by e.division order by e.value desc, e.reps desc nulls last, e.at asc, e.uid))::int,
         e.uid, e.value, e.reps, e.weight
    from public._challenge_entries(p_id) e
   where e.division in ('men', 'women')
     and (not coalesce(p_real_only, false) or not public._is_demo(e.uid));
$$;
revoke all on function public._challenge_entries(bigint), public._challenge_scores(bigint),
  public._challenge_div_scores(bigint, boolean) from public, anon, authenticated;

create or replace function public.challenge_division_board(p_id bigint, p_division text default 'all', p_limit int default 10)
returns table (rank int, name text, value numeric, reps int, is_me boolean)
language sql
security definer
set search_path = public
as $$
  with rows as (
    select r.rank, r.uid, r.value, r.reps from public._challenge_div_scores(p_id) r
     where p_division in ('men', 'women') and r.division = p_division
    union all
    select r.rank, r.uid, r.value, r.reps from public._challenge_scores(p_id) r
     where coalesce(p_division, 'all') not in ('men', 'women')
  )
  select x.rank, public._first_name(p.display_name), x.value, x.reps, coalesce(x.uid = auth.uid(), false)
    from rows x
    join public.profiles p on p.id = x.uid
    join public.challenges c on c.id = p_id and (c.active or public.is_staff())
   order by x.rank
   limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;
grant execute on function public.challenge_division_board(bigint, text, int) to anon, authenticated;

create or replace function public.admin_award_challenge(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.challenges;
  w record;
  v_red bigint;
  v_out jsonb := '[]'::jsonb;
begin
  perform public._require_staff();
  select * into c from public.challenges where id = p_id for update;
  if not found then
    raise exception 'Challenge not found' using errcode = 'P0002';
  end if;
  if c.awarded_at is not null then
    raise exception 'Already awarded' using errcode = 'RK110';
  end if;
  if c.ends_at > now() then
    raise exception 'This challenge is still running' using errcode = 'RK111';
  end if;
  for w in select * from public._challenge_div_scores(c.id, true) where rank <= c.winners order by division, rank loop
    insert into public.redemptions (uid, reward_id, source, title, sponsor_id, challenge_id, rank)
    values (w.uid, c.reward_id, 'challenge', coalesce(c.prize, c.title), c.sponsor_id, c.id, w.rank)
    returning id into v_red;
    update public.redemptions set code = public._prize_code(c.reward_id, v_red) where id = v_red;
    v_out := v_out || jsonb_build_object('division', w.division, 'rank', w.rank, 'uid', w.uid, 'value', w.value);
  end loop;
  update public.challenges set awarded_at = now() where id = c.id;
  perform public._log_staff_action('award_challenge', null, c.machine_id, c.title || ': ' || jsonb_array_length(v_out) || ' winner(s)');
  return v_out;
end;
$$;

-- small helpers for the JSON below
create or replace function public._div_leaders(p_season_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'men', (select jsonb_build_object('name', public._first_name(p.display_name), 'score', r.score)
              from public._season_div_ranked(p_season_id) r join public.profiles p on p.id = r.uid
             where r.division = 'men' and r.rank = 1),
    'women', (select jsonb_build_object('name', public._first_name(p.display_name), 'score', r.score)
                from public._season_div_ranked(p_season_id) r join public.profiles p on p.id = r.uid
               where r.division = 'women' and r.rank = 1));
$$;

create or replace function public._challenge_leaders(p_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'men', (select jsonb_build_object('name', public._first_name(p.display_name), 'value', x.value, 'reps', x.reps)
              from public._challenge_div_scores(p_id) x join public.profiles p on p.id = x.uid
             where x.division = 'men' and x.rank = 1),
    'women', (select jsonb_build_object('name', public._first_name(p.display_name), 'value', x.value, 'reps', x.reps)
                from public._challenge_div_scores(p_id) x join public.profiles p on p.id = x.uid
               where x.division = 'women' and x.rank = 1));
$$;
revoke all on function public._div_leaders(bigint), public._challenge_leaders(bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. The Rewards page, your rewards, R&R Controls and the TV: + Men's and
--    Women's races (the older keys stay for apps that haven't updated yet)
-- ---------------------------------------------------------------------------
create or replace function public.rewards_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season bigint := public._ensure_current_season();
  v_last bigint;
  v_tz text := public.app_timezone();
begin
  perform public._ensure_challenge_rounds();
  select id into v_last from public.seasons where awarded_at is not null order by ends_at desc limit 1;
  return jsonb_build_object(
    'period', (select season_period from public.rewards_settings where id = 1),
    'scoring', 'strength',
    'settings', (select to_jsonb(r) - 'updated_by' from public.rr_settings r where id = 1),
    'season', (
      select jsonb_build_object(
        'id', s.id, 'title', s.title, 'period', s.period, 'starts_at', s.starts_at, 'ends_at', s.ends_at,
        'prizes', coalesce((
          select jsonb_agg(jsonb_build_object('id', p.id, 'rank_from', p.rank_from, 'rank_to', p.rank_to, 'title', p.title,
                                              'description', p.description, 'sponsor_ids', to_jsonb(p.sponsor_ids),
                                              'image_url', p.image_url)
                           order by p.rank_from, p.sort)
            from public.season_prizes p where p.season_id = s.id), '[]'::jsonb),
        'players', (select count(*) from public._season_scores(s.id)),
        'leader', (select jsonb_build_object('name', public._first_name(pr.display_name), 'score', r.score)
                     from public._season_ranked(s.id) r join public.profiles pr on pr.id = r.uid where r.rank = 1),
        'leaders', public._div_leaders(s.id),
        'players_by', (select jsonb_build_object(
                          'men', count(*) filter (where x.division = 'men'),
                          'women', count(*) filter (where x.division = 'women'))
                         from public._strength_points(s.id) x)
      ) from public.seasons s where s.id = v_season),
    'sponsors', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', sp.id, 'name', sp.name, 'tagline', sp.tagline, 'blurb', sp.blurb, 'website_url', sp.website_url,
               'instagram_url', sp.instagram_url, 'logo_url', sp.logo_url, 'cover_url', sp.cover_url, 'category', sp.category,
               'products', coalesce((
                 select jsonb_agg(jsonb_build_object('id', pr.id, 'title', pr.title, 'subtitle', pr.subtitle,
                                                     'price_text', pr.price_text, 'image_url', pr.image_url, 'url', pr.url)
                                  order by pr.sort, pr.id)
                   from public.sponsor_products pr where pr.sponsor_id = sp.id and pr.active), '[]'::jsonb))
             order by sp.sort, sp.name)
        from public.sponsors sp where sp.active), '[]'::jsonb),
    'shop', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'sponsor_id', r.sponsor_id, 'title', r.title, 'description', r.description,
               'image_url', r.image_url, 'xp_cost', r.xp_cost, 'code_mode', r.code_mode,
               'stock_left', case when r.stock is null then null
                                  else greatest(r.stock - (select count(*) from public.redemptions d
                                                            where d.reward_id = r.id and d.status <> 'cancelled'), 0) end,
               'per_member_limit', r.per_member_limit, 'valid_until', r.valid_until)
             order by r.sort, r.xp_cost)
        from public.rewards r
       where r.active and r.xp_cost is not null and (r.valid_until is null or r.valid_until > now())), '[]'::jsonb),
    'challenges', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'sponsor_id', c.sponsor_id, 'title', c.title, 'description', c.description, 'metric', c.metric,
               'machine_id', c.machine_id, 'mode', c.mode, 'starts_at', c.starts_at, 'ends_at', c.ends_at,
               'prize', c.prize, 'winners', c.winners, 'join_xp', c.join_xp,
               'series_id', c.series_id,
               'repeats', case when c.series_id is not null then 'weekly' end,
               'weekday', extract(isodow from c.starts_at at time zone v_tz)::int,
               'players', (select count(*) from public._challenge_scores(c.id)),
               'leader', (select jsonb_build_object('name', public._first_name(p.display_name), 'value', x.value, 'reps', x.reps)
                            from public._challenge_scores(c.id) x join public.profiles p on p.id = x.uid where x.rank = 1),
               'leaders', public._challenge_leaders(c.id),
               'last_result', case when c.series_id is null then null else (
                 select jsonb_build_object('ends_at', prev.ends_at, 'name', public._first_name(p.display_name), 'value', x.value, 'reps', x.reps,
                                           'winners', public._challenge_leaders(prev.id))
                   from public.challenges prev
                   join lateral public._challenge_scores(prev.id) x on x.rank = 1
                   join public.profiles p on p.id = x.uid
                  where prev.series_id = c.series_id and prev.ends_at <= now()
                  order by prev.ends_at desc limit 1) end)
             order by c.starts_at)
        from public.challenges c
       where c.active
         and c.ends_at > now() - interval '2 days'
         and c.starts_at < now() + interval '14 days'
         -- a weekly challenge shows one round: the one running now, else the next
         and (c.series_id is null or (c.ends_at > now() and not exists (
               select 1 from public.challenges n
                where n.series_id = c.series_id and n.active and n.ends_at > now() and n.starts_at < c.starts_at)))
    ), '[]'::jsonb),
    'missions', (select jsonb_agg(to_jsonb(m) order by m.sort) from public._mission_defs() m),
    'badges', (select jsonb_agg(to_jsonb(b) order by b.sort) from public._badge_defs() b),
    'streak_steps', (select jsonb_agg(to_jsonb(t) order by t.days) from public._streak_steps() t),
    'last_winners', case when v_last is null then null else jsonb_build_object(
      'season', (select title from public.seasons where id = v_last),
      'winners', coalesce((
        select jsonb_agg(jsonb_build_object('rank', w.rank, 'name', public._first_name(p.display_name), 'score', w.score,
                                            'prize', sp.title, 'division', w.division) order by w.division, w.rank)
          from public.season_winners w
          join public.profiles p on p.id = w.uid
          left join public.season_prizes sp on sp.id = w.prize_id
         where w.season_id = v_last and w.rank <= 10), '[]'::jsonb),
      'scoring', case when exists (select 1 from public.season_winners w where w.season_id = v_last and w.division <> 'all')
                      then 'strength' else 'xp' end) end
  );
end;
$$;
grant execute on function public.rewards_overview() to anon, authenticated;

create or replace function public.my_rewards()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_week timestamptz := public._rk_week_start();
  v_wk text := to_char(public._rk_week_start() at time zone public.app_timezone(), 'YYYY-MM-DD');
  v_season bigint := public._ensure_current_season();
  x record;
  w record;
  v_streak int;
  v_started date;
  v_rank int;
  v_score int;
  v_ahead jsonb;
  v_body public.member_body;
  v_div text;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  select * into x from public._xp_parts(v_uid);
  select * into w from public._window_metrics(v_uid, v_week, now() + interval '1 minute');
  select days, started into v_streak, v_started from public._lift_streak(v_uid);
  select * into v_body from public.member_body where uid = v_uid;
  v_div := case when v_body.body_kg is not null and v_body.division in ('men', 'women') then v_body.division end;
  if v_div is not null then
    select r.rank, r.score into v_rank, v_score from public._season_div_ranked(v_season) r where r.uid = v_uid and r.division = v_div;
    if v_rank is not null and v_rank > 1 then
      select jsonb_build_object('name', public._first_name(p.display_name), 'score', r.score)
        into v_ahead
        from public._season_div_ranked(v_season) r join public.profiles p on p.id = r.uid
       where r.division = v_div and r.rank = v_rank - 1;
    end if;
  else
    select s.score into v_score from public._strength_points(v_season) s where s.uid = v_uid;
  end if;

  return jsonb_build_object(
    'wallet', jsonb_build_object(
      'training', x.training, 'bonus', x.bonus, 'spent', x.spent, 'on_hold', x.on_hold,
      'lifetime', x.training + x.bonus, 'balance', x.training + x.bonus - x.spent),
    'season', (
      select jsonb_build_object('id', s.id, 'title', s.title, 'period', s.period, 'ends_at', s.ends_at,
                                'rank', v_rank, 'score', coalesce(v_score, 0), 'ahead', v_ahead,
                                'division', v_div, 'scoring', 'strength',
                                'players', case when v_div is null then (select count(*) from public._season_scores(s.id))
                                                else (select count(*) from public._strength_points(s.id) zz where zz.division = v_div) end,
                                'top_prize', (select p.title from public.season_prizes p where p.season_id = s.id order by p.rank_from, p.sort limit 1))
        from public.seasons s where s.id = v_season),
    'body', public._body_json(v_body),
    'week', jsonb_build_object('sets', w.sets, 'days', w.days, 'machines', w.machines, 'pbs', w.pbs, 'volume', w.volume),
    'missions_done', coalesce((
      select jsonb_agg(split_part(ref, ':', 3)) from public.xp_ledger
       where uid = v_uid and kind = 'mission' and ref like 'mission:' || v_wk || ':%'), '[]'::jsonb),
    'streak', jsonb_build_object('days', coalesce(v_streak, 0), 'started', v_started,
      'claimed', coalesce((
        select jsonb_agg(split_part(ref, ':', 3)::int) from public.xp_ledger
         where uid = v_uid and kind = 'streak' and v_started is not null and ref like 'streak:' || v_started || ':%'), '[]'::jsonb)),
    'badges', coalesce((
      select jsonb_agg(jsonb_build_object('id', substr(ref, 7), 'at', created_at) order by created_at)
        from public.xp_ledger where uid = v_uid and kind = 'badge'), '[]'::jsonb),
    'redemptions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.id, 'title', d.title, 'sponsor_id', d.sponsor_id, 'source', d.source, 'code', d.code,
               'code_mode', coalesce(r.code_mode, 'desk'), 'how_to_use', r.how_to_use, 'xp_spent', d.xp_spent,
               'status', d.status, 'rank', d.rank, 'created_at', d.created_at) order by d.created_at desc)
        from (select * from public.redemptions where uid = v_uid order by created_at desc limit 30) d
        left join public.rewards r on r.id = d.reward_id), '[]'::jsonb),
    'claimed_rewards', coalesce((
      select jsonb_object_agg(reward_id::text, n) from (
        select reward_id, count(*) as n from public.redemptions
         where uid = v_uid and source = 'shop' and status <> 'cancelled' and reward_id is not null
         group by reward_id) q), '{}'::jsonb),
    'challenges', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'rank', s.rank, 'value', s.value, 'reps', s.reps, 'division', s.division))
        from public.challenges c
        join lateral (select z.rank, z.value, z.reps, z.division from public._challenge_div_scores(c.id) z where z.uid = v_uid
                      union all
                      select z.rank, z.value, z.reps, 'all' from public._challenge_scores(c.id) z
                       where z.uid = v_uid and v_div is null
                      limit 1) s on true
       where c.active and c.ends_at > now() - interval '2 days'), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object('kind', kind, 'title', title, 'amount', amount, 'at', created_at) order by created_at desc)
        from (select * from public.xp_ledger where uid = v_uid order by created_at desc limit 12) q), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.my_rewards() from public, anon;
grant execute on function public.my_rewards() to authenticated;

create or replace function public.admin_rewards_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season bigint;
begin
  perform public._require_staff();
  v_season := public._ensure_current_season();
  return jsonb_build_object(
    'period', (select season_period from public.rewards_settings where id = 1),
    'season', (select to_jsonb(s) from public.seasons s where s.id = v_season),
    'season_prizes', coalesce((select jsonb_agg(to_jsonb(p) order by p.rank_from, p.sort) from public.season_prizes p where p.season_id = v_season), '[]'::jsonb),
    'templates', coalesce((select jsonb_agg(to_jsonb(t) order by t.rank_from, t.sort) from public.prize_templates t), '[]'::jsonb),
    'scoring', 'strength',
    'live_boards', jsonb_build_object(
      'men', coalesce((
        select jsonb_agg(jsonb_build_object('rank', r.rank, 'name', public._public_name(p.display_name), 'score', r.score, 'flagged', r.flagged,
                                            'demo', public._is_demo(r.uid)) order by r.rank)
          from public._season_div_ranked(v_season) r join public.profiles p on p.id = r.uid where r.division = 'men' and r.rank <= 10), '[]'::jsonb),
      'women', coalesce((
        select jsonb_agg(jsonb_build_object('rank', r.rank, 'name', public._public_name(p.display_name), 'score', r.score, 'flagged', r.flagged,
                                            'demo', public._is_demo(r.uid)) order by r.rank)
          from public._season_div_ranked(v_season) r join public.profiles p on p.id = r.uid where r.division = 'women' and r.rank <= 10), '[]'::jsonb)),
    'live_board', coalesce((
      select jsonb_agg(jsonb_build_object('rank', r.rank, 'name', public._public_name(p.display_name), 'score', r.score, 'flagged', r.flagged) order by r.rank)
        from public._season_ranked(v_season) r join public.profiles p on p.id = r.uid where r.rank <= 10), '[]'::jsonb),
    'to_award', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'title', s.title, 'ends_at', s.ends_at,
               'boards', (
                 select jsonb_object_agg(d.division, coalesce((
                          select jsonb_agg(jsonb_build_object(
                                   'rank', r.rank, 'uid', r.uid, 'name', public._public_name(p.display_name), 'score', r.score, 'flagged', r.flagged,
                                   'body_kg', mb.body_kg, 'checked_at', mb.checked_at,
                                   'prize', (select sp.title from public.season_prizes sp
                                              where sp.season_id = s.id and r.rank between sp.rank_from and sp.rank_to
                                              order by sp.sort limit 1)) order by r.rank)
                            from public._season_div_ranked(s.id, true) r
                            join public.profiles p on p.id = r.uid
                            left join public.member_body mb on mb.uid = r.uid
                           where r.division = d.division
                             and r.rank <= greatest(3, coalesce((select max(rank_to) from public.season_prizes where season_id = s.id), 3))), '[]'::jsonb))
                   from (values ('men'), ('women')) d(division)),
               'board', coalesce((
                 select jsonb_agg(jsonb_build_object('rank', r.rank, 'name', public._public_name(p.display_name), 'score', r.score, 'flagged', r.flagged,
                                                     'prize', (select sp.title from public.season_prizes sp
                                                                where sp.season_id = s.id and r.rank between sp.rank_from and sp.rank_to
                                                                order by sp.sort limit 1)) order by r.rank)
                   from public._season_ranked(s.id) r join public.profiles p on p.id = r.uid
                  where r.rank <= greatest(3, coalesce((select max(rank_to) from public.season_prizes where season_id = s.id), 3))), '[]'::jsonb))
             order by s.ends_at desc)
        from public.seasons s
       where s.awarded_at is null and s.ends_at <= now()
         and exists (select 1 from public._season_scores(s.id))   -- skip weeks nobody trained
         and s.ends_at > now() - interval '120 days'), '[]'::jsonb),
    'seasons', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'period', s.period, 'starts_at', s.starts_at, 'ends_at', s.ends_at,
                                          'awarded_at', s.awarded_at,
                                          'winners', coalesce((select jsonb_agg(jsonb_build_object('rank', w.rank, 'name', public._public_name(p.display_name), 'score', w.score, 'division', w.division) order by w.division, w.rank)
                                                               from public.season_winners w join public.profiles p on p.id = w.uid where w.season_id = s.id), '[]'::jsonb))
             order by s.starts_at desc)
        from (select * from public.seasons order by starts_at desc limit 8) s), '[]'::jsonb),
    'rewards', coalesce((
      select jsonb_agg(to_jsonb(r) || jsonb_build_object(
               'issued', (select count(*) from public.redemptions d where d.reward_id = r.id and d.status <> 'cancelled'),
               'codes_left', (select count(*) from public.reward_codes c where c.reward_id = r.id and not c.shared and c.redemption_id is null),
               'shared_code', (select c.code from public.reward_codes c where c.reward_id = r.id and c.shared order by c.id desc limit 1))
             order by r.active desc, r.sort, r.id)
        from public.rewards r), '[]'::jsonb),
    'challenges', coalesce((
      select jsonb_agg(to_jsonb(c) || jsonb_build_object(
               'players', (select count(*) from public._challenge_scores(c.id)),
               'top', coalesce((select jsonb_agg(jsonb_build_object('rank', x.rank, 'name', public._public_name(p.display_name), 'value', x.value, 'reps', x.reps) order by x.rank)
                                  from public._challenge_scores(c.id) x join public.profiles p on p.id = x.uid where x.rank <= 5), '[]'::jsonb))
             order by c.ends_at desc)
        from public.challenges c), '[]'::jsonb),
    'sponsors', coalesce((
      select jsonb_agg(to_jsonb(sp) || jsonb_build_object(
               'products', coalesce((select jsonb_agg(to_jsonb(pr) order by pr.sort, pr.id) from public.sponsor_products pr where pr.sponsor_id = sp.id), '[]'::jsonb),
               'clicks_7d', (select count(*) from public.sponsor_clicks k where k.sponsor_id = sp.id and k.created_at > now() - interval '7 days'),
               'clicks_30d', (select count(*) from public.sponsor_clicks k where k.sponsor_id = sp.id and k.created_at > now() - interval '30 days'),
               'redeemed_30d', (select count(*) from public.redemptions d where d.sponsor_id = sp.id and d.status <> 'cancelled' and d.created_at > now() - interval '30 days'))
             order by sp.sort, sp.name)
        from public.sponsors sp), '[]'::jsonb),
    'redemptions', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'code', d.code, 'source', d.source, 'status', d.status,
                                          'rank', d.rank, 'xp_spent', d.xp_spent, 'created_at', d.created_at, 'fulfilled_at', d.fulfilled_at,
                                          'member', public._public_name(p.display_name), 'sponsor_id', d.sponsor_id) order by (d.status = 'issued') desc, d.created_at desc)
        from (select * from public.redemptions order by created_at desc limit 80) d
        join public.profiles p on p.id = d.uid), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_rr_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_staff();
  perform public._ensure_challenge_rounds();
  return public.admin_rewards_data() || jsonb_build_object(
    'settings', (select to_jsonb(r) from public.rr_settings r where id = 1),
    'series', coalesce((
      select jsonb_agg(public._series_json(s) || jsonb_build_object(
               'next', (select jsonb_build_object('id', c.id, 'starts_at', c.starts_at, 'ends_at', c.ends_at,
                                                  'players', (select count(*) from public._challenge_scores(c.id)))
                          from public.challenges c where c.series_id = s.id and c.ends_at > now() order by c.starts_at limit 1))
             order by s.active desc, s.id)
        from public.challenge_series s), '[]'::jsonb),
    'challenges', coalesce((
      select jsonb_agg(to_jsonb(c) || jsonb_build_object(
               'players', (select count(*) from public._challenge_scores(c.id)),
               'top', coalesce((select jsonb_agg(jsonb_build_object('rank', x.rank, 'name', public._public_name(p.display_name), 'value', x.value, 'reps', x.reps) order by x.rank)
                                  from public._challenge_scores(c.id) x join public.profiles p on p.id = x.uid where x.rank <= 5), '[]'::jsonb),
               'tops', (select jsonb_object_agg(d.division, coalesce((
                          select jsonb_agg(jsonb_build_object('rank', x.rank, 'name', public._public_name(p.display_name), 'value', x.value, 'reps', x.reps,
                                                              'weight', x.weight, 'demo', public._is_demo(x.uid)) order by x.rank)
                            from public._challenge_div_scores(c.id) x join public.profiles p on p.id = x.uid
                           where x.division = d.division and x.rank <= 5), '[]'::jsonb))
                          from (values ('men'), ('women')) d(division)))
             order by c.ends_at desc)
        from public.challenges c
       where c.series_id is null or c.ends_at > now() - interval '56 days'), '[]'::jsonb),
    'tv_scans_30d', coalesce((
      select jsonb_object_agg(k.sponsor_id, k.n)
        from (select sponsor_id, count(*)::int as n from public.sponsor_clicks
               where source = 'tv' and created_at > now() - interval '30 days' group by sponsor_id) k), '{}'::jsonb)
  );
end;
$$;
revoke all on function public.admin_rr_data() from public, anon;
grant execute on function public.admin_rr_data() to authenticated;

create or replace function public.tv_feed()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ov jsonb := public.rewards_overview();
  v_season bigint := nullif(v_ov #>> '{season,id}', '')::bigint;
begin
  return v_ov || jsonb_build_object(
    'tv_slides', (select public._tv_slides_clean(tv_slides, '{}'::jsonb) from public.rr_settings where id = 1),
    'tv_partners', coalesce((
      select jsonb_agg(jsonb_build_object('id', sp.id, 'tv_headline', sp.tv_headline) order by sp.sort, sp.name)
        from public.sponsors sp where sp.active and sp.show_on_tv), '[]'::jsonb),
    'season_top', case when v_season is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('rank', b.rank, 'name', b.name, 'score', b.score) order by b.rank)
        from public.season_board(v_season, 5) b), '[]'::jsonb) end,
    'season_tops', case when v_season is null then null else jsonb_build_object(
      'men', coalesce((select jsonb_agg(jsonb_build_object('rank', b.rank, 'name', b.name, 'score', b.score) order by b.rank)
                         from public.season_division_board('men', v_season, 5) b), '[]'::jsonb),
      'women', coalesce((select jsonb_agg(jsonb_build_object('rank', b.rank, 'name', b.name, 'score', b.score) order by b.rank)
                           from public.season_division_board('women', v_season, 5) b), '[]'::jsonb)) end
  );
end;
$$;
grant execute on function public.tv_feed() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Who can call what
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array['my_body()', 'set_my_body(text, numeric)', 'admin_member_body(uuid)', 'admin_set_member_body(uuid, numeric, text)',
                           'admin_save_house_lift(jsonb)', 'admin_house_lifts()', 'admin_award_season(bigint)', 'admin_award_challenge(bigint)',
                           'admin_rewards_data()'] loop
    execute 'revoke all on function public.' || f || ' from public, anon';
    execute 'grant execute on function public.' || f || ' to authenticated';
  end loop;
end;
$$;
