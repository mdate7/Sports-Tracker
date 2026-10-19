-- Likes (👏) on activities.
--
-- You can like an activity you're able to see (i.e. someone you follow), but
-- not your own. Likes are visible to anyone who can see the activity, so its
-- owner sees who clapped, and fellow followers see the count. Only the person
-- who liked can remove their like. Deleting an activity removes its likes.

create table if not exists likes (
  user_id    uuid not null references auth.users(id) on delete cascade,
  match_id   uuid not null references matches(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, match_id)
);

create index if not exists likes_match_id_idx on likes(match_id);

alter table likes enable row level security;
grant select, insert, delete on likes to authenticated;

-- The subquery on matches runs under matches' own RLS, so "exists" means
-- "this activity is one you're allowed to see" (yours, or someone you follow).
drop policy if exists "likes_select_visible" on likes;
create policy "likes_select_visible" on likes
  for select to authenticated
  using (exists (select 1 from matches m where m.id = likes.match_id));

drop policy if exists "likes_insert_own_on_visible" on likes;
create policy "likes_insert_own_on_visible" on likes
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from matches m where m.id = likes.match_id and m.user_id <> auth.uid())
  );

drop policy if exists "likes_delete_own" on likes;
create policy "likes_delete_own" on likes
  for delete to authenticated
  using (user_id = auth.uid());
