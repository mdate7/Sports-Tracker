# The Clubhouse

A personal multi-sport tracker (football, golf, gym, cricket, plus teams), live at **myclubhouse.org**. Mihir is the sole developer. The open work is in `BACKLOG.md`.

## Stack

- **Frontend:** plain HTML/CSS/JS. No framework, no bundler, no build step. Every file is loaded as a classic `<script>` from `index.html`, so all top-level functions and variables share one global scope.
- **Hosting:** GitHub Pages from `main`, with a custom domain via `CNAME`. **Anything merged to `main` is live.**
- **Backend:** Supabase (project ref `saaiukdzwllatqtdqqhf`). It provides auth (magic link plus an 8-digit OTP fallback), Postgres with RLS, and Edge Functions in Deno/TypeScript.
- **AI:** Edge Functions call the Anthropic API. `ANTHROPIC_API_KEY` is a Supabase secret and never goes in client code.
- **Email:** custom SMTP via Resend from the verified domain myclubhouse.org.
- **PWA:** `manifest.json` and `sw.js`.

## File map

| File | What lives there |
|---|---|
| `index.html` | App shell: auth and onboarding screens, sport filter rail, `#match-list`, `#match-form`, bottom tab bar. Script load order matters: supabase-js, then auth, football, golf, gym, teams, script. |
| `script.js` | Supabase client, service worker registration, loading and flattening matches, feed rendering (`renderMatch`, `renderList`, `renderView`), `openScreen()`/`closeScreen()`/`closeEntryScreen()`, the generic form builder, the profile screen, edit/delete, `init()`. |
| `auth.js` | `ensureSignedIn`, `loadProfile`, onboarding (sport picker). |
| `football.js` | Personal football match form, plus drafts saved to localStorage. |
| `golf.js` | Golf setup, hole-by-hole entry, scorecard photo upload (`handleScorecardUpload` → `parse-scorecard`), scorecard review, `finishGolfRound`. |
| `gym.js` | Gym session and set entry, `finishGymSession`. |
| `teams.js` | Teams, invites, fixtures, team sheets, ad-hoc players (`ensurePlayersForTeam`), and the three-step result entry flow (`renderResultScoreStep` → `renderResultEventsStep` → `renderResultPublishStep` → `publishResult`). |
| `Clubhouse-tokens.css` | The "Floodlight" design system: CSS custom-property tokens, dark-first, with light-mode tokens present. |
| `style.css` | Small app-specific overrides. |
| `supabase/functions/parse-scorecard` | Reads a golf scorecard photo with the vision model and returns per-hole JSON. |
| `supabase/functions/parse-team-chat` | Text-only sibling. Takes one WhatsApp chat chunk and returns a fixture result as JSON. |
| `supabase/migrations/` | Only the Sept 2026 team/fixture migrations. **This is not the full schema.** |

## Data model (tables the client touches)

`profiles`, `matches` (one row per personal activity), `football_details` / `golf_details` / `gym_details` (one detail row per match), `golf_holes`, `gym_sets`, `courses`, `teams`, `team_members`, `fixtures`, `team_sheets`, `team_sheet_selections`, `players`, `fixture_appearances`.

Most of these were created in the Supabase Dashboard before migrations were used, so the SQL for them isn't in the repo. Don't infer a table's columns or RLS policies from `supabase/migrations/`. Read how the code uses the table, or ask Mihir to run `supabase db pull` so the schema can be committed.

## Conventions

- **Design tokens only.** Use `var(--…)` from `Clubhouse-tokens.css` for colour, spacing, type and radius; never hard-code hex values. Sport accent colour comes from a `data-sport="golf|gym|football|cricket"` attribute on a container. Reuse the existing classes (`.btn`, `.btn--ghost`, `.btn--sm`, `.chip`, `.field`, `.label`, `.rail`, `.wizard`, `.track`) before adding new ones.
- **Theme:** `<html data-theme="dark">` is hard-coded. Light-mode tokens exist but nothing switches to them yet.
- **Full-screen entry flows** go through `openScreen(title)` and `closeEntryScreen()`. Use them for any new wizard so the header and back button behave consistently.
- **Rendering** is template strings written into `innerHTML`, with listeners wired afterwards. Before attaching a listener, check that a re-render can't attach a duplicate. Duplicate listeners from stale code have caused bugs before.
- **One bad row must not break the feed.** Guard optional joins (`(match.sets || []).length`). Per-item render loops should not let one throw kill the rest.
- **Saves that touch two tables** (a `matches` row plus its `*_details` row) need the second insert's failure surfaced to the user, not just `console.error`. Orphaned rows have come from this before.
- **Escape anything user-typed** before it goes into `innerHTML`: player names, opponent names, notes.
- **Comments explain *why*,** as in `sw.js`.

## Supabase rules

- **RLS is on.** Every new table needs policies for every operation the app performs (select, insert, update, delete). Team data is gated by team membership, not by row owner. `matches` inserts require `auth.uid() = user_id`, so a client can only write its own personal rows. Anything that writes for other users needs an Edge Function.
- **Migrations:** new files go in `supabase/migrations/` as `YYYYMMDDHHMMSS_description.sql`, and should be idempotent where practical (`if not exists`). **Claude writes migrations; Mihir reviews and runs `supabase db push` himself.** Don't run it unprompted.
- **Edge Functions:** follow the `parse-scorecard` pattern. That means a CORS preflight, an auth check on the caller's JWT, and extracting JSON from between the first `{` and the last `}` of the model's reply. The model is allowed to reason before the JSON but must end on it; banning reasoning made extraction worse. Deploy with `supabase functions deploy <name>`, and only once Mihir has said so.
- **Never commit secrets.** The publishable key in `script.js` is meant to be public. Service-role keys, the Anthropic key and the Resend key are not.

## Shipping

1. Work on a branch, never directly on `main`.
2. **If any JS or CSS file is added or renamed, bump `CACHE_NAME` in `sw.js`,** and add new files to `CORE_ASSETS` if they should work offline. Stale service-worker caches are a recurring problem.
3. Test locally before merging. Any static server works, for example `python3 -m http.server 8000` from the repo root. Check both the feed and the flow that changed, on a phone-width viewport.
4. Open a PR with a plain-English summary of what changed and how to test it, and list any migration or function deploy that has to happen alongside the merge, in which order.
5. Mihir reviews and merges. Merging deploys the site.

## Working with Mihir

- He reviews diffs rather than writing the code himself, but wants to understand the changes. Explain the reasoning in the PR or summary, briefly.
- Before anything that touches production data or infrastructure (migrations, function deploys, RLS changes), explain what will happen and wait for his go-ahead.
- Commit at logical checkpoints with descriptive messages.
- When a backlog item ships, tick it off in `BACKLOG.md` in the same PR.
- Debugging habits: Supabase Dashboard logs for Edge Functions, and `curl` with a short-lived JWT copied from browser DevTools.
