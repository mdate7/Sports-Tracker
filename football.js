async function buildFootballForm(existingMatch = null) {
  const footballTeams = await getFootballTeamsForUser();
  const fixtures = await getUpcomingFixturesForTeams(footballTeams.map(t => t.id));

  form.dataset.sport = "football";
  let goalsFor = existingMatch?.goalsFor ?? 0;
  let goalsAgainst = existingMatch?.goalsAgainst ?? 0;
  let yourGoals = existingMatch?.goals ?? 0;
  let yourAssists = existingMatch?.assists ?? 0;
  const positions = ["GK", "RB", "CB", "LB", "CM", "CAM", "RW", "LW", "ST"];

  form.innerHTML = `
    <p class="label" style="text-align:center;">Result</p>
    <div class="card" data-sport="football" style="text-align:center;">
      <span class="verdict" id="football-result-badge">DRAW</span>
      <div style="display:flex;justify-content:space-around;margin-top:16px;">
        <div>
          <p class="label">You</p>
          <div class="stepper" style="justify-content:center;gap:12px;margin-top:6px;">
            <button type="button" id="goals-for-minus">−</button>
            <output id="goals-for-output">${goalsFor}</output>
            <button type="button" class="plus" id="goals-for-plus">+</button>
          </div>
        </div>
        <div>
          <p class="label">Opponent</p>
          <div class="stepper" style="justify-content:center;gap:12px;margin-top:6px;">
            <button type="button" id="goals-against-minus">−</button>
            <output id="goals-against-output">${goalsAgainst}</output>
            <button type="button" class="plus" id="goals-against-plus">+</button>
          </div>
        </div>
      </div>
    </div>

    <p class="label" style="margin-top:16px;">Position</p>
    <div class="chips" id="position-chips">
      ${positions.map(p => `<button type="button" class="chip" data-position="${p}" aria-pressed="${existingMatch?.position === p}">${p}</button>`).join("")}
    </div>

    <p class="label" style="margin-top:16px;">Your game</p>
    <div style="display:flex;gap:16px;">
      <div style="flex:1;text-align:center;">
        <p class="label">Goals</p>
        <div class="stepper" style="justify-content:center;gap:12px;margin-top:6px;">
          <button type="button" id="your-goals-minus">−</button>
          <output id="your-goals-output">${yourGoals}</output>
          <button type="button" class="plus" id="your-goals-plus">+</button>
        </div>
      </div>
      <div style="flex:1;text-align:center;">
        <p class="label">Assists</p>
        <div class="stepper" style="justify-content:center;gap:12px;margin-top:6px;">
          <button type="button" id="your-assists-minus">−</button>
          <output id="your-assists-output">${yourAssists}</output>
          <button type="button" class="plus" id="your-assists-plus">+</button>
        </div>
      </div>
    </div>

    <div class="field" style="margin-top:16px;">
      <label class="label" for="date">Date</label>
      <input type="date" id="date" value="${existingMatch ? existingMatch.date : todayISODate()}" required>
    </div>
    <div class="field">
      <label class="label" for="opponent">Opponent</label>
      <input type="text" id="opponent" value="${existingMatch?.opponent || ""}" required>
    </div>
    <div class="field">
      <label class="label" for="notes">Notes (optional)</label>
      <input type="text" id="notes" value="${existingMatch?.notes || ""}">
    </div>

        ${fixtures.length > 0 ? `
      <div class="field" style="margin-top:16px;">
        <label class="label" for="fixture-select">Attach to fixture (optional)</label>
        <select id="fixture-select">
          <option value="">None</option>
          ${fixtures.map(f => `<option value="${f.id}" ${existingMatch?.fixtureId === f.id ? "selected" : ""}>${f.opponent} · ${f.date}</option>`).join("")}
        </select>
      </div>
    ` : ""}

    <button type="submit" class="btn" style="margin-top:16px;">${existingMatch ? "Save Changes" : "Save Match"}</button>
  `;

  form.addEventListener("submit", async function footballSubmit(event) {
  event.preventDefault();
  if (currentView !== "football") return;

  const userId = await ensureSignedIn();
  if (!userId) return;

  const payload = {
    date: document.getElementById("date").value,
    opponent: document.getElementById("opponent").value,
    notes: document.getElementById("notes").value || null,
    goals_for: Number(document.getElementById("goals-for-output").textContent),
    goals_against: Number(document.getElementById("goals-against-output").textContent),
    goals: Number(document.getElementById("your-goals-output").textContent),
    assists: Number(document.getElementById("your-assists-output").textContent),
    position: document.querySelector('#position-chips .chip[aria-pressed="true"]')?.dataset.position || null,
    fixture_id: document.getElementById("fixture-select")?.value || null
  };

  if (existingMatch) {
    const { error: matchError } = await supabaseClient
      .from("matches")
      .update({ date: payload.date, notes: payload.notes })
      .eq("id", existingMatch.id);
    if (matchError) { console.error("Failed to update match:", matchError); return; }

    const { error: detailError } = await supabaseClient
      .from("football_details")
      .update({
        opponent: payload.opponent, goals_for: payload.goals_for, goals_against: payload.goals_against,
        goals: payload.goals, assists: payload.assists, position: payload.position, fixture_id: payload.fixture_id
      })
      .eq("match_id", existingMatch.id);
    if (detailError) console.error("Failed to update football details:", detailError);

  } else {
    const { data: matchRow, error: matchError } = await supabaseClient
      .from("matches")
      .insert({ user_id: userId, sport: "football", date: payload.date, notes: payload.notes })
      .select()
      .single();
    if (matchError) { console.error("Failed to save match:", matchError); return; }

    const { error: detailError } = await supabaseClient
      .from("football_details")
      .insert({
        match_id: matchRow.id, opponent: payload.opponent, goals_for: payload.goals_for,
        goals_against: payload.goals_against, goals: payload.goals, assists: payload.assists,
        position: payload.position, fixture_id: payload.fixture_id
      });
    if (detailError) console.error("Failed to save football details:", detailError);
  }

  matches = await loadMatchesFromSupabase();
  renderView();
  form.style.display = "none";
}, { once: true });

  function refreshBadge() {
    const badge = document.getElementById("football-result-badge");
    const gf = Number(document.getElementById("goals-for-output").textContent);
    const ga = Number(document.getElementById("goals-against-output").textContent);
    let result, cls;
    if (gf > ga) { result = "WIN"; cls = ""; }
    else if (gf < ga) { result = "LOSS"; cls = "verdict--loss"; }
    else { result = "DRAW"; cls = "verdict--draw"; }
    badge.textContent = result;
    badge.className = `verdict ${cls}`;
  }

  function wireStepper(minusId, plusId, outputId, onChange) {
    document.getElementById(minusId).addEventListener("click", () => {
      const out = document.getElementById(outputId);
      out.textContent = Math.max(0, Number(out.textContent) - 1);
      if (onChange) onChange();
    });
    document.getElementById(plusId).addEventListener("click", () => {
      const out = document.getElementById(outputId);
      out.textContent = Number(out.textContent) + 1;
      if (onChange) onChange();
    });
  }

  wireStepper("goals-for-minus", "goals-for-plus", "goals-for-output", refreshBadge);
  wireStepper("goals-against-minus", "goals-against-plus", "goals-against-output", refreshBadge);
  wireStepper("your-goals-minus", "your-goals-plus", "your-goals-output");
  wireStepper("your-assists-minus", "your-assists-plus", "your-assists-output");

  document.getElementById("position-chips").addEventListener("click", (event) => {
    const chip = event.target.closest(".chip");
    if (!chip) return;
    document.querySelectorAll("#position-chips .chip").forEach(c => c.setAttribute("aria-pressed", "false"));
    chip.setAttribute("aria-pressed", "true");
  });

  refreshBadge();
}

async function getFootballTeamsForUser() {
  const userId = await ensureSignedIn();
  if (!userId) return [];
  const { data, error } = await supabaseClient
    .from("team_members")
    .select("teams(id, name, sport)")
    .eq("user_id", userId);
  if (error) { console.error("Failed to load football teams:", error); return []; }
  return data.map(row => row.teams).filter(t => t.sport === "football");
}

async function getUpcomingFixturesForTeams(teamIds) {
  if (teamIds.length === 0) return [];
  const { data, error } = await supabaseClient
    .from("fixtures")
    .select("*")
    .in("team_id", teamIds)
    .order("date", { ascending: false });
  if (error) { console.error("Failed to load fixtures:", error); return []; }
  return data;
}