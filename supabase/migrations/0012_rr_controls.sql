-- ============================================================================
-- 0012_rr_controls.sql   (run after 0011_rewards.sql)
--
-- R&R Controls: everything on the Rewards page is edited by staff at /rnr.
--
--   1. rr_settings: the gym (name, location, logos, links) shown across the
--      app, TV and share images, plus a few Rewards-page switches.
--   2. Photos: a public "rr-media" storage bucket that only staff can upload
--      to, used for prize photos, brand logos/covers and product photos.
--      Prizes get a photo; brands get a cover photo.
--   3. Weekly challenges: a challenge "series" repeats on the same day and
--      time every week (e.g. the Clean Crate Leg Press Challenge, every
--      Friday). Each week's round is created automatically, has its own
--      board and is awarded on its own.
--   4. Seeds the Clean Crate Leg Press Challenge: every Friday, all day
--      (India time), heaviest single Leg Press set wins a goodie bag.
--
-- Safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Gym + Rewards page settings
-- ---------------------------------------------------------------------------
create table if not exists public.rr_settings (
  id int primary key default 1 check (id = 1),
  gym_name text not null default 'Club 360' check (char_length(gym_name) between 1 and 60),
  gym_location text,
  gym_logo_url text,       -- for light backgrounds
  gym_logo_dark_url text,  -- for dark backgrounds (a white / light logo)
  gym_instagram_url text,
  gym_website_url text,
  prize_headline text,     -- optional: replaces "This week's prize"
  rewards_note text,       -- optional: one line under the prize
  show_partners boolean not null default true,
  show_shop boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
insert into public.rr_settings (id) values (1) on conflict (id) do nothing;

alter table public.rr_settings enable row level security;
drop policy if exists "anyone reads rr settings" on public.rr_settings;
create policy "anyone reads rr settings" on public.rr_settings for select to anon, authenticated using (true);
revoke insert, update, delete on public.rr_settings from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Photos
-- ---------------------------------------------------------------------------
alter table public.prize_templates add column if not exists image_url text;
alter table public.season_prizes add column if not exists image_url text;
alter table public.sponsors add column if not exists cover_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rr-media', 'rr-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "rr media: anyone can view" on storage.objects;
create policy "rr media: anyone can view"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'rr-media');

drop policy if exists "rr media: staff upload" on storage.objects;
create policy "rr media: staff upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'rr-media' and public.is_staff());

drop policy if exists "rr media: staff update" on storage.objects;
create policy "rr media: staff update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'rr-media' and public.is_staff())
  with check (bucket_id = 'rr-media' and public.is_staff());

drop policy if exists "rr media: staff delete" on storage.objects;
create policy "rr media: staff delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'rr-media' and public.is_staff());

-- ---------------------------------------------------------------------------
-- 3. Weekly challenge series
-- ---------------------------------------------------------------------------
create table if not exists public.challenge_series (
  id bigint generated always as identity primary key,
  sponsor_id text references public.sponsors (id) on delete set null,
  title text not null check (char_length(title) between 1 and 80),
  description text,
  metric text not null default 'best_lift' check (metric in ('best_lift', 'sets', 'volume')),
  machine_id text,
  mode text,
  -- the first round; every later round is the same window + N weeks
  first_start timestamptz not null,
  first_end timestamptz not null,
  prize text,
  reward_id bigint references public.rewards (id) on delete set null,
  winners int not null default 1 check (winners between 1 and 20),
  join_xp int not null default 20 check (join_xp between 0 and 500),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (first_end > first_start and first_end <= first_start + interval '7 days')
);

alter table public.challenges add column if not exists series_id bigint references public.challenge_series (id) on delete set null;
create unique index if not exists challenges_series_round_uidx on public.challenges (series_id, starts_at) where series_id is not null;

alter table public.challenge_series enable row level security;
drop policy if exists "read active series" on public.challenge_series;
create policy "read active series" on public.challenge_series for select to anon, authenticated using (active or public.is_staff());
revoke insert, update, delete on public.challenge_series from anon, authenticated;

-- Creates this week's round of every active series (or next week's, once
-- this week's has ended). Cheap and safe to call often.
create or replace function public._ensure_challenge_rounds()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  k int;
  v_start timestamptz;
  v_end timestamptz;
begin
  for t in select * from public.challenge_series where active loop
    k := greatest(0, ceil(extract(epoch from (now() - t.first_end)) / 604800.0)::int);
    v_start := t.first_start + make_interval(days => 7 * k);
    v_end := t.first_end + make_interval(days => 7 * k);
    if v_end <= now() then
      v_start := v_start + interval '7 days';
      v_end := v_end + interval '7 days';
    end if;
    insert into public.challenges (series_id, sponsor_id, title, description, metric, machine_id, mode,
                                   starts_at, ends_at, prize, reward_id, winners, join_xp, active)
    values (t.id, t.sponsor_id, t.title, t.description, t.metric, t.machine_id, t.mode,
            v_start, v_end, t.prize, t.reward_id, t.winners, t.join_xp, true)
    on conflict (series_id, starts_at) where series_id is not null do nothing;
  end loop;
end;
$$;
revoke all on function public._ensure_challenge_rounds() from public, anon, authenticated;

-- Series as staff see / edit it: day of week (1 = Monday ... 7 = Sunday)
-- and times on the gym's clock.
create or replace function public._series_json(s public.challenge_series)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(s) || jsonb_build_object(
    'weekday', extract(isodow from s.first_start at time zone public.app_timezone())::int,
    'start_time', to_char(s.first_start at time zone public.app_timezone(), 'HH24:MI'),
    'end_time', case when (s.first_end - s.first_start) = interval '24 hours'
                          and to_char(s.first_start at time zone public.app_timezone(), 'HH24:MI') = '00:00'
                     then '24:00'
                     else to_char(s.first_end at time zone public.app_timezone(), 'HH24:MI') end
  );
$$;
revoke all on function public._series_json(public.challenge_series) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Season prizes now carry a photo
-- ---------------------------------------------------------------------------
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
    insert into public.season_prizes (season_id, rank_from, rank_to, title, description, sponsor_ids, reward_id, sort, image_url)
    select v_id, rank_from, rank_to, title, description, sponsor_ids, reward_id, sort, image_url
      from public.prize_templates;
  end if;
  return v_id;
end;
$$;
revoke all on function public._ensure_current_season() from public, anon, authenticated;

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
    insert into public.prize_templates (rank_from, rank_to, title, description, sponsor_ids, reward_id, sort, image_url)
    values ((e->>'rank_from')::int, coalesce((e->>'rank_to')::int, (e->>'rank_from')::int), left(trim(e->>'title'), 90),
            nullif(left(trim(coalesce(e->>'description', '')), 300), ''),
            coalesce(array(select jsonb_array_elements_text(coalesce(e->'sponsor_ids', '[]'::jsonb))), '{}'),
            nullif(e->>'reward_id', '')::bigint, i, nullif(trim(coalesce(e->>'image_url', '')), ''));
  end loop;
  if p_apply_current then
    v_season := public._ensure_current_season();
    if (select awarded_at from public.seasons where id = v_season) is null then
      delete from public.season_prizes where season_id = v_season;
      insert into public.season_prizes (season_id, rank_from, rank_to, title, description, sponsor_ids, reward_id, sort, image_url)
      select v_season, rank_from, rank_to, title, description, sponsor_ids, reward_id, sort, image_url from public.prize_templates;
    end if;
  end if;
  perform public._log_staff_action('save_prizes', null, null, jsonb_array_length(p_prizes) || ' prize rows saved');
end;
$$;
revoke all on function public.admin_save_prizes(jsonb, boolean) from public, anon;
grant execute on function public.admin_save_prizes(jsonb, boolean) to authenticated;

-- Brands now have a cover photo. Only the fields sent are changed.
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
    active = coalesce((p->>'active')::boolean, active),
    sort = coalesce(nullif(p->>'sort', '')::int, sort)
  where id = v_id;
  perform public._log_staff_action('save_sponsor', null, null, v_id);
  return v_id;
end;
$$;
revoke all on function public.admin_save_sponsor(jsonb) from public, anon;
grant execute on function public.admin_save_sponsor(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The Rewards page catalogue (adds photos, gym, the leader and weekly
--    challenge info)
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
                     from public._season_ranked(s.id) r join public.profiles pr on pr.id = r.uid where r.rank = 1)
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
               'last_result', case when c.series_id is null then null else (
                 select jsonb_build_object('ends_at', prev.ends_at, 'name', public._first_name(p.display_name), 'value', x.value, 'reps', x.reps)
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
-- 6. R&R Controls (staff only, every change logged)
-- ---------------------------------------------------------------------------
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
    -- one-off challenges + the last 8 weeks of weekly rounds
    'challenges', coalesce((
      select jsonb_agg(to_jsonb(c) || jsonb_build_object(
               'players', (select count(*) from public._challenge_scores(c.id)),
               'top', coalesce((select jsonb_agg(jsonb_build_object('rank', x.rank, 'name', public._public_name(p.display_name), 'value', x.value, 'reps', x.reps) order by x.rank)
                                  from public._challenge_scores(c.id) x join public.profiles p on p.id = x.uid where x.rank <= 5), '[]'::jsonb))
             order by c.ends_at desc)
        from public.challenges c
       where c.series_id is null or c.ends_at > now() - interval '56 days'), '[]'::jsonb)
  );
end;
$$;

-- p: {id?, title, description, sponsor_id, metric, machine_id, mode,
--     weekday 1-7 (Mon-Sun), start_time 'HH:MM', end_time 'HH:MM' or '24:00',
--     prize, reward_id, winners, join_xp, active}
create or replace function public.admin_save_series(p jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint := nullif(p->>'id', '')::bigint;
  v_title text := left(trim(coalesce(p->>'title', '')), 80);
  v_tz text := public.app_timezone();
  v_day int := coalesce(nullif(p->>'weekday', '')::int, 5);
  v_from interval;
  v_to interval;
  v_start timestamptz;
  v_end timestamptz;
  v_old public.challenge_series;
begin
  perform public._require_staff();
  if char_length(v_title) < 2 then
    raise exception 'Give the challenge a name' using errcode = '22023';
  end if;
  if v_day not between 1 and 7 then
    raise exception 'Pick a day of the week' using errcode = '22023';
  end if;
  begin
    v_from := coalesce(nullif(p->>'start_time', ''), '00:00')::time::interval;
    v_to := case when coalesce(nullif(p->>'end_time', ''), '24:00') in ('24:00', '00:00') then interval '24 hours'
                 else (p->>'end_time')::time::interval end;
  exception when others then
    raise exception 'Times look wrong. Use 24-hour times like 06:00 and 22:00' using errcode = '22023';
  end;
  if v_to <= v_from then
    raise exception 'The end time has to be after the start time' using errcode = '22023';
  end if;
  -- this week's chosen day on the gym's clock
  v_start := (date_trunc('week', now() at time zone v_tz) + make_interval(days => v_day - 1) + v_from) at time zone v_tz;
  v_end := (date_trunc('week', now() at time zone v_tz) + make_interval(days => v_day - 1) + v_to) at time zone v_tz;

  if v_id is null then
    insert into public.challenge_series (sponsor_id, title, description, metric, machine_id, mode, first_start, first_end,
                                         prize, reward_id, winners, join_xp, active)
    values (nullif(p->>'sponsor_id', ''), v_title, nullif(trim(p->>'description'), ''), coalesce(nullif(p->>'metric', ''), 'best_lift'),
            nullif(p->>'machine_id', ''), nullif(p->>'mode', ''), v_start, v_end, nullif(trim(p->>'prize'), ''),
            nullif(p->>'reward_id', '')::bigint, coalesce(nullif(p->>'winners', '')::int, 1),
            coalesce(nullif(p->>'join_xp', '')::int, 20), coalesce((p->>'active')::boolean, true))
    returning id into v_id;
  else
    select * into v_old from public.challenge_series where id = v_id for update;
    if not found then
      raise exception 'Challenge not found' using errcode = 'P0002';
    end if;
    update public.challenge_series set
      sponsor_id = case when p ? 'sponsor_id' then nullif(p->>'sponsor_id', '') else sponsor_id end,
      title = v_title,
      description = case when p ? 'description' then nullif(trim(p->>'description'), '') else description end,
      metric = coalesce(nullif(p->>'metric', ''), metric),
      machine_id = case when p ? 'machine_id' then nullif(p->>'machine_id', '') else machine_id end,
      mode = case when p ? 'mode' then nullif(p->>'mode', '') else mode end,
      first_start = case when p ? 'weekday' or p ? 'start_time' or p ? 'end_time' then v_start else first_start end,
      first_end = case when p ? 'weekday' or p ? 'start_time' or p ? 'end_time' then v_end else first_end end,
      prize = case when p ? 'prize' then nullif(trim(p->>'prize'), '') else prize end,
      reward_id = case when p ? 'reward_id' then nullif(p->>'reward_id', '')::bigint else reward_id end,
      winners = coalesce(nullif(p->>'winners', '')::int, winners),
      join_xp = coalesce(nullif(p->>'join_xp', '')::int, join_xp),
      active = coalesce((p->>'active')::boolean, active)
    where id = v_id;
    -- rounds that haven't started yet are rebuilt from the new settings ...
    delete from public.challenges c
     where c.series_id = v_id and c.awarded_at is null and c.starts_at > now()
       and not exists (select 1 from public.redemptions d where d.challenge_id = c.id);
    -- ... and a round that's running now takes the new wording / prize / on-off
    update public.challenges c set
      sponsor_id = s.sponsor_id, title = s.title, description = s.description, prize = s.prize,
      reward_id = s.reward_id, winners = s.winners, join_xp = s.join_xp, active = s.active
    from public.challenge_series s
    where s.id = v_id and c.series_id = v_id and c.awarded_at is null and c.ends_at > now();
  end if;
  perform public._ensure_challenge_rounds();
  perform public._log_staff_action('save_series', null, nullif(p->>'machine_id', ''), v_title);
  return v_id;
end;
$$;

-- Only the fields sent are changed.
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
    updated_at = now(),
    updated_by = auth.uid()
  where id = 1;
  perform public._log_staff_action('save_rr_settings', null, null, 'Gym / Rewards page settings saved');
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array['admin_rr_data()', 'admin_save_series(jsonb)', 'admin_save_rr_settings(jsonb)'] loop
    execute 'revoke all on function public.' || f || ' from public, anon';
    execute 'grant execute on function public.' || f || ' to authenticated';
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Starting content (first run only)
-- ---------------------------------------------------------------------------
-- The Clean Crate Leg Press Challenge: every Friday, all day.
insert into public.challenge_series (sponsor_id, title, description, metric, machine_id, first_start, first_end, prize, winners, join_xp, active)
select 'clean-crate', 'Clean Crate Leg Press Challenge',
       'Every Friday: the heaviest single Leg Press set of the day wins a goodie bag from The Clean Crate. Everyone who joins gets +20 XP.',
       'best_lift', 'leg-press-08',
       (date_trunc('week', now() at time zone public.app_timezone()) + interval '4 days') at time zone public.app_timezone(),
       (date_trunc('week', now() at time zone public.app_timezone()) + interval '5 days') at time zone public.app_timezone(),
       'A goodie bag from The Clean Crate', 1, 20, true
where not exists (select 1 from public.challenge_series)
  and exists (select 1 from public.sponsors where id = 'clean-crate');

-- 0011's sample "Clean Crate Leg Day" draft is replaced by the weekly one.
delete from public.challenges c
 where c.title = 'Clean Crate Leg Day' and not c.active and c.awarded_at is null and c.series_id is null
   and c.description = 'Heaviest Leg Press set this week wins. Everyone who joins gets +20 XP.'
   and not exists (select 1 from public.redemptions d where d.challenge_id = c.id);

select public._ensure_challenge_rounds();
