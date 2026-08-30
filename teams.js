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

  if (teamError || membersError) {
    console.error("Failed to load team:", teamError || membersError);
    return null;
  }
  return { ...team, members };
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

  matchList.innerHTML = `
    <div class="card" data-sport="${team.sport}">
      <p class="stat-value">${team.name}</p>
      <p class="label" style="margin-top:4px;">${sportNames[team.sport]} · Invite code: ${team.invite_code}</p>
    </div>
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