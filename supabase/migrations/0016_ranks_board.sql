-- 0016_ranks_board.sql — Ranks v2 (Nov 2026)
--
-- One board function for the simpler Ranks page. Pick what to rank by,
-- the time, the board and (optionally) one machine:
--
--   metric   'score'    strength score = kg lifted ÷ body weight × 100
--                       (all machines: your best on each machine, added up;
--                        This week all machines = the weekly prize race,
--                        exactly as Rewards ranks it)
--            'moved'    kg moved = weight × reps of every set, added up
--            'heaviest' the heaviest single set (kg), with its reps
--                       (all machines: on any machine, and which one)
--   period   'week'     the current prize week (the same window as
--                       "Week ends in"), or 'all' for all time
--   division 'men' | 'women' | 'all' (everyone; for kg moved and heaviest
--                       that includes members without a body weight)
--   machine  null = all machines, else one machine (+ mode for the dual one)
--
-- Read only. Needs 0015. Safe to run twice. First names only, no ids;
-- is_me marks your row (always returned, even outside the limit).
-- One machine's score and heaviest boards include house lifts (0013);
-- the all-machine totals and kg moved never do. Flagged sets count like on
-- every other board until staff remove them, except the weekly prize race
-- (and the all-time score total, its all-time twin), which leave them out.

do $$
begin
  if to_regclass('public.member_body') is null then
    raise exception 'Run 0015_strength_boards.sql first';
  end if;
end;
$$;

drop function if exists public.ranks_board(text, text, text, text, text, int);

create or replace function public.ranks_board(
  p_metric text default 'score',
  p_period text default 'week',
  p_division text default 'all',
  p_machine_id text default null,
  p_mode text default '',
  p_limit int default 50
)
returns table (
  rank int, name text, avatar_url text, value numeric, reps int,
  machine_id text, mode text, sets int, is_me boolean, house boolean
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_metric text := case when p_metric in ('score', 'moved', 'heaviest') then p_metric else 'score' end;
  v_div text := case when p_division in ('men', 'women') then p_division else 'all' end;
  v_machine text := nullif(btrim(coalesce(p_machine_id, '')), '');
  v_mode text := coalesce(p_mode, '');
  v_lim int := greatest(1, least(coalesce(p_limit, 50), 100));
  v_me uuid := auth.uid();
  v_season bigint;
  v_from timestamptz := '-infinity';
  v_to timestamptz := 'infinity';
begin
  if v_machine is not null and not exists (select 1 from public.machine_limits ml where ml.machine_id = v_machine) then
    return;
  end if;
  if coalesce(p_period, 'week') <> 'all' then
    v_season := public._ensure_current_season();
    select s.starts_at, s.ends_at into v_from, v_to from public.seasons s where s.id = v_season;
  end if;

  -- This week · score · all machines = the weekly prize race (Rewards)
  if v_metric = 'score' and v_machine is null and v_season is not null then
    return query
      with x as (
        select sp.uid, sp.score, sp.last_at
          from public._strength_points(v_season) sp
         where v_div = 'all' or sp.division = v_div
      ),
      r as (
        select x.uid, x.score, (row_number() over (order by x.score desc, x.last_at asc nulls last, x.uid))::int as rk
          from x
      )
      select r.rk, public._first_name(p.display_name), p.avatar_url, r.score::numeric, null::int, null::text, null::text,
             null::int, coalesce(r.uid = v_me, false), false
        from r
        join public.profiles p on p.id = r.uid
       where r.rk <= v_lim or r.uid = v_me
       order by r.rk;
    return;
  end if;

  return query
    with base as (
      select sl.uid, sl.machine_id, coalesce(sl.mode, '') as mode, sl.weight, sl.reps, sl.created_at as at,
             coalesce(sl.body_kg, mb.body_kg) as bw
        from public.set_logs sl
        left join public.member_body mb on mb.uid = sl.uid
       where sl.created_at >= v_from and sl.created_at < v_to
         and (v_machine is null or (sl.machine_id = v_machine and coalesce(sl.mode, '') = v_mode))
         and (v_div = 'all' or mb.division = v_div)
         and (v_metric <> 'score' or coalesce(sl.body_kg, mb.body_kg) is not null)
         and (not (v_metric = 'score' and v_machine is null) or sl.review_status is distinct from 'flagged')
    ),
    -- score, all machines (all time): best on each machine, added up
    total as (
      select b2.uid, sum(b2.pts)::numeric as value, sum(b2.n)::int as sets, max(b2.at) as tb
        from (
          select distinct on (b.uid, b.machine_id, b.mode)
                 b.uid, round(100 * b.weight / b.bw)::int as pts, b.at,
                 count(*) over (partition by b.uid, b.machine_id, b.mode)::int as n
            from base b
           where v_metric = 'score' and v_machine is null
           order by b.uid, b.machine_id, b.mode, (b.weight / b.bw) desc, b.at asc
        ) b2
       group by b2.uid
    ),
    -- score on one machine, heaviest (one machine or anywhere): the best set
    best as (
      select distinct on (b.uid)
             b.uid,
             case when v_metric = 'score' then round(100 * b.weight / b.bw) else b.weight end as value,
             b.reps, b.machine_id, b.mode,
             count(*) over (partition by b.uid)::int as sets, b.at as tb
        from base b
       where (v_metric = 'score' and v_machine is not null) or v_metric = 'heaviest'
       order by b.uid, (case when v_metric = 'score' then b.weight / b.bw else b.weight end) desc, b.reps desc, b.at asc
    ),
    moved as (
      select b.uid, sum(b.weight * b.reps) as value, count(*)::int as sets, max(b.at) as tb
        from base b
       where v_metric = 'moved'
       group by b.uid
    ),
    house as (
      select distinct on (lower(h.name))
             h.name,
             case when v_metric = 'score' then round(100 * h.weight / h.body_kg) else h.weight end as value,
             h.reps, h.machine_id, h.mode,
             (h.lifted_on + time '12:00') at time zone public.app_timezone() as tb
        from public.house_lifts h
       where v_machine is not null and v_metric in ('score', 'heaviest')
         and h.machine_id = v_machine and h.mode = v_mode
         and (v_metric <> 'score' or h.body_kg is not null)
         and (v_div = 'all' or h.division = v_div)
         and (h.lifted_on + time '12:00') at time zone public.app_timezone() >= v_from
         and (h.lifted_on + time '12:00') at time zone public.app_timezone() < v_to
       order by lower(h.name), (case when v_metric = 'score' then h.weight / h.body_kg else h.weight end) desc, h.reps desc
    ),
    cand as (
      select t.uid::text as who, t.uid, null::text as house_name, t.value, null::int as reps,
             null::text as machine_id, null::text as mode, t.sets, t.tb
        from total t
      union all
      select b.uid::text, b.uid, null, b.value, b.reps, b.machine_id, b.mode, b.sets, b.tb from best b
      union all
      select m.uid::text, m.uid, null, m.value, null, null, null, m.sets, m.tb from moved m
      union all
      select 'h:' || lower(h.name), null, h.name, h.value, h.reps, h.machine_id, h.mode, 1, h.tb from house h
    ),
    ranked as (
      select c.*, (row_number() over (order by c.value desc, c.reps desc nulls last, c.tb asc nulls last, c.who))::int as rk
        from cand c
        left join public.profiles p0 on p0.id = c.uid
       where c.value > 0 and (c.uid is null or p0.id is not null)
    )
    select r.rk,
           case when r.uid is null then left(r.house_name, 16) else public._first_name(p.display_name) end,
           p.avatar_url, r.value, r.reps, r.machine_id, r.mode, r.sets,
           coalesce(r.uid = v_me, false), r.uid is null
      from ranked r
      left join public.profiles p on p.id = r.uid
     where r.rk <= v_lim or r.uid = v_me
     order by r.rk;
end;
$$;

revoke all on function public.ranks_board(text, text, text, text, text, int) from public, anon;
grant execute on function public.ranks_board(text, text, text, text, text, int) to authenticated;
