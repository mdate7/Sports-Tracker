const SUPABASE_URL = "https://saaiukdzwllatqtdqqhf.supabase.co";
const SUPABASE_KEY = "sb_publishable_Lie3FVMBz9Y4Buwumkyn6g_Q0JSMj4s"; // paste your actual key

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

async function ensureSignedIn() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) return session.user.id;

  const { data, error } = await supabaseClient.auth.signInAnonymously();
  if (error) {
    console.error("Anonymous sign-in failed:", error);
    return null;
  }
  return data.user.id;
}

async function loadMatchesFromSupabase() {
  const userId = await ensureSignedIn();
  if (!userId) return [];

  const { data, error } = await supabaseClient
    .from("matches")
    .select("*, football_details(*), cricket_details(*), golf_details(*), golf_holes(*)")
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

  return base;
}

const commonFields = [
  { key: "date", label: "Date", type: "date", summary: true },
  { key: "matchRating", label: "Match Rating", type: "number", summary: true },
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
  ]
};

const sportNames = { football: "Football", cricket: "Cricket", golf: "Golf" };
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
let editingId = null;

function getFieldsForSport(sport) {
  return [...commonFields, ...sportFields[sport]];
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

function buildForm(sport, existingMatch = null) {
  form.innerHTML = "";
  getFieldsForSport(sport).forEach(field => {
    const input = document.createElement("input");
    input.type = field.type;
    input.id = field.key;
    input.placeholder = field.summary ? field.label : `${field.label} (optional)`;
    input.required = !!field.summary;
    if (existingMatch) input.value = existingMatch[field.key] ?? "";
    form.appendChild(input);
  });
  const button = document.createElement("button");
  button.type = "submit";
  button.textContent = existingMatch ? "Save Changes" : "Add Match";
  form.appendChild(button);
}

function buildGolfSetup() {
  form.innerHTML = `
    <input type="text" id="golf-course-name" placeholder="Course Name" required>
    <input type="number" id="golf-num-holes" placeholder="Number of Holes" value="18" required>
    <button type="button" id="golf-start-btn">Start Round</button>
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
    <p style="font-size:13px;color:#8a8a85;">Hole ${holeIndex + 1} of ${numHoles}</p>
    <input type="number" id="hole-par" placeholder="Par" value="${hole.par}">
    <input type="number" id="hole-strokes" placeholder="Strokes" value="${hole.strokes}" required>
    <input type="number" id="hole-putts" placeholder="Putts (optional)" value="${hole.putts}">
    <div style="display:flex; gap:8px;">
      ${holeIndex > 0 ? `<button type="button" id="hole-back-btn">Back</button>` : ""}
      <button type="button" id="hole-next-btn">${holeIndex === numHoles - 1 ? "Finish Round" : "Next Hole"}</button>
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

function finishGolfRound() {
  form.innerHTML = `
    <input type="date" id="golf-date" required>
    <input type="number" id="golf-rating" placeholder="Match Rating" required>
    <input type="text" id="golf-played-with" placeholder="Played With (optional)">
    <input type="text" id="golf-notes" placeholder="Notes (optional)">
    <button type="button" id="golf-save-btn">Save Round</button>
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
    matchList.innerHTML = `<p class="empty-state">No matches yet.</p>`;
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
    viewTitle.textContent = "Coming soon";
    matchList.innerHTML = `<p class="empty-state">Team view is coming in a future stage.</p>`;
    return;
  }
  if (currentMode === "me") {
    viewLabel.textContent = "Me";
    viewTitle.textContent = "Coming soon";
    matchList.innerHTML = `<p class="empty-state">Your profile is coming in a future stage.</p>`;
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
  const label = match.opponent || match.courseName || "this match";
  const confirmed = confirm(`Delete ${label}? This can't be undone.`);
  if (!confirmed) return;

  const { error } = await supabaseClient.from("matches").delete().eq("id", id);
  if (error) {
    console.error("Failed to delete match:", error);
    alert("Something went wrong deleting this match — check the console.");
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
    alert("Pick a sport from the rail first, then tap + to log a match.");
    return;
  }

  if (currentView === "golf") {
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
  } else {
    buildForm(currentView);
  }
  form.style.display = "flex";
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
      alert("Something went wrong updating this match — check the console.");
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
      alert("Something went wrong saving this match — check the console.");
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

async function init() {
  matches = await loadMatchesFromSupabase();
  setMode("feed");
}
init();