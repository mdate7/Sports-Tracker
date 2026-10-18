// Insights tab: streaks, weekly activity and per-sport stats, all computed in
// the browser from the person's own `matches`. No extra queries.
//
// Charts are hand-built SVG. Colours come from the --chart-* tokens (same
// hues as the sport accents, stepped so the four read as equal weight and stay
// distinct under colour-blindness; validated with the dataviz checker).
// Football and cricket are never adjacent in a stack: they're the closest pair.

const INSIGHT_SPORTS = ["football", "golf", "cricket", "gym"]; // stack order, bottom → top

// --- dates (all ISO "YYYY-MM-DD", local time) --------------------------------

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseIso(s) { return new Date(s + "T00:00"); }
// Weeks start on Monday.
function weekStartIso(s) {
  const d = parseIso(s);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return isoDate(d);
}
function addDaysIso(s, n) { const d = parseIso(s); d.setDate(d.getDate() + n); return isoDate(d); }
const monthKey = (s) => s.slice(0, 7);
const shortDate = (s) => parseIso(s).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const monthName = (key) => new Date(key + "-01T00:00").toLocaleDateString("en-GB", { month: "short" });

// Consecutive weeks with at least one activity. The current week counts if it
// has something; if it doesn't yet, the streak is still alive from last week.
function weekStreaks(dates) {
  const weeks = new Set(dates.map(weekStartIso));
  const thisWeek = weekStartIso(todayISODate());
  let current = 0;
  let cursor = weeks.has(thisWeek) ? thisWeek : addDaysIso(thisWeek, -7);
  while (weeks.has(cursor)) { current++; cursor = addDaysIso(cursor, -7); }

  const sorted = [...weeks].sort();
  let best = 0, run = 0, prev = null;
  sorted.forEach(w => {
    run = prev && addDaysIso(prev, 7) === w ? run + 1 : 1;
    best = Math.max(best, run);
    prev = w;
  });
  return { current, best };
}

// --- small building blocks -------------------------------------------------

function statTile(label, value, sub = "") {
  return `
    <div class="stat-tile">
      <p class="label">${label}</p>
      <p class="stat-tile__value">${value}</p>
      ${sub ? `<p class="stat-tile__sub">${sub}</p>` : ""}
    </div>`;
}

function niceMax(v) {
  if (v <= 4) return 4;
  const step = v <= 10 ? 2 : v <= 25 ? 5 : 10;
  return Math.ceil(v / step) * step;
}

const svgText = (s) => escapeHtml(s);

// One shared tooltip, positioned over whichever chart is being touched.
let insightsTip = null;
function showTip(target, html) {
  const wrap = target.closest(".chart");
  if (!insightsTip) {
    insightsTip = document.createElement("div");
    insightsTip.className = "chart-tip";
    insightsTip.setAttribute("role", "status");
  }
  wrap.appendChild(insightsTip);
  insightsTip.innerHTML = html;
  insightsTip.hidden = false;
  const box = target.getBoundingClientRect();
  const wrapBox = wrap.getBoundingClientRect();
  const tipW = insightsTip.offsetWidth;
  const x = Math.min(Math.max(box.left + box.width / 2 - wrapBox.left - tipW / 2, 0), wrapBox.width - tipW);
  insightsTip.style.left = `${x}px`;
  insightsTip.style.top = `${Math.max(box.top - wrapBox.top - insightsTip.offsetHeight - 8, 0)}px`;
}
function hideTip() { if (insightsTip) insightsTip.hidden = true; }

// --- charts ----------------------------------------------------------------

// Stacked columns: weeks × sports. `weeks` = [{ start, counts: {sport: n} }].
function weeklyColumnsSvg(weeks) {
  const W = 340, H = 150, padL = 22, padB = 22, padT = 8;
  const plotW = W - padL, plotH = H - padB - padT;
  const totals = weeks.map(w => INSIGHT_SPORTS.reduce((s, k) => s + (w.counts[k] || 0), 0));
  const max = niceMax(Math.max(1, ...totals));
  const band = plotW / weeks.length;
  const barW = Math.min(16, band * 0.62);
  const y = (v) => padT + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];

  const grid = ticks.map(t => `
    <line x1="${padL}" x2="${W}" y1="${y(t)}" y2="${y(t)}" class="chart-grid"/>
    <text x="${padL - 6}" y="${y(t) + 3}" class="chart-tick" text-anchor="end">${t}</text>`).join("");

  const cols = weeks.map((w, i) => {
    const x = padL + band * i + (band - barW) / 2;
    let base = 0;
    const present = INSIGHT_SPORTS.filter(k => w.counts[k]);
    const segs = present.map((k, j) => {
      const v = w.counts[k];
      const top = y(base + v), bottom = y(base);
      base += v;
      // 2px surface gap between stacked segments; only the top segment is rounded.
      const h = Math.max(bottom - top - (j < present.length - 1 ? 2 : 0), 1);
      const isTop = j === present.length - 1;
      const r = Math.min(4, h, barW / 2);
      const path = isTop
        ? `M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${top + h} Z`
        : `M${x},${top} H${x + barW} V${top + h} H${x} Z`;
      return `<path d="${path}" style="fill:var(--chart-${k})"/>`;
    }).join("");
    const label = present.map(k => `${w.counts[k]} ${sportNames[k].toLowerCase()}`).join(", ") || "Nothing logged";
    const showDate = i === 0 || i === weeks.length - 1 || i === Math.floor(weeks.length / 2);
    return `
      <g>
        ${segs}
        ${showDate ? `<text x="${x + barW / 2}" y="${H - 6}" class="chart-tick" text-anchor="middle">${shortDate(w.start)}</text>` : ""}
        <rect class="chart-hit" x="${padL + band * i}" y="${padT}" width="${band}" height="${plotH}" tabindex="0"
          data-tip="${escapeHtml(`<strong>w/c ${shortDate(w.start)}</strong><br>${label}`)}"/>
      </g>`;
  }).join("");

  return `<svg viewBox="0 0 ${W} ${H}" class="chart-svg" role="img" aria-label="Activities per week for the last ${weeks.length} weeks, by sport">${grid}${cols}</svg>`;
}

// A single-series line with optional zero baseline (e.g. score vs par).
// points = [{ x: label, y: number, tip: html }], oldest → newest.
function lineChartSvg(points, { sport, baseline = null, format = (v) => v, invertNote = "" } = {}) {
  const W = 340, H = 150, padL = 30, padR = 30, padB = 22, padT = 14;
  const plotW = W - padL - padR, plotH = H - padB - padT;
  const dataLo = Math.min(...points.map(p => p.y)), dataHi = Math.max(...points.map(p => p.y));
  // Only show the baseline (e.g. par) when the data comes near it; forcing it
  // in for a +15 golfer squashes the whole trend into a strip.
  const reach = (dataHi - dataLo || 2) * 0.5;
  const near = baseline !== null && baseline >= dataLo - reach && baseline <= dataHi + reach;
  let lo = Math.min(dataLo, near ? baseline : dataLo), hi = Math.max(dataHi, near ? baseline : dataHi);
  if (lo === hi) { lo -= 1; hi += 1; }
  const span = hi - lo; lo -= span * 0.12; hi += span * 0.12;
  const x = (i) => padL + (points.length === 1 ? plotW / 2 : (plotW * i) / (points.length - 1));
  const y = (v) => padT + plotH - ((v - lo) / (hi - lo)) * plotH;
  // Ticks at the data's own extremes (rounded); the baseline labels itself.
  const tickVals = [...new Set([Math.round(dataHi), Math.round(dataLo)])].filter(t => !(near && t === baseline));
  const grid = tickVals.map(t => `
    <line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}" class="chart-grid"/>
    <text x="${padL - 6}" y="${y(t) + 3}" class="chart-tick" text-anchor="end">${svgText(format(t))}</text>`).join("");
  const base = !near ? "" : `
    <line x1="${padL}" x2="${W - padR}" y1="${y(baseline)}" y2="${y(baseline)}" class="chart-baseline"/>
    <text x="${padL - 6}" y="${y(baseline) + 3}" class="chart-tick" text-anchor="end">${svgText(format(baseline))}</text>`;
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.y)}`).join(" ");
  const last = points[points.length - 1];
  const dots = points.map((p, i) => `
    <circle cx="${x(i)}" cy="${y(p.y)}" r="4" class="chart-dot" style="fill:var(--chart-${sport})"/>
    <rect class="chart-hit" x="${x(i) - Math.max(plotW / points.length, 24) / 2}" y="${padT}" width="${Math.max(plotW / points.length, 24)}" height="${plotH}" tabindex="0" data-tip="${escapeHtml(p.tip)}"/>`).join("");
  const firstLabel = `<text x="${x(0)}" y="${H - 6}" class="chart-tick" text-anchor="start">${svgText(points[0].x)}</text>`;
  const lastLabel = points.length > 1 ? `<text x="${x(points.length - 1)}" y="${H - 6}" class="chart-tick" text-anchor="end">${svgText(last.x)}</text>` : "";
  return `
    <svg viewBox="0 0 ${W} ${H}" class="chart-svg" role="img" aria-label="${escapeHtml(invertNote)}">
      ${grid}${base}
      <path d="${d}" class="chart-line" style="stroke:var(--chart-${sport})"/>
      ${dots}
      <text x="${x(points.length - 1) + 8}" y="${y(last.y) - 8}" class="chart-value" text-anchor="${points.length > 1 ? "end" : "start"}">${svgText(format(last.y))}</text>
      ${firstLabel}${lastLabel}
    </svg>`;
}

// Horizontal bars, one hue (magnitude, not identity).
function rankedBarsHtml(rows, sport, unit) {
  const max = Math.max(...rows.map(r => r.value), 1);
  return `<div class="ranked">${rows.map(r => `
    <div class="ranked__row">
      <span class="ranked__name">${escapeHtml(r.name)}</span>
      <span class="ranked__track"><span class="ranked__bar" style="width:${Math.max((r.value / max) * 100, 3)}%;background:var(--chart-${sport})"></span></span>
      <span class="ranked__value num">${r.value}${unit ? ` ${unit}` : ""}</span>
    </div>`).join("")}</div>`;
}

const tableView = (summary, head, rows) => `
  <details class="chart-table">
    <summary>${summary}</summary>
    <table>
      <thead><tr>${head.map(h => `<th>${h}</th>`).join("")}</tr></thead>
      <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>
  </details>`;

// --- sections ----------------------------------------------------------------

function overviewHtml(all) {
  const today = todayISODate();
  const thisMonth = monthKey(today);
  const lastMonthDate = parseIso(today); lastMonthDate.setDate(1); lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
  const lastMonth = monthKey(isoDate(lastMonthDate));
  const nThis = all.filter(m => monthKey(m.date) === thisMonth).length;
  const nLast = all.filter(m => monthKey(m.date) === lastMonth).length;
  const diff = nThis - nLast;
  const { current, best } = weekStreaks(all.map(m => m.date));
  const nYear = all.filter(m => m.date.slice(0, 4) === today.slice(0, 4)).length;

  // last 12 weeks, oldest → newest
  const thisWeek = weekStartIso(today);
  const weeks = Array.from({ length: 12 }, (_, i) => ({ start: addDaysIso(thisWeek, -7 * (11 - i)), counts: {} }));
  const byStart = new Map(weeks.map(w => [w.start, w]));
  all.forEach(m => {
    const w = byStart.get(weekStartIso(m.date));
    if (w && INSIGHT_SPORTS.includes(m.sport)) w.counts[m.sport] = (w.counts[m.sport] || 0) + 1;
  });
  const used = INSIGHT_SPORTS.filter(k => weeks.some(w => w.counts[k]));
  const totalsBySport = Object.fromEntries(used.map(k => [k, weeks.reduce((s, w) => s + (w.counts[k] || 0), 0)]));

  return `
    <div class="stat-grid">
      ${statTile("This month", nThis, diff === 0 ? `Same as ${monthName(lastMonth)}` : `${diff > 0 ? "+" : "−"}${Math.abs(diff)} vs ${monthName(lastMonth)}`)}
      ${statTile("Week streak", current, current ? `week${current === 1 ? "" : "s"} in a row` : "Log something to start one")}
      ${statTile("Best streak", best, `week${best === 1 ? "" : "s"}`)}
      ${statTile(`In ${today.slice(0, 4)}`, nYear, `activit${nYear === 1 ? "y" : "ies"}`)}
    </div>

    <div class="card chart">
      <div class="card-head">
        <p class="label">Last 12 weeks</p>
        <p class="label">Activities</p>
      </div>
      ${used.length ? `
        <div class="chart-legend">
          ${used.map(k => `<span><i style="background:var(--chart-${k})"></i>${sportNames[k]} <span class="num">${totalsBySport[k]}</span></span>`).join("")}
        </div>
        ${weeklyColumnsSvg(weeks)}
        ${tableView("Show as table", ["Week of", ...used.map(k => sportNames[k])], weeks.map(w => [shortDate(w.start), ...used.map(k => w.counts[k] || 0)]))}
      ` : `<p class="empty-state" style="padding:12px 8px;">Nothing in the last 12 weeks.</p>`}
    </div>`;
}

function footballHtml(list) {
  const played = list.filter(m => Number.isFinite(m.goalsFor) && Number.isFinite(m.goalsAgainst));
  const w = played.filter(m => m.goalsFor > m.goalsAgainst).length;
  const d = played.filter(m => m.goalsFor === m.goalsAgainst).length;
  const l = played.length - w - d;
  const goals = list.reduce((s, m) => s + (Number(m.goals) || 0), 0);
  const assists = list.reduce((s, m) => s + (Number(m.assists) || 0), 0);
  const rated = list.filter(m => Number.isFinite(Number(m.matchRating)) && m.matchRating !== null && m.matchRating !== "");
  const avgRating = rated.length ? (rated.reduce((s, m) => s + Number(m.matchRating), 0) / rated.length).toFixed(1) : "–";
  const form = [...played].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).reverse();
  const outcome = (m) => (m.goalsFor > m.goalsAgainst ? "W" : m.goalsFor < m.goalsAgainst ? "L" : "D");
  return `
    <section class="insight-section" data-sport="football">
      <p class="eyebrow">Football</p>
      <div class="stat-grid">
        ${statTile("Played", list.length)}
        ${statTile("Record", `${w}–${d}–${l}`, "W–D–L")}
        ${statTile("Goals", goals, `${list.length ? (goals / list.length).toFixed(2) : 0} a game`)}
        ${statTile("Assists", assists)}
      </div>
      <div class="card insight-row">
        <div><p class="label">Last ${form.length}</p>
          <div class="form-strip" style="margin-top:8px;">${form.map(m => `<span class="form-pip" data-outcome="${outcome(m)}" title="${escapeHtml(`${m.opponent || "Unknown"} ${m.goalsFor}–${m.goalsAgainst}`)}">${outcome(m)}</span>`).join("") || `<span class="label">No results yet</span>`}</div>
        </div>
        <div style="text-align:right;"><p class="label">Avg rating</p><p class="stat-tile__value">${avgRating}</p></div>
      </div>
    </section>`;
}

function golfHtml(list) {
  const rounds = list.filter(m => Number.isFinite(m.strokes) && Number.isFinite(m.par) && m.par > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!rounds.length) return "";
  const vs = (m) => m.strokes - m.par;
  const fmt = (v) => (v === 0 ? "E" : v > 0 ? `+${v}` : `${v}`);
  const best = rounds.reduce((b, m) => (vs(m) < vs(b) ? m : b));
  const avg = rounds.reduce((s, m) => s + vs(m), 0) / rounds.length;
  const recent = rounds.slice(-12);
  const recentAvg = recent.slice(-5).reduce((s, m) => s + vs(m), 0) / Math.min(5, recent.length);
  const birdies = rounds.reduce((s, m) => s + (m.holes || []).filter(h => h.strokes && h.par && h.strokes < h.par).length, 0);
  const withHoles = rounds.filter(m => (m.holes || []).length).length;
  const points = recent.map(m => ({
    x: shortDate(m.date), y: vs(m),
    tip: `<strong>${escapeHtml(m.courseName || "Round")}</strong><br>${shortDate(m.date)} · ${m.strokes} (${fmt(vs(m))})${m.holesPlayed && m.holesPlayed !== 18 ? ` · ${m.holesPlayed} holes` : ""}`
  }));
  return `
    <section class="insight-section" data-sport="golf">
      <p class="eyebrow">Golf</p>
      <div class="stat-grid">
        ${statTile("Rounds", rounds.length)}
        ${statTile("Average", fmt(Math.round(avg * 10) / 10), "vs par")}
        ${statTile("Last 5", fmt(Math.round(recentAvg * 10) / 10), recentAvg < avg ? "better than avg" : recentAvg > avg ? "worse than avg" : "on your avg")}
        ${statTile("Best", fmt(vs(best)), `${escapeHtml(best.courseName || "")}${best.courseName ? " · " : ""}${shortDate(best.date)}`)}
      </div>
      ${recent.length >= 2 ? `
        <div class="card chart">
          <div class="card-head"><p class="label">Score vs par · last ${recent.length} rounds</p><p class="label">Lower is better</p></div>
          ${lineChartSvg(points, { sport: "golf", baseline: 0, format: fmt, invertNote: `Score versus par for the last ${recent.length} rounds` })}
          ${tableView("Show as table", ["Date", "Course", "Score", "vs par"], [...recent].reverse().map(m => [shortDate(m.date), escapeHtml(m.courseName || ""), m.strokes, fmt(vs(m))]))}
        </div>` : ""}
      ${withHoles ? `<p class="insight-note">${birdies} birdie${birdies === 1 ? "" : "s"} or better across ${withHoles} round${withHoles === 1 ? "" : "s"} with hole-by-hole scores.</p>` : ""}
    </section>`;
}

function gymHtml(list) {
  const sessions = [...list].sort((a, b) => a.date.localeCompare(b.date));
  const sets = sessions.flatMap(m => (m.sets || []).map(s => ({ ...s, date: m.date })));
  const thisMonth = monthKey(todayISODate());
  const monthSessions = sessions.filter(m => monthKey(m.date) === thisMonth).length;

  // muscle groups by number of sets (case-insensitive, keeps first spelling)
  const groups = new Map();
  sets.forEach(s => {
    const g = String(s.muscleGroup || "").trim();
    if (!g) return;
    const key = g.toLowerCase();
    const row = groups.get(key) || { name: g[0].toUpperCase() + g.slice(1), value: 0 };
    row.value++;
    groups.set(key, row);
  });
  const topGroups = [...groups.values()].sort((a, b) => b.value - a.value).slice(0, 5);

  // progress on the most-logged weighted exercise: heaviest set per session
  const byExercise = new Map();
  sets.filter(s => s.measure !== "time" && Number(s.weight) > 0 && s.exercise).forEach(s => {
    const key = s.exercise.trim().toLowerCase();
    const e = byExercise.get(key) || { name: s.exercise.trim(), days: new Map() };
    e.days.set(s.date, Math.max(e.days.get(s.date) || 0, Number(s.weight)));
    byExercise.set(key, e);
  });
  const top = [...byExercise.values()].sort((a, b) => b.days.size - a.days.size)[0];
  const progress = top && top.days.size >= 2
    ? [...top.days.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12)
    : null;

  const km = sets.reduce((s, x) => s + (x.measure === "time" ? Number(x.distance) || 0 : 0), 0);
  const secs = sets.reduce((s, x) => s + (x.measure === "time" ? Number(x.duration) || 0 : 0), 0);

  return `
    <section class="insight-section" data-sport="gym">
      <p class="eyebrow">Gym</p>
      <div class="stat-grid">
        ${statTile("Sessions", sessions.length, `${monthSessions} this month`)}
        ${statTile("Sets", sets.length, sessions.length ? `${(sets.length / sessions.length).toFixed(1)} a session` : "")}
        ${km ? statTile("Distance", km.toLocaleString("en-GB", { maximumFractionDigits: 1 }), "km logged") : ""}
        ${secs ? statTile("Cardio time", formatDuration(secs)) : ""}
      </div>
      ${topGroups.length ? `
        <div class="card">
          <div class="card-head"><p class="label">Most trained</p><p class="label">Sets</p></div>
          ${rankedBarsHtml(topGroups, "gym", "")}
        </div>` : ""}
      ${progress ? `
        <div class="card chart">
          <div class="card-head"><p class="label">${escapeHtml(top.name)} · heaviest set</p><p class="label">kg</p></div>
          ${lineChartSvg(progress.map(([date, w]) => ({ x: shortDate(date), y: w, tip: `<strong>${escapeHtml(top.name)}</strong><br>${shortDate(date)} · ${w} kg` })), { sport: "gym", format: (v) => `${v}`, invertNote: `Heaviest ${top.name} set per session` })}
          ${tableView("Show as table", ["Date", "Heaviest (kg)"], [...progress].reverse().map(([date, w]) => [shortDate(date), w]))}
        </div>` : ""}
    </section>`;
}

function cricketHtml(list) {
  const runs = list.reduce((s, m) => s + (Number(m.runsScored) || 0), 0);
  const wickets = list.reduce((s, m) => s + (Number(m.wicketsTaken) || 0), 0);
  const high = Math.max(0, ...list.map(m => Number(m.runsScored) || 0));
  return `
    <section class="insight-section" data-sport="cricket">
      <p class="eyebrow">Cricket</p>
      <div class="stat-grid">
        ${statTile("Matches", list.length)}
        ${statTile("Runs", runs, `high score ${high}`)}
        ${statTile("Wickets", wickets)}
      </div>
    </section>`;
}

function renderInsights() {
  viewLabel.textContent = "Insights";
  viewTitle.textContent = "Your stats";
  // One malformed row shouldn't take the whole tab down: anything without a
  // usable date is left out.
  // Rows whose detail row never saved (an old half-failed save) aren't real
  // activities, so they don't count towards streaks or totals either.
  const hasDetails = (m) =>
    m.sport === "gym" ? Array.isArray(m.sets)
    : m.sport === "golf" ? m.strokes !== undefined
    : m.sport === "football" || m.sport === "cricket" ? m.opponent !== undefined || m.goalsFor !== undefined || m.runsScored !== undefined
    : true;
  const all = matches.filter(m => typeof m.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(m.date) && hasDetails(m));
  if (!all.length) {
    matchList.innerHTML = `<div class="card" style="text-align:center;"><p class="stat-value">Nothing to show yet</p>
      <p style="font:var(--t-body);color:var(--muted);margin-top:6px;">Log an activity with the + button and your stats will build up here.</p></div>`;
    return;
  }
  const bySport = (k) => all.filter(m => m.sport === k);
  const sections = [
    ["football", footballHtml], ["golf", golfHtml], ["gym", gymHtml], ["cricket", cricketHtml]
  ].map(([k, fn]) => {
    const list = bySport(k);
    if (!list.length) return "";
    try { return fn(list); } catch (err) { console.error(`Insights: ${k} section failed`, err); return ""; }
  }).join("");

  matchList.innerHTML = `<div class="insights">${overviewHtml(all)}${sections}</div>`;

  // Tooltips: hover on desktop, tap on phones, focus for keyboards.
  matchList.querySelectorAll(".chart-hit").forEach(el => {
    const show = () => showTip(el, el.dataset.tip);
    el.addEventListener("pointerenter", show);
    el.addEventListener("pointerdown", show);
    el.addEventListener("focus", show);
    el.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") hideTip(); });
    el.addEventListener("blur", hideTip);
  });
}
