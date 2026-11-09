-- ============================================================================
-- 0009_account_basics.sql
--
-- Account & trust basics for the 2026 refresh:
--   1. profiles.onboarded_at -- new members see a short welcome the first
--      time they sign in. Everyone who already has an account is marked as
--      onboarded, so existing members never see it.
--   2. update_my_profile() -- a member changes their own display name and/or
--      finishes onboarding. Validated on the server.
--   3. delete_my_account() -- a member permanently deletes their account and
--      everything tied to it (sets, PBs, kudos, photos records, attendance).
--      The app removes the member's photo FILES from storage first, then
--      calls this.
--
-- Safe to run more than once.
-- ============================================================================

-- Add the column, and -- only the very first time this runs -- mark every
-- existing member as onboarded: they've already been using the app, so they
-- shouldn't see the welcome. Re-running this file later changes nothing.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles' and column_name = 'onboarded_at'
  ) then
    alter table public.profiles add column onboarded_at timestamptz;
    update public.profiles set onboarded_at = coalesce(created_at, now());
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- update_my_profile(display_name, onboarded)
--   p_display_name: new name, or null to leave it as it is.
--                   2-40 characters after trimming; no "@", no angle
--                   brackets, no control characters.
--   p_onboarded:    true marks the welcome as done.
-- Returns the updated profile row as json.
-- ---------------------------------------------------------------------------
create or replace function public.update_my_profile(
  p_display_name text default null,
  p_onboarded boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_row public.profiles;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  if p_display_name is not null then
    -- collapse runs of whitespace and trim
    v_name := regexp_replace(trim(p_display_name), '\s+', ' ', 'g');
    if char_length(v_name) < 2 or char_length(v_name) > 40 then
      raise exception 'Name must be 2 to 40 characters' using errcode = '22023';
    end if;
    if v_name ~ '[@<>]' or v_name ~ '[[:cntrl:]]' then
      raise exception 'Name can''t contain @, < or >' using errcode = '22023';
    end if;
  end if;

  update public.profiles
     set display_name = coalesce(v_name, display_name),
         onboarded_at = case when coalesce(p_onboarded, false)
                             then coalesce(onboarded_at, now())
                             else onboarded_at end
   where id = v_uid
  returning * into v_row;

  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  return to_jsonb(v_row);
end;
$$;

grant execute on function public.update_my_profile(text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- delete_my_account()
--   Deletes the signed-in member's login. Every table that belongs to a member
--   (profiles, machine_stats, set_logs, attendance, kudos, pump photo rows,
--   photo reports) is linked with ON DELETE CASCADE, so it all goes with it.
--   Feedback and tap analytics keep the row but lose the link to the person
--   (ON DELETE SET NULL), so gym totals stay correct.
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------------
-- Privacy fix: a photo set to "Only me" is really only you.
-- Before, staff could open every photo, including private ones. Now staff
-- can open a photo only when it's shared, hidden by reports, or has been
-- reported -- exactly what moderation needs, nothing more.
-- ---------------------------------------------------------------------------
create or replace function public._photo_has_report(p_photo_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.photo_reports r where r.photo_id = p_photo_id);
$$;
revoke all on function public._photo_has_report(bigint) from public, anon;
grant execute on function public._photo_has_report(bigint) to authenticated;

drop policy if exists "see own and shared photos" on public.pump_photos;
create policy "see own and shared photos"
  on public.pump_photos for select
  to authenticated
  using (
    uid = auth.uid()
    or (shared and not hidden)
    or (public.is_staff() and (shared or hidden or public._photo_has_report(id)))
  );

-- Files follow the same rule: your own folder, or a photo row you're allowed
-- to see (the rule above does the filtering, including for staff).
drop policy if exists "pump photos: view own or shared" on storage.objects;
create policy "pump photos: view own or shared"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'pump-photos'
    and (
      split_part(name, '/', 1) = auth.uid()::text
      or exists (select 1 from public.pump_photos p where p.path = storage.objects.name)
    )
  );

-- ---------------------------------------------------------------------------
-- Guard rail: display names can't be absurdly long, even if someone edits
-- their profile row directly. NOT VALID = existing names are left alone.
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_display_name_length;
alter table public.profiles add constraint profiles_display_name_length
  check (char_length(display_name) between 1 and 80) not valid;
