-- One row per goal we scored, in order, so we know which assist went with
-- which goal. fixture_appearances only keeps per-player totals, which loses
-- that link (and is why "Edit result" used to have to guess the pairs).
--
-- Only games published after this goes live will have rows; older games keep
-- their totals in fixture_appearances and simply have no partnership links.
--
-- scorer_player_id null = "Not sure"; own_goal = their own goal (no scorer
-- or assist from our side). Players are set null, not deleted, if a player is
-- ever removed, so the goal itself still counts.
--
-- Run this BEFORE merging the partnerships PR: publishing a result writes
-- this table, and fails while it doesn't exist.

create table if not exists fixture_goals (
  id               uuid primary key default gen_random_uuid(),
  fixture_id       uuid not null references fixtures(id) on delete cascade,
  position         integer not null,
  scorer_player_id uuid references players(id) on delete set null,
  assist_player_id uuid references players(id) on delete set null,
  own_goal         boolean not null default false,
  created_at       timestamptz not null default now(),
  constraint fixture_goals_position_unique unique (fixture_id, position),
  constraint fixture_goals_position_check check (position >= 1),
  constraint fixture_goals_own_goal_check check (not own_goal or (scorer_player_id is null and assist_player_id is null)),
  constraint fixture_goals_not_self_assist check (assist_player_id is null or assist_player_id is distinct from scorer_player_id)
);

create index if not exists fixture_goals_fixture_id_idx on fixture_goals(fixture_id);

alter table fixture_goals enable row level security;
grant select, insert, update, delete on fixture_goals to authenticated;

-- Same gate as fixture_appearances: any member of the fixture's team can
-- read and write its goals.
do $$
declare
  op text;
  gate text := 'exists (select 1 from fixtures join team_members on team_members.team_id = fixtures.team_id
                 where fixtures.id = fixture_goals.fixture_id and team_members.user_id = auth.uid())';
begin
  foreach op in array array['select', 'insert', 'update', 'delete'] loop
    execute format('drop policy if exists %I on fixture_goals', 'fixture_goals_' || op || '_team_members');
    if op = 'insert' then
      execute format('create policy %I on fixture_goals for insert to authenticated with check (%s)',
                     'fixture_goals_insert_team_members', gate);
    elsif op = 'update' then
      execute format('create policy %I on fixture_goals for update to authenticated using (%s) with check (%s)',
                     'fixture_goals_update_team_members', gate, gate);
    else
      execute format('create policy %I on fixture_goals for %s to authenticated using (%s)',
                     'fixture_goals_' || op || '_team_members', op, gate);
    end if;
  end loop;
end $$;
