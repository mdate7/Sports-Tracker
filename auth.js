const SUPABASE_URL = "https://saaiukdzwllatqtdqqhf.supabase.co";
const SUPABASE_KEY = "sb_publishable_Lie3FVMBz9Y4Buwumkyn6g_Q0JSMj4s"; // paste your actual key

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

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


function showOnboarding() {
  document.getElementById("auth-screen").style.display = "none";
  document.querySelector(".app").style.display = "none";
  document.getElementById("onboarding-screen").style.display = "flex";
}

document.getElementById("onboard-sports").addEventListener("click", (event) => {
  const chip = event.target.closest(".chip");
  if (!chip) return;
  const isPressed = chip.getAttribute("aria-pressed") === "true";
  chip.setAttribute("aria-pressed", isPressed ? "false" : "true");
});

document.getElementById("onboard-continue-btn").addEventListener("click", async () => {
  const selected = Array.from(document.querySelectorAll('#onboard-sports .chip[aria-pressed="true"]'))
    .map(chip => chip.dataset.sportOption);

  const userId = await ensureSignedIn();
  if (!userId) return;

  const { data, error } = await supabaseClient
    .from("profiles")
    .insert({ id: userId, sports_tracked: selected })
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
  document.querySelector(".app").style.display = "none";
}