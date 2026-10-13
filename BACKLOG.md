# Backlog

The running to-do list for The Clubhouse. Tick items off (or delete them) in the same PR that ships them. Put new ideas under the right heading. **Next up** is Mihir's own priority order.

## Next up

- [ ] **Team view redesign.** The backfilled history makes its problems obvious. Agreed direction: group fixtures by season with the next fixture pinned at the top; a season summary and form strip; per-season player stats. Work towards the Claude Design files.

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
