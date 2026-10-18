-- Most accounts were created before onboarding asked for a name, so their
-- profiles.display_name is blank and search couldn't find them. Until they
-- set one, fall back to the name their team already uses for them
-- (players.display_name, from team sheets and the WhatsApp backfill).
--
-- Only replaces the two functions from 20261018010000; no tables change.

create or replace function person_display_name(person uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select nullif(trim(p.display_name), '') from profiles p where p.id = person),
    (select nullif(trim(pl.display_name), '') from players pl
      where pl.user_id = person
      order by pl.created_at
      limit 1)
  )
$$;

create or replace function search_people(q text)
returns table (id uuid, display_name text, sports_tracked text[])
language sql
stable
security definer
set search_path = public
as $$
  select * from (
    select p.id, person_display_name(p.id) as display_name, p.sports_tracked
    from profiles p
    where auth.uid() is not null
      and length(trim(q)) >= 2
      and p.id <> auth.uid()
  ) named
  where named.display_name ilike '%' || replace(replace(replace(trim(q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  order by named.display_name
  limit 20
$$;

create or replace function people_by_ids(ids uuid[])
returns table (id uuid, display_name text, sports_tracked text[])
language sql
stable
security definer
set search_path = public
as $$
  select p.id, person_display_name(p.id), p.sports_tracked
  from profiles p
  where auth.uid() is not null
    and p.id = any(ids)
  limit 500
$$;

-- Internal helper: callable only from the two functions above (which run as
-- their owner), not directly by app users.
revoke all on function person_display_name(uuid) from public, anon, authenticated;
revoke all on function search_people(text) from public, anon;
revoke all on function people_by_ids(uuid[]) from public, anon;
grant execute on function search_people(text) to authenticated;
grant execute on function people_by_ids(uuid[]) to authenticated;
