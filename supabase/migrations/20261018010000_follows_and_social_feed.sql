-- Social feed: open following.
--
-- Anyone signed in can follow anyone, and a follower can then READ (never
-- change) the person's activities and their detail rows. Nothing here touches
-- the existing owner policies; Postgres ORs permissive policies together, so
-- these only add access, they never remove any.
--
-- Run this BEFORE merging the social-feed PR.

-- ---------------------------------------------------------------------------
-- follows
-- ---------------------------------------------------------------------------
create table if not exists follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followee_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint follows_not_self check (follower_id <> followee_id)
);

create index if not exists follows_followee_id_idx on follows(followee_id);

alter table follows enable row level security;
grant select, insert, delete on follows to authenticated;

-- You can see who you follow and who follows you (for the counts and lists).
drop policy if exists "follows_select_own" on follows;
create policy "follows_select_own" on follows
  for select to authenticated
  using (follower_id = auth.uid() or followee_id = auth.uid());

-- You can only create and remove your own follows.
drop policy if exists "follows_insert_self" on follows;
create policy "follows_insert_self" on follows
  for insert to authenticated
  with check (follower_id = auth.uid());

drop policy if exists "follows_delete_self" on follows;
create policy "follows_delete_self" on follows
  for delete to authenticated
  using (follower_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Followers can read activities
-- ---------------------------------------------------------------------------
drop policy if exists "matches_select_followers" on matches;
create policy "matches_select_followers" on matches
  for select to authenticated
  using (exists (
    select 1 from follows f
    where f.follower_id = auth.uid() and f.followee_id = matches.user_id
  ));

-- Every per-activity detail table hangs off matches.match_id, so they all get
-- the same rule: readable if you follow the owner of the parent match.
do $$
declare
  t text;
begin
  foreach t in array array['football_details', 'cricket_details', 'golf_details', 'golf_holes', 'gym_details', 'gym_sets'] loop
    execute format('drop policy if exists %I on %I', t || '_select_followers', t);
    execute format($p$
      create policy %I on %I
        for select to authenticated
        using (exists (
          select 1 from matches m
          join follows f on f.followee_id = m.user_id
          where m.id = %I.match_id and f.follower_id = auth.uid()
        ))
    $p$, t || '_select_followers', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Finding people, without opening up the profiles table
-- ---------------------------------------------------------------------------
-- These run as the function owner so they can read past profiles' RLS, but
-- they only ever return id + display name + sports, and only to a signed-in
-- caller. Whatever else lives on profiles stays private.

create or replace function search_people(q text)
returns table (id uuid, display_name text, sports_tracked text[])
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.display_name, p.sports_tracked
  from profiles p
  where auth.uid() is not null
    and length(trim(q)) >= 2
    and p.id <> auth.uid()
    and p.display_name ilike '%' || replace(replace(replace(trim(q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  order by p.display_name
  limit 20
$$;

create or replace function people_by_ids(ids uuid[])
returns table (id uuid, display_name text, sports_tracked text[])
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.display_name, p.sports_tracked
  from profiles p
  where auth.uid() is not null
    and p.id = any(ids)
  limit 500
$$;

revoke all on function search_people(text) from public, anon;
revoke all on function people_by_ids(uuid[]) from public, anon;
grant execute on function search_people(text) to authenticated;
grant execute on function people_by_ids(uuid[]) to authenticated;
