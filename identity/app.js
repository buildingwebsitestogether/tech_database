
const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

const $ = (id) => document.getElementById(id);

const authForm = $("authForm");
const formTitle = $("formTitle");
const formSubtitle = $("formSubtitle");
const usernameField = $("usernameField");
const usernameInput = $("username");
const emailInput = $("email");
const passwordInput = $("password");
const submitButton = $("submitButton");
const githubButton = $("githubButton");
const switchButton = $("switchButton");
const switchText = $("switchText");
const message = $("message");
const authCard = document.querySelector(".auth-card");

let mode = "login";
let busy = false;
let setupUser = null;

function showMessage(text, isError = false) {
  message.textContent = text;
  message.style.color = isError ? "#ff7777" : "#8fe3a1";
}

function setBusy(value) {
  busy = value;
  submitButton.disabled = value;
  githubButton.disabled = value;
  switchButton.disabled = value;

  submitButton.textContent = value
    ? "Please wait..."
    : mode === "signup"
      ? "Create account"
      : mode === "username"
        ? "Save username"
        : "Sign in";
}

function setMode(nextMode) {
  mode = nextMode;

  authForm.hidden = false;
  githubButton.hidden = false;
  switchText.hidden = false;
  switchButton.hidden = false;

  usernameField.hidden =
    mode !== "signup" && mode !== "username";

  usernameInput.required =
    mode === "signup" || mode === "username";

  formTitle.textContent =
    mode === "signup" ? "Create your account" :
    mode === "username" ? "Choose your username" :
    "Welcome back";

  formSubtitle.textContent =
    mode === "signup" ? "Choose a username to start your playbook." :
    mode === "username" ? "One last step to set up your profile." :
    "Sign in to get back to your playbook.";

  switchText.textContent =
    mode === "signup" || mode === "username"
      ? "Already have an account?"
      : "New to Identity?";

  switchButton.textContent =
    mode === "signup" || mode === "username"
      ? "Sign in"
      : "Create account";

  passwordInput.autocomplete =
    mode === "signup" ? "new-password" : "current-password";

  setBusy(false);
  showMessage("");
}

function validUsername(value) {
  return /^[A-Za-z0-9_]{3,20}$/.test(value);
}

async function saveUsername(user, username) {
  const cleanUsername = username.trim();

  const { error } = await supabaseClient
    .from("identity_profiles")
    .upsert(
      {
        id: user.id,
        username: cleanUsername
      },
      { onConflict: "id" }
    );

  if (error) {
    if (error.code === "23505") {
      throw new Error(
        "That username is already taken. Please choose another."
      );
    }

    throw error;
  }

  return cleanUsername;
}

async function showDashboard(user, username) {
  authForm.hidden = true;
  githubButton.hidden = true;
  switchText.hidden = true;
  switchButton.hidden = true;

  formTitle.textContent = "You're signed in!";

  formSubtitle.textContent = username
    ? `Welcome, ${username}. Your playbook is ready to build.`
    : "Your account is connected.";

  showMessage(
    "Your account is connected. Next, we'll add saved plays and uploads."
  );

  let signOutButton = $("signOutButton");

  if (!signOutButton) {
    signOutButton = document.createElement("button");
    signOutButton.id = "signOutButton";
    signOutButton.className = "secondary";
    signOutButton.type = "button";
    signOutButton.textContent = "Sign out";

    authCard.appendChild(signOutButton);

    signOutButton.addEventListener("click", async () => {
      signOutButton.disabled = true;

      const { error } = await supabaseClient.auth.signOut();

      if (error) {
        showMessage(error.message, true);
        signOutButton.disabled = false;
        return;
      }

      window.location.reload();
    });
  }
}

async function handleSignedIn(user) {
  const { data: profile, error } = await supabaseClient
    .from("identity_profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;

  if (profile) {
    await showDashboard(user, profile.username);
    return;
  }

  const savedUsername = user.user_metadata?.playbook_username;

  if (savedUsername) {
    const username = await saveUsername(user, savedUsername);
    await showDashboard(user, username);
    return;
  }

  setupUser = user;
  setMode("username");
  showMessage("Choose a username to finish setting up your account.");
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (busy) return;

  setBusy(true);
  showMessage("");

  try {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (mode === "signup") {
      const username = usernameInput.value.trim();

      if (!validUsername(username)) {
        throw new Error(
          "Use 3–20 characters: letters, numbers, or underscores."
        );
      }

      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo:
            window.location.origin + window.location.pathname,
          data: {
            playbook_username: username
          }
        }
      });

      if (error) throw error;

      if (data.session && data.user) {
        await handleSignedIn(data.user);
      } else {
        setMode("login");
        showMessage(
          "Account created! Confirm your email, then sign in. Your username will be retrieved from your account."
        );
      }

      return;
    }

    if (mode === "username") {
      if (!setupUser) {
        throw new Error(
          "Your session has expired. Please sign in again."
        );
      }

      const username = usernameInput.value.trim();

      if (!validUsername(username)) {
        throw new Error(
          "Use 3–20 characters: letters, numbers, or underscores."
        );
      }

      const savedUsername = await saveUsername(setupUser, username);
      await showDashboard(setupUser, savedUsername);
      showMessage("Username saved!");
      return;
    }

    const { data, error } =
      await supabaseClient.auth.signInWithPassword({
        email,
        password
      });

    if (error) throw error;

    await handleSignedIn(data.user);
  } catch (error) {
    showMessage(
      error.message || "Something went wrong. Please try again.",
      true
    );
  } finally {
    setBusy(false);
  }
});

switchButton.addEventListener("click", () => {
  if (busy) return;

  if (mode === "username" && setupUser) {
    showMessage(
      "Please finish choosing your username before switching forms.",
      true
    );
    return;
  }

  setMode(mode === "login" ? "signup" : "login");
});

githubButton.addEventListener("click", async () => {
  if (busy) return;

  setBusy(true);
  showMessage("");

  try {
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo:
          window.location.origin + window.location.pathname
      }
    });

    if (error) throw error;
  } catch (error) {
    showMessage(
      error.message || "GitHub sign-in could not start.",
      true
    );
    setBusy(false);
  }
});

async function initializeApp() {
  try {
    const { data, error } = await supabaseClient.auth.getSession();

    if (error) throw error;

    if (data.session) {
      await handleSignedIn(data.session.user);
    }
  } catch (error) {
    showMessage(
      error.message || "Could not load your session.",
      true
    );
  }
}

supabaseClient.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") {
    window.location.reload();
  }
});

setMode("login");
initializeApp();
