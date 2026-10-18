const SUPABASE_URL = "https://saaiukdzwllatqtdqqhf.supabase.co";
const SUPABASE_KEY = "sb_publishable_Lie3FVMBz9Y4Buwumkyn6g_Q0JSMj4s"; // paste your actual key

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Everything is rendered with template strings into innerHTML, so any text a
// person typed (names, opponents, notes, course names) has to be escaped first.
// Otherwise a name like `O'Neil <3` breaks the markup, and a crafted one could
// run script for every teammate who views it. Lives here because auth.js loads
// first. null/undefined become "".
function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function ensureSignedIn() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  return session ? session.user.id : null;
}

async function loadProfile(userId) {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("Failed to load profile:", error);
    return null;
  }
  return data;
}


// The name a team already uses for this person (from a team sheet or the
// WhatsApp backfill), used to pre-fill the name question. "" if none.
async function suggestNameFromTeams() {
  const userId = await ensureSignedIn();
  if (!userId) return "";
  const { data, error } = await supabaseClient
    .from("players")
    .select("display_name")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) {
    console.error("Couldn't look up a team name:", error);
    return "";
  }
  return (data && data[0]?.display_name?.trim()) || "";
}

const hasDisplayName = (profile) => !!String(profile?.display_name || "").trim();

async function showOnboarding() {
  document.getElementById("auth-screen").style.display = "none";
  document.querySelector(".app").style.display = "none";
  document.getElementById("onboarding-screen").style.display = "flex";
  const input = document.getElementById("onboard-name");
  if (!input.value) input.value = await suggestNameFromTeams();
}

// For accounts made before onboarding asked for a name. Shown once, on the
// next sign-in, because search and the Following feed are useless without it.
async function showNamePrompt() {
  document.getElementById("auth-screen").style.display = "none";
  document.getElementById("onboarding-screen").style.display = "none";
  document.querySelector(".app").style.display = "none";
  document.getElementById("name-screen").style.display = "flex";
  const input = document.getElementById("name-screen-input");
  if (!input.value) input.value = await suggestNameFromTeams();
  input.focus();
}

document.getElementById("name-screen-btn").addEventListener("click", async () => {
  const name = document.getElementById("name-screen-input").value.trim();
  const statusEl = document.getElementById("name-screen-status");
  if (!name) {
    statusEl.textContent = "Add a name to carry on.";
    return;
  }
  const { data, error } = await supabaseClient
    .from("profiles")
    .update({ display_name: name })
    .eq("id", userProfile.id)
    .select()
    .single();
  if (error) {
    console.error("Failed to save name:", error);
    statusEl.textContent = "Something went wrong. Try again.";
    return;
  }
  userProfile = data;
  document.getElementById("name-screen").style.display = "none";
  await showApp();
});

document.getElementById("onboard-sports").addEventListener("click", (event) => {
  const chip = event.target.closest(".chip");
  if (!chip) return;
  const isPressed = chip.getAttribute("aria-pressed") === "true";
  chip.setAttribute("aria-pressed", isPressed ? "false" : "true");
});

document.getElementById("onboard-continue-btn").addEventListener("click", async () => {
  const selected = Array.from(document.querySelectorAll('#onboard-sports .chip[aria-pressed="true"]'))
    .map(chip => chip.dataset.sportOption);

  const name = document.getElementById("onboard-name").value.trim();
  if (!name) {
    document.getElementById("onboard-status").textContent = "Add your name so teammates can find you.";
    document.getElementById("onboard-name").focus();
    return;
  }

  const userId = await ensureSignedIn();
  if (!userId) return;

  const { data, error } = await supabaseClient
    .from("profiles")
    .insert({ id: userId, display_name: name, sports_tracked: selected })
    .select()
    .single();

  if (error) {
    console.error("Failed to save profile:", error);
    document.getElementById("onboard-status").textContent = "Something went wrong — try again.";
    return;
  }

  userProfile = data;
  document.getElementById("onboarding-screen").style.display = "none";
  await showApp();
});

document.getElementById("auth-send-btn").addEventListener("click", async () => {
  const email = document.getElementById("auth-email").value.trim();
  const statusEl = document.getElementById("auth-status");
  if (!email) return;

  statusEl.textContent = "Sending...";
  const { error } = await supabaseClient.auth.signInWithOtp({ email });

  if (error) {
    console.error("Failed to send code:", error);
    statusEl.textContent = "Something went wrong — try again.";
    return;
  }

  statusEl.textContent = "Enter the code from your email below.";
  document.getElementById("auth-code-field").style.display = "block";
  document.getElementById("auth-verify-btn").style.display = "block";
});

document.getElementById("auth-verify-btn").addEventListener("click", async () => {
  const email = document.getElementById("auth-email").value.trim();
  const token = document.getElementById("auth-code").value.trim();
  const statusEl = document.getElementById("auth-status");

  const { error } = await supabaseClient.auth.verifyOtp({ email, token, type: "email" });

  if (error) {
    console.error("Failed to verify code:", error);
    statusEl.textContent = "That code didn't work — check it and try again.";
    return;
  }
});

function showAuthScreen() {
  document.getElementById("auth-screen").style.display = "flex";
  document.getElementById("onboarding-screen").style.display = "none";
  document.getElementById("name-screen").style.display = "none";
  document.querySelector(".app").style.display = "none";
}