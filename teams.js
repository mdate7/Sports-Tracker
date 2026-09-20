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

async function renderTeamDetail() {
  const team = await loadTeamDetail(currentTeamId);
  if (!team) return;

  const userId = await ensureSignedIn();
  const membersHtml = team.members.map(m => `
    <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line);">
      <span>${m.profiles?.display_name || "Unnamed player"}</span>
      <span class="label">${m.role}</span>
    </div>
  `).join("");

  const today = todayISODate();
  const upcoming = team.fixtures.filter(f => f.date >= today);
  const past = team.fixtures.filter(f => f.date < today);

  const fixtureRow = (f) => {
    const played = f.goals_for !== null && f.goals_for !== undefined;
    return `
    <div style="padding:10px 0;border-bottom:1px solid var(--line);">
      <div style="display:flex;justify-content:space-between;">
        <div>
          <p class="stat-value" style="font-size:0.9rem;">${f.opponent} (${f.is_home ? "H" : "A"})</p>
          <p class="label" style="margin-top:2px;">${f.competition || ""}</p>
        </div>
        <span class="label">${f.date}</span>
      </div>
      ${played ? `<p class="delta num" style="margin-top:6px;">${f.goals_for}–${f.goals_against}</p>` : ""}
      <div style="display:flex;gap:8px;margin-top:8px;">
        <button type="button" class="btn btn--ghost btn--sm" data-team-sheet-fixture="${f.id}" style="flex:1;">Team sheet</button>
        <button type="button" class="btn btn--ghost btn--sm" data-add-result-fixture="${f.id}" style="flex:1;">${played ? "Edit result" : "Add result"}</button>
      </div>
    </div>
  `;
  };

  matchList.innerHTML = `
    <div class="card" data-sport="${team.sport}">
      <p class="stat-value">${team.name}</p>
      <p class="label" style="margin-top:4px;">${sportNames[team.sport]} · Invite code: ${team.invite_code}</p>
    </div>

    <p class="label" style="margin-top:16px;">Upcoming fixtures</p>
    <div class="card">${upcoming.length ? upcoming.map(fixtureRow).join("") : `<p class="empty-state">None scheduled.</p>`}</div>
    <button type="button" id="add-fixture-btn" class="btn btn--ghost btn--sm" style="margin-top:8px;">+ Add fixture</button>

    ${past.length ? `
      <p class="label" style="margin-top:16px;">Past fixtures</p>
      <div class="card">${past.map(fixtureRow).join("")}</div>
    ` : ""}

    <p class="label" style="margin-top:16px;">Members (${team.members.length})</p>
    <div class="card">${membersHtml}</div>

    <button type="button" id="team-back-btn" class="btn btn--ghost" style="margin-top:16px;">Back to teams</button>
    <button type="button" id="team-leave-btn" class="btn btn--ghost" style="margin-top:10px;">Leave team</button>
  `;

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

  matchList.addEventListener("click", async function fixtureSheetClick(event) {
  const btn = event.target.closest("[data-team-sheet-fixture]");
  if (!btn) return;
  const fixture = team.fixtures.find(f => f.id === btn.dataset.teamSheetFixture);
  if (fixture) await renderTeamSheetScreen(fixture, team);
}, { once: true });

  matchList.addEventListener("click", async function addResultClick(event) {
  const btn = event.target.closest("[data-add-result-fixture]");
  if (!btn) return;
  const fixture = team.fixtures.find(f => f.id === btn.dataset.addResultFixture);
  if (fixture) await renderAddResultScreen(fixture, team);
}, { once: true });

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
    <p class="stat-value">${t.name}</p>
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

  const { data: selections } = await supabaseClient
    .from("team_sheet_selections")
    .select("*")
    .eq("team_sheet_id", sheet.id);

  const selectionMap = {};
  (selections || []).forEach(s => { selectionMap[s.user_id] = s.is_in; });

  const memberRows = team.members.map(m => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--line);">
      <span>${m.profiles?.display_name || "Unnamed player"}</span>
      <button type="button" class="chip" data-member-id="${m.user_id}" aria-pressed="${selectionMap[m.user_id] ? "true" : "false"}">
        ${selectionMap[m.user_id] ? "In" : "Out"}
      </button>
    </div>
  `).join("");

  matchList.innerHTML = `
    <div class="card" data-sport="${team.sport}">
      <p class="stat-value">${fixture.opponent} (${fixture.is_home ? "H" : "A"})</p>
      <p class="label" style="margin-top:4px;">${fixture.date} · ${sheet.status === "published" ? "Published" : "Draft"}</p>
    </div>

    <p class="label" style="margin-top:16px;">Squad</p>
    <div class="card">${memberRows}</div>

    <button type="button" id="sheet-save-draft-btn" class="btn btn--ghost" style="margin-top:16px;">Save draft</button>
    <button type="button" id="sheet-publish-btn" class="btn" style="margin-top:10px;">Publish</button>
    <button type="button" id="sheet-back-btn" class="btn btn--ghost" style="margin-top:10px;">Back</button>
    <p id="sheet-status" class="tiny" style="color:var(--muted);margin-top:10px;"></p>
  `;

  document.querySelectorAll("[data-member-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      const isIn = btn.getAttribute("aria-pressed") === "true";
      btn.setAttribute("aria-pressed", isIn ? "false" : "true");
      btn.textContent = isIn ? "Out" : "In";
    });
  });

  document.getElementById("sheet-back-btn").addEventListener("click", () => renderTeamDetail());

  async function saveSelections(newStatus) {
    const statusEl = document.getElementById("sheet-status");
    const rows = team.members.map(m => ({
      team_sheet_id: sheet.id,
      user_id: m.user_id,
      is_in: document.querySelector(`[data-member-id="${m.user_id}"]`).getAttribute("aria-pressed") === "true"
    }));

    const { error: selectionsError } = await supabaseClient
      .from("team_sheet_selections")
      .upsert(rows, { onConflict: "team_sheet_id,user_id" });
    if (selectionsError) { console.error("Failed to save selections:", selectionsError); statusEl.textContent = "Something went wrong."; return; }

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
  const [sheet, players] = await Promise.all([
    loadOrCreateTeamSheet(fixture.id),
    ensurePlayersForTeam(team.id, team.members)
  ]);

  let selectionMap = {};
  if (sheet) {
    const { data: selections } = await supabaseClient
      .from("team_sheet_selections")
      .select("*")
      .eq("team_sheet_id", sheet.id);
    (selections || []).forEach(s => { selectionMap[s.user_id] = s.is_in; });
  }

  const squad = players.map(p => ({
    playerId: p.id,
    userId: p.user_id,
    name: p.display_name,
    inSquad: p.user_id ? !!selectionMap[p.user_id] : false,
    goals: 0, assists: 0, yellowCards: 0, redCard: false,
    motmVotes: 0, dotdVotes: 0
  }));

  resultDraft = {
    fixture, team, squad,
    goalsFor: fixture.goals_for ?? 0,
    goalsAgainst: fixture.goals_against ?? 0,
    resultTag: null,
    venue: fixture.venue || "",
    kit: fixture.kit || "",
    motmPlayerId: null,
    dotdPlayerId: null,
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
    <button type="button" class="chip" data-squad-player="${p.playerId}" aria-pressed="${p.inSquad}">${p.name}</button>
  `).join("");

  matchList.innerHTML = `
    <button type="button" id="result-back-btn" class="btn btn--ghost btn--sm" style="margin-bottom:12px;">← Back</button>
    <div class="card" data-sport="${team.sport}">
      <p class="label">${fixture.date} · ${fixture.is_home ? "Home" : "Away"}${fixture.competition ? " · " + fixture.competition : ""}</p>
      <p class="stat-value" style="margin-top:6px;">vs ${fixture.opponent}</p>
    </div>

    <p class="label" style="margin-top:16px;">Full time</p>
    <div class="card" style="display:flex;gap:16px;">
      <div style="flex:1;text-align:center;">
        <p class="label">${team.name}</p>
        <div class="stepper stepper--lg" style="justify-content:center;margin-top:8px;">
          <button type="button" id="gf-minus">−</button>
          <output id="gf-output">${resultDraft.goalsFor}</output>
          <button type="button" class="plus" id="gf-plus">+</button>
        </div>
      </div>
      <div style="flex:1;text-align:center;">
        <p class="label">${fixture.opponent}</p>
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
      <input type="text" id="result-venue" value="${resultDraft.venue}">
    </div>
    <div class="field">
      <label class="label" for="result-kit">Kit (optional)</label>
      <input type="text" id="result-kit" value="${resultDraft.kit}">
    </div>

    <p class="label" id="result-squad-count-label" style="margin-top:16px;">Who played? (${squad.filter(p => p.inSquad).length})</p>
    <div class="chips" id="result-squad-chips">${squadChips}</div>

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

function renderResultEventsStep() {
  const squadIn = resultDraft.squad.filter(p => p.inSquad);
  const goalsAccounted = squadIn.reduce((sum, p) => sum + (p.goals || 0), 0);

  const rows = squadIn.map(p => `
    <div class="card" style="margin-bottom:10px;">
      <p class="stat-value" style="font-size:0.9rem;">${p.name}</p>
      <div style="display:flex;gap:10px;margin-top:10px;">
        <div style="flex:1;">
          <p class="label">Goals</p>
          <div class="stepper" style="margin-top:6px;">
            <button type="button" data-event-minus="goals" data-player="${p.playerId}">−</button>
            <output data-event-output="goals" data-player="${p.playerId}">${p.goals}</output>
            <button type="button" class="plus" data-event-plus="goals" data-player="${p.playerId}">+</button>
          </div>
        </div>
        <div style="flex:1;">
          <p class="label">Assists</p>
          <div class="stepper" style="margin-top:6px;">
            <button type="button" data-event-minus="assists" data-player="${p.playerId}">−</button>
            <output data-event-output="assists" data-player="${p.playerId}">${p.assists}</output>
            <button type="button" class="plus" data-event-plus="assists" data-player="${p.playerId}">+</button>
          </div>
        </div>
      </div>
      <div class="chips" style="margin-top:10px;">
        <button type="button" class="chip" data-yellow-toggle="${p.playerId}" aria-pressed="${p.yellowCards > 0}">${p.yellowCards > 0 ? `🟨 ×${p.yellowCards}` : "🟨 Yellow"}</button>
        <button type="button" class="chip" data-red-toggle="${p.playerId}" aria-pressed="${p.redCard}">🟥 Red</button>
      </div>
    </div>
  `).join("");

  matchList.innerHTML = `
    <button type="button" id="events-back-btn" class="btn btn--ghost btn--sm" style="margin-bottom:12px;">← Back</button>
    <p class="label" id="events-accounted-label">Goals: ${goalsAccounted} of ${resultDraft.goalsFor} accounted for</p>
    <div style="margin-top:12px;">${rows || `<p class="empty-state">No one's marked as playing yet — go back and pick the squad.</p>`}</div>
    <button type="button" id="events-next-btn" class="btn" style="margin-top:16px;">Next — MOTM & DOTD</button>
  `;

  document.getElementById("events-back-btn").addEventListener("click", renderResultScoreStep);

  function refreshAccounted() {
    const total = resultDraft.squad.reduce((sum, p) => sum + (p.goals || 0), 0);
    document.getElementById("events-accounted-label").textContent = `Goals: ${total} of ${resultDraft.goalsFor} accounted for`;
  }

  matchList.querySelectorAll("[data-event-plus], [data-event-minus]").forEach(btn => {
    btn.addEventListener("click", () => {
      const field = btn.dataset.eventPlus || btn.dataset.eventMinus;
      const player = resultDraft.squad.find(p => p.playerId === btn.dataset.player);
      const delta = btn.dataset.eventPlus ? 1 : -1;
      player[field] = Math.max(0, (player[field] || 0) + delta);
      matchList.querySelector(`[data-event-output="${field}"][data-player="${player.playerId}"]`).textContent = player[field];
      if (field === "goals") refreshAccounted();
    });
  });

  matchList.querySelectorAll("[data-yellow-toggle]").forEach(btn => {
    btn.addEventListener("click", () => {
      const player = resultDraft.squad.find(p => p.playerId === btn.dataset.yellowToggle);
      player.yellowCards = player.yellowCards > 0 ? 0 : 1;
      btn.setAttribute("aria-pressed", player.yellowCards > 0 ? "true" : "false");
      btn.textContent = player.yellowCards > 0 ? `🟨 ×${player.yellowCards}` : "🟨 Yellow";
    });
  });

  matchList.querySelectorAll("[data-red-toggle]").forEach(btn => {
    btn.addEventListener("click", () => {
      const player = resultDraft.squad.find(p => p.playerId === btn.dataset.redToggle);
      player.redCard = !player.redCard;
      btn.setAttribute("aria-pressed", player.redCard ? "true" : "false");
    });
  });

  document.getElementById("events-next-btn").addEventListener("click", renderResultPublishStep);
}

function renderResultPublishStep() {
  const squadIn = resultDraft.squad.filter(p => p.inSquad);

  const voteRow = (category) => squadIn.map(p => `
    <button type="button" class="chip" data-vote-player="${p.playerId}">${p.name}${p[category] ? ` (${p[category]})` : ""}</button>
  `).join("");

  const winnerChips = (winnerField) => squadIn.map(p => `
    <button type="button" class="chip" data-winner-player="${p.playerId}" aria-pressed="${resultDraft[winnerField] === p.playerId}">${p.name}</button>
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
      const { data: existingLink } = await supabaseClient
        .from("football_details")
        .select("match_id")
        .eq("fixture_id", fixture.id)
        .maybeSingle();

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
          if (detailError) console.error("Failed to save personal match details:", detailError);
        }
      }
    }
  }

  resultDraft = null;
  matches = await loadMatchesFromSupabase();
  await renderTeamDetail();
}