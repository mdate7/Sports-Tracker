const commonFields = [
  { key: "date", label: "Date", type: "date", summary: true },
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
    { key: "matchRating", label: "Match Rating", type: "number" },
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
const matchList = document.getElementById("match-list");
const viewLabel = document.getElementById("view-label");
const viewTitle = document.getElementById("view-title");

let currentView = "all"; // "all" | "football" | "cricket" | "golf" | "stats"
let matches = JSON.parse(localStorage.getItem("matches")) || [];
let editingId = null;

function getFieldsForSport(sport) {
  return [...commonFields, ...sportFields[sport]];
}

function buildForm(sport, existingMatch = null) {
  form.innerHTML = "";
  getFieldsForSport(sport).forEach(field => {
    const input = document.createElement("input");
    input.type = field.type;
    input.id = field.key;
    input.placeholder = field.label;
    input.required = true;
    if (existingMatch) input.value = existingMatch[field.key];
    form.appendChild(input);
  });
  const button = document.createElement("button");
  button.type = "submit";
  button.textContent = existingMatch ? "Save Changes" : "Add Match";
  form.appendChild(button);
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
        <span class="tab-icon badge-${match.sport}">${match.sport[0].toUpperCase()}</span>
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
  matchList.innerHTML = "";
  if (list.length === 0) {
    matchList.innerHTML = `<p class="empty-state">No matches yet.</p>`;
    return;
  }
  list.forEach(renderMatch);
}

function renderView() {
  if (currentView === "all") {
    viewLabel.textContent = "All sports";
    viewTitle.textContent = "Your feed";
    form.style.display = "none";
    renderList(matches);
  } else if (currentView === "stats") {
    viewLabel.textContent = "Stats";
    viewTitle.textContent = "Coming soon";
    form.style.display = "none";
    matchList.innerHTML = `<p class="empty-state">Stats and graphs are coming in a future stage.</p>`;
  } else {
    viewLabel.textContent = sportNames[currentView];
    viewTitle.textContent = "Your feed";
    form.style.display = "flex";
    buildForm(currentView);
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
}

function deleteMatch(id) {
  matches = matches.filter(m => m.id !== id);
  localStorage.setItem("matches", JSON.stringify(matches));
  renderView();
}

tabBar.addEventListener("click", (event) => {
  const btn = event.target.closest(".tab-btn");
  if (!btn) return;
  if (editingId !== null) return;
  setView(btn.dataset.view);
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
});

setView("all");