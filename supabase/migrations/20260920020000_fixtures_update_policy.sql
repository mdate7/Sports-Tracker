-- Let team members update their own team's fixtures.
--
-- WHY: the previous migration added goals_for/goals_against/venue/kit to
-- `fixtures`, but `fixtures` was created back when nothing in the app ever
-- updated a fixture — so it has SELECT/INSERT policies and no UPDATE policy.
-- With RLS enabled and no UPDATE policy, an update is not rejected with an
-- error: it simply matches zero rows and reports success. That's why
-- publishResult() appeared to work while the score never persisted, and the
-- fixture row kept showing "Add result".
--
-- To see the current policies before/after running this:
--   select policyname, cmd, qual, with_check
--   from pg_policies where tablename = 'fixtures';
--
-- Run via `supabase db push`, or paste into the SQL editor.

-- Safe to re-run.
drop policy if exists "fixtures_update_team_members" on fixtures;

create policy "fixtures_update_team_members" on fixtures
  for update
  using (
    exists (
      select 1 from team_members
      where team_members.team_id = fixtures.team_id
        and team_members.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from team_members
      where team_members.team_id = fixtures.team_id
        and team_members.user_id = auth.uid()
    )
  );
