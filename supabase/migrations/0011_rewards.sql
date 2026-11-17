-- ============================================================================
-- 0011_rewards.sql
--
-- The Rewards tab: games that keep members coming back, and a place for
-- sponsors to be seen.
--
--   1. XP wallet. Every set already earns XP. Now missions, streaks, badges
--      and challenges add bonus XP, and members can SPEND XP in the XP shop.
--      Levels use lifetime XP, so spending never lowers a level.
--      XP from sets still waiting for staff review (flagged) is "on hold":
--      it can't be spent and doesn't count towards prizes until approved.
--   2. Weekly missions (reset every Monday, gym time), lifting-streak
--      bonuses and badges. All are worked out here from real logged sets --
--      never from the attendance calendar, which members can tick by hand.
--   3. Seasons with sponsor prizes. Weekly to start; staff can switch to
--      monthly. A season's score = all XP earned in it (sets + missions +
--      streaks + badges + challenges), flagged sets excluded. Staff award the
--      winners when a season ends.
--   4. Sponsor challenges (e.g. heaviest Leg Press this week).
--   5. The XP shop: vouchers and products from sponsors. A code is either
--      one shared code, one unique code each from a pool, or a claim code
--      shown at the front desk.
--   6. Sponsors and their products, shown on the Rewards page, with clicks
--      counted for sponsor reports.
--
-- New shop items and the sample challenge start switched OFF (drafts):
-- staff switch them on in Staff -> Rewards once the brands confirm.
-- Safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Small helpers
-- ---------------------------------------------------------------------------
create or replace function public._first_name(p_name text)
returns text
language sql
immutable
as $$
  -- "Asha Rao" -> "Asha"; "asha.rao99@gmail.com" -> "Asha"; never the email
  select left(initcap(coalesce(nullif(
           case when strpos(n, '@') > 0 then (regexp_split_to_array(split_part(n, '@', 1), '[._+0-9-]+'))[1]
                else split_part(n, ' ', 1) end, ''), 'Lifter')), 14)
    from (select trim(coalesce(p_name, '')) as n) x;
$$;

-- Monday 00:00 this week on the gym's clock.
create or replace function public._rk_week_start()
returns timestamptz
language sql
stable
as $$
  select date_trunc('week', now() at time zone public.app_timezone()) at time zone public.app_timezone();
$$;

create or replace function public._claim_code()
returns text
language sql
volatile
as $$
  select 'RK-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
$$;

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
create table if not exists public.rewards_settings (
  id int primary key default 1 check (id = 1),
  season_period text not null default 'week' check (season_period in ('week', 'month')),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
insert into public.rewards_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.sponsors (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  name text not null check (char_length(name) between 1 and 60),
  tagline text,
  blurb text,
  website_url text,
  instagram_url text,
  logo_url text,
  category text,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.sponsor_products (
  id bigint generated always as identity primary key,
  sponsor_id text not null references public.sponsors (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  subtitle text,
  price_text text,
  image_url text,
  url text,
  active boolean not null default true,
  sort int not null default 0
);
create index if not exists sponsor_products_sponsor_idx on public.sponsor_products (sponsor_id, sort);

create table if not exists public.rewards (
  id bigint generated always as identity primary key,
  sponsor_id text references public.sponsors (id) on delete set null,
  title text not null check (char_length(title) between 1 and 80),
  description text,
  how_to_use text,
  image_url text,
  -- null = not sold in the XP shop (prize-only)
  xp_cost int check (xp_cost is null or xp_cost between 1 and 1000000),
  -- shared: one code for everyone; pool: one unique code each; desk: a claim
  -- code the member shows at the front desk
  code_mode text not null default 'desk' check (code_mode in ('shared', 'pool', 'desk')),
  stock int check (stock is null or stock >= 0),
  per_member_limit int not null default 1 check (per_member_limit between 1 and 100),
  valid_until timestamptz,
  active boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.reward_codes (
  id bigint generated always as identity primary key,
  reward_id bigint not null references public.rewards (id) on delete cascade,
  code text not null check (char_length(code) between 1 and 60),
  shared boolean not null default false,
  redemption_id bigint,
  created_at timestamptz not null default now()
);
create index if not exists reward_codes_free_idx on public.reward_codes (reward_id, id) where redemption_id is null;

create table if not exists public.seasons (
  id bigint generated always as identity primary key,
  period text not null check (period in ('week', 'month')),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  title text not null,
  awarded_at timestamptz,
  awarded_by uuid references public.profiles (id) on delete set null,
  unique (starts_at, period)
);

-- The prizes every new season starts with (staff edit these once).
create table if not exists public.prize_templates (
  id bigint generated always as identity primary key,
  rank_from int not null check (rank_from >= 1),
  rank_to int not null check (rank_to >= rank_from and rank_to <= 50),
  title text not null check (char_length(title) between 1 and 90),
  description text,
  sponsor_ids text[] not null default '{}',
  reward_id bigint references public.rewards (id) on delete set null,
  sort int not null default 0
);

create table if not exists public.season_prizes (
  id bigint generated always as identity primary key,
  season_id bigint not null references public.seasons (id) on delete cascade,
  rank_from int not null check (rank_from >= 1),
  rank_to int not null check (rank_to >= rank_from and rank_to <= 50),
  title text not null,
  description text,
  sponsor_ids text[] not null default '{}',
  reward_id bigint references public.rewards (id) on delete set null,
  sort int not null default 0
);

create table if not exists public.challenges (
  id bigint generated always as identity primary key,
  sponsor_id text references public.sponsors (id) on delete set null,
  title text not null check (char_length(title) between 1 and 80),
  description text,
  metric text not null check (metric in ('best_lift', 'sets', 'volume')),
  machine_id text,
  mode text,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  prize text,
  reward_id bigint references public.rewards (id) on delete set null,
  winners int not null default 1 check (winners between 1 and 20),
  join_xp int not null default 20 check (join_xp between 0 and 500),
  active boolean not null default false,
  awarded_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.redemptions (
  id bigint generated always as identity primary key,
  uid uuid not null references public.profiles (id) on delete cascade,
  reward_id bigint references public.rewards (id) on delete set null,
  source text not null check (source in ('shop', 'prize', 'challenge')),
  xp_spent int not null default 0,
  code text,
  title text not null,
  sponsor_id text references public.sponsors (id) on delete set null,
  season_id bigint references public.seasons (id) on delete set null,
  challenge_id bigint references public.challenges (id) on delete set null,
  rank int,
  status text not null default 'issued' check (status in ('issued', 'fulfilled', 'cancelled')),
  created_at timestamptz not null default now(),
  fulfilled_at timestamptz,
  fulfilled_by uuid references public.profiles (id) on delete set null
);
create index if not exists redemptions_uid_idx on public.redemptions (uid, created_at desc);
create index if not exists redemptions_reward_idx on public.redemptions (reward_id) where status <> 'cancelled';

create table if not exists public.season_winners (
  season_id bigint not null references public.seasons (id) on delete cascade,
  rank int not null,
  uid uuid not null references public.profiles (id) on delete cascade,
  score int not null,
  prize_id bigint references public.season_prizes (id) on delete set null,
  redemption_id bigint references public.redemptions (id) on delete set null,
  primary key (season_id, rank)
);

-- Every bonus XP award and every XP spend. (Set XP stays on set_logs.)
create table if not exists public.xp_ledger (
  id bigint generated always as identity primary key,
  uid uuid not null references public.profiles (id) on delete cascade,
  amount int not null check (amount <> 0),
  kind text not null check (kind in ('mission', 'streak', 'badge', 'challenge', 'bonus', 'redeem', 'refund')),
  ref text not null,
  title text,
  created_at timestamptz not null default now(),
  unique (uid, kind, ref)
);
create index if not exists xp_ledger_time_idx on public.xp_ledger (created_at);

create table if not exists public.sponsor_clicks (
  id bigint generated always as identity primary key,
  sponsor_id text not null references public.sponsors (id) on delete cascade,
  product_id bigint references public.sponsor_products (id) on delete set null,
  uid uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists sponsor_clicks_idx on public.sponsor_clicks (sponsor_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Row-level security: public catalogue is readable, everything personal
--    is own-rows only, codes are staff-only. Nobody writes directly: the
--    functions below do all writes.
-- ---------------------------------------------------------------------------
alter table public.rewards_settings enable row level security;
alter table public.sponsors enable row level security;
alter table public.sponsor_products enable row level security;
alter table public.rewards enable row level security;
alter table public.reward_codes enable row level security;
alter table public.seasons enable row level security;
alter table public.prize_templates enable row level security;
alter table public.season_prizes enable row level security;
alter table public.challenges enable row level security;
alter table public.redemptions enable row level security;
alter table public.season_winners enable row level security;
alter table public.xp_ledger enable row level security;
alter table public.sponsor_clicks enable row level security;

drop policy if exists "read rewards settings" on public.rewards_settings;
create policy "read rewards settings" on public.rewards_settings for select to anon, authenticated using (true);
drop policy if exists "read active sponsors" on public.sponsors;
create policy "read active sponsors" on public.sponsors for select to anon, authenticated using (active or public.is_staff());
drop policy if exists "read active products" on public.sponsor_products;
create policy "read active products" on public.sponsor_products for select to anon, authenticated using (active or public.is_staff());
drop policy if exists "read active rewards" on public.rewards;
create policy "read active rewards" on public.rewards for select to anon, authenticated using (active or public.is_staff());
drop policy if exists "staff read codes" on public.reward_codes;
create policy "staff read codes" on public.reward_codes for select to authenticated using (public.is_staff());
drop policy if exists "read seasons" on public.seasons;
create policy "read seasons" on public.seasons for select to anon, authenticated using (true);
drop policy if exists "read prize templates" on public.prize_templates;
create policy "read prize templates" on public.prize_templates for select to anon, authenticated using (true);
drop policy if exists "read season prizes" on public.season_prizes;
create policy "read season prizes" on public.season_prizes for select to anon, authenticated using (true);
drop policy if exists "read active challenges" on public.challenges;
create policy "read active challenges" on public.challenges for select to anon, authenticated using (active or public.is_staff());
drop policy if exists "own redemptions" on public.redemptions;
create policy "own redemptions" on public.redemptions for select to authenticated using (uid = auth.uid() or public.is_staff());
drop policy if exists "staff read winners" on public.season_winners;
create policy "staff read winners" on public.season_winners for select to authenticated using (public.is_staff());
drop policy if exists "own xp ledger" on public.xp_ledger;
create policy "own xp ledger" on public.xp_ledger for select to authenticated using (uid = auth.uid() or public.is_staff());
drop policy if exists "staff read sponsor clicks" on public.sponsor_clicks;
create policy "staff read sponsor clicks" on public.sponsor_clicks for select to authenticated using (public.is_staff());

revoke insert, update, delete on public.rewards_settings, public.sponsors, public.sponsor_products, public.rewards,
  public.reward_codes, public.seasons, public.prize_templates, public.season_prizes, public.challenges,
  public.redemptions, public.season_winners, public.xp_ledger, public.sponsor_clicks from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Game rules (one place; the app reads them from rewards_overview()).
-- ---------------------------------------------------------------------------
create or replace function public._mission_defs()
returns table (id text, title text, description text, metric text, target numeric, xp int, icon text, sort int)
language sql
immutable
as $$
  values
    ('sets15',    'Log 15 sets',            'Any machine, any weight.',                  'sets',     15::numeric,   60, 'dumbbell', 1),
    ('days3',     'Train 3 days',           'Log at least one set on 3 different days.', 'days',      3::numeric,   75, 'flame',    2),
    ('machines4', 'Use 4 machines',         'Spread the work: 4 different machines.',    'machines',  4::numeric,   50, 'grid',     3),
    ('pb1',       'Beat a personal best',   'Beat your best on any machine you''ve used before.', 'pbs', 1::numeric, 50, 'trophy', 4),
    ('volume5k',  'Move 5,000 kg',          'Weight × reps, added up over the week.',    'volume', 5000::numeric,   75, 'bolt',     5)
$$;

create or replace function public._badge_defs()
returns table (id text, title text, description text, xp int, icon text, sort int)
language sql
immutable
as $$
  values
    ('first_set',  'First rep',      'Log your first set.',                          20, 'dumbbell', 1),
    ('first_pb',   'Personal best',  'Beat your best on a machine for the first time.', 30, 'trophy', 2),
    ('early_bird', 'Early bird',     'Log a set before 7 am.',                       30, 'sun',      3),
    ('regular',    'Regular',        'Train on 10 different days.',                  75, 'flame',    4),
    ('explorer',   'Explorer',       'Log a set on all 10 machines.',               100, 'grid',     5),
    ('tonne_day',  'Tonne day',      'Move 1,000 kg in a single day.',               50, 'bolt',     6),
    ('century',    'Century',        'Log 100 sets.',                               100, 'medal',    7),
    ('ten_tonne',  '10-tonne club',  'Move 10,000 kg in total.',                    100, 'star',     8),
    ('podium',     'Podium',         'Finish in the top 3 of a season.',            150, 'target',   9)
$$;

-- Lifting streak = consecutive days with at least one logged set.
create or replace function public._streak_steps()
returns table (days int, xp int)
language sql
immutable
as $$ values (3, 30), (7, 75), (14, 150), (30, 400) $$;

-- XP from sets that count (not waiting for review).
create or replace function public._xp_parts(p_uid uuid)
returns table (training int, on_hold int, bonus int, spent int)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((select sum(xp_gain) from public.set_logs where uid = p_uid and review_status is distinct from 'flagged'), 0)::int,
    coalesce((select sum(xp_gain) from public.set_logs where uid = p_uid and review_status = 'flagged'), 0)::int,
    coalesce((select sum(amount) from public.xp_ledger where uid = p_uid and kind in ('mission', 'streak', 'badge', 'challenge', 'bonus')), 0)::int,
    coalesce((select -sum(amount) from public.xp_ledger where uid = p_uid and kind in ('redeem', 'refund')), 0)::int;
$$;

create or replace function public._xp_balance(p_uid uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select training + bonus - spent from public._xp_parts(p_uid);
$$;

-- Current lifting streak (ending today or yesterday) and the day it started.
create or replace function public._lift_streak(p_uid uuid)
returns table (days int, started date)
language sql
stable
security definer
set search_path = public
as $$
  with d as (
    select distinct (created_at at time zone public.app_timezone())::date as dd
      from public.set_logs
     where uid = p_uid and review_status is distinct from 'flagged'
  ), g as (
    select dd, dd - (row_number() over (order by dd))::int as grp from d
  ), r as (
    select min(dd) as s, max(dd) as e, count(*)::int as n from g group by grp
  )
  select n, s from r
   where e >= (now() at time zone public.app_timezone())::date - 1
   order by e desc
   limit 1;
$$;

-- Weekly (or any window) numbers for one member. "pbs" only counts beating
-- a best you already had -- a first set on a new machine doesn't count.
create or replace function public._window_metrics(p_uid uuid, p_from timestamptz, p_to timestamptz)
returns table (sets int, days int, machines int, pbs int, volume numeric)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*)::int,
    count(distinct (s.created_at at time zone public.app_timezone())::date)::int,
    count(distinct s.machine_id)::int,
    count(*) filter (
      where s.is_pb and exists (
        select 1 from public.set_logs e
         where e.uid = s.uid and e.machine_id = s.machine_id and e.mode is not distinct from s.mode
           and e.created_at < s.created_at and e.review_status is distinct from 'flagged'
      )
    )::int,
    coalesce(sum(s.weight * s.reps), 0)
  from public.set_logs s
  where s.uid = p_uid and s.created_at >= p_from and s.created_at < p_to
    and s.review_status is distinct from 'flagged';
$$;

revoke all on function public._xp_parts(uuid), public._xp_balance(uuid), public._lift_streak(uuid),
  public._window_metrics(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Seasons
-- ---------------------------------------------------------------------------
-- Returns the season running now, creating it (with the template prizes) if
-- needed. A new season never overlaps the last one, so switching weekly ->
-- monthly mid-week simply starts the monthly season when the week ends.
create or replace function public._ensure_current_season()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_period text;
  v_tz text := public.app_timezone();
  v_start timestamptz;
  v_end timestamptz;
  v_last_end timestamptz;
  v_title text;
begin
  select id into v_id from public.seasons where starts_at <= now() and ends_at > now() order by starts_at desc limit 1;
  if v_id is not null then
    return v_id;
  end if;

  select season_period into v_period from public.rewards_settings where id = 1;
  v_period := coalesce(v_period, 'week');
  v_start := date_trunc(v_period, now() at time zone v_tz) at time zone v_tz;
  v_end := (date_trunc(v_period, now() at time zone v_tz)
            + case when v_period = 'month' then interval '1 month' else interval '1 week' end) at time zone v_tz;
  select max(ends_at) into v_last_end from public.seasons where ends_at <= now();
  if v_last_end is not null and v_last_end > v_start then
    v_start := v_last_end;
  end if;
  v_title := case when v_period = 'month'
                  then to_char(v_start at time zone v_tz, 'FMMonth YYYY')
                  else 'Week of ' || to_char(v_start at time zone v_tz, 'FMDD Mon') end;

  insert into public.seasons (period, starts_at, ends_at, title)
  values (v_period, v_start, v_end, v_title)
  on conflict (starts_at, period) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.seasons where starts_at = v_start and period = v_period;
  else
    insert into public.season_prizes (season_id, rank_from, rank_to, title, description, sponsor_ids, reward_id, sort)
    select v_id, rank_from, rank_to, title, description, sponsor_ids, reward_id, sort
      from public.prize_templates;
  end if;
  return v_id;
end;
$$;
revoke all on function public._ensure_current_season() from public, anon, authenticated;

-- Everyone's score in a season: all XP earned in it. Flagged sets don't count
-- (they're listed so staff can check before awarding prizes).
create or replace function public._season_scores(p_season_id bigint)
returns table (uid uuid, score int, last_at timestamptz, flagged int)
language sql
stable
security definer
set search_path = public
as $$
  with w as (select starts_at, ends_at from public.seasons where id = p_season_id),
  ev as (
    select sl.uid, sl.xp_gain as xp, sl.created_at as at, 0 as fl
      from public.set_logs sl, w
     where sl.created_at >= w.starts_at and sl.created_at < w.ends_at
       and sl.review_status is distinct from 'flagged'
    union all
    select sl.uid, 0, null::timestamptz, 1
      from public.set_logs sl, w
     where sl.created_at >= w.starts_at and sl.created_at < w.ends_at
       and sl.review_status = 'flagged'
    union all
    select l.uid, l.amount, l.created_at, 0
      from public.xp_ledger l, w
     where l.created_at >= w.starts_at and l.created_at < w.ends_at
       and l.kind in ('mission', 'streak', 'badge', 'challenge', 'bonus')
  )
  select ev.uid, sum(ev.xp)::int, max(ev.at), sum(ev.fl)::int
    from ev
   group by ev.uid
  having sum(ev.xp) > 0;
$$;

create or replace function public._season_ranked(p_season_id bigint)
returns table (rank int, uid uuid, score int, flagged int)
language sql
stable
security definer
set search_path = public
as $$
  select (row_number() over (order by s.score desc, s.last_at asc nulls last, s.uid))::int,
         s.uid, s.score, s.flagged
    from public._season_scores(p_season_id) s;
$$;
revoke all on function public._season_scores(bigint), public._season_ranked(bigint) from public, anon, authenticated;

-- Public board: first names only. null season = the one running now.
create or replace function public.season_board(p_season_id bigint default null, p_limit int default 10)
returns table (rank int, name text, score int, is_me boolean)
language sql
security definer
set search_path = public
as $$
  select r.rank, public._first_name(p.display_name), r.score, (r.uid = auth.uid())
    from public._season_ranked(coalesce(p_season_id, public._ensure_current_season())) r
    join public.profiles p on p.id = r.uid
   order by r.rank
   limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;
grant execute on function public.season_board(bigint, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Challenges
-- ---------------------------------------------------------------------------
create or replace function public._challenge_scores(p_id bigint)
returns table (rank int, uid uuid, value numeric, reps int)
language sql
stable
security definer
set search_path = public
as $$
  with c as (select * from public.challenges where id = p_id),
  s as (
    select sl.* from public.set_logs sl, c
     where sl.created_at >= c.starts_at and sl.created_at < c.ends_at
       and sl.review_status is distinct from 'flagged'
       and (c.machine_id is null or sl.machine_id = c.machine_id)
       and (c.mode is null or sl.mode = c.mode)
  ),
  best as (
    select distinct on (s.uid) s.uid, s.weight as value, s.reps, s.created_at as at
      from s order by s.uid, s.weight desc, s.reps desc, s.created_at asc
  ),
  agg as (
    select s.uid,
           case (select metric from c) when 'sets' then count(*)::numeric else sum(s.weight * s.reps) end as value,
           null::int as reps, max(s.created_at) as at
      from s group by s.uid
  ),
  pick as (
    select * from best where (select metric from c) = 'best_lift'
    union all
    select * from agg where (select metric from c) <> 'best_lift'
  )
  select (row_number() over (order by value desc, reps desc nulls last, at asc, uid))::int, uid, value, reps
    from pick;
$$;
revoke all on function public._challenge_scores(bigint) from public, anon, authenticated;

create or replace function public.challenge_board(p_id bigint, p_limit int default 10)
returns table (rank int, name text, value numeric, reps int, is_me boolean)
language sql
security definer
set search_path = public
as $$
  select r.rank, public._first_name(p.display_name), r.value, r.reps, (r.uid = auth.uid())
    from public._challenge_scores(p_id) r
    join public.profiles p on p.id = r.uid
    join public.challenges c on c.id = p_id and (c.active or public.is_staff())
   order by r.rank
   limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;
grant execute on function public.challenge_board(bigint, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Catalogue for the Rewards page (anyone, signed in or not)
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
begin
  select id into v_last from public.seasons where awarded_at is not null order by ends_at desc limit 1;
  return jsonb_build_object(
    'period', (select season_period from public.rewards_settings where id = 1),
    'season', (
      select jsonb_build_object(
        'id', s.id, 'title', s.title, 'period', s.period, 'starts_at', s.starts_at, 'ends_at', s.ends_at,
        'prizes', coalesce((
          select jsonb_agg(jsonb_build_object('id', p.id, 'rank_from', p.rank_from, 'rank_to', p.rank_to, 'title', p.title,
                                              'description', p.description, 'sponsor_ids', to_jsonb(p.sponsor_ids))
                           order by p.rank_from, p.sort)
            from public.season_prizes p where p.season_id = s.id), '[]'::jsonb),
        'players', (select count(*) from public._season_scores(s.id))
      ) from public.seasons s where s.id = v_season),
    'sponsors', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', sp.id, 'name', sp.name, 'tagline', sp.tagline, 'blurb', sp.blurb, 'website_url', sp.website_url,
               'instagram_url', sp.instagram_url, 'logo_url', sp.logo_url, 'category', sp.category,
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
               'players', (select count(*) from public._challenge_scores(c.id)),
               'leader', (select jsonb_build_object('name', public._first_name(p.display_name), 'value', x.value, 'reps', x.reps)
                            from public._challenge_scores(c.id) x join public.profiles p on p.id = x.uid where x.rank = 1))
             order by c.ends_at)
        from public.challenges c
       where c.active and c.ends_at > now() - interval '2 days' and c.starts_at < now() + interval '14 days'), '[]'::jsonb),
    'missions', (select jsonb_agg(to_jsonb(m) order by m.sort) from public._mission_defs() m),
    'badges', (select jsonb_agg(to_jsonb(b) order by b.sort) from public._badge_defs() b),
    'streak_steps', (select jsonb_agg(to_jsonb(t) order by t.days) from public._streak_steps() t),
    'last_winners', case when v_last is null then null else jsonb_build_object(
      'season', (select title from public.seasons where id = v_last),
      'winners', coalesce((
        select jsonb_agg(jsonb_build_object('rank', w.rank, 'name', public._first_name(p.display_name), 'score', w.score,
                                            'prize', sp.title) order by w.rank)
          from public.season_winners w
          join public.profiles p on p.id = w.uid
          left join public.season_prizes sp on sp.id = w.prize_id
         where w.season_id = v_last and w.rank <= 10), '[]'::jsonb)) end
  );
end;
$$;
grant execute on function public.rewards_overview() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Award bonus XP that's due (missions, streaks, badges, challenge joins).
--    Idempotent: every award has a unique ref, so calling it again never pays
--    twice. Returns only what's new, for the "Mission complete" toasts.
-- ---------------------------------------------------------------------------
create or replace function public.sync_my_rewards()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tz text := public.app_timezone();
  v_week timestamptz := public._rk_week_start();
  v_wk text := to_char(public._rk_week_start() at time zone public.app_timezone(), 'YYYY-MM-DD');
  v_new jsonb := '[]'::jsonb;
  v_id bigint;
  w record;
  l record;
  m record;
  b record;
  t record;
  c record;
  v_value numeric;
  v_early boolean;
  v_bestday numeric;
  v_streak int;
  v_started date;
  v_hit boolean;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('racked-xp:' || v_uid::text));

  -- weekly missions
  select * into w from public._window_metrics(v_uid, v_week, now() + interval '1 minute');
  for m in select * from public._mission_defs() loop
    v_value := case m.metric when 'sets' then w.sets when 'days' then w.days when 'machines' then w.machines
                             when 'pbs' then w.pbs else w.volume end;
    if v_value >= m.target then
      v_id := null;
      insert into public.xp_ledger (uid, amount, kind, ref, title)
      values (v_uid, m.xp, 'mission', 'mission:' || v_wk || ':' || m.id, m.title)
      on conflict (uid, kind, ref) do nothing
      returning id into v_id;
      if v_id is not null then
        v_new := v_new || jsonb_build_object('kind', 'mission', 'id', m.id, 'title', m.title, 'xp', m.xp);
      end if;
    end if;
  end loop;

  -- lifting streak bonuses (once per streak run per step)
  select days, started into v_streak, v_started from public._lift_streak(v_uid);
  if v_streak is not null then
    for t in select * from public._streak_steps() where days <= v_streak loop
      v_id := null;
      insert into public.xp_ledger (uid, amount, kind, ref, title)
      values (v_uid, t.xp, 'streak', 'streak:' || v_started || ':' || t.days, t.days || '-day lifting streak')
      on conflict (uid, kind, ref) do nothing
      returning id into v_id;
      if v_id is not null then
        v_new := v_new || jsonb_build_object('kind', 'streak', 'id', t.days::text, 'title', t.days || '-day lifting streak', 'xp', t.xp);
      end if;
    end loop;
  end if;

  -- badges
  select * into l from public._window_metrics(v_uid, '-infinity'::timestamptz, 'infinity'::timestamptz);
  select bool_or(extract(hour from created_at at time zone v_tz) < 7) into v_early
    from public.set_logs where uid = v_uid and review_status is distinct from 'flagged';
  select coalesce(max(v), 0) into v_bestday from (
    select sum(weight * reps) as v from public.set_logs
     where uid = v_uid and review_status is distinct from 'flagged'
     group by (created_at at time zone v_tz)::date) x;
  for b in select * from public._badge_defs() where id <> 'podium' loop
    v_hit := case b.id
      when 'first_set' then l.sets >= 1
      when 'first_pb' then l.pbs >= 1
      when 'early_bird' then coalesce(v_early, false)
      when 'regular' then l.days >= 10
      when 'explorer' then l.machines >= 10
      when 'tonne_day' then v_bestday >= 1000
      when 'century' then l.sets >= 100
      when 'ten_tonne' then l.volume >= 10000
      else false end;
    if v_hit then
      v_id := null;
      insert into public.xp_ledger (uid, amount, kind, ref, title)
      values (v_uid, b.xp, 'badge', 'badge:' || b.id, b.title)
      on conflict (uid, kind, ref) do nothing
      returning id into v_id;
      if v_id is not null then
        v_new := v_new || jsonb_build_object('kind', 'badge', 'id', b.id, 'title', b.title, 'xp', b.xp);
      end if;
    end if;
  end loop;

  -- joining a live challenge (logging a set that counts for it)
  for c in
    select * from public.challenges
     where active and join_xp > 0 and now() >= starts_at and now() < ends_at
  loop
    if exists (
      select 1 from public.set_logs s
       where s.uid = v_uid and s.created_at >= c.starts_at and s.created_at < c.ends_at
         and s.review_status is distinct from 'flagged'
         and (c.machine_id is null or s.machine_id = c.machine_id)
         and (c.mode is null or s.mode = c.mode)
    ) then
      v_id := null;
      insert into public.xp_ledger (uid, amount, kind, ref, title)
      values (v_uid, c.join_xp, 'challenge', 'challenge:' || c.id || ':join', 'Joined: ' || c.title)
      on conflict (uid, kind, ref) do nothing
      returning id into v_id;
      if v_id is not null then
        v_new := v_new || jsonb_build_object('kind', 'challenge', 'id', c.id::text, 'title', c.title, 'xp', c.join_xp);
      end if;
    end if;
  end loop;

  return v_new;
end;
$$;
revoke all on function public.sync_my_rewards() from public, anon;
grant execute on function public.sync_my_rewards() to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Everything personal for the Rewards page
-- ---------------------------------------------------------------------------
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
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  select * into x from public._xp_parts(v_uid);
  select * into w from public._window_metrics(v_uid, v_week, now() + interval '1 minute');
  select days, started into v_streak, v_started from public._lift_streak(v_uid);
  select r.rank, r.score into v_rank, v_score from public._season_ranked(v_season) r where r.uid = v_uid;
  if v_rank is not null and v_rank > 1 then
    select jsonb_build_object('name', public._first_name(p.display_name), 'score', r.score)
      into v_ahead
      from public._season_ranked(v_season) r join public.profiles p on p.id = r.uid
     where r.rank = v_rank - 1;
  end if;

  return jsonb_build_object(
    'wallet', jsonb_build_object(
      'training', x.training, 'bonus', x.bonus, 'spent', x.spent, 'on_hold', x.on_hold,
      'lifetime', x.training + x.bonus, 'balance', x.training + x.bonus - x.spent),
    'season', (
      select jsonb_build_object('id', s.id, 'title', s.title, 'period', s.period, 'ends_at', s.ends_at,
                                'rank', v_rank, 'score', coalesce(v_score, 0), 'ahead', v_ahead,
                                'players', (select count(*) from public._season_scores(s.id)),
                                'top_prize', (select p.title from public.season_prizes p where p.season_id = s.id order by p.rank_from, p.sort limit 1))
        from public.seasons s where s.id = v_season),
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
      select jsonb_agg(jsonb_build_object('id', c.id, 'rank', s.rank, 'value', s.value, 'reps', s.reps))
        from public.challenges c
        join lateral (select * from public._challenge_scores(c.id) z where z.uid = v_uid) s on true
       where c.active and c.ends_at > now() - interval '2 days'), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object('kind', kind, 'title', title, 'amount', amount, 'at', created_at) order by created_at desc)
        from (select * from public.xp_ledger where uid = v_uid order by created_at desc limit 12) q), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.my_rewards() from public, anon;
grant execute on function public.my_rewards() to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Spending XP
-- ---------------------------------------------------------------------------
create or replace function public.redeem_reward(p_reward_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  r public.rewards;
  v_balance int;
  v_used int;
  v_mine int;
  v_code text;
  v_code_id bigint;
  v_red bigint;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('racked-xp:' || v_uid::text));
  select * into r from public.rewards where id = p_reward_id for update;
  if not found or not r.active or r.xp_cost is null then
    raise exception 'This reward isn''t available right now' using errcode = 'RK101';
  end if;
  if r.valid_until is not null and r.valid_until < now() then
    raise exception 'This reward has ended' using errcode = 'RK101';
  end if;
  select count(*) into v_used from public.redemptions where reward_id = r.id and status <> 'cancelled';
  if r.stock is not null and v_used >= r.stock then
    raise exception 'All gone: this reward is out of stock' using errcode = 'RK102';
  end if;
  select count(*) into v_mine from public.redemptions
   where reward_id = r.id and uid = v_uid and source = 'shop' and status <> 'cancelled';
  if v_mine >= r.per_member_limit then
    raise exception 'You''ve already claimed this one' using errcode = 'RK103';
  end if;
  v_balance := public._xp_balance(v_uid);
  if v_balance < r.xp_cost then
    raise exception 'You need % more XP for this', r.xp_cost - v_balance using errcode = 'RK104';
  end if;

  if r.code_mode = 'pool' then
    select id, code into v_code_id, v_code from public.reward_codes
     where reward_id = r.id and not shared and redemption_id is null
     order by id limit 1 for update skip locked;
    if v_code is null then
      raise exception 'All gone: no codes left for this reward' using errcode = 'RK102';
    end if;
  elsif r.code_mode = 'shared' then
    select code into v_code from public.reward_codes where reward_id = r.id and shared order by id desc limit 1;
    if v_code is null then
      raise exception 'This reward isn''t ready yet, try again soon' using errcode = 'RK101';
    end if;
  else
    v_code := public._claim_code();
  end if;

  insert into public.redemptions (uid, reward_id, source, xp_spent, code, title, sponsor_id)
  values (v_uid, r.id, 'shop', r.xp_cost, v_code, r.title, r.sponsor_id)
  returning id into v_red;
  if v_code_id is not null then
    update public.reward_codes set redemption_id = v_red where id = v_code_id;
  end if;
  insert into public.xp_ledger (uid, amount, kind, ref, title)
  values (v_uid, -r.xp_cost, 'redeem', 'redeem:' || v_red, r.title);

  return jsonb_build_object('id', v_red, 'title', r.title, 'code', v_code, 'code_mode', r.code_mode,
                            'how_to_use', r.how_to_use, 'sponsor_id', r.sponsor_id, 'xp_spent', r.xp_cost,
                            'balance', v_balance - r.xp_cost);
end;
$$;
revoke all on function public.redeem_reward(bigint) from public, anon;
grant execute on function public.redeem_reward(bigint) to authenticated;

-- Sponsor link clicks (for sponsor reports). Anyone can record one.
create or replace function public.track_sponsor_click(p_sponsor_id text, p_product_id bigint default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- keep the numbers honest: one click per person per link per 30 s, and at
  -- most 60 a minute per brand (stops a script inflating a sponsor report)
  if auth.uid() is not null and exists (
       select 1 from public.sponsor_clicks
        where uid = auth.uid() and sponsor_id = p_sponsor_id
          and product_id is not distinct from p_product_id
          and created_at > now() - interval '30 seconds') then
    return;
  end if;
  if (select count(*) from public.sponsor_clicks where sponsor_id = p_sponsor_id and created_at > now() - interval '1 minute') >= 60 then
    return;
  end if;
  if exists (select 1 from public.sponsors where id = p_sponsor_id and active) then
    insert into public.sponsor_clicks (sponsor_id, product_id, uid)
    values (p_sponsor_id,
            (select id from public.sponsor_products where id = p_product_id and sponsor_id = p_sponsor_id),
            auth.uid());
  end if;
end;
$$;
grant execute on function public.track_sponsor_click(text, bigint) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 10. Staff tools (each re-checks is_staff() and is logged)
-- ---------------------------------------------------------------------------
create or replace function public._require_staff()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff only' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public._require_staff() from public, anon, authenticated;

-- One code for a prize: from the linked reward's pool / shared code, else a claim code.
create or replace function public._prize_code(p_reward_id bigint, p_redemption bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode text;
  v_code text;
  v_code_id bigint;
begin
  if p_reward_id is not null then
    select code_mode into v_mode from public.rewards where id = p_reward_id;
    if v_mode = 'pool' then
      select id, code into v_code_id, v_code from public.reward_codes
       where reward_id = p_reward_id and not shared and redemption_id is null
       order by id limit 1 for update skip locked;
      if v_code_id is not null then
        update public.reward_codes set redemption_id = p_redemption where id = v_code_id;
      end if;
    elsif v_mode = 'shared' then
      select code into v_code from public.reward_codes where reward_id = p_reward_id and shared order by id desc limit 1;
    end if;
  end if;
  return coalesce(v_code, public._claim_code());
end;
$$;
revoke all on function public._prize_code(bigint, bigint) from public, anon, authenticated;

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
    'live_board', coalesce((
      select jsonb_agg(jsonb_build_object('rank', r.rank, 'name', public._public_name(p.display_name), 'score', r.score, 'flagged', r.flagged) order by r.rank)
        from public._season_ranked(v_season) r join public.profiles p on p.id = r.uid where r.rank <= 10), '[]'::jsonb),
    'to_award', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'title', s.title, 'ends_at', s.ends_at,
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
                                          'winners', coalesce((select jsonb_agg(jsonb_build_object('rank', w.rank, 'name', public._public_name(p.display_name), 'score', w.score) order by w.rank)
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

create or replace function public.admin_set_season_period(p_period text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_staff();
  if p_period not in ('week', 'month') then
    raise exception 'Period must be week or month' using errcode = '22023';
  end if;
  update public.rewards_settings set season_period = p_period, updated_at = now(), updated_by = auth.uid() where id = 1;
  perform public._log_staff_action('season_period', null, null, 'Seasons now ' || case when p_period = 'week' then 'weekly' else 'monthly' end || ' (from the next season)');
end;
$$;

-- p_prizes: [{rank_from, rank_to, title, description, sponsor_ids: [..], reward_id}]
create or replace function public.admin_save_prizes(p_prizes jsonb, p_apply_current boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season bigint;
  e jsonb;
  i int := 0;
begin
  perform public._require_staff();
  if jsonb_typeof(p_prizes) <> 'array' or jsonb_array_length(p_prizes) > 20 then
    raise exception 'Up to 20 prize rows' using errcode = '22023';
  end if;
  delete from public.prize_templates;
  for e in select * from jsonb_array_elements(p_prizes) loop
    i := i + 1;
    insert into public.prize_templates (rank_from, rank_to, title, description, sponsor_ids, reward_id, sort)
    values ((e->>'rank_from')::int, coalesce((e->>'rank_to')::int, (e->>'rank_from')::int), left(trim(e->>'title'), 90),
            nullif(left(trim(coalesce(e->>'description', '')), 300), ''),
            coalesce(array(select jsonb_array_elements_text(coalesce(e->'sponsor_ids', '[]'::jsonb))), '{}'),
            nullif(e->>'reward_id', '')::bigint, i);
  end loop;
  if p_apply_current then
    v_season := public._ensure_current_season();
    if (select awarded_at from public.seasons where id = v_season) is null then
      delete from public.season_prizes where season_id = v_season;
      insert into public.season_prizes (season_id, rank_from, rank_to, title, description, sponsor_ids, reward_id, sort)
      select v_season, rank_from, rank_to, title, description, sponsor_ids, reward_id, sort from public.prize_templates;
    end if;
  end if;
  perform public._log_staff_action('save_prizes', null, null, jsonb_array_length(p_prizes) || ' prize rows saved');
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
  for w in select * from public._season_ranked(s.id) where rank <= v_max order by rank loop
    select * into v_prize from public.season_prizes
     where season_id = s.id and w.rank between rank_from and rank_to order by sort limit 1;
    if v_prize.id is null then
      continue;
    end if;
    insert into public.redemptions (uid, reward_id, source, title, sponsor_id, season_id, rank)
    values (w.uid, v_prize.reward_id, 'prize', v_prize.title, v_prize.sponsor_ids[1], s.id, w.rank)
    returning id into v_red;
    update public.redemptions set code = public._prize_code(v_prize.reward_id, v_red) where id = v_red;
    insert into public.season_winners (season_id, rank, uid, score, prize_id, redemption_id)
    values (s.id, w.rank, w.uid, w.score, v_prize.id, v_red);
    if w.rank <= 3 then
      insert into public.xp_ledger (uid, amount, kind, ref, title)
      select w.uid, b.xp, 'badge', 'badge:podium', b.title from public._badge_defs() b where b.id = 'podium'
      on conflict (uid, kind, ref) do nothing;
    end if;
    v_out := v_out || jsonb_build_object('rank', w.rank, 'uid', w.uid, 'score', w.score, 'prize', v_prize.title);
    v_prize := null;
  end loop;
  update public.seasons set awarded_at = now(), awarded_by = auth.uid() where id = s.id;
  perform public._log_staff_action('award_season', null, null, s.title || ': ' || jsonb_array_length(v_out) || ' prizes awarded');
  return v_out;
end;
$$;

-- issued -> fulfilled (handed over) or cancelled (XP refunded for shop items)
create or replace function public.admin_update_redemption(p_id bigint, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.redemptions;
begin
  perform public._require_staff();
  if p_status not in ('fulfilled', 'cancelled') then
    raise exception 'Status must be fulfilled or cancelled' using errcode = '22023';
  end if;
  select * into d from public.redemptions where id = p_id for update;
  if not found then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  if d.status <> 'issued' then
    raise exception 'This one is already %', d.status using errcode = 'RK112';
  end if;
  update public.redemptions
     set status = p_status,
         fulfilled_at = case when p_status = 'fulfilled' then now() else null end,
         fulfilled_by = auth.uid()
   where id = p_id;
  if p_status = 'cancelled' and d.source = 'shop' and d.xp_spent > 0 then
    insert into public.xp_ledger (uid, amount, kind, ref, title)
    values (d.uid, d.xp_spent, 'refund', 'refund:' || d.id, 'Refund: ' || d.title)
    on conflict (uid, kind, ref) do nothing;
  end if;
  perform public._log_staff_action(case when p_status = 'fulfilled' then 'reward_handed_over' else 'reward_cancelled' end,
                                   d.uid, null, d.title || coalesce(' (' || d.code || ')', ''));
end;
$$;

create or replace function public.admin_save_reward(p jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint := nullif(p->>'id', '')::bigint;
  v_title text := left(trim(coalesce(p->>'title', '')), 80);
begin
  perform public._require_staff();
  if char_length(v_title) < 2 then
    raise exception 'Give the reward a name' using errcode = '22023';
  end if;
  if v_id is null then
    insert into public.rewards (sponsor_id, title, description, how_to_use, image_url, xp_cost, code_mode, stock,
                                per_member_limit, valid_until, active, sort)
    values (nullif(p->>'sponsor_id', ''), v_title, nullif(trim(p->>'description'), ''), nullif(trim(p->>'how_to_use'), ''),
            nullif(trim(p->>'image_url'), ''), nullif(p->>'xp_cost', '')::int, coalesce(nullif(p->>'code_mode', ''), 'desk'),
            nullif(p->>'stock', '')::int, coalesce(nullif(p->>'per_member_limit', '')::int, 1),
            nullif(p->>'valid_until', '')::timestamptz, coalesce((p->>'active')::boolean, false),
            coalesce(nullif(p->>'sort', '')::int, 0))
    returning id into v_id;
  else
    -- only the fields that were sent change
    update public.rewards set
      sponsor_id = case when p ? 'sponsor_id' then nullif(p->>'sponsor_id', '') else sponsor_id end,
      title = v_title,
      description = case when p ? 'description' then nullif(trim(p->>'description'), '') else description end,
      how_to_use = case when p ? 'how_to_use' then nullif(trim(p->>'how_to_use'), '') else how_to_use end,
      image_url = case when p ? 'image_url' then nullif(trim(p->>'image_url'), '') else image_url end,
      xp_cost = case when p ? 'xp_cost' then nullif(p->>'xp_cost', '')::int else xp_cost end,
      code_mode = coalesce(nullif(p->>'code_mode', ''), code_mode),
      stock = case when p ? 'stock' then nullif(p->>'stock', '')::int else stock end,
      per_member_limit = coalesce(nullif(p->>'per_member_limit', '')::int, per_member_limit),
      valid_until = case when p ? 'valid_until' then nullif(p->>'valid_until', '')::timestamptz else valid_until end,
      active = coalesce((p->>'active')::boolean, active),
      sort = coalesce(nullif(p->>'sort', '')::int, sort)
    where id = v_id;
    if not found then
      raise exception 'Reward not found' using errcode = 'P0002';
    end if;
  end if;
  perform public._log_staff_action('save_reward', null, null, v_title);
  return v_id;
end;
$$;

-- Paste codes one per line. shared = one code for everyone (replaces the old one).
create or replace function public.admin_add_reward_codes(p_reward_id bigint, p_codes text, p_shared boolean default false)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int := 0;
  v_code text;
begin
  perform public._require_staff();
  if not exists (select 1 from public.rewards where id = p_reward_id) then
    raise exception 'Reward not found' using errcode = 'P0002';
  end if;
  if p_shared then
    v_code := left(trim(split_part(coalesce(p_codes, ''), E'\n', 1)), 60);
    if v_code = '' then
      raise exception 'Enter the code' using errcode = '22023';
    end if;
    delete from public.reward_codes where reward_id = p_reward_id and shared;
    insert into public.reward_codes (reward_id, code, shared) values (p_reward_id, v_code, true);
    update public.rewards set code_mode = 'shared' where id = p_reward_id;
    v_n := 1;
  else
    insert into public.reward_codes (reward_id, code)
    select p_reward_id, q.c from (
      select left(trim(x.v), 60) as c, min(x.o) as o
        from regexp_split_to_table(coalesce(p_codes, ''), E'[\\n,;]+') with ordinality as x (v, o)
       group by 1
    ) q
    where q.c <> '' and not exists (select 1 from public.reward_codes rc where rc.reward_id = p_reward_id and rc.code = q.c)
    order by q.o;
    get diagnostics v_n = row_count;
    update public.rewards set code_mode = 'pool' where id = p_reward_id;
  end if;
  perform public._log_staff_action('add_codes', null, null, v_n || ' code(s) added to reward ' || p_reward_id);
  return v_n;
end;
$$;

create or replace function public.admin_save_challenge(p jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint := nullif(p->>'id', '')::bigint;
  v_title text := left(trim(coalesce(p->>'title', '')), 80);
begin
  perform public._require_staff();
  if char_length(v_title) < 2 then
    raise exception 'Give the challenge a name' using errcode = '22023';
  end if;
  if v_id is null then
    insert into public.challenges (sponsor_id, title, description, metric, machine_id, mode, starts_at, ends_at, prize,
                                   reward_id, winners, join_xp, active)
    values (nullif(p->>'sponsor_id', ''), v_title, nullif(trim(p->>'description'), ''), coalesce(nullif(p->>'metric', ''), 'best_lift'),
            nullif(p->>'machine_id', ''), nullif(p->>'mode', ''), (p->>'starts_at')::timestamptz, (p->>'ends_at')::timestamptz,
            nullif(trim(p->>'prize'), ''), nullif(p->>'reward_id', '')::bigint, coalesce(nullif(p->>'winners', '')::int, 1),
            coalesce(nullif(p->>'join_xp', '')::int, 20), coalesce((p->>'active')::boolean, false))
    returning id into v_id;
  else
    -- only the fields that were sent change
    update public.challenges set
      sponsor_id = case when p ? 'sponsor_id' then nullif(p->>'sponsor_id', '') else sponsor_id end,
      title = v_title,
      description = case when p ? 'description' then nullif(trim(p->>'description'), '') else description end,
      metric = coalesce(nullif(p->>'metric', ''), metric),
      machine_id = case when p ? 'machine_id' then nullif(p->>'machine_id', '') else machine_id end,
      mode = case when p ? 'mode' then nullif(p->>'mode', '') else mode end,
      starts_at = coalesce(nullif(p->>'starts_at', '')::timestamptz, starts_at),
      ends_at = coalesce(nullif(p->>'ends_at', '')::timestamptz, ends_at),
      prize = case when p ? 'prize' then nullif(trim(p->>'prize'), '') else prize end,
      reward_id = case when p ? 'reward_id' then nullif(p->>'reward_id', '')::bigint else reward_id end,
      winners = coalesce(nullif(p->>'winners', '')::int, winners),
      join_xp = coalesce(nullif(p->>'join_xp', '')::int, join_xp),
      active = coalesce((p->>'active')::boolean, active)
    where id = v_id and awarded_at is null;
    if not found then
      raise exception 'Challenge not found, or its winners were already awarded' using errcode = 'P0002';
    end if;
  end if;
  perform public._log_staff_action('save_challenge', null, nullif(p->>'machine_id', ''), v_title);
  return v_id;
end;
$$;

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
  for w in select * from public._challenge_scores(c.id) where rank <= c.winners order by rank loop
    insert into public.redemptions (uid, reward_id, source, title, sponsor_id, challenge_id, rank)
    values (w.uid, c.reward_id, 'challenge', coalesce(c.prize, c.title), c.sponsor_id, c.id, w.rank)
    returning id into v_red;
    update public.redemptions set code = public._prize_code(c.reward_id, v_red) where id = v_red;
    v_out := v_out || jsonb_build_object('rank', w.rank, 'uid', w.uid, 'value', w.value);
  end loop;
  update public.challenges set awarded_at = now() where id = c.id;
  perform public._log_staff_action('award_challenge', null, c.machine_id, c.title || ': ' || jsonb_array_length(v_out) || ' winner(s)');
  return v_out;
end;
$$;

create or replace function public.admin_save_sponsor(p jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text := lower(trim(coalesce(p->>'id', '')));
begin
  perform public._require_staff();
  if v_id !~ '^[a-z0-9][a-z0-9-]{1,39}$' then
    raise exception 'Sponsor id: 2-40 lowercase letters, numbers or dashes' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p->>'name', ''))) < 1 then
    raise exception 'Give the sponsor a name' using errcode = '22023';
  end if;
  insert into public.sponsors (id, name, tagline, blurb, website_url, instagram_url, logo_url, category, active, sort)
  values (v_id, left(trim(p->>'name'), 60), nullif(trim(p->>'tagline'), ''), nullif(trim(p->>'blurb'), ''),
          nullif(trim(p->>'website_url'), ''), nullif(trim(p->>'instagram_url'), ''), nullif(trim(p->>'logo_url'), ''),
          nullif(trim(p->>'category'), ''), coalesce((p->>'active')::boolean, true), coalesce(nullif(p->>'sort', '')::int, 0))
  on conflict (id) do update set
    name = excluded.name, tagline = excluded.tagline, blurb = excluded.blurb, website_url = excluded.website_url,
    instagram_url = excluded.instagram_url, logo_url = excluded.logo_url, category = excluded.category,
    active = excluded.active, sort = excluded.sort;
  perform public._log_staff_action('save_sponsor', null, null, v_id);
  return v_id;
end;
$$;

create or replace function public.admin_save_product(p jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint := nullif(p->>'id', '')::bigint;
begin
  perform public._require_staff();
  if v_id is null and char_length(trim(coalesce(p->>'title', ''))) < 2 then
    raise exception 'Give the product a name' using errcode = '22023';
  end if;
  if v_id is null then
    insert into public.sponsor_products (sponsor_id, title, subtitle, price_text, image_url, url, active, sort)
    values (p->>'sponsor_id', left(trim(p->>'title'), 80), nullif(trim(p->>'subtitle'), ''), nullif(trim(p->>'price_text'), ''),
            nullif(trim(p->>'image_url'), ''), nullif(trim(p->>'url'), ''), coalesce((p->>'active')::boolean, true),
            coalesce(nullif(p->>'sort', '')::int, 0))
    returning id into v_id;
  else
    update public.sponsor_products set
      title = coalesce(nullif(left(trim(p->>'title'), 80), ''), title),
      subtitle = case when p ? 'subtitle' then nullif(trim(p->>'subtitle'), '') else subtitle end,
      price_text = case when p ? 'price_text' then nullif(trim(p->>'price_text'), '') else price_text end,
      image_url = case when p ? 'image_url' then nullif(trim(p->>'image_url'), '') else image_url end,
      url = case when p ? 'url' then nullif(trim(p->>'url'), '') else url end,
      active = coalesce((p->>'active')::boolean, active), sort = coalesce(nullif(p->>'sort', '')::int, sort)
    where id = v_id;
  end if;
  perform public._log_staff_action('save_product', null, null, coalesce(p->>'sponsor_id', '') || ': ' || coalesce(p->>'title', ''));
  return v_id;
end;
$$;

create or replace function public.admin_delete_product(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_staff();
  delete from public.sponsor_products where id = p_id;
end;
$$;

-- Give (or take back) bonus XP by hand, e.g. for an event. Logged.
create or replace function public.admin_bonus_xp(p_uid uuid, p_amount int, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_staff();
  if p_amount = 0 or abs(p_amount) > 5000 then
    raise exception 'Between -5000 and 5000 XP' using errcode = '22023';
  end if;
  insert into public.xp_ledger (uid, amount, kind, ref, title)
  values (p_uid, p_amount, 'bonus', 'bonus:' || extract(epoch from clock_timestamp())::text, left(coalesce(nullif(trim(p_reason), ''), 'Bonus XP'), 80));
  perform public._log_staff_action('bonus_xp', p_uid, null, p_amount || ' XP: ' || coalesce(p_reason, ''));
end;
$$;

-- "Reset all data" (Staff -> Overview) now also clears members' bonus XP,
-- claimed rewards and past seasons. Sponsors, products, shop items, prize
-- settings and challenges are kept.
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
  delete from public.season_winners;
  delete from public.redemptions;
  delete from public.reward_codes where redemption_id is not null; -- already seen by someone
  delete from public.xp_ledger;
  delete from public.sponsor_clicks;
  delete from public.seasons;
  update public.challenges set awarded_at = null;
  perform public._log_staff_action('reset_all', null, null, 'All gym activity data wiped (incl. XP, rewards, seasons)');
end;
$$;
revoke all on function public.admin_reset_all_data() from public, anon;
grant execute on function public.admin_reset_all_data() to authenticated;

do $$
declare
  f text;
begin
  foreach f in array array[
    'admin_rewards_data()', 'admin_set_season_period(text)', 'admin_save_prizes(jsonb, boolean)',
    'admin_award_season(bigint)', 'admin_update_redemption(bigint, text)', 'admin_save_reward(jsonb)',
    'admin_add_reward_codes(bigint, text, boolean)', 'admin_save_challenge(jsonb)', 'admin_award_challenge(bigint)',
    'admin_save_sponsor(jsonb)', 'admin_save_product(jsonb)', 'admin_delete_product(bigint)', 'admin_bonus_xp(uuid, int, text)'
  ] loop
    execute 'revoke all on function public.' || f || ' from public, anon';
    execute 'grant execute on function public.' || f || ' to authenticated';
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Starting content (only inserted the first time)
-- ---------------------------------------------------------------------------
insert into public.sponsors (id, name, tagline, blurb, website_url, logo_url, category, sort) values
  ('jersey-drip', 'Jersey Drip', 'Premium football, cricket & F1 jerseys',
   'Jerseys with your name and number, delivered across India. Cash on delivery and easy exchanges.',
   'https://jerseydrip.shop', null, 'Apparel', 1),
  ('clean-crate', 'The Clean Crate', 'Fuel your vibe, naturally',
   'Ready-to-eat protein oats from Hyderabad: 15 g protein a pack and no added sugar. Add water or milk, wait 3–5 minutes.',
   'https://www.thecleancratefoods.com', 'https://www.thecleancratefoods.com/logo-new.jpg', 'Nutrition', 2)
on conflict (id) do nothing;

insert into public.sponsor_products (sponsor_id, title, subtitle, price_text, image_url, url, sort)
select * from (values
  ('jersey-drip', 'Football jerseys', 'Club and country kits', null::text, null::text, 'https://jerseydrip.shop', 1),
  ('jersey-drip', 'Cricket jerseys', 'India and league styles', null, null, 'https://jerseydrip.shop', 2),
  ('jersey-drip', 'F1 jerseys', 'Team kits', null, null, 'https://jerseydrip.shop', 3),
  ('jersey-drip', 'Your name & number', 'Custom printing on any jersey', null, null, 'https://jerseydrip.shop', 4),
  ('clean-crate', 'Mocha Rush', '15 g protein · box of 4', '₹379', 'https://www.thecleancratefoods.com/photos/DSC_8741.jpg', 'https://www.thecleancratefoods.com', 1),
  ('clean-crate', 'Thai Mango Coconut', '15 g protein · box of 4', '₹379', 'https://www.thecleancratefoods.com/photos/DSC_8723.jpg', 'https://www.thecleancratefoods.com', 2),
  ('clean-crate', 'Breakfast Box', '8 packs, both flavours', '₹749', 'https://www.thecleancratefoods.com/photos/box-breakfast.png', 'https://www.thecleancratefoods.com', 3),
  ('clean-crate', '2-Week Workday Box', '12 packs', '₹1,099', null, 'https://www.thecleancratefoods.com', 4)
) v (sponsor_id, title, subtitle, price_text, image_url, url, sort)
where not exists (select 1 from public.sponsor_products);

-- Draft shop items: OFF until staff switch them on (suggested XP prices).
insert into public.rewards (sponsor_id, title, description, how_to_use, xp_cost, code_mode, stock, sort, active)
select * from (values
  ('clean-crate', 'Protein oats, 1 pack', 'One 60 g pack of The Clean Crate protein oats (15 g protein).',
   'Show your claim code at the front desk to collect your pack.', 600, 'desk', 20, 1, false),
  ('jersey-drip', '₹150 off at Jersey Drip', 'A discount on any jersey at jerseydrip.shop.',
   'Show your claim code at the front desk and we''ll send you a discount code.', 1000, 'desk', null::int, 2, false),
  ('clean-crate', 'Breakfast Box (8 packs)', 'The Clean Crate Breakfast Box, both flavours.',
   'Show your claim code at the front desk to collect your box.', 3000, 'desk', 3, 3, false),
  ('jersey-drip', 'Custom Jersey Drip jersey', 'A jersey of your choice with your name and number.',
   'Show your claim code at the front desk and we''ll take your size and name.', 6000, 'desk', 2, 4, false)
) v (sponsor_id, title, description, how_to_use, xp_cost, code_mode, stock, sort, active)
where not exists (select 1 from public.rewards);

-- Season prizes: #1 gets a hamper, #2–5 get coupons. Staff can change these.
insert into public.prize_templates (rank_from, rank_to, title, description, sponsor_ids, sort)
select * from (values
  (1, 1, 'Gift hamper from Jersey Drip × The Clean Crate', 'For the season''s top performer.', array['jersey-drip', 'clean-crate'], 1),
  (2, 5, 'Partner coupons', 'Discount coupons from Jersey Drip and The Clean Crate.', array['jersey-drip', 'clean-crate'], 2)
) v (rank_from, rank_to, title, description, sponsor_ids, sort)
where not exists (select 1 from public.prize_templates);

-- A sample sponsor challenge, OFF until staff switch it on.
insert into public.challenges (sponsor_id, title, description, metric, machine_id, starts_at, ends_at, prize, winners, join_xp, active)
select 'clean-crate', 'Clean Crate Leg Day', 'Heaviest Leg Press set this week wins. Everyone who joins gets +20 XP.',
       'best_lift', 'leg-press-08', public._rk_week_start(), public._rk_week_start() + interval '7 days',
       'A box of The Clean Crate protein oats', 1, 20, false
where not exists (select 1 from public.challenges);
