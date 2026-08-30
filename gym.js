let gymSession = null; // { type, sets: [{ exercise, muscleGroup, weight, reps, rounds }, ...] }

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
      <input type="date" id="gym-date" value="${todayISODate()}" required>
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

    const dateValue = document.getElementById("gym-date")?.value;
    const ratingValue = document.getElementById("gym-rating")?.value;
    const notesValue = document.getElementById("gym-notes")?.value || "";

    if (!dateValue || !ratingValue) {
      alert("Please add a date and rating before saving.");
      return;
    }

    const sessionPayload = {
      userId,
      sport: "gym",
      type: gymSession.type,
      date: dateValue,
      rating: Number(ratingValue),
      notes: notesValue,
      sets: gymSession.sets.map(set => ({
        exercise: set.exercise || "",
        muscleGroup: set.muscleGroup || "",
        weight: set.weight === "" ? null : Number(set.weight),
        reps: set.reps === "" ? null : Number(set.reps),
        rounds: set.rounds === "" ? null : Number(set.rounds)
      }))
    };

const { data: matchRow, error: matchError } = await supabaseClient
  .from("matches")
  .insert({
    user_id: sessionPayload.userId,
    sport: "gym",
    date: sessionPayload.date,
    match_rating: sessionPayload.rating,
    notes: sessionPayload.notes || null
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
  .insert({ match_id: matchRow.id, type: sessionPayload.type });
if (detailError) console.error("Failed to save gym details:", detailError);

const setRows = sessionPayload.sets.map((set, index) => ({
  match_id: matchRow.id,
  set_number: index + 1,
  exercise: set.exercise,
  muscle_group: set.muscleGroup,
  weight: set.weight,
  reps: set.reps,
  rounds: set.rounds
}));

const { error: setsError } = await supabaseClient.from("gym_sets").insert(setRows);
if (setsError) console.error("Failed to save sets:", setsError);
    gymSession = null;
clearSessionProgress();
matches = await loadMatchesFromSupabase();
renderView();
form.style.display = "none";
  });
}

function saveSessionProgress() {
  localStorage.setItem("inProgressGymSession", JSON.stringify(gymSession));
}

function clearSessionProgress() {
  localStorage.removeItem("inProgressGymSession");
}