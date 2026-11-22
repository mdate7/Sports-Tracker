-- Golf practice sessions: a second kind of golf activity alongside rounds.
--
-- A practice session is a normal `matches` row (sport = 'golf', with date,
-- rating and notes as usual) plus:
--   golf_practice        one row per session: type, focus, where, total balls
--   golf_practice_clubs  one row per club hit, with how many balls
--
-- A golf match has EITHER a golf_details row (a round) OR a golf_practice row
-- (a practice session), never both. That's how the app tells them apart.
--
-- golf_practice_clubs is its own table (not an array column) so the club
-- distance tracker can add carry-distance columns per club later.
--
-- Run this BEFORE merging the practice-sessions PR: the app's feed query asks
-- for these tables, and the whole feed fails to load if they don't exist yet.

create table if not exists golf_practice (
  match_id      uuid primary key references matches(id) on delete cascade,
  practice_type text not null,
  focus         text,
  venue         text,
  total_balls   integer,
  created_at    timestamptz not null default now(),
  constraint golf_practice_type_check
    check (practice_type in ('range', 'short_game', 'putting', 'sim')),
  constraint golf_practice_total_balls_check
    check (total_balls is null or total_balls between 0 and 5000)
);

create table if not exists golf_practice_clubs (
  id        uuid primary key default gen_random_uuid(),
  match_id  uuid not null references matches(id) on delete cascade,
  position  integer not null,
  club      text not null,
  balls     integer,
  constraint golf_practice_clubs_position_unique unique (match_id, position),
  constraint golf_practice_clubs_balls_check
    check (balls is null or balls between 0 and 2000)
);

create index if not exists golf_practice_clubs_match_id_idx on golf_practice_clubs(match_id);

alter table golf_practice       enable row level security;
alter table golf_practice_clubs enable row level security;
grant select, insert, update, delete on golf_practice       to authenticated;
grant select, insert, update, delete on golf_practice_clubs to authenticated;

-- Owner access: you can do anything to the practice rows of your own matches.
-- Followers: read-only, the same rule every other per-activity table has, so
-- practice shows up on friends' Following feed.
do $$
declare
  t text;
begin
  foreach t in array array['golf_practice', 'golf_practice_clubs'] loop
    execute format('drop policy if exists %I on %I', t || '_owner_all', t);
    execute format($p$
      create policy %I on %I
        for all to authenticated
        using (exists (select 1 from matches m where m.id = %I.match_id and m.user_id = auth.uid()))
        with check (exists (select 1 from matches m where m.id = %I.match_id and m.user_id = auth.uid()))
    $p$, t || '_owner_all', t, t, t);

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
