
const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

const authForm = document.getElementById("authForm");
const formTitle = document.getElementById("formTitle");
const formSubtitle = document.getElementById("formSubtitle");
const usernameField = document.getElementById("usernameField");
const usernameInput = document.getElementById("username");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const submitButton = document.getElementById("submitButton");
const githubButton = document.getElementById("githubButton");
const switchButton = document.getElementById("switchButton");
const switchText = document.getElementById("switchText");
const message = document.getElementById("message");

let isSignUp = false;
let busy = false;

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
    : isSignUp
      ? "Create account"
      : "Sign in";
}

function updateFormMode() {
  formTitle.textContent = isSignUp ? "Create your account" : "Welcome back";
  formSubtitle.textContent = isSignUp
    ? "Choose a username to start your playbook."
    : "Sign in to get back to your playbook.";

  usernameField.hidden = !isSignUp;
  usernameInput.required = isSignUp;
  passwordInput.autocomplete = isSignUp ? "new-password" : "current-password";
  switchText.textContent = isSignUp
    ? "Already have an account?"
    : "New to Identity?";
  switchButton.textContent = isSignUp ? "Sign in" : "Create account";
  setBusy(false);
}

switchButton.addEventListener("click", () => {
  if (busy) return;
  isSignUp = !isSignUp;
  showMessage("");
  updateFormMode();
});

async function createUsernameProfile(user, username) {
  const cleanUsername = username.trim();

  const { error } = await supabaseClient
    .from("identity_profiles")
    .insert({
      id: user.id,
      username: cleanUsername
    });

  if (error) {
    if (error.code === "23505") {
      throw new Error("That username is already taken. Please choose another.");
    }
    throw error;
  }
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy) return;

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  setBusy(true);
  showMessage("");

  try {
    if (isSignUp) {
      const username = usernameInput.value.trim();

      if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
        throw new Error(
          "Use 3–20 characters for your username: letters, numbers, or underscores."
        );
      }

      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin + window.location.pathname
        }
      });

      if (error) throw error;

      if (data.session && data.user) {
        await createUsernameProfile(data.user, username);
        showMessage("Account created! Your playbook is ready to build.");
        await showSignedInState(data.user);
      } else {
        showMessage(
          "Account created! Check your email to confirm your account. Then sign in to finish setting up your profile."
        );
        isSignUp = false;
        updateFormMode();
      }
    } else {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;
      await finishLogin(data.user);
    }
  } catch (error) {
    showMessage(error.message || "Something went wrong. Please try again.", true);
  } finally {
    setBusy(false);
  }
});

githubButton.addEventListener("click", async () => {
  if (busy) return;

  setBusy(true);
  showMessage("");

  try {
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: window.location.origin + window.location.pathname
      }
    });

    if (error) throw error;
  } catch (error) {
    showMessage(error.message || "GitHub sign-in could not start.", true);
    setBusy(false);
  }
});

async function finishLogin(user) {
  const { data: profile, error } = await supabaseClient
    .from("identity_profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;

  if (!profile) {
    showUsernameSetup(user);
    return;
  }

  await showSignedInState(user, profile.username);
}

function showUsernameSetup(user) {
  isSignUp = true;
  updateFormMode();
  formTitle.textContent = "Choose your username";
  formSubtitle.textContent = "One last step before your playbook is ready.";
  usernameInput.value = "";
  usernameField.hidden = false;
  usernameInput.required = true;
  authForm.onsubmit = null;

  authForm.addEventListener("submit", async function setupUsername(event) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    try {
      const username = usernameInput.value.trim();

      if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
        throw new Error("Use 3–20 letters, numbers, or underscores.");
      }

      await createUsernameProfile(user, username);
      authForm.removeEventListener("submit", setupUsername);
      await showSignedInState(user, username);
      showMessage("Username saved!");
    } catch (error) {
      showMessage(error.message || "Could not save your username.", true);
    } finally {
      setBusy(false);
    }
  });
}

async function showSignedInState(user, username = "") {
  authForm.hidden = true;
  githubButton.hidden = true;
  switchText.hidden = true;
  switchButton.hidden = true;
  formTitle.textContent = "You're signed in!";
  formSubtitle.textContent = username
    ? `Welcome, ${username}. Your Identity Playbook account is ready.`
    : "Your account is connected.";
  showMessage("Next, we'll add your saved plays and file uploads.");

  let signOutButton = document.getElementById("signOutButton");

  if (!signOutButton) {
    signOutButton = document.createElement("button");
    signOutButton.id = "signOutButton";
    signOutButton.textContent = "Sign out";
    signOutButton.className = "secondary";
    signOutButton.type = "button";
    document.querySelector(".auth-card").appendChild(signOutButton);

    signOutButton.addEventListener("click", async () => {
      const { error } = await supabaseClient.auth.signOut();

      if (error) {
        showMessage(error.message, true);
        return;
      }

      window.location.reload();
    });
  }
}

async function initializeApp() {
  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    showMessage(error.message, true);
    return;
  }

  if (data.session) {
    try {
      await finishLogin(data.session.user);
    } catch (error) {
      showMessage(error.message || "Could not load your profile.", true);
    }
  }
}

supabaseClient.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT") {
    window.location.reload();
  }
});

updateFormMode();
initializeApp();
