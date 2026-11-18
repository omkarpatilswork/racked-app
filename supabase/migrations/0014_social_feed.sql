-- ============================================================================
-- 0014_social_feed.sql   (run after 0013_tv_house_lifts.sql)
--
-- Home becomes the gym's feed.
--
--   1. Member posts ("wall posts"): a text post (up to 280 characters), a
--      photo post (1-4 photos + optional caption) or a transformation
--      (before + after photo, optional caption and weeks apart). Optional
--      machine tag. Photos go in the same private "pump-photos" bucket as
--      pump checks, in the member's own folder, shown through signed links.
--   2. Kudos and comments: kudos on posts; short comments (280 characters)
--      on posts, workouts (PRs) and pump checks.
--   3. Safety: signed-in members only; no links in posts or comments (stops
--      spam); 10 posts and 60 comments a day per member; members can report
--      a post or comment and 3 different reports hide it until staff look;
--      staff can keep, hide or delete. Everyone can delete their own.
--   4. Gym posts by staff: notices ("Closed Sunday") and partner offers
--      (photo, brand, code, link or "claim with XP"), optionally pinned to
--      the top, with start and end dates. Edited in R&R Controls -> Feed.
--   5. home_feed(): one call for the Home feed -- workouts, pump checks,
--      member posts, gym posts and milestones (badges, 7+ day streaks),
--      newest first, with filters. First names / display names only.
--
-- Safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tables (nobody reads or writes them directly; the functions below do)
-- ---------------------------------------------------------------------------
create table if not exists public.wall_posts (
  id bigint generated always as identity primary key,
  uid uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('text', 'photo', 'transformation')),
  body text check (body is null or char_length(body) <= 280),
  machine_id text,
  mode text not null default '',
  weeks_apart int check (weeks_apart is null or weeks_apart between 1 and 520),
  hidden boolean not null default false,          -- hidden by reports / staff
  hidden_by_staff boolean not null default false,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index if not exists wall_posts_time_idx on public.wall_posts (created_at desc);
create index if not exists wall_posts_uid_idx on public.wall_posts (uid, created_at desc);

create table if not exists public.wall_media (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.wall_posts (id) on delete cascade,
  path text not null unique,                       -- <uid>/<file> in pump-photos
  position int not null check (position between 0 and 3),
  label text check (label in ('before', 'after')),
  unique (post_id, position)
);

create table if not exists public.wall_kudos (
  post_id bigint not null references public.wall_posts (id) on delete cascade,
  uid uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, uid)
);

create table if not exists public.wall_reports (
  post_id bigint not null references public.wall_posts (id) on delete cascade,
  reporter uuid not null references public.profiles (id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  unique (post_id, reporter)
);

-- Comments on a member post ('wall'), a workout / PR ('set': the feed post id,
-- i.e. its first set) or a pump check ('photo': the feed item id).
create table if not exists public.feed_comments (
  id bigint generated always as identity primary key,
  target_type text not null check (target_type in ('wall', 'set', 'photo')),
  target_id bigint not null,
  uid uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 280),
  hidden boolean not null default false,
  hidden_by_staff boolean not null default false,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists feed_comments_target_idx on public.feed_comments (target_type, target_id, created_at);
create index if not exists feed_comments_uid_idx on public.feed_comments (uid, created_at desc);

create table if not exists public.comment_reports (
  comment_id bigint not null references public.feed_comments (id) on delete cascade,
  reporter uuid not null references public.profiles (id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  unique (comment_id, reporter)
);

create table if not exists public.gym_posts (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('notice', 'offer')),
  title text not null check (char_length(title) between 1 and 80),
  body text check (body is null or char_length(body) <= 400),
  image_url text,
  sponsor_id text references public.sponsors (id) on delete set null,
  reward_id bigint references public.rewards (id) on delete set null,
  code text check (code is null or char_length(code) <= 40),
  cta_label text check (cta_label is null or char_length(cta_label) <= 30),
  cta_url text,
  pinned boolean not null default false,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists gym_posts_time_idx on public.gym_posts (starts_at desc);

alter table public.wall_posts enable row level security;
alter table public.wall_media enable row level security;
alter table public.wall_kudos enable row level security;
alter table public.wall_reports enable row level security;
alter table public.feed_comments enable row level security;
alter table public.comment_reports enable row level security;
alter table public.gym_posts enable row level security;
revoke all on public.wall_posts, public.wall_media, public.wall_kudos, public.wall_reports,
  public.feed_comments, public.comment_reports, public.gym_posts from anon, authenticated;

-- A deleted post takes its comments with it (comments point at posts by id).
create or replace function public._wall_post_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.feed_comments where target_type = 'wall' and target_id = old.id;
  return old;
end;
$$;
drop trigger if exists wall_post_deleted on public.wall_posts;
create trigger wall_post_deleted after delete on public.wall_posts
  for each row execute function public._wall_post_deleted();

-- ---------------------------------------------------------------------------
-- 2. Small helpers
-- ---------------------------------------------------------------------------
-- No links: "http(s)://", "www." or anything that looks like a web address.
create or replace function public._no_links(p text)
returns boolean
language sql
immutable
as $$
  select p is null
      or p !~* '(https?://|www\.|[a-z0-9-]+\.(com|in|net|org|io|co|app|me|xyz|shop|store|link|ly|gg|ai|info|biz|site|online|live|club|fit)([/:?#]|\s|$))';
$$;

-- Trimmed, at most one blank line in a row, no control characters.
create or replace function public._clean_text(p text)
returns text
language sql
immutable
as $$
  select nullif(btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(coalesce(p, ''), E'\r\n?', E'\n', 'g'),
        E'[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]', '', 'g'),
      E'\n{3,}', E'\n\n', 'g'),
    E' \t\n'), '');
$$;

create or replace function public._gym_day_start()
returns timestamptz
language sql
stable
as $$
  select date_trunc('day', now() at time zone public.app_timezone()) at time zone public.app_timezone();
$$;

-- Storage: a member may open a post's photo when the post is visible to them.
create or replace function public._post_media_visible(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.wall_media m join public.wall_posts p on p.id = m.post_id
     where m.path = p_path and (not p.hidden or p.uid = auth.uid()));
$$;
grant execute on function public._post_media_visible(text) to authenticated;

drop policy if exists "post media: members view visible posts" on storage.objects;
create policy "post media: members view visible posts"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'pump-photos' and public._post_media_visible(name));

-- First two names of who gave kudos (not you), for "Asha, Rahul and 3 others"
create or replace function public._kudos_names(p_uids uuid[])
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(public._first_name(p.display_name) order by x.n), '{}'::text[])
    from unnest(p_uids) with ordinality x(uid, n)
    join public.profiles p on p.id = x.uid;
$$;
revoke all on function public._kudos_names(uuid[]) from public, anon, authenticated;

-- Can the signed-in member see (and so comment on) this item?
create or replace function public._target_visible(p_type text, p_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case p_type
    when 'wall' then exists (select 1 from public.wall_posts w where w.id = p_id and (not w.hidden or w.uid = auth.uid()))
    when 'set' then exists (select 1 from public.set_logs s where s.id = p_id)
    when 'photo' then exists (select 1 from public.pump_photos p where p.id = p_id and p.shared and not p.hidden)
    else false end;
$$;
revoke all on function public._target_visible(text, bigint) from public, anon, authenticated;

-- Comment count + the latest comment, shown under a feed card.
create or replace function public._comment_info(p_type text, p_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'comment_count', (select count(*)::int from public.feed_comments c
                       where c.target_type = p_type and c.target_id = p_id and not c.hidden),
    'last_comment', (select jsonb_build_object('name', public._first_name(pr.display_name), 'body', c.body, 'is_mine', c.uid = auth.uid())
                       from public.feed_comments c join public.profiles pr on pr.id = c.uid
                      where c.target_type = p_type and c.target_id = p_id and not c.hidden
                      order by c.created_at desc limit 1));
$$;
revoke all on function public._comment_info(text, bigint) from public, anon, authenticated;

create or replace function public._wall_json(w public.wall_posts)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', w.id, 'kind', w.kind, 'body', w.body, 'machine_id', w.machine_id, 'mode', w.mode,
    'weeks_apart', w.weeks_apart, 'created_at', w.created_at, 'edited', w.edited_at is not null,
    'is_mine', w.uid = auth.uid(),
    'hidden', w.hidden and w.uid = auth.uid(),
    'display_name', public._public_name(pr.display_name), 'avatar_url', pr.avatar_url,
    'instagram_handle', pr.instagram_handle,
    'media', coalesce((select jsonb_agg(jsonb_build_object('path', m.path, 'label', m.label) order by m.position)
                         from public.wall_media m where m.post_id = w.id), '[]'::jsonb),
    'kudos_count', (select count(*)::int from public.wall_kudos k where k.post_id = w.id),
    'kudos_mine', exists (select 1 from public.wall_kudos k where k.post_id = w.id and k.uid = auth.uid()),
    'kudos_names', public._kudos_names(array(select k.uid from public.wall_kudos k
                                               where k.post_id = w.id and k.uid <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000')
                                               order by k.created_at desc limit 2)))
    from public.profiles pr where pr.id = w.uid;
$$;
revoke all on function public._wall_json(public.wall_posts) from public, anon, authenticated;

create or replace function public._gym_post_json(g public.gym_posts)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', g.id, 'kind', g.kind, 'title', g.title, 'body', g.body, 'image_url', g.image_url,
    'code', g.code, 'cta_label', g.cta_label, 'cta_url', g.cta_url, 'reward_id', g.reward_id,
    'pinned', g.pinned, 'starts_at', g.starts_at, 'ends_at', g.ends_at,
    'sponsor', (select jsonb_build_object('id', s.id, 'name', s.name, 'logo_url', s.logo_url, 'website_url', s.website_url)
                  from public.sponsors s where s.id = g.sponsor_id),
    'reward', (select jsonb_build_object('id', r.id, 'title', r.title, 'xp_cost', r.xp_cost)
                 from public.rewards r where r.id = g.reward_id and r.active));
$$;
revoke all on function public._gym_post_json(public.gym_posts) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Members: post, edit, delete, kudos, report
-- ---------------------------------------------------------------------------
-- p_media: [{"path": "<uid>/<file>.jpg", "label": "before"|"after"|null}, ...]
-- (upload the files first, then call this)
create or replace function public.create_wall_post(
  p_kind text,
  p_body text default null,
  p_media jsonb default '[]'::jsonb,
  p_machine_id text default null,
  p_mode text default null,
  p_weeks int default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_body text := public._clean_text(p_body);
  v_media jsonb := coalesce(p_media, '[]'::jsonb);
  v_n int;
  v_id bigint;
  v_machine text := nullif(trim(coalesce(p_machine_id, '')), '');
  v_mode text := '';
  v_lim public.machine_limits%rowtype;
  v_path text;
  v_label text;
  i int := 0;
  m jsonb;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if p_kind not in ('text', 'photo', 'transformation') then
    raise exception 'Pick what to post' using errcode = 'RK204';
  end if;
  if char_length(coalesce(v_body, '')) > 280 then
    raise exception 'Keep it to 280 characters' using errcode = 'RK202';
  end if;
  if not public._no_links(v_body) then
    raise exception 'Links can''t be posted. Write it out instead.' using errcode = 'RK201';
  end if;
  if jsonb_typeof(v_media) <> 'array' then
    raise exception 'Those photos didn''t come through. Try again.' using errcode = 'RK205';
  end if;
  v_n := jsonb_array_length(v_media);
  if p_kind = 'text' and (v_body is null or v_n > 0) then
    raise exception 'Write something first' using errcode = 'RK204';
  end if;
  if p_kind = 'photo' and (v_n < 1 or v_n > 4) then
    raise exception 'Add 1 to 4 photos' using errcode = 'RK205';
  end if;
  if p_kind = 'transformation' and (v_n <> 2
       or (select count(distinct x->>'label') from jsonb_array_elements(v_media) x where x->>'label' in ('before', 'after')) <> 2) then
    raise exception 'Add a before and an after photo' using errcode = 'RK205';
  end if;
  if p_weeks is not null and p_weeks not between 1 and 520 then
    raise exception 'Weeks apart: 1 to 520' using errcode = 'RK205';
  end if;
  if v_machine is not null then
    select * into v_lim from public.machine_limits where machine_id = v_machine;
    if v_lim.machine_id is null then
      v_machine := null;
    elsif coalesce(array_length(v_lim.allowed_modes, 1), 0) > 0 and coalesce(p_mode, '') = any (v_lim.allowed_modes) then
      v_mode := p_mode;
    end if;
  end if;
  if (select count(*) from public.wall_posts where uid = v_uid and created_at >= public._gym_day_start()) >= 10 then
    raise exception 'That''s 10 posts today. Post more tomorrow.' using errcode = 'RK203';
  end if;

  insert into public.wall_posts (uid, kind, body, machine_id, mode, weeks_apart)
  values (v_uid, p_kind, v_body, v_machine, v_mode, case when p_kind = 'transformation' then p_weeks end)
  returning id into v_id;

  -- a transformation always shows before, then after
  for m in select x from jsonb_array_elements(v_media) with ordinality t(x, n)
            order by case when p_kind = 'transformation' and x->>'label' = 'after' then 1 else 0 end, n loop
    v_path := m->>'path';
    v_label := case when p_kind = 'transformation' then m->>'label' end;
    if v_path is null or split_part(v_path, '/', 1) <> v_uid::text or v_path like '%..%'
       or v_path !~ '^[0-9a-f-]+/[A-Za-z0-9._-]+$' then
      raise exception 'Those photos didn''t come through. Try again.' using errcode = 'RK205';
    end if;
    if not exists (select 1 from storage.objects where bucket_id = 'pump-photos' and name = v_path)
       or exists (select 1 from public.wall_media where path = v_path)
       or exists (select 1 from public.pump_photos where path = v_path) then
      raise exception 'Those photos didn''t come through. Try again.' using errcode = 'RK205';
    end if;
    insert into public.wall_media (post_id, path, position, label) values (v_id, v_path, i, v_label);
    i := i + 1;
  end loop;
  return v_id;
end;
$$;

create or replace function public.edit_wall_post(p_id bigint, p_body text, p_machine_id text default null, p_mode text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_post public.wall_posts;
  v_body text := public._clean_text(p_body);
  v_machine text := nullif(trim(coalesce(p_machine_id, '')), '');
  v_mode text := '';
  v_lim public.machine_limits%rowtype;
begin
  select * into v_post from public.wall_posts where id = p_id;
  if v_post.id is null or v_post.uid is distinct from v_uid then
    raise exception 'That post isn''t there any more' using errcode = 'RK206';
  end if;
  if char_length(coalesce(v_body, '')) > 280 then
    raise exception 'Keep it to 280 characters' using errcode = 'RK202';
  end if;
  if not public._no_links(v_body) then
    raise exception 'Links can''t be posted. Write it out instead.' using errcode = 'RK201';
  end if;
  if v_post.kind = 'text' and v_body is null then
    raise exception 'Write something first' using errcode = 'RK204';
  end if;
  if v_machine is not null then
    select * into v_lim from public.machine_limits where machine_id = v_machine;
    if v_lim.machine_id is null then
      v_machine := null;
    elsif coalesce(array_length(v_lim.allowed_modes, 1), 0) > 0 and coalesce(p_mode, '') = any (v_lim.allowed_modes) then
      v_mode := p_mode;
    end if;
  end if;
  update public.wall_posts set body = v_body, machine_id = v_machine, mode = v_mode, edited_at = now() where id = p_id;
end;
$$;

-- Your own post, or any post for staff. Returns the photo files to remove
-- from storage.
create or replace function public.delete_wall_post(p_id bigint)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.wall_posts;
  v_paths text[];
begin
  select * into v_post from public.wall_posts where id = p_id;
  if v_post.id is null then
    return '{}'::text[];
  end if;
  if v_post.uid is distinct from auth.uid() and not public.is_staff() then
    raise exception 'Not your post' using errcode = '42501';
  end if;
  select coalesce(array_agg(path), '{}'::text[]) into v_paths from public.wall_media where post_id = p_id;
  delete from public.wall_posts where id = p_id;
  if v_post.uid is distinct from auth.uid() then
    perform public._log_staff_action('delete_post', v_post.uid, v_post.machine_id, left(coalesce(v_post.body, v_post.kind || ' post'), 120));
  end if;
  return v_paths;
end;
$$;

create or replace function public.toggle_wall_kudos(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if not public._target_visible('wall', p_id) then
    raise exception 'That post isn''t there any more' using errcode = 'RK206';
  end if;
  if exists (select 1 from public.wall_kudos where post_id = p_id and uid = v_uid) then
    delete from public.wall_kudos where post_id = p_id and uid = v_uid;
  else
    insert into public.wall_kudos (post_id, uid) values (p_id, v_uid);
  end if;
  return jsonb_build_object(
    'count', (select count(*)::int from public.wall_kudos where post_id = p_id),
    'mine', exists (select 1 from public.wall_kudos where post_id = p_id and uid = v_uid));
end;
$$;

create or replace function public.report_wall_post(p_id bigint, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if exists (select 1 from public.wall_posts where id = p_id and uid <> v_uid and not hidden) then
    insert into public.wall_reports (post_id, reporter, reason)
    values (p_id, v_uid, left(nullif(trim(p_reason), ''), 200))
    on conflict (post_id, reporter) do nothing;
    if (select count(*) from public.wall_reports where post_id = p_id) >= 3 then
      update public.wall_posts set hidden = true where id = p_id and reviewed_at is null;
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Comments
-- ---------------------------------------------------------------------------
create or replace function public.list_comments(p_type text, p_id bigint, p_limit int default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public._target_visible(p_type, p_id) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(x.j order by x.created_at)
      from (select c.created_at, jsonb_build_object(
                     'id', c.id, 'body', c.body, 'created_at', c.created_at,
                     'is_mine', c.uid = auth.uid(), 'hidden', c.hidden,
                     'display_name', public._public_name(pr.display_name), 'avatar_url', pr.avatar_url) as j
              from public.feed_comments c join public.profiles pr on pr.id = c.uid
             where c.target_type = p_type and c.target_id = p_id and (not c.hidden or c.uid = auth.uid())
             order by c.created_at desc
             limit least(greatest(coalesce(p_limit, 100), 1), 200)) x), '[]'::jsonb);
end;
$$;

create or replace function public.add_comment(p_type text, p_id bigint, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_body text := public._clean_text(p_body);
  v_id bigint;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if not public._target_visible(p_type, p_id) then
    raise exception 'That post isn''t there any more' using errcode = 'RK206';
  end if;
  if v_body is null then
    raise exception 'Write something first' using errcode = 'RK204';
  end if;
  if char_length(v_body) > 280 then
    raise exception 'Keep it to 280 characters' using errcode = 'RK202';
  end if;
  if not public._no_links(v_body) then
    raise exception 'Links can''t be posted. Write it out instead.' using errcode = 'RK201';
  end if;
  if (select count(*) from public.feed_comments where uid = v_uid and created_at >= public._gym_day_start()) >= 60 then
    raise exception 'That''s 60 comments today. More tomorrow!' using errcode = 'RK203';
  end if;
  if exists (select 1 from public.feed_comments where uid = v_uid and created_at > now() - interval '3 seconds') then
    raise exception 'Slow down a little and try again' using errcode = 'RK203';
  end if;
  insert into public.feed_comments (target_type, target_id, uid, body) values (p_type, p_id, v_uid, v_body)
  returning id into v_id;
  return (select jsonb_build_object('id', c.id, 'body', c.body, 'created_at', c.created_at, 'is_mine', true, 'hidden', false,
                                    'display_name', public._public_name(pr.display_name), 'avatar_url', pr.avatar_url)
            from public.feed_comments c join public.profiles pr on pr.id = c.uid where c.id = v_id);
end;
$$;

create or replace function public.delete_comment(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.feed_comments;
begin
  select * into v_c from public.feed_comments where id = p_id;
  if v_c.id is null then
    return;
  end if;
  if v_c.uid is distinct from auth.uid() and not public.is_staff() then
    raise exception 'Not your comment' using errcode = '42501';
  end if;
  delete from public.feed_comments where id = p_id;
  if v_c.uid is distinct from auth.uid() then
    perform public._log_staff_action('delete_comment', v_c.uid, null, left(v_c.body, 120));
  end if;
end;
$$;

create or replace function public.report_comment(p_id bigint, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if exists (select 1 from public.feed_comments where id = p_id and uid <> v_uid and not hidden) then
    insert into public.comment_reports (comment_id, reporter, reason)
    values (p_id, v_uid, left(nullif(trim(p_reason), ''), 200))
    on conflict (comment_id, reporter) do nothing;
    if (select count(*) from public.comment_reports where comment_id = p_id) >= 3 then
      update public.feed_comments set hidden = true where id = p_id and reviewed_at is null;
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. The Home feed
--
-- home_feed(before, limit, filter) -> { items: [...], pinned: [...], has_more }
--   filter: all | prs | photos | transformations | posts | gym
--   items: newest first; each { type: set|pump|wall|gym|milestone, id, at, ... }
--   pinned (first page only): pinned notices / offers that are live now.
-- Pass the `at` of the last item you have as `before` for the next page.
-- ---------------------------------------------------------------------------
create or replace function public.home_feed(p_before timestamptz default null, p_limit int default 15, p_filter text default 'all')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_lim int := least(greatest(coalesce(p_limit, 15), 1), 30);
  v_f text := lower(coalesce(p_filter, 'all'));
  v_before timestamptz := coalesce(p_before, 'infinity'::timestamptz);
  v_items jsonb;
  v_pinned jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('items', '[]'::jsonb, 'pinned', '[]'::jsonb, 'has_more', false);
  end if;
  if v_f not in ('all', 'prs', 'photos', 'transformations', 'posts', 'gym') then
    v_f := 'all';
  end if;

  with src as (
    select 'set'::text as type, f.post_id as id, f.created_at as at,
           to_jsonb(f) || public._comment_info('set', f.post_id) as data
      from public.feed_posts(case when v_f = 'prs' then 50 else v_lim end, p_before) f
     where v_f in ('all', 'prs') and (v_f = 'all' or f.has_pb)
    union all
    select 'pump', f.item_id, f.created_at, to_jsonb(f) || public._comment_info('photo', f.item_id)
      from public.feed_photos(v_lim, p_before) f
     where v_f in ('all', 'photos')
    union all
    select 'wall', w.id, w.created_at, public._wall_json(w) || public._comment_info('wall', w.id)
      from (select * from public.wall_posts w
             where (not w.hidden or w.uid = v_uid) and w.created_at < v_before
               and (v_f = 'all' or (v_f = 'photos' and w.kind = 'photo') or (v_f = 'transformations' and w.kind = 'transformation')
                    or (v_f = 'posts' and w.kind = 'text'))
             order by w.created_at desc limit v_lim) w
    union all
    select 'gym', g.id, g.starts_at, public._gym_post_json(g)
      from (select * from public.gym_posts g
             where v_f in ('all', 'gym') and g.active and not g.pinned and g.starts_at <= now()
               and (g.ends_at is null or g.ends_at > now()) and g.starts_at < v_before
             order by g.starts_at desc limit v_lim) g
    union all
    select 'milestone', l.id, l.created_at,
           jsonb_build_object('kind', l.kind, 'title', l.title, 'is_mine', l.uid = v_uid,
                              'name', public._first_name(pr.display_name), 'avatar_url', pr.avatar_url,
                              'days', case when l.kind = 'streak' then nullif(split_part(l.ref, ':', 3), '')::int end)
      from (select * from public.xp_ledger l
             where v_f = 'all' and l.created_at < v_before and l.created_at > now() - interval '30 days'
               and (l.kind = 'badge' or (l.kind = 'streak' and split_part(l.ref, ':', 3) ~ '^\d+$' and split_part(l.ref, ':', 3)::int >= 7))
             order by l.created_at desc limit v_lim) l
      join public.profiles pr on pr.id = l.uid
  )
  select coalesce(jsonb_agg(jsonb_build_object('type', s.type, 'id', s.id, 'at', s.at) || s.data order by s.at desc, s.type, s.id desc), '[]'::jsonb)
    into v_items
    from (select * from src order by at desc, type, id desc limit v_lim) s;

  if p_before is null and v_f in ('all', 'gym') then
    select coalesce(jsonb_agg(public._gym_post_json(g) order by g.starts_at desc), '[]'::jsonb) into v_pinned
      from (select * from public.gym_posts g
             where g.active and g.pinned and g.starts_at <= now() and (g.ends_at is null or g.ends_at > now())
             order by g.starts_at desc limit 5) g;
  end if;

  return jsonb_build_object('items', v_items, 'pinned', v_pinned, 'has_more', jsonb_array_length(v_items) >= v_lim);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Staff: notices + offers, and reported posts / comments
-- ---------------------------------------------------------------------------
create or replace function public.admin_gym_posts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public._require_staff();
  return coalesce((
    select jsonb_agg(public._gym_post_json(g) || jsonb_build_object(
             'active', g.active, 'sponsor_id', g.sponsor_id, 'updated_at', g.updated_at,
             'status', case when not g.active then 'off'
                            when g.starts_at > now() then 'scheduled'
                            when g.ends_at is not null and g.ends_at <= now() then 'ended'
                            else 'live' end)
           order by g.active desc, g.pinned desc, g.starts_at desc)
      from public.gym_posts g), '[]'::jsonb);
end;
$$;

-- Only the fields sent are changed (for an existing post).
create or replace function public.admin_save_gym_post(p jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint := nullif(p->>'id', '')::bigint;
  v_old public.gym_posts;
  v_kind text;
  v_title text;
  v_url text;
  v_start timestamptz;
  v_end timestamptz;
begin
  perform public._require_staff();
  if v_id is not null then
    select * into v_old from public.gym_posts where id = v_id;
    if v_old.id is null then
      raise exception 'That post isn''t there any more' using errcode = 'P0002';
    end if;
  end if;
  v_kind := coalesce(nullif(p->>'kind', ''), v_old.kind, 'notice');
  if v_kind not in ('notice', 'offer') then
    raise exception 'Pick notice or offer' using errcode = '22023';
  end if;
  v_title := case when p ? 'title' then left(trim(coalesce(p->>'title', '')), 80) else v_old.title end;
  if char_length(coalesce(v_title, '')) < 1 then
    raise exception 'Give it a title' using errcode = '22023';
  end if;
  v_url := case when p ? 'cta_url' then nullif(trim(p->>'cta_url'), '') else v_old.cta_url end;
  if v_url is not null and v_url !~* '^https?://[^\s]+$' then
    raise exception 'The button link must start with https://' using errcode = '22023';
  end if;
  begin
    v_start := case when p ? 'starts_at' then coalesce(nullif(p->>'starts_at', '')::timestamptz, now()) else coalesce(v_old.starts_at, now()) end;
    v_end := case when p ? 'ends_at' then nullif(p->>'ends_at', '')::timestamptz else v_old.ends_at end;
  exception when others then
    raise exception 'Check the dates' using errcode = '22023';
  end;
  if v_end is not null and v_end <= v_start then
    raise exception 'The end has to be after the start' using errcode = '22023';
  end if;
  if p ? 'sponsor_id' and nullif(p->>'sponsor_id', '') is not null
     and not exists (select 1 from public.sponsors where id = p->>'sponsor_id') then
    raise exception 'Pick a brand from the list' using errcode = '22023';
  end if;
  if p ? 'reward_id' and nullif(p->>'reward_id', '') is not null
     and not exists (select 1 from public.rewards where id = (p->>'reward_id')::bigint) then
    raise exception 'Pick a shop item from the list' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.gym_posts (kind, title, body, image_url, sponsor_id, reward_id, code, cta_label, cta_url,
                                  pinned, starts_at, ends_at, active, created_by)
    values (v_kind, v_title, nullif(left(trim(coalesce(p->>'body', '')), 400), ''), nullif(trim(coalesce(p->>'image_url', '')), ''),
            nullif(p->>'sponsor_id', ''), nullif(p->>'reward_id', '')::bigint, nullif(left(trim(coalesce(p->>'code', '')), 40), ''),
            nullif(left(trim(coalesce(p->>'cta_label', '')), 30), ''), v_url,
            coalesce((p->>'pinned')::boolean, false), v_start, v_end, coalesce((p->>'active')::boolean, true), auth.uid())
    returning id into v_id;
  else
    update public.gym_posts set
      kind = v_kind,
      title = v_title,
      body = case when p ? 'body' then nullif(left(trim(coalesce(p->>'body', '')), 400), '') else body end,
      image_url = case when p ? 'image_url' then nullif(trim(coalesce(p->>'image_url', '')), '') else image_url end,
      sponsor_id = case when p ? 'sponsor_id' then nullif(p->>'sponsor_id', '') else sponsor_id end,
      reward_id = case when p ? 'reward_id' then nullif(p->>'reward_id', '')::bigint else reward_id end,
      code = case when p ? 'code' then nullif(left(trim(coalesce(p->>'code', '')), 40), '') else code end,
      cta_label = case when p ? 'cta_label' then nullif(left(trim(coalesce(p->>'cta_label', '')), 30), '') else cta_label end,
      cta_url = v_url,
      pinned = coalesce((p->>'pinned')::boolean, pinned),
      starts_at = v_start,
      ends_at = v_end,
      active = coalesce((p->>'active')::boolean, active),
      updated_at = now()
    where id = v_id;
  end if;
  perform public._log_staff_action('save_gym_post', null, null, v_kind || ': ' || v_title);
  return v_id;
end;
$$;

create or replace function public.admin_delete_gym_post(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
begin
  perform public._require_staff();
  delete from public.gym_posts where id = p_id returning title into v_title;
  if v_title is not null then
    perform public._log_staff_action('delete_gym_post', null, null, v_title);
  end if;
end;
$$;

-- Reported or hidden posts and comments, newest first.
create or replace function public.admin_feed_reports()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public._require_staff();
  return jsonb_build_object(
    'posts', coalesce((
      select jsonb_agg(x.j order by x.last_at desc)
        from (select coalesce((select max(r.created_at) from public.wall_reports r where r.post_id = w.id), w.created_at) as last_at,
                     public._wall_json(w) || jsonb_build_object(
                       'hidden', w.hidden, 'hidden_by_staff', w.hidden_by_staff,
                       'author', public._public_name(pr.display_name),
                       'reports', (select count(*)::int from public.wall_reports r where r.post_id = w.id),
                       'reasons', coalesce((select array_agg(r.reason order by r.created_at) from public.wall_reports r
                                             where r.post_id = w.id and r.reason is not null), '{}'::text[])) as j
                from public.wall_posts w
                join public.profiles pr on pr.id = w.uid
               where w.reviewed_at is null
                 and (w.hidden or exists (select 1 from public.wall_reports r2 where r2.post_id = w.id))) x), '[]'::jsonb),
    'comments', coalesce((
      select jsonb_agg(x.j order by x.last_at desc)
        from (select coalesce((select max(r.created_at) from public.comment_reports r where r.comment_id = c.id), c.created_at) as last_at,
                     jsonb_build_object('id', c.id, 'body', c.body, 'created_at', c.created_at, 'hidden', c.hidden,
                                        'target_type', c.target_type, 'target_id', c.target_id,
                                        'author', public._public_name(pr.display_name),
                                        'reports', (select count(*)::int from public.comment_reports r where r.comment_id = c.id),
                                        'reasons', coalesce((select array_agg(r.reason order by r.created_at) from public.comment_reports r
                                                              where r.comment_id = c.id and r.reason is not null), '{}'::text[])) as j
                from public.feed_comments c
                join public.profiles pr on pr.id = c.uid
               where c.reviewed_at is null
                 and (c.hidden or exists (select 1 from public.comment_reports r2 where r2.comment_id = c.id))) x), '[]'::jsonb)
  );
end;
$$;

-- Keep (hidden = false: shown again, reports cleared) or hide for good.
create or replace function public.admin_set_post_hidden(p_id bigint, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.wall_posts;
begin
  perform public._require_staff();
  update public.wall_posts set hidden = p_hidden, hidden_by_staff = p_hidden, reviewed_at = now()
   where id = p_id returning * into v_post;
  if v_post.id is not null then
    if not p_hidden then
      delete from public.wall_reports where post_id = p_id;
    end if;
    perform public._log_staff_action(case when p_hidden then 'hide_post' else 'keep_post' end, v_post.uid, v_post.machine_id,
                                     left(coalesce(v_post.body, v_post.kind || ' post'), 120));
  end if;
end;
$$;

create or replace function public.admin_set_comment_hidden(p_id bigint, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.feed_comments;
begin
  perform public._require_staff();
  update public.feed_comments set hidden = p_hidden, hidden_by_staff = p_hidden, reviewed_at = now()
   where id = p_id returning * into v_c;
  if v_c.id is not null then
    if not p_hidden then
      delete from public.comment_reports where comment_id = p_id;
    end if;
    perform public._log_staff_action(case when p_hidden then 'hide_comment' else 'keep_comment' end, v_c.uid, null, left(v_c.body, 120));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Who can call what
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'create_wall_post(text, text, jsonb, text, text, int)', 'edit_wall_post(bigint, text, text, text)',
    'delete_wall_post(bigint)', 'toggle_wall_kudos(bigint)', 'report_wall_post(bigint, text)',
    'list_comments(text, bigint, int)', 'add_comment(text, bigint, text)', 'delete_comment(bigint)',
    'report_comment(bigint, text)', 'home_feed(timestamptz, int, text)',
    'admin_gym_posts()', 'admin_save_gym_post(jsonb)', 'admin_delete_gym_post(bigint)',
    'admin_feed_reports()', 'admin_set_post_hidden(bigint, boolean)', 'admin_set_comment_hidden(bigint, boolean)'
  ] loop
    execute 'revoke all on function public.' || f || ' from public, anon';
    execute 'grant execute on function public.' || f || ' to authenticated';
  end loop;
end;
$$;
