// Social: following people and the Following feed.
//
// Following is open: anyone signed in can follow anyone, and RLS
// (migration 20261018010000) then lets the follower READ that person's
// activities. People are found through two narrow database functions,
// search_people() and people_by_ids(), which return only id, display name
// and sports, so the profiles table itself stays private.

let feedScope = "mine";             // "mine" | "following"
let followingIds = new Set();       // people I follow
let followerIds = new Set();        // people who follow me
let followingMatches = null;        // cached Following feed; null = needs loading
const peopleById = new Map();       // id -> { id, display_name, sports_tracked }
let meSubView = null;               // null | "people"

async function loadFollows() {
  const userId = await ensureSignedIn();
  if (!userId) return;
  // RLS returns rows where I'm either side, so one query gives both lists.
  const { data, error } = await supabaseClient.from("follows").select("follower_id, followee_id");
  if (error) {
    console.error("Failed to load follows:", error);
    return;
  }
  followingIds = new Set(data.filter(r => r.follower_id === userId).map(r => r.followee_id));
  followerIds = new Set(data.filter(r => r.followee_id === userId).map(r => r.follower_id));
}

async function ensurePeople(ids) {
  const missing = [...new Set(ids)].filter(id => id && !peopleById.has(id));
  if (!missing.length) return;
  const { data, error } = await supabaseClient.rpc("people_by_ids", { ids: missing });
  if (error) {
    console.error("Failed to load people:", error);
    return;
  }
  (data || []).forEach(p => peopleById.set(p.id, p));
}

const personName = (id) => peopleById.get(id)?.display_name || "Someone";

function initials(name) {
  return String(name || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";
}

async function followPerson(id) {
  const userId = await ensureSignedIn();
  const { error } = await supabaseClient.from("follows").insert({ follower_id: userId, followee_id: id });
  // Already following (e.g. from another device) is fine: treat as success.
  if (error && error.code !== "23505") {
    console.error("Failed to follow:", error);
    alert("Couldn't follow them just now. Try again.");
    return false;
  }
  followingIds.add(id);
  followingMatches = null;
  return true;
}

async function unfollowPerson(id) {
  const userId = await ensureSignedIn();
  const { error } = await supabaseClient.from("follows").delete().eq("follower_id", userId).eq("followee_id", id);
  if (error) {
    console.error("Failed to unfollow:", error);
    alert("Couldn't unfollow them just now. Try again.");
    return false;
  }
  followingIds.delete(id);
  followingMatches = null;
  return true;
}

// --- Following feed --------------------------------------------------------

async function loadFollowingFeed() {
  if (!followingIds.size) return [];
  const { data, error } = await supabaseClient
    .from("matches")
    .select("*, football_details(*), cricket_details(*), golf_details(*), golf_holes(*), gym_details(*), gym_sets(*)")
    .in("user_id", [...followingIds])
    .order("date", { ascending: false })
    .limit(60);
  if (error) {
    console.error("Failed to load following feed:", error);
    return null;
  }
  await ensurePeople(data.map(r => r.user_id));
  return data.map(flattenMatchRow);
}

function matchHeroHtml(match) {
  if (match.sport === "football") {
    const result = getFootballResult(match);
    const cls = result === "Loss" ? "verdict--loss" : result === "Draw" ? "verdict--draw" : "";
    return `<span class="verdict ${cls}">${result.toUpperCase()}</span>`;
  }
  if (match.sport === "golf") {
    return `<span class="delta num ${match.strokes > match.par ? "delta--neg" : ""}">${getGolfScoreVsPar(match)}</span>`;
  }
  if (match.sport === "gym") {
    const sets = match.sets || [];
    const allTimed = sets.length && sets.every(s => s.measure === "time");
    const seconds = sets.reduce((sum, s) => sum + (Number(s.duration) || 0), 0);
    return allTimed && seconds
      ? `<span class="delta num">${formatDuration(seconds)}</span>`
      : `<span class="delta num">${sets.length} set${sets.length === 1 ? "" : "s"}</span>`;
  }
  return "";
}

// A read-only card for someone else's activity. Date and rating are left out
// of the stats (the date is in the header; a rating is personal).
function friendMatchCardHtml(match) {
  const name = personName(match.userId);
  // Opponent and course are already in the title, and "Your goals" reads
  // wrongly on someone else's card.
  const hidden = new Set(["date", "matchRating", "opponent", "courseName"]);
  const stats = getFieldsForSport(match.sport)
    .filter(f => f.summary && !hidden.has(f.key))
    .map(f => `<div><span class="stat-value num">${escapeHtml(match[f.key])}</span><p class="label">${f.label.replace(/^Your /, "")}</p></div>`)
    .join("");
  const breakdown = match.sport === "golf" ? renderGolfDetailHtml(match)
    : match.sport === "gym" ? renderGymDetailHtml(match) : "";
  const title = match.opponent || match.courseName || (match.sport === "gym" ? gymSessionTitle(match) : "");
  return `
    <div class="card friend-card" data-sport="${match.sport}">
      <div class="friend-card__who">
        <span class="avatar" aria-hidden="true">${escapeHtml(initials(name))}</span>
        <span class="friend-card__name">${escapeHtml(name)}</span>
        <span class="label">${match.date ? formatFixtureDate(match.date) : ""}</span>
      </div>
      <div class="card-head" style="margin-top:12px;">
        <p class="eyebrow">${sportNames[match.sport] || ""}${title ? ` · ${escapeHtml(title)}` : ""}</p>
        ${matchHeroHtml(match)}
      </div>
      ${stats ? `<div class="stats">${stats}</div>` : ""}
      ${match.notes ? `<p class="friend-card__notes">“${escapeHtml(match.notes)}”</p>` : ""}
      ${breakdown ? `
        <button type="button" class="btn btn--ghost btn--sm" data-friend-toggle style="margin-top:12px;">Show breakdown</button>
        <div class="friend-card__more" hidden>${breakdown}</div>
      ` : ""}
    </div>
  `;
}

async function renderFollowingFeed() {
  if (!followingIds.size) {
    matchList.innerHTML = `
      <div class="card" style="text-align:center;">
        <p class="stat-value">Follow people to see their activity here</p>
        <p style="font:var(--t-body);color:var(--muted);margin:6px 0 14px;">Start with your teammates, or search by name.</p>
        <button type="button" class="btn" data-open-people>Find people</button>
      </div>
    `;
    return;
  }
  if (followingMatches === null) {
    matchList.innerHTML = `<p class="empty-state">Loading…</p>`;
    const loaded = await loadFollowingFeed();
    // The person may have switched back to their own feed while this loaded.
    if (currentMode !== "feed" || feedScope !== "following") return;
    if (loaded === null) {
      matchList.innerHTML = `<p class="empty-state">Couldn't load the feed. Pull down or switch tabs to try again.</p>`;
      return;
    }
    followingMatches = loaded;
  }
  const list = currentView === "all" ? followingMatches : followingMatches.filter(m => m.sport === currentView);
  matchList.innerHTML = list.length
    ? list.map(m => {
        try { return friendMatchCardHtml(m); } catch (err) { console.error("Skipped a feed item:", m, err); return ""; }
      }).join("") + `<button type="button" class="btn btn--ghost btn--sm" data-open-people style="margin-top:4px;">Find more people</button>`
    : `<p class="empty-state">Nothing ${currentView === "all" ? "" : sportNames[currentView].toLowerCase() + " "}from the people you follow yet.</p>`;
}

function setFeedScope(scope) {
  feedScope = scope;
  document.querySelectorAll("#feed-scope .chip").forEach(c =>
    c.setAttribute("aria-pressed", c.dataset.feedScope === scope ? "true" : "false"));
  renderView();
}

// --- People screen ---------------------------------------------------------

async function loadTeammateIds() {
  const userId = await ensureSignedIn();
  const teamIds = (userTeams || []).map(t => t.id).filter(Boolean);
  if (!teamIds.length) return [];
  const { data, error } = await supabaseClient.from("team_members").select("user_id").in("team_id", teamIds);
  if (error) {
    console.error("Failed to load teammates:", error);
    return [];
  }
  return [...new Set(data.map(r => r.user_id))].filter(id => id && id !== userId);
}

function personRowHtml(id) {
  const p = peopleById.get(id);
  const name = p?.display_name || "Someone";
  const following = followingIds.has(id);
  const sports = (p?.sports_tracked || []).map(s => sportNames[s]).filter(Boolean).join(" · ");
  return `
    <div class="person-row">
      <span class="avatar" aria-hidden="true">${escapeHtml(initials(name))}</span>
      <span class="person-row__main">
        <span class="person-row__name">${escapeHtml(name)}</span>
        ${sports || followerIds.has(id) ? `<span class="label">${escapeHtml(sports)}${followerIds.has(id) ? `${sports ? " · " : ""}Follows you` : ""}</span>` : ""}
      </span>
      <button type="button" class="chip" data-follow-toggle="${id}" aria-pressed="${following}">${following ? "Following" : "Follow"}</button>
    </div>
  `;
}

const peopleListHtml = (ids, empty) =>
  ids.length ? ids.map(personRowHtml).join("") : `<p class="empty-state" style="padding:8px;">${empty}</p>`;

let peopleSearchTimer = null;

async function renderPeopleScreen() {
  viewLabel.textContent = "Me";
  viewTitle.textContent = "People";
  matchList.innerHTML = `<p class="empty-state">Loading…</p>`;

  const teammateIds = await loadTeammateIds();
  await ensurePeople([...teammateIds, ...followingIds, ...followerIds]);
  if (currentMode !== "me" || meSubView !== "people") return;

  const byName = (a, b) => personName(a).localeCompare(personName(b));
  const suggestions = teammateIds.filter(id => !followingIds.has(id)).sort(byName);

  matchList.innerHTML = `
    <button type="button" id="people-back-btn" class="btn btn--ghost btn--sm">← Back</button>
    <div class="field" style="margin:0;">
      <label class="label" for="people-search">Search by name</label>
      <input type="search" id="people-search" placeholder="e.g. Harry" autocomplete="off">
    </div>
    <div class="card" id="people-results" hidden></div>

    ${suggestions.length ? `
      <p class="label section-label">From your teams</p>
      <div class="card">${peopleListHtml(suggestions, "")}</div>
    ` : ""}

    <p class="label section-label">Following (${followingIds.size})</p>
    <div class="card">${peopleListHtml([...followingIds].sort(byName), "You're not following anyone yet.")}</div>

    <p class="label section-label">Followers (${followerIds.size})</p>
    <div class="card">${peopleListHtml([...followerIds].sort(byName), "No followers yet.")}</div>

    <p class="privacy-note">Following is open on The Clubhouse. Anyone signed in can follow you and see your activities, including notes. They can't change anything.</p>
  `;

  document.getElementById("people-back-btn").addEventListener("click", () => {
    meSubView = null;
    renderView();
  });

  const input = document.getElementById("people-search");
  const results = document.getElementById("people-results");
  input.addEventListener("input", () => {
    clearTimeout(peopleSearchTimer);
    const q = input.value.trim();
    if (q.length < 2) { results.hidden = true; results.innerHTML = ""; return; }
    peopleSearchTimer = setTimeout(async () => {
      const { data, error } = await supabaseClient.rpc("search_people", { q });
      if (input.value.trim() !== q) return; // a newer search is on its way
      results.hidden = false;
      if (error) {
        console.error("Search failed:", error);
        results.innerHTML = `<p class="empty-state" style="padding:8px;">Search isn't working right now.</p>`;
        return;
      }
      (data || []).forEach(p => peopleById.set(p.id, p));
      results.innerHTML = peopleListHtml((data || []).map(p => p.id), `No one called “${escapeHtml(q)}” yet.`);
    }, 250);
  });
}

// Follow buttons live in several lists (and can show the same person twice),
// so one delegated listener handles them all and updates every copy.
document.getElementById("match-list").addEventListener("click", async (event) => {
  if (event.target.closest("[data-open-people]")) {
    meSubView = "people";
    setMode("me");
    return;
  }

  const toggle = event.target.closest("[data-friend-toggle]");
  if (toggle) {
    const more = toggle.nextElementSibling;
    more.hidden = !more.hidden;
    toggle.textContent = more.hidden ? "Show breakdown" : "Hide breakdown";
    return;
  }

  const btn = event.target.closest("[data-follow-toggle]");
  if (!btn) return;
  const id = btn.dataset.followToggle;
  const copies = matchList.querySelectorAll(`[data-follow-toggle="${id}"]`);
  copies.forEach(b => (b.disabled = true));
  const ok = followingIds.has(id) ? await unfollowPerson(id) : await followPerson(id);
  copies.forEach(b => {
    b.disabled = false;
    if (ok) {
      b.setAttribute("aria-pressed", followingIds.has(id) ? "true" : "false");
      b.textContent = followingIds.has(id) ? "Following" : "Follow";
    }
  });
});

// The small card on the Me screen.
function peopleSummaryCardHtml() {
  return `
    <div class="card">
      <p class="label">People</p>
      <div class="stats" style="margin-top:10px;padding-top:0;border-top:0;">
        <div><span class="stat-value num">${followingIds.size}</span><p class="label">Following</p></div>
        <div><span class="stat-value num">${followerIds.size}</span><p class="label">Followers</p></div>
      </div>
      <button type="button" class="btn btn--ghost" data-open-people style="margin-top:14px;">Find people</button>
      <p class="privacy-note" style="margin-bottom:0;">Anyone signed in can follow you and see your activities, including notes.</p>
    </div>
  `;
}
