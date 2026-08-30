const SUPABASE_URL = "https://saaiukdzwllatqtdqqhf.supabase.co";
const SUPABASE_KEY = "sb_publishable_Lie3FVMBz9Y4Buwumkyn6g_Q0JSMj4s"; // paste your actual key

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);


if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").then((registration) => {
      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            if (confirm("A new version of the app is available. Reload now?")) {
              newWorker.postMessage({ type: "SKIP_WAITING" });
              window.location.reload();
            }
          }
        });
      });
    }).catch(err => console.error("Service worker registration failed:", err));
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
let editingId = null;
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

function todayISODate() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().slice(0, 10);
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
    if (existingMatch) {
    input.value = existingMatch[field.key] ?? "";
     } else if (field.type === "date") {
    input.value = todayISODate();
}

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

form.addEventListener("submit", async function (event) {
  event.preventDefault();

  if (currentView !== "gym") return;

  if (!gymSession || !gymSession.sets || gymSession.sets.length === 0) {
    alert("Add at least one set before saving your gym session.");
    return;
  }

  const userId = await ensureSignedIn();
  if (!userId) {
    alert("Couldn't verify your session — try refreshing and saving again.");
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

function renderInProgressCards() {
  let html = "";

  const golfSaved = localStorage.getItem("inProgressGolfRound");
  if (golfSaved && (currentView === "all" || currentView === "golf")) {
    const round = JSON.parse(golfSaved);
    html += `
      <div class="card" data-sport="golf" data-resume="golf" style="cursor:pointer;">
        <div class="card-head">
          <div>
            <p class="eyebrow">Golf · ${round.courseName || "In progress"}</p>
            <p class="card-meta">Hole ${round.holeIndex + 1} of ${round.numHoles}</p>
          </div>
          <span class="chip" aria-pressed="true">Resume</span>
        </div>
      </div>
    `;
  }

  const gymSaved = localStorage.getItem("inProgressGymSession");
  if (gymSaved && (currentView === "all" || currentView === "gym")) {
    const session = JSON.parse(gymSaved);
    html += `
      <div class="card" data-sport="gym" data-resume="gym" style="cursor:pointer;">
        <div class="card-head">
          <div>
            <p class="eyebrow">Gym · ${session.type || "In progress"}</p>
            <p class="card-meta">${session.sets.length} set${session.sets.length === 1 ? "" : "s"} logged</p>
          </div>
          <span class="chip" aria-pressed="true">Resume</span>
        </div>
      </div>
    `;
  }

  return html;
}

function renderList(list) {
  const sorted = [...list].sort((a, b) => new Date(b.date) - new Date(a.date));
  const inProgressHtml = renderInProgressCards();
  matchList.innerHTML = inProgressHtml;

  if (list.length === 0) {
    if (!inProgressHtml) {
      matchList.innerHTML = `<p class="empty-state">No activities yet.</p>`;
    }
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

function resumeInProgress(sport) {
  if (sport === "golf") {
    const saved = localStorage.getItem("inProgressGolfRound");
    if (!saved) return;
    golfRound = JSON.parse(saved);
    setView("golf");
    renderHoleStep();
    form.style.display = "flex";
  } else if (sport === "gym") {
    const saved = localStorage.getItem("inProgressGymSession");
    if (!saved) return;
    gymSession = JSON.parse(saved);
    setView("gym");
    renderGymSets();
    form.style.display = "flex";
  }
}

matchList.addEventListener("click", (event) => {
  const resumeCard = event.target.closest("[data-resume]");
  if (!resumeCard) return;
  resumeInProgress(resumeCard.dataset.resume);
});

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