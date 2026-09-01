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

function getDistinctGymValues(key) {
  const values = matches
    .filter(m => m.sport === "gym")
    .flatMap(m => m.sets || [])
    .map(s => s[key])
    .filter(Boolean);
  return [...new Set(values)];
}

function renderGymSets() {
  const exerciseOptions = getDistinctGymValues("exercise")
    .map(v => `<option value="${v}"></option>`).join("");
  const muscleOptions = getDistinctGymValues("muscleGroup")
    .map(v => `<option value="${v}"></option>`).join("");

  const setsHtml = gymSession.sets.map((set, index) => `
    <div class="card" style="margin-bottom:10px;">
      <div class="field">
        <label class="label" for="set-exercise-${index}">Exercise</label>
        <input type="text" id="set-exercise-${index}" value="${set.exercise}" list="exercise-options">
      </div>
      <div class="field">
        <label class="label" for="set-muscle-${index}">Muscle group</label>
        <input type="text" id="set-muscle-${index}" value="${set.muscleGroup}" list="muscle-options">
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
    <datalist id="exercise-options">${exerciseOptions}</datalist>
    <datalist id="muscle-options">${muscleOptions}</datalist>
    <p class="label">${sportNames.gym} · ${gymSession.type}</p>
    <div id="gym-sets-list">${setsHtml}</div>
    <button type="button" id="gym-add-set-btn" class="btn btn--ghost" style="margin-top:8px;">+ Add set</button>
    <button type="button" id="gym-finish-btn" class="btn" style="margin-top:16px;">Finish Session</button>
  `;

  document.getElementById("gym-add-set-btn").addEventListener("click", () => {
    saveGymSetInputs();
    gymSession.sets.push({ exercise: "", muscleGroup: "", weight: "", reps: "", rounds: "" });
if (!gymSession.editingMatchId) saveSessionProgress();
    renderGymSets();
  });

  document.querySelectorAll("[data-remove-set]").forEach(btn => {
    btn.addEventListener("click", () => {
      saveGymSetInputs();
      gymSession.sets.splice(Number(btn.dataset.removeSet), 1);
if (!gymSession.editingMatchId) saveSessionProgress();
      renderGymSets();
    });
  });

  document.getElementById("gym-finish-btn").addEventListener("click", () => {
    saveGymSetInputs();
    finishGymSession(); // build this next, mirroring finishGolfRound
  });
  // ...rest of the function (listeners) stays exactly as it is
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
  const existing = gymSession.editingMatchId ? matches.find(m => m.id === gymSession.editingMatchId) : null;

  form.innerHTML = `
    <div class="field">
      <label class="label" for="gym-date">Date</label>
      <input type="date" id="gym-date" value="${existing ? existing.date : todayISODate()}" required>
    </div>
    <div class="field">
      <label class="label" for="gym-rating">Rating</label>
      <input type="number" id="gym-rating" value="${existing ? existing.matchRating ?? "" : ""}" required>
    </div>
    <div class="field">
      <label class="label" for="gym-notes">Notes (optional)</label>
      <input type="text" id="gym-notes" value="${existing ? existing.notes ?? "" : ""}">
    </div>
    <button type="button" id="gym-save-btn" class="btn">${existing ? "Save Changes" : "Save Session"}</button>
  `;

  document.getElementById("gym-save-btn").addEventListener("click", async () => {
    const userId = await ensureSignedIn();
    if (!userId) {
      alert("Couldn't verify your session — try again.");
      return;
    }

    const dateValue = document.getElementById("gym-date").value;
    const ratingValue = Number(document.getElementById("gym-rating").value);
    const notesValue = document.getElementById("gym-notes").value || null;

    if (gymSession.editingMatchId) {
      const matchId = gymSession.editingMatchId;

      const { error: matchError } = await supabaseClient
        .from("matches")
        .update({ date: dateValue, match_rating: ratingValue, notes: notesValue })
        .eq("id", matchId);
      if (matchError) {
        console.error("Failed to update session:", matchError);
        alert("Something went wrong updating this session — check the console.");
        return;
      }

      const { error: detailError } = await supabaseClient
        .from("gym_details")
        .update({ type: gymSession.type })
        .eq("match_id", matchId);
      if (detailError) console.error("Failed to update gym details:", detailError);

      const { error: deleteSetsError } = await supabaseClient.from("gym_sets").delete().eq("match_id", matchId);
      if (deleteSetsError) console.error("Failed to clear old sets:", deleteSetsError);

      const setRows = gymSession.sets.map((set, index) => ({
        match_id: matchId,
        set_number: index + 1,
        exercise: set.exercise,
        muscle_group: set.muscleGroup,
        weight: set.weight === "" ? null : Number(set.weight),
        reps: set.reps === "" ? null : Number(set.reps),
        rounds: set.rounds === "" ? null : Number(set.rounds)
      }));
      const { error: setsError } = await supabaseClient.from("gym_sets").insert(setRows);
      if (setsError) console.error("Failed to save updated sets:", setsError);

    } else {
      const { data: matchRow, error: matchError } = await supabaseClient
        .from("matches")
        .insert({ user_id: userId, sport: "gym", date: dateValue, match_rating: ratingValue, notes: notesValue })
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
        weight: set.weight === "" ? null : Number(set.weight),
        reps: set.reps === "" ? null : Number(set.reps),
        rounds: set.rounds === "" ? null : Number(set.rounds)
      }));
      const { error: setsError } = await supabaseClient.from("gym_sets").insert(setRows);
      if (setsError) console.error("Failed to save sets:", setsError);

      clearSessionProgress();
    }

    gymSession = null;
    matches = await loadMatchesFromSupabase();
    renderView();
    closeEntryScreen();
  });
}

function saveSessionProgress() {
  localStorage.setItem("inProgressGymSession", JSON.stringify(gymSession));
}

function clearSessionProgress() {
  localStorage.removeItem("inProgressGymSession");
}

function editGymSession(match) {
  gymSession = {
    editingMatchId: match.id,
    type: match.type,
    sets: match.sets.map(s => ({ ...s }))
  };
  openScreen("Edit session");
  renderGymSets();
}