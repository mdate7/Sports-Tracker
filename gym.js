let gymSession = null; // { type, sets: [set, ...], editingMatchId?, repeatedFrom? }
// set = { exercise, muscleGroup, measure: "reps" | "time", weight, reps, rounds,
//         duration (seconds), distance (km) }. Unused fields stay "".

const GYM_TYPES = [
  { id: "strength", label: "Strength" },
  { id: "hiit", label: "HIIT" },
  { id: "class", label: "Class" },
  { id: "cardio", label: "Cardio" }
];
const gymTypeLabel = (id) => GYM_TYPES.find(t => t.id === id)?.label || id || "Session";

function blankGymSet(measure = "reps") {
  return { exercise: "", muscleGroup: "", measure, weight: "", reps: "", rounds: "", duration: "", distance: "" };
}

// "25" → 25 min, "25:30" → 25m30s, "1:05:00" → 1h5m. Returns seconds, or "" if unreadable.
function parseDuration(text) {
  const t = String(text || "").trim();
  if (!t) return "";
  const parts = t.split(":").map(Number);
  if (parts.some(n => !Number.isFinite(n) || n < 0)) return "";
  if (parts.length === 1) return Math.round(parts[0] * 60);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return "";
}

function formatDuration(seconds) {
  if (seconds === "" || seconds === null || seconds === undefined) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const sec = String(seconds % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

// One line describing a set, used on the feed, detail screen and repeat list.
function describeGymSet(s) {
  if (s.measure === "time") {
    const bits = [];
    if (s.duration) bits.push(formatDuration(s.duration));
    if (s.distance) bits.push(`${Number(s.distance).toLocaleString("en-GB", { maximumFractionDigits: 2 })} km`);
    return bits.join(" · ") || "Time / distance";
  }
  return `${s.weight || 0}kg × ${s.reps || 0} reps${s.rounds && s.rounds > 1 ? ` × ${s.rounds} rounds` : ""}`;
}

function getDistinctGymValues(key) {
  const values = matches
    .filter(m => m.sport === "gym")
    .flatMap(m => m.sets || [])
    .map(s => s[key])
    .filter(Boolean);
  return [...new Set(values)];
}

// How an exercise was measured last time, so typing "Rowing" flips the set
// to time/distance without being asked.
function lastMeasureFor(exercise) {
  const name = String(exercise || "").trim().toLowerCase();
  if (!name) return null;
  const sessions = matches.filter(m => m.sport === "gym").sort((x, y) => (y.date || "").localeCompare(x.date || ""));
  for (const m of sessions) {
    const hit = (m.sets || []).find(s => (s.exercise || "").trim().toLowerCase() === name);
    if (hit) return hit.measure || "reps";
  }
  return null;
}

function copySetsForRepeat(sets) {
  return (sets || []).map(s => ({ ...blankGymSet(s.measure || "reps"), ...s, measure: s.measure || "reps" }));
}

function buildGymSetup() {
  const recent = matches
    .filter(m => m.sport === "gym" && (m.sets || []).length)
    .sort((x, y) => (y.date || "").localeCompare(x.date || ""))
    .slice(0, 5);

  const recentHtml = recent.map(m => {
    const exercises = [...new Set(m.sets.map(s => s.exercise).filter(Boolean))];
    return `
      <button type="button" class="repeat-row" data-repeat-session="${m.id}">
        <span class="repeat-row__main">
          <span class="repeat-row__title">${escapeHtml(gymTypeLabel(m.type))} <span class="label">${m.date ? formatFixtureDate(m.date) : ""}</span></span>
          <span class="repeat-row__meta">${escapeHtml(exercises.slice(0, 3).join(", ") || "No exercises named")}${exercises.length > 3 ? ` +${exercises.length - 3}` : ""} · ${m.sets.length} set${m.sets.length === 1 ? "" : "s"}</span>
        </span>
        <span class="chip" aria-hidden="true">Repeat</span>
      </button>
    `;
  }).join("");

  form.dataset.sport = "gym";
  form.innerHTML = `
    <p class="label">New session</p>
    <div class="chips" id="gym-type-rail" style="flex-wrap:wrap;margin-top:8px;">
      ${GYM_TYPES.map(t => `<button type="button" class="chip" data-gym-type="${t.id}" data-sport="gym" aria-pressed="false">${t.label}</button>`).join("")}
    </div>
    <button type="button" id="gym-start-btn" class="btn" style="margin-top:16px;">Start session</button>
    ${recent.length ? `
      <p class="label" style="margin-top:24px;">Or repeat a recent one</p>
      <p style="font:var(--t-body);color:var(--muted);margin:4px 0 8px;">Copies every exercise, weight and time in, ready to change.</p>
      <div class="card" id="gym-repeat-list" style="padding-top:4px;padding-bottom:4px;">${recentHtml}</div>
    ` : ""}
  `;

  document.getElementById("gym-type-rail").addEventListener("click", (event) => {
    const chip = event.target.closest(".chip");
    if (!chip) return;
    document.querySelectorAll("#gym-type-rail .chip").forEach(c => c.setAttribute("aria-pressed", c === chip ? "true" : "false"));
  });

  document.getElementById("gym-start-btn").addEventListener("click", () => {
    const selected = document.querySelector('#gym-type-rail .chip[aria-pressed="true"]');
    if (!selected) {
      alert("Pick a session type first.");
      return;
    }
    const type = selected.dataset.gymType;
    gymSession = { type, sets: [blankGymSet(type === "cardio" ? "time" : "reps")] };
    saveSessionProgress();
    renderGymSets();
  });

  document.getElementById("gym-repeat-list")?.addEventListener("click", (event) => {
    const row = event.target.closest("[data-repeat-session]");
    if (!row) return;
    const match = matches.find(m => m.id === row.dataset.repeatSession);
    if (match) startRepeatSession(match);
  });
}

function startRepeatSession(match) {
  gymSession = {
    type: match.type,
    sets: copySetsForRepeat(match.sets),
    repeatedFrom: match.date || null
  };
  saveSessionProgress();
  renderGymSets();
}

// From a past session's detail screen. Doesn't silently throw away a session
// that's already in progress.
function repeatGymSession(match) {
  if (localStorage.getItem("inProgressGymSession")) {
    const replace = confirm("You already have a gym session in progress. Replace it with a copy of this one?");
    if (!replace) return;
  }
  setView("gym");
  openScreen("Log a session");
  startRepeatSession(match);
}

function renderGymSets() {
  const exerciseOptions = getDistinctGymValues("exercise")
    .map(v => `<option value="${escapeHtml(v)}"></option>`).join("");
  const muscleOptions = getDistinctGymValues("muscleGroup")
    .map(v => `<option value="${escapeHtml(v)}"></option>`).join("");

  const measureFields = (set, index) => set.measure === "time" ? `
      <div style="display:flex; gap:8px;">
        <div class="field" style="flex:1;">
          <label class="label" for="set-duration-${index}">Time</label>
          <input type="text" inputmode="decimal" id="set-duration-${index}" value="${escapeHtml(formatDuration(set.duration))}" placeholder="mm:ss">
        </div>
        <div class="field" style="flex:1;">
          <label class="label" for="set-distance-${index}">Distance (km)</label>
          <input type="number" inputmode="decimal" step="0.01" id="set-distance-${index}" value="${set.distance}">
        </div>
      </div>` : `
      <div style="display:flex; gap:8px;">
        <div class="field" style="flex:1;">
          <label class="label" for="set-weight-${index}">Weight</label>
          <input type="number" inputmode="decimal" id="set-weight-${index}" value="${set.weight}">
        </div>
        <div class="field" style="flex:1;">
          <label class="label" for="set-reps-${index}">Reps</label>
          <input type="number" inputmode="numeric" id="set-reps-${index}" value="${set.reps}">
        </div>
        <div class="field" style="flex:1;">
          <label class="label" for="set-rounds-${index}">Rounds</label>
          <input type="number" inputmode="numeric" id="set-rounds-${index}" value="${set.rounds}">
        </div>
      </div>`;

  const setsHtml = gymSession.sets.map((set, index) => `
    <div class="card gym-set" style="margin-bottom:10px;">
      <div class="card-head" style="align-items:center;">
        <p class="label">Set ${index + 1}</p>
        <div class="chips" role="group" aria-label="Measured by">
          <button type="button" class="chip chip--sm" data-set-measure="reps" data-i="${index}" aria-pressed="${set.measure !== "time"}">Reps</button>
          <button type="button" class="chip chip--sm" data-set-measure="time" data-i="${index}" aria-pressed="${set.measure === "time"}">Time / distance</button>
        </div>
      </div>
      <div class="field" style="margin-top:10px;">
        <label class="label" for="set-exercise-${index}">Exercise</label>
        <input type="text" id="set-exercise-${index}" data-exercise-i="${index}" value="${escapeHtml(set.exercise)}" list="exercise-options">
      </div>
      <div class="field">
        <label class="label" for="set-muscle-${index}">Muscle group</label>
        <input type="text" id="set-muscle-${index}" value="${escapeHtml(set.muscleGroup)}" list="muscle-options">
      </div>
      ${measureFields(set, index)}
      <button type="button" class="btn btn--ghost btn--sm" data-remove-set="${index}" style="margin-top:8px;">Remove set</button>
    </div>
  `).join("");

  form.dataset.sport = "gym";
  form.innerHTML = `
    <datalist id="exercise-options">${exerciseOptions}</datalist>
    <datalist id="muscle-options">${muscleOptions}</datalist>
    <p class="label">${sportNames.gym} · ${escapeHtml(gymTypeLabel(gymSession.type))}</p>
    ${gymSession.repeatedFrom ? `<p class="repeat-banner">Copied from ${formatFixtureDate(gymSession.repeatedFrom)}. Change anything that was different this time.</p>` : ""}
    <div id="gym-sets-list" style="margin-top:10px;">${setsHtml || `<p class="empty-state">No sets yet.</p>`}</div>
    <button type="button" id="gym-add-set-btn" class="btn btn--ghost" style="margin-top:8px;">+ Add set</button>
    <button type="button" id="gym-finish-btn" class="btn" style="margin-top:16px;">Finish session</button>
  `;

  const persist = () => { if (!gymSession.editingMatchId) saveSessionProgress(); };

  // New sets start as a copy of the one above (same exercise, weight, time),
  // since most sets repeat the last one with a small change.
  document.getElementById("gym-add-set-btn").addEventListener("click", () => {
    saveGymSetInputs();
    const last = gymSession.sets[gymSession.sets.length - 1];
    gymSession.sets.push(last ? { ...last } : blankGymSet(gymSession.type === "cardio" ? "time" : "reps"));
    persist();
    renderGymSets();
  });

  form.querySelectorAll("[data-remove-set]").forEach(btn => {
    btn.addEventListener("click", () => {
      saveGymSetInputs();
      gymSession.sets.splice(Number(btn.dataset.removeSet), 1);
      persist();
      renderGymSets();
    });
  });

  form.querySelectorAll("[data-set-measure]").forEach(btn => {
    btn.addEventListener("click", () => {
      saveGymSetInputs();
      gymSession.sets[Number(btn.dataset.i)].measure = btn.dataset.setMeasure;
      persist();
      renderGymSets();
    });
  });

  form.querySelectorAll("[data-exercise-i]").forEach(input => {
    input.addEventListener("change", () => {
      const i = Number(input.dataset.exerciseI);
      saveGymSetInputs();
      const set = gymSession.sets[i];
      const usual = lastMeasureFor(set.exercise);
      const untouched = set.measure === "time" ? !set.duration && !set.distance : !set.weight && !set.reps && !set.rounds;
      if (usual && usual !== set.measure && untouched) {
        set.measure = usual;
        persist();
        renderGymSets();
        document.getElementById(usual === "time" ? `set-duration-${i}` : `set-weight-${i}`)?.focus();
      } else {
        persist();
      }
    });
  });

  document.getElementById("gym-finish-btn").addEventListener("click", () => {
    saveGymSetInputs();
    const unreadable = gymSession.sets.findIndex((s, i) =>
      s.measure === "time" && document.getElementById(`set-duration-${i}`)?.value.trim() && s.duration === "");
    if (unreadable !== -1) {
      const input = document.getElementById(`set-duration-${unreadable}`);
      input.focus();
      alert("That time doesn't look right. Use minutes (25) or mm:ss (25:30).");
      return;
    }
    finishGymSession();
  });
}

function saveGymSetInputs() {
  const val = (id) => document.getElementById(id)?.value ?? "";
  gymSession.sets.forEach((set, index) => {
    set.exercise = val(`set-exercise-${index}`).trim();
    set.muscleGroup = val(`set-muscle-${index}`).trim();
    // Only the visible fields are read, so switching a set between reps and
    // time keeps whatever was typed in the other mode until it's saved.
    if (set.measure === "time") {
      set.duration = parseDuration(val(`set-duration-${index}`));
      set.distance = val(`set-distance-${index}`) !== "" ? Number(val(`set-distance-${index}`)) : "";
    } else {
      set.weight = val(`set-weight-${index}`) !== "" ? Number(val(`set-weight-${index}`)) : "";
      set.reps = Number(val(`set-reps-${index}`)) || "";
      set.rounds = Number(val(`set-rounds-${index}`)) || "";
    }
  });
}

// What gets written to gym_sets. A set stores only the fields for its measure,
// so a set switched from reps to time doesn't keep stale weights.
function gymSetRow(set, index, matchId) {
  const isTime = set.measure === "time";
  const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));
  return {
    match_id: matchId,
    set_number: index + 1,
    exercise: set.exercise,
    muscle_group: set.muscleGroup,
    measure: isTime ? "time" : "reps",
    weight: isTime ? null : num(set.weight),
    reps: isTime ? null : num(set.reps),
    rounds: isTime ? null : num(set.rounds),
    duration_seconds: isTime ? num(set.duration) : null,
    distance_m: isTime && set.distance !== "" ? Math.round(Number(set.distance) * 1000) : null
  };
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
      <input type="text" id="gym-notes" value="${escapeHtml(existing?.notes)}">
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
      // An edit can't be rolled back, so say exactly what didn't save and leave
      // the screen open so they can try again, instead of failing silently.
      if (detailError) {
        console.error("Failed to update gym details:", detailError);
        alert("The session's date and notes saved, but the session type didn't. Try saving again.");
        return;
      }

      const { error: deleteSetsError } = await supabaseClient.from("gym_sets").delete().eq("match_id", matchId);
      if (deleteSetsError) {
        console.error("Failed to clear old sets:", deleteSetsError);
        alert("The session saved, but the sets couldn't be updated. Try saving again.");
        return;
      }

      const setRows = gymSession.sets.map((set, index) => gymSetRow(set, index, matchId));
      const { error: setsError } = await supabaseClient.from("gym_sets").insert(setRows);
      if (setsError) {
        console.error("Failed to save updated sets:", setsError);
        alert("The session saved, but the sets didn't. Try saving again.");
        return;
      }

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

      const setRows = gymSession.sets.map((set, index) => gymSetRow(set, index, matchRow.id));
      const { error: setsError } = detailError
        ? { error: null }
        : await supabaseClient.from("gym_sets").insert(setRows);

      // A matches row without its gym_details/sets is what used to break the
      // feed. Undo the half-save (child rows go with it) and keep the session in
      // progress so nothing typed is lost.
      if (detailError || setsError) {
        console.error("Failed to save session details:", detailError || setsError);
        await supabaseClient.from("matches").delete().eq("id", matchRow.id);
        alert("Something went wrong saving this session, so nothing was saved. Your sets are still here; try again.");
        return;
      }

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
    sets: copySetsForRepeat(match.sets)
  };
  openScreen("Edit session");
  renderGymSets();
}