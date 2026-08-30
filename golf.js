let golfRound = null;
// shape while in progress:
// { courseName, numHoles, holes: [{par, strokes, putts}, ...], holeIndex }

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

function buildGolfSetup() {
    const courseOptions = getDistinctFieldValues("golf", "courseName")
    .map(v => `<option value="${v}"></option>`).join("");
  form.innerHTML = `
      <datalist id="course-options">${courseOptions}</datalist>
    <div class="field">
      <label class="label" for="golf-course-name">Course Name</label>
      <input type="text" id="golf-course-name" list="course-options" required>
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

function getStrokeLabel(strokes, par) {
  if (!strokes || !par) return "";
  const diff = strokes - par;
  if (diff <= -2) return { text: "EAGLE", cls: "" };
  if (diff === -1) return { text: "BIRDIE", cls: "" };
  if (diff === 0) return { text: "PAR", cls: "" };
  if (diff === 1) return { text: `BOGEY · +${diff}`, cls: "delta--neg" };
  return { text: `+${diff}`, cls: "delta--neg" };
}

function renderHoleStep() {
  const { holeIndex, numHoles, holes } = golfRound;
  const hole = holes[holeIndex];
  form.dataset.sport = "golf";

  const label = getStrokeLabel(hole.strokes, hole.par);

  form.innerHTML = `
    <p class="label" style="text-align:center;">Hole ${holeIndex + 1} of ${numHoles}</p>
    <p class="stat-value" style="text-align:center;font:var(--t-hero);margin:2px 0;">Par ${hole.par || "?"}</p>

    <div class="stepper stepper--lg" style="justify-content:center;gap:24px;margin:24px 0 6px;">
      <button type="button" id="strokes-minus">−</button>
      <output id="strokes-output">${hole.strokes || 0}</output>
      <button type="button" class="plus" id="strokes-plus">+</button>
    </div>
    <p id="stroke-label" class="delta num ${label.cls}" style="text-align:center;">${label.text}</p>

    <div style="display:flex;gap:8px;margin-top:20px;">
      <div class="field" style="flex:1;">
        <label class="label" for="hole-par">Par</label>
        <input type="number" id="hole-par" value="${hole.par}">
      </div>
      <div class="field" style="flex:1;">
        <label class="label" for="hole-putts">Putts</label>
        <input type="number" id="hole-putts" value="${hole.putts}">
      </div>
    </div>

    <div style="display:flex; gap:8px; margin-top:16px;">
      ${holeIndex > 0 ? `<button type="button" id="hole-back-btn" class="btn btn--ghost">Back</button>` : ""}
      <button type="button" id="hole-next-btn" class="btn">${holeIndex === numHoles - 1 ? "Finish Round" : "Next Hole"}</button>
    </div>
  `;

  function refreshLabel() {
    const par = Number(document.getElementById("hole-par").value) || hole.par;
    const strokes = Number(document.getElementById("strokes-output").textContent);
    const l = getStrokeLabel(strokes, par);
    const labelEl = document.getElementById("stroke-label");
    labelEl.textContent = l.text;
    labelEl.className = `delta num ${l.cls}`;
  }

  document.getElementById("strokes-minus").addEventListener("click", () => {
    const output = document.getElementById("strokes-output");
    output.textContent = Math.max(0, Number(output.textContent) - 1);
    refreshLabel();
  });
  document.getElementById("strokes-plus").addEventListener("click", () => {
    const output = document.getElementById("strokes-output");
    output.textContent = Number(output.textContent) + 1;
    refreshLabel();
  });
  document.getElementById("hole-par").addEventListener("input", refreshLabel);

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
  hole.par = document.getElementById("hole-par").value !== ""
    ? Number(document.getElementById("hole-par").value)
    : null;
  hole.strokes = Number(document.getElementById("strokes-output").textContent) || null;
  hole.putts = document.getElementById("hole-putts").value !== ""
    ? Number(document.getElementById("hole-putts").value)
    : null;
}

function getHoleState(hole) {
  if (!hole.strokes || !hole.par) return "par";
  const diff = hole.strokes - hole.par;
  if (diff < 0) return "under";
  if (diff === 0) return "par";
  if (diff === 1) return "over";
  return "worse";
}

function buildStrip(holes) {
  return holes.map(h => `<i data-v="${getHoleState(h)}"></i>`).join("");
}

function finishGolfRound() {
  const holes = golfRound.holes;
  const totalStrokes = holes.reduce((sum, h) => sum + (h.strokes || 0), 0);
  const totalPar = holes.reduce((sum, h) => sum + (h.par || 0), 0);
  const diff = totalStrokes - totalPar;
  const scoreLabel = diff === 0 ? "E" : diff > 0 ? `+${diff}` : `${diff}`;

  const totalPutts = holes.reduce((sum, h) => sum + (h.putts || 0), 0);
  const birdies = holes.filter(h => h.strokes && h.par && h.strokes - h.par < 0).length;
  const pars = holes.filter(h => h.strokes && h.par && h.strokes - h.par === 0).length;
  const bogeysPlus = holes.filter(h => h.strokes && h.par && h.strokes - h.par > 0).length;

  const front = holes.slice(0, 9);
  const back = holes.slice(9);

  form.dataset.sport = "golf";
  form.innerHTML = `
    <p class="label" style="text-align:center;">Round complete</p>
    <p class="stat-value" style="text-align:center;font:var(--t-hero-xl);margin:4px 0 0;">${totalStrokes}</p>
    <p class="delta num ${diff > 0 ? "delta--neg" : ""}" style="text-align:center;">${scoreLabel}</p>

    ${front.length ? `<p class="label" style="margin-top:20px;">Front ${front.length}</p><div class="strip">${buildStrip(front)}</div>` : ""}
    ${back.length ? `<p class="label" style="margin-top:12px;">Back ${back.length}</p><div class="strip">${buildStrip(back)}</div>` : ""}

    <div class="stats" style="margin-top:20px;">
      <div><span class="stat-value num">${birdies}</span><p class="label">Birdies</p></div>
      <div><span class="stat-value num">${pars}</span><p class="label">Pars</p></div>
      <div><span class="stat-value num">${bogeysPlus}</span><p class="label">Bogeys+</p></div>
      <div><span class="stat-value num">${totalPutts}</span><p class="label">Putts</p></div>
    </div>

    <div class="field" style="margin-top:20px;">
      <label class="label" for="golf-date">Date</label>
      <input type="date" id="golf-date" value="${todayISODate()}" required>
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
    <button type="button" id="golf-save-btn" class="btn" style="margin-top:8px;">Save Round</button>
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

function saveRoundProgress() {
  localStorage.setItem("inProgressGolfRound", JSON.stringify(golfRound));
}

function clearRoundProgress() {
  localStorage.removeItem("inProgressGolfRound");
}

