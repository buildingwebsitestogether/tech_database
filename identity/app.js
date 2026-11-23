/* ============================================================
   IDENTITY. PLAYBOOK — BUILD 3
   Complete frontend application
   Uses config.js, Supabase JS v2, and court-designer.js
   ============================================================ */

(() => {
  "use strict";

  const BUCKET = "identity-playbook-files";
  const MAX_FILE_SIZE = 10 * 1024 * 1024;

  const ALLOWED_FILES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "application/pdf"
  ];

  const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );

  let currentUser = null;
  let currentProfile = null;
  let currentRole = "user";
  let currentPlayId = null;
  let currentTab = "plays";
  let cachedPlays = [];

  const root = document.createElement("div");
  root.id = "identityAppRoot";
  document.body.appendChild(root);

  /* ------------------------------------------------------------
     STYLES
  ------------------------------------------------------------ */

  const style = document.createElement("style");

  style.textContent = `
    #identityAppRoot {
      --ip-bg: #101722;
      --ip-panel: #192433;
      --ip-panel2: #202d3e;
      --ip-orange: #f28c28;
      --ip-text: #f5f7fa;
      --ip-muted: #aab6c5;
      --ip-border: #344356;
      color: var(--ip-text);
      font-family: Inter, Poppins, Arial, sans-serif;
      width: 100%;
    }

    #identityAppRoot * { box-sizing: border-box; }

    #identityAppRoot .ip-shell {
      max-width: 1150px;
      margin: 30px auto;
      padding: 20px;
    }

    #identityAppRoot .ip-card {
      background: var(--ip-panel);
      border: 1px solid var(--ip-border);
      border-radius: 16px;
      padding: 22px;
      margin-bottom: 18px;
    }

    #identityAppRoot .ip-brand {
      text-align: center;
      margin-bottom: 25px;
    }

    #identityAppRoot .ip-brand h1 {
      color: var(--ip-orange);
      font-size: clamp(30px, 5vw, 48px);
      margin: 0 0 8px;
      font-weight: 700;
      letter-spacing: 1px;
    }

    #identityAppRoot .ip-muted {
      color: var(--ip-muted);
      font-size: 14px;
    }

    #identityAppRoot input,
    #identityAppRoot textarea,
    #identityAppRoot select {
      display: block;
      width: 100%;
      background: #111b28;
      color: white;
      border: 1px solid var(--ip-border);
      border-radius: 9px;
      padding: 12px;
      margin: 8px 0 14px;
      font: inherit;
    }

    #identityAppRoot textarea {
      min-height: 90px;
      resize: vertical;
    }

    #identityAppRoot label {
      display: block;
      font-size: 13px;
      color: var(--ip-muted);
      margin-top: 10px;
    }

    #identityAppRoot button {
      background: var(--ip-orange);
      color: #171717;
      border: 0;
      border-radius: 9px;
      padding: 11px 16px;
      margin: 4px 5px 4px 0;
      cursor: pointer;
      font: inherit;
      font-weight: 700;
    }

    #identityAppRoot button:hover { filter: brightness(1.08); }

    #identityAppRoot button.secondary {
      background: #344356;
      color: white;
    }

    #identityAppRoot button.danger {
      background: #b94343;
      color: white;
    }

    #identityAppRoot button:disabled {
      opacity: .55;
      cursor: not-allowed;
    }

    #identityAppRoot .ip-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
      gap: 15px;
    }

    #identityAppRoot .ip-nav {
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
      margin-bottom: 20px;
    }

    #identityAppRoot .ip-nav button {
      background: var(--ip-panel2);
      color: white;
    }

    #identityAppRoot .ip-nav button.active {
      background: var(--ip-orange);
      color: #171717;
    }

    #identityAppRoot .ip-play {
      background: var(--ip-panel2);
      border: 1px solid var(--ip-border);
      border-radius: 12px;
      padding: 16px;
      margin: 12px 0;
    }

    #identityAppRoot .ip-play h3 { margin-top: 0; }

    #identityAppRoot .ip-status {
      color: var(--ip-muted);
      font-size: 13px;
      margin: 10px 0;
    }

    #identityAppRoot .ip-message {
      padding: 12px;
      border-radius: 9px;
      margin: 12px 0;
      background: #26384b;
      color: white;
      overflow-wrap: anywhere;
    }

    #identityAppRoot .ip-message.error {
      background: #552d35;
    }

    #identityAppRoot .ip-message.success {
      background: #214536;
    }

    #identityAppRoot .ip-table-wrap { overflow-x: auto; }

    #identityAppRoot table {
      border-collapse: collapse;
      width: 100%;
      min-width: 520px;
      font-size: 13px;
    }

    #identityAppRoot th,
    #identityAppRoot td {
      border-bottom: 1px solid var(--ip-border);
      text-align: left;
      padding: 11px;
      vertical-align: top;
    }

    #identityAppRoot th { color: var(--ip-orange); }

    #identityAppRoot .ip-section-title {
      color: var(--ip-orange);
      margin-top: 0;
    }

    #identityAppRoot .ip-hidden { display: none !important; }

    #identityAppRoot .ip-small {
      font-size: 12px;
      color: var(--ip-muted);
    }

    #identityAppRoot .ip-divider {
      border: 0;
      border-top: 1px solid var(--ip-border);
      margin: 20px 0;
    }

    #identityAppRoot #ipCourtArea {
      margin-top: 18px;
    }

    @media(max-width: 600px) {
      #identityAppRoot .ip-shell { padding: 10px; }
      #identityAppRoot .ip-card { padding: 16px; }
    }
  `;

  document.head.appendChild(style);

  /* ------------------------------------------------------------
     HELPERS
  ------------------------------------------------------------ */

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function showMessage(message, type = "") {
    const box = document.getElementById("ipMessage") || document.getElementById("message");
    if (!box) return;

    box.className = "ip-message " + type;
    box.textContent = message;
    box.classList.remove("ip-hidden");
  }

  function clearMessage() {
    const box = document.getElementById("ipMessage") || document.getElementById("message");
    if (box) {
      box.textContent = "";
      box.className = "ip-message ip-hidden";
    }
  }

  function getValue(id) {
    return document.getElementById(id)?.value?.trim() ?? "";
  }

  function formatDate(value) {
    if (!value) return "Unknown";
    return new Date(value).toLocaleString();
  }

  function downloadJSON(filename, data) {
    const blob = new Blob(
      [JSON.stringify(data, null, 2)],
      { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    link.click();

    URL.revokeObjectURL(url);
  }

  function friendlyError(error) {
    return error?.message || "Something went wrong. Please try again.";
  }

  async function callRPC(name, args = {}) {
    const { data, error } = await supabaseClient.rpc(name, args);
    if (error) throw error;
    return data;
  }

  async function callFunction(name, action, args = {}) {
    const { data, error } = await supabaseClient.functions.invoke(name, {
      body: { action, args }
    });

    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    return data;
  }

  /* ------------------------------------------------------------
     APPLICATION LAYOUT
  ------------------------------------------------------------ */

  function renderAuth() {
    // Use the original sign-in card in index.html; do not create a duplicate.
    document.body.classList.add("ip-auth");
    root.innerHTML = "";

    const form = document.getElementById("authForm");
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const submitButton = document.getElementById("submitButton");
    const githubButton = document.getElementById("githubButton");
    const switchButton = document.getElementById("switchButton");
    const title = document.getElementById("formTitle");
    const subtitle = document.getElementById("formSubtitle");
    const switchText = document.getElementById("switchText");
    const rules = document.getElementById("passwordRules");

    if (!form || !emailInput || !passwordInput || !submitButton || !githubButton || !switchButton) {
      showMessage("The sign-in form could not be found. Please check index.html.", "error");
      return;
    }

    let mode = "login";
    const setMode = nextMode => {
      mode = nextMode;
      const signingUp = mode === "signup";
      if (title) title.textContent = signingUp ? "Create your account" : "Welcome back";
      if (subtitle) subtitle.textContent = signingUp
        ? "Create an account to start building your basketball playbook."
        : "Sign in to get back to your playbook.";
      submitButton.textContent = signingUp ? "Create account" : "Sign in";
      switchText.textContent = signingUp ? "Already have an account?" : "New to Identity?";
      switchButton.textContent = signingUp ? "Sign in" : "Create account";
      passwordInput.autocomplete = signingUp ? "new-password" : "current-password";
      if (rules) rules.hidden = !signingUp;
      clearMessage();
    };

    form.onsubmit = async event => {
      event.preventDefault();
      clearMessage();
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      if (!email || !password) {
        showMessage("Enter your email and password.", "error");
        return;
      }

      if (mode === "signup") {
        const valid = password.length >= 8 && /[a-z]/.test(password) &&
          /[A-Z]/.test(password) && /[0-9]/.test(password);
        if (!valid) {
          showMessage("Use at least 8 characters, including uppercase, lowercase, and a number.", "error");
          return;
        }
      }

      submitButton.disabled = true;
      githubButton.disabled = true;
      try {
        if (mode === "signup") {
          const { data, error } = await supabaseClient.auth.signUp({ email, password });
          if (error) throw error;
          if (data?.session) {
            showMessage("Account created. Loading your playbook...", "success");
            setTimeout(loadApplication, 0);
          } else {
            showMessage("Account created. Check your email if confirmation is enabled, then sign in.", "success");
            setMode("login");
          }
        } else {
          const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
          if (error) throw error;
        }
      } catch (error) {
        showMessage(friendlyError(error), "error");
      } finally {
        submitButton.disabled = false;
        githubButton.disabled = false;
      }
    };

    switchButton.onclick = () => setMode(mode === "login" ? "signup" : "login");
    githubButton.onclick = async () => {
      clearMessage();
      githubButton.disabled = true;
      try {
        const { error } = await supabaseClient.auth.signInWithOAuth({
          provider: "github",
          options: { redirectTo: window.location.origin + window.location.pathname }
        });
        if (error) throw error;
      } catch (error) {
        showMessage(friendlyError(error), "error");
        githubButton.disabled = false;
      }
    };

    setMode("login");
  }

  function renderUsernameSetup() {
    document.body.classList.remove("ip-auth");
    root.innerHTML = `
      <div class="ip-shell">
        <div class="ip-brand">
          <h1>IDENTITY.</h1>
          <div class="ip-muted">CHOOSE YOUR PLAYBOOK USERNAME</div>
        </div>

        <div class="ip-card" style="max-width:480px;margin:auto;">
          <div id="ipMessage" class="ip-message ip-hidden"></div>
          <h2 class="ip-section-title">Create your identity</h2>
          <p class="ip-muted">
            Choose a unique username. It will be shown instead of your email.
          </p>

          <form id="ipUsernameForm">
            <label>Username</label>
            <input id="ipUsername" maxlength="24"
              minlength="3" placeholder="YourUsername" required>
            <button type="submit">Save username</button>
          </form>

          <button id="ipUsernameSignout" class="secondary">Sign out</button>
        </div>
      </div>
    `;

    document.getElementById("ipUsernameForm").onsubmit = async event => {
      event.preventDefault();

      const username = getValue("ipUsername");

      if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
        showMessage(
          "Use 3–24 letters, numbers, or underscores.",
          "error"
        );
        return;
      }

      const { data: existing, error: checkError } = await supabaseClient
        .from("identity_profiles")
        .select("id")
        .ilike("username", username)
        .neq("id", currentUser.id)
        .limit(1);

      if (checkError) {
        showMessage(friendlyError(checkError), "error");
        return;
      }

      if (existing?.length) {
        showMessage("That username is already taken.", "error");
        return;
      }

      const { error } = await supabaseClient
        .from("identity_profiles")
        .upsert({
          id: currentUser.id,
          username
        }, { onConflict: "id" });

      if (error) {
        showMessage(friendlyError(error), "error");
        return;
      }

      await loadApplication();
    };

    document.getElementById("ipUsernameSignout").onclick = signOut;
  }

  /* ------------------------------------------------------------
     DASHBOARD
  ------------------------------------------------------------ */

  function renderDashboard() {
    document.body.classList.remove("ip-auth");
    const username = currentProfile?.username || "Player";

    root.innerHTML = `
      <div class="ip-shell">
        <div class="ip-brand">
          <h1>IDENTITY.</h1>
          <div class="ip-muted">YOUR BASKETBALL PLAYBOOK</div>
        </div>

        <div class="ip-card">
          <div class="ip-grid">
            <div>
              <h2 style="margin:0">Welcome, ${escapeHTML(username)}</h2>
              <div class="ip-muted">${escapeHTML(currentRole.toUpperCase())}</div>
            </div>
            <div style="text-align:right">
              <button id="ipSignout" class="secondary">Sign out</button>
            </div>
          </div>
        </div>

        <div id="ipMessage" class="ip-message ip-hidden"></div>

        <div class="ip-nav" id="ipNavigation">
          <button data-tab="plays">My Plays</button>
          <button data-tab="create">Create a Play</button>
          <button data-tab="files">My Files</button>
          <button data-tab="account">Account</button>
          ${currentRole !== "user"
            ? `<button data-tab="moderation">Staff Dashboard</button>`
            : ""}
        </div>

        <div id="ipContent"></div>
      </div>
    `;

    document.getElementById("ipSignout").onclick = signOut;

    root.querySelectorAll("[data-tab]").forEach(button => {
      button.onclick = () => openTab(button.dataset.tab);
    });

    openTab(currentTab);
  }

  async function openTab(tab) {
    currentTab = tab;

    root.querySelectorAll("[data-tab]").forEach(button => {
      button.classList.toggle("active", button.dataset.tab === tab);
      button.classList.toggle("secondary", button.dataset.tab !== tab);
    });

    const content = document.getElementById("ipContent");
    if (!content) return;

    content.innerHTML = `<div class="ip-card">Loading...</div>`;

    try {
      if (tab === "plays") await renderPlays(content);
      else if (tab === "create") renderPlayEditor(content);
      else if (tab === "files") await renderFiles(content);
      else if (tab === "account") await renderAccount(content);
      else if (tab === "moderation") await renderModeration(content);
      else content.textContent = "Page not found.";
    } catch (error) {
      content.innerHTML = `
        <div class="ip-card">
          <div class="ip-message error">${escapeHTML(friendlyError(error))}</div>
        </div>
      `;
    }
  }

  /* ------------------------------------------------------------
     PLAYS
  ------------------------------------------------------------ */

  async function renderPlays(content) {
    const { data, error } = await supabaseClient
      .from("identity_plays")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("updated_at", { ascending: false });

    if (error) throw error;

    cachedPlays = data || [];

    content.innerHTML = `
      <div class="ip-card">
        <div class="ip-grid">
          <div>
            <h2 class="ip-section-title">My Plays</h2>
            <p class="ip-muted">Your saved basketball plays.</p>
          </div>
          <div>
            <button id="ipNewPlay">+ Create Play</button>
          </div>
        </div>

        <div id="ipPlayList"></div>
      </div>
    `;

    document.getElementById("ipNewPlay").onclick = () => openTab("create");

    const list = document.getElementById("ipPlayList");

    if (!cachedPlays.length) {
      list.innerHTML = `<p class="ip-muted">You haven't created any plays yet.</p>`;
      return;
    }

    list.innerHTML = cachedPlays.map(play => `
      <div class="ip-play">
        <h3>${escapeHTML(play.title)}</h3>
        <div class="ip-muted">${escapeHTML(play.play_type || "Uncategorized")}</div>
        <p>${escapeHTML(play.description || "No description.")}</p>
        <div class="ip-small">Updated ${escapeHTML(formatDate(play.updated_at))}</div>
        <hr class="ip-divider">
        <button data-edit="${escapeHTML(play.id)}">Edit</button>
        <button class="danger" data-delete="${escapeHTML(play.id)}">Delete</button>
      </div>
    `).join("");

    list.querySelectorAll("[data-edit]").forEach(button => {
      button.onclick = () => {
        const play = cachedPlays.find(item => item.id === button.dataset.edit);
        if (play) renderPlayEditor(content, play);
      };
    });

    list.querySelectorAll("[data-delete]").forEach(button => {
      button.onclick = async () => {
        if (!confirm("Delete this play? This cannot be undone.")) return;

        const { error: deleteError } = await supabaseClient
          .from("identity_plays")
          .delete()
          .eq("id", button.dataset.delete)
          .eq("user_id", currentUser.id);

        if (deleteError) {
          showMessage(friendlyError(deleteError), "error");
          return;
        }

        showMessage("Play deleted.", "success");
        await renderPlays(content);
      };
    });
  }

  function renderPlayEditor(content, play = null) {
    currentPlayId = play?.id || null;

    content.innerHTML = `
      <div class="ip-card" id="playEditor">
        <h2 class="ip-section-title">${play ? "Edit Play" : "Create a Play"}</h2>

        <form id="playForm">
          <label>Play title</label>
          <input id="ipPlayTitle" maxlength="100"
            value="${escapeHTML(play?.title || "")}" required>

          <label>Play type</label>
          <select id="ipPlayType">
            ${["Offense", "Defense", "Inbound", "Transition", "Other"]
              .map(type => `<option ${play?.play_type === type ? "selected" : ""}>${type}</option>`)
              .join("")}
          </select>

          <label>Description</label>
          <textarea id="ipPlayDescription">${escapeHTML(play?.description || "")}</textarea>

          <div id="ipCourtArea">
            <h3 class="ip-section-title">Court Designer</h3>
            <p class="ip-muted">
              Move the players and draw arrows to show your play.
            </p>
          </div>

          <div style="margin-top:20px">
            <button type="submit">${play ? "Save Changes" : "Save Play"}</button>
            <button type="button" id="ipCancelPlay" class="secondary">Cancel</button>
          </div>
        </form>
      </div>
    `;

    document.getElementById("ipCancelPlay").onclick = () => openTab("plays");

    if (typeof window.initCourtDesigner === "function") {
      try {
        window.initCourtDesigner();

        if (play?.diagram && typeof window.loadCourtDiagram === "function") {
          window.loadCourtDiagram(play.diagram);
        }
      } catch (error) {
        console.warn("Court designer initialization:", error);
      }
    }

    document.getElementById("playForm").onsubmit = async event => {
      event.preventDefault();

      const title = getValue("ipPlayTitle");
      const playType = getValue("ipPlayType");
      const description = getValue("ipPlayDescription");

      let diagram = null;

      if (typeof window.getCourtDiagram === "function") {
        try {
          diagram = window.getCourtDiagram();
        } catch (error) {
          console.warn("Could not read court diagram:", error);
        }
      }

      const payload = {
        title,
        play_type: playType,
        description,
        diagram,
        user_id: currentUser.id,
        updated_at: new Date().toISOString()
      };

      let result;

      if (currentPlayId) {
        result = await supabaseClient
          .from("identity_plays")
          .update(payload)
          .eq("id", currentPlayId)
          .eq("user_id", currentUser.id);
      } else {
        payload.created_at = new Date().toISOString();

        result = await supabaseClient
          .from("identity_plays")
          .insert(payload);
      }

      if (result.error) {
        showMessage(friendlyError(result.error), "error");
        return;
      }

      showMessage("Your play has been saved.", "success");
      currentPlayId = null;
      await openTab("plays");
    };
  }

  /* ------------------------------------------------------------
     PRIVATE FILE STORAGE
  ------------------------------------------------------------ */

  async function renderFiles(content) {
    content.innerHTML = `
      <div class="ip-card">
        <h2 class="ip-section-title">My Files</h2>
        <p class="ip-muted">
          Private files stored in your account. Maximum file size: 10 MB.
        </p>

        <input id="ipFileInput" type="file"
          accept=".jpg,.jpeg,.png,.webp,.gif,.pdf">

        <button id="ipUploadFile">Upload File</button>
        <hr class="ip-divider">
        <div id="ipFileList">Loading files...</div>
      </div>
    `;

    document.getElementById("ipUploadFile").onclick = uploadFile;

    const { data, error } = await supabaseClient.storage
      .from(BUCKET)
      .list(currentUser.id, {
        limit: 100,
        sortBy: { column: "created_at", order: "desc" }
      });

    if (error) throw error;

    const list = document.getElementById("ipFileList");

    if (!data?.length) {
      list.textContent = "You have no uploaded files.";
      return;
    }

    list.innerHTML = data.map(file => `
      <div class="ip-play">
        <strong>${escapeHTML(file.name)}</strong>
        <div class="ip-small">
          ${escapeHTML(formatDate(file.created_at))}
        </div>
        <button data-download="${escapeHTML(file.name)}">Download</button>
        <button class="danger" data-remove="${escapeHTML(file.name)}">Delete</button>
      </div>
    `).join("");

    list.querySelectorAll("[data-download]").forEach(button => {
      button.onclick = async () => {
        const path = currentUser.id + "/" + button.dataset.download;

        const { data: fileData, error: fileError } =
          await supabaseClient.storage.from(BUCKET).download(path);

        if (fileError) {
          showMessage(friendlyError(fileError), "error");
          return;
        }

        const url = URL.createObjectURL(fileData);
        const link = document.createElement("a");
        link.href = url;
        link.download = button.dataset.download;
        link.click();
        URL.revokeObjectURL(url);
      };
    });

    list.querySelectorAll("[data-remove]").forEach(button => {
      button.onclick = async () => {
        if (!confirm("Delete this file?")) return;

        const path = currentUser.id + "/" + button.dataset.remove;

        const { error: removeError } = await supabaseClient
          .storage.from(BUCKET).remove([path]);

        if (removeError) {
          showMessage(friendlyError(removeError), "error");
          return;
        }

        await renderFiles(content);
        showMessage("File deleted.", "success");
      };
    });
  }

  async function uploadFile() {
    const input = document.getElementById("ipFileInput");
    const file = input?.files?.[0];

    if (!file) {
      showMessage("Choose a file first.", "error");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      showMessage("The file must be 10 MB or smaller.", "error");
      return;
    }

    if (!ALLOWED_FILES.includes(file.type)) {
      showMessage("Only JPG, PNG, WEBP, GIF, and PDF files are allowed by this app.", "error");
      return;
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = currentUser.id + "/" + Date.now() + "_" + safeName;

    const { error } = await supabaseClient.storage
      .from(BUCKET)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type
      });

    if (error) {
      showMessage(friendlyError(error), "error");
      return;
    }

    const content = document.getElementById("ipContent");
    await renderFiles(content);
    showMessage("File uploaded privately.", "success");
  }

  /* ------------------------------------------------------------
     ACCOUNT SETTINGS
  ------------------------------------------------------------ */

  async function renderAccount(content) {
    const { data: deletionRequests, error } = await supabaseClient
      .from("identity_account_deletion_requests")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("requested_at", { ascending: false });

    if (error) throw error;

    const { data: appeals, error: appealError } = await supabaseClient
      .from("identity_appeals")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: false });

    if (appealError) throw appealError;

    content.innerHTML = `
      <div class="ip-card">
        <h2 class="ip-section-title">Account Settings</h2>

        <p><strong>Username:</strong> ${escapeHTML(currentProfile?.username || "Not set")}</p>
        <p><strong>Email:</strong> ${escapeHTML(currentUser.email || "Connected account")}</p>

        <hr class="ip-divider">

        <h3>Change Password</h3>
        <p class="ip-muted">Available for email/password accounts.</p>

        <label>New password</label>
        <input id="ipNewPassword" type="password" autocomplete="new-password">

        <button id="ipChangePassword">Update Password</button>

        <hr class="ip-divider">

        <h3>Export My Data</h3>
        <p class="ip-muted">Download a JSON copy of your Identity data.</p>
        <button id="ipExportData">Export My Data</button>

        <hr class="ip-divider">

        <h3>Appeals</h3>
        <p class="ip-muted">
          If your account has a restriction, you can submit an appeal.
        </p>

        <textarea id="ipAppealReason"
          placeholder="Explain why you are appealing..."></textarea>
        <button id="ipSubmitAppeal">Submit Appeal</button>

        <div id="ipAppealList"></div>

        <hr class="ip-divider">

        <h3>Account Deletion Request</h3>
        <p class="ip-muted">
          This submits a request for review. It does not immediately delete
          your account or sign you out.
        </p>

        <textarea id="ipDeletionReason"
          placeholder="Optional reason for your request..."></textarea>
        <button id="ipRequestDeletion" class="danger">
          Request Account Deletion
        </button>

        <div id="ipDeletionList"></div>
      </div>
    `;

    document.getElementById("ipChangePassword").onclick = async () => {
      const password = document.getElementById("ipNewPassword").value;

      if (
        password.length < 8 ||
        !/[a-z]/.test(password) ||
        !/[A-Z]/.test(password) ||
        !/[0-9]/.test(password)
      ) {
        showMessage("Use at least 8 characters, uppercase, lowercase, and a number.", "error");
        return;
      }

      const { error: updateError } = await supabaseClient.auth.updateUser({
        password
      });

      if (updateError) showMessage(friendlyError(updateError), "error");
      else showMessage("Password updated.", "success");
    };

    document.getElementById("ipExportData").onclick = async () => {
      try {
        const result = await callRPC("identity_export_my_data");
        downloadJSON("identity-playbook-data.json", result);
        showMessage("Your data export has been prepared.", "success");
      } catch (error) {
        showMessage(friendlyError(error), "error");
      }
    };

    document.getElementById("ipSubmitAppeal").onclick = async () => {
      const reason = getValue("ipAppealReason");

      if (reason.length < 5) {
        showMessage("Please provide at least 5 characters.", "error");
        return;
      }

      try {
        await callRPC("identity_submit_appeal", {
          p_reason: reason
        });

        showMessage("Your appeal has been submitted.", "success");
        await renderAccount(content);
      } catch (error) {
        showMessage(friendlyError(error), "error");
      }
    };

    document.getElementById("ipRequestDeletion").onclick = async () => {
      if (!confirm("Submit an account deletion request?")) return;

      try {
        await callRPC("identity_request_account_deletion", {
          p_reason: getValue("ipDeletionReason") || null
        });

        showMessage("Your deletion request has been submitted for review.", "success");
        await renderAccount(content);
      } catch (error) {
        showMessage(friendlyError(error), "error");
      }
    };

    const appealList = document.getElementById("ipAppealList");

    appealList.innerHTML = appeals?.length
      ? appeals.map(item => `
          <div class="ip-play">
            <strong>${escapeHTML(item.status)}</strong>
            <p>${escapeHTML(item.reason)}</p>
            <div class="ip-small">${escapeHTML(formatDate(item.created_at))}</div>
            ${item.review_notes
              ? `<p>${escapeHTML(item.review_notes)}</p>`
              : ""}
          </div>
        `).join("")
      : `<p class="ip-muted">No appeals submitted.</p>`;

    const deletionList = document.getElementById("ipDeletionList");

    deletionList.innerHTML = deletionRequests?.length
      ? deletionRequests.map(item => `
          <div class="ip-play">
            <strong>Request: ${escapeHTML(item.status)}</strong>
            <div class="ip-small">${escapeHTML(formatDate(item.requested_at))}</div>
            ${item.review_notes
              ? `<p>${escapeHTML(item.review_notes)}</p>`
              : ""}
            ${item.status === "pending"
              ? `<button class="secondary" data-cancel-deletion="${escapeHTML(item.id)}">Cancel Request</button>`
              : ""}
          </div>
        `).join("")
      : `<p class="ip-muted">No deletion requests.</p>`;

    deletionList.querySelectorAll("[data-cancel-deletion]").forEach(button => {
      button.onclick = async () => {
        try {
          await callRPC("identity_cancel_account_deletion");
          showMessage("Your pending deletion request was cancelled.", "success");
          await renderAccount(content);
        } catch (error) {
          showMessage(friendlyError(error), "error");
        }
      };
    });
  }

  /* ------------------------------------------------------------
     STAFF DASHBOARD
  ------------------------------------------------------------ */

  async function renderModeration(content) {
    const isAdmin = currentRole === "admin";

    content.innerHTML = `
      <div class="ip-card">
        <h2 class="ip-section-title">
          ${isAdmin ? "Administrator Dashboard" : "Moderator Dashboard"}
        </h2>

        <p class="ip-muted">
          Staff actions are checked by Supabase permissions and database functions.
        </p>

        <div class="ip-nav" id="ipStaffNav">
          <button data-staff-tab="reports">Reports</button>
          <button data-staff-tab="plays">Hidden Plays</button>
          <button data-staff-tab="users">User Actions</button>
          ${isAdmin ? `
            <button data-staff-tab="bans">Ban Requests</button>
            <button data-staff-tab="appeals">Appeals</button>
            <button data-staff-tab="moderators">Moderators</button>
            <button data-staff-tab="deletions">Deletion Requests</button>
            <button data-staff-tab="logs">Moderation Logs</button>
          ` : ""}
        </div>

        <div id="ipStaffContent"></div>
      </div>
    `;

    root.querySelectorAll("[data-staff-tab]").forEach(button => {
      button.onclick = () => {
        root.querySelectorAll("[data-staff-tab]").forEach(item => {
          item.classList.toggle("active", item === button);
          item.classList.toggle("secondary", item !== button);
        });

        renderStaffSection(button.dataset.staffTab);
      };
    });

    const first = root.querySelector("[data-staff-tab]");
    first?.click();
  }

  async function renderStaffSection(section) {
    const panel = document.getElementById("ipStaffContent");
    if (!panel) return;

    panel.innerHTML = `<p class="ip-muted">Loading...</p>`;

    try {
      if (section === "reports") await renderStaffReports(panel);
      else if (section === "plays") await renderHiddenPlays(panel);
      else if (section === "users") renderUserActions(panel);
      else if (section === "bans") await renderBanRequests(panel);
      else if (section === "appeals") await renderStaffAppeals(panel);
      else if (section === "moderators") await renderModerators(panel);
      else if (section === "deletions") await renderDeletionRequests(panel);
      else if (section === "logs") await renderModerationLogs(panel);
    } catch (error) {
      panel.innerHTML = `
        <div class="ip-message error">${escapeHTML(friendlyError(error))}</div>
      `;
    }
  }

  async function renderStaffReports(panel) {
    const { data, error } = await supabaseClient
      .from("identity_reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    panel.innerHTML = `
      <h3>Reports</h3>
      ${data?.length ? data.map(report => `
        <div class="ip-play">
          <strong>${escapeHTML(report.status.toUpperCase())}</strong>
          <p><strong>Reason:</strong> ${escapeHTML(report.reason)}</p>
          <p>${escapeHTML(report.details || "No extra details.")}</p>
          <div class="ip-small">
            Report ID: ${escapeHTML(report.id)}<br>
            Play ID: ${escapeHTML(report.play_id || "Unavailable")}<br>
            Reported user: ${escapeHTML(report.reported_user_id || "Unavailable")}<br>
            Submitted: ${escapeHTML(formatDate(report.created_at))}
          </div>

          ${report.status === "pending" ? `
            <textarea id="ipReportNotes_${escapeHTML(report.id)}"
              placeholder="Review notes (optional)"></textarea>
            <button data-report-action="reviewed" data-id="${escapeHTML(report.id)}">
              Mark Reviewed
            </button>
            <button class="secondary"
              data-report-action="dismissed" data-id="${escapeHTML(report.id)}">
              Dismiss
            </button>
          ` : ""}
        </div>
      `).join("") : `<p class="ip-muted">No reports found.</p>`}
    `;

    panel.querySelectorAll("[data-report-action]").forEach(button => {
      button.onclick = async () => {
        try {
          await callFunction("identity-moderation", "review_report", {
            p_report_id: button.dataset.id,
            p_status: button.dataset.reportAction,
            p_notes: getValue("ipReportNotes_" + button.dataset.id) || null
          });

          showMessage("Report updated.", "success");
          await renderStaffReports(panel);
        } catch (error) {
          showMessage(friendlyError(error), "error");
        }
      };
    });
  }

  async function renderHiddenPlays(panel) {
    const { data, error } = await supabaseClient
      .from("identity_hidden_plays")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    panel.innerHTML = `
      <h3>Hidden Plays</h3>
      ${data?.length ? data.map(item => `
        <div class="ip-play">
          <strong>Play ID: ${escapeHTML(item.play_id)}</strong>
          <p>${escapeHTML(item.reason)}</p>
          <div class="ip-small">${escapeHTML(formatDate(item.created_at))}</div>
          <button data-restore-play="${escapeHTML(item.play_id)}">
            Restore Play
          </button>
          ${currentRole === "admin" ? `
            <button class="danger" data-delete-play="${escapeHTML(item.play_id)}">
              Permanently Delete
            </button>
          ` : ""}
        </div>
      `).join("") : `<p class="ip-muted">No hidden plays.</p>`}
    `;

    panel.querySelectorAll("[data-restore-play]").forEach(button => {
      button.onclick = async () => {
        try {
          await callFunction("identity-moderation", "restore_play", {
            p_play_id: button.dataset.restorePlay
          });

          showMessage("Play restored.", "success");
          await renderHiddenPlays(panel);
        } catch (error) {
          showMessage(friendlyError(error), "error");
        }
      };
    });

    panel.querySelectorAll("[data-delete-play]").forEach(button => {
      button.onclick = async () => {
        if (!confirm("Permanently delete this play?")) return;

        try {
          await callFunction("identity-admin", "delete_play", {
            p_play_id: button.dataset.deletePlay
          });

          showMessage("Play deleted.", "success");
          await renderHiddenPlays(panel);
        } catch (error) {
          showMessage(friendlyError(error), "error");
        }
      };
    });
  }

  function renderUserActions(panel) {
    panel.innerHTML = `
      <h3>User Actions</h3>
      <p class="ip-muted">
        Enter the user's Supabase Auth UUID. Do not use their email address here.
      </p>

      <label>User UUID</label>
      <input id="ipTargetUser" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx">

      <label>Reason</label>
      <textarea id="ipActionReason" placeholder="Explain the reason..."></textarea>

      <label>Suspension duration in hours</label>
      <input id="ipSuspensionHours" type="number" min="1" value="24">

      <button id="ipSuspendUser">Suspend User</button>
      <button id="ipRequestBan" class="danger">Request Permanent Ban</button>

      ${currentRole === "admin" ? `
        <hr class="ip-divider">
        <button id="ipLiftRestriction" class="secondary">Lift Restriction</button>
      ` : ""}
    `;

    document.getElementById("ipSuspendUser").onclick = async () => {
      try {
        await callFunction("identity-moderation", "suspend_user", {
          p_user_id: getValue("ipTargetUser"),
          p_reason: getValue("ipActionReason"),
          p_duration_hours: Number(getValue("ipSuspensionHours"))
        });

        showMessage("Suspension recorded.", "success");
      } catch (error) {
        showMessage(friendlyError(error), "error");
      }
    };

    document.getElementById("ipRequestBan").onclick = async () => {
      if (!confirm("Submit a permanent-ban request for administrator review?")) return;

      try {
        await callFunction("identity-moderation", "request_ban", {
          p_user_id: getValue("ipTargetUser"),
          p_reason: getValue("ipActionReason")
        });

        showMessage("Permanent-ban request submitted for administrator review.", "success");
      } catch (error) {
        showMessage(friendlyError(error), "error");
      }
    };

    if (currentRole === "admin") {
      document.getElementById("ipLiftRestriction").onclick = async () => {
        try {
          await callFunction("identity-admin", "lift_restriction", {
            p_user_id: getValue("ipTargetUser"),
            p_reason: getValue("ipActionReason") || null
          });

          showMessage("Restriction removed from the database.", "success");
        } catch (error) {
          showMessage(friendlyError(error), "error");
        }
      };
    }
  }

  async function renderBanRequests(panel) {
    const { data, error } = await supabaseClient
      .from("identity_ban_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    panel.innerHTML = `
      <h3>Permanent Ban Requests</h3>
      ${data?.length ? data.map(item => `
        <div class="ip-play">
          <strong>${escapeHTML(item.status.toUpperCase())}</strong>
          <p><strong>User:</strong> ${escapeHTML(item.target_user_id)}</p>
          <p>${escapeHTML(item.reason)}</p>
          <div class="ip-small">${escapeHTML(formatDate(item.created_at))}</div>

          ${item.status === "pending" ? `
            <textarea id="ipBanNotes_${escapeHTML(item.id)}"
              placeholder="Review notes"></textarea>
            <button data-ban-decision="approved" data-id="${escapeHTML(item.id)}">
              Approve
            </button>
            <button class="secondary" data-ban-decision="rejected"
              data-id="${escapeHTML(item.id)}">Reject</button>
          ` : ""}
        </div>
      `).join("") : `<p class="ip-muted">No ban requests.</p>`}
    `;

    panel.querySelectorAll("[data-ban-decision]").forEach(button => {
      button.onclick = async () => {
        try {
          await callFunction("identity-admin", "review_ban", {
            p_request_id: button.dataset.id,
            p_decision: button.dataset.banDecision,
            p_notes: getValue("ipBanNotes_" + button.dataset.id) || null
          });

          showMessage("Ban request reviewed.", "success");
          await renderBanRequests(panel);
        } catch (error) {
          showMessage(friendlyError(error), "error");
        }
      };
    });
  }

  async function renderStaffAppeals(panel) {
    const { data, error } = await supabaseClient
      .from("identity_appeals")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    panel.innerHTML = `
      <h3>Appeals</h3>
      ${data?.length ? data.map(item => `
        <div class="ip-play">
          <strong>${escapeHTML(item.status.toUpperCase())}</strong>
          <p><strong>User:</strong> ${escapeHTML(item.user_id)}</p>
          <p>${escapeHTML(item.reason)}</p>
          <div class="ip-small">${escapeHTML(formatDate(item.created_at))}</div>

          ${item.status === "pending" ? `
            <textarea id="ipAppealNotes_${escapeHTML(item.id)}"
              placeholder="Review notes"></textarea>
            <button data-appeal-decision="approved" data-id="${escapeHTML(item.id)}">
              Approve Appeal
            </button>
            <button class="secondary" data-appeal-decision="rejected"
              data-id="${escapeHTML(item.id)}">Reject Appeal</button>
          ` : ""}
        </div>
      `).join("") : `<p class="ip-muted">No appeals found.</p>`}
    `;

    panel.querySelectorAll("[data-appeal-decision]").forEach(button => {
      button.onclick = async () => {
        try {
          await callFunction("identity-admin", "review_appeal", {
            p_appeal_id: button.dataset.id,
            p_decision: button.dataset.appealDecision,
            p_notes: getValue("ipAppealNotes_" + button.dataset.id) || null
          });

          showMessage("Appeal reviewed.", "success");
          await renderStaffAppeals(panel);
        } catch (error) {
          showMessage(friendlyError(error), "error");
        }
      };
    });
  }

  async function renderModerators(panel) {
    const { data, error } = await supabaseClient
      .from("identity_moderators")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    panel.innerHTML = `
      <h3>Manage Moderators</h3>

      <label>User UUID</label>
      <input id="ipModeratorUser" placeholder="Supabase Auth UUID">

      <button id="ipAddModerator">Add Moderator</button>

      <hr class="ip-divider">

      <h3>Current Moderators</h3>

      ${data?.length ? data.map(item => `
        <div class="ip-play">
          <strong>${escapeHTML(item.user_id)}</strong>
          <div class="ip-small">Added ${escapeHTML(formatDate(item.created_at))}</div>
          <button class="danger" data-remove-moderator="${escapeHTML(item.user_id)}">
            Remove Moderator
          </button>
        </div>
      `).join("") : `<p class="ip-muted">No moderators added.</p>`}
    `;

    document.getElementById("ipAddModerator").onclick = async () => {
      try {
        await callFunction("identity-admin", "add_moderator", {
          p_user_id: getValue("ipModeratorUser")
        });

        showMessage("Moderator added.", "success");
        await renderModerators(panel);
      } catch (error) {
        showMessage(friendlyError(error), "error");
      }
    };

    panel.querySelectorAll("[data-remove-moderator]").forEach(button => {
      button.onclick = async () => {
        if (!confirm("Remove this moderator?")) return;

        try {
          await callFunction("identity-admin", "remove_moderator", {
            p_user_id: button.dataset.removeModerator
          });

          showMessage("Moderator removed.", "success");
          await renderModerators(panel);
        } catch (error) {
          showMessage(friendlyError(error), "error");
        }
      };
    });
  }

  async function renderDeletionRequests(panel) {
    const { data, error } = await supabaseClient
      .from("identity_account_deletion_requests")
      .select("*")
      .order("requested_at", { ascending: false });

    if (error) throw error;

    panel.innerHTML = `
      <h3>Account Deletion Requests</h3>
      <p class="ip-muted">
        These are requests only. This dashboard does not permanently delete
        Supabase Auth accounts.
      </p>

      ${data?.length ? data.map(item => `
        <div class="ip-play">
          <strong>${escapeHTML(item.status.toUpperCase())}</strong>
          <p><strong>User:</strong> ${escapeHTML(item.user_id)}</p>
          <p>${escapeHTML(item.reason || "No reason provided.")}</p>
          <div class="ip-small">${escapeHTML(formatDate(item.requested_at))}</div>
        </div>
      `).join("") : `<p class="ip-muted">No deletion requests.</p>`}
    `;
  }

  async function renderModerationLogs(panel) {
    const { data, error } = await supabaseClient
      .from("identity_moderation_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    panel.innerHTML = `
      <h3>Moderation Logs</h3>
      ${data?.length ? `
        <div class="ip-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Action</th>
                <th>Actor</th>
                <th>Target User</th>
                <th>Date</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              ${data.map(item => `
                <tr>
                  <td>${escapeHTML(item.action)}</td>
                  <td>${escapeHTML(item.actor_id || "System")}</td>
                  <td>${escapeHTML(item.target_user_id || "—")}</td>
                  <td>${escapeHTML(formatDate(item.created_at))}</td>
                  <td>${escapeHTML(JSON.stringify(item.details || {}))}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      ` : `<p class="ip-muted">No moderation logs found.</p>`}
    `;
  }

  /* ------------------------------------------------------------
     SESSION, ROLE, AND PROFILE
  ------------------------------------------------------------ */

  async function signOut() {
    const { error } = await supabaseClient.auth.signOut();

    if (error) {
      showMessage(friendlyError(error), "error");
      return;
    }

    currentUser = null;
    currentProfile = null;
    currentRole = "user";
    currentPlayId = null;
    currentTab = "plays";

    renderAuth();
  }

  async function loadApplication() {
    const { data: sessionData, error: sessionError } =
      await supabaseClient.auth.getSession();

    if (sessionError) {
      renderAuth();
      return;
    }

    currentUser = sessionData.session?.user || null;

    if (!currentUser) {
      renderAuth();
      return;
    }

    const { data: profile, error: profileError } = await supabaseClient
      .from("identity_profiles")
      .select("*")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (profileError) {
      root.innerHTML = `
        <div class="ip-shell">
          <div class="ip-card">
            <div class="ip-message error">${escapeHTML(friendlyError(profileError))}</div>
            <button id="ipRetry">Retry</button>
            <button id="ipErrorSignout" class="secondary">Sign out</button>
          </div>
        </div>
      `;

      document.getElementById("ipRetry").onclick = loadApplication;
      document.getElementById("ipErrorSignout").onclick = signOut;
      return;
    }

    currentProfile = profile;

    if (!currentProfile?.username) {
      renderUsernameSetup();
      return;
    }

    currentRole = "user";

    try {
      const isAdmin = await callRPC("identity_is_admin");
      const isModerator = await callRPC("identity_is_moderator");

      if (isAdmin) currentRole = "admin";
      else if (isModerator) currentRole = "moderator";
    } catch (error) {
      console.warn("Could not check staff role:", error);
    }

    try {
      const active = await callRPC("identity_account_is_active");

      if (!active) {
        root.innerHTML = `
          <div class="ip-shell">
            <div class="ip-card">
              <h2 class="ip-section-title">Account Restricted</h2>
              <p>
                Your account currently has a restriction. You can sign out
                or visit Account Settings to submit an appeal.
              </p>
              <button id="ipRestrictedSignout">Sign out</button>
            </div>
          </div>
        `;

        document.getElementById("ipRestrictedSignout").onclick = signOut;
        return;
      }
    } catch (error) {
      console.warn("Could not check account status:", error);
    }

    renderDashboard();
  }

  /* ------------------------------------------------------------
     INITIALIZATION
  ------------------------------------------------------------ */

  let initializationStarted = false;
  let authListenerRegistered = false;

  async function initializeApp() {
    if (initializationStarted) return;
    initializationStarted = true;
    await loadApplication();

    if (!authListenerRegistered) {
      authListenerRegistered = true;
      supabaseClient.auth.onAuthStateChange((_event, session) => {
        currentUser = session?.user || null;

        if (!currentUser) {
          currentProfile = null;
          currentRole = "user";
          renderAuth();
        } else {
          setTimeout(loadApplication, 0);
        }
      });
    }
  }

  window.initializeIdentityApp = initializeApp;

  initializeApp();

})();
