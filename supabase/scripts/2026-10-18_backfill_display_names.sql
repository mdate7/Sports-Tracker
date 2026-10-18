-- One-off: give display names to people who signed up before the app asked
-- for one. NOT a migration, so it never runs automatically.
--
-- Run it in the Supabase Dashboard → SQL Editor, one step at a time:
-- highlight a step and press Run (Cmd+Enter runs just the highlighted part).
-- Nothing here touches anyone who already has a name, so it's safe to run
-- again later for people who sign up in the meantime.


-- STEP 1 — Look first (read-only).
-- Everyone without a name, with the name their team already uses for them
-- if there is one, and when they last signed in.
select
  u.email,
  (select pl.display_name from players pl
    where pl.user_id = p.id and trim(pl.display_name) <> ''
    order by pl.created_at limit 1) as team_name,
  u.last_sign_in_at::date as last_signed_in,
  p.id
from profiles p
join auth.users u on u.id = p.id
where coalesce(trim(p.display_name), '') = ''
order by team_name nulls last, u.last_sign_in_at desc nulls last;


-- STEP 2 — Fill in everyone who has a team name.
-- Copies the name from their team sheet. Shows who was updated.
update profiles p
set display_name = t.team_name
from (
  select distinct on (user_id) user_id, trim(display_name) as team_name
  from players
  where user_id is not null and trim(display_name) <> ''
  order by user_id, created_at
) t
where t.user_id = p.id
  and coalesce(trim(p.display_name), '') = ''
returning p.id, p.display_name;


-- STEP 3 — Everyone else, by hand.
-- Re-run STEP 1 to see who's left. For each person you recognise, add a line
-- inside VALUES below: ('their email', 'Their Name'). Separate lines with a
-- comma, no comma after the last one. Emails are matched ignoring capitals.
-- Delete the two example lines first. Anyone you leave out will be asked
-- for their name the next time they open the app.
with names(email, display_name) as (
  values
    ('someone@example.com', 'Example Person'),
    ('another@example.com', 'Another Person')
)
update profiles p
set display_name = trim(n.display_name)
from names n
join auth.users u on lower(u.email) = lower(trim(n.email))
where p.id = u.id
  and coalesce(trim(p.display_name), '') = ''
  and trim(n.display_name) <> ''
returning u.email, p.display_name;


-- STEP 4 — Check (read-only). Should list only people you couldn't name.
select u.email, u.last_sign_in_at::date as last_signed_in
from profiles p
join auth.users u on u.id = p.id
where coalesce(trim(p.display_name), '') = ''
order by u.last_sign_in_at desc nulls last;
