
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

const FILE_BUCKET = "identity-playbook-files";
const MAX_FILE_SIZE = 10 * 1024 * 1024;

let mode = "login";
let busy = false;
let setupUser = null;
let currentUser = null;
let currentUsername = "";
let plays = [];

function showMessage(text, isError = false) {
  message.textContent = text;
  message.style.color = isError ? "#ff7777" : "#8fe3a1";
}

function validUsername(value) {
  return /^[A-Za-z0-9_]{3,20}$/.test(value);
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

async function saveUsername(user, username) {
  const clean = username.trim();

  const { error } = await supabaseClient
    .from("identity_profiles")
    .upsert(
      { id: user.id, username: clean },
      { onConflict: "id" }
    );

  if (error) {
    if (error.code === "23505") {
      throw new Error("That username is already taken.");
    }
    throw error;
  }

  return clean;
}

function showDashboard() {
  authCard.innerHTML = `
    <div class="dashboard">
      <p class="eyebrow">IDENTITY PLAYBOOK</p>
      <h1>Welcome, ${escapeHTML(currentUsername)}.</h1>
      <p class="dashboard-intro">
        Your game. Your identity. Build your next possession.
      </p>

      <div class="dashboard-stats">
        <div class="stat-card">
          <span id="playCount">0</span>
          <p>Total plays</p>
        </div>
        <div class="stat-card">
          <span id="offenseCount">0</span>
          <p>Offensive plays</p>
        </div>
        <div class="stat-card">
          <span id="defenseCount">0</span>
          <p>Defensive plays</p>
        </div>
      </div>

      <div class="dashboard-actions">
        <button id="showPlaysButton" type="button">My Plays</button>
        <button id="newPlayButton" type="button">+ Create a Play</button>
        <button id="dashboardSignOut" class="secondary" type="button">Sign out</button>
      </div>

      <section id="filesSection">
        <h2>My Files</h2>
        <p class="files-help">
          Store images and PDFs for your basketball playbook.
          Maximum size: 10 MB per file.
        </p>

        <form id="fileUploadForm">
          <label for="fileInput">Choose an image or PDF</label>
          <input
            id="fileInput"
            type="file"
            accept="image/*,application/pdf"
            required
          >
          <button id="uploadFileButton" type="submit">Upload File</button>
          <p id="fileMessage" role="status" aria-live="polite"></p>
        </form>

        <div id="filesList">
          <p>Loading your files...</p>
        </div>
      </section>

      <section id="playEditor" hidden>
        <h2 id="editorTitle">Create a play</h2>
        <form id="playForm">
          <label for="playTitle">Play name</label>
          <input id="playTitle" maxlength="100" required
            placeholder="e.g. Horns Pick and Roll">

          <label for="playType">Play type</label>
          <select id="playType" required>
            <option value="offense">Offense</option>
            <option value="defense">Defense</option>
          </select>

          <label for="playDescription">Description and instructions</label>
          <textarea id="playDescription" rows="5" maxlength="5000"
            placeholder="Describe player positions, movements, and assignments..."></textarea>

          <button id="savePlayButton" type="submit">Save play</button>
          <button id="cancelPlayButton" class="secondary" type="button">Cancel</button>
          <p id="playMessage" role="status"></p>
        </form>
      </section>

      <section id="playsSection">
        <h2>My Plays</h2>
        <div id="playsList"><p>Loading your plays...</p></div>
      </section>
    </div>
  `;

  const style = document.createElement("style");
  style.textContent = `
    .dashboard { color: #f5f5f5; text-align: left; }
    .dashboard h1 { font-size: clamp(1.8rem, 5vw, 2.7rem); margin: 8px 0; }
    .dashboard h2 { margin-top: 28px; }
    .eyebrow { letter-spacing: 3px; font-weight: bold; color: #b9f27c; }
    .dashboard-intro { color: #b9b9b9; }
    .dashboard-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 24px 0; }
    .stat-card, .play-card { background: #202020; border: 1px solid #383838; border-radius: 12px; padding: 16px; }
    .stat-card span { font-size: 1.8rem; font-weight: bold; }
    .stat-card p { color: #b9b9b9; margin-bottom: 0; font-size: .85rem; }
    .dashboard-actions { display: flex; gap: 10px; flex-wrap: wrap; }
    .dashboard button { cursor: pointer; padding: 12px 16px; border: 0; border-radius: 8px; font-weight: bold; }
    .dashboard button:not(.secondary) { background: #b9f27c; color: #141414; }
    .dashboard .secondary { background: #303030; color: white; border: 1px solid #555; }
    .dashboard button:disabled { opacity: .6; cursor: wait; }
    .dashboard label { display: block; margin-top: 14px; margin-bottom: 6px; }
    .dashboard input, .dashboard select, .dashboard textarea { box-sizing: border-box; width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #555; background: #171717; color: white; font: inherit; }
    .dashboard #playEditor { margin-top: 24px; padding: 18px; background: #191919; border-radius: 12px; }
    .play-card { margin-bottom: 12px; }
    .play-card h3 { margin-top: 0; }
    .play-card p { white-space: pre-wrap; overflow-wrap: anywhere; color: #ddd; }
    .play-card .play-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .play-type { color: #b9f27c; text-transform: uppercase; font-size: .75rem; letter-spacing: 1px; }

    #filesSection {
      margin-top: 28px;
      padding: 18px;
      background: #191919;
      border: 1px solid #383838;
      border-radius: 12px;
    }
    .files-help, .file-size { color: #b9b9b9; }
    #filesList { margin-top: 18px; }
    .file-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 10px;
      padding: 14px;
      background: #202020;
      border: 1px solid #383838;
      border-radius: 10px;
    }
    .file-name {
      overflow-wrap: anywhere;
      flex: 1;
      min-width: 120px;
    }
    .file-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .file-size { font-size: .85rem; }
    #fileMessage { overflow-wrap: anywhere; }

    @media (max-width: 480px) {
      .dashboard-stats { grid-template-columns: 1fr; }
    }
  `;
  document.head.appendChild(style);

  // Initialize the existing interactive court designer.
  if (typeof window.initCourtDesigner === "function") {
    window.initCourtDesigner();
  }

  $("showPlaysButton").addEventListener("click", () => {
    $("playsSection").scrollIntoView({ behavior: "smooth" });
  });

  $("newPlayButton").addEventListener("click", () => openEditor());

  $("cancelPlayButton").addEventListener("click", () => {
    $("playForm").reset();
    $("playEditor").hidden = true;
    delete $("playForm").dataset.editId;
  });

  $("playForm").addEventListener("submit", savePlay);

  $("fileUploadForm").addEventListener("submit", uploadFile);
  $("filesList").addEventListener("click", handleFileAction);

  $("dashboardSignOut").addEventListener("click", async () => {
    const { error } = await supabaseClient.auth.signOut();

    if (error) {
      alert(error.message);
    } else {
      window.location.reload();
    }
  });

  loadPlays();
  loadUserFiles();
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

// =============================
// PRIVATE FILE MANAGER
// =============================

function setFileMessage(text, isError = false) {
  const element = $("fileMessage");
  if (!element) return;

  element.textContent = text;
  element.style.color = isError ? "#ff7777" : "#8fe3a1";
}

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function safeFileName(name) {
  const baseName = name.split(/[\\/]/).pop();

  return baseName
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 150) || "upload";
}

function isAllowedFile(file) {
  return (
    file.type === "application/pdf" ||
    file.type.startsWith("image/")
  );
}

async function loadUserFiles() {
  const list = $("filesList");
  if (!list || !currentUser) return;

  list.textContent = "Loading your files...";

  try {
    const { data, error } = await supabaseClient.storage
      .from(FILE_BUCKET)
      .list(currentUser.id, {
        limit: 100,
        sortBy: { column: "created_at", order: "desc" }
      });

    if (error) throw error;

    const files = (data || []).filter(
      (file) => file.name && file.name !== ".emptyFolderPlaceholder"
    );

    if (!files.length) {
      list.innerHTML = "<p>No files yet. Upload an image or PDF above.</p>";
      return;
    }

    list.innerHTML = files.map((file) => {
      const path = `${currentUser.id}/${file.name}`;
      const size = Number(file.metadata?.size || 0);
      const originalName = file.name.replace(/^\d+-[a-z0-9]+-/i, "");

      return `
        <article class="file-card">
          <div class="file-name">
            <strong>${escapeHTML(originalName)}</strong>
            <div class="file-size">${formatFileSize(size)}</div>
          </div>
          <div class="file-actions">
            <button type="button"
              data-file-action="download"
              data-file-path="${escapeHTML(path)}">
              Download
            </button>
            <button type="button" class="secondary"
              data-file-action="delete"
              data-file-path="${escapeHTML(path)}">
              Delete
            </button>
          </div>
        </article>
      `;
    }).join("");
  } catch (error) {
    list.textContent = `Could not load files: ${error.message}`;
  }
}

async function uploadFile(event) {
  event.preventDefault();

  if (!currentUser) {
    setFileMessage("Please sign in again.", true);
    return;
  }

  const input = $("fileInput");
  const button = $("uploadFileButton");
  const file = input.files?.[0];

  if (!file) {
    setFileMessage("Choose a file first.", true);
    return;
  }

  if (!isAllowedFile(file)) {
    setFileMessage("Only image and PDF files are allowed.", true);
    return;
  }

  if (file.size > MAX_FILE_SIZE) {
    setFileMessage("The file must be 10 MB or smaller.", true);
    return;
  }

  if (file.size === 0) {
    setFileMessage("This file is empty.", true);
    return;
  }

  button.disabled = true;
  setFileMessage("Uploading...");

  try {
    const uniqueId =
      globalThis.crypto?.randomUUID?.() ||
      Math.random().toString(36).slice(2);

    const storedName =
      `${Date.now()}-${uniqueId}-${safeFileName(file.name)}`;

    const path = `${currentUser.id}/${storedName}`;

    const { error } = await supabaseClient.storage
      .from(FILE_BUCKET)
      .upload(path, file, {
        upsert: false,
        contentType: file.type
      });

    if (error) throw error;

    input.value = "";
    setFileMessage("File uploaded successfully.");
    await loadUserFiles();
  } catch (error) {
    setFileMessage(`Upload failed: ${error.message}`, true);
  } finally {
    button.disabled = false;
  }
}

async function handleFileAction(event) {
  const button = event.target.closest("button[data-file-action]");
  if (!button || !currentUser) return;

  const action = button.dataset.fileAction;
  const path = button.dataset.filePath;

  // Restrict actions to the signed-in user's folder.
  if (!path || !path.startsWith(`${currentUser.id}/`)) {
    setFileMessage("Invalid file path.", true);
    return;
  }

  button.disabled = true;

  try {
    if (action === "download") {
      setFileMessage("Preparing download...");

      const { data, error } = await supabaseClient.storage
        .from(FILE_BUCKET)
        .download(path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const link = document.createElement("a");

      link.href = url;
      link.download = path.split("/").pop().replace(
        /^\d+-[a-z0-9]+-/i, ""
      );

      document.body.appendChild(link);
      link.click();
      link.remove();

      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setFileMessage("Download started.");
    } else if (action === "delete") {
      const fileName = path.split("/").pop();

      if (!confirm(`Delete "${fileName}"? This cannot be undone.`)) {
        return;
      }

      setFileMessage("Deleting file...");

      const { error } = await supabaseClient.storage
        .from(FILE_BUCKET)
        .remove([path]);

      if (error) throw error;

      setFileMessage("File deleted.");
      await loadUserFiles();
    }
  } catch (error) {
    setFileMessage(`File action failed: ${error.message}`, true);
  } finally {
    button.disabled = false;
  }
}

// =============================
// EXISTING PLAYBOOK FUNCTIONS
// =============================

function openEditor(play = null) {
  $("playEditor").hidden = false;
  $("playForm").reset();
  $("playMessage").textContent = "";

  if (play) {
    $("editorTitle").textContent = "Edit play";
    $("playTitle").value = play.title;
    $("playType").value = play.play_type;
    $("playDescription").value = play.description || "";
    $("playForm").dataset.editId = play.id;
  } else {
    $("editorTitle").textContent = "Create a play";
    delete $("playForm").dataset.editId;
  }

  if (window.loadCourtDiagram) {
    window.loadCourtDiagram(play ? play.diagram : null);
  }

  $("playEditor").scrollIntoView({ behavior: "smooth" });
}

async function loadPlays() {
  const list = $("playsList");
  list.innerHTML = "<p>Loading your plays...</p>";

  const { data, error } = await supabaseClient
    .from("identity_plays")
    .select("id, title, play_type, description, diagram, created_at, updated_at")
    .eq("user_id", currentUser.id)
    .order("updated_at", { ascending: false });

  if (error) {
    list.textContent = "Could not load plays: " + error.message;
    return;
  }

  plays = data || [];

  $("playCount").textContent = plays.length;
  $("offenseCount").textContent =
    plays.filter((play) => play.play_type === "offense").length;
  $("defenseCount").textContent =
    plays.filter((play) => play.play_type === "defense").length;

  if (plays.length === 0) {
    list.innerHTML = `
      <div class="play-card">
        <h3>Your playbook starts here.</h3>
        <p>Create your first offensive or defensive play to get started.</p>
      </div>`;
    return;
  }

  list.innerHTML = plays.map((play) => `
    <article class="play-card">
      <span class="play-type">${escapeHTML(play.play_type)}</span>
      <h3>${escapeHTML(play.title)}</h3>
      <p>${escapeHTML(play.description || "No description yet.")}</p>
      <div class="play-actions">
        <button type="button" data-edit="${escapeHTML(play.id)}">Edit / Design</button>
        <button class="secondary" type="button" data-delete="${escapeHTML(play.id)}">Delete</button>
      </div>
    </article>
  `).join("");

  list.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      const play = plays.find((item) => item.id === button.dataset.edit);
      if (play) openEditor(play);
    });
  });

  list.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => deletePlay(button.dataset.delete));
  });
}

async function savePlay(event) {
  event.preventDefault();

  const saveButton = $("savePlayButton");
  const playMessage = $("playMessage");
  saveButton.disabled = true;
  playMessage.textContent = "Saving...";

  const play = {
    title: $("playTitle").value.trim(),
    play_type: $("playType").value,
    description: $("playDescription").value.trim(),
    diagram: window.getCourtDiagram
      ? window.getCourtDiagram()
      : {},
    updated_at: new Date().toISOString()
  };

  const editId = $("playForm").dataset.editId;

  try {
    let result;

    if (editId) {
      result = await supabaseClient
        .from("identity_plays")
        .update(play)
        .eq("id", editId)
        .eq("user_id", currentUser.id);
    } else {
      result = await supabaseClient
        .from("identity_plays")
        .insert({
          ...play,
          user_id: currentUser.id
        });
    }

    if (result.error) throw result.error;

    playMessage.textContent = "Play saved!";
    $("playEditor").hidden = true;
    await loadPlays();
  } catch (error) {
    playMessage.textContent = error.message || "Could not save the play.";
  } finally {
    saveButton.disabled = false;
  }
}

async function deletePlay(id) {
  const play = plays.find((item) => item.id === id);
  if (!play) return;

  if (!confirm(`Delete "${play.title}"? This cannot be undone.`)) return;

  const { error } = await supabaseClient
    .from("identity_plays")
    .delete()
    .eq("id", id)
    .eq("user_id", currentUser.id);

  if (error) {
    alert("Could not delete play: " + error.message);
    return;
  }

  await loadPlays();
}

async function handleSignedIn(user) {
  currentUser = user;

  const { data: profile, error } = await supabaseClient
    .from("identity_profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;

  if (profile) {
    currentUsername = profile.username;
    showDashboard();
    return;
  }

  const username = user.user_metadata?.playbook_username;

  if (username) {
    currentUsername = await saveUsername(user, username);
    showDashboard();
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
        throw new Error("Use 3–20 characters: letters, numbers, or underscores.");
      }

      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin + window.location.pathname,
          data: { playbook_username: username }
        }
      });

      if (error) throw error;

      if (data.session && data.user) {
        await handleSignedIn(data.user);
      } else {
        setMode("login");
        showMessage("Account created. Confirm your email, then sign in to finish setup.");
      }
      return;
    }

    if (mode === "username") {
      if (!setupUser) {
        throw new Error("Your session expired. Please sign in again.");
      }

      const username = usernameInput.value.trim();

      if (!validUsername(username)) {
        throw new Error("Use 3–20 characters: letters, numbers, or underscores.");
      }

      currentUsername = await saveUsername(setupUser, username);
      currentUser = setupUser;
      showDashboard();
      return;
    }

    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;
    await handleSignedIn(data.user);
  } catch (error) {
    showMessage(error.message || "Something went wrong. Please try again.", true);
  } finally {
    setBusy(false);
  }
});

switchButton.addEventListener("click", () => {
  if (busy) return;

  if (mode === "username" && setupUser) {
    showMessage("Please finish choosing your username first.", true);
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
        redirectTo: window.location.origin + window.location.pathname
      }
    });

    if (error) throw error;
  } catch (error) {
    showMessage(error.message || "GitHub sign-in could not start.", true);
    setBusy(false);
  }
});

async function initializeApp() {
  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    showMessage(error.message || "Could not load your session.", true);
    return;
  }

  if (data.session) {
    try {
      await handleSignedIn(data.session.user);
    } catch (error) {
      showMessage(error.message || "Could not load your account.", true);
    }
  }
}

supabaseClient.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") {
    window.location.reload();
  }
});

setMode("login");
initializeApp();
