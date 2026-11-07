let gymSession = null; // { type, name, sets: [set, ...], editingMatchId?, repeatedFrom? }
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
    if (s.rounds && s.rounds > 1) bits.push(`${s.rounds} rounds`);
    return bits.join(" · ") || "Time / distance";
  }
  return `${s.weight || 0}kg × ${s.reps || 0} reps${s.rounds && s.rounds > 1 ? ` × ${s.rounds} rounds` : ""}`;
}

// Muscle groups in the order they were first trained, ignoring case and blanks.
function gymMuscleGroups(sets) {
  const seen = new Map();
  (sets || []).forEach(s => {
    const g = String(s.muscleGroup || "").trim();
    if (g && !seen.has(g.toLowerCase())) seen.set(g.toLowerCase(), g[0].toUpperCase() + g.slice(1));
  });
  return [...seen.values()];
}

// What a session is called everywhere: its name if it has one, otherwise the
// muscle groups trained, otherwise just the type.
function gymSessionTitle(session) {
  const name = String(session.sessionName ?? session.name ?? "").trim();
  if (name) return name;
  const groups = gymMuscleGroups(session.sets);
  if (groups.length) return groups.slice(0, 3).join(" · ") + (groups.length > 3 ? ` +${groups.length - 3}` : "");
  return gymTypeLabel(session.type);
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
  // Most recent first. A named session (e.g. "Push day") appears once, as its
  // latest version, so a regular routine doesn't fill the whole list.
  const seenNames = new Set();
  const recent = matches
    .filter(m => m.sport === "gym" && (m.sets || []).length)
    .sort((x, y) => (y.date || "").localeCompare(x.date || ""))
    .filter(m => {
      const name = String(m.sessionName || "").trim().toLowerCase();
      if (!name) return true;
      if (seenNames.has(name)) return false;
      seenNames.add(name);
      return true;
    })
    .slice(0, 5);

  const recentHtml = recent.map(m => `
      <button type="button" class="repeat-row" data-repeat-session="${m.id}">
        <span class="repeat-row__main">
          <span class="repeat-row__title">${escapeHtml(gymSessionTitle(m))}</span>
          <span class="repeat-row__meta">${m.date ? formatFixtureDate(m.date) : ""} · ${m.sets.length} set${m.sets.length === 1 ? "" : "s"} · ${escapeHtml(gymTypeLabel(m.type))}</span>
        </span>
        <span class="chip" aria-hidden="true">Repeat</span>
      </button>
    `).join("");

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
    gymSession = { type, name: "", sets: [blankGymSet(type === "cardio" ? "time" : "reps")] };
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
    name: match.sessionName || "",
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
  const nameOptions = [...new Set(matches.filter(m => m.sport === "gym").map(m => String(m.sessionName || "").trim()).filter(Boolean))]
    .map(v => `<option value="${escapeHtml(v)}"></option>`).join("");
  const groups = gymMuscleGroups(gymSession.sets);

  const measureFields = (set, index) => set.measure === "time" ? `
      <div class="set-numbers">
        <div class="field" style="flex:1;">
          <label class="label" for="set-duration-${index}">Time</label>
          <input type="text" inputmode="decimal" id="set-duration-${index}" value="${escapeHtml(formatDuration(set.duration))}" placeholder="mm:ss">
        </div>
        <div class="field" style="flex:1;">
          <label class="label" for="set-distance-${index}">Distance (km)</label>
          <input type="number" inputmode="decimal" step="0.01" id="set-distance-${index}" value="${set.distance}">
        </div>
        <div class="field" style="flex:1;">
          <label class="label" for="set-rounds-${index}">Rounds</label>
          <input type="number" inputmode="numeric" id="set-rounds-${index}" value="${set.rounds}">
        </div>
      </div>` : `
      <div class="set-numbers">
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
    <datalist id="session-name-options">${nameOptions}</datalist>
    <p class="label">${sportNames.gym} · ${escapeHtml(gymTypeLabel(gymSession.type))}</p>
    <div class="field" style="margin-top:10px;">
      <label class="label" for="gym-session-name">Session name (optional)</label>
      <input type="text" id="gym-session-name" maxlength="60" list="session-name-options" value="${escapeHtml(gymSession.name)}" placeholder="${escapeHtml(groups.length ? groups.slice(0, 3).join(" · ") : "e.g. Push day")}">
    </div>
    ${gymSession.repeatedFrom ? `<p class="repeat-banner">Copied from ${formatFixtureDate(gymSession.repeatedFrom)}. Change anything that was different this time.</p>` : ""}
    <div id="gym-sets-list" style="margin-top:10px;">${setsHtml || `<p class="empty-state">No sets yet.</p>`}</div>
    <div class="gym-add-row">
      <button type="button" id="gym-add-set-btn" class="btn btn--ghost">+ Add set</button>
      <button type="button" id="gym-timer-btn" class="btn btn--ghost">⏱ Timer</button>
    </div>
    <button type="button" id="gym-finish-btn" class="btn" style="margin-top:16px;">Finish session</button>
  `;

  const persist = () => { if (!gymSession.editingMatchId) saveSessionProgress(); };
  showRestBar();

  document.getElementById("gym-session-name").addEventListener("change", (event) => {
    gymSession.name = event.target.value.trim();
    persist();
  });

  document.getElementById("gym-timer-btn").addEventListener("click", () => {
    saveGymSetInputs();
    persist();
    openGymTimerSheet();
  });

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
  if (document.getElementById("gym-session-name")) gymSession.name = val("gym-session-name").trim();
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
    }
    set.rounds = Number(val(`set-rounds-${index}`)) || "";
  });
}

// --- Rest timer ---------------------------------------------------------------
// A bar pinned to the bottom of the sets screen. It lives outside the form
// (which is rebuilt on every edit) and counts down from a fixed end time, so
// re-renders and switching apps don't lose it.
const REST_PRESETS = [60, 90, 120, 180];
const rest = { endAt: null, duration: null, interval: null, doneTimer: null, audio: null };

function restBarEl() {
  let bar = document.getElementById("rest-timer");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "rest-timer";
    bar.className = "rest-bar";
    bar.setAttribute("role", "timer");
    bar.hidden = true;
    document.body.appendChild(bar);
    bar.addEventListener("click", onRestBarClick);
    document.addEventListener("visibilitychange", () => { if (rest.endAt) tickRest(); });
  }
  return bar;
}

function lastRestPreset() {
  try { return Number(localStorage.getItem("gymRestSeconds")) || 90; } catch (e) { return 90; }
}

function showRestBar() {
  const bar = restBarEl();
  bar.hidden = false;
  document.body.classList.add("rest-bar-on");
  paintRest();
}

function hideRestBar() {
  const bar = document.getElementById("rest-timer");
  if (bar) bar.hidden = true;
  document.body.classList.remove("rest-bar-on");
}

function paintRest(state) {
  const bar = restBarEl();
  if (state === "done") {
    bar.dataset.state = "done";
    bar.innerHTML = `
      <span class="rest-bar__done">Rest over, go again</span>
      <button type="button" class="chip" data-rest-start="${rest.duration}">Again</button>
      <button type="button" class="chip" data-rest-dismiss>OK</button>`;
    return;
  }
  if (rest.endAt) {
    const left = Math.max(0, Math.ceil((rest.endAt - Date.now()) / 1000));
    const pct = rest.duration ? Math.min(100, 100 * (1 - left / rest.duration)) : 0;
    bar.dataset.state = "running";
    bar.innerHTML = `
      <span class="rest-bar__time num" aria-live="off">${formatDuration(left)}</span>
      <span class="rest-bar__track" aria-hidden="true"><i style="width:${pct}%"></i></span>
      <button type="button" class="chip" data-rest-add="15" aria-label="Add 15 seconds">+15s</button>
      <button type="button" class="chip" data-rest-stop>Stop</button>`;
    return;
  }
  const last = lastRestPreset();
  bar.dataset.state = "idle";
  bar.innerHTML = `
    <span class="label">Rest</span>
    <span class="rest-bar__presets">
      ${REST_PRESETS.map(s => `<button type="button" class="chip" data-rest-start="${s}" aria-pressed="${s === last}" aria-label="Start a ${formatDuration(s)} rest">${formatDuration(s)}</button>`).join("")}
    </span>`;
}

function startRest(seconds) {
  clearTimeout(rest.doneTimer);
  rest.duration = seconds;
  rest.endAt = Date.now() + seconds * 1000;
  try { localStorage.setItem("gymRestSeconds", String(seconds)); } catch (e) { /* fine */ }
  unlockGymAudio();
  clearInterval(rest.interval);
  rest.interval = setInterval(tickRest, 250);
  paintRest();
}

function stopRest() {
  clearInterval(rest.interval);
  rest.endAt = null;
  paintRest();
}

function tickRest() {
  if (!rest.endAt) return;
  if (Date.now() >= rest.endAt) {
    clearInterval(rest.interval);
    rest.endAt = null;
    restDone();
    return;
  }
  const bar = document.getElementById("rest-timer");
  if (!bar || bar.hidden) return;
  const left = Math.max(0, Math.ceil((rest.endAt - Date.now()) / 1000));
  const time = bar.querySelector(".rest-bar__time");
  const fill = bar.querySelector(".rest-bar__track i");
  if (time) time.textContent = formatDuration(left);
  if (fill) fill.style.width = `${Math.min(100, 100 * (1 - left / rest.duration))}%`;
}

function restDone() {
  paintRest("done");
  // Buzz where the phone supports it (Android); beep everywhere else too.
  try { navigator.vibrate?.([300, 120, 300]); } catch (e) { /* not supported */ }
  gymBeep([[880, 0], [880, 0.28]]);
  rest.doneTimer = setTimeout(() => { if (!rest.endAt) paintRest(); }, 8000);
}

// Sound needs to be unlocked by a tap, so this runs when a timer is started
// rather than when it ends.
function unlockGymAudio() {
  try {
    rest.audio = rest.audio || new (window.AudioContext || window.webkitAudioContext)();
    rest.audio.resume?.();
  } catch (e) { rest.audio = null; }
}

// notes: [[frequency, offset seconds, length seconds?], ...]
function gymBeep(notes) {
  try {
    const ctx = rest.audio;
    if (!ctx || document.visibilityState !== "visible") return;
    notes.forEach(([freq, offset, len = 0.2]) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      const t = ctx.currentTime + offset;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + len + 0.02);
    });
  } catch (e) { /* sound is a nice-to-have */ }
}

function onRestBarClick(event) {
  const start = event.target.closest("[data-rest-start]");
  if (start) { startRest(Number(start.dataset.restStart)); return; }
  const add = event.target.closest("[data-rest-add]");
  if (add && rest.endAt) {
    rest.endAt += Number(add.dataset.restAdd) * 1000;
    rest.duration += Number(add.dataset.restAdd);
    tickRest();
    return;
  }
  if (event.target.closest("[data-rest-stop]")) { stopRest(); return; }
  if (event.target.closest("[data-rest-dismiss]")) { clearTimeout(rest.doneTimer); paintRest(); }
}

// --- Workout timer: intervals, AMRAP, stopwatch --------------------------------
// A full-screen timer for timed work (core circuits, AMRAPs, plank holds), as
// opposed to the rest bar between sets. Like the rest bar it runs off a start
// time rather than counting ticks, so switching apps or locking the phone
// doesn't make it drift. When it ends, what was done is added to the session as
// time sets, which can be edited like any other set before saving.
const GYM_TIMER_LEAD = 5; // seconds of "get ready" before intervals and AMRAP
const gymTimer = { cfg: null, startedAt: 0, pausedAt: 0, pausedMs: 0, count: 0, key: "", beeped: "", ticker: null, finished: false };

function loadGymTimerCfg() {
  const defaults = { mode: "intervals", work: 45, rest: 15, rounds: 8, exercises: "", minutes: 12, name: "", muscle: "" };
  try { return { ...defaults, ...JSON.parse(localStorage.getItem("gymTimerCfg") || "{}") }; } catch (e) { return defaults; }
}

function gymTimerSheetEl() {
  let sheet = document.getElementById("gym-timer-sheet");
  if (!sheet) {
    sheet = document.createElement("div");
    sheet.id = "gym-timer-sheet";
    sheet.className = "sheet";
    sheet.hidden = true;
    sheet.dataset.sport = "gym";
    document.body.appendChild(sheet);
    // One listener for the life of the page; the contents are redrawn freely.
    sheet.addEventListener("click", onGymTimerSheetClick);
  }
  return sheet;
}

function openGymTimerSheet() {
  const sheet = gymTimerSheetEl();
  paintGymTimerSheet(loadGymTimerCfg());
  sheet.hidden = false;
  requestAnimationFrame(() => sheet.classList.add("is-open"));
}

function closeGymTimerSheet() {
  const sheet = document.getElementById("gym-timer-sheet");
  if (!sheet) return;
  sheet.classList.remove("is-open");
  sheet.hidden = true;
}

function paintGymTimerSheet(cfg) {
  const sheet = gymTimerSheetEl();
  const field = (id, label, value, attrs = "") => `
    <div class="field">
      <label class="label" for="${id}">${label}</label>
      <input id="${id}" value="${escapeHtml(value)}" ${attrs}>
    </div>`;
  const muscleOptions = getDistinctGymValues("muscleGroup").map(v => `<option value="${escapeHtml(v)}"></option>`).join("");
  const modeFields = {
    intervals: `
      <div class="set-numbers">
        ${field("gt-work", "Work (sec)", cfg.work, 'type="number" inputmode="numeric" min="1"')}
        ${field("gt-rest", "Rest (sec)", cfg.rest, 'type="number" inputmode="numeric" min="0"')}
        ${field("gt-rounds", "Rounds", cfg.rounds, 'type="number" inputmode="numeric" min="1"')}
      </div>
      ${field("gt-exercises", "Exercises (optional, in order)", cfg.exercises, 'type="text" placeholder="e.g. Plank, Crunches, Mountain climbers"')}
      <p class="gt-hint">A round is once through the list. Leave it blank for plain on/off intervals.</p>`,
    amrap: `
      ${field("gt-minutes", "Minutes", cfg.minutes, 'type="number" inputmode="numeric" min="1"')}
      ${field("gt-name", "Name (optional)", cfg.name, 'type="text" placeholder="AMRAP"')}
      <p class="gt-hint">Tap the big button each time you finish a round.</p>`,
    stopwatch: `
      ${field("gt-name", "Exercise", cfg.name, 'type="text" placeholder="e.g. Plank" list="exercise-options"')}
      <p class="gt-hint">Counts up until you stop it. Good for holds.</p>`
  }[cfg.mode];
  sheet.innerHTML = `
    <div class="sheet__backdrop" data-gt-close></div>
    <div class="sheet__panel" role="dialog" aria-modal="true" aria-labelledby="gt-sheet-title">
      <div class="sheet__head">
        <h2 id="gt-sheet-title" class="sheet__title">Timer</h2>
        <button type="button" class="btn btn--ghost btn--sm" data-gt-close>Close</button>
      </div>
      <div class="sheet__body">
        <div class="chips gt-modes" role="group" aria-label="Timer type">
          ${[["intervals", "Intervals"], ["amrap", "AMRAP"], ["stopwatch", "Stopwatch"]].map(([id, label]) =>
            `<button type="button" class="chip" data-gt-mode="${id}" aria-pressed="${cfg.mode === id}">${label}</button>`).join("")}
        </div>
        ${modeFields}
        <datalist id="gt-muscle-options">${muscleOptions}</datalist>
        ${field("gt-muscle", "Muscle group (optional)", cfg.muscle, 'type="text" list="gt-muscle-options" placeholder="e.g. Core"')}
        <p class="gt-error" id="gt-error" role="alert"></p>
        <button type="button" class="btn" data-gt-start>Start</button>
      </div>
    </div>`;
}

// What's typed in the sheet, merged over the saved settings.
function readGymTimerSheet() {
  const cfg = loadGymTimerCfg();
  const sheet = gymTimerSheetEl();
  cfg.mode = sheet.querySelector('[data-gt-mode][aria-pressed="true"]')?.dataset.gtMode || cfg.mode;
  const v = (id) => document.getElementById(id)?.value;
  const int = (id) => Math.round(Number(v(id)));
  if (v("gt-work") !== undefined) { cfg.work = int("gt-work"); cfg.rest = int("gt-rest"); cfg.rounds = int("gt-rounds"); cfg.exercises = v("gt-exercises").trim(); }
  if (v("gt-minutes") !== undefined) cfg.minutes = Number(v("gt-minutes"));
  if (v("gt-name") !== undefined) cfg.name = v("gt-name").trim();
  cfg.muscle = (v("gt-muscle") || "").trim();
  return cfg;
}

function saveGymTimerCfg(cfg) {
  try { localStorage.setItem("gymTimerCfg", JSON.stringify(cfg)); } catch (e) { /* settings just won't stick */ }
}

function onGymTimerSheetClick(event) {
  if (event.target.closest("[data-gt-close]")) { closeGymTimerSheet(); return; }
  const mode = event.target.closest("[data-gt-mode]");
  if (mode) {
    const cfg = readGymTimerSheet();
    cfg.mode = mode.dataset.gtMode;
    saveGymTimerCfg(cfg);
    paintGymTimerSheet(cfg);
    return;
  }
  if (event.target.closest("[data-gt-start]")) {
    const cfg = readGymTimerSheet();
    const problem =
      cfg.mode === "intervals" && !(cfg.work >= 1 && cfg.rest >= 0 && cfg.rounds >= 1) ? "Work and rounds need to be at least 1." :
      cfg.mode === "amrap" && !(cfg.minutes > 0) ? "Set how many minutes." : "";
    if (problem) { document.getElementById("gt-error").textContent = problem; return; }
    saveGymTimerCfg(cfg);
    closeGymTimerSheet();
    startGymTimer(cfg);
  }
}

function gymTimerExercises(cfg) {
  return String(cfg.exercises || "").split(/[,\n]/).map(s => s.trim()).filter(Boolean);
}

// A round is once through the exercise list, so 3 exercises x 4 rounds is
// 12 work intervals. With no list, each interval is a round.
function gymIntervalCount(cfg) {
  return cfg.rounds * Math.max(1, gymTimerExercises(cfg).length);
}

function gymTimerEl() {
  let el = document.getElementById("gym-timer");
  if (!el) {
    el = document.createElement("div");
    el.id = "gym-timer";
    el.className = "gym-timer";
    el.dataset.sport = "gym";
    el.setAttribute("role", "timer");
    el.hidden = true;
    document.body.appendChild(el);
    el.addEventListener("click", onGymTimerClick);
    document.addEventListener("visibilitychange", () => { if (gymTimer.cfg && !gymTimer.finished) tickGymTimer(); });
  }
  return el;
}

function startGymTimer(cfg) {
  unlockGymAudio();
  Object.assign(gymTimer, { cfg, startedAt: Date.now(), pausedAt: 0, pausedMs: 0, count: 0, key: "", beeped: "", finished: false });
  const el = gymTimerEl();
  el.hidden = false;
  document.body.classList.add("gym-timer-on");
  clearInterval(gymTimer.ticker);
  gymTimer.ticker = setInterval(tickGymTimer, 200);
  tickGymTimer();
}

function gymTimerElapsed() {
  const now = gymTimer.pausedAt || Date.now();
  return Math.max(0, (now - gymTimer.startedAt - gymTimer.pausedMs) / 1000);
}

// Where the timer is at a given number of seconds in. Pure, so it can be
// recomputed from scratch after the phone has been asleep.
function gymTimerState(cfg, elapsed, count) {
  if (cfg.mode === "stopwatch") return { phase: "go", shown: Math.floor(elapsed), progress: null, done: false };
  const t = elapsed - GYM_TIMER_LEAD;
  if (t < 0) return { phase: "ready", shown: Math.ceil(-t), progress: 1 - (-t / GYM_TIMER_LEAD), done: false, left: Math.ceil(-t) };
  if (cfg.mode === "amrap") {
    const total = cfg.minutes * 60;
    if (t >= total) return { phase: "done", done: true };
    return { phase: "work", shown: Math.ceil(total - t), progress: t / total, left: Math.ceil(total - t), done: false, count };
  }
  const cycle = cfg.work + cfg.rest;
  const n = gymIntervalCount(cfg);
  const total = n * cfg.work + (n - 1) * cfg.rest;
  if (t >= total) return { phase: "done", done: true };
  const round = Math.floor(t / cycle);
  const within = t - round * cycle;
  const working = within < cfg.work;
  const phaseLeft = working ? cfg.work - within : cycle - within;
  const phaseLen = working ? cfg.work : cfg.rest;
  return { phase: working ? "work" : "rest", round, shown: Math.ceil(phaseLeft), left: Math.ceil(phaseLeft), progress: 1 - phaseLeft / phaseLen, done: false };
}

// Work intervals finished by `elapsed`, as a count per position in the list.
function gymIntervalsDone(cfg, elapsed) {
  const t = Math.max(0, elapsed - GYM_TIMER_LEAD);
  const cycle = cfg.work + cfg.rest;
  let done = 0;
  for (let i = 0, n = gymIntervalCount(cfg); i < n; i++) if (t >= i * cycle + cfg.work) done++;
  return done;
}

function tickGymTimer() {
  const cfg = gymTimer.cfg;
  if (!cfg || gymTimer.finished) return;
  const elapsed = gymTimerElapsed();
  const st = gymTimerState(cfg, elapsed, gymTimer.count);
  if (st.done) { finishGymTimer(false); return; }

  // Beeps: short pips for the last three seconds of a phase, a long one when
  // work starts, a low double when rest starts.
  const key = `${st.phase}:${st.round ?? ""}`;
  if (!gymTimer.pausedAt) {
    if (key !== gymTimer.key && gymTimer.key) {
      if (st.phase === "work") gymBeep([[990, 0, 0.45]]);
      else if (st.phase === "rest") gymBeep([[520, 0], [520, 0.25]]);
      if (st.phase !== "ready") try { navigator.vibrate?.(st.phase === "work" ? 400 : [150, 100, 150]); } catch (e) { /* fine */ }
    }
    const pip = `${key}:${st.left}`;
    if (st.left && st.left <= 3 && st.phase !== "go" && gymTimer.beeped !== pip) {
      gymTimer.beeped = pip;
      gymBeep([[660, 0, 0.1]]);
    }
  }
  if (key !== gymTimer.key || gymTimer.pausedChanged) {
    gymTimer.key = key;
    gymTimer.pausedChanged = false;
    paintGymTimer(st);
  }
  const el = document.getElementById("gym-timer");
  const time = el?.querySelector(".gt__time");
  const fill = el?.querySelector(".gt__track i");
  if (time) time.textContent = formatDuration(st.shown);
  if (fill && st.progress !== null) fill.style.width = `${Math.min(100, st.progress * 100)}%`;
}

function paintGymTimer(st) {
  const cfg = gymTimer.cfg;
  const el = gymTimerEl();
  const exercises = gymTimerExercises(cfg);
  const paused = Boolean(gymTimer.pausedAt);
  el.dataset.phase = st.phase;
  const exAt = (i) => exercises.length ? exercises[i % exercises.length] : "";
  let heading = "", eyebrow = "", sub = "", next = "", big = "";
  if (cfg.mode === "intervals") {
    const i = st.phase === "ready" ? 0 : st.round; // which work interval
    const per = Math.max(1, exercises.length);
    const total = gymIntervalCount(cfg);
    heading = `Intervals · ${cfg.work}s on / ${cfg.rest}s off`;
    eyebrow = { ready: "Get ready", work: "Work", rest: "Rest" }[st.phase];
    sub = st.phase === "rest" ? (exAt(i + 1) ? `Next: ${exAt(i + 1)}` : "Rest") : (exAt(i) || (st.phase === "work" ? "Go" : `${cfg.work}s on`));
    next = `Round ${Math.floor(i / per) + 1} of ${cfg.rounds}` + (exercises.length > 1 ? ` · ${(i % per) + 1} of ${per}` : "") +
      (st.phase === "work" && i + 1 < total && cfg.rest ? ` · then ${cfg.rest}s rest` : "");
  } else if (cfg.mode === "amrap") {
    heading = `AMRAP · ${cfg.minutes} min${cfg.name ? ` · ${cfg.name}` : ""}`;
    eyebrow = st.phase === "ready" ? "Get ready" : "Time left";
    sub = cfg.name || "AMRAP";
    if (st.phase !== "ready") big = `
      <button type="button" class="gt__count" data-gt-round aria-label="Finished a round. ${gymTimer.count} so far">
        <span class="gt__count-n num">${gymTimer.count}</span>
        <span class="gt__count-l">rounds · tap +1</span>
      </button>
      <button type="button" class="chip" data-gt-undo ${gymTimer.count ? "" : "disabled"}>Undo</button>`;
  } else {
    heading = "Stopwatch";
    sub = cfg.name || "Hold";
  }
  el.innerHTML = `
    <div class="gt__top">
      <p class="label">${escapeHtml(heading)}</p>
    </div>
    <div class="gt__main">
      ${eyebrow ? `<p class="label gt__eyebrow">${paused ? "Paused" : eyebrow}</p>` : ""}
      <p class="gt__phase">${escapeHtml(paused && !eyebrow ? "Paused" : sub)}</p>
      <p class="gt__time num">${formatDuration(st.shown)}</p>
      ${st.progress === null ? "" : `<div class="gt__track" aria-hidden="true"><i></i></div>`}
      ${next ? `<p class="gt__next">${escapeHtml(next)}</p>` : ""}
      ${big}
    </div>
    <div class="gt__controls">
      <button type="button" class="btn btn--ghost" data-gt-pause>${paused ? "Resume" : "Pause"}</button>
      <button type="button" class="btn" data-gt-finish>${cfg.mode === "stopwatch" ? "Stop" : "Finish"}</button>
    </div>`;
}

// The sets this run adds to the session. Time is the total time worked, so
// session totals and Insights stay right; rounds says how many.
function gymTimerSets(cfg, elapsed, count) {
  const muscleGroup = cfg.muscle || "";
  const set = (exercise, duration, rounds) => ({ ...blankGymSet("time"), exercise, muscleGroup, duration: Math.round(duration), rounds: rounds > 1 ? rounds : "" });
  if (cfg.mode === "stopwatch") {
    return elapsed >= 1 ? [set(cfg.name || "Hold", elapsed, 1)] : [];
  }
  if (cfg.mode === "amrap") {
    const worked = Math.min(cfg.minutes * 60, Math.max(0, elapsed - GYM_TIMER_LEAD));
    if (worked < 1) return [];
    const s = set(cfg.name || "AMRAP", worked, count);
    s.rounds = count || ""; // even 1 round is worth saying for an AMRAP
    return [s];
  }
  const done = gymIntervalsDone(cfg, elapsed);
  if (!done) return [];
  const exercises = gymTimerExercises(cfg);
  if (!exercises.length) return [set(`Intervals ${cfg.work}s on / ${cfg.rest}s off`, done * cfg.work, done)];
  // Same exercise typed twice is one set; order is the order they were done.
  const tally = new Map();
  for (let i = 0; i < done; i++) {
    const name = exercises[i % exercises.length];
    const k = name.toLowerCase();
    if (!tally.has(k)) tally.set(k, { name, n: 0 });
    tally.get(k).n++;
  }
  return [...tally.values()].map(({ name, n }) => set(name, n * cfg.work, n));
}

function finishGymTimer(early) {
  const cfg = gymTimer.cfg;
  if (!cfg) return;
  const elapsed = early ? gymTimerElapsed() : Infinity;
  gymTimer.finished = true;
  clearInterval(gymTimer.ticker);
  if (!early) {
    gymBeep([[990, 0, 0.15], [990, 0.22, 0.15], [1320, 0.44, 0.5]]);
    try { navigator.vibrate?.([300, 120, 300, 120, 500]); } catch (e) { /* fine */ }
  }
  const sets = gymTimerSets(cfg, elapsed, gymTimer.count);
  gymTimer.pending = sets;
  const el = gymTimerEl();
  el.dataset.phase = "done";
  el.innerHTML = `
    <div class="gt__main">
      <p class="gt__phase">${early ? "Stopped" : "Done"}</p>
      ${sets.length ? `
        <p class="gt__next">Add this to your session?</p>
        <div class="card gt__result">
          ${sets.map(s => `
            <div class="review-ex">
              <div class="review-ex__head">
                <span class="review-ex__name">${escapeHtml(s.exercise)}</span>
                ${s.muscleGroup ? `<span class="label">${escapeHtml(s.muscleGroup)}</span>` : ""}
              </div>
              <div class="review-ex__sets"><span class="set-pill num">${escapeHtml(describeGymSet(s))}</span></div>
            </div>`).join("")}
        </div>
        <p class="gt-hint">You can change anything on the sets screen before saving.</p>`
      : `<p class="gt__next">Nothing to log: no rounds were finished.</p>`}
    </div>
    <div class="gt__controls">
      <button type="button" class="btn btn--ghost" data-gt-discard>${sets.length ? "Don't add" : "Close"}</button>
      ${sets.length ? `<button type="button" class="btn" data-gt-add>Add ${sets.length === 1 ? "set" : `${sets.length} sets`}</button>` : ""}
    </div>`;
}

function closeGymTimer() {
  clearInterval(gymTimer.ticker);
  gymTimer.cfg = null;
  gymTimer.pending = null;
  const el = document.getElementById("gym-timer");
  if (el) { el.hidden = true; el.innerHTML = ""; }
  document.body.classList.remove("gym-timer-on");
  closeGymTimerSheet();
}

function onGymTimerClick(event) {
  if (event.target.closest("[data-gt-round]")) {
    gymTimer.count++;
    try { navigator.vibrate?.(40); } catch (e) { /* fine */ }
    const n = document.querySelector(".gt__count-n");
    if (n) n.textContent = gymTimer.count;
    const undo = document.querySelector("[data-gt-undo]");
    if (undo) undo.disabled = false;
    return;
  }
  if (event.target.closest("[data-gt-undo]")) {
    gymTimer.count = Math.max(0, gymTimer.count - 1);
    gymTimer.pausedChanged = true;
    tickGymTimer();
    return;
  }
  if (event.target.closest("[data-gt-pause]")) {
    if (gymTimer.pausedAt) { gymTimer.pausedMs += Date.now() - gymTimer.pausedAt; gymTimer.pausedAt = 0; }
    else gymTimer.pausedAt = Date.now();
    gymTimer.pausedChanged = true;
    tickGymTimer();
    return;
  }
  if (event.target.closest("[data-gt-finish]")) { finishGymTimer(true); return; }
  if (event.target.closest("[data-gt-discard]")) { closeGymTimer(); return; }
  if (event.target.closest("[data-gt-add]")) {
    const sets = gymTimer.pending || [];
    closeGymTimer();
    if (!gymSession) return;
    // A blank set left at the end (e.g. just tapped + Add set) is replaced
    // rather than left behind as an empty one.
    const last = gymSession.sets[gymSession.sets.length - 1];
    const blank = last && !last.exercise && !last.weight && !last.reps && !last.duration && !last.distance;
    if (blank) gymSession.sets.pop();
    gymSession.sets.push(...sets);
    if (!gymSession.editingMatchId) saveSessionProgress();
    renderGymSets();
    document.getElementById(`set-exercise-${gymSession.sets.length - sets.length}`)?.scrollIntoView({ block: "center" });
  }
}

// --- Review ------------------------------------------------------------------

// Exercises in the order first done, each with its sets, plus anything that
// looks unfinished, for the review step before saving.
function summariseGymSession(sets) {
  const byExercise = [];
  const problems = [];
  sets.forEach((s, i) => {
    const name = String(s.exercise || "").trim();
    if (!name) problems.push({ i, text: `Set ${i + 1} has no exercise name` });
    const empty = s.measure === "time" ? !s.duration && !s.distance : !s.reps;
    if (empty) problems.push({ i, text: `Set ${i + 1}${name ? ` (${name})` : ""} has no ${s.measure === "time" ? "time or distance" : "reps"}` });
    const key = name.toLowerCase() || `__unnamed${i}`;
    let group = byExercise.find(g => g.key === key);
    if (!group) { group = { key, name: name || "Unnamed", muscle: s.muscleGroup, sets: [] }; byExercise.push(group); }
    group.sets.push(s);
  });
  const volume = sets.reduce((sum, s) => sum + (s.measure !== "time" ? (Number(s.weight) || 0) * (Number(s.reps) || 0) * (Number(s.rounds) || 1) : 0), 0);
  const seconds = sets.reduce((sum, s) => sum + (s.measure === "time" ? Number(s.duration) || 0 : 0), 0);
  const km = sets.reduce((sum, s) => sum + (s.measure === "time" ? Number(s.distance) || 0 : 0), 0);
  return { byExercise, problems, volume, seconds, km };
}

function shortSetLabel(s) {
  if (s.measure === "time") {
    return [s.duration ? formatDuration(s.duration) : "", s.distance ? `${Number(s.distance).toLocaleString("en-GB", { maximumFractionDigits: 2 })} km` : "",
      s.rounds && s.rounds > 1 ? `×${s.rounds}` : ""].filter(Boolean).join(" · ") || "–";
  }
  const base = `${s.weight || 0}×${s.reps || "?"}`;
  return s.rounds && s.rounds > 1 ? `${base} ×${s.rounds}` : base;
}

function gymReviewHtml() {
  const sum = summariseGymSession(gymSession.sets);
  return `
    <p class="label">${gymSession.editingMatchId ? "Review changes" : "Review session"}</p>
    <h2 class="review-title">${escapeHtml(gymSessionTitle(gymSession))}</h2>
    <div class="stats" style="margin-top:12px;">
      <div><span class="stat-value num">${gymSession.sets.length}</span><p class="label">Sets</p></div>
      <div><span class="stat-value num">${sum.byExercise.length}</span><p class="label">Exercises</p></div>
      ${sum.volume ? `<div><span class="stat-value num">${Math.round(sum.volume).toLocaleString("en-GB")}</span><p class="label">kg lifted</p></div>` : ""}
      ${sum.seconds ? `<div><span class="stat-value num">${formatDuration(sum.seconds)}</span><p class="label">Time</p></div>` : ""}
      ${sum.km ? `<div><span class="stat-value num">${sum.km.toLocaleString("en-GB", { maximumFractionDigits: 2 })}</span><p class="label">km</p></div>` : ""}
    </div>
    ${sum.problems.length ? `
      <div class="review-warn" role="alert">
        ${sum.problems.map(p => `<p>${escapeHtml(p.text)}</p>`).join("")}
      </div>` : ""}
    <div class="card review-list">
      ${sum.byExercise.map(g => `
        <div class="review-ex">
          <div class="review-ex__head">
            <span class="review-ex__name">${escapeHtml(g.name)}</span>
            ${g.muscle ? `<span class="label">${escapeHtml(g.muscle)}</span>` : ""}
          </div>
          <div class="review-ex__sets">${g.sets.map(s => `<span class="set-pill num">${escapeHtml(shortSetLabel(s))}</span>`).join("")}</div>
        </div>`).join("")}
    </div>
    <button type="button" id="gym-back-to-sets" class="btn btn--ghost btn--sm" style="margin:4px 0 8px;">← Back to sets</button>`;
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
    rounds: num(set.rounds), // time sets use it too: interval blocks and AMRAPs
    duration_seconds: isTime ? num(set.duration) : null,
    distance_m: isTime && set.distance !== "" ? Math.round(Number(set.distance) * 1000) : null
  };
}

function finishGymSession() {
  const existing = gymSession.editingMatchId ? matches.find(m => m.id === gymSession.editingMatchId) : null;
  hideRestBar();

  form.innerHTML = `
    ${gymReviewHtml()}
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

  document.getElementById("gym-back-to-sets").addEventListener("click", renderGymSets);

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
        .update({ type: gymSession.type, name: gymSession.name || null })
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
        .insert({ match_id: matchRow.id, type: gymSession.type, name: gymSession.name || null });

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
    name: match.sessionName || "",
    sets: copySetsForRepeat(match.sets)
  };
  openScreen("Edit session");
  renderGymSets();
}