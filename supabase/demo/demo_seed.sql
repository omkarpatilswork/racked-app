-- ============================================================================
-- demo_seed.sql — sample data to try the whole app (Racked by Bijlee)
--
-- Adds 20 sample members (12 on the Men's board, 7 on the Women's, 1 "prefer
-- not to say") with body weights, 3 weeks of sets on all 10 machines (PRs,
-- streaks, today's activity), pump checks, posts, photos, transformations,
-- comments and kudos, a pinned notice, a sample partner offer, a sample
-- challenge running this week and last week's winners.
--
-- Sample members can't sign in, and they never win real prizes or
-- challenges. Real members WILL see them (boards, TV, feed) until you run
-- demo_remove.sql. Running this file again refreshes the sample data so
-- "today" and "this week" stay busy.
--
-- Needs the database updates up to 0015_strength_boards.sql.
-- Supabase -> SQL Editor -> New query -> paste this whole file -> Run.
-- ============================================================================
do $$
begin
  if to_regclass('public.member_body') is null or to_regclass('public.wall_posts') is null then
    raise exception 'Run the database updates up to 0015_strength_boards.sql first';
  end if;
end;
$$;

-- 0. start clean (same steps as demo_remove.sql)
do $$
declare
  v_demo text := 'dddddddd-dddd-4ddd-8ddd-%';
begin
  if to_regclass('public._demo_seeded') is not null then
    update public.seasons s set awarded_at = null, awarded_by = null
     where s.id in (select val::bigint from public._demo_seeded where key like 'season_awarded:%');
    delete from public.challenges where id in (select val::bigint from public._demo_seeded where key like 'challenge:%');
  end if;
  delete from public.post_kudos where post_id in (select id from public.set_logs where uid::text like v_demo);
  delete from public.photo_kudos where item_id in (select id from public.pump_photos where uid::text like v_demo);
  delete from public.feed_comments
   where (target_type = 'set' and target_id in (select id from public.set_logs where uid::text like v_demo))
      or (target_type = 'photo' and target_id in (select id from public.pump_photos where uid::text like v_demo))
      or (target_type = 'wall' and target_id in (select id from public.wall_posts where uid::text like v_demo));
  delete from public.gym_posts where created_by::text like v_demo;
  delete from auth.users where id::text like v_demo;
  delete from public.profiles where id::text like v_demo;
  if to_regclass('public._demo_seeded') is not null then
    delete from public.seasons s
     where s.id in (select val::bigint from public._demo_seeded where key like 'season_created:%')
       and s.awarded_at is null
       and not exists (select 1 from public.season_winners w where w.season_id = s.id)
       and not exists (select 1 from public.redemptions r where r.season_id = s.id);
  end if;
end;
$$;
drop table if exists public._demo_seeded;

-- what the sample data created, so demo_remove.sql can undo it exactly
create table public._demo_seeded (key text primary key, val text not null);
alter table public._demo_seeded enable row level security;
revoke all on public._demo_seeded from public, anon, authenticated;

do $$
declare
  v_tz text := public.app_timezone();
  v_now timestamptz := now();
  v_today date := (now() at time zone public.app_timezone())::date;
  v_week_start timestamptz := date_trunc('week', now() at time zone public.app_timezone()) at time zone public.app_timezone();
  v_cols text;
  v_vals text;
  dp record;
  v_day int;
  v_at timestamptz;
  v_sess int;
  v_split int;
  v_m record;
  v_set int;
  v_kg numeric;
  v_reps int;
  v_max numeric;
  v_prog numeric;
  v_days int[];
  v_level int;
  v_left int;
  r record;
  v_post bigint;
  v_season bigint;
  v_last_start timestamptz;
  v_last_end timestamptz;
  v_ch bigint;
  v_n int;
begin
  perform setseed(0.4242);

  -- 1. the people ---------------------------------------------------------
  create temp table demo_people (
    n int, id uuid, name text, division text, body_kg numeric, strength numeric, sessions int, today boolean
  ) on commit drop;
  insert into demo_people (n, name, division, body_kg, strength, sessions, today) values
    (1,  'Aarav Shah',        'men',   78,  1.18, 13, true),
    (2,  'Rohan Kulkarni',    'men',   84,  1.10, 12, true),
    (3,  'Kabir Mehta',       'men',   72,  1.22, 11, true),
    (4,  'Vikram Joshi',      'men',   91,  1.02, 10, true),
    (5,  'Arjun Nair',        'men',   68,  1.12, 12, false),
    (6,  'Siddharth Patil',   'men',   80,  0.95,  9, true),
    (7,  'Nikhil Deshpande',  'men',   76,  0.88,  8, false),
    (8,  'Yash Gupta',        'men',   88,  1.00,  7, true),
    (9,  'Aditya Rao',        'men',   70,  0.92,  9, false),
    (10, 'Karan Malhotra',    'men',   95,  1.05,  6, true),
    (11, 'Pranav Iyer',       'men',   65,  0.85,  8, false),
    (12, 'Ishaan Kapoor',     'men',   82,  0.80,  5, false),
    (13, 'Ananya Sharma',     'women', 58,  1.15, 12, true),
    (14, 'Priya Menon',       'women', 62,  1.08, 11, true),
    (15, 'Sneha Joshi',       'women', 55,  1.20, 10, true),
    (16, 'Riya Desai',        'women', 64,  0.95,  9, false),
    (17, 'Meera Pillai',      'women', 60,  1.00,  9, true),
    (18, 'Kavya Reddy',       'women', 53,  0.90,  7, false),
    (19, 'Tanvi Bhat',        'women', 67,  0.85,  6, false),
    (20, 'Sam Fernandes',     'open',  74,  1.00,  7, true);
  update demo_people set id = ('dddddddd-dddd-4ddd-8ddd-' || lpad(n::text, 12, '0'))::uuid;

  -- auth.users: only the columns this project has (newer Supabase versions
  -- need the token columns to be '' instead of empty)
  select string_agg(c.col, ', ' order by c.ord), string_agg(c.expr, ', ' order by c.ord)
    into v_cols, v_vals
    from (values
            (1, 'id', 'p.id'),
            (2, 'instance_id', '''00000000-0000-0000-0000-000000000000''::uuid'),
            (3, 'aud', '''authenticated'''),
            (4, 'role', '''authenticated'''),
            (5, 'email', '''demo'' || lpad(p.n::text, 2, ''0'') || ''@demo.racked.invalid'''),
            (6, 'encrypted_password', ''''''),
            (7, 'email_confirmed_at', 'now()'),
            (8, 'raw_app_meta_data', '''{"provider":"email","providers":["email"],"demo":true}''::jsonb'),
            (9, 'raw_user_meta_data', 'jsonb_build_object(''full_name'', p.name)'),
            (10, 'created_at', 'now() - interval ''35 days'''),
            (11, 'updated_at', 'now()'),
            (12, 'confirmation_token', ''''''),
            (13, 'recovery_token', ''''''),
            (14, 'email_change_token_new', ''''''),
            (15, 'email_change', '''''')
         ) c(ord, col, expr)
   where exists (select 1 from information_schema.columns i
                  where i.table_schema = 'auth' and i.table_name = 'users' and i.column_name = c.col);
  execute format('insert into auth.users (%s) select %s from demo_people p', v_cols, v_vals);

  -- profiles come from the sign-up trigger; make sure, then tidy
  insert into public.profiles (id, display_name)
  select p.id, p.name from demo_people p
  on conflict (id) do update set display_name = excluded.display_name;
  update public.profiles pr set created_at = now() - interval '35 days' from demo_people p where pr.id = p.id;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'onboarded_at') then
    execute 'update public.profiles pr set onboarded_at = now() - interval ''35 days'' from demo_people p where pr.id = p.id';
  end if;

  insert into public.member_body (uid, division, body_kg, body_set_at, division_set_at)
  select p.id, p.division, p.body_kg, now() - interval '30 days', now() - interval '30 days' from demo_people p;

  -- 2. three weeks of training -------------------------------------------
  create temp table demo_machines (split int, machine_id text, mode text, ratio numeric) on commit drop;
  insert into demo_machines values
    (1, 'chest-press-02', null, 0.78), (1, 'shoulder-press-05', null, 0.52), (1, 'pec-fly-rear-delt-04', 'pec-fly', 0.50),
    (2, 'lat-pulldown-01', null, 0.72), (2, 'rowing-03', null, 0.70), (2, 'biceps-preacher-06', null, 0.30),
    (2, 'pec-fly-rear-delt-04', 'rear-delt', 0.30), (2, 'deadlift-10', null, 1.30),
    (3, 'squat-07', null, 1.05), (3, 'leg-press-08', null, 2.10), (3, 'leg-extension-09', null, 0.65);
  create temp table demo_sets (uid uuid, machine_id text, mode text, weight numeric, reps int, at timestamptz) on commit drop;

  for dp in select * from demo_people loop
    -- which days ago they trained (0 = today), spread over 21 days
    select array_agg(d order by d desc) into v_days
      from (select d from generate_series(1, 20) d order by random() limit greatest(dp.sessions - case when dp.today then 1 else 0 end, 1)) x;
    if dp.today then
      v_days := v_days || 0;
    end if;
    v_sess := 0;
    foreach v_day in array v_days loop
      v_sess := v_sess + 1;
      v_split := ((dp.n + v_sess) % 3) + 1;
      -- morning or evening, gym time; today never later than a few minutes ago
      v_at := ((v_today - v_day) + (case when (dp.n + v_sess) % 2 = 0 then time '06:30' else time '18:00' end)
               + make_interval(mins => floor(random() * 150)::int)) at time zone v_tz;
      if v_at > v_now - interval '10 minutes' then
        v_at := v_now - make_interval(mins => 15 + floor(random() * 240)::int);
      end if;
      v_prog := 0.90 + 0.10 * (21 - v_day) / 21.0;   -- a little stronger every week
      for v_m in select * from demo_machines where split = v_split order by random() limit 3 loop
        select max_weight into v_max from public.machine_limits where machine_id = v_m.machine_id;
        for v_set in 1..3 loop
          v_kg := dp.body_kg * v_m.ratio * dp.strength * v_prog
                  * case dp.division when 'women' then 0.62 when 'open' then 0.8 else 1 end
                  * case v_set when 1 then 0.9 when 2 then 1.0 else 1.0 + (random() * 0.05) end;
          v_kg := least(greatest(round(v_kg / 2.5) * 2.5, 2.5), coalesce(v_max, 400));
          v_reps := case v_set when 1 then 12 when 2 then 10 else 8 end + floor(random() * 3)::int - 1;
          insert into demo_sets values (dp.id, v_m.machine_id, v_m.mode, v_kg, v_reps, v_at);
          v_at := v_at + make_interval(secs => 120 + floor(random() * 90)::int);
        end loop;
        v_at := v_at + interval '3 minutes';
      end loop;
    end loop;
  end loop;
  -- nothing in the last 10 minutes (the app refuses sets 8 s apart)
  update demo_sets set at = v_now - interval '10 minutes' - make_interval(secs => floor(random() * 600)::int) where at > v_now - interval '10 minutes';

  insert into public.set_logs (uid, machine_id, mode, weight, reps, is_pb, xp_gain, created_at)
  select s.uid, s.machine_id, s.mode, s.weight, s.reps,
         s.weight > coalesce(max(s.weight) over (partition by s.uid, s.machine_id, coalesce(s.mode, '') order by s.at
                                                  rows between unbounded preceding and 1 preceding), 0),
         10, s.at
    from demo_sets s
   order by s.at;
  update public.set_logs set xp_gain = 60 where is_pb and uid in (select id from demo_people);

  -- machine stats, levels, check-ins
  insert into public.machine_stats (uid, machine_id, mode, pb_weight, pb_reps, sets, sessions, volume, xp, level, last_date, sets_today, updated_at)
  select sl.uid, sl.machine_id, coalesce(sl.mode, ''),
         max(sl.weight),
         (array_agg(sl.reps order by sl.weight desc, sl.reps desc))[1],
         count(*)::int,
         count(distinct (sl.created_at at time zone v_tz)::date)::int,
         sum(sl.weight * sl.reps),
         sum(sl.xp_gain)::int, 1,
         max((sl.created_at at time zone v_tz)::date),
         count(*) filter (where (sl.created_at at time zone v_tz)::date = v_today)::int,
         max(sl.created_at)
    from public.set_logs sl
   where sl.uid in (select id from demo_people)
   group by sl.uid, sl.machine_id, coalesce(sl.mode, '');
  for r in select ms.uid, ms.machine_id, ms.mode, ms.xp from public.machine_stats ms where ms.uid in (select id from demo_people) loop
    v_level := 1;
    v_left := r.xp;
    while v_left >= 200 + (v_level - 1) * 100 loop
      v_left := v_left - (200 + (v_level - 1) * 100);
      v_level := v_level + 1;
    end loop;
    update public.machine_stats set level = v_level where uid = r.uid and machine_id = r.machine_id and mode = r.mode;
  end loop;
  insert into public.attendance (uid, date, present, updated_at)
  select distinct sl.uid, (sl.created_at at time zone v_tz)::date, true, now()
    from public.set_logs sl where sl.uid in (select id from demo_people)
  on conflict (uid, date) do nothing;

  -- kudos on workouts (one post = one machine in one visit; id = its first set)
  insert into public.post_kudos (post_id, uid, created_at)
  select g.post_id, k.id, g.at + interval '20 minutes'
    from (select min(sl.id) as post_id, sl.uid, bool_or(sl.is_pb) as pb, max(sl.created_at) as at
            from public.set_logs sl
           where sl.uid in (select id from demo_people) and sl.created_at > now() - interval '30 days'
           group by sl.uid, sl.machine_id, coalesce(sl.mode, ''), (sl.created_at at time zone v_tz)::date) g
    join demo_people k on k.id <> g.uid
   where random() < case when g.pb then 0.28 else 0.06 end
  on conflict do nothing;

  -- 3. pump checks (today's before / after) ---------------------------------
  for dp in select * from demo_people where n in (1, 13, 3, 15) loop
    for r in select k, i from (values ('pre', 1), ('post', 2)) x(k, i) loop
      insert into public.pump_photos (uid, kind, day, path, shared, created_at)
      values (dp.id, r.k, v_today, 'demo/' || dp.n || '/pump-' || r.k || '-' || ((dp.n % 3) + 1) || '.jpg', true,
              least(v_now - interval '20 minutes', (select max(created_at) from public.set_logs where uid = dp.id))
              - case when r.k = 'pre' then interval '50 minutes' else interval '0 minutes' end);
    end loop;
  end loop;
  insert into public.photo_kudos (item_id, uid, created_at)
  select f.item_id, k.id, now() - interval '5 minutes'
    from (select min(id) as item_id, uid from public.pump_photos where uid in (select id from demo_people) group by uid, day) f
    join demo_people k on k.id <> f.uid
   where random() < 0.3
  on conflict do nothing;

  -- 4. posts, photos, transformations, comments ------------------------------
  create temp table demo_posts (k int, who int, kind text, body text, machine_id text, mode text, weeks int, hours_ago numeric, media text[]) on commit drop;
  insert into demo_posts values
    (1,  2,  'text',  'Who''s in for legs at 7 tomorrow? Need a spotter for squats.', 'squat-07', null, null, 1.5, null),
    (2,  13, 'photo', 'Back day done. Love the new grips on the lat pulldown.', 'lat-pulldown-01', null, null, 3, array['gym-1.jpg', 'gym-2.jpg']),
    (3,  3,  'transformation', '16 weeks of showing up four days a week. Slow and steady.', null, null, 16, 5, array['tf-before-1.jpg', 'tf-after-1.jpg']),
    (4,  14, 'text',  'First time on the Women''s leg press board. 1.6x body weight!', 'leg-press-08', null, null, 7, null),
    (5,  4,  'photo', 'Morning crew at 6 am. Best way to start the day.', null, null, null, 10, array['gym-3.jpg']),
    (6,  15, 'text',  'Anyone know when the second cable machine is coming in?', null, null, null, 20, null),
    (7,  5,  'text',  'Finally pulled 1.5x body weight on deadlift. Took me three months.', 'deadlift-10', null, null, 26, null),
    (8,  17, 'transformation', '12 weeks. Stronger, not just lighter.', null, null, 12, 30, array['tf-before-2.jpg', 'tf-after-2.jpg']),
    (9,  6,  'photo', 'Leg day. Enough said.', 'leg-press-08', null, null, 40, array['gym-4.jpg', 'gym-5.jpg', 'gym-6.jpg']),
    (10, 16, 'text',  'Friday Leg Press Challenge, I''m coming for you.', 'leg-press-08', null, null, 52, null),
    (11, 10, 'text',  'Quick one: please wipe the bench when you''re done. Thank you!', null, null, null, 60, null),
    (12, 18, 'photo', 'Post-workout oats hit different.', null, null, null, 75, array['gym-2.jpg']);
  for r in select * from demo_posts order by k loop
    insert into public.wall_posts (uid, kind, body, machine_id, mode, weeks_apart, created_at)
    select p.id, r.kind, r.body, r.machine_id, coalesce(r.mode, ''), r.weeks, v_now - make_interval(mins => (r.hours_ago * 60)::int)
      from demo_people p where p.n = r.who
    returning id into v_post;
    if r.media is not null then
      insert into public.wall_media (post_id, path, position, label)
      select v_post, 'demo/' || r.who || '-' || r.k || '/' || m.f, m.i - 1,
             case when r.kind = 'transformation' then case when m.i = 1 then 'before' else 'after' end end
        from unnest(r.media) with ordinality m(f, i);
    end if;
    insert into public.wall_kudos (post_id, uid, created_at)
    select v_post, k.id, v_now - make_interval(mins => (r.hours_ago * 60)::int) + interval '10 minutes'
      from demo_people k where k.n <> r.who and random() < case when r.kind = 'text' then 0.25 else 0.5 end
    on conflict do nothing;
  end loop;

  create temp table demo_comments (post_k int, who int, body text, mins_after int) on commit drop;
  insert into demo_comments values
    (1, 5, 'I''m in. 7 sharp.', 12), (1, 9, 'Count me in too', 30),
    (2, 14, 'Those grips are so much better', 15), (2, 1, 'Strong session!', 40),
    (3, 1, 'Huge. Proper inspiration.', 20), (3, 13, 'This is what consistency looks like', 35), (3, 7, 'What did you change in week 6?', 60),
    (3, 3, 'Ate more protein and slept 8 hours. Nothing fancy.', 75),
    (4, 15, 'Let''s go Priya!', 10), (4, 17, 'Next stop 1.8x', 25),
    (5, 2, 'The 6 am crew is the best crew', 30),
    (6, 10, 'Front desk said next week', 45),
    (7, 3, 'Massive. Form looked clean too.', 15),
    (8, 16, 'Love this', 20), (8, 13, 'So good Meera', 40),
    (9, 4, 'Quads of steel', 18),
    (10, 14, 'See you there', 30), (10, 13, 'Game on', 50),
    (11, 6, 'Thank you for saying it', 22);
  insert into public.feed_comments (target_type, target_id, uid, body, created_at)
  select 'wall', w.id, p.id, c.body, w.created_at + make_interval(mins => c.mins_after)
    from demo_comments c
    join demo_posts dpo on dpo.k = c.post_k
    join demo_people a on a.n = dpo.who
    join public.wall_posts w on w.uid = a.id and w.body = dpo.body
    join demo_people p on p.n = c.who
   where w.created_at + make_interval(mins => c.mins_after) < v_now;
  -- a few comments on PRs
  insert into public.feed_comments (target_type, target_id, uid, body, created_at)
  select 'set', g.post_id, k.id, (array['Beast mode', 'New PB, nice!', 'Strong!', 'Let''s go'])[1 + floor(random() * 4)::int], least(g.at + interval '30 minutes', v_now)
    from (select min(sl.id) as post_id, sl.uid, max(sl.created_at) as at
            from public.set_logs sl
           where sl.uid in (select id from demo_people) and sl.is_pb and sl.created_at > now() - interval '3 days'
           group by sl.uid, sl.machine_id, coalesce(sl.mode, ''), (sl.created_at at time zone v_tz)::date
           order by max(sl.created_at) desc limit 6) g
    join lateral (select id from demo_people where id <> g.uid order by random() limit 1) k on true;

  -- 5. streaks + badges (they show as milestones on the feed) ---------------
  insert into public.xp_ledger (uid, amount, kind, ref, title, created_at)
  select p.id, b.xp, 'badge', 'badge:' || b.id, b.title, v_now - make_interval(hours => x.h)
    from (values (1, 'explorer', 6), (13, 'regular', 14), (3, 'ten_tonne', 30), (15, 'early_bird', 50), (5, 'century', 70)) x(n, badge, h)
    join demo_people p on p.n = x.n
    join public._badge_defs() b on b.id = x.badge
  on conflict (uid, kind, ref) do nothing;
  insert into public.xp_ledger (uid, amount, kind, ref, title, created_at)
  select p.id, x.xp, 'streak', 'streak:' || (v_today - x.days + 1) || ':' || x.days, x.days || '-day streak', v_now - make_interval(hours => x.h)
    from (values (2, 7, 75, 9), (14, 14, 150, 22)) x(n, days, xp, h)
    join demo_people p on p.n = x.n
  on conflict (uid, kind, ref) do nothing;

  -- 6. a pinned notice + a sample offer (from a sample member, so they come out again)
  insert into public.gym_posts (kind, title, body, pinned, starts_at, ends_at, active, created_by)
  select 'notice', 'Sample lifters are on the boards',
         'We''re testing new features with sample members this week. Your real lifts count as normal.',
         true, v_now - interval '2 hours', v_now + interval '7 days', true, p.id
    from demo_people p where p.n = 20;
  insert into public.gym_posts (kind, title, body, sponsor_id, cta_label, starts_at, active, created_by)
  select 'offer', 'New season jerseys are in', 'Sample offer for testing the feed. Your name and number printed.',
         (select id from public.sponsors where id = 'jersey-drip'), 'See jerseys', v_now - interval '26 hours', true, p.id
    from demo_people p where p.n = 20 and exists (select 1 from public.sponsors where id = 'jersey-drip');

  -- 7. a sample challenge running this week ---------------------------------
  insert into public.challenges (sponsor_id, title, description, metric, machine_id, starts_at, ends_at, prize, winners, join_xp, active)
  values ((select id from public.sponsors where id = 'clean-crate'), 'Leg Press Week (sample)',
          'Best leg press for your size this week.', 'best_lift', 'leg-press-08',
          v_week_start, v_week_start + interval '7 days', 'A sample prize', 1, 0, true)
  returning id into v_ch;
  insert into public._demo_seeded values ('challenge:' || v_ch, v_ch::text);

  -- 8. last week's winners (only if that week wasn't awarded yet) -------------
  perform public._ensure_current_season();
  select starts_at into v_last_end from public.seasons where starts_at <= now() and ends_at > now() order by starts_at desc limit 1;
  v_last_start := v_last_end - interval '7 days';
  select id into v_season from public.seasons where ends_at = v_last_end;
  if v_season is null then
    insert into public.seasons (period, starts_at, ends_at, title)
    values ('week', v_last_start, v_last_end, 'Week of ' || to_char(v_last_start at time zone v_tz, 'FMDD Mon'))
    on conflict do nothing
    returning id into v_season;
    if v_season is not null then
      insert into public.season_prizes (season_id, rank_from, rank_to, title, description, sponsor_ids, reward_id, sort)
      select v_season, rank_from, rank_to, title, description, sponsor_ids, reward_id, sort from public.prize_templates;
      insert into public._demo_seeded values ('season_created:' || v_season, v_season::text);
    end if;
  end if;
  -- (skipped when real members trained that week: their week stays theirs to award)
  if v_season is not null
     and (select awarded_at from public.seasons where id = v_season) is null
     and not exists (select 1 from public.season_winners where season_id = v_season)
     and not exists (select 1 from public.set_logs sl
                      where sl.created_at >= v_last_start and sl.created_at < v_last_end and not public._is_demo(sl.uid)) then
    insert into public.season_winners (season_id, division, rank, uid, score, prize_id)
    select v_season, r2.division, r2.rank, r2.uid, r2.score,
           (select sp.id from public.season_prizes sp where sp.season_id = v_season and r2.rank between sp.rank_from and sp.rank_to order by sp.sort limit 1)
      from public._season_div_ranked(v_season) r2
     where r2.rank <= 3 and public._is_demo(r2.uid);
    get diagnostics v_n = row_count;
    if v_n > 0 then
      update public.seasons set awarded_at = now() where id = v_season;
      insert into public._demo_seeded values ('season_awarded:' || v_season, v_season::text) on conflict do nothing;
    end if;
  end if;
end;
$$;

select 'sample members' as what, count(*)::int as how_many from public.profiles where id::text like 'dddddddd-dddd-4ddd-8ddd-%'
union all select 'sets', count(*)::int from public.set_logs where uid::text like 'dddddddd-dddd-4ddd-8ddd-%'
union all select 'sets today', count(*)::int from public.set_logs where uid::text like 'dddddddd-dddd-4ddd-8ddd-%'
                                                                   and created_at >= date_trunc('day', now() at time zone public.app_timezone()) at time zone public.app_timezone()
union all select 'posts', count(*)::int from public.wall_posts where uid::text like 'dddddddd-dddd-4ddd-8ddd-%'
union all select 'comments', count(*)::int from public.feed_comments where uid::text like 'dddddddd-dddd-4ddd-8ddd-%';
