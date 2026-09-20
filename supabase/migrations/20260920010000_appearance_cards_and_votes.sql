-- Cards + live MOTM/DOTD vote tallying on fixture_appearances.
--
-- Votes are tallied live by whoever's running the count (e.g. going round
-- the pub) rather than a self-serve in-app poll: motm_votes/dotd_votes are
-- just counters someone increments per player as votes are called out.
-- is_motm/is_dotd stay as the separate "confirmed winner" flag — ties or
-- an admin override don't have to follow the raw vote count.
--
-- Run via `supabase db push`, or paste into the SQL editor.

alter table fixture_appearances
  add column if not exists yellow_cards integer not null default 0,
  add column if not exists red_card boolean not null default false,
  add column if not exists motm_votes integer not null default 0,
  add column if not exists dotd_votes integer not null default 0;

alter table fixture_appearances
  add constraint fixture_appearances_yellow_cards_check check (yellow_cards >= 0),
  add constraint fixture_appearances_motm_votes_check check (motm_votes >= 0),
  add constraint fixture_appearances_dotd_votes_check check (dotd_votes >= 0);
