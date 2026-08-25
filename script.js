const SUPABASE_URL = "https://saaiukdzwllatqtdqqhf.supabase.co";
const SUPABASE_KEY = "sb_publishable_Lie3FVMBz9Y4Buwumkyn6g_Q0JSMj4s"; // paste your actual key

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(err => console.error("Service worker registration failed:", err));
  });
}

async function ensureSignedIn() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  return session ? session.user.id : null;
}

async function loadMatchesFromSupabase() {
  const userId = await ensureSignedIn();
  if (!userId) return [];

  const { data, error } = await supabaseClient
    .from("matches")
    .select("*, football_details(*), cricket_details(*), golf_details(*), golf_holes(*), gym_details(*), gym_sets(*)")
    .eq("user_id", userId);

  if (error) {
    console.error("Failed to load matches:", error);
    return [];
  }

  return data.map(flattenMatchRow);
}

function flattenMatchRow(row) {
  const base = {
    id: row.id,
    sport: row.sport,
    userId: row.user_id,
    date: row.date,
    matchRating: row.match_rating,
    notes: row.notes
  };

  if (row.sport === "football" && row.football_details) {
    const d = row.football_details;
    return {
      ...base,
      opponent: d.opponent,
      goalsFor: d.goals_for,
      goalsAgainst: d.goals_against,
      goals: d.goals,
      assists: d.assists,
      position: d.position,
      minutesPlayed: d.minutes_played,
      momVotes: d.mom_votes,
      dodVotes: d.dod_votes
    };
  }

  if (row.sport === "cricket" && row.cricket_details) {
    const d = row.cricket_details;
    return {
      ...base,
      opponent: d.opponent,
      runsScored: d.runs_scored,
      ballsFaced: d.balls_faced,
      battingNumber: d.batting_number,
      fours: d.fours,
      sixes: d.sixes,
      wicketsTaken: d.wickets_taken,
      oversBowled: d.overs_bowled,
      runsConceded: d.runs_conceded,
      catches: d.catches
    };
  }

  if (row.sport === "golf" && row.golf_details) {
    const d = row.golf_details;
    return {
      ...base,
      courseName: d.course_name,
      playedWith: d.played_with,
      strokes: d.strokes,
      par: d.par,
      holesPlayed: d.holes_played,
      holes: (row.golf_holes || [])
        .sort((a, b) => a.hole_number - b.hole_number)
        .map(h => ({ par: h.par, strokes: h.strokes, putts: h.putts }))
    };
  }

if (row.sport === "gym" && row.gym_details) {
  const d = row.gym_details;
  return {
    ...base,
    type: d.type,
    sets: (row.gym_sets || [])
      .sort((a, b) => a.set_number - b.set_number)
      .map(s => ({ exercise: s.exercise, muscleGroup: s.muscle_group, weight: s.weight, reps: s.reps, rounds: s.rounds }))
  };
}

  return base;
}

const commonFields = [
  { key: "date", label: "Date", type: "date", summary: true },
  { key: "matchRating", label: "Rating", type: "number", summary: true },
  { key: "notes", label: "Notes", type: "text" }
];

const sportFields = {
  football: [
    { key: "opponent", label: "Opponent", type: "text", summary: true },
    { key: "goalsFor", label: "Goals For", type: "number", summary: true },
    { key: "goalsAgainst", label: "Goals Against", type: "number", summary: true },
    { key: "goals", label: "Your Goals", type: "number", summary: true },
    { key: "assists", label: "Your Assists", type: "number" },
    { key: "position", label: "Position Played", type: "text" },
    { key: "minutesPlayed", label: "Minutes Played", type: "number" },
    { key: "momVotes", label: "MOM Votes", type: "number" },
    { key: "dodVotes", label: "DOD Votes", type: "number" }
  ],
  cricket: [
    { key: "opponent", label: "Opponent", type: "text", summary: true },
    { key: "runsScored", label: "Runs Scored", type: "number", summary: true },
    { key: "ballsFaced", label: "Balls Faced", type: "number" },
    { key: "battingNumber", label: "Batting Number", type: "number" },
    { key: "fours", label: "Fours Hit", type: "number" },
    { key: "sixes", label: "Sixes Hit", type: "number" },
    { key: "wicketsTaken", label: "Wickets Taken", type: "number", summary: true },
    { key: "oversBowled", label: "Overs Bowled", type: "number" },
    { key: "runsConceded", label: "Runs Conceded", type: "number" },
    { key: "catches", label: "Catches", type: "number" }
  ],
  golf: [
    { key: "courseName", label: "Course Name", type: "text", summary: true },
    { key: "strokes", label: "Total Strokes", type: "number", summary: true },
    { key: "par", label: "Course Par", type: "number" },
    { key: "holesPlayed", label: "Holes Played", type: "number" },
    { key: "playedWith", label: "Played With", type: "text", summary: true }
  ],
  gym: [
    { key: "type", label: "Session Type", type: "text", summary: true },
  ]
};

const sportNames = { football: "Football", cricket: "Cricket", golf: "Golf", gym: "Gym" };
const CURRENT_USER_ID = "me";

const tabBar = document.getElementById("tab-bar");
const form = document.getElementById("match-form");
const addMatchBtn = document.getElementById("add-match-btn");
const matchList = document.getElementById("match-list");
const viewLabel = document.getElementById("view-label");
const viewTitle = document.getElementById("view-title");

let currentMode = "feed"; // "feed" | "insights" | "teams" | "me"
let currentView = "all";  // sport filter, only meaningful while currentMode === "feed"
let matches = [];
let golfRound = null;
// shape while in progress:
// { courseName, numHoles, holes: [{par, strokes, putts}, ...], holeIndex }
let gymSession = null; // { type, sets: [{ exercise, muscleGroup, weight, reps, rounds }, ...] }
let editingId = null;

let userTeams = [];
let teamsSubView = "list"; // "list" | "create" | "join"


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

let currentTeamId = null;

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
    <div class="card-details" style="display:flex;">
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

let userProfile = null;

async function loadProfile(userId) {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("Failed to load profile:", error);
    return null;
  }
  return data;
}

function showOnboarding() {
  document.getElementById("auth-screen").style.display = "none";
  document.querySelector(".app").style.display = "none";
  document.getElementById("onboarding-screen").style.display = "flex";
}

document.getElementById("onboard-sports").addEventListener("click", (event) => {
  const chip = event.target.closest(".chip");
  if (!chip) return;
  const isPressed = chip.getAttribute("aria-pressed") === "true";
  chip.setAttribute("aria-pressed", isPressed ? "false" : "true");
});

document.getElementById("onboard-continue-btn").addEventListener("click", async () => {
  const selected = Array.from(document.querySelectorAll('#onboard-sports .chip[aria-pressed="true"]'))
    .map(chip => chip.dataset.sportOption);

  const userId = await ensureSignedIn();
  if (!userId) return;

  const { data, error } = await supabaseClient
    .from("profiles")
    .insert({ id: userId, sports_tracked: selected })
    .select()
    .single();

  if (error) {
    console.error("Failed to save profile:", error);
    document.getElementById("onboard-status").textContent = "Something went wrong — try again.";
    return;
  }

  userProfile = data;
  document.getElementById("onboarding-screen").style.display = "none";
  await showApp();
});

function getFieldsForSport(sport) {
  return [...commonFields, ...sportFields[sport]];
}

function openSportForm(sport) {
  if (sport === "golf") {
    const saved = localStorage.getItem("inProgressGolfRound");
    if (saved) {
      const resume = confirm("You have an unfinished round in progress. Resume it?");
      if (resume) {
        golfRound = JSON.parse(saved);
        renderHoleStep();
      } else {
        clearRoundProgress();
        buildGolfSetup();
      }
    } else {
      buildGolfSetup();
    }
  } else if (sport === "gym") {
    const saved = localStorage.getItem("inProgressGymSession");
    if (saved) {
        const resume = confirm("You have an unfinished gym session in progress. Resume it?");
        if (resume) {
            gymSession = JSON.parse(saved);
            renderGymSets();
        } else {
            clearSessionProgress();
            buildGymSetup();
        }
    } else {
        buildGymSetup();
    }   
  } else {
    buildForm(sport);
  }
  form.style.display = "flex";
}

function buildSportPicker() {
  form.innerHTML = `
    <p style="font-size:13px;color:var(--muted);">Which sport?</p>
    <button type="button" class="btn" data-pick-sport="football">⚽ Football</button>
    <button type="button" class="btn btn--ghost" data-pick-sport="cricket">🏏 Cricket</button>
    <button type="button" class="btn btn--ghost" data-pick-sport="golf">⛳ Golf</button>
    <button type="button" class="btn btn--ghost" data-pick-sport="gym">🏋️ Gym</button>
  `;
  form.querySelectorAll("[data-pick-sport]").forEach(btn => {
    btn.addEventListener("click", () => {
      setView(btn.dataset.pickSport);
      openSportForm(currentView);
    });
  });
}

function buildDetailPayload(sport, values) {
  if (sport === "football") {
    return {
      opponent: values.opponent,
      goals_for: values.goalsFor,
      goals_against: values.goalsAgainst,
      goals: values.goals,
      assists: values.assists,
      position: values.position,
      minutes_played: values.minutesPlayed,
      mom_votes: values.momVotes,
      dod_votes: values.dodVotes
    };
  }
  if (sport === "cricket") {
    return {
      opponent: values.opponent,
      runs_scored: values.runsScored,
      balls_faced: values.ballsFaced,
      batting_number: values.battingNumber,
      fours: values.fours,
      sixes: values.sixes,
      wickets_taken: values.wicketsTaken,
      overs_bowled: values.oversBowled,
      runs_conceded: values.runsConceded,
      catches: values.catches
    };
  }
  return null; // golf is handled separately below, since it also needs golf_holes rows
}

function getGolfScoreVsPar(match) {
  const diff = match.strokes - match.par;
  if (diff === 0) return "E";
  return diff > 0 ? `+${diff}` : `${diff}`;
}

function getFootballResult(match) {
  if (match.goalsFor > match.goalsAgainst) return "Win";
  if (match.goalsFor < match.goalsAgainst) return "Loss";
  return "Draw";
}

async function getCourseProfile(courseName) {
  const userId = await ensureSignedIn();
  if (!userId) return null;

  const { data, error } = await supabaseClient
    .from("courses")
    .select("par_per_hole")
    .eq("user_id", userId)
    .eq("course_name", courseName)
    .maybeSingle();

  if (error) {
    console.error("Failed to look up course:", error);
    return null;
  }
  return data ? { parPerHole: data.par_per_hole } : null;
}

async function saveCourseProfile(courseName, parPerHole) {
  const userId = await ensureSignedIn();
  if (!userId) return;

  const { error } = await supabaseClient
    .from("courses")
    .upsert(
      { user_id: userId, course_name: courseName, par_per_hole: parPerHole },
      { onConflict: "user_id,course_name" }
    );

  if (error) console.error("Failed to save course profile:", error);
}

function saveRoundProgress() {
  localStorage.setItem("inProgressGolfRound", JSON.stringify(golfRound));
}

function clearRoundProgress() {
  localStorage.removeItem("inProgressGolfRound");
}

function saveSessionProgress() {
  localStorage.setItem("inProgressGymSession", JSON.stringify(gymSession));
}

function clearSessionProgress() {
  localStorage.removeItem("inProgressGymSession");
}

function buildForm(sport, existingMatch = null) {
  form.innerHTML = "";
  getFieldsForSport(sport).forEach(field => {
    const wrapper = document.createElement("div");
    wrapper.className = "field";

    const label = document.createElement("label");
    label.className = "label";
    label.textContent = field.summary ? field.label : `${field.label} (optional)`;
    label.setAttribute("for", field.key);

    const input = document.createElement("input");
    input.type = field.type;
    input.id = field.key;
    input.required = !!field.summary;
    if (existingMatch) input.value = existingMatch[field.key] ?? "";

    wrapper.appendChild(label);
    wrapper.appendChild(input);
    form.appendChild(wrapper);
  });

  const button = document.createElement("button");
  button.type = "submit";
  button.className = "btn";
  button.textContent = existingMatch ? "Save Changes" : "Add Activity";
  form.appendChild(button);
}

function buildGolfSetup() {
  form.innerHTML = `
    <div class="field">
      <label class="label" for="golf-course-name">Course Name</label>
      <input type="text" id="golf-course-name" required>
    </div>
    <div class="field">
      <label class="label" for="golf-num-holes">Number of Holes</label>
      <input type="number" id="golf-num-holes" value="18" required>
    </div>
    <button type="button" id="golf-start-btn" class="btn">Start Round</button>
  `;
  document.getElementById("golf-start-btn").addEventListener("click", startGolfRound);
}

async function startGolfRound() {
  const courseName = document.getElementById("golf-course-name").value.trim();
  const numHoles = Number(document.getElementById("golf-num-holes").value);
  if (!courseName || !numHoles) return;

  const profile = await getCourseProfile(courseName);
  const holes = [];
  for (let i = 0; i < numHoles; i++) {
    holes.push({
      par: profile && profile.parPerHole[i] ? profile.parPerHole[i] : "",
      strokes: "",
      putts: ""
    });
  }

  golfRound = { courseName, numHoles, holes, holeIndex: 0 };
  saveRoundProgress();
  renderHoleStep();
}

function renderHoleStep() {
  const { holeIndex, numHoles, holes } = golfRound;
  const hole = holes[holeIndex];

form.innerHTML = `
  <p style="font-size:13px;color:var(--muted);">Hole ${holeIndex + 1} of ${numHoles}</p>
  <div class="field">
    <label class="label" for="hole-par">Par</label>
    <input type="number" id="hole-par" value="${hole.par}">
  </div>
  <div class="field">
    <label class="label" for="hole-strokes">Strokes</label>
    <input type="number" id="hole-strokes" value="${hole.strokes}" required>
  </div>
  <div class="field">
    <label class="label" for="hole-putts">Putts (optional)</label>
    <input type="number" id="hole-putts" value="${hole.putts}">
  </div>
  <div style="display:flex; gap:8px;">
    ${holeIndex > 0 ? `<button type="button" id="hole-back-btn" class="btn btn--ghost">Back</button>` : ""}
    <button type="button" id="hole-next-btn" class="btn">${holeIndex === numHoles - 1 ? "Finish Round" : "Next Hole"}</button>
  </div>
`;

  if (holeIndex > 0) {
    document.getElementById("hole-back-btn").addEventListener("click", () => {
      saveCurrentHoleInputs();
      saveRoundProgress();
      golfRound.holeIndex--;
      renderHoleStep();
    });
  }

  document.getElementById("hole-next-btn").addEventListener("click", () => {
    saveCurrentHoleInputs();
    saveRoundProgress();
    if (holeIndex === numHoles - 1) {
      finishGolfRound();
    } else {
      golfRound.holeIndex++;
      renderHoleStep();
    }
  });
}

function saveCurrentHoleInputs() {
  const hole = golfRound.holes[golfRound.holeIndex];
  hole.par = Number(document.getElementById("hole-par").value) || "";
  hole.strokes = Number(document.getElementById("hole-strokes").value) || "";
  hole.putts = Number(document.getElementById("hole-putts").value) || "";
}

function buildGymSetup() {
  form.innerHTML = `
    <p class="label">Type</p>
    <div class="chips" id="gym-type-rail" style="flex-wrap:wrap;">
      <button type="button" class="chip" data-gym-type="strength" data-sport="gym" aria-pressed="false">Strength</button>
      <button type="button" class="chip" data-gym-type="hiit" data-sport="gym" aria-pressed="false">HIIT</button>
      <button type="button" class="chip" data-gym-type="class" data-sport="gym" aria-pressed="false">Class</button>
    </div>
    <button type="button" id="gym-start-btn" class="btn" style="margin-top:16px;">Start Session</button>
  `;

  document.getElementById("gym-type-rail").addEventListener("click", (event) => {
    const chip = event.target.closest(".chip");
    if (!chip) return;
    document.querySelectorAll("#gym-type-rail .chip").forEach(c => c.setAttribute("aria-pressed", "false"));
    chip.setAttribute("aria-pressed", "true");
  });

  document.getElementById("gym-start-btn").addEventListener("click", () => {
    const selected = document.querySelector('#gym-type-rail .chip[aria-pressed="true"]');
    if (!selected) {
      alert("Pick a session type first.");
      return;
    }
    gymSession = { type: selected.dataset.gymType, sets: [] };
    saveSessionProgress();
    renderGymSets();
  });
}

function renderGymSets() {
  const setsHtml = gymSession.sets.map((set, index) => `
    <div class="card" style="margin-bottom:10px;">
      <div class="field">
        <label class="label" for="set-exercise-${index}">Exercise</label>
        <input type="text" id="set-exercise-${index}" value="${set.exercise}">
      </div>
      <div class="field">
        <label class="label" for="set-muscle-${index}">Muscle group</label>
        <input type="text" id="set-muscle-${index}" value="${set.muscleGroup}">
      </div>
      <div style="display:flex; gap:8px;">
        <div class="field" style="flex:1;">
          <label class="label" for="set-weight-${index}">Weight</label>
          <input type="number" id="set-weight-${index}" value="${set.weight}">
        </div>
        <div class="field" style="flex:1;">
          <label class="label" for="set-reps-${index}">Reps</label>
          <input type="number" id="set-reps-${index}" value="${set.reps}">
        </div>
        <div class="field" style="flex:1;">
          <label class="label" for="set-rounds-${index}">Rounds</label>
          <input type="number" id="set-rounds-${index}" value="${set.rounds}">
        </div>
      </div>
      <button type="button" class="btn btn--ghost btn--sm" data-remove-set="${index}" style="margin-top:8px;">Remove set</button>
    </div>
  `).join("");

  form.innerHTML = `
    <p class="label">${sportNames.gym} · ${gymSession.type}</p>
    <div id="gym-sets-list">${setsHtml}</div>
    <button type="button" id="gym-add-set-btn" class="btn btn--ghost" style="margin-top:8px;">+ Add set</button>
    <button type="button" id="gym-finish-btn" class="btn" style="margin-top:16px;">Finish Session</button>
  `;

  document.getElementById("gym-add-set-btn").addEventListener("click", () => {
    saveGymSetInputs();
    gymSession.sets.push({ exercise: "", muscleGroup: "", weight: "", reps: "", rounds: "" });
    saveSessionProgress();
    renderGymSets();
  });

  document.querySelectorAll("[data-remove-set]").forEach(btn => {
    btn.addEventListener("click", () => {
      saveGymSetInputs();
      gymSession.sets.splice(Number(btn.dataset.removeSet), 1);
      saveSessionProgress();
      renderGymSets();
    });
  });

  document.getElementById("gym-finish-btn").addEventListener("click", () => {
    saveGymSetInputs();
    finishGymSession(); // build this next, mirroring finishGolfRound
  });
}

function saveGymSetInputs() {
  gymSession.sets.forEach((set, index) => {
    set.exercise = document.getElementById(`set-exercise-${index}`)?.value || "";
    set.muscleGroup = document.getElementById(`set-muscle-${index}`)?.value || "";
    set.weight = document.getElementById(`set-weight-${index}`)?.value !== "" 
  ? Number(document.getElementById(`set-weight-${index}`).value) 
  : "";
    set.reps = Number(document.getElementById(`set-reps-${index}`)?.value) || "";
    set.rounds = Number(document.getElementById(`set-rounds-${index}`)?.value) || "";
  });
}

function finishGymSession() {
  form.innerHTML = `
    <div class="field">
      <label class="label" for="gym-date">Date</label>
      <input type="date" id="gym-date" required>
    </div>
    <div class="field">
      <label class="label" for="gym-rating">Rating</label>
      <input type="number" id="gym-rating" required>
    </div>
    <div class="field">
      <label class="label" for="gym-notes">Notes (optional)</label>
      <input type="text" id="gym-notes">
    </div>
    <button type="button" id="gym-save-btn" class="btn">Save Session</button>
  `;

  document.getElementById("gym-save-btn").addEventListener("click", async () => {
    const userId = await ensureSignedIn();
    if (!userId) {
      alert("Couldn't verify your session — try again.");
      return;
    }

    const { data: matchRow, error: matchError } = await supabaseClient
      .from("matches")
      .insert({
        user_id: userId,
        sport: "gym",
        date: document.getElementById("gym-date").value,
        match_rating: Number(document.getElementById("gym-rating").value),
        notes: document.getElementById("gym-notes").value || null
      })
      .select()
      .single();

    if (matchError) {
      console.error("Failed to save session:", matchError);
      alert("Something went wrong saving this session — check the console.");
      return;
    }

    const { error: detailError } = await supabaseClient
      .from("gym_details")
      .insert({ match_id: matchRow.id, type: gymSession.type });
    if (detailError) console.error("Failed to save gym details:", detailError);

    const setRows = gymSession.sets.map((set, index) => ({
      match_id: matchRow.id,
      set_number: index + 1,
      exercise: set.exercise,
      muscle_group: set.muscleGroup,
      weight: set.weight || null,
      reps: set.reps || null,
      rounds: set.rounds || null
    }));

    const { error: setsError } = await supabaseClient.from("gym_sets").insert(setRows);
    if (setsError) console.error("Failed to save sets:", setsError);

    clearSessionProgress();
    gymSession = null;
    matches = await loadMatchesFromSupabase();
    renderView();
    form.style.display = "none";
  });
}

function finishGolfRound() {
  form.innerHTML = `
    <div class="field">
      <label class="label" for="golf-date">Date</label>
      <input type="date" id="golf-date" required>
    </div>
    <div class="field">
      <label class="label" for="golf-rating">Rating</label>
      <input type="number" id="golf-rating" required>
    </div>
    <div class="field">
      <label class="label" for="golf-played-with">Played With (optional)</label>
      <input type="text" id="golf-played-with">
    </div>
    <div class="field">
      <label class="label" for="golf-notes">Notes (optional)</label>
      <input type="text" id="golf-notes">
    </div>
    <button type="button" id="golf-save-btn" class="btn">Save Round</button>
  `;

  document.getElementById("golf-save-btn").addEventListener("click", async () => {
    const totalStrokes = golfRound.holes.reduce((sum, h) => sum + (h.strokes || 0), 0);
    const totalPar = golfRound.holes.reduce((sum, h) => sum + (h.par || 0), 0);
    const parPerHole = golfRound.holes.map(h => h.par);

    await saveCourseProfile(golfRound.courseName, parPerHole);

    const userId = await ensureSignedIn();
    if (!userId) {
      alert("Couldn't verify your session — try again.");
      return;
    }

    const { data: matchRow, error: matchError } = await supabaseClient
      .from("matches")
      .insert({
        user_id: userId,
        sport: "golf",
        date: document.getElementById("golf-date").value,
        match_rating: Number(document.getElementById("golf-rating").value),
        notes: document.getElementById("golf-notes").value || null
      })
      .select()
      .single();

    if (matchError) {
      console.error("Failed to save round:", matchError);
      alert("Something went wrong saving this round — check the console.");
      return;
    }

    const { error: detailError } = await supabaseClient
      .from("golf_details")
      .insert({
        match_id: matchRow.id,
        course_name: golfRound.courseName,
        played_with: document.getElementById("golf-played-with").value || null,
        strokes: totalStrokes,
        par: totalPar,
        holes_played: golfRound.numHoles
      });
    if (detailError) console.error("Failed to save golf details:", detailError);

    const holeRows = golfRound.holes.map((h, i) => ({
      match_id: matchRow.id,
      hole_number: i + 1,
      par: h.par,
      strokes: h.strokes,
      putts: h.putts || null
    }));

    const { error: holesError } = await supabaseClient.from("golf_holes").insert(holeRows);
    if (holesError) console.error("Failed to save hole-by-hole data:", holesError);

    clearRoundProgress();
    golfRound = null;
    matches = await loadMatchesFromSupabase();
    renderView();
    form.style.display = "none";
  });
}

function renderProfileScreen() {
  const tracked = userProfile ? userProfile.sports_tracked : [];
  matchList.innerHTML = `
  <div class="field">
  <label class="label" for="me-display-name">Display name</label>
  <input type="text" id="me-display-name" value="${userProfile?.display_name || ""}">
    </div>
    <div class="card">
      <p class="label">Sports you track</p>
      <div class="rail" id="me-sports" style="flex-wrap:wrap;margin-top:10px;">
        <button class="chip" data-sport-option="football" data-sport="football" aria-pressed="${tracked.includes("football")}">⚽ Football</button>
        <button class="chip" data-sport-option="cricket" data-sport="cricket" aria-pressed="${tracked.includes("cricket")}">🏏 Cricket</button>
        <button class="chip" data-sport-option="golf" data-sport="golf" aria-pressed="${tracked.includes("golf")}">⛳ Golf</button>
        <button class="chip" data-sport-option="gym" data-sport="gym" aria-pressed="${tracked.includes("gym")}">🏋️ Gym</button>
      </div>
      <button type="button" id="me-save-btn" class="btn" style="margin-top:16px;">Save</button>
      <button type="button" id="me-signout-btn" class="btn btn--ghost" style="margin-top:12px;">Sign out</button>
      <p id="me-status" class="tiny" style="color:var(--muted);margin-top:10px;"></p>
    </div>
  `;

  document.getElementById("me-sports").addEventListener("click", (event) => {
    const chip = event.target.closest(".chip");
    if (!chip) return;
    const isPressed = chip.getAttribute("aria-pressed") === "true";
    chip.setAttribute("aria-pressed", isPressed ? "false" : "true");
  });

  document.getElementById("me-save-btn").addEventListener("click", async () => {
    const selected = Array.from(document.querySelectorAll('#me-sports .chip[aria-pressed="true"]'))
      .map(chip => chip.dataset.sportOption);
    const statusEl = document.getElementById("me-status");

    const { data, error } = await supabaseClient
      .from("profiles")
      .update({ sports_tracked: selected, display_name: document.getElementById("me-display-name").value.trim() || null })      .eq("id", userProfile.id)
      .select()
      .single();

    if (error) {
      console.error("Failed to update profile:", error);
      statusEl.textContent = "Something went wrong saving — try again.";
      return;
    }
    userProfile = data;
    statusEl.textContent = "Saved.";

    document.getElementById("me-signout-btn").addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
});
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

function renderMatch(match) {
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.sport = match.sport;

  const fields = getFieldsForSport(match.sport);
  const summaryFields = fields.filter(f => f.summary);
  const detailFields = fields.filter(f => !f.summary);

  const statBlocks = summaryFields.map(f => `
    <div>
      <span class="stat-value num">${match[f.key]}</span>
      <p class="label">${f.label}</p>
    </div>
  `).join("");

  const detailRows = detailFields.map(f => `<li>${f.label}: ${match[f.key]}</li>`).join("");

  let hero = "";
  if (match.sport === "football") {
    const result = getFootballResult(match);
    const cls = result === "Loss" ? "verdict--loss" : result === "Draw" ? "verdict--draw" : "";
    hero = `<span class="verdict ${cls}">${result.toUpperCase()}</span>`;
  } else if (match.sport === "golf") {
    const diff = getGolfScoreVsPar(match);
    const cls = match.strokes > match.par ? "delta--neg" : "";
    hero = `<span class="delta num ${cls}">${diff}</span>`;
  } else if (match.sport === "gym") {
    hero = `<span class="delta num">${match.sets.length} sets</span>`;
  }

  const title = match.opponent || match.courseName || "";

  card.innerHTML = `
    <div class="card-head">
      <div>
        <p class="eyebrow">${sportNames[match.sport]} · ${title}</p>
        <p class="card-meta">${match.date || ""}</p>
      </div>
      ${hero}
    </div>
    <div class="stats">${statBlocks}</div>
    <ul class="card-details">${detailRows}</ul>
    <div class="card-actions">
      <button class="toggle-details-btn">View details</button>
      <button class="edit-btn">Edit</button>
      <button class="delete-btn">Delete</button>
    </div>
  `;

  const toggleBtn = card.querySelector(".toggle-details-btn");
  const detailsList = card.querySelector(".card-details");
  toggleBtn.addEventListener("click", () => {
    const isExpanded = detailsList.classList.toggle("expanded");
    toggleBtn.textContent = isExpanded ? "Hide details" : "View details";
  });

  card.querySelector(".edit-btn").addEventListener("click", () => startEdit(match.id));
  card.querySelector(".delete-btn").addEventListener("click", () => deleteMatch(match.id));

  matchList.appendChild(card);
}

function renderList(list) {
const sorted = [...list].sort((a, b) => new Date(b.date) - new Date(a.date));
  matchList.innerHTML = "";
  if (list.length === 0) {
    matchList.innerHTML = `<p class="empty-state">No activities yet.</p>`;
    return;
  }
  sorted.forEach(renderMatch);
}

function renderView() {
  form.style.display = "none";

  if (currentMode === "insights") {
    viewLabel.textContent = "Insights";
    viewTitle.textContent = "Coming soon";
    matchList.innerHTML = `<p class="empty-state">Stats and graphs are coming in a future stage.</p>`;
    return;
  }
  if (currentMode === "teams") {
    viewLabel.textContent = "Teams";
    viewTitle.textContent = "Your teams";
    renderTeamsScreen();
    return;
  }
  if (currentMode === "me") {
    viewLabel.textContent = "Me";
    viewTitle.textContent = "Your sports";
    renderProfileScreen();
    return;
}

  // currentMode === "feed"
  if (currentView === "all") {
    viewLabel.textContent = "All sports";
    viewTitle.textContent = "Your feed";
    renderList(matches);
  } else {
    viewLabel.textContent = sportNames[currentView];
    viewTitle.textContent = "Your feed";
    renderList(matches.filter(m => m.sport === currentView));
  }
}

function setMode(mode) {
  currentMode = mode;
  document.querySelectorAll(".tabs a").forEach(link => {
    if (link.dataset.mode === mode) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  sportRail.style.display = mode === "feed" ? "flex" : "none";
  renderView();
}

function setView(view) {
  currentView = view;
  document.querySelectorAll("#sport-rail .chip").forEach(chip => {
    chip.setAttribute("aria-pressed", chip.dataset.sportFilter === view ? "true" : "false");
  });
  renderView();
}

function startEdit(id) {
  const match = matches.find(m => m.id === id);
  editingId = id;
  setView(match.sport);
  buildForm(match.sport, match);
  form.style.display = "flex";
}

async function deleteMatch(id) {
  const match = matches.find(m => m.id === id);
  const label = match.opponent || match.courseName || "this activity";
  const confirmed = confirm(`Delete ${label}? This can't be undone.`);
  if (!confirmed) return;

  const { error } = await supabaseClient.from("matches").delete().eq("id", id);
  if (error) {
    console.error("Failed to delete match:", error);
    alert("Something went wrong deleting this activity — check the console.");
    return;
  }

  matches = await loadMatchesFromSupabase();
  renderView();
}

function exportMatches() {
  const dataStr = JSON.stringify(matches, null, 2);
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sports-tracker-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importMatches(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (!Array.isArray(imported)) throw new Error("Not a valid backup file");
      matches = imported; // or: matches.push(...imported) to merge instead of replace
      localStorage.setItem("matches", JSON.stringify(matches));
      renderView();
    } catch (err) {
      alert("Couldn't read that file — is it a valid export from this app?");
    }
  };
  reader.readAsText(file);
}

const sportRail = document.getElementById("sport-rail");

tabBar.addEventListener("click", (event) => {
  const link = event.target.closest("a[data-mode]");
  if (!link) return;
  event.preventDefault();
  if (editingId !== null) return;
  setMode(link.dataset.mode);
});

sportRail.addEventListener("click", (event) => {
  const chip = event.target.closest(".chip");
  if (!chip) return;
  if (editingId !== null) return;
  setView(chip.dataset.sportFilter);
});

addMatchBtn.addEventListener("click", () => {
  const isOpen = form.style.display === "flex";
  if (isOpen) {
    form.style.display = "none";
    editingId = null;
    golfRound = null;
    return;
  }

  if (currentMode !== "feed") setMode("feed");

  if (currentView === "all") {
    buildSportPicker();
    form.style.display = "flex";
  } else {
    openSportForm(currentView);
  }
});

form.addEventListener("submit", async function (event) {
  event.preventDefault();

  const sport = currentView;
  const fields = getFieldsForSport(sport);
  const values = {};
  fields.forEach(field => {
    const inputEl = document.getElementById(field.key);
    values[field.key] = field.type === "number" ? Number(inputEl.value) : inputEl.value;
  });

  const userId = await ensureSignedIn();
  if (!userId) {
    alert("Couldn't verify your session — try refreshing and saving again.");
    return;
  }

  if (editingId !== null) {
    const { error: matchError } = await supabaseClient
      .from("matches")
      .update({ date: values.date, match_rating: values.matchRating, notes: values.notes || null })
      .eq("id", editingId);

    if (matchError) {
      console.error("Failed to update match:", matchError);
      alert("Something went wrong updating this activity — check the console.");
      return;
    }

    const { error: detailError } = await supabaseClient
      .from(`${sport}_details`)
      .update(buildDetailPayload(sport, values))
      .eq("match_id", editingId);

    if (detailError) console.error("Failed to update match details:", detailError);
    editingId = null;

  } else {
    const { data: matchRow, error: matchError } = await supabaseClient
      .from("matches")
      .insert({ user_id: userId, sport, date: values.date, match_rating: values.matchRating, notes: values.notes || null })
      .select()
      .single();

    if (matchError) {
      console.error("Failed to save match:", matchError);
      alert("Something went wrong saving this activity — check the console.");
      return;
    }

    const { error: detailError } = await supabaseClient
      .from(`${sport}_details`)
      .insert({ match_id: matchRow.id, ...buildDetailPayload(sport, values) });

    if (detailError) console.error("Failed to save match details:", detailError);
  }

  matches = await loadMatchesFromSupabase();
  renderView();
  form.reset();
  form.style.display = "none";
});

document.getElementById("export-btn").addEventListener("click", exportMatches);
document.getElementById("import-btn").addEventListener("click", () => {
  document.getElementById("import-input").click();
});
document.getElementById("import-input").addEventListener("change", (e) => {
  if (e.target.files[0]) importMatches(e.target.files[0]);
});

document.getElementById("auth-send-btn").addEventListener("click", async () => {
  const email = document.getElementById("auth-email").value.trim();
  const statusEl = document.getElementById("auth-status");
  if (!email) return;

  statusEl.textContent = "Sending...";
  const { error } = await supabaseClient.auth.signInWithOtp({ email });

  if (error) {
    console.error("Failed to send code:", error);
    statusEl.textContent = "Something went wrong — try again.";
    return;
  }

  statusEl.textContent = "Enter the code from your email below.";
  document.getElementById("auth-code-field").style.display = "block";
  document.getElementById("auth-verify-btn").style.display = "block";
});

document.getElementById("auth-verify-btn").addEventListener("click", async () => {
  const email = document.getElementById("auth-email").value.trim();
  const token = document.getElementById("auth-code").value.trim();
  const statusEl = document.getElementById("auth-status");

  const { error } = await supabaseClient.auth.verifyOtp({ email, token, type: "email" });

  if (error) {
    console.error("Failed to verify code:", error);
    statusEl.textContent = "That code didn't work — check it and try again.";
    return;
  }
});

function showAuthScreen() {
  document.getElementById("auth-screen").style.display = "flex";
  document.getElementById("onboarding-screen").style.display = "none";
  document.querySelector(".app").style.display = "none";
}

async function showApp() {
  document.getElementById("auth-screen").style.display = "none";
  document.getElementById("onboarding-screen").style.display = "none";
  document.querySelector(".app").style.display = "block";
  matches = await loadMatchesFromSupabase();
  userTeams = await loadUserTeams();
  setMode("feed");
}

async function handleSignedIn(userId) {
  userProfile = await loadProfile(userId);
  if (!userProfile) {
    showOnboarding();
  } else {
    await showApp();
  }
}

supabaseClient.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_IN" && session) handleSignedIn(session.user.id);
  if (event === "SIGNED_OUT") showAuthScreen();
});

async function init() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    await handleSignedIn(session.user.id);
  } else {
    showAuthScreen();
  }
}
init();