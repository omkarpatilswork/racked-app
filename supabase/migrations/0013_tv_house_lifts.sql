-- ============================================================================
-- 0013_tv_house_lifts.sql   (run after 0012_rr_controls.sql)
--
-- The gym TV, take 2, and fuller leaderboards.
--
--   1. House lifts: staff can put a real lift on a machine's board for
--      someone who isn't on the app yet (a trainer, a regular without the
--      app). They show on the boards like anyone else, but never earn XP,
--      prizes or challenge places, and don't count in the gym's totals.
--   2. Fuller boards: when fewer than 3 people have lifted on a machine
--      today / this week / this month, the spare places show that machine's
--      best-ever lifts, marked "best ever". Every name is a real person.
--   3. TV slides: how many times each kind of slide shows per loop, and for
--      how many seconds. Edited in R&R Controls -> TV.
--   4. Partner ads on the TV: each brand can be on or off the TV and have a
--      short TV headline. Scans of a brand's TV QR code are counted
--      separately from taps in the app.
--   5. tv_feed(): everything the TV shows (prizes, challenges, partners,
--      winners, slide settings) in one public call. First names only.
--
-- Safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. House lifts
-- ---------------------------------------------------------------------------
create table if not exists public.house_lifts (
  id bigint generated always as identity primary key,
  machine_id text not null,
  mode text not null default '',
  name text not null check (char_length(name) between 1 and 16),
  weight numeric(7, 2) not null check (weight > 0),
  reps int not null check (reps between 1 and 100),
  lifted_on date not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null
);
create index if not exists house_lifts_machine_idx on public.house_lifts (machine_id, mode, weight desc);

-- Nobody reads or writes the table directly: the boards and the staff
-- functions below are the only way in.
alter table public.house_lifts enable row level security;
revoke all on public.house_lifts from anon, authenticated;

-- p: {id?, machine_id, mode, name, weight, reps, lifted_on 'YYYY-MM-DD'}
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
  exception when others then
    raise exception 'Check the weight, reps and date' using errcode = '22023';
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

  if v_id is null then
    if (select count(*) from public.house_lifts where machine_id = v_machine and mode = v_mode) >= 20 then
      raise exception 'That''s 20 house lifts on this machine already. Remove one first.' using errcode = '22023';
    end if;
    insert into public.house_lifts (machine_id, mode, name, weight, reps, lifted_on, created_by)
    values (v_machine, v_mode, v_name, v_weight, v_reps, v_day, auth.uid())
    returning id into v_id;
  else
    update public.house_lifts
       set machine_id = v_machine, mode = v_mode, name = v_name, weight = v_weight, reps = v_reps, lifted_on = v_day
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

create or replace function public.admin_delete_house_lift(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.house_lifts;
begin
  perform public._require_staff();
  delete from public.house_lifts where id = p_id returning * into v;
  if v.id is not null then
    perform public._log_staff_action('house_lift_removed', null, v.machine_id,
      format('%s %s kg × %s', v.name, trim_scale(v.weight), v.reps));
  end if;
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
             'added_by', public._public_name(pr.display_name))
           order by h.machine_id, h.mode, h.weight desc, h.reps desc)
      from public.house_lifts h
      left join public.profiles pr on pr.id = h.created_by), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- First names on public boards, a little safer: someone who signed up with
-- no name gets their email's first part as a name ("chris.secret99"); show
-- that as "Chris", never the rest. ("Asha Rao" -> "Asha" as before.)
-- ---------------------------------------------------------------------------
create or replace function public._first_name(p_name text)
returns text
language sql
immutable
as $$
  select left(initcap(coalesce(
           (array_remove(regexp_split_to_array(
              case when strpos(n, '@') > 0 then split_part(n, '@', 1) else split_part(n, ' ', 1) end,
              case when strpos(n, '@') > 0 then '[._+0-9-]+' else '[._+0-9]+' end), ''))[1],
           'Lifter')), 14)
    from (select trim(coalesce(p_name, '')) as n) x;
$$;

-- ---------------------------------------------------------------------------
-- 2. Boards: members' sets + house lifts, with best-ever lifts filling the
--    spare places on a short board.
--
-- _board(machine, mode, period, limit, fill): machine null = every machine.
--   Period rows: each person's best set in the period, ranked.
--   Fill rows (best_ever = true): when a board has fewer than `fill` people
--   in the period, the machine's best-ever lifts by OTHER people take the
--   remaining places, ranked after the period rows. A period of 'all' never
--   needs filling.
-- ---------------------------------------------------------------------------
create or replace function public._board(p_machine_id text, p_mode text, p_period text, p_limit int, p_fill int)
returns table (
  machine_id text, mode text, rank bigint, uid uuid, house_name text,
  weight numeric, reps int, sets int, best_ever boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with since as (
    select public._period_start(p_period) as t
  ),
  period_lifts as (
    select 'm' || sl.uid::text as who, sl.uid, null::text as house_name, sl.machine_id, coalesce(sl.mode, '') as mode,
           sl.weight, sl.reps, sl.created_at as at
      from public.set_logs sl, since
     where sl.created_at >= since.t
       and (p_machine_id is null or (sl.machine_id = p_machine_id and coalesce(sl.mode, '') = coalesce(p_mode, '')))
    union all
    select 'h' || lower(h.name), null, h.name, h.machine_id, h.mode, h.weight, h.reps,
           (h.lifted_on + time '12:00') at time zone public.app_timezone()
      from public.house_lifts h, since
     where (h.lifted_on + time '12:00') at time zone public.app_timezone() >= since.t
       and (p_machine_id is null or (h.machine_id = p_machine_id and h.mode = coalesce(p_mode, '')))
  ),
  per as (
    select distinct on (pl.machine_id, pl.mode, pl.who)
           pl.*, count(*) over (partition by pl.machine_id, pl.mode, pl.who)::int as n
      from period_lifts pl
     order by pl.machine_id, pl.mode, pl.who, pl.weight desc, pl.reps desc, pl.at
  ),
  cur as (
    select per.*, rank() over (partition by per.machine_id, per.mode order by per.weight desc, per.reps desc) as rk
      from per
  ),
  shown as (
    select * from cur where p_limit is null or cur.rk <= p_limit
  ),
  counts as (
    select s.machine_id, s.mode, count(*)::int as k from shown s group by s.machine_id, s.mode
  ),
  house_best as (
    select distinct on (h.machine_id, h.mode, lower(h.name))
           'h' || lower(h.name) as who, null::uuid as uid, h.name as house_name, h.machine_id, h.mode, h.weight, h.reps,
           (h.lifted_on + time '12:00') at time zone public.app_timezone() as at,
           count(*) over (partition by h.machine_id, h.mode, lower(h.name))::int as n
      from public.house_lifts h
     where coalesce(p_fill, 0) > 0
       and (p_machine_id is null or (h.machine_id = p_machine_id and h.mode = coalesce(p_mode, '')))
     order by h.machine_id, h.mode, lower(h.name), h.weight desc, h.reps desc, h.lifted_on
  ),
  ever as (
    -- members' all-time bests come straight from machine_stats
    select 'm' || ms.uid::text as who, ms.uid, null::text as house_name, ms.machine_id, ms.mode,
           ms.pb_weight as weight, ms.pb_reps as reps, ms.updated_at as at, ms.sets as n
      from public.machine_stats ms
     where coalesce(p_fill, 0) > 0
       and ms.sets > 0 and ms.pb_weight > 0
       and (p_machine_id is null or (ms.machine_id = p_machine_id and ms.mode = coalesce(p_mode, '')))
    union all
    select hb.who, hb.uid, hb.house_name, hb.machine_id, hb.mode, hb.weight, hb.reps, hb.at, hb.n from house_best hb
  ),
  fill as (
    select e.*, row_number() over (partition by e.machine_id, e.mode order by e.weight desc, e.reps desc, e.at) as fr
      from ever e
     where not exists (select 1 from cur c where c.machine_id = e.machine_id and c.mode = e.mode and c.who = e.who)
  )
  select s.machine_id, s.mode, s.rk, s.uid, s.house_name, s.weight, s.reps, s.n, false
    from shown s
  union all
  select f.machine_id, f.mode, (coalesce(k.k, 0) + f.fr)::bigint, f.uid, f.house_name, f.weight, f.reps, f.n, true
    from fill f
    left join counts k on k.machine_id = f.machine_id and k.mode = f.mode
   where coalesce(k.k, 0) + f.fr <= greatest(coalesce(p_fill, 0), 0)
     and (p_limit is null or coalesce(k.k, 0) + f.fr <= p_limit)
  order by 1, 2, 3;
$$;
revoke all on function public._board(text, text, text, int, int) from public, anon, authenticated;

-- Every machine's board for the TV, the /join page and the landing page.
-- Public (the TV is logged out): first names only, no ids, no photos.
create or replace function public.machine_boards(p_period text default 'today', p_limit int default 5, p_fill int default 3)
returns table (
  machine_id text, mode text, rank bigint, name text,
  pb_weight numeric, pb_reps int, sets int, best_ever boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select b.machine_id, b.mode, b.rank,
         case when b.uid is null then left(b.house_name, 16) else public._first_name(pr.display_name) end,
         b.weight, b.reps, b.sets, b.best_ever
    from public._board(null, null, p_period,
                       greatest(least(coalesce(p_limit, 5), 10), 1),
                       least(greatest(coalesce(p_fill, 3), 0), 5)) b
    left join public.profiles pr on pr.id = b.uid
   where b.uid is null or pr.id is not null
   order by b.machine_id, b.mode, b.rank;
$$;
grant execute on function public.machine_boards(text, int, int) to anon, authenticated;

-- One machine's full board in the app (Ranks -> By machine, the machine page).
-- Same columns as leaderboard_machine() plus best_ever / house.
create or replace function public.machine_board(p_machine_id text, p_mode text default '', p_period text default 'all', p_fill int default 3)
returns table (
  machine_id text, mode text, uid uuid, display_name text, avatar_url text,
  pb_weight numeric, pb_reps int, xp int, level int, sets int, rank bigint,
  best_ever boolean, house boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select b.machine_id, b.mode, b.uid,
         case when b.uid is null then b.house_name else public._public_name(pr.display_name) end,
         pr.avatar_url, b.weight, b.reps,
         coalesce(ms.xp, 0), coalesce(ms.level, 1), b.sets, b.rank, b.best_ever, b.uid is null
    from public._board(p_machine_id, coalesce(p_mode, ''), p_period, null, least(greatest(coalesce(p_fill, 3), 0), 5)) b
    left join public.profiles pr on pr.id = b.uid
    left join public.machine_stats ms on ms.uid = b.uid and ms.machine_id = b.machine_id and ms.mode = b.mode
   where b.uid is null or pr.id is not null
   order by b.rank;
$$;
revoke all on function public.machine_board(text, text, text, int) from public, anon;
grant execute on function public.machine_board(text, text, text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. TV slide settings: times per loop + seconds per slide, per kind
-- ---------------------------------------------------------------------------
-- For each kind: the new value if it's a number, else the old one, else the
-- default; then kept within limits (Join always shows at least once).
create or replace function public._tv_slides_clean(p_new jsonb, p_old jsonb default '{}'::jsonb)
returns jsonb
language sql
immutable
as $$
  select jsonb_object_agg(d.k, jsonb_build_object(
           'times', least(greatest(round(coalesce(
                      case when (p_new->d.k->>'times') ~ '^\d+(\.\d+)?$' then (p_new->d.k->>'times')::numeric end,
                      case when (p_old->d.k->>'times') ~ '^\d+(\.\d+)?$' then (p_old->d.k->>'times')::numeric end,
                      d.times))::int, d.min_times), 6),
           'seconds', least(greatest(round(coalesce(
                      case when (p_new->d.k->>'seconds') ~ '^\d+(\.\d+)?$' then (p_new->d.k->>'seconds')::numeric end,
                      case when (p_old->d.k->>'seconds') ~ '^\d+(\.\d+)?$' then (p_old->d.k->>'seconds')::numeric end,
                      d.secs))::int, 5), 30)))
    from (values ('join', 2, 12, 1), ('howto', 2, 12, 0), ('board', 4, 10, 0), ('today', 2, 10, 0),
                 ('prize', 1, 9, 0), ('challenge', 1, 9, 0), ('partner', 1, 8, 0), ('winners', 1, 8, 0))
         as d(k, times, secs, min_times);
$$;

alter table public.rr_settings add column if not exists tv_slides jsonb;
update public.rr_settings set tv_slides = public._tv_slides_clean(coalesce(tv_slides, '{}'::jsonb), '{}'::jsonb) where id = 1;
alter table public.rr_settings alter column tv_slides set default public._tv_slides_clean('{}'::jsonb, '{}'::jsonb);
alter table public.rr_settings alter column tv_slides set not null;

-- Same as 0012, plus tv_slides. Only the fields sent are changed.
create or replace function public.admin_save_rr_settings(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_staff();
  if p ? 'gym_name' and char_length(trim(coalesce(p->>'gym_name', ''))) < 1 then
    raise exception 'The gym needs a name' using errcode = '22023';
  end if;
  if p ? 'tv_slides' and jsonb_typeof(p->'tv_slides') <> 'object' then
    raise exception 'TV slide settings look wrong' using errcode = '22023';
  end if;
  update public.rr_settings set
    gym_name = case when p ? 'gym_name' then left(trim(p->>'gym_name'), 60) else gym_name end,
    gym_location = case when p ? 'gym_location' then nullif(left(trim(p->>'gym_location'), 60), '') else gym_location end,
    gym_logo_url = case when p ? 'gym_logo_url' then nullif(trim(p->>'gym_logo_url'), '') else gym_logo_url end,
    gym_logo_dark_url = case when p ? 'gym_logo_dark_url' then nullif(trim(p->>'gym_logo_dark_url'), '') else gym_logo_dark_url end,
    gym_instagram_url = case when p ? 'gym_instagram_url' then nullif(trim(p->>'gym_instagram_url'), '') else gym_instagram_url end,
    gym_website_url = case when p ? 'gym_website_url' then nullif(trim(p->>'gym_website_url'), '') else gym_website_url end,
    prize_headline = case when p ? 'prize_headline' then nullif(left(trim(p->>'prize_headline'), 60), '') else prize_headline end,
    rewards_note = case when p ? 'rewards_note' then nullif(left(trim(p->>'rewards_note'), 160), '') else rewards_note end,
    show_partners = coalesce((p->>'show_partners')::boolean, show_partners),
    show_shop = coalesce((p->>'show_shop')::boolean, show_shop),
    tv_slides = case when p ? 'tv_slides' then public._tv_slides_clean(p->'tv_slides', tv_slides) else tv_slides end,
    updated_at = now(),
    updated_by = auth.uid()
  where id = 1;
  perform public._log_staff_action('save_rr_settings', null, null,
    case when p ? 'tv_slides' and (select count(*) from jsonb_object_keys(p)) = 1 then 'TV slide settings saved'
         else 'Gym / Rewards page settings saved' end);
end;
$$;
revoke all on function public.admin_save_rr_settings(jsonb) from public, anon;
grant execute on function public.admin_save_rr_settings(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Partner ads on the TV
-- ---------------------------------------------------------------------------
alter table public.sponsors add column if not exists show_on_tv boolean not null default true;
alter table public.sponsors add column if not exists tv_headline text;
alter table public.sponsors drop constraint if exists sponsors_tv_headline_len;
alter table public.sponsors add constraint sponsors_tv_headline_len check (tv_headline is null or char_length(tv_headline) <= 60);

alter table public.sponsor_clicks add column if not exists source text not null default 'app';
alter table public.sponsor_clicks drop constraint if exists sponsor_clicks_source_check;
alter table public.sponsor_clicks add constraint sponsor_clicks_source_check check (source in ('app', 'tv'));

-- Same as 0012, plus show_on_tv / tv_headline. Only the fields sent are changed.
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
    raise exception 'Brand id: 2-40 lowercase letters, numbers or dashes' using errcode = '22023';
  end if;
  if not exists (select 1 from public.sponsors where id = v_id) then
    if char_length(trim(coalesce(p->>'name', ''))) < 1 then
      raise exception 'Give the brand a name' using errcode = '22023';
    end if;
    insert into public.sponsors (id, name) values (v_id, left(trim(p->>'name'), 60));
  end if;
  update public.sponsors set
    name = case when p ? 'name' and char_length(trim(p->>'name')) > 0 then left(trim(p->>'name'), 60) else name end,
    tagline = case when p ? 'tagline' then nullif(trim(p->>'tagline'), '') else tagline end,
    blurb = case when p ? 'blurb' then nullif(trim(p->>'blurb'), '') else blurb end,
    website_url = case when p ? 'website_url' then nullif(trim(p->>'website_url'), '') else website_url end,
    instagram_url = case when p ? 'instagram_url' then nullif(trim(p->>'instagram_url'), '') else instagram_url end,
    logo_url = case when p ? 'logo_url' then nullif(trim(p->>'logo_url'), '') else logo_url end,
    cover_url = case when p ? 'cover_url' then nullif(trim(p->>'cover_url'), '') else cover_url end,
    category = case when p ? 'category' then nullif(trim(p->>'category'), '') else category end,
    show_on_tv = coalesce((p->>'show_on_tv')::boolean, show_on_tv),
    tv_headline = case when p ? 'tv_headline' then nullif(left(trim(p->>'tv_headline'), 60), '') else tv_headline end,
    active = coalesce((p->>'active')::boolean, active),
    sort = coalesce(nullif(p->>'sort', '')::int, sort)
  where id = v_id;
  perform public._log_staff_action('save_sponsor', null, null, v_id);
  return v_id;
end;
$$;
revoke all on function public.admin_save_sponsor(jsonb) from public, anon;
grant execute on function public.admin_save_sponsor(jsonb) to authenticated;

-- Counts a visit to a brand (from the app, or a scan of its TV QR code) and
-- hands back where to send the visitor: the product's link, else the brand's
-- website. Replaces 0011's two-argument version; old calls still work.
drop function if exists public.track_sponsor_click(text, bigint);
create or replace function public.track_sponsor_click(p_sponsor_id text, p_product_id bigint default null, p_source text default 'app')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src text := case when p_source = 'tv' then 'tv' else 'app' end;
  v_url text;
  v_product bigint;
begin
  select coalesce(nullif(pr.url, ''), sp.website_url), pr.id into v_url, v_product
    from public.sponsors sp
    left join public.sponsor_products pr on pr.id = p_product_id and pr.sponsor_id = sp.id and pr.active
   where sp.id = p_sponsor_id and sp.active;
  if not found then
    return null;
  end if;
  -- keep the numbers honest: one visit per person per link per 30 s, and at
  -- most 60 a minute per brand (stops a script inflating a brand's report)
  if auth.uid() is not null and exists (
       select 1 from public.sponsor_clicks
        where uid = auth.uid() and sponsor_id = p_sponsor_id
          and product_id is not distinct from v_product
          and created_at > now() - interval '30 seconds') then
    return v_url;
  end if;
  if (select count(*) from public.sponsor_clicks where sponsor_id = p_sponsor_id and created_at > now() - interval '1 minute') >= 60 then
    return v_url;
  end if;
  insert into public.sponsor_clicks (sponsor_id, product_id, uid, source)
  values (p_sponsor_id, v_product, auth.uid(), v_src);
  return v_url;
end;
$$;
revoke all on function public.track_sponsor_click(text, bigint, text) from public;
grant execute on function public.track_sponsor_click(text, bigint, text) to anon, authenticated;

-- R&R Controls data: + TV scans per brand (last 30 days).
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
                                  from public._challenge_scores(c.id) x join public.profiles p on p.id = x.uid where x.rank <= 5), '[]'::jsonb))
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

-- ---------------------------------------------------------------------------
-- 5. Everything the TV shows, in one public call
-- ---------------------------------------------------------------------------
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
        from public.season_board(v_season, 5) b), '[]'::jsonb) end
  );
end;
$$;
grant execute on function public.tv_feed() to anon, authenticated;

do $$
declare
  f text;
begin
  foreach f in array array['admin_save_house_lift(jsonb)', 'admin_delete_house_lift(bigint)', 'admin_house_lifts()'] loop
    execute 'revoke all on function public.' || f || ' from public, anon';
    execute 'grant execute on function public.' || f || ' to authenticated';
  end loop;
end;
$$;
