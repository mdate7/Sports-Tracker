-- Team fixture results + player appearances
-- Adds: result fields on fixtures, a per-team players roster (works for
-- members and backfilled non-members alike), and per-fixture appearances
-- (goals/assists/MOTM/DOTD) keyed to players.
--
-- Run via `supabase db push`, or paste into the SQL editor. Review the RLS
-- policies at the bottom before applying — they assume the same
-- "must be a member of the fixture's team" gate your existing fixtures/
-- team_sheets policies use. Check them against what you've actually got
-- (I can't read your current policies from here) and adjust if they differ.

-- ── fixtures: add result fields ─────────────────────────────────────────
alter table fixtures
  add column if not exists goals_for integer,
  add column if not exists goals_against integer,
  add column if not exists venue text,
  add column if not exists kit text;

-- ── players: per-team roster, optionally linked to a real account ──────
-- user_id is null for anyone backfilled from the WhatsApp chat who never
-- signed up; not null for a real team_members row. display_name is always
-- set (so a card can render without a join even for non-members).
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  display_name text not null,
  created_at timestamptz not null default now(),

  -- a real member should only ever appear once per team
  constraint players_team_user_unique unique (team_id, user_id)
);

create index if not exists players_team_id_idx on players(team_id);
create index if not exists players_user_id_idx on players(user_id);

-- ── fixture_appearances: one row per player per fixture ────────────────
create table if not exists fixture_appearances (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references fixtures(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  goals integer not null default 0,
  assists integer not null default 0,
  position text,
  is_motm boolean not null default false,
  is_dotd boolean not null default false,
  -- points back at the player's own personal match log entry for this
  -- game, when they're a real member and logged it themselves too
  matched_match_id uuid references matches(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint fixture_appearances_unique unique (fixture_id, player_id)
);

create index if not exists fixture_appearances_fixture_id_idx on fixture_appearances(fixture_id);
create index if not exists fixture_appearances_player_id_idx on fixture_appearances(player_id);

-- ── RLS ──────────────────────────────────────────────────────────────
alter table players enable row level security;
alter table fixture_appearances enable row level security;

-- players: any member of the team can read/write the roster
create policy "players_select_team_members" on players
  for select using (
    exists (
      select 1 from team_members
      where team_members.team_id = players.team_id
        and team_members.user_id = auth.uid()
    )
  );

create policy "players_insert_team_members" on players
  for insert with check (
    exists (
      select 1 from team_members
      where team_members.team_id = players.team_id
        and team_members.user_id = auth.uid()
    )
  );

create policy "players_update_team_members" on players
  for update using (
    exists (
      select 1 from team_members
      where team_members.team_id = players.team_id
        and team_members.user_id = auth.uid()
    )
  );

create policy "players_delete_team_members" on players
  for delete using (
    exists (
      select 1 from team_members
      where team_members.team_id = players.team_id
        and team_members.user_id = auth.uid()
    )
  );

-- fixture_appearances: any member of the fixture's team can read/write
create policy "fixture_appearances_select_team_members" on fixture_appearances
  for select using (
    exists (
      select 1 from fixtures
      join team_members on team_members.team_id = fixtures.team_id
      where fixtures.id = fixture_appearances.fixture_id
        and team_members.user_id = auth.uid()
    )
  );

create policy "fixture_appearances_insert_team_members" on fixture_appearances
  for insert with check (
    exists (
      select 1 from fixtures
      join team_members on team_members.team_id = fixtures.team_id
      where fixtures.id = fixture_appearances.fixture_id
        and team_members.user_id = auth.uid()
    )
  );

create policy "fixture_appearances_update_team_members" on fixture_appearances
  for update using (
    exists (
      select 1 from fixtures
      join team_members on team_members.team_id = fixtures.team_id
      where fixtures.id = fixture_appearances.fixture_id
        and team_members.user_id = auth.uid()
    )
  );

create policy "fixture_appearances_delete_team_members" on fixture_appearances
  for delete using (
    exists (
      select 1 from fixtures
      join team_members on team_members.team_id = fixtures.team_id
      where fixtures.id = fixture_appearances.fixture_id
        and team_members.user_id = auth.uid()
    )
  );
