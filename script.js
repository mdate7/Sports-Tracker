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
const sportIcons = { football: "⚽", cricket: "🏏", golf: "⛳" };
const CURRENT_USER_ID = "me";

const tabBar = document.getElementById("tab-bar");
const form = document.getElementById("match-form");
const addMatchBtn = document.getElementById("add-match-btn");
const matchList = document.getElementById("match-list");
const viewLabel = document.getElementById("view-label");
const viewTitle = document.getElementById("view-title");

let currentView = "all"; // "all" | "football" | "cricket" | "golf" | "stats"
let matches = JSON.parse(localStorage.getItem("matches")) || [];
let golfRound = null;
// shape while in progress:
// { courseName, numHoles, holes: [{par, strokes, putts}, ...], holeIndex }
let editingId = null;

function getFieldsForSport(sport) {
  return [...commonFields, ...sportFields[sport]];
}

function getCourseProfile(courseName) {
  const courses = JSON.parse(localStorage.getItem("courses")) || {};
  return courses[courseName] || null;
}

function saveCourseProfile(courseName, parPerHole) {
  const courses = JSON.parse(localStorage.getItem("courses")) || {};
  courses[courseName] = { parPerHole };
  localStorage.setItem("courses", JSON.stringify(courses));
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

function startGolfRound() {
  const courseName = document.getElementById("golf-course-name").value.trim();
  const numHoles = Number(document.getElementById("golf-num-holes").value);
  if (!courseName || !numHoles) return;

  const profile = getCourseProfile(courseName);
  const holes = [];
  for (let i = 0; i < numHoles; i++) {
    holes.push({
      par: profile && profile.parPerHole[i] ? profile.parPerHole[i] : "",
      strokes: "",
      putts: ""
    });
  }

  golfRound = { courseName, numHoles, holes, holeIndex: 0 };
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
      golfRound.holeIndex--;
      renderHoleStep();
    });
  }

  document.getElementById("hole-next-btn").addEventListener("click", () => {
    saveCurrentHoleInputs();
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
    <input type="text" id="golf-notes" placeholder="Notes (optional)">
    <button type="button" id="golf-save-btn">Save Round</button>
  `;

  document.getElementById("golf-save-btn").addEventListener("click", () => {
    const totalStrokes = golfRound.holes.reduce((sum, h) => sum + (h.strokes || 0), 0);
    const totalPar = golfRound.holes.reduce((sum, h) => sum + (h.par || 0), 0);
    const parPerHole = golfRound.holes.map(h => h.par);

    saveCourseProfile(golfRound.courseName, parPerHole);

    matches.push({
      id: Date.now(),
      sport: "golf",
      userId: CURRENT_USER_ID,
      courseName: golfRound.courseName,
      holes: golfRound.holes,
      strokes: totalStrokes,
      par: totalPar,
      date: document.getElementById("golf-date").value,
      matchRating: Number(document.getElementById("golf-rating").value),
      notes: document.getElementById("golf-notes").value
    });

    localStorage.setItem("matches", JSON.stringify(matches));
    golfRound = null;
    renderView();
    form.style.display = "none";
    addMatchBtn.textContent = "+ Add Match";
  });
}

function renderMatch(match) {
  const card = document.createElement("div");
  card.className = "match-card";

  const fields = getFieldsForSport(match.sport);
  const summaryFields = fields.filter(f => f.summary);
  const detailFields = fields.filter(f => !f.summary);

  const summaryRows = summaryFields.map(f => `<li>${f.label}: ${match[f.key]}</li>`).join("");
  const detailRows = detailFields.map(f => `<li>${f.label}: ${match[f.key]}</li>`).join("");

  card.innerHTML = `
    <div class="card-top">
      <div class="card-left">
        <span class="tab-icon badge-${match.sport}">${sportIcons[match.sport]}</span>
        <div>
          <p class="card-opponent">${match.opponent || match.courseName || ""}</p>
          <p class="card-date">${match.date || ""}</p>
        </div>
      </div>
      <span class="card-badge">${sportNames[match.sport]}</span>
    </div>
    <ul class="card-summary">${summaryRows}</ul>
    <ul class="card-details" style="display: none;">${detailRows}</ul>
    <div class="card-buttons">
      <button class="toggle-details-btn">View Details</button>
      <button class="edit-btn">Edit</button>
      <button class="delete-btn">Delete</button>
    </div>
  `;

  const toggleBtn = card.querySelector(".toggle-details-btn");
  const detailsList = card.querySelector(".card-details");
  toggleBtn.addEventListener("click", () => {
    const isHidden = detailsList.style.display === "none";
    detailsList.style.display = isHidden ? "flex" : "none";
    toggleBtn.textContent = isHidden ? "Hide Details" : "View Details";
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
  form.style.display = "none"; // always start hidden when switching views

  if (currentView === "all") {
    viewLabel.textContent = "All sports";
    viewTitle.textContent = "Your feed";
    addMatchBtn.style.display = "none";
    renderList(matches);
  } else if (currentView === "stats") {
    viewLabel.textContent = "Stats";
    viewTitle.textContent = "Coming soon";
    addMatchBtn.style.display = "none";
    matchList.innerHTML = `<p class="empty-state">Stats and graphs are coming in a future stage.</p>`;
  } else {
    viewLabel.textContent = sportNames[currentView];
    viewTitle.textContent = "Your feed";
    addMatchBtn.style.display = "block";
    addMatchBtn.textContent = "+ Add Match";
    renderList(matches.filter(m => m.sport === currentView));
  }
}

function setView(view) {
  currentView = view;
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
  renderView();
}

function startEdit(id) {
  const match = matches.find(m => m.id === id);
  editingId = id;
  setView(match.sport);
  buildForm(match.sport, match);
  form.style.display = "flex";
  addMatchBtn.textContent = "Cancel";
}

function deleteMatch(id) {
  const match = matches.find(m => m.id === id);
  const label = match.opponent || match.courseName || "this match";
  const confirmed = confirm(`Delete ${label}? This can't be undone.`);
  if (!confirmed) return;

  matches = matches.filter(m => m.id !== id);
  localStorage.setItem("matches", JSON.stringify(matches));
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



tabBar.addEventListener("click", (event) => {
  const btn = event.target.closest(".tab-btn");
  if (!btn) return;
  if (editingId !== null) return;
  setView(btn.dataset.view);
});

addMatchBtn.addEventListener("click", () => {
  const isOpen = form.style.display === "flex";
  if (isOpen) {
    form.style.display = "none";
    addMatchBtn.textContent = "+ Add Match";
    editingId = null;
    golfRound = null;
  } else {
    if (currentView === "golf") {
      buildGolfSetup();
    } else {
      buildForm(currentView);
    }
    form.style.display = "flex";
    addMatchBtn.textContent = "Cancel";
  }
});

form.addEventListener("submit", function (event) {
  event.preventDefault();

  const sport = currentView;
  const fields = getFieldsForSport(sport);
  const values = {};
  fields.forEach(field => {
    const inputEl = document.getElementById(field.key);
    values[field.key] = field.type === "number" ? Number(inputEl.value) : inputEl.value;
  });

  if (editingId !== null) {
    const index = matches.findIndex(m => m.id === editingId);
    matches[index] = { ...matches[index], ...values };
    editingId = null;
  } else {
    matches.push({ id: Date.now(), sport, userId: CURRENT_USER_ID, ...values });
  }

  localStorage.setItem("matches", JSON.stringify(matches));
  renderView();
  form.reset();
  form.style.display = "none";
  addMatchBtn.textContent = "+ Add Match";
});

document.getElementById("export-btn").addEventListener("click", exportMatches);
document.getElementById("import-btn").addEventListener("click", () => {
  document.getElementById("import-input").click();
});
document.getElementById("import-input").addEventListener("change", (e) => {
  if (e.target.files[0]) importMatches(e.target.files[0]);
});

setView("all");