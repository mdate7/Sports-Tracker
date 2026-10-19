let golfRound = null;
// shape while in progress:
// { courseName, numHoles, playingHandicap, holes: [{par, strokes, putts, si}, ...], holeIndex }

// --- Stableford ------------------------------------------------------------
// Shots received per hole: the playing handicap is spread across the holes
// in stroke-index order (SI 1 = hardest gets the first shot). Over n holes,
// every hole gets floor(PH / n) and the PH % n hardest get one more, which
// handles 9- and 18-hole rounds alike. A plus handicap (negative PH) gives
// shots back on the easiest holes instead.
function shotsReceived(holes, playingHandicap) {
  const n = holes.length;
  if (!n) return [];
  const order = holes.map((h, i) => ({ i, si: Number(h.si) })).sort((a, b) => a.si - b.si || a.i - b.i);
  const rank = new Array(n);
  order.forEach((o, r) => { rank[o.i] = r + 1; });
  const abs = Math.abs(playingHandicap), base = Math.floor(abs / n), extra = abs % n;
  return holes.map((_, i) => playingHandicap >= 0
    ? base + (rank[i] <= extra ? 1 : 0)
    : -(base + (rank[i] > n - extra ? 1 : 0)));
}

// Stableford: 2 points for a net par, one more per shot better, one fewer per
// shot worse, never below 0. Returns null when it can't be worked out: no
// playing handicap, a hole without par, or (with a non-zero handicap) a hole
// without a stroke index.
function stablefordFor(holes, playingHandicap) {
  if (playingHandicap === "" || playingHandicap === null || playingHandicap === undefined) return null;
  const ph = Math.round(Number(playingHandicap));
  if (!Number.isFinite(ph) || !holes.length) return null;
  if (holes.some(h => !Number(h.par))) return null;
  if (ph !== 0 && holes.some(h => !Number(h.si))) return null;
  const shots = ph === 0 ? holes.map(() => 0) : shotsReceived(holes, ph);
  const perHole = holes.map((h, i) => (Number(h.strokes) ? Math.max(0, 2 + Number(h.par) + shots[i] - Number(h.strokes)) : 0));
  return { shots, perHole, total: perHole.reduce((a, b) => a + b, 0) };
}

// The playing handicap used last time, to pre-fill the next round. "" if none.
function lastPlayingHandicap() {
  const last = matches
    .filter(m => m.sport === "golf" && Number.isFinite(m.playingHandicap))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0];
  return last ? last.playingHandicap : "";
}

function readHandicapInput(id) {
  const raw = document.getElementById(id)?.value.trim() ?? "";
  if (raw === "") return "";
  const n = Math.round(Number(raw.replace(/^\+/, "-")));   // "+2" means a plus handicap
  return Number.isFinite(n) && n >= -10 && n <= 54 ? n : "";
}
const handicapLabel = (ph) => (ph === "" || ph === null || ph === undefined ? "" : ph < 0 ? `+${-ph}` : `${ph}`);

async function getCourseProfile(courseName) {
  const userId = await ensureSignedIn();
  if (!userId) return null;

  const { data, error } = await supabaseClient
    .from("courses")
    .select("par_per_hole, stroke_index_per_hole")
    .eq("user_id", userId)
    .eq("course_name", courseName)
    .maybeSingle();

  if (error) {
    console.error("Failed to look up course:", error);
    return null;
  }
  return data ? { parPerHole: data.par_per_hole || [], strokeIndexPerHole: data.stroke_index_per_hole || [] } : null;
}

async function saveCourseProfile(courseName, parPerHole, strokeIndexPerHole = null) {
  const userId = await ensureSignedIn();
  if (!userId) return;

  const { error } = await supabaseClient
    .from("courses")
    .upsert(
      {
        user_id: userId, course_name: courseName, par_per_hole: parPerHole,
        // Only overwrite the saved SI when this round has a full, valid set.
        ...(strokeIndexPerHole && strokeIndexPerHole.every(v => Number(v) >= 1 && Number(v) <= 18)
          ? { stroke_index_per_hole: strokeIndexPerHole.map(Number) } : {})
      },
      { onConflict: "user_id,course_name" }
    );

  if (error) console.error("Failed to save course profile:", error);
}

function buildGolfSetup() {
  form.innerHTML = `
    <div class="field">
      <label class="label" for="golf-course-name">Course Name</label>
      <input type="text" id="golf-course-name" required>
    </div>
    <div class="field">
      <label class="label" for="golf-num-holes">Number of Holes</label>
      <input type="number" id="golf-num-holes" value="18" required>
    </div>
    <div class="field">
      <label class="label" for="golf-handicap">Playing handicap (optional, for Stableford)</label>
      <input type="text" inputmode="numeric" id="golf-handicap" value="${escapeHtml(handicapLabel(lastPlayingHandicap()))}" placeholder="e.g. 18, or +2">
    </div>
    <button type="button" id="golf-start-btn" class="btn">Start Round</button>
    <button type="button" id="golf-camera-btn" class="btn btn--ghost" style="margin-top:8px;">📷 Take Scorecard Photo</button>
    <button type="button" id="golf-upload-btn" class="btn btn--ghost" style="margin-top:8px;">🖼️ Choose from Library</button>
    <input type="file" id="golf-scorecard-camera" accept="image/*" capture="environment" style="display:none">
    <input type="file" id="golf-scorecard-input" accept="image/*" style="display:none">
  `;
  document.getElementById("golf-start-btn").addEventListener("click", startGolfRound);

  document.getElementById("golf-camera-btn").addEventListener("click", () => {
    document.getElementById("golf-scorecard-camera").click();
  });
  document.getElementById("golf-scorecard-camera").addEventListener("change", (e) => {
    if (e.target.files[0]) handleScorecardUpload(e.target.files[0]);
  });

  document.getElementById("golf-upload-btn").addEventListener("click", () => {
    document.getElementById("golf-scorecard-input").click();
  });
  document.getElementById("golf-scorecard-input").addEventListener("change", (e) => {
    if (e.target.files[0]) handleScorecardUpload(e.target.files[0]);
  });
}

async function startGolfRound() {
  const courseName = document.getElementById("golf-course-name").value.trim();
  const numHoles = Number(document.getElementById("golf-num-holes").value);
  if (!courseName || !numHoles) return;

  const playingHandicap = readHandicapInput("golf-handicap");
  const profile = await getCourseProfile(courseName);
  const holes = [];
  for (let i = 0; i < numHoles; i++) {
    holes.push({
      par: profile && profile.parPerHole[i] ? profile.parPerHole[i] : "",
      si: profile && profile.strokeIndexPerHole[i] ? profile.strokeIndexPerHole[i] : "",
      strokes: "",
      putts: ""
    });
  }

  golfRound = { courseName, numHoles, playingHandicap, holes, holeIndex: 0 };
  saveRoundProgress();
  renderHoleStep();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]); // strip the data: prefix
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function handleScorecardUpload(file) {
  form.innerHTML = `<p style="font-size:13px;color:var(--muted);">Reading your scorecard...</p>`;

  try {
    const imageBase64 = await fileToBase64(file);
    const { data, error } = await supabaseClient.functions.invoke("parse-scorecard", {
      body: { imageBase64, mediaType: file.type || "image/jpeg" }
    });

    if (error) {
      console.error("Scorecard parse failed:", error);
      alert("Couldn't read that scorecard — try a clearer photo, or enter it manually.");
      buildGolfSetup();
      return;
    }

    buildScorecardReview(data);
  } catch (err) {
    console.error("Unexpected error during scorecard upload:", err);
    alert("Something went wrong — try again.");
    buildGolfSetup();
  }
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
    <p id="hole-points" class="label" style="text-align:center;margin-top:4px;"></p>

    <div style="display:flex;gap:8px;margin-top:20px;">
      <div class="field" style="flex:1;">
        <label class="label" for="hole-par">Par</label>
        <input type="number" id="hole-par" value="${hole.par}">
      </div>
      <div class="field" style="flex:1;">
        <label class="label" for="hole-si">SI</label>
        <input type="number" inputmode="numeric" id="hole-si" min="1" max="18" value="${hole.si ?? ""}">
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
    // Points for this hole, using the whole round's SIs to place the shots.
    const ptsEl = document.getElementById("hole-points");
    const si = Number(document.getElementById("hole-si").value) || "";
    const holesNow = golfRound.holes.map((h, i) => (i === holeIndex ? { ...h, par, si, strokes } : h));
    const r = strokes ? stablefordFor(holesNow, golfRound.playingHandicap) : null;
    ptsEl.textContent = r ? `${r.perHole[holeIndex]} Stableford point${r.perHole[holeIndex] === 1 ? "" : "s"}${r.shots[holeIndex] ? ` · ${r.shots[holeIndex] > 0 ? "+" : ""}${r.shots[holeIndex]} shot${Math.abs(r.shots[holeIndex]) === 1 ? "" : "s"}` : ""}` : "";
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
  document.getElementById("hole-si").addEventListener("input", refreshLabel);
  refreshLabel();

  if (holeIndex > 0) {
    document.getElementById("hole-back-btn").addEventListener("click", () => {
if (!golfRound.editingMatchId) saveRoundProgress();
      saveRoundProgress();
      golfRound.holeIndex--;
      renderHoleStep();
    });
  }

  document.getElementById("hole-next-btn").addEventListener("click", () => {
    saveCurrentHoleInputs();
if (!golfRound.editingMatchId) saveRoundProgress();
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
  hole.si = Number(document.getElementById("hole-si").value) || "";
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

// Traditional scorecard marks: circle = birdie, double circle = eagle or
// better, square = bogey, filled square = double bogey or worse. Shape carries
// the meaning, so it reads at a glance and doesn't rely on colour alone.
function getScoreMark(strokes, par) {
  if (!strokes) return "missing";
  if (!par) return "par";
  const diff = strokes - par;
  if (diff <= -2) return "eagle";
  if (diff === -1) return "birdie";
  if (diff === 0) return "par";
  if (diff === 1) return "bogey";
  return "double";
}

function formatVsPar(diff) {
  return diff === 0 ? "E" : diff > 0 ? `+${diff}` : `${diff}`;
}

function buildScorecardReview(parsed) {
  const holes = parsed.holes.map(h => ({
    par: h.par ?? "",
    si: h.strokeIndex ?? "",
    strokes: h.strokes ?? "",
    putts: h.putts ?? ""
  }));
  // Handicap: what the card says, else what was used last time.
  const startHandicap = Number.isFinite(parsed.playingHandicap) ? parsed.playingHandicap : lastPlayingHandicap();

  // Front 9 / back 9, like a paper card. A 9-hole round is just one section.
  const nines = holes.length > 9
    ? [{ label: "Front 9", total: "Out", from: 0, to: 9 }, { label: "Back 9", total: "In", from: 9, to: holes.length }]
    : [{ label: `${holes.length} holes`, total: "Total", from: 0, to: holes.length }];

  const rowHtml = (h, i) => `
    <div class="sc-row" data-i="${i}">
      <span class="sc-hole num">${i + 1}</span>
      <input type="number" inputmode="numeric" class="sc-input sc-input--si review-si" data-i="${i}" value="${h.si}" aria-label="Hole ${i + 1} stroke index">
      <input type="number" inputmode="numeric" class="sc-input review-par" data-i="${i}" value="${h.par}" aria-label="Hole ${i + 1} par">
      <span class="score-mark" data-mark="${getScoreMark(Number(h.strokes), Number(h.par))}">
        <input type="number" inputmode="numeric" class="sc-input review-strokes" data-i="${i}" value="${h.strokes}" placeholder="?" aria-label="Hole ${i + 1} score">
      </span>
      <input type="number" inputmode="numeric" class="sc-input review-putts" data-i="${i}" value="${h.putts}" aria-label="Hole ${i + 1} putts">
    </div>
  `;

  const ninesHtml = nines.map((n, idx) => `
    <section class="nine" data-from="${n.from}" data-to="${n.to}" data-total-label="${n.total}">
      <div class="nine-head">
        <p class="label">${n.label}</p>
        <p class="label num nine-total" id="nine-total-${idx}"></p>
      </div>
      <div class="sc-row sc-row--head" aria-hidden="true">
        <span>Hole</span><span>SI</span><span>Par</span><span>Score</span><span>Putts</span>
      </div>
      ${holes.slice(n.from, n.to).map((h, j) => rowHtml(h, n.from + j)).join("")}
    </section>
  `).join("");

  form.dataset.sport = "golf";
  form.innerHTML = `
    <p class="label">Check your scorecard</p>
    <p id="review-summary" style="font:var(--t-body);color:var(--muted);margin:4px 0 14px;"></p>
    <div class="field">
      <label class="label" for="review-course-name">Course</label>
      <input type="text" id="review-course-name" value="${escapeHtml(parsed.courseName)}">
    </div>
    <div class="field">
      <label class="label" for="review-handicap">Playing handicap (optional, for Stableford)</label>
      <input type="text" inputmode="numeric" id="review-handicap" value="${escapeHtml(handicapLabel(startHandicap))}" placeholder="e.g. 18, or +2">
    </div>
    <div class="sc-total">
      <div><span class="stat-value num" id="review-total-strokes">–</span><p class="label">Score</p></div>
      <div><span class="delta num" id="review-total-vs-par">–</span><p class="label">vs par</p></div>
      <div><span class="stat-value num" id="review-total-points">–</span><p class="label">Points</p></div>
    </div>
    <p id="review-points-note" class="sc-note" hidden></p>
    ${ninesHtml}
    <div class="sc-legend" aria-hidden="true">
      <span><i class="score-mark" data-mark="eagle"></i>Eagle</span>
      <span><i class="score-mark" data-mark="birdie"></i>Birdie</span>
      <span><i class="score-mark" data-mark="bogey"></i>Bogey</span>
      <span><i class="score-mark" data-mark="double"></i>Double+</span>
    </div>
    <button type="button" id="review-confirm-btn" class="btn">Looks good, continue</button>
    <button type="button" id="review-cancel-btn" class="btn btn--ghost" style="margin-top:8px;">Start over</button>
  `;

  const readHoles = () => holes.map((_, i) => ({
    par: Number(form.querySelector(`.review-par[data-i="${i}"]`).value) || "",
    si: Number(form.querySelector(`.review-si[data-i="${i}"]`).value) || "",
    strokes: Number(form.querySelector(`.review-strokes[data-i="${i}"]`).value) || "",
    putts: Number(form.querySelector(`.review-putts[data-i="${i}"]`).value) || ""
  }));

  // Recompute marks, subtotals and the "still missing" count on every edit,
  // so fixing the AI's misreads gives instant feedback.
  const refresh = () => {
    const current = readHoles();
    const ph = readHandicapInput("review-handicap");
    const stbl = stablefordFor(current, ph);
    current.forEach((h, i) => {
      form.querySelector(`.review-strokes[data-i="${i}"]`).parentElement.dataset.mark = getScoreMark(h.strokes, h.par);
    });
    form.querySelectorAll(".nine").forEach((section, idx) => {
      const slice = current.slice(Number(section.dataset.from), Number(section.dataset.to));
      const strokes = slice.reduce((sum, h) => sum + (h.strokes || 0), 0);
      const scoredPar = slice.reduce((sum, h) => sum + (h.strokes && h.par ? h.par : 0), 0);
      const from = Number(section.dataset.from), to = Number(section.dataset.to);
      const pts = stbl ? stbl.perHole.slice(from, to).reduce((a, b) => a + b, 0) : null;
      document.getElementById(`nine-total-${idx}`).textContent =
        `${section.dataset.totalLabel} ${strokes || "–"}${scoredPar ? ` · ${formatVsPar(strokes - scoredPar)}` : ""}${pts !== null ? ` · ${pts} pts` : ""}`;
    });
    const total = current.reduce((sum, h) => sum + (h.strokes || 0), 0);
    const scoredPar = current.reduce((sum, h) => sum + (h.strokes && h.par ? h.par : 0), 0);
    document.getElementById("review-total-strokes").textContent = total || "–";
    const vs = document.getElementById("review-total-vs-par");
    vs.textContent = scoredPar ? formatVsPar(total - scoredPar) : "–";
    vs.classList.toggle("delta--neg", total > scoredPar);
    document.getElementById("review-total-points").textContent = stbl ? stbl.total : "–";
    const note = document.getElementById("review-points-note");
    const noSi = current.filter(h => !h.si).length;
    note.hidden = !(ph !== "" && ph !== 0 && noSi);
    note.textContent = `Add the stroke index for ${noSi} hole${noSi === 1 ? "" : "s"} to see Stableford points.`;
    const missing = current.filter(h => !h.strokes).length;
    document.getElementById("review-summary").textContent = missing
      ? `${missing} hole${missing === 1 ? "" : "s"} still need${missing === 1 ? "s" : ""} a score. They're marked with ?.`
      : "All holes read. Check anything that looks off, then continue.";
  };
  form.querySelectorAll(".sc-input").forEach(input => input.addEventListener("input", refresh));
  document.getElementById("review-handicap").addEventListener("input", refresh);
  refresh();

  // Stroke indexes saved for this course from a previous round fill any the
  // photo didn't read, so a course only ever needs fixing once.
  (async () => {
    const name = document.getElementById("review-course-name").value.trim();
    const profile = name ? await getCourseProfile(name) : null;
    if (!profile) return;
    let filled = false;
    holes.forEach((_, i) => {
      const siInput = form.querySelector(`.review-si[data-i="${i}"]`);
      const parInput = form.querySelector(`.review-par[data-i="${i}"]`);
      if (siInput && !siInput.value && profile.strokeIndexPerHole[i]) { siInput.value = profile.strokeIndexPerHole[i]; filled = true; }
      if (parInput && !parInput.value && profile.parPerHole[i]) { parInput.value = profile.parPerHole[i]; filled = true; }
    });
    if (filled) refresh();
  })();

  document.getElementById("review-cancel-btn").addEventListener("click", buildGolfSetup);

  document.getElementById("review-confirm-btn").addEventListener("click", () => {
    const updatedHoles = readHoles();
    const firstMissing = updatedHoles.findIndex(h => h.strokes === "");
    if (firstMissing !== -1) {
      const input = form.querySelector(`.review-strokes[data-i="${firstMissing}"]`);
      input.scrollIntoView({ block: "center", behavior: "smooth" });
      input.focus();
      return;
    }

    golfRound = {
      courseName: document.getElementById("review-course-name").value.trim(),
      playingHandicap: readHandicapInput("review-handicap"),
      numHoles: updatedHoles.length,
      holes: updatedHoles,
      holeIndex: updatedHoles.length - 1
    };
    saveRoundProgress();
    finishGolfRound();
  });
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

  const existing = golfRound.editingMatchId ? matches.find(m => m.id === golfRound.editingMatchId) : null;

  form.dataset.sport = "golf";
  form.innerHTML = `
    <p class="label" style="text-align:center;">${existing ? "Review round" : "Round complete"}</p>
    <p class="stat-value" style="text-align:center;font:var(--t-hero-xl);margin:4px 0 0;">${totalStrokes}</p>
    <p class="delta num ${diff > 0 ? "delta--neg" : ""}" style="text-align:center;">${scoreLabel}</p>
    <p id="finish-points" class="finish-points"></p>

    ${front.length ? `<p class="label" style="margin-top:20px;">Front ${front.length}</p><div class="strip">${buildStrip(front)}</div>` : ""}
    ${back.length ? `<p class="label" style="margin-top:12px;">Back ${back.length}</p><div class="strip">${buildStrip(back)}</div>` : ""}

    <div class="stats" style="margin-top:20px;">
      <div><span class="stat-value num">${birdies}</span><p class="label">Birdies</p></div>
      <div><span class="stat-value num">${pars}</span><p class="label">Pars</p></div>
      <div><span class="stat-value num">${bogeysPlus}</span><p class="label">Bogeys+</p></div>
      <div><span class="stat-value num">${totalPutts}</span><p class="label">Putts</p></div>
    </div>

    <div class="field" style="margin-top:20px;">
      <label class="label" for="golf-finish-handicap">Playing handicap (optional, for Stableford)</label>
      <input type="text" inputmode="numeric" id="golf-finish-handicap" value="${escapeHtml(handicapLabel(golfRound.playingHandicap ?? ""))}" placeholder="e.g. 18, or +2">
    </div>
    <div class="field">
      <label class="label" for="golf-date">Date</label>
      <input type="date" id="golf-date" value="${existing ? existing.date : todayISODate()}" required>
    </div>
    <div class="field">
      <label class="label" for="golf-rating">Rating</label>
      <input type="number" id="golf-rating" value="${existing ? existing.matchRating ?? "" : ""}" required>
    </div>
    <div class="field">
      <label class="label" for="golf-played-with">Played With (optional)</label>
      <input type="text" id="golf-played-with" value="${escapeHtml(existing?.playedWith)}">
    </div>
    <div class="field">
      <label class="label" for="golf-notes">Notes (optional)</label>
      <input type="text" id="golf-notes" value="${escapeHtml(existing?.notes)}">
    </div>
    <button type="button" id="golf-save-btn" class="btn" style="margin-top:8px;">${existing ? "Save Changes" : "Save Round"}</button>
  `;

  // Points update as the handicap is typed; the hero shows them under the score.
  const paintPoints = () => {
    const ph = readHandicapInput("golf-finish-handicap");
    golfRound.playingHandicap = ph;
    const r = stablefordFor(holes, ph);
    const el = document.getElementById("finish-points");
    const noSi = holes.filter(h => !h.si).length;
    el.textContent = r ? `${r.total} Stableford points`
      : ph !== "" && noSi ? `Add stroke index on ${noSi} hole${noSi === 1 ? "" : "s"} for Stableford points` : "";
    return r;
  };
  document.getElementById("golf-finish-handicap").addEventListener("input", paintPoints);
  paintPoints();

  document.getElementById("golf-save-btn").addEventListener("click", async () => {
    const userId = await ensureSignedIn();
    if (!userId) {
      alert("Couldn't verify your session — try again.");
      return;
    }

    const dateValue = document.getElementById("golf-date").value;
    const ratingValue = Number(document.getElementById("golf-rating").value);
    const playedWithValue = document.getElementById("golf-played-with").value || null;
    const notesValue = document.getElementById("golf-notes").value || null;
    const parPerHole = holes.map(h => h.par);

    const stbl = paintPoints();
    const handicapValue = golfRound.playingHandicap === "" ? null : golfRound.playingHandicap;
    const pointsValue = stbl ? stbl.total : null;
    await saveCourseProfile(golfRound.courseName, parPerHole, holes.map(h => h.si || null));

    if (golfRound.editingMatchId) {
      const matchId = golfRound.editingMatchId;

      const { error: matchError } = await supabaseClient
        .from("matches")
        .update({ date: dateValue, match_rating: ratingValue, notes: notesValue })
        .eq("id", matchId);
      if (matchError) {
        console.error("Failed to update round:", matchError);
        alert("Something went wrong updating this round — check the console.");
        return;
      }

      const { error: detailError } = await supabaseClient
        .from("golf_details")
        .update({ course_name: golfRound.courseName, played_with: playedWithValue, strokes: totalStrokes, par: totalPar, holes_played: golfRound.numHoles, playing_handicap: handicapValue, stableford_points: pointsValue })
        .eq("match_id", matchId);
      // An edit can't be rolled back, so say exactly what didn't save and leave
      // the screen open so they can try again, instead of failing silently.
      if (detailError) {
        console.error("Failed to update golf details:", detailError);
        alert("The round's date and notes saved, but the course and score didn't. Try saving again.");
        return;
      }

      const { error: deleteHolesError } = await supabaseClient.from("golf_holes").delete().eq("match_id", matchId);
      if (deleteHolesError) {
        console.error("Failed to clear old holes:", deleteHolesError);
        alert("The round saved, but the hole-by-hole scores couldn't be updated. Try saving again.");
        return;
      }

      const holeRows = holes.map((h, index) => ({
        match_id: matchId, hole_number: index + 1, par: h.par, strokes: h.strokes, putts: h.putts,
        stroke_index: h.si || null
      }));
      const { error: holesError } = await supabaseClient.from("golf_holes").insert(holeRows);
      if (holesError) {
        console.error("Failed to save updated holes:", holesError);
        alert("The round saved, but the hole-by-hole scores didn't. Try saving again.");
        return;
      }

    } else {
      const { data: matchRow, error: matchError } = await supabaseClient
        .from("matches")
        .insert({ user_id: userId, sport: "golf", date: dateValue, match_rating: ratingValue, notes: notesValue })
        .select()
        .single();
      if (matchError) {
        console.error("Failed to save round:", matchError);
        alert("Something went wrong saving this round — check the console.");
        return;
      }

      const { error: detailError } = await supabaseClient
        .from("golf_details")
        .insert({ match_id: matchRow.id, course_name: golfRound.courseName, played_with: playedWithValue, strokes: totalStrokes, par: totalPar, holes_played: golfRound.numHoles, playing_handicap: handicapValue, stableford_points: pointsValue });
      const holeRows = holes.map((h, index) => ({
        match_id: matchRow.id, hole_number: index + 1, par: h.par, strokes: h.strokes, putts: h.putts,
        stroke_index: h.si || null
      }));
      const { error: holesError } = detailError
        ? { error: null }
        : await supabaseClient.from("golf_holes").insert(holeRows);

      // A matches row without its golf_details/holes is what used to break the
      // feed. Undo the half-save (child rows go with it) and keep the round in
      // progress so nothing typed is lost.
      if (detailError || holesError) {
        console.error("Failed to save round details:", detailError || holesError);
        await supabaseClient.from("matches").delete().eq("id", matchRow.id);
        alert("Something went wrong saving this round, so nothing was saved. Your scores are still here; try again.");
        return;
      }

      clearRoundProgress();
    }

    golfRound = null;
    matches = await loadMatchesFromSupabase();
    currentDetailMatchId = null;
    renderView();
    closeEntryScreen();
  });
}

function saveRoundProgress() {
  localStorage.setItem("inProgressGolfRound", JSON.stringify(golfRound));
}

function clearRoundProgress() {
  localStorage.removeItem("inProgressGolfRound");
}

function editGolfRound(match) {
  golfRound = {
    editingMatchId: match.id,
    courseName: match.courseName,
    playingHandicap: Number.isFinite(match.playingHandicap) ? match.playingHandicap : "",
    numHoles: match.holes.length,
    holes: match.holes.map(h => ({ ...h })),
    holeIndex: 0
  };
  openScreen("Edit round");
  renderHoleStep();
}