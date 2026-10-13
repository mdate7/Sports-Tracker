# Backlog

The running to-do list for The Clubhouse. Tick items off (or delete them) in the same PR that ships them. Put new ideas under the right heading. **Next up** is Mihir's own priority order.

## Next up

- [ ] **Team view redesign.** The backfilled history makes its problems obvious. Agreed direction: group fixtures by season with the next fixture pinned at the top; a season summary and form strip; per-season player stats. Work towards the Claude Design files.
- [ ] **Light mode toggle.** The light tokens already exist in `Clubhouse-tokens.css`, but `data-theme="dark"` is hard-coded on `<html>`. Add a toggle on the Me screen that flips `data-theme` and remembers the choice in localStorage. (Small, front-end only. A good first task for the new workflow.)

## Fixes and tidy-ups (found while setting up CLAUDE.md)

- [ ] `golf.js` defines `renderHoleStep()` twice (around lines 124 and 179). The second definition silently wins, so the first is dead code. Remove it once the second is confirmed to be the one in use.
- [ ] `renderList()` in `script.js` still runs `sorted.forEach(renderMatch)` with no per-item try/catch, so one bad row can still stop the rest of the feed rendering. The `(match.sets || [])` guard fixed the known case but not the general one.
- [ ] `finishGolfRound()` and `finishGymSession()` only `console.error` when the `golf_details`/`gym_details` insert fails after the `matches` row is saved. Show the user an error and remove the orphaned `matches` row.
- [ ] No HTML-escaping helper exists, so user-typed names and notes go into `innerHTML` raw. Add one small `escapeHtml()` and use it wherever user text is rendered.
- [ ] Snapshot the full database schema into the repo (`supabase db pull`). Only the Sept 2026 team migrations are committed; the original tables live only in the Dashboard.
- [ ] The CORS origin on both Edge Functions is `*`. Tighten it to `https://myclubhouse.org`.
- [ ] Audit that every table the app writes to has RLS policies covering every operation it performs.
- [ ] Confirm whether the `players.aliases text[]` migration was ever run. It isn't in `supabase/migrations/`.

## Football

- [ ] Goal-by-goal result entry: "Goal 1 → scorer / assister" dropdowns from the squad, instead of goals and assists against the long team list.
- [ ] Persist an "Abandoned" result tag. Needs a `result_tag` column; Won/Drawn/Lost only survive because they're re-derived from the score.
- [ ] An Edge Function so "add to everyone's personal record" works for the whole squad. RLS on `matches` only lets a client write its own row.
- [ ] Team stats
- [ ] Form tracking
- [ ] League table
- [ ] Team selection and formations
- [ ] Comms
- [ ] Fill in opponents for the first-season backfilled games, if anyone remembers them.

## Golf

- [ ] Scorecard review screen: split into front 9 and back 9, overhaul the layout, and make the birdie/par colours more distinct. Open question: give birdie and eagle their own accent colours, or just stronger contrast on the existing states?
- [ ] Multi-person scores
- [ ] Stroke indexes and handicaps
- [ ] Stableford scoring
- [ ] Course retrieval
- [ ] Hole length and tee colour

## Gym

- [ ] Mixed sessions
- [ ] Timer
- [ ] Review screen

## Social

- [ ] Feed (previously flagged as high priority)
- [ ] Sport grouping
- [ ] Likes
- [ ] Follow / following

## Stats and insights

- [ ] Cross-sport stats
- [ ] Streaks
- [ ] Sport-specific stats

## Profile

- [ ] Sport-specific user attributes

## General

- [ ] Bigger, higher-contrast text across the whole app
- [ ] Field validation
- [ ] Entering data on behalf of others
- [ ] Voice notes
- [ ] Scheduling

## Done recently

- [x] Football results entry: score, venue and kit; squad; goals, assists and cards; MOTM/DOTD vote tally; optional add to your personal record.
- [x] Ad-hoc (non-member) players on the team sheet and in result entry.
- [x] WhatsApp backfill of GCOBAFC history, Sep 2023 to Apr 2026 (done as a one-off).
- [x] Golf scorecard photo upload, using the `parse-scorecard` Edge Function and a review screen.
- [x] Fix for gym rows without details breaking the feed.

## Decided against (for now)

- Match rating on the golf and gym wizards. Football already captures one.
