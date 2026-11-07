# Backlog

The running to-do list for The Clubhouse. Tick items off (or delete them) in the same PR that ships them. Put new ideas under the right heading. **Next up** is Mihir's own priority order.

## Next up

- [ ] **Security check-up.** Waiting on Mihir to run `schema_export.sql` in the SQL Editor and send the output. Then: audit every RLS policy, check queries for follower-visibility mistakes (like the team-result bug in #10), tighten Edge Function CORS, commit the schema.

## Fixes and tidy-ups

- [ ] Snapshot the full database schema into the repo (part of the security check-up).
- [ ] The CORS origin on both Edge Functions is `*`. Tighten it to `https://myclubhouse.org` (part of the security check-up).
- [ ] Audit that every table the app writes to has RLS policies covering every operation it performs (part of the security check-up).
- [ ] Confirm whether the `players.aliases text[]` migration was ever run. It isn't in `supabase/migrations/`.

## Football

- [ ] Persist an "Abandoned" result tag. Needs a `result_tag` column; Won/Drawn/Lost only survive because they're re-derived from the score.
- [ ] An Edge Function so "add to everyone's personal record" works for the whole squad. RLS on `matches` only lets a client write its own row.
- [ ] Team stats
- [ ] Form tracking
- [ ] League table
- [ ] Team selection and formations
- [ ] Goal-and-assist partnerships: "who sets up whom" stats (top pairs, per player and per season) on the team view. *DB step: result entry only saves per-player goal and assist totals, so which assist went with which goal is lost. Needs a `fixture_goals` table (fixture, scorer, assister, order) with team-member RLS. Only games entered after that will have the links.*
- [ ] Comms
- [ ] Fill in opponents for the first-season backfilled games, if anyone remembers them.

## Golf

- [ ] Multi-person scores and match play: record a match alongside the individual score, in four-ball, foursomes, scramble, three-ball and two-ball formats.
- [ ] **Course search up front:** find the course before the round and fill in par and stroke index per hole, so nothing is typed by hand. Pick the tee colour, which sets the yardages, and SI where it differs by tee. *Needs a course data source (a golf course API, or build up our own `courses` table from scorecard photos), plus tee columns: DB step.* Replaces "Course retrieval" and "Hole length and tee colour".
- [ ] **Practice sessions:** a new golf session type. Free practice (total balls) or planned (balls per club), plus a name or focus ("Wedges inside 100"), a rating and notes. *New tables: DB step.*
- [ ] **Club distance tracker:** record carry distances per club during a practice session to get an average for each club. Re-test every few months and chart the progress per club. Builds on practice sessions.
- [ ] **Distance to the pin (GPS):** live yards to the green as you play, from the phone's location. *Trickier: needs green coordinates per hole (from a course data source, or tapped in once on a map and saved per course), the screen kept on, and battery care. Works in a web app over HTTPS.* Builds on course search.

## Gym


## New sports

- [ ] **Squash:** a new sport (filter chip, log form, feed card, detail page, Insights, chart colour). Likely fields: opponent, games won and lost (e.g. 3–1), points per game, venue, rating, notes. *New details table with follower select policy: DB step. Needs a validated `--chart-squash` colour.*

## Social

- [ ] Sport grouping

## Stats and insights

- [ ] "Year in sport": Spotify Wrapped-style screens.
- [ ] Date filters on Insights: this month, last 3 months, season (Aug–Jul), this year, all time, custom.
- [ ] Personalise Insights: pick which cards to show and in what order, from a list. *Saved per device at first; to follow you across devices it needs a `profiles` column, which is a DB step.*

## Profile

- [ ] Sport-specific user attributes
- [ ] Delete or cancel matches waiting to be logged on your profile.

## Integrations

- [ ] **Garmin:** pull in data from Garmin Connect. Ideas so far: auto-import gym and cardio activities; heart rate and calories on sessions; steps and distance walked on golf rounds; the Garmin scorecard and shot tracking for golf; training load or body battery in Insights. *Two routes: the official Garmin Connect Developer Program (needs an approved developer account and an Edge Function for OAuth and webhooks), or a Garmin MCP connector so Claude can read your data on request. To decide first: which of these you actually want.*

## General

- [ ] Field validation
- [ ] Entering data on behalf of others
- [ ] Voice notes
- [ ] Scheduling

## Done recently

- [x] Squad picker (team sheet and "Who played?" on results): the 15 players with the most appearances in the last year are shown first, plus anyone already picked. Everyone else is under "Other squad players (N)" with a search, and picking one moves them up. "+ New player" is a separate step, and it checks the name against the squad first, so typing an existing player's name picks them instead of creating a duplicate.
- [x] Gym workout timer (⏱ Timer on the sets screen), alongside the rest bar: **Intervals** (work/rest seconds × rounds, optional exercise list where a round is once through the list), **AMRAP** (countdown with a big tap-for-+1-round button) and **Stopwatch** (holds). 5s get-ready, beeps and buzzes on every switch, pause, survives locking the phone. When it ends the work is added as time sets (total time + rounds, e.g. Plank 3:00 · 4 rounds), editable before saving. Time sets now have a Rounds field too.
- [x] Scorecard photo loading screen: your photo, a spinner, what it's reading and a seconds counter, plus "Keep using the app". The read carries on in the background and waits at the top of your feed ("Scorecard ready to review" → Review / Dismiss). A failed read says so on the setup screen instead of a pop-up; if the app was closed mid-read the card says so with Try again.
- [x] Gym rest timer (one-tap 1:00/1:30/2:00/3:00, +15s, beep and vibrate, survives switching apps) and a review step before saving (title, totals incl. kg lifted, sets grouped by exercise, warnings for unfinished sets, back to sets).
- [x] Logging and feed: + is a bigger labelled "Log" button that opens a panel over the feed (sports, tracked ones first, plus team games waiting to be logged) instead of a picker at the bottom of the page; your feed is grouped by month with "Show older".
- [x] Likes, shown as 🍺 beers: beer button on Following cards with a count (tap again to take it back); your own cards show who sent one ("Harry, Priya and 1 other"). `likes` table: you can send a beer only for activities you can see and not your own.
- [x] Golf handicap & Stableford: playing handicap per round (pre-filled from the last round or the scorecard; "+2" for plus handicaps), stroke index per hole read from the photo and saved per course, Stableford points live per hole, per nine and per round, stored with the round, on the detail page and in Insights (18-hole average and best).
- [x] Bigger & clearer mode, labelled "OAP" (Me → Appearance: Off / On / Match phone, default Match phone): larger type, spacing and tap targets, stronger contrast, sentence-case labels; feed cards cut to what/when/result with Open → detail page; Insights one stat per row with charts folded. Detail page now has Edit and Delete for every sport. Stat rows wrap (football cards used to run off the edge).
- [x] Display names required: asked at onboarding, and once for existing accounts without one (pre-filled from their team-sheet name); can't be blanked on the Me screen. Until set, search falls back to the team-sheet name. One-off backfill: `supabase/scripts/2026-10-18_backfill_display_names.sql`.
- [x] Football rating: 1–10 rating chips on the personal football form (log and edit), so games added from a team result or the backfill can be rated afterwards. Fixed team results skipping your personal record when a followed teammate already had one for that fixture. Football saves now roll back a half-failed save like golf/gym.
- [x] Insights tab: this month vs last, weekly streak and best streak, activities this year; last-12-weeks chart by sport; football record/goals/form/avg rating; golf average, last-5 trend, best round, score-vs-par chart, birdies; gym sessions/sets, distance and cardio time, most-trained muscle groups, heaviest-set progress for the most-logged lift. Every chart has a tooltip and a table view.
- [x] Social feed with open following: You / Following switch on the feed (respects the sport filter), read-only cards for people you follow, People screen (search by name, teammate suggestions, following/followers lists), counts on the Me screen. `follows` table plus follower read-only RLS; name search via `search_people()` / `people_by_ids()` so `profiles` stays private.
- [x] Gym: optional session names ("Push day"); unnamed sessions are titled by muscle groups. Repeat list shows the latest of each named session.
- [x] Gym: repeat a recent session (from the setup screen or a session's detail page) and edit it; sets measured by reps or by time/distance, mixed freely in one session (covers "mixed sessions"); Cardio session type; + Add set copies the set above.
- [x] Team view redesign: next match pinned with team sheet/result buttons, season chips (Aug–Jul), season summary with W–D–L, goals, GD and a last-5 form strip, tappable results list, per-season player table (apps, goals, assists, MOTM). Members tucked into a collapsible section. (Built without access to the Claude Design files.)
- [x] Goal-by-goal result entry: Goal 1 → scorer / assist dropdowns from the squad, with own goals and "not sure"; cards as one compact line per player.
- [x] Golf scorecard review: front 9 / back 9 with Out/In subtotals and live totals, traditional score marks (circle birdie, double circle eagle, square bogey, filled square double+), missing holes marked and jumped to. Strip colours: par is now neutral so birdies stand out. (Answers the birdie/eagle question: shapes rather than more accent colours.)
- [x] Robustness fixes: one bad row no longer breaks the feed; user-typed text is escaped everywhere it's rendered (`escapeHtml()` in auth.js); half-failed golf/gym saves are rolled back with a message instead of leaving orphaned rows; dead duplicate `renderHoleStep()` removed.
- [x] Light mode: Dark / Light / Match phone setting on the Me screen, saved per device. Dark stays the default.
- [x] Football results entry: score, venue and kit; squad; goals, assists and cards; MOTM/DOTD vote tally; optional add to your personal record.
- [x] Ad-hoc (non-member) players on the team sheet and in result entry.
- [x] WhatsApp backfill of GCOBAFC history, Sep 2023 to Apr 2026 (done as a one-off).
- [x] Golf scorecard photo upload, using the `parse-scorecard` Edge Function and a review screen.
- [x] Fix for gym rows without details breaking the feed.

## Decided against (for now)

- Match rating on the golf and gym wizards. Football already captures one.
