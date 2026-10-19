# Backlog

The running to-do list for The Clubhouse. Tick items off (or delete them) in the same PR that ships them. Put new ideas under the right heading. **Next up** is Mihir's own priority order.

## Next up


## Fixes and tidy-ups (found while setting up CLAUDE.md)

- [ ] Snapshot the full database schema into the repo (`supabase db pull`). Only the Sept 2026 team migrations are committed; the original tables live only in the Dashboard.
- [ ] The CORS origin on both Edge Functions is `*`. Tighten it to `https://myclubhouse.org`.
- [ ] Audit that every table the app writes to has RLS policies covering every operation it performs.
- [ ] Confirm whether the `players.aliases text[]` migration was ever run. It isn't in `supabase/migrations/`.

## Football

- [ ] Persist an "Abandoned" result tag. Needs a `result_tag` column; Won/Drawn/Lost only survive because they're re-derived from the score.
- [ ] An Edge Function so "add to everyone's personal record" works for the whole squad. RLS on `matches` only lets a client write its own row.
- [ ] Team stats
- [ ] Form tracking
- [ ] League table
- [ ] Team selection and formations
- [ ] Comms
- [ ] Fill in opponents for the first-season backfilled games, if anyone remembers them.

## Golf

- [ ] Multi-person scores
- [ ] Course retrieval
- [ ] Hole length and tee colour

## Gym

- [ ] Timer
- [ ] Review screen

## Social

- [ ] Sport grouping

## Stats and insights


## Profile

- [ ] Sport-specific user attributes

## General

- [ ] Field validation
- [ ] Entering data on behalf of others
- [ ] Voice notes
- [ ] Scheduling

## Done recently

- [x] Golf handicap & Stableford: playing handicap per round (pre-filled from the last round or the scorecard; "+2" for plus handicaps), stroke index per hole read from the photo and saved per course, Stableford points live per hole, per nine and per round, stored with the round, on the detail page and in Insights (18-hole average and best).
- [x] Likes (👏): clap button on Following cards with a count (tap again to remove); your own cards show who clapped ("Harry, Priya and 1 other"). `likes` table: you can clap only for activities you can see and not your own.
- [x] Bigger & clearer mode (Me → Appearance: Off / On / Match phone, default Match phone): larger type, spacing and tap targets, stronger contrast, sentence-case labels; feed cards cut to what/when/result with Open → detail page; Insights one stat per row with charts folded. Detail page now has Edit and Delete for every sport. Stat rows wrap (football cards used to run off the edge).
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
