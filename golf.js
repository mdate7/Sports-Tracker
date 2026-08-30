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

function saveCurrentHoleInputs() {
  const hole = golfRound.holes[golfRound.holeIndex];
  hole.par = document.getElementById("hole-par").value !== ""
    ? Number(document.getElementById("hole-par").value)
    : null;
  hole.strokes = document.getElementById("hole-strokes").value !== ""
    ? Number(document.getElementById("hole-strokes").value)
    : null;
  hole.putts = document.getElementById("hole-putts").value !== ""
    ? Number(document.getElementById("hole-putts").value)
    : null;
}

function finishGolfRound() {
  form.innerHTML = `
    <div class="field">
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

function saveRoundProgress() {
  localStorage.setItem("inProgressGolfRound", JSON.stringify(golfRound));
}

function clearRoundProgress() {
  localStorage.removeItem("inProgressGolfRound");
}

