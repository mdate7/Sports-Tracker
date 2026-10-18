let userTeams = [];
let teamsSubView = "list"; // "list" | "create" | "join"
let currentTeamId = null;

async function loadUserTeams() {
  const userId = await ensureSignedIn();
  if (!userId) return [];
  const { data, error } = await supabaseClient
    .from("team_members")
    .select("team_id, role, teams(id, name, sport, invite_code)")
    .eq("user_id", userId);
  if (error) { console.error("Failed to load teams:", error); return []; }
  return data.map(row => ({ ...row.teams, role: row.role }));
}

function generateInviteCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

async function loadTeamDetail(teamId) {
  const { data: team, error: teamError } = await supabaseClient
    .from("teams")
    .select("*")
    .eq("id", teamId)
    .single();

  const { data: members, error: membersError } = await supabaseClient
    .from("team_members")
    .select("user_id, role, profiles(display_name)")
    .eq("team_id", teamId);

  const { data: fixtures, error: fixturesError } = await supabaseClient
    .from("fixtures")
    .select("*")
    .eq("team_id", teamId)
    .order("date", { ascending: false });

  if (teamError || membersError || fixturesError) {
    console.error("Failed to load team:", teamError || membersError || fixturesError);
    return null;
  }
  return { ...team, members, fixtures: fixtures || [] };
}

// --- Team view helpers -------------------------------------------------------
// Football seasons run August to July, so a game in Sep 2025 and one in
// Mar 2026 are both "2025/26". Keyed by the starting year.
function seasonStartYear(isoDate) {
  const d = new Date(isoDate + "T00:00");
  return d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
}
function seasonLabel(startYear) {
  return `${startYear}/${String(startYear + 1).slice(-2)}`;
}
function formatFixtureDate(isoDate, withYear = false) {
  return new Date(isoDate + "T00:00").toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {})
  });
}
function fixtureIsPlayed(f) {
  return f.goals_for !== null && f.goals_for !== undefined;
}
function fixtureOutcome(f) {
  if (!fixtureIsPlayed(f)) return null;
  if (f.goals_for > f.goals_against) return "W";
  if (f.goals_for < f.goals_against) return "L";
  return "D";
}
function opponentName(f) {
  return f.opponent ? escapeHtml(f.opponent) : `<span style="color:var(--muted);">Unknown opponent</span>`;
}

// Which season the team view is showing; reset when a different team opens.
let teamViewSeason = null;
let teamViewSeasonTeamId = null;
// Season player stats, cached per team+season so switching back is instant.
const seasonStatsCache = new Map();

async function loadSeasonPlayerStats(team, fixtures) {
  const key = `${team.id}:${fixtures.map(f => f.id).join(",")}`;
  if (seasonStatsCache.has(key)) return seasonStatsCache.get(key);

  const ids = fixtures.filter(fixtureIsPlayed).map(f => f.id);
  if (!ids.length) return [];
  const [{ data: players, error: playersError }, { data: apps, error: appsError }] = await Promise.all([
    supabaseClient.from("players").select("id, display_name").eq("team_id", team.id),
    supabaseClient.from("fixture_appearances").select("player_id, goals, assists, is_motm, yellow_cards, red_card").in("fixture_id", ids)
  ]);
  if (playersError || appsError) {
    console.error("Failed to load season stats:", playersError || appsError);
    return null;
  }

  const byPlayer = new Map();
  (apps || []).forEach(a => {
    const row = byPlayer.get(a.player_id) || { apps: 0, goals: 0, assists: 0, motm: 0, cards: 0 };
    row.apps += 1;
    row.goals += a.goals || 0;
    row.assists += a.assists || 0;
    row.motm += a.is_motm ? 1 : 0;
    row.cards += (a.yellow_cards || 0) + (a.red_card ? 1 : 0);
    byPlayer.set(a.player_id, row);
  });
  const names = new Map((players || []).map(p => [p.id, p.display_name]));
  const stats = [...byPlayer.entries()]
    .map(([id, row]) => ({ id, name: names.get(id) || "Unknown player", ...row }))
    .sort((x, y) => y.goals - x.goals || y.assists - x.assists || y.apps - x.apps || x.name.localeCompare(y.name));
  seasonStatsCache.set(key, stats);
  return stats;
}

async function renderTeamDetail() {
  const team = await loadTeamDetail(currentTeamId);
  if (!team) return;
  // Results may have just been edited, so start every visit with fresh stats;
  // the cache only exists to make flicking between seasons instant.
  seasonStatsCache.clear();
  // `team` is re-fetched on every render, so the permanent delegated listener
  // for fixture buttons reads it from here rather than from a stale closure.
  currentTeamDetail = team;
  wireTeamFixtureClicks();

  const userId = await ensureSignedIn();
  const today = todayISODate();
  const upcoming = team.fixtures.filter(f => f.date >= today).sort((x, y) => x.date.localeCompare(y.date));
  const past = team.fixtures.filter(f => f.date < today);
  const next = upcoming[0];

  const seasons = [...new Set(past.map(f => seasonStartYear(f.date)))].sort((x, y) => y - x);
  if (teamViewSeasonTeamId !== team.id || !seasons.includes(teamViewSeason)) {
    teamViewSeason = seasons[0] ?? null;
    teamViewSeasonTeamId = team.id;
  }

  const nextHtml = next ? `
    <div class="card team-next" data-sport="${team.sport}">
      <p class="eyebrow">Next match · ${formatFixtureDate(next.date)}</p>
      <p class="team-next__opp">${opponentName(next)}</p>
      <p class="label" style="margin-top:6px;">${next.is_home ? "Home" : "Away"}${next.venue ? ` · ${escapeHtml(next.venue)}` : ""}${next.kit ? ` · ${escapeHtml(next.kit)} kit` : ""}</p>
      <div style="display:flex;gap:8px;margin-top:14px;">
        <button type="button" class="btn btn--sm" data-team-sheet-fixture="${next.id}" style="flex:1;">Team sheet</button>
        <button type="button" class="btn btn--ghost btn--sm" data-add-result-fixture="${next.id}" style="flex:1;">Add result</button>
      </div>
    </div>
  ` : `
    <div class="card"><p class="empty-state" style="padding:8px;">No upcoming fixtures.</p></div>
  `;

  const laterHtml = upcoming.slice(1).map(f => `
    <div class="fixture-row">
      <div class="fixture-row__main">
        <p class="fixture-row__opp">${opponentName(f)} <span class="label">${f.is_home ? "H" : "A"}</span></p>
        <p class="label">${formatFixtureDate(f.date)}</p>
      </div>
      <button type="button" class="btn btn--ghost btn--sm" data-team-sheet-fixture="${f.id}">Team sheet</button>
    </div>
  `).join("");

  matchList.innerHTML = `
    <div class="team-head" data-sport="${team.sport}">
      <p class="eyebrow">${sportNames[team.sport]}</p>
      <h2 class="title" style="margin:4px 0 0;">${escapeHtml(team.name)}</h2>
    </div>

    ${nextHtml}
    ${laterHtml ? `<div class="card" style="padding-top:4px;padding-bottom:4px;">${laterHtml}</div>` : ""}
    <button type="button" id="add-fixture-btn" class="btn btn--ghost btn--sm">+ Add fixture</button>

    ${seasons.length ? `
      <p class="label section-label">Seasons</p>
      <div class="rail" id="season-rail" style="padding-bottom:0;">
        ${seasons.map(y => `<button type="button" class="chip" data-season="${y}" aria-pressed="${y === teamViewSeason}">${seasonLabel(y)}</button>`).join("")}
      </div>
      <div id="season-body"></div>
    ` : ""}

    <details class="card team-members">
      <summary class="label">Members (${team.members.length}) · Invite code <span class="num" style="color:var(--text);">${escapeHtml(team.invite_code)}</span></summary>
      ${team.members.map(m => `
        <div class="fixture-row">
          <span>${escapeHtml(m.profiles?.display_name || "Unnamed player")}</span>
          <span class="label">${escapeHtml(m.role)}</span>
        </div>
      `).join("")}
    </details>

    <button type="button" id="team-back-btn" class="btn btn--ghost" style="margin-top:4px;">Back to teams</button>
    <button type="button" id="team-leave-btn" class="btn btn--ghost" style="margin-top:10px;">Leave team</button>
  `;

  if (seasons.length) {
    renderSeasonBody(team, past);
    document.getElementById("season-rail").addEventListener("click", (event) => {
      const chip = event.target.closest("[data-season]");
      if (!chip) return;
      teamViewSeason = Number(chip.dataset.season);
      document.querySelectorAll("#season-rail .chip").forEach(c => c.setAttribute("aria-pressed", c === chip ? "true" : "false"));
      renderSeasonBody(team, past);
    });
  }

  document.getElementById("team-back-btn").addEventListener("click", () => {
    currentTeamId = null;
    renderTeamsScreen();
  });

  document.getElementById("team-leave-btn").addEventListener("click", async () => {
    const confirmed = confirm(`Leave ${team.name}?`);
    if (!confirmed) return;

    const { error } = await supabaseClient
      .from("team_members")
      .delete()
      .eq("team_id", team.id)
      .eq("user_id", userId);

    if (error) {
      console.error("Failed to leave team:", error);
      return;
    }
    currentTeamId = null;
    userTeams = await loadUserTeams();
    renderTeamsScreen();
  });

  document.getElementById("add-fixture-btn").addEventListener("click", () => {
    renderAddFixtureForm(team);
  });

}

// The season part of the team view: summary, form, results and player stats.
// Re-rendered on its own when the season chip changes, without re-fetching the team.
async function renderSeasonBody(team, past) {
  const body = document.getElementById("season-body");
  if (!body) return;
  const season = teamViewSeason;
  const fixtures = past.filter(f => seasonStartYear(f.date) === season); // newest first
  const played = fixtures.filter(fixtureIsPlayed);
  const w = played.filter(f => fixtureOutcome(f) === "W").length;
  const d = played.filter(f => fixtureOutcome(f) === "D").length;
  const l = played.filter(f => fixtureOutcome(f) === "L").length;
  const gf = played.reduce((sum, f) => sum + f.goals_for, 0);
  const ga = played.reduce((sum, f) => sum + f.goals_against, 0);
  const form = played.slice(0, 5).reverse(); // oldest → newest, reading left to right

  const resultRows = fixtures.map(f => {
    const outcome = fixtureOutcome(f);
    return `
      <button type="button" class="fixture-row fixture-row--result" data-add-result-fixture="${f.id}">
        <span class="form-pip" data-outcome="${outcome || "none"}">${outcome || "–"}</span>
        <span class="fixture-row__main">
          <span class="fixture-row__opp">${opponentName(f)} <span class="label">${f.is_home ? "H" : "A"}</span></span>
          <span class="label">${formatFixtureDate(f.date, true)}</span>
        </span>
        <span class="fixture-row__score num">${outcome ? `${f.goals_for}–${f.goals_against}` : `<span class="label">Add result</span>`}</span>
      </button>
    `;
  }).join("");

  body.innerHTML = `
    <div class="card" data-sport="${team.sport}">
      <div class="card-head">
        <p class="label">${seasonLabel(season)} season</p>
        <div class="form-strip" aria-label="Last ${form.length} results">
          ${form.map(f => `<span class="form-pip" data-outcome="${fixtureOutcome(f)}">${fixtureOutcome(f)}</span>`).join("")}
        </div>
      </div>
      <div class="stats">
        <div><span class="stat-value num">${played.length}</span><p class="label">Played</p></div>
        <div><span class="stat-value num">${w}–${d}–${l}</span><p class="label">W–D–L</p></div>
        <div><span class="stat-value num">${gf}–${ga}</span><p class="label">Goals</p></div>
        <div><span class="delta num ${gf - ga < 0 ? "delta--neg" : ""}">${gf - ga > 0 ? "+" : ""}${gf - ga}</span><p class="label">GD</p></div>
      </div>
    </div>

    <p class="label section-label">Results</p>
    <div class="card" style="padding-top:4px;padding-bottom:4px;">${resultRows}</div>

    <p class="label section-label">Players</p>
    <div class="card" id="season-stats"><p class="label">Loading…</p></div>
  `;

  const stats = await loadSeasonPlayerStats(team, fixtures);
  // The person may have switched season while this was loading.
  if (season !== teamViewSeason) return;
  const statsEl = document.getElementById("season-stats");
  if (!statsEl) return;
  if (stats === null) {
    statsEl.innerHTML = `<p class="empty-state" style="padding:8px;">Couldn't load player stats.</p>`;
    return;
  }
  if (!stats.length) {
    statsEl.innerHTML = `<p class="empty-state" style="padding:8px;">No appearances recorded this season.</p>`;
    return;
  }
  statsEl.innerHTML = `
    <table class="season-table">
      <thead><tr><th>Player</th><th>Apps</th><th>G</th><th>A</th><th>MOTM</th></tr></thead>
      <tbody>
        ${stats.map(p => `
          <tr>
            <td>${escapeHtml(p.name)}</td>
            <td class="num">${p.apps}</td>
            <td class="num">${p.goals || ""}</td>
            <td class="num">${p.assists || ""}</td>
            <td class="num">${p.motm || ""}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

// One delegated listener for every fixture-row button, attached exactly once.
//
// This used to be two separate listeners with { once: true }, which quietly
// broke each other: `once` removes a listener after the first event it
// RECEIVES, not the first time its body does any work — so clicking "Team
// sheet" also removed the "Add result" listener (it fired, matched nothing,
// returned, and was discarded anyway). Delegating from a single permanent
// listener avoids both that and the duplicate-listener stacking that { once }
// was presumably there to prevent.
let currentTeamDetail = null;
let teamFixtureClicksWired = false;

function wireTeamFixtureClicks() {
  if (teamFixtureClicksWired) return;
  teamFixtureClicksWired = true;

  matchList.addEventListener("click", async (event) => {
    const team = currentTeamDetail;
    if (!team) return;

    const sheetBtn = event.target.closest("[data-team-sheet-fixture]");
    if (sheetBtn) {
      const fixture = team.fixtures.find(f => f.id === sheetBtn.dataset.teamSheetFixture);
      if (fixture) await renderTeamSheetScreen(fixture, team);
      return;
    }

    const resultBtn = event.target.closest("[data-add-result-fixture]");
    if (resultBtn) {
      const fixture = team.fixtures.find(f => f.id === resultBtn.dataset.addResultFixture);
      if (fixture) await renderAddResultScreen(fixture, team);
    }
  });
}

function renderAddFixtureForm(team) {
  matchList.innerHTML = `
    <div class="card" data-sport="${team.sport}">
      <div class="field">
        <label class="label" for="fixture-opponent">Opponent</label>
        <input type="text" id="fixture-opponent">
      </div>
      <div class="field">
        <label class="label" for="fixture-date">Date</label>
        <input type="date" id="fixture-date" value="${todayISODate()}">
      </div>
      <p class="label" style="margin-top:12px;">Venue</p>
      <div class="chips" id="fixture-venue-chips">
        <button type="button" class="chip" data-venue="home" aria-pressed="true">Home</button>
        <button type="button" class="chip" data-venue="away" aria-pressed="false">Away</button>
      </div>
      <div class="field" style="margin-top:12px;">
        <label class="label" for="fixture-competition">Competition (optional)</label>
        <input type="text" id="fixture-competition">
      </div>
      <button type="button" id="fixture-save-btn" class="btn" style="margin-top:16px;">Save fixture</button>
      <button type="button" id="fixture-cancel-btn" class="btn btn--ghost" style="margin-top:10px;">Cancel</button>
      <p id="fixture-status" class="tiny" style="color:var(--muted);margin-top:10px;"></p>
    </div>
  `;

  document.getElementById("fixture-cancel-btn").addEventListener("click", () => renderTeamDetail());

  document.getElementById("fixture-venue-chips").addEventListener("click", (event) => {
    const chip = event.target.closest(".chip");
    if (!chip) return;
    document.querySelectorAll("#fixture-venue-chips .chip").forEach(c => c.setAttribute("aria-pressed", "false"));
    chip.setAttribute("aria-pressed", "true");
  });

  document.getElementById("fixture-save-btn").addEventListener("click", async () => {
    const opponent = document.getElementById("fixture-opponent").value.trim();
    const date = document.getElementById("fixture-date").value;
    const isHome = document.querySelector('#fixture-venue-chips .chip[aria-pressed="true"]').dataset.venue === "home";
    const competition = document.getElementById("fixture-competition").value.trim() || null;
    const statusEl = document.getElementById("fixture-status");

    if (!opponent || !date) {
      statusEl.textContent = "Opponent and date are required.";
      return;
    }

    const userId = await ensureSignedIn();
    if (!userId) return;

    const { error } = await supabaseClient
      .from("fixtures")
      .insert({ team_id: team.id, opponent, date, is_home: isHome, competition, created_by: userId });

    if (error) {
      console.error("Failed to save fixture:", error);
      statusEl.textContent = "Something went wrong — try again.";
      return;
    }

    renderTeamDetail();
  });
}

function renderTeamsScreen() {
  if (teamsSubView === "create") return renderCreateTeamForm();
  if (teamsSubView === "join") return renderJoinTeamForm();

const teamsHtml = userTeams.map(t => `
  <div class="card" style="margin-bottom:10px;cursor:pointer;" data-sport="${t.sport}" data-team-id="${t.id}">
    <p class="stat-value">${escapeHtml(t.name)}</p>
    <p class="label" style="margin-top:4px;">${sportNames[t.sport]} · Invite code: ${t.invite_code}</p>
  </div>
`).join("");

matchList.innerHTML = `
  <div id="teams-list">
    ${teamsHtml || `<p class="empty-state">No teams yet.</p>`}
  </div>
  <button type="button" id="create-team-btn" class="btn" style="margin-top:8px;">Create a team</button>
  <button type="button" id="join-team-btn" class="btn btn--ghost" style="margin-top:10px;">Join a team</button>
`;

  document.getElementById("teams-list").addEventListener("click", async (event) => {
  const card = event.target.closest("[data-team-id]");
  if (!card) return;
  currentTeamId = card.dataset.teamId;
  await renderTeamDetail();
    });
  document.getElementById("create-team-btn").addEventListener("click", () => {
    teamsSubView = "create";
    renderTeamsScreen();
  });
  document.getElementById("join-team-btn").addEventListener("click", () => {
    teamsSubView = "join";
    renderTeamsScreen();
  });
}

function renderCreateTeamForm() {
  matchList.innerHTML = `
    <div class="card">
      <div class="field">
        <label class="label" for="team-name">Team name</label>
        <input type="text" id="team-name">
      </div>
      <p class="label" style="margin-top:12px;">Sport</p>
      <div class="chips" id="team-sport-chips">
        <button type="button" class="chip" data-sport-option="football" data-sport="football" aria-pressed="false">⚽ Football</button>
        <button type="button" class="chip" data-sport-option="cricket" data-sport="cricket" aria-pressed="false">🏏 Cricket</button>
        <button type="button" class="chip" data-sport-option="golf" data-sport="golf" aria-pressed="false">⛳ Golf</button>
      </div>
      <button type="button" id="team-create-save-btn" class="btn" style="margin-top:16px;">Create</button>
      <button type="button" id="team-cancel-btn" class="btn btn--ghost" style="margin-top:10px;">Cancel</button>
      <p id="team-status" class="tiny" style="color:var(--muted);margin-top:10px;"></p>
    </div>
  `;

  document.getElementById("team-cancel-btn").addEventListener("click", () => {
    teamsSubView = "list";
    renderTeamsScreen();
  });

  document.getElementById("team-sport-chips").addEventListener("click", (event) => {
    const chip = event.target.closest(".chip");
    if (!chip) return;
    document.querySelectorAll("#team-sport-chips .chip").forEach(c => c.setAttribute("aria-pressed", "false"));
    chip.setAttribute("aria-pressed", "true");
  });

  document.getElementById("team-create-save-btn").addEventListener("click", async () => {
    const name = document.getElementById("team-name").value.trim();
    const sportChip = document.querySelector('#team-sport-chips .chip[aria-pressed="true"]');
    const statusEl = document.getElementById("team-status");

    if (!name) {
      statusEl.textContent = "Enter a team name first.";
      return;
    }
    if (!sportChip) {
      statusEl.textContent = "Pick a sport first.";
      return;
    }

    const userId = await ensureSignedIn();
    if (!userId) return;

    const { data: team, error: teamError } = await supabaseClient
      .from("teams")
      .insert({ name, sport: sportChip.dataset.sportOption, invite_code: generateInviteCode(), created_by: userId })
      .select()
      .single();

    if (teamError) {
      console.error("Failed to create team:", teamError);
      statusEl.textContent = "Something went wrong — try again.";
      return;
    }

    const { error: memberError } = await supabaseClient
      .from("team_members")
      .insert({ team_id: team.id, user_id: userId, role: "owner" });
    if (memberError) console.error("Failed to add you as owner:", memberError);

    userTeams = await loadUserTeams();
    teamsSubView = "list";
    renderTeamsScreen();
  });
}

function renderJoinTeamForm() {
  matchList.innerHTML = `
    <div class="card">
      <div class="field">
        <label class="label" for="join-code">Invite code</label>
        <input type="text" id="join-code" style="text-transform:uppercase;">
      </div>
      <button type="button" id="team-join-save-btn" class="btn" style="margin-top:12px;">Join</button>
      <button type="button" id="team-join-cancel-btn" class="btn btn--ghost" style="margin-top:10px;">Cancel</button>
      <p id="join-status" class="tiny" style="color:var(--muted);margin-top:10px;"></p>
    </div>
  `;

  document.getElementById("team-join-cancel-btn").addEventListener("click", () => {
    teamsSubView = "list";
    renderTeamsScreen();
  });

  document.getElementById("team-join-save-btn").addEventListener("click", async () => {
    const code = document.getElementById("join-code").value.trim().toUpperCase();
    const statusEl = document.getElementById("join-status");
    if (!code) {
      statusEl.textContent = "Enter an invite code first.";
      return;
    }

    const userId = await ensureSignedIn();
    if (!userId) return;

    const { data: team, error: findError } = await supabaseClient
      .from("teams")
      .select("id, name")
      .eq("invite_code", code)
      .maybeSingle();

    if (findError || !team) {
      statusEl.textContent = "Couldn't find a team with that code.";
      return;
    }

    const { error: joinError } = await supabaseClient
      .from("team_members")
      .insert({ team_id: team.id, user_id: userId, role: "member" });

    if (joinError) {
      console.error("Failed to join team:", joinError);
      statusEl.textContent = joinError.code === "23505" ? "You're already in this team." : "Something went wrong — try again.";
      return;
    }

    userTeams = await loadUserTeams();
    teamsSubView = "list";
    renderTeamsScreen();
  });
}

async function loadOrCreateTeamSheet(fixtureId) {
  const { data: existing } = await supabaseClient
    .from("team_sheets")
    .select("*")
    .eq("fixture_id", fixtureId)
    .maybeSingle();

  if (existing) return existing;

  const userId = await ensureSignedIn();
  const { data: created, error } = await supabaseClient
    .from("team_sheets")
    .insert({ fixture_id: fixtureId, created_by: userId })
    .select()
    .single();

  if (error) { console.error("Failed to create team sheet:", error); return null; }
  return created;
}

async function renderTeamSheetScreen(fixture, team) {
  const sheet = await loadOrCreateTeamSheet(fixture.id);
  if (!sheet) return;

  const [players, { data: selections }] = await Promise.all([
    ensurePlayersForTeam(team.id, team.members),
    supabaseClient.from("team_sheet_selections").select("*").eq("team_sheet_id", sheet.id)
  ]);

  const selectionByUser = new Map();
  const selectionByPlayer = new Map();
  (selections || []).forEach(s => {
    if (s.user_id) selectionByUser.set(s.user_id, s.is_in);
    if (s.player_id) selectionByPlayer.set(s.player_id, s.is_in);
  });

  const squad = players.map(p => ({
    playerId: p.id,
    userId: p.user_id,
    name: p.display_name,
    isIn: p.user_id ? !!selectionByUser.get(p.user_id) : !!selectionByPlayer.get(p.id)
  }));

  function squadRowHtml(p) {
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--line);">
        <span>${escapeHtml(p.name)}</span>
        <button type="button" class="chip" data-player-id="${p.playerId}" aria-pressed="${p.isIn}">
          ${p.isIn ? "In" : "Out"}
        </button>
      </div>
    `;
  }

  function wireToggle(btn) {
    btn.addEventListener("click", () => {
      const isIn = btn.getAttribute("aria-pressed") === "true";
      btn.setAttribute("aria-pressed", isIn ? "false" : "true");
      btn.textContent = isIn ? "Out" : "In";
    });
  }

  matchList.innerHTML = `
    <div class="card" data-sport="${team.sport}">
      <p class="stat-value">${escapeHtml(fixture.opponent)} (${fixture.is_home ? "H" : "A"})</p>
      <p class="label" style="margin-top:4px;">${fixture.date} · ${sheet.status === "published" ? "Published" : "Draft"}</p>
    </div>

    <p class="label" style="margin-top:16px;">Squad</p>
    <div class="card" id="sheet-squad-list">${squad.map(squadRowHtml).join("")}</div>

    <div class="field" style="display:flex;gap:8px;margin-top:12px;">
      <input type="text" id="sheet-add-player-input" placeholder="Add a player not on the team">
      <button type="button" id="sheet-add-player-btn" class="btn btn--ghost btn--sm">Add</button>
    </div>

    <button type="button" id="sheet-save-draft-btn" class="btn btn--ghost" style="margin-top:16px;">Save draft</button>
    <button type="button" id="sheet-publish-btn" class="btn" style="margin-top:10px;">Publish</button>
    <button type="button" id="sheet-back-btn" class="btn btn--ghost" style="margin-top:10px;">Back</button>
    <p id="sheet-status" class="tiny" style="color:var(--muted);margin-top:10px;"></p>
  `;

  document.querySelectorAll("[data-player-id]").forEach(wireToggle);

  document.getElementById("sheet-add-player-btn").addEventListener("click", async () => {
    const input = document.getElementById("sheet-add-player-input");
    const name = input.value.trim();
    if (!name) return;

    const { data: newPlayer, error } = await supabaseClient
      .from("players")
      .insert({ team_id: team.id, display_name: name })
      .select()
      .single();
    if (error) { console.error("Failed to add player:", error); return; }

    squad.push({ playerId: newPlayer.id, userId: null, name: newPlayer.display_name, isIn: true });
    document.getElementById("sheet-squad-list").insertAdjacentHTML("beforeend", squadRowHtml(squad[squad.length - 1]));
    wireToggle(document.querySelector(`[data-player-id="${newPlayer.id}"]`));
    input.value = "";
  });

  document.getElementById("sheet-back-btn").addEventListener("click", () => renderTeamDetail());

  async function saveSelections(newStatus) {
    const statusEl = document.getElementById("sheet-status");

    const memberRows = [];
    const adHocRows = [];
    squad.forEach(p => {
      const isIn = document.querySelector(`[data-player-id="${p.playerId}"]`).getAttribute("aria-pressed") === "true";
      if (p.userId) {
        memberRows.push({ team_sheet_id: sheet.id, user_id: p.userId, is_in: isIn });
      } else {
        adHocRows.push({ team_sheet_id: sheet.id, player_id: p.playerId, is_in: isIn });
      }
    });

    if (memberRows.length) {
      const { error } = await supabaseClient
        .from("team_sheet_selections")
        .upsert(memberRows, { onConflict: "team_sheet_id,user_id" });
      if (error) { console.error("Failed to save member selections:", error); statusEl.textContent = "Something went wrong."; return; }
    }
    if (adHocRows.length) {
      const { error } = await supabaseClient
        .from("team_sheet_selections")
        .upsert(adHocRows, { onConflict: "team_sheet_id,player_id" });
      if (error) { console.error("Failed to save ad-hoc selections:", error); statusEl.textContent = "Something went wrong."; return; }
    }

    const { error: statusError } = await supabaseClient
      .from("team_sheets")
      .update({ status: newStatus })
      .eq("id", sheet.id);
    if (statusError) console.error("Failed to update sheet status:", statusError);

    statusEl.textContent = newStatus === "published" ? "Published." : "Draft saved.";
  }

  document.getElementById("sheet-save-draft-btn").addEventListener("click", () => saveSelections("draft"));
  document.getElementById("sheet-publish-btn").addEventListener("click", () => saveSelections("published"));
}

// ── Result entry: score → goals/cards → MOTM/DOTD votes → publish ──────
//
// Every credited player needs a row in `players` (fixture_appearances
// references players, not team_members/auth.users directly, so the same
// table also works for backfilled people who never signed up). This lazily
// creates a players row for any current team member who doesn't have one
// yet, rather than requiring a one-off migration of existing members.
async function ensurePlayersForTeam(teamId, members) {
  const { data: existing, error: existingError } = await supabaseClient
    .from("players")
    .select("id, user_id, display_name")
    .eq("team_id", teamId);
  if (existingError) { console.error("Failed to load players:", existingError); return []; }

  const byUserId = new Map((existing || []).filter(p => p.user_id).map(p => [p.user_id, p]));
  const toInsert = members
    .filter(m => !byUserId.has(m.user_id))
    .map(m => ({ team_id: teamId, user_id: m.user_id, display_name: m.profiles?.display_name || "Unnamed player" }));

  if (toInsert.length) {
    const { data: inserted, error: insertError } = await supabaseClient
      .from("players")
      .insert(toInsert)
      .select();
    if (insertError) {
      console.error("Failed to create player rows for members:", insertError);
    } else {
      inserted.forEach(p => byUserId.set(p.user_id, p));
    }
  }

  return [...(existing || []).filter(p => !p.user_id), ...byUserId.values()];
}

let resultDraft = null;
// { fixture, team, goalsFor, goalsAgainst, resultTag, venue, kit,
//   squad: [{ playerId, userId, name, inSquad, goals, assists, yellowCards, redCard, motmVotes, dotdVotes }],
//   motmPlayerId, dotdPlayerId, addToMyRecord }

async function renderAddResultScreen(fixture, team) {
  const [sheet, players, { data: existingAppearances, error: appearancesError }] = await Promise.all([
    loadOrCreateTeamSheet(fixture.id),
    ensurePlayersForTeam(team.id, team.members),
    supabaseClient.from("fixture_appearances").select("*").eq("fixture_id", fixture.id)
  ]);
  if (appearancesError) console.error("Failed to load existing appearances:", appearancesError);

  let selectionMap = {};
  if (sheet) {
    const { data: selections } = await supabaseClient
      .from("team_sheet_selections")
      .select("*")
      .eq("team_sheet_id", sheet.id);
    (selections || []).forEach(s => {
      const player = s.player_id
        ? players.find(p => p.id === s.player_id)
        : players.find(p => p.user_id === s.user_id);
      if (player) selectionMap[player.id] = s.is_in;
    });
  }

  // Re-opening a fixture that already has saved appearances (i.e. "Edit
  // result") should restore exactly what was published last time, not start
  // the wizard from a blank slate — so any existing row per player wins over
  // the team-sheet in/out guess, and its stats/votes seed the squad.
  const appearanceByPlayer = new Map((existingAppearances || []).map(a => [a.player_id, a]));

  const squad = players.map(p => {
    const existing = appearanceByPlayer.get(p.id);
    return {
      playerId: p.id,
      userId: p.user_id,
      name: p.display_name,
      inSquad: existing ? true : !!selectionMap[p.id],
      goals: existing?.goals ?? 0,
      assists: existing?.assists ?? 0,
      yellowCards: existing?.yellow_cards ?? 0,
      redCard: existing?.red_card ?? false,
      motmVotes: existing?.motm_votes ?? 0,
      dotdVotes: existing?.dotd_votes ?? 0
    };
  });

  const motmPlayerId = (existingAppearances || []).find(a => a.is_motm)?.player_id ?? null;
  const dotdPlayerId = (existingAppearances || []).find(a => a.is_dotd)?.player_id ?? null;

  resultDraft = {
    fixture, team, squad,
    goalsFor: fixture.goals_for ?? 0,
    goalsAgainst: fixture.goals_against ?? 0,
    resultTag: null,
    venue: fixture.venue || "",
    kit: fixture.kit || "",
    motmPlayerId,
    dotdPlayerId,
    addToMyRecord: true
  };

  renderResultScoreStep();
}

function resultTagFromScore() {
  const { goalsFor, goalsAgainst } = resultDraft;
  if (goalsFor > goalsAgainst) return "won";
  if (goalsFor < goalsAgainst) return "lost";
  return "drawn";
}

function renderResultScoreStep() {
  const { fixture, team, squad } = resultDraft;
  const tag = resultDraft.resultTag || resultTagFromScore();

  const squadChips = squad.map(p => `
    <button type="button" class="chip" data-squad-player="${p.playerId}" aria-pressed="${p.inSquad}">${escapeHtml(p.name)}</button>
  `).join("");

  matchList.innerHTML = `
    <button type="button" id="result-back-btn" class="btn btn--ghost btn--sm" style="margin-bottom:12px;">← Back</button>
    <div class="card" data-sport="${team.sport}">
      <p class="label">${fixture.date} · ${fixture.is_home ? "Home" : "Away"}${fixture.competition ? " · " + fixture.competition : ""}</p>
      <p class="stat-value" style="margin-top:6px;">vs ${escapeHtml(fixture.opponent)}</p>
    </div>

    <p class="label" style="margin-top:16px;">Full time</p>
    <div class="card" style="display:flex;gap:16px;">
      <div style="flex:1;text-align:center;">
        <p class="label">${escapeHtml(team.name)}</p>
        <div class="stepper stepper--lg" style="justify-content:center;margin-top:8px;">
          <button type="button" id="gf-minus">−</button>
          <output id="gf-output">${resultDraft.goalsFor}</output>
          <button type="button" class="plus" id="gf-plus">+</button>
        </div>
      </div>
      <div style="flex:1;text-align:center;">
        <p class="label">${escapeHtml(fixture.opponent)}</p>
        <div class="stepper stepper--lg" style="justify-content:center;margin-top:8px;">
          <button type="button" id="ga-minus">−</button>
          <output id="ga-output">${resultDraft.goalsAgainst}</output>
          <button type="button" class="plus" id="ga-plus">+</button>
        </div>
      </div>
    </div>
    <div class="chips" id="result-tag-chips" style="margin-top:10px;justify-content:center;">
      <button type="button" class="chip" data-tag="won" aria-pressed="${tag === "won"}">Won</button>
      <button type="button" class="chip" data-tag="drawn" aria-pressed="${tag === "drawn"}">Drawn</button>
      <button type="button" class="chip" data-tag="lost" aria-pressed="${tag === "lost"}">Lost</button>
      <button type="button" class="chip" data-tag="abandoned" aria-pressed="${tag === "abandoned"}">Abandoned</button>
    </div>

    <div class="field" style="margin-top:16px;">
      <label class="label" for="result-venue">Venue (optional)</label>
      <input type="text" id="result-venue" value="${escapeHtml(resultDraft.venue)}">
    </div>
    <div class="field">
      <label class="label" for="result-kit">Kit (optional)</label>
      <input type="text" id="result-kit" value="${escapeHtml(resultDraft.kit)}">
    </div>

    <p class="label" id="result-squad-count-label" style="margin-top:16px;">Who played? (${squad.filter(p => p.inSquad).length})</p>
    <div class="chips" id="result-squad-chips">${squadChips}</div>
    <div class="field" style="display:flex;gap:8px;margin-top:8px;">
  <input type="text" id="result-add-player-input" placeholder="Add a player not on the team">
  <button type="button" id="result-add-player-btn" class="btn btn--ghost btn--sm">Add</button>
</div>

    <button type="button" id="result-next-btn" class="btn" style="margin-top:20px;">Next — goals & cards</button>
    <button type="button" id="result-save-score-btn" class="btn btn--ghost" style="margin-top:10px;">Save just the score</button>
  `;

  document.getElementById("result-back-btn").addEventListener("click", () => { resultDraft = null; renderTeamDetail(); });

  let autoTag = true;
  function syncTag(newTag) {
    resultDraft.resultTag = newTag;
    document.querySelectorAll("#result-tag-chips .chip").forEach(c => c.setAttribute("aria-pressed", c.dataset.tag === newTag ? "true" : "false"));
  }

  document.getElementById("gf-minus").addEventListener("click", () => { resultDraft.goalsFor = Math.max(0, resultDraft.goalsFor - 1); document.getElementById("gf-output").textContent = resultDraft.goalsFor; if (autoTag) syncTag(resultTagFromScore()); });
  document.getElementById("gf-plus").addEventListener("click", () => { resultDraft.goalsFor += 1; document.getElementById("gf-output").textContent = resultDraft.goalsFor; if (autoTag) syncTag(resultTagFromScore()); });
  document.getElementById("ga-minus").addEventListener("click", () => { resultDraft.goalsAgainst = Math.max(0, resultDraft.goalsAgainst - 1); document.getElementById("ga-output").textContent = resultDraft.goalsAgainst; if (autoTag) syncTag(resultTagFromScore()); });
  document.getElementById("ga-plus").addEventListener("click", () => { resultDraft.goalsAgainst += 1; document.getElementById("ga-output").textContent = resultDraft.goalsAgainst; if (autoTag) syncTag(resultTagFromScore()); });

  document.getElementById("result-tag-chips").addEventListener("click", (event) => {
    const chip = event.target.closest(".chip");
    if (!chip) return;
    autoTag = false;
    syncTag(chip.dataset.tag);
  });

  document.getElementById("result-squad-chips").addEventListener("click", (event) => {
    const chip = event.target.closest(".chip");
    if (!chip) return;
    const player = squad.find(p => p.playerId === chip.dataset.squadPlayer);
    player.inSquad = !player.inSquad;
    chip.setAttribute("aria-pressed", player.inSquad ? "true" : "false");
    document.getElementById("result-squad-count-label").textContent = `Who played? (${squad.filter(p => p.inSquad).length})`;
  });

  document.getElementById("result-add-player-btn").addEventListener("click", async () => {
  const input = document.getElementById("result-add-player-input");
  const name = input.value.trim();
  if (!name) return;

  const { data: newPlayer, error } = await supabaseClient
    .from("players")
    .insert({ team_id: team.id, display_name: name })
    .select()
    .single();
  if (error) { console.error("Failed to add player:", error); return; }

  const entry = { playerId: newPlayer.id, userId: null, name: newPlayer.display_name, inSquad: true, goals: 0, assists: 0, yellowCards: 0, redCard: false, motmVotes: 0, dotdVotes: 0 };
  squad.push(entry);

  document.getElementById("result-squad-chips").insertAdjacentHTML("beforeend",
    `<button type="button" class="chip" data-squad-player="${entry.playerId}" aria-pressed="true">${escapeHtml(entry.name)}</button>`);
  document.getElementById("result-squad-count-label").textContent = `Who played? (${squad.filter(p => p.inSquad).length})`;
  input.value = "";
});

  document.getElementById("result-next-btn").addEventListener("click", () => {
    resultDraft.venue = document.getElementById("result-venue").value.trim() || null;
    resultDraft.kit = document.getElementById("result-kit").value.trim() || null;
    if (!resultDraft.resultTag) resultDraft.resultTag = resultTagFromScore();
    renderResultEventsStep();
  });

  document.getElementById("result-save-score-btn").addEventListener("click", async () => {
    resultDraft.venue = document.getElementById("result-venue").value.trim() || null;
    resultDraft.kit = document.getElementById("result-kit").value.trim() || null;
    if (!resultDraft.resultTag) resultDraft.resultTag = resultTagFromScore();
    await publishResult();
  });
}

// Goals are entered in order (Goal 1 → scorer, assister) rather than as
// per-player counters against the whole squad. Only per-player totals are
// stored, so on "Edit result" the list is rebuilt from those totals: every
// count survives, but which assist went with which goal may not.
function buildGoalListFromSquad() {
  const scorers = [];
  const assisters = [];
  resultDraft.squad.filter(p => p.inSquad).forEach(p => {
    for (let i = 0; i < (p.goals || 0); i++) scorers.push(p.playerId);
    for (let i = 0; i < (p.assists || 0); i++) assisters.push(p.playerId);
  });
  const goals = scorers.map(id => ({ scorerId: id, assistId: "" }));
  assisters.forEach(id => {
    const slot = goals.find(g => !g.assistId && g.scorerId !== id);
    if (slot) slot.assistId = id;
  });
  return goals;
}

// Keep the per-player counts the rest of the flow (and the database) uses in
// step with the goal list.
function applyGoalListToSquad() {
  resultDraft.squad.forEach(p => {
    p.goals = resultDraft.goalList.filter(g => g.scorerId === p.playerId).length;
    p.assists = resultDraft.goalList.filter(g => g.assistId === p.playerId).length;
  });
}

function renderResultEventsStep() {
  const squadIn = resultDraft.squad.filter(p => p.inSquad);
  const squadIds = new Set(squadIn.map(p => p.playerId));

  if (!resultDraft.goalList) resultDraft.goalList = buildGoalListFromSquad();
  // Match the list to the full-time score, and drop anyone taken out of the squad.
  const list = resultDraft.goalList
    .map(g => ({
      scorerId: g.scorerId === "og" || squadIds.has(g.scorerId) ? g.scorerId : "",
      assistId: squadIds.has(g.assistId) ? g.assistId : ""
    }))
    .slice(0, resultDraft.goalsFor);
  while (list.length < resultDraft.goalsFor) list.push({ scorerId: "", assistId: "" });
  resultDraft.goalList = list;

  const playerOptions = (selectedId, excludeId) => squadIn
    .filter(p => p.playerId !== excludeId)
    .map(p => `<option value="${p.playerId}" ${p.playerId === selectedId ? "selected" : ""}>${escapeHtml(p.name)}</option>`)
    .join("");

  const goalRow = (g, i) => `
    <div class="goal-row" data-goal="${i}">
      <p class="goal-num num">${i + 1}</p>
      <div class="field">
        <label class="label" for="goal-scorer-${i}">Scorer</label>
        <select id="goal-scorer-${i}" data-goal-scorer="${i}">
          <option value="">Not sure</option>
          ${playerOptions(g.scorerId)}
          <option value="og" ${g.scorerId === "og" ? "selected" : ""}>Own goal (theirs)</option>
        </select>
      </div>
      <div class="field">
        <label class="label" for="goal-assist-${i}">Assist</label>
        <select id="goal-assist-${i}" data-goal-assist="${i}" ${g.scorerId === "og" ? "disabled" : ""}>
          <option value="">None</option>
          ${playerOptions(g.assistId, g.scorerId)}
        </select>
      </div>
    </div>
  `;

  const cardRows = squadIn.map(p => `
    <div class="card-row">
      <span>${escapeHtml(p.name)}</span>
      <div class="chips">
        <button type="button" class="chip" data-yellow-toggle="${p.playerId}" aria-pressed="${p.yellowCards > 0}">${p.yellowCards > 0 ? `🟨 ×${p.yellowCards}` : "🟨"}</button>
        <button type="button" class="chip" data-red-toggle="${p.playerId}" aria-pressed="${p.redCard}">🟥</button>
      </div>
    </div>
  `).join("");

  const goalsHtml = resultDraft.goalsFor === 0
    ? `<p class="empty-state" style="padding:16px 8px;">No goals for us. Straight on to cards.</p>`
    : list.map(goalRow).join("");

  matchList.innerHTML = `
    <button type="button" id="events-back-btn" class="btn btn--ghost btn--sm" style="margin-bottom:12px;">← Back</button>
    <div class="card" data-sport="football">
      <div class="card-head">
        <p class="label">Our goals</p>
        <p class="label num" id="events-accounted-label"></p>
      </div>
      ${squadIn.length ? goalsHtml : `<p class="empty-state">No one's marked as playing yet. Go back and pick the squad.</p>`}
    </div>
    <p class="label" style="margin-top:16px;">Cards</p>
    <div class="card">${cardRows || `<p class="empty-state">No squad picked.</p>`}</div>
    <button type="button" id="events-next-btn" class="btn" style="margin-top:16px;">Next — MOTM & DOTD</button>
  `;

  const refreshAccounted = () => {
    const known = list.filter(g => g.scorerId).length;
    const el = document.getElementById("events-accounted-label");
    if (el) el.textContent = resultDraft.goalsFor ? `${known} of ${resultDraft.goalsFor} scorers in` : "";
  };
  refreshAccounted();

  document.getElementById("events-back-btn").addEventListener("click", () => {
    applyGoalListToSquad();
    renderResultScoreStep();
  });

  matchList.querySelectorAll("[data-goal-scorer]").forEach(select => {
    select.addEventListener("change", () => {
      const i = Number(select.dataset.goalScorer);
      list[i].scorerId = select.value;
      // Someone can't assist their own goal, and own goals have no assist:
      // rebuild just this row's assist options.
      if (list[i].assistId === select.value || select.value === "og") list[i].assistId = "";
      const assist = document.getElementById(`goal-assist-${i}`);
      assist.innerHTML = `<option value="">None</option>${playerOptions(list[i].assistId, list[i].scorerId)}`;
      assist.disabled = select.value === "og";
      applyGoalListToSquad();
      refreshAccounted();
    });
  });

  matchList.querySelectorAll("[data-goal-assist]").forEach(select => {
    select.addEventListener("change", () => {
      list[Number(select.dataset.goalAssist)].assistId = select.value;
      applyGoalListToSquad();
    });
  });

  matchList.querySelectorAll("[data-yellow-toggle]").forEach(btn => {
    btn.addEventListener("click", () => {
      const player = resultDraft.squad.find(p => p.playerId === btn.dataset.yellowToggle);
      player.yellowCards = player.yellowCards > 0 ? 0 : 1;
      btn.setAttribute("aria-pressed", player.yellowCards > 0 ? "true" : "false");
      btn.textContent = player.yellowCards > 0 ? `🟨 ×${player.yellowCards}` : "🟨";
    });
  });

  matchList.querySelectorAll("[data-red-toggle]").forEach(btn => {
    btn.addEventListener("click", () => {
      const player = resultDraft.squad.find(p => p.playerId === btn.dataset.redToggle);
      player.redCard = !player.redCard;
      btn.setAttribute("aria-pressed", player.redCard ? "true" : "false");
    });
  });

  document.getElementById("events-next-btn").addEventListener("click", () => {
    applyGoalListToSquad();
    renderResultPublishStep();
  });
}

function renderResultPublishStep() {
  const squadIn = resultDraft.squad.filter(p => p.inSquad);

  const voteRow = (category) => squadIn.map(p => `
    <button type="button" class="chip" data-vote-player="${p.playerId}">${escapeHtml(p.name)}${p[category] ? ` (${p[category]})` : ""}</button>
  `).join("");

  const winnerChips = (winnerField) => squadIn.map(p => `
    <button type="button" class="chip" data-winner-player="${p.playerId}" aria-pressed="${resultDraft[winnerField] === p.playerId}">${escapeHtml(p.name)}</button>
  `).join("");

  matchList.innerHTML = `
    <button type="button" id="publish-back-btn" class="btn btn--ghost btn--sm" style="margin-bottom:12px;">← Back</button>

    <p class="label">MOTM votes — tap a name each time someone votes for them</p>
    <div class="chips" id="motm-vote-chips" style="margin-top:8px;">${voteRow("motmVotes")}</div>

    <p class="label" style="margin-top:16px;">DOTD votes — tap a name each time someone votes for them</p>
    <div class="chips" id="dotd-vote-chips" style="margin-top:8px;">${voteRow("dotdVotes")}</div>

    <p class="label" style="margin-top:16px;">Confirmed MOTM</p>
    <div class="chips" id="motm-winner-chips" style="margin-top:8px;">${winnerChips("motmPlayerId")}</div>

    <p class="label" style="margin-top:16px;">Confirmed DOTD</p>
    <div class="chips" id="dotd-winner-chips" style="margin-top:8px;">${winnerChips("dotdPlayerId")}</div>

    <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0;border-top:1px solid var(--line);margin-top:16px;">
      <span class="sp">Add this to my personal record too</span>
      <span class="toggle" id="add-to-my-record-toggle" role="switch" aria-checked="${resultDraft.addToMyRecord}"></span>
    </div>

    <button type="button" id="publish-result-btn" class="btn" style="margin-top:16px;">Publish result</button>
    <p id="publish-status" class="tiny" style="color:var(--muted);margin-top:10px;"></p>
  `;

  document.getElementById("publish-back-btn").addEventListener("click", renderResultEventsStep);

  document.getElementById("motm-vote-chips").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-vote-player]");
    if (!chip) return;
    const player = squadIn.find(p => p.playerId === chip.dataset.votePlayer);
    player.motmVotes = (player.motmVotes || 0) + 1;
    chip.textContent = `${player.name} (${player.motmVotes})`;
  });

  document.getElementById("dotd-vote-chips").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-vote-player]");
    if (!chip) return;
    const player = squadIn.find(p => p.playerId === chip.dataset.votePlayer);
    player.dotdVotes = (player.dotdVotes || 0) + 1;
    chip.textContent = `${player.name} (${player.dotdVotes})`;
  });

  function wireWinnerChips(containerId, field) {
    document.getElementById(containerId).addEventListener("click", (e) => {
      const chip = e.target.closest("[data-winner-player]");
      if (!chip) return;
      resultDraft[field] = resultDraft[field] === chip.dataset.winnerPlayer ? null : chip.dataset.winnerPlayer;
      document.querySelectorAll(`#${containerId} .chip`).forEach(c => c.setAttribute("aria-pressed", c.dataset.winnerPlayer === resultDraft[field] ? "true" : "false"));
    });
  }
  wireWinnerChips("motm-winner-chips", "motmPlayerId");
  wireWinnerChips("dotd-winner-chips", "dotdPlayerId");

  document.getElementById("add-to-my-record-toggle").addEventListener("click", (e) => {
    resultDraft.addToMyRecord = !resultDraft.addToMyRecord;
    e.currentTarget.setAttribute("aria-checked", resultDraft.addToMyRecord ? "true" : "false");
  });

  document.getElementById("publish-result-btn").addEventListener("click", publishResult);
}

// Only ever writes the CURRENT user's own personal record — Supabase RLS on
// `matches` requires auth.uid() = user_id on insert, so a single client
// session can't create personal log entries for teammates. "Add to
// everyone's record" (as sketched in the designs) would need a server-side
// function (Edge Function or trigger) running with elevated privilege; this
// is deliberately scoped down to "add to MY record" until that exists.
async function publishResult() {
  const statusEl = document.getElementById("publish-status");
  const { fixture, squad } = resultDraft;
  const userId = await ensureSignedIn();
  if (!userId) return;

  const { error: fixtureError } = await supabaseClient
    .from("fixtures")
    .update({
      goals_for: resultDraft.goalsFor,
      goals_against: resultDraft.goalsAgainst,
      venue: resultDraft.venue,
      kit: resultDraft.kit
    })
    .eq("id", fixture.id);

  if (fixtureError) {
    console.error("Failed to save fixture result:", fixtureError);
    if (statusEl) statusEl.textContent = "Something went wrong saving the result — try again.";
    return;
  }

  const appearanceRows = squad.filter(p => p.inSquad).map(p => ({
    fixture_id: fixture.id,
    player_id: p.playerId,
    goals: p.goals || 0,
    assists: p.assists || 0,
    yellow_cards: p.yellowCards || 0,
    red_card: !!p.redCard,
    motm_votes: p.motmVotes || 0,
    dotd_votes: p.dotdVotes || 0,
    is_motm: resultDraft.motmPlayerId === p.playerId,
    is_dotd: resultDraft.dotdPlayerId === p.playerId
  }));

  if (appearanceRows.length) {
    const { error: appearancesError } = await supabaseClient
      .from("fixture_appearances")
      .upsert(appearanceRows, { onConflict: "fixture_id,player_id" });
    if (appearancesError) {
      console.error("Failed to save appearances:", appearancesError);
      if (statusEl) statusEl.textContent = "Result saved, but appearances failed — check the console.";
      return;
    }
  }

  if (resultDraft.addToMyRecord) {
    const mine = squad.find(p => p.userId === userId && p.inSquad);
    if (mine) {
      // Check MY records only. This used to query football_details by
      // fixture_id, which (since followers can read each other's details)
      // could find a followed teammate's record and wrongly skip creating
      // mine. `matches` only ever holds the signed-in user's own rows.
      const existingLink = matches.some(m => m.sport === "football" && m.fixtureId === fixture.id);

      if (!existingLink) {
        const { data: matchRow, error: matchError } = await supabaseClient
          .from("matches")
          .insert({ user_id: userId, sport: "football", date: fixture.date, notes: null })
          .select()
          .single();

        if (matchError) {
          console.error("Failed to create personal record:", matchError);
        } else {
          const { error: detailError } = await supabaseClient
            .from("football_details")
            .insert({
              match_id: matchRow.id,
              opponent: fixture.opponent,
              goals_for: resultDraft.goalsFor,
              goals_against: resultDraft.goalsAgainst,
              goals: mine.goals || 0,
              assists: mine.assists || 0,
              fixture_id: fixture.id
            });
          if (detailError) {
            // Don't leave a matches row with no details behind.
            console.error("Failed to save personal match details:", detailError);
            await supabaseClient.from("matches").delete().eq("id", matchRow.id);
            alert("The result was published, but adding it to your personal record failed. Re-open the result and publish again to retry.");
          }
        }
      }
    }
  }

  resultDraft = null;
  matches = await loadMatchesFromSupabase();
  await renderTeamDetail();
}