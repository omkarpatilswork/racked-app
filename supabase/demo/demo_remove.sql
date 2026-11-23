-- ============================================================================
-- demo_remove.sql — takes ALL the sample data out again (Racked by Bijlee)
--
-- Removes the 20 sample members from demo_seed.sql and everything they made:
-- sets, PRs, posts, photos, comments, kudos, body weights, sample notices /
-- offers / challenge, and last week's sample winners (that week can then be
-- awarded normally). Real members' data is not touched.
--
-- Supabase -> SQL Editor -> New query -> paste this whole file -> Run.
-- Safe to run more than once.
-- ============================================================================
do $$
declare
  v_demo text := 'dddddddd-dddd-4ddd-8ddd-%';
begin
  if to_regclass('public._demo_seeded') is not null then
    -- last week's sample winners: put the week back to "not awarded"
    update public.seasons s set awarded_at = null, awarded_by = null
     where s.id in (select val::bigint from public._demo_seeded where key like 'season_awarded:%');
    delete from public.challenges where id in (select val::bigint from public._demo_seeded where key like 'challenge:%');
  end if;

  -- things real members did on sample content (kudos, comments)
  delete from public.post_kudos where post_id in (select id from public.set_logs where uid::text like v_demo);
  delete from public.photo_kudos where item_id in (select id from public.pump_photos where uid::text like v_demo);
  delete from public.feed_comments
   where (target_type = 'set' and target_id in (select id from public.set_logs where uid::text like v_demo))
      or (target_type = 'photo' and target_id in (select id from public.pump_photos where uid::text like v_demo))
      or (target_type = 'wall' and target_id in (select id from public.wall_posts where uid::text like v_demo));
  delete from public.gym_posts where created_by::text like v_demo;

  -- the sample people (everything of theirs goes with them)
  delete from auth.users where id::text like v_demo;
  delete from public.profiles where id::text like v_demo;

  if to_regclass('public._demo_seeded') is not null then
    -- a week the samples created and nobody real trained in
    delete from public.seasons s
     where s.id in (select val::bigint from public._demo_seeded where key like 'season_created:%')
       and s.awarded_at is null
       and not exists (select 1 from public.season_winners w where w.season_id = s.id)
       and not exists (select 1 from public.redemptions r where r.season_id = s.id);
  end if;
end;
$$;
drop table if exists public._demo_seeded;

select 'sample members left' as what, count(*)::int as how_many from public.profiles where id::text like 'dddddddd-dddd-4ddd-8ddd-%';
