/* ============================================================
   IDENTITY. PLAYBOOK — BUILD 4
   Complete frontend application
   Uses config.js, Supabase JS v2, court-designer.js, styles.css

   IMPORTANT: this file only *asks* Supabase to do things. Every
   permission (who may hide a play, block a user, read a report…)
   is enforced in the database by identity-playbook-security.sql.
   Hiding a button here never grants or removes real access.
   ============================================================ */

(() => {
  "use strict";

  const BUCKET = "identity-playbook-files";
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const MAX_PLAY_FILES = 5;
  const ALLOWED_FILES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
  const PLAY_TYPES = ["Offense", "Defense", "Inbound", "Transition", "Other"];
  const REPORT_REASONS = [
    "Inappropriate content", "Harassment or hate", "Spam", "Impersonation", "Copyright", "Other"
  ];
  const POLICY_VERSION = "v2";
  const POLICY_KEY = "identityPrivacyAccepted";
  window.IDENTITY_POLICY_VERSION = POLICY_VERSION;

  const $ = id => document.getElementById(id);
  const bodyEl = document.body;

  function setMode(mode) {
    bodyEl.classList.remove("ip-boot", "ip-auth", "ip-app");
    bodyEl.classList.add("ip-" + mode);
  }

  function policyAccepted() {
    try { return localStorage.getItem(POLICY_KEY) === POLICY_VERSION; }
    catch { return false; }
  }

  setMode(policyAccepted() ? "boot" : "auth");

  let root = $("identityAppRoot");
  if (!root) {
    root = document.createElement("div");
    root.id = "identityAppRoot";
    document.body.appendChild(root);
  }

  /* ------------------------------------------------------------
     SETUP CHECK
  ------------------------------------------------------------ */

  if (!window.supabase || typeof SUPABASE_URL === "undefined" || typeof SUPABASE_ANON_KEY === "undefined") {
    setMode("auth");
    const box = $("message");
    if (box) {
      box.className = "error";
      box.textContent = "The app could not start. Check your internet connection and that config.js is loaded.";
    }
    return;
  }

  const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  /* ------------------------------------------------------------
     STATE
  ------------------------------------------------------------ */

  let currentUser = null;
  let currentProfile = null;
  let currentRole = "user";         // "user" | "moderator" | "admin"
  let currentRestriction = null;    // active suspension/ban or null
  let currentTab = "home";
  let currentStaffTab = "reports";
  let staffReportFilter = "pending";
  let feedCache = [];
  let feedState = { q: "", category: "All", sort: "new" };
  let selectedPlay = null;
  let loadedUserId = null;
  let loadSeq = 0;

  /* ------------------------------------------------------------
     HELPERS
  ------------------------------------------------------------ */

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }

  function showMessage(message, type = "") {
    if (bodyEl.classList.contains("ip-auth")) {
      const box = $("message");
      if (box) { box.className = type; box.textContent = message; }
      return;
    }
    const region = $("toastRegion");
    if (!region) return;
    const toast = document.createElement("div");
    toast.className = "toast " + type;
    toast.textContent = message;
    toast.onclick = () => toast.remove();
    region.appendChild(toast);
    setTimeout(() => toast.remove(), type === "error" ? 9000 : 5000);
  }

  function clearMessage() {
    const box = $("message");
    if (box) { box.textContent = ""; box.className = ""; }
  }

  function getValue(id) { return $(id)?.value?.trim() ?? ""; }

  function formatDate(value) {
    if (!value) return "Unknown";
    const date = new Date(value);
    return isNaN(date) ? "Unknown" : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  }

  function slugify(text) {
    return String(text || "play").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "play";
  }

  function downloadJSON(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* Turns database / network errors into plain language. */
  function friendlyError(error) {
    const message = String(error?.message || "");
    const code = error?.code;
    if (/failed to fetch|networkerror|load failed/i.test(message)) {
      return "We could not reach the server. Check your connection and try again.";
    }
    if (code === "23505" || /duplicate key/i.test(message)) {
      return /username/i.test(message) ? "That username is already taken." : "That already exists.";
    }
    if (/row-level security|permission denied/i.test(message) || code === "42501") {
      return /required|restricted/i.test(message)
        ? message
        : "You do not have permission to do that.";
    }
    if (/jwt|not authenticated|invalid refresh/i.test(message)) {
      return "Your session has expired. Please sign in again.";
    }
    return message || "Something went wrong. Please try again.";
  }

  async function callRPC(name, args = {}) {
    const { data, error } = await supabaseClient.rpc(name, args);
    if (error) throw error;
    return data;
  }

  async function busy(button, task) {
    if (button) { button.disabled = true; button.setAttribute("aria-busy", "true"); }
    try { return await task(); }
    finally {
      if (button && button.isConnected) { button.disabled = false; button.removeAttribute("aria-busy"); }
    }
  }

  function loadingHTML(text = "Loading…") {
    return `<div class="loading" role="status"><span class="spinner" aria-hidden="true"></span>${escapeHTML(text)}</div>`;
  }

  function emptyHTML(icon, title, text, actionHTML = "") {
    return `<div class="empty"><span class="big" aria-hidden="true">${icon}</span><h3>${escapeHTML(title)}</h3><p>${escapeHTML(text)}</p>${actionHTML}</div>`;
  }

  function roleBadge(role) {
    if (role === "admin") return `<span class="badge badge-admin" title="Administrator">ADMIN</span>`;
    if (role === "moderator") return `<span class="badge badge-mod" title="Moderator">MOD</span>`;
    return "";
  }

  function courtHTML(diagram, label) {
    return typeof window.renderCourtPreview === "function"
      ? window.renderCourtPreview(diagram, { label })
      : "";
  }

  /* ------------------------------------------------------------
     DIALOGS (confirmations replace the browser's confirm())
  ------------------------------------------------------------ */

  function confirmAction(options) {
    const {
      title, message = "", confirmLabel = "Confirm", danger = false,
      requireText = null, input = null
    } = options;

    return new Promise(resolve => {
      const dialog = $("confirmDialog");
      dialog.innerHTML = `
        <form class="dialog-body" id="confirmForm" novalidate>
          <h2 id="confirmTitle">${escapeHTML(title)}</h2>
          ${message ? `<p class="muted">${escapeHTML(message)}</p>` : ""}
          ${requireText ? `
            <div class="field">
              <label for="confirmInput">Type <strong>${escapeHTML(requireText)}</strong> to continue</label>
              <input id="confirmInput" autocomplete="off">
            </div>` : ""}
          ${input ? `
            <div class="field">
              <label for="confirmText">${escapeHTML(input.label)}</label>
              <textarea id="confirmText" maxlength="${input.max || 500}"
                placeholder="${escapeHTML(input.placeholder || "")}"></textarea>
            </div>` : ""}
          <p id="confirmError" class="field-error" role="alert"></p>
          <div class="dialog-actions">
            <button type="button" class="btn secondary" id="confirmCancel">Cancel</button>
            <button type="submit" class="btn ${danger ? "danger" : ""}">${escapeHTML(confirmLabel)}</button>
          </div>
        </form>`;

      let accepted = false;
      let value = null;

      dialog.querySelector("form").onsubmit = event => {
        event.preventDefault();
        const error = $("confirmError");
        if (requireText && $("confirmInput").value.trim() !== requireText) {
          error.textContent = `Type ${requireText} exactly to continue.`;
          return;
        }
        if (input) {
          value = $("confirmText").value.trim();
          const min = input.min || 1;
          if (value.length < min) {
            error.textContent = `Please enter at least ${min} characters.`;
            return;
          }
        }
        accepted = true;
        dialog.close();
      };

      $("confirmCancel").onclick = () => dialog.close();
      dialog.onclose = () => resolve(input ? (accepted ? value : null) : accepted);
      dialog.showModal();
      (dialog.querySelector("input, textarea") || $("confirmCancel")).focus();
    });
  }

  /* ------------------------------------------------------------
     THEME (dark by default; saved per device and per account)
  ------------------------------------------------------------ */

  function applyTheme(theme) {
    theme = theme === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("identityTheme", theme); } catch { /* ignore */ }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === "light" ? "#f3f5f9" : "#101722";
    const button = $("themeToggle");
    if (button) {
      button.textContent = theme === "light" ? "🌙" : "☀️";
      button.setAttribute("aria-label", theme === "light" ? "Switch to dark mode" : "Switch to light mode");
    }
    const select = $("ipThemeSelect");
    if (select) select.value = theme;
  }

  async function saveTheme(theme) {
    applyTheme(theme);
    if (!currentUser) return;
    const { error } = await supabaseClient
      .from("identity_profiles").update({ theme }).eq("id", currentUser.id);
    if (error) {
      showMessage("Theme changed on this device, but it could not be saved to your account.", "error");
    } else if (currentProfile) {
      currentProfile.theme = theme;
    }
  }

  $("themeToggle").onclick = () => {
    saveTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
  };
  applyTheme(document.documentElement.dataset.theme);

  /* ------------------------------------------------------------
     HEADER, NAVIGATION, DOCK
  ------------------------------------------------------------ */

  function updateHeader() {
    const chip = $("userChip");
    const button = $("headerAuthButton");
    chip.innerHTML = currentUser && currentProfile?.username
      ? `<span class="user-chip"><span aria-hidden="true">🏀</span>@${escapeHTML(currentProfile.username)} ${roleBadge(currentRole)}</span>`
      : "";
    if (currentUser) {
      button.textContent = "Sign out";
      button.className = "btn sm secondary";
    } else {
      button.textContent = "Sign in";
      button.className = "btn sm";
    }
  }

  $("headerAuthButton").onclick = () => {
    if (currentUser) { signOut(); return; }
    $("email")?.focus();
    $("authForm")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  function buildNav() {
    const nav = $("appNav");
    const items = currentRestriction
      ? [["account", "👤 Account"]]
      : [
          ["home", "🏠 Homeboard"],
          ["create", "✏️ Create"],
          ["plays", "📋 My Plays"],
          ["files", "📁 My Files"],
          ["account", "👤 Account"]
        ];
    if (!currentRestriction && currentRole !== "user") {
      items.push(["staff", currentRole === "admin" ? "🛡️ Admin" : "🛡️ Moderation"]);
    }
    nav.innerHTML = items.map(([tab, label]) =>
      `<button type="button" class="nav-btn" data-tab="${tab}">${label}</button>`).join("");
    nav.onclick = event => {
      const button = event.target.closest("[data-tab]");
      if (button) openTab(button.dataset.tab);
    };
  }

  function setActiveNav(tab) {
    $("appNav").querySelectorAll("[data-tab]").forEach(button => {
      if (button.dataset.tab === tab) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
  }

  function renderDock() {
    const dock = $("ipDock");
    if (!dock) return;
    dock.hidden = !currentUser || !!currentRestriction;
    if (dock.hidden) return;

    const play = selectedPlay;
    dock.innerHTML = `
      <div class="dock-inner">
        <div class="dock-info">
          <div class="dock-icon" aria-hidden="true">🏀</div>
          <div class="dock-text">
            <div class="dock-title">${play ? escapeHTML(play.title) : "Select a play"}</div>
            <div class="dock-sub">${play
              ? `${escapeHTML(play.play_type || "Other")} · @${escapeHTML(play.username || "you")}`
              : "Open any play card to preview it here"}</div>
          </div>
        </div>
        <div class="dock-thumb" ${play ? "" : "hidden"}>${play ? courtHTML(play.diagram, `Preview of ${play.title}`) : ""}</div>
        <div class="dock-actions">
          <button type="button" class="btn sm secondary" id="dockOpen" ${play ? "" : "disabled"}>
            <span aria-hidden="true">👁</span><span class="label">Open</span></button>
          <button type="button" class="btn sm" id="dockDownload" ${play ? "" : "disabled"}>
            <span aria-hidden="true">⬇</span><span class="label">Download</span></button>
        </div>
      </div>`;
    $("dockOpen").onclick = () => { if (selectedPlay) openViewer(selectedPlay); };
    $("dockDownload").onclick = () => { if (selectedPlay) downloadPlay(selectedPlay); };
  }

  function selectPlay(play) {
    selectedPlay = play;
    renderDock();
  }

  function downloadPlay(play) {
    downloadJSON(`play-${slugify(play.title)}.json`, {
      title: play.title,
      type: play.play_type,
      description: play.description || "",
      creator: play.username || null,
      diagram: play.diagram || null,
      exported_from: "Identity Playbook"
    });
  }

  /* ------------------------------------------------------------
     AUTH SCREEN (uses the sign-in card in index.html)
  ------------------------------------------------------------ */

  function renderAuth() {
    setMode("auth");
    root.innerHTML = "";
    currentUser = null; currentProfile = null; currentRole = "user"; currentRestriction = null;
    loadedUserId = null; selectedPlay = null;
    updateHeader();
    $("ipDock").hidden = true;

    const form = $("authForm");
    const emailInput = $("email");
    const passwordInput = $("password");
    const submitButton = $("submitButton");
    const githubButton = $("githubButton");
    const switchButton = $("switchButton");
    const title = $("formTitle");
    const subtitle = $("formSubtitle");
    const switchText = $("switchText");
    const rules = $("passwordRules");

    let mode = "login";
    const setAuthMode = nextMode => {
      mode = nextMode;
      const signingUp = mode === "signup";
      title.textContent = signingUp ? "Create your account" : "Welcome back";
      subtitle.textContent = signingUp
        ? "Create an account to start building your basketball playbook."
        : "Sign in to get back to your playbook.";
      submitButton.textContent = signingUp ? "Create account" : "Sign in";
      switchText.textContent = signingUp ? "Already have an account?" : "New to Identity?";
      switchButton.textContent = signingUp ? "Sign in" : "Create account";
      passwordInput.autocomplete = signingUp ? "new-password" : "current-password";
      rules.hidden = !signingUp;
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
            showMessage("Account created. Loading your playbook…", "success");
          } else {
            showMessage("Account created. Check your email if confirmation is enabled, then sign in.", "success");
            setAuthMode("login");
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

    switchButton.onclick = () => setAuthMode(mode === "login" ? "signup" : "login");

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

    setAuthMode("login");
  }

  /* ------------------------------------------------------------
     USERNAME SETUP (first sign-in)
  ------------------------------------------------------------ */

  function renderUsernameSetup() {
    setMode("app");
    $("appNav").innerHTML = "";
    $("ipDock").hidden = true;
    updateHeader();

    root.innerHTML = `
      <div class="shell">
        <div class="card" style="max-width:480px;margin:40px auto;">
          <h2 class="section-title">Create your identity</h2>
          <p class="muted">
            Choose a unique username. It is shown on your public plays instead of your email,
            and it cannot be changed later.
          </p>

          <form id="ipUsernameForm" novalidate>
            <div class="field">
              <label for="ipUsername">Username</label>
              <input id="ipUsername" maxlength="24" minlength="3" autocomplete="username"
                     placeholder="YourUsername" aria-describedby="ipUsernameHint" required>
              <div id="ipUsernameHint" class="hint">3–24 letters, numbers or underscores.</div>
            </div>
            <p id="ipUsernameError" class="field-error" role="alert"></p>
            <div class="actions">
              <button type="submit" class="btn">Save username</button>
              <button type="button" id="ipUsernameSignout" class="btn secondary">Sign out</button>
            </div>
          </form>
        </div>
      </div>`;

    const errorBox = $("ipUsernameError");

    $("ipUsernameForm").onsubmit = async event => {
      event.preventDefault();
      errorBox.textContent = "";
      const username = getValue("ipUsername");

      if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
        errorBox.textContent = "Use 3–24 letters, numbers, or underscores.";
        return;
      }

      await busy(event.submitter, async () => {
        // The database enforces uniqueness, the format and reserved names (see the SQL trigger).
        // No upsert here: users may only INSERT (id, username) or UPDATE (username, theme),
        // and an upsert would also try to rewrite the id column.
        const query = supabaseClient.from("identity_profiles");
        const { error } = currentProfile
          ? await query.update({ username }).eq("id", currentUser.id)   // blank row from an older build
          : await query.insert({ id: currentUser.id, username });

        if (error) {
          errorBox.textContent = friendlyError(error);
          return;
        }
        await loadApplication(true);
      });
    };

    $("ipUsernameSignout").onclick = signOut;
    $("ipUsername").focus();
  }

  /* ------------------------------------------------------------
     TABS
  ------------------------------------------------------------ */

  async function openTab(tab) {
    if (currentRestriction) tab = "account";
    currentTab = tab;
    setActiveNav(tab === "edit" ? "plays" : tab);

    const content = $("ipContent");
    if (!content) return;
    content.innerHTML = loadingHTML();

    try {
      if (tab === "home") await renderHome(content);
      else if (tab === "create") renderPlayEditor(content);
      else if (tab === "plays") await renderPlays(content);
      else if (tab === "files") await renderFiles(content);
      else if (tab === "account") await renderAccount(content);
      else if (tab === "staff" && currentRole !== "user") await renderStaff(content);
      else content.innerHTML = emptyHTML("🤷", "Page not found", "That page does not exist.");
    } catch (error) {
      content.innerHTML = `
        <div class="card">
          <div class="field-error" role="alert">${escapeHTML(friendlyError(error))}</div>
          <button class="btn secondary" id="ipRetry" type="button">Try again</button>
        </div>`;
      $("ipRetry").onclick = () => openTab(tab);
    }

    const heading = content.querySelector("h2");
    if (heading) { heading.setAttribute("tabindex", "-1"); heading.focus({ preventScroll: true }); }
  }

  /* ------------------------------------------------------------
     HOMEBOARD (public plays from everyone)
  ------------------------------------------------------------ */

  function playCardHTML(play) {
    const mine = play.user_id === currentUser.id;
    const type = PLAY_TYPES.includes(play.play_type) ? play.play_type : "Other";
    return `
      <article class="play-card">
        <div class="card-top">
          <span class="dot t-${type}" aria-hidden="true"></span>
          <span>${escapeHTML(type)}</span>
          <span class="pill">🌐 Public</span>
        </div>
        <div class="card-court" data-view="${escapeHTML(play.id)}">
          ${courtHTML(play.diagram, `Court diagram for ${play.title}`)}
        </div>
        <h3><button type="button" data-view="${escapeHTML(play.id)}">${escapeHTML(play.title)}</button></h3>
        <p class="card-desc">${escapeHTML(play.description || "No description.")}</p>
        <div class="card-foot">
          <span class="creator"><span aria-hidden="true">👤</span>
            <span class="name">@${escapeHTML(play.username)}</span>${roleBadge(play.author_role)}</span>
          ${mine ? "" : `<button type="button" class="icon-btn" data-report="${escapeHTML(play.id)}"
              aria-label="Report ${escapeHTML(play.title)}" title="Report this play">🚩</button>`}
          <button type="button" class="icon-btn" data-download="${escapeHTML(play.id)}"
            aria-label="Download ${escapeHTML(play.title)}" title="Download play">⬇</button>
          <button type="button" class="icon-btn round" data-view="${escapeHTML(play.id)}"
            aria-label="Open ${escapeHTML(play.title)}" title="Open play">▶</button>
        </div>
      </article>`;
  }

  function filteredFeed() {
    const raw = feedState.q.trim().toLowerCase();
    let list = feedCache.filter(play => {
      if (feedState.category !== "All" && play.play_type !== feedState.category) return false;
      if (!raw) return true;
      if (raw.startsWith("@")) return (play.username || "").toLowerCase().includes(raw.slice(1));
      if (raw.startsWith("#")) return (play.description || "").toLowerCase().includes(raw);
      return (play.title || "").toLowerCase().includes(raw) ||
        (play.description || "").toLowerCase().includes(raw) ||
        (play.username || "").toLowerCase().includes(raw);
    });
    if (feedState.sort === "old") list = list.slice().reverse();
    else if (feedState.sort === "az") list = list.slice().sort((a, b) => a.title.localeCompare(b.title));
    return list;
  }

  function renderFeedGrid() {
    const grid = $("feedGrid");
    if (!grid) return;
    const list = filteredFeed();
    if (!feedCache.length) {
      grid.className = "";
      grid.innerHTML = `<div class="card">${emptyHTML("🏀", "No public plays yet",
        "Be the first to share one with the community.",
        `<button type="button" class="btn" id="ipFeedCreate">Create a play</button>`)}</div>`;
      $("ipFeedCreate").onclick = () => openTab("create");
      return;
    }
    if (!list.length) {
      grid.className = "";
      grid.innerHTML = `<div class="card">${emptyHTML("🔍", "No plays match your search",
        "Try a different word, category or creator.")}</div>`;
      return;
    }
    grid.className = "grid-cards";
    grid.innerHTML = list.map(playCardHTML).join("");
  }

  async function renderHome(content) {
    content.innerHTML = `
      <h2 class="sr-only">Homeboard</h2>
      <div id="ipAnnouncement"></div>

      <section class="card filter-card" aria-label="Find plays">
        <div class="filter-row">
          <div class="search">
            <span class="ico" aria-hidden="true">🔍</span>
            <label class="sr-only" for="feedSearch">Search plays</label>
            <input id="feedSearch" type="search" placeholder="Search title, @creator, or #hashtag…"
                   value="${escapeHTML(feedState.q)}" autocomplete="off">
          </div>
          <div class="sort">
            <label for="feedSort">Sort:</label>
            <select id="feedSort">
              <option value="new">Newest first</option>
              <option value="old">Oldest first</option>
              <option value="az">Title A–Z</option>
            </select>
          </div>
        </div>
        <div class="chips" role="group" aria-label="Categories">
          <span class="chips-label">CATEGORIES:</span>
          ${["All", ...PLAY_TYPES].map(cat => `
            <button type="button" class="chip" data-cat="${cat}" aria-pressed="${feedState.category === cat}">
              ${cat === "All" ? "All plays" : `<span class="dot t-${cat}" aria-hidden="true"></span>${cat}`}
            </button>`).join("")}
        </div>
      </section>

      <div id="feedGrid" aria-live="polite">${loadingHTML("Loading plays…")}</div>`;

    $("feedSort").value = feedState.sort;

    let timer;
    $("feedSearch").oninput = event => {
      clearTimeout(timer);
      timer = setTimeout(() => { feedState.q = event.target.value; renderFeedGrid(); }, 150);
    };
    $("feedSort").onchange = event => { feedState.sort = event.target.value; renderFeedGrid(); };
    content.querySelectorAll("[data-cat]").forEach(button => {
      button.onclick = () => {
        feedState.category = button.dataset.cat;
        content.querySelectorAll("[data-cat]").forEach(b =>
          b.setAttribute("aria-pressed", String(b === button)));
        renderFeedGrid();
      };
    });

    $("feedGrid").onclick = event => {
      const view = event.target.closest("[data-view]");
      const report = event.target.closest("[data-report]");
      const download = event.target.closest("[data-download]");
      const id = (view || report || download)?.dataset.view
        || report?.dataset.report || download?.dataset.download;
      const play = feedCache.find(item => item.id === id);
      if (!play) return;
      if (report) openReportDialog(play);
      else if (download) { selectPlay(play); downloadPlay(play); }
      else openViewer(play);
    };

    const [announcementResult, feedResult] = await Promise.all([
      supabaseClient.from("identity_announcements").select("id,message")
        .eq("active", true).order("created_at", { ascending: false }).limit(1),
      supabaseClient.from("identity_feed").select("*")
        .order("created_at", { ascending: false }).limit(300)
    ]);

    if (feedResult.error) throw feedResult.error;
    feedCache = feedResult.data || [];
    renderFeedGrid();

    const announcement = announcementResult.data?.[0];
    let dismissed = null;
    try { dismissed = localStorage.getItem("identityAnnouncementDismissed"); } catch { /* ignore */ }
    if (announcement && dismissed !== announcement.id && $("ipAnnouncement")) {
      $("ipAnnouncement").innerHTML = `
        <div class="banner" role="note">
          <span aria-hidden="true">📣</span>
          <p>${escapeHTML(announcement.message)}</p>
          <button type="button" class="icon-btn" id="ipDismissAnnouncement" aria-label="Dismiss announcement">✕</button>
        </div>`;
      $("ipDismissAnnouncement").onclick = () => {
        try { localStorage.setItem("identityAnnouncementDismissed", announcement.id); } catch { /* ignore */ }
        $("ipAnnouncement").innerHTML = "";
      };
    }
  }

  /* ------------------------------------------------------------
     PLAY VIEWER + REPORT DIALOG
  ------------------------------------------------------------ */

  async function openViewer(play) {
    selectPlay(play);
    const dialog = $("viewDialog");
    const mine = play.user_id === currentUser.id;
    const isStaff = currentRole !== "user";

    dialog.innerHTML = `
      <div class="dialog-body">
        <h2 id="viewTitle">${escapeHTML(play.title)}</h2>
        <p class="muted">
          <span class="dot t-${escapeHTML(PLAY_TYPES.includes(play.play_type) ? play.play_type : "Other")}" style="display:inline-block"></span>
          ${escapeHTML(play.play_type || "Other")} ·
          by <strong>@${escapeHTML(play.username || "unknown")}</strong> ${roleBadge(play.author_role)}
          · ${escapeHTML(formatDate(play.created_at))}
        </p>
        <div class="view-court">${courtHTML(play.diagram, `Court diagram for ${play.title}`)}</div>
        <p class="view-desc">${escapeHTML(play.description || "No description.")}</p>
        <div id="viewFiles">${loadingHTML("Loading attachments…")}</div>
        <div class="dialog-actions">
          ${!mine ? `<button type="button" class="btn ghost" id="viewReport">🚩 Report</button>` : ""}
          ${isStaff && !mine ? `<button type="button" class="btn ghost" id="viewHide">Hide play</button>` : ""}
          <button type="button" class="btn secondary" id="viewDownload">⬇ Download</button>
          <button type="button" class="btn" id="viewClose">Close</button>
        </div>
      </div>`;

    $("viewClose").onclick = () => dialog.close();
    $("viewDownload").onclick = () => downloadPlay(play);
    if ($("viewReport")) $("viewReport").onclick = () => { dialog.close(); openReportDialog(play); };
    if ($("viewHide")) $("viewHide").onclick = async () => {
      const reason = await confirmAction({
        title: "Hide this play?",
        message: "It will disappear from the Homeboard for everyone except you and staff.",
        confirmLabel: "Hide play",
        input: { label: "Reason (kept in the moderation history)", min: 3 }
      });
      if (!reason) return;
      try {
        await callRPC("identity_hide_play", { p_play_id: play.id, p_reason: reason });
        showMessage("Play hidden.", "success");
        dialog.close();
        if (currentTab === "home") openTab("home");
      } catch (error) { showMessage(friendlyError(error), "error"); }
    };

    dialog.showModal();
    $("viewClose").focus();

    // Attachments
    const box = $("viewFiles");
    try {
      const { data: files, error } = await supabaseClient
        .from("identity_play_files").select("*").eq("play_id", play.id).order("created_at");
      if (error) throw error;
      if (!files?.length) { box.innerHTML = ""; return; }

      const parts = [`<h3 style="margin:14px 0 6px;font-size:1rem">Attachments</h3>`];
      for (const file of files) {
        let preview = "";
        if (file.mime_type?.startsWith("image/")) {
          const { data: signed } = await supabaseClient.storage.from(BUCKET).createSignedUrl(file.path, 3600);
          if (signed?.signedUrl) {
            preview = `<img class="attach-img" src="${escapeHTML(signed.signedUrl)}"
              alt="${escapeHTML(file.alt_text || "Attached image: " + file.file_name)}">`;
          }
        }
        parts.push(`
          <div class="file-chip" style="flex-wrap:wrap">
            <span class="name">📎 ${escapeHTML(file.file_name)}</span>
            <button type="button" class="btn sm secondary" data-dl-path="${escapeHTML(file.path)}"
              data-dl-name="${escapeHTML(file.file_name)}">Download</button>
            ${preview ? `<div style="width:100%">${preview}</div>` : ""}
          </div>`);
      }
      box.innerHTML = parts.join("");
      box.querySelectorAll("[data-dl-path]").forEach(button => {
        button.onclick = async () => {
          const { data, error: dlError } = await supabaseClient.storage.from(BUCKET).download(button.dataset.dlPath);
          if (dlError) { showMessage(friendlyError(dlError), "error"); return; }
          downloadBlob(data, button.dataset.dlName);
        };
      });
    } catch (error) {
      box.innerHTML = `<p class="field-error">${escapeHTML(friendlyError(error))}</p>`;
    }
  }

  function openReportDialog(play) {
    const dialog = $("reportDialog");
    dialog.innerHTML = `
      <form class="dialog-body" id="reportForm" novalidate>
        <h2 id="reportTitle">Report this play</h2>
        <p class="muted">
          You are reporting <strong>${escapeHTML(play.title)}</strong> by @${escapeHTML(play.username || "unknown")}.
          A moderator will review it.
        </p>
        <div class="field">
          <label for="reportReason">Reason</label>
          <select id="reportReason">
            ${REPORT_REASONS.map(r => `<option>${escapeHTML(r)}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="reportDetails">Please explain what is wrong</label>
          <textarea id="reportDetails" maxlength="1000" required aria-describedby="reportHint"
            placeholder="Tell the moderators what you saw…"></textarea>
          <div id="reportHint" class="hint">At least 10 characters. Reports are only visible to you and staff.</div>
        </div>
        <p id="reportError" class="field-error" role="alert"></p>
        <div class="dialog-actions">
          <button type="button" class="btn secondary" id="reportCancel">Cancel</button>
          <button type="submit" class="btn">Send report</button>
        </div>
      </form>`;

    $("reportCancel").onclick = () => dialog.close();
    $("reportForm").onsubmit = async event => {
      event.preventDefault();
      const details = getValue("reportDetails");
      if (details.length < 10) {
        $("reportError").textContent = "Please explain the problem in at least 10 characters.";
        return;
      }
      await busy(event.submitter, async () => {
        try {
          await callRPC("identity_report_play", {
            p_play_id: play.id, p_reason: getValue("reportReason"), p_details: details
          });
          dialog.close();
          showMessage("Thank you. Your report was sent to the moderators.", "success");
        } catch (error) {
          $("reportError").textContent = friendlyError(error);
        }
      });
    };
    dialog.showModal();
    $("reportReason").focus();
  }

  /* ------------------------------------------------------------
     MY PLAYS
  ------------------------------------------------------------ */

  async function renderPlays(content) {
    const [playsResult, hiddenResult] = await Promise.all([
      supabaseClient.from("identity_plays").select("*")
        .eq("user_id", currentUser.id).order("updated_at", { ascending: false }),
      supabaseClient.from("identity_hidden_plays").select("play_id,reason")
    ]);
    if (playsResult.error) throw playsResult.error;

    const plays = playsResult.data || [];
    const hidden = new Map((hiddenResult.data || []).map(row => [row.play_id, row.reason]));

    content.innerHTML = `
      <section class="card">
        <div class="row">
          <div>
            <h2 class="section-title">My Plays</h2>
            <p class="muted">Everything you have saved. Public plays appear on the Homeboard.</p>
          </div>
          <button type="button" class="btn" id="ipNewPlay">+ Create play</button>
        </div>
        <div id="ipPlayList"></div>
      </section>`;

    $("ipNewPlay").onclick = () => openTab("create");
    const list = $("ipPlayList");

    if (!plays.length) {
      list.innerHTML = emptyHTML("📋", "No plays yet",
        "Draw your first play and save it to your playbook.");
      return;
    }

    list.innerHTML = plays.map(play => `
      <div class="item item-grid">
        <div class="thumb">${courtHTML(play.diagram, `Court diagram for ${play.title}`)}</div>
        <div>
          <h3>${escapeHTML(play.title)}</h3>
          <div class="muted">
            ${escapeHTML(play.play_type || "Other")} ·
            <span class="pill ${play.is_public ? "" : "private"}">${play.is_public ? "🌐 Public" : "🔒 Private"}</span>
            ${hidden.has(play.id) ? `<span class="pill warn">Hidden by moderators</span>` : ""}
          </div>
          ${hidden.has(play.id) ? `<p class="small">Reason: ${escapeHTML(hidden.get(play.id) || "Not provided")}</p>` : ""}
          <p>${escapeHTML(play.description || "No description.")}</p>
          <div class="small">Updated ${escapeHTML(formatDate(play.updated_at))}</div>
          <div class="actions">
            <button type="button" class="btn sm secondary" data-edit="${escapeHTML(play.id)}">Edit</button>
            <button type="button" class="btn sm ghost" data-open="${escapeHTML(play.id)}">Preview</button>
            <button type="button" class="btn sm danger" data-delete="${escapeHTML(play.id)}">Delete</button>
          </div>
        </div>
      </div>`).join("");

    list.onclick = async event => {
      const edit = event.target.closest("[data-edit]");
      const open = event.target.closest("[data-open]");
      const del = event.target.closest("[data-delete]");
      if (edit) {
        const play = plays.find(item => item.id === edit.dataset.edit);
        if (play) { currentTab = "edit"; setActiveNav("plays"); renderPlayEditor(content, play); }
      } else if (open) {
        const play = plays.find(item => item.id === open.dataset.open);
        if (play) openViewer({ ...play, username: currentProfile.username, author_role: currentRole });
      } else if (del) {
        const play = plays.find(item => item.id === del.dataset.delete);
        if (!play) return;
        const ok = await confirmAction({
          title: "Delete this play?",
          message: `“${play.title}” and its attachments will be permanently deleted. This cannot be undone.`,
          confirmLabel: "Delete play", danger: true
        });
        if (!ok) return;
        await busy(del, async () => {
          try {
            await removePlayFiles(play.id);
            const { error } = await supabaseClient.from("identity_plays")
              .delete().eq("id", play.id).eq("user_id", currentUser.id);
            if (error) throw error;
            showMessage("Play deleted.", "success");
            await renderPlays(content);
          } catch (error) { showMessage(friendlyError(error), "error"); }
        });
      }
    };
  }

  /* Remove a play's stored files (Storage API), then their metadata rows. */
  async function removePlayFiles(playId) {
    const { data: files, error } = await supabaseClient
      .from("identity_play_files").select("id,path").eq("play_id", playId);
    if (error) throw error;
    if (!files?.length) return;
    const { error: storageError } = await supabaseClient.storage.from(BUCKET).remove(files.map(f => f.path));
    if (storageError) throw storageError;
  }

  /* ------------------------------------------------------------
     PLAY EDITOR
  ------------------------------------------------------------ */

  function renderPlayEditor(content, play = null) {
    let pending = [];           // [{ file, alt }]
    let existing = [];          // saved attachments
    const editingId = play?.id || null;

    content.innerHTML = `
      <section class="card" id="playEditor">
        <h2 class="section-title">${play ? "Edit play" : "Create a play"}</h2>

        <form id="playForm" novalidate>
          <div class="field">
            <label for="ipPlayTitle">Play title</label>
            <input id="ipPlayTitle" maxlength="100" value="${escapeHTML(play?.title || "")}" required>
          </div>

          <div class="field-row">
            <div class="field">
              <label for="ipPlayType">Play type</label>
              <select id="ipPlayType">
                ${PLAY_TYPES.map(type =>
                  `<option ${play?.play_type === type ? "selected" : ""}>${type}</option>`).join("")}
              </select>
            </div>
            <div class="field">
              <label for="ipPlayVisibility">Who can see this play</label>
              <select id="ipPlayVisibility">
                <option value="public" ${play && !play.is_public ? "" : "selected"}>Public — signed-in users can see it</option>
                <option value="private" ${play && !play.is_public ? "selected" : ""}>Private — only me</option>
              </select>
            </div>
          </div>

          <div class="field">
            <label for="ipPlayDescription">Description <span class="muted">(optional)</span></label>
            <textarea id="ipPlayDescription" maxlength="2000">${escapeHTML(play?.description || "")}</textarea>
            <div class="hint">Add #hashtags so other players can find your play.</div>
          </div>

          <div id="ipCourtArea"></div>

          <fieldset class="field">
            <legend>Attachments (images or PDF, up to ${MAX_PLAY_FILES}, 10 MB each)</legend>
            <div id="ipExistingFiles"></div>
            <input id="ipPlayFileInput" type="file" multiple accept=".jpg,.jpeg,.png,.webp,.gif,.pdf"
                   aria-describedby="ipFileHint">
            <div id="ipFileHint" class="hint">Images need a short description so people using screen readers know what they show.</div>
            <div id="ipPendingFiles"></div>
          </fieldset>

          <p id="ipEditorError" class="field-error" role="alert"></p>

          <div class="actions">
            <button type="submit" class="btn">${play ? "Save changes" : "Save play"}</button>
            <button type="button" id="ipCancelPlay" class="btn secondary">Cancel</button>
          </div>
        </form>
      </section>`;

    $("ipCancelPlay").onclick = () => openTab(play ? "plays" : "home");

    if (typeof window.initCourtDesigner === "function") {
      try {
        window.initCourtDesigner();
        if (play?.diagram && typeof window.loadCourtDiagram === "function") window.loadCourtDiagram(play.diagram);
      } catch (error) {
        console.warn("Court designer initialization:", error);
      }
    }

    const existingBox = $("ipExistingFiles");
    const pendingBox = $("ipPendingFiles");

    function drawExisting() {
      existingBox.innerHTML = existing.map(file => `
        <div class="file-chip">
          <span class="name">📎 ${escapeHTML(file.file_name)}</span>
          <button type="button" class="btn sm danger" data-remove-file="${escapeHTML(file.id)}"
            aria-label="Remove attachment ${escapeHTML(file.file_name)}">Remove</button>
        </div>`).join("");
    }

    function drawPending() {
      pendingBox.innerHTML = pending.map((item, index) => `
        <div class="file-chip" style="flex-wrap:wrap">
          <span class="name">🆕 ${escapeHTML(item.file.name)}</span>
          <button type="button" class="btn sm secondary" data-drop-pending="${index}"
            aria-label="Do not upload ${escapeHTML(item.file.name)}">Remove</button>
          ${item.file.type.startsWith("image/") ? `
            <div style="width:100%">
              <label class="sr-only" for="ipAlt${index}">Description of ${escapeHTML(item.file.name)}</label>
              <input id="ipAlt${index}" data-alt="${index}" maxlength="200"
                placeholder="Describe this image (required)" value="${escapeHTML(item.alt)}">
            </div>` : ""}
        </div>`).join("");
    }

    existingBox.onclick = async event => {
      const button = event.target.closest("[data-remove-file]");
      if (!button) return;
      const file = existing.find(item => item.id === button.dataset.removeFile);
      if (!file) return;
      const ok = await confirmAction({
        title: "Remove this attachment?",
        message: `“${file.file_name}” will be permanently deleted.`,
        confirmLabel: "Remove", danger: true
      });
      if (!ok) return;
      await busy(button, async () => {
        try {
          const { error: storageError } = await supabaseClient.storage.from(BUCKET).remove([file.path]);
          if (storageError) throw storageError;
          const { error } = await supabaseClient.from("identity_play_files").delete().eq("id", file.id);
          if (error) throw error;
          existing = existing.filter(item => item.id !== file.id);
          drawExisting();
          showMessage("Attachment removed.", "success");
        } catch (error) { showMessage(friendlyError(error), "error"); }
      });
    };

    pendingBox.onclick = event => {
      const button = event.target.closest("[data-drop-pending]");
      if (!button) return;
      pending.splice(Number(button.dataset.dropPending), 1);
      drawPending();
    };
    pendingBox.oninput = event => {
      const input = event.target.closest("[data-alt]");
      if (input) pending[Number(input.dataset.alt)].alt = input.value;
    };

    $("ipPlayFileInput").onchange = event => {
      const errorBox = $("ipEditorError");
      errorBox.textContent = "";
      for (const file of Array.from(event.target.files)) {
        if (existing.length + pending.length >= MAX_PLAY_FILES) {
          errorBox.textContent = `A play can have at most ${MAX_PLAY_FILES} attachments.`;
          break;
        }
        if (file.size > MAX_FILE_SIZE) { errorBox.textContent = `“${file.name}” is larger than 10 MB.`; continue; }
        if (!ALLOWED_FILES.includes(file.type)) {
          errorBox.textContent = `“${file.name}” is not allowed. Use JPG, PNG, WEBP, GIF or PDF.`;
          continue;
        }
        pending.push({ file, alt: "" });
      }
      event.target.value = "";
      drawPending();
    };

    if (editingId) {
      supabaseClient.from("identity_play_files").select("*").eq("play_id", editingId).order("created_at")
        .then(({ data }) => { existing = data || []; drawExisting(); });
    }

    $("playForm").onsubmit = async event => {
      event.preventDefault();
      const errorBox = $("ipEditorError");
      errorBox.textContent = "";

      const title = getValue("ipPlayTitle");
      if (!title) { errorBox.textContent = "Give your play a title."; $("ipPlayTitle").focus(); return; }
      const missingAlt = pending.findIndex(item => item.file.type.startsWith("image/") && item.alt.trim().length < 3);
      if (missingAlt >= 0) {
        errorBox.textContent = "Please describe each image you are uploading (at least 3 characters).";
        $("ipAlt" + missingAlt)?.focus();
        return;
      }

      await busy(event.submitter, async () => {
        let diagram = null;
        if (typeof window.getCourtDiagram === "function") {
          try { diagram = window.getCourtDiagram(); } catch (error) { console.warn("Court diagram:", error); }
        }

        const payload = {
          title,
          play_type: getValue("ipPlayType"),
          description: getValue("ipPlayDescription") || null,
          diagram,
          is_public: $("ipPlayVisibility").value === "public"
        };

        try {
          let playId = editingId;
          if (editingId) {
            const { error } = await supabaseClient.from("identity_plays")
              .update(payload).eq("id", editingId).eq("user_id", currentUser.id);
            if (error) throw error;
          } else {
            const { data, error } = await supabaseClient.from("identity_plays")
              .insert({ ...payload, user_id: currentUser.id }).select("id").single();
            if (error) throw error;
            playId = data.id;
          }

          let uploadProblem = null;
          for (let i = 0; i < pending.length; i++) {
            try { await uploadPlayFile(playId, pending[i], i); }
            catch (error) { uploadProblem = error; }
          }

          if (uploadProblem) {
            showMessage(`Play saved, but an attachment failed: ${friendlyError(uploadProblem)}`, "error");
          } else {
            showMessage("Your play has been saved.", "success");
          }
          await openTab("plays");
        } catch (error) {
          errorBox.textContent = friendlyError(error);
        }
      });
    };

    $("ipPlayTitle").focus();
  }

  async function uploadPlayFile(playId, item, index) {
    const safeName = item.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${currentUser.id}/plays/${playId}/${Date.now()}_${index}_${safeName}`;
    const { error } = await supabaseClient.storage.from(BUCKET).upload(path, item.file, {
      cacheControl: "3600", upsert: false, contentType: item.file.type
    });
    if (error) throw error;
    const { error: rowError } = await supabaseClient.from("identity_play_files").insert({
      play_id: playId, user_id: currentUser.id, path,
      file_name: item.file.name, mime_type: item.file.type, size_bytes: item.file.size,
      alt_text: item.alt?.trim() || null
    });
    if (rowError) {
      await supabaseClient.storage.from(BUCKET).remove([path]);
      throw rowError;
    }
  }

  /* ------------------------------------------------------------
     MY FILES (private files not tied to a play)
  ------------------------------------------------------------ */

  async function renderFiles(content) {
    content.innerHTML = `
      <section class="card">
        <h2 class="section-title">My Files</h2>
        <p class="muted">Private files stored in your account. Maximum size: 10 MB. JPG, PNG, WEBP, GIF or PDF.</p>
        <div class="field">
          <label for="ipFileInput">Choose a file</label>
          <input id="ipFileInput" type="file" accept=".jpg,.jpeg,.png,.webp,.gif,.pdf">
        </div>
        <button type="button" class="btn" id="ipUploadFile">Upload file</button>
        <hr class="divider">
        <div id="ipFileList">${loadingHTML("Loading files…")}</div>
      </section>`;

    $("ipUploadFile").onclick = event => busy(event.currentTarget, uploadFile);

    const { data, error } = await supabaseClient.storage.from(BUCKET).list(currentUser.id, {
      limit: 100, sortBy: { column: "created_at", order: "desc" }
    });
    if (error) throw error;

    const files = (data || []).filter(file => file.id);   // skip the "plays" folder entry
    const list = $("ipFileList");

    if (!files.length) {
      list.innerHTML = emptyHTML("📁", "No uploaded files",
        "Files attached to a play are managed in that play's editor.");
      return;
    }

    list.innerHTML = files.map(file => `
      <div class="item">
        <strong>${escapeHTML(file.name)}</strong>
        <div class="small">${escapeHTML(formatDate(file.created_at))}</div>
        <div class="actions">
          <button type="button" class="btn sm secondary" data-download="${escapeHTML(file.name)}">Download</button>
          <button type="button" class="btn sm danger" data-remove="${escapeHTML(file.name)}">Delete</button>
        </div>
      </div>`).join("");

    list.onclick = async event => {
      const dl = event.target.closest("[data-download]");
      const rm = event.target.closest("[data-remove]");
      if (dl) {
        await busy(dl, async () => {
          const { data: blob, error: dlError } = await supabaseClient.storage
            .from(BUCKET).download(currentUser.id + "/" + dl.dataset.download);
          if (dlError) { showMessage(friendlyError(dlError), "error"); return; }
          downloadBlob(blob, dl.dataset.download);
        });
      } else if (rm) {
        const ok = await confirmAction({
          title: "Delete this file?", message: `“${rm.dataset.remove}” will be permanently deleted.`,
          confirmLabel: "Delete file", danger: true
        });
        if (!ok) return;
        await busy(rm, async () => {
          const { error: removeError } = await supabaseClient.storage
            .from(BUCKET).remove([currentUser.id + "/" + rm.dataset.remove]);
          if (removeError) { showMessage(friendlyError(removeError), "error"); return; }
          showMessage("File deleted.", "success");
          await renderFiles(content);
        });
      }
    };
  }

  async function uploadFile() {
    const input = $("ipFileInput");
    const file = input?.files?.[0];

    if (!file) { showMessage("Choose a file first.", "error"); return; }
    if (file.size > MAX_FILE_SIZE) { showMessage("The file must be 10 MB or smaller.", "error"); return; }
    if (!ALLOWED_FILES.includes(file.type)) {
      showMessage("Only JPG, PNG, WEBP, GIF, and PDF files are allowed.", "error");
      return;
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = currentUser.id + "/" + Date.now() + "_" + safeName;
    const { error } = await supabaseClient.storage.from(BUCKET).upload(path, file, {
      cacheControl: "3600", upsert: false, contentType: file.type
    });
    if (error) { showMessage(friendlyError(error), "error"); return; }

    showMessage("File uploaded privately.", "success");
    await renderFiles($("ipContent"));
  }

  /* ------------------------------------------------------------
     ACCOUNT
  ------------------------------------------------------------ */

  async function listAllStoragePaths(prefix) {
    const paths = [];
    let offset = 0;
    for (;;) {
      const { data, error } = await supabaseClient.storage.from(BUCKET).list(prefix, { limit: 100, offset });
      if (error) throw error;
      if (!data?.length) break;
      for (const entry of data) {
        if (entry.id) paths.push(prefix + "/" + entry.name);
        else paths.push(...await listAllStoragePaths(prefix + "/" + entry.name));
      }
      if (data.length < 100) break;
      offset += 100;
    }
    return paths;
  }

  async function renderAccount(content) {
    const { data: appeals, error: appealError } = await supabaseClient
      .from("identity_appeals").select("*").eq("user_id", currentUser.id)
      .order("created_at", { ascending: false });
    if (appealError) throw appealError;

    const providers = currentUser.app_metadata?.providers || [];
    const hasPassword = providers.includes("email");
    const restriction = currentRestriction;

    content.innerHTML = `
      <h2 class="sr-only">Account</h2>

      ${restriction ? `
        <section class="card" style="border-color:var(--danger)">
          <h2 class="section-title" style="color:var(--danger)">
            ${restriction.kind === "ban" ? "Your account is blocked" : "Your account is suspended"}
          </h2>
          <p>${escapeHTML(restriction.reason)}</p>
          <p class="muted">${restriction.expires_at
            ? "This restriction ends " + escapeHTML(formatDate(restriction.expires_at)) + "."
            : "This restriction does not have an end date."}
            While it is active you cannot create or edit plays, but you can still
            download or delete your data and submit an appeal.</p>
          <div class="field">
            <label for="ipAppealReason">Appeal this restriction</label>
            <textarea id="ipAppealReason" maxlength="1000" placeholder="Explain why this should be reviewed…"></textarea>
          </div>
          <button type="button" class="btn" id="ipSubmitAppeal">Submit appeal</button>
        </section>` : ""}

      <section class="card">
        <h2 class="section-title">Profile</h2>
        <p><strong>Username:</strong> @${escapeHTML(currentProfile?.username || "Not set")} ${roleBadge(currentRole)}</p>
        <p><strong>Email:</strong> ${escapeHTML(currentUser.email || "Connected account")}</p>
        <p class="muted">Role: ${escapeHTML(currentRole)}</p>
      </section>

      <section class="card">
        <h2 class="section-title">Appearance</h2>
        <div class="field" style="max-width:320px">
          <label for="ipThemeSelect">Theme (saved to your account)</label>
          <select id="ipThemeSelect">
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </div>
      </section>

      ${hasPassword ? `
        <section class="card">
          <h2 class="section-title">Change password</h2>
          <div class="field" style="max-width:360px">
            <label for="ipNewPassword">New password</label>
            <input id="ipNewPassword" type="password" autocomplete="new-password"
                   aria-describedby="ipPasswordHint">
            <div id="ipPasswordHint" class="hint">8+ characters with uppercase, lowercase and a number.</div>
          </div>
          <button type="button" class="btn" id="ipChangePassword">Update password</button>
        </section>` : ""}

      <section class="card">
        <h2 class="section-title">Your data and privacy</h2>
        <p class="muted">See what is stored and who can access it in the Privacy Policy.</p>
        <div class="actions">
          <button type="button" class="btn secondary" id="ipOpenPrivacy">Privacy Policy</button>
          <button type="button" class="btn secondary" id="ipExportData">⬇ Export my data</button>
        </div>
        <hr class="divider">
        <h3 style="margin:0 0 6px">Delete My Data</h3>
        <p class="muted">
          This permanently deletes your account, username, plays, attachments, uploaded files and appeals.
          Moderation records are kept without your email or username. This cannot be undone.
        </p>
        ${currentRole === "admin"
          ? `<p class="muted">Administrator accounts must be removed from the admin list in the database before deleting data.</p>`
          : `<button type="button" class="btn danger" id="ipDeleteMyData">Delete My Data</button>`}
      </section>

      ${(appeals?.length) ? `
        <section class="card">
          <h2 class="section-title">Your appeals</h2>
          ${appeals.map(item => `
            <div class="item">
              <strong>${escapeHTML(item.status.toUpperCase())}</strong>
              <p>${escapeHTML(item.reason)}</p>
              <div class="small">${escapeHTML(formatDate(item.created_at))}</div>
              ${item.review_notes ? `<p><em>Reviewer: ${escapeHTML(item.review_notes)}</em></p>` : ""}
            </div>`).join("")}
        </section>` : ""}`;

    $("ipThemeSelect").value = document.documentElement.dataset.theme || "dark";
    $("ipThemeSelect").onchange = event => saveTheme(event.target.value);
    $("ipOpenPrivacy").onclick = () => window.openIdentityPrivacy?.();

    if ($("ipChangePassword")) {
      $("ipChangePassword").onclick = event => busy(event.currentTarget, async () => {
        const password = $("ipNewPassword").value;
        if (password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
          showMessage("Use at least 8 characters, uppercase, lowercase, and a number.", "error");
          return;
        }
        const { error } = await supabaseClient.auth.updateUser({ password });
        if (error) showMessage(friendlyError(error), "error");
        else { $("ipNewPassword").value = ""; showMessage("Password updated.", "success"); }
      });
    }

    $("ipExportData").onclick = event => busy(event.currentTarget, async () => {
      try {
        const result = await callRPC("identity_export_my_data");
        downloadJSON("identity-playbook-data.json", result);
        showMessage("Your data export has been downloaded.", "success");
      } catch (error) { showMessage(friendlyError(error), "error"); }
    });

    if ($("ipSubmitAppeal")) {
      $("ipSubmitAppeal").onclick = event => busy(event.currentTarget, async () => {
        const reason = getValue("ipAppealReason");
        if (reason.length < 5) { showMessage("Please write at least 5 characters.", "error"); return; }
        try {
          await callRPC("identity_submit_appeal", { p_reason: reason });
          showMessage("Your appeal has been submitted.", "success");
          await renderAccount(content);
        } catch (error) { showMessage(friendlyError(error), "error"); }
      });
    }

    if ($("ipDeleteMyData")) {
      $("ipDeleteMyData").onclick = async event => {
        const button = event.currentTarget;
        const ok = await confirmAction({
          title: "Delete all of your data?",
          message: "Your account, plays, attachments and files will be permanently deleted. This cannot be undone.",
          confirmLabel: "Delete everything", danger: true, requireText: "DELETE"
        });
        if (!ok) return;
        await busy(button, async () => {
          try {
            const paths = await listAllStoragePaths(currentUser.id);
            for (let i = 0; i < paths.length; i += 100) {
              const { error } = await supabaseClient.storage.from(BUCKET).remove(paths.slice(i, i + 100));
              if (error) throw error;
            }
            await callRPC("identity_delete_my_data");
            try { await supabaseClient.auth.signOut({ scope: "local" }); } catch { /* account is gone */ }
            renderAuth();
            showMessage("Your data and account were deleted.", "success");
          } catch (error) { showMessage(friendlyError(error), "error"); }
        });
      };
    }
  }

  /* ------------------------------------------------------------
     STAFF DASHBOARD (moderators and administrators)
  ------------------------------------------------------------ */

  async function renderStaff(content) {
    const isAdmin = currentRole === "admin";
    const tabs = [["reports", "Reports"], ["hidden", "Hidden plays"], ["users", "Users"]];
    if (isAdmin) {
      tabs.push(["blocked", "Blocked users"], ["bans", "Ban requests"], ["appeals", "Appeals"],
        ["moderators", "Moderators"], ["announce", "Announcement"], ["logs", "Moderation history"]);
    }
    if (!tabs.some(t => t[0] === currentStaffTab)) currentStaffTab = "reports";

    content.innerHTML = `
      <section class="card">
        <h2 class="section-title">${isAdmin ? "Administrator dashboard" : "Moderator dashboard"}</h2>
        <p class="muted">
          What you can do here is decided by the database, not by this page.
          ${isAdmin ? "You have full administrator access." : "Moderators can review reports, hide plays and suspend users. Permanent blocks need an administrator."}
        </p>
        <div class="subnav" id="ipStaffNav">
          ${tabs.map(([id, label]) => `<button type="button" class="chip" data-staff="${id}"
             aria-pressed="${id === currentStaffTab}">${label}</button>`).join("")}
        </div>
        <div id="ipStaffContent"></div>
      </section>`;

    $("ipStaffNav").onclick = event => {
      const button = event.target.closest("[data-staff]");
      if (!button) return;
      currentStaffTab = button.dataset.staff;
      $("ipStaffNav").querySelectorAll("[data-staff]").forEach(b =>
        b.setAttribute("aria-pressed", String(b === button)));
      renderStaffSection(currentStaffTab);
    };
    await renderStaffSection(currentStaffTab);
  }

  async function renderStaffSection(section) {
    const panel = $("ipStaffContent");
    if (!panel) return;
    panel.innerHTML = loadingHTML();
    try {
      if (section === "reports") await renderStaffReports(panel);
      else if (section === "hidden") await renderHiddenPlays(panel);
      else if (section === "users") renderUserActions(panel);
      else if (section === "blocked") await renderBlockedUsers(panel);
      else if (section === "bans") await renderBanRequests(panel);
      else if (section === "appeals") await renderStaffAppeals(panel);
      else if (section === "moderators") await renderModerators(panel);
      else if (section === "announce") await renderAnnouncement(panel);
      else if (section === "logs") await renderModerationLogs(panel);
    } catch (error) {
      panel.innerHTML = `<p class="field-error" role="alert">${escapeHTML(friendlyError(error))}</p>`;
    }
  }

  async function fetchPlayForStaff(playId) {
    const { data: play, error } = await supabaseClient
      .from("identity_plays").select("*").eq("id", playId).maybeSingle();
    if (error) throw error;
    if (!play) return null;
    const { data: owner } = await supabaseClient
      .from("identity_profiles").select("username").eq("id", play.user_id).maybeSingle();
    return { ...play, username: owner?.username || "unknown", author_role: "user" };
  }

  async function renderStaffReports(panel) {
    const reports = await callRPC("identity_staff_reports",
      { p_status: staffReportFilter === "pending" ? "pending" : null }) || [];

    panel.innerHTML = `
      <div class="row">
        <h3 style="margin:0">Reports</h3>
        <div class="subnav" style="margin:0">
          <button type="button" class="chip" data-rf="pending" aria-pressed="${staffReportFilter === "pending"}">Pending</button>
          <button type="button" class="chip" data-rf="all" aria-pressed="${staffReportFilter === "all"}">All</button>
        </div>
      </div>
      ${reports.length ? reports.map(report => `
        <div class="item">
          <div class="row">
            <strong>${escapeHTML(report.status.toUpperCase())} · ${escapeHTML(report.reason)}</strong>
            <span class="small">${escapeHTML(formatDate(report.created_at))}</span>
          </div>
          <p>${escapeHTML(report.details || "No extra details.")}</p>
          <p class="small">
            Play: <strong>${escapeHTML(report.play_title || "Unknown")}</strong>
            ${report.play_hidden ? `<span class="pill warn">Hidden</span>` : ""}
            ${report.play_exists ? "" : `<span class="pill private">No longer exists</span>`}<br>
            Creator: @${escapeHTML(report.reported_username || "unknown")} ·
            Reported by: @${escapeHTML(report.reporter_username || "deleted user")}
          </p>
          ${report.review_notes ? `<p class="small">Notes: ${escapeHTML(report.review_notes)}</p>` : ""}
          ${report.status === "pending" ? `
            <div class="field">
              <label for="ipReportNotes_${escapeHTML(report.id)}">Review notes (optional)</label>
              <textarea id="ipReportNotes_${escapeHTML(report.id)}" maxlength="500"></textarea>
            </div>
            <div class="actions">
              ${report.play_exists ? `<button type="button" class="btn sm ghost" data-view-play="${escapeHTML(report.play_id)}">View play</button>` : ""}
              ${report.play_exists && !report.play_hidden
                ? `<button type="button" class="btn sm danger" data-hide-play="${escapeHTML(report.play_id)}">Hide play</button>` : ""}
              <button type="button" class="btn sm" data-review="reviewed" data-id="${escapeHTML(report.id)}">Mark reviewed</button>
              <button type="button" class="btn sm secondary" data-review="dismissed" data-id="${escapeHTML(report.id)}">Dismiss</button>
            </div>` : (report.play_exists ? `
            <div class="actions"><button type="button" class="btn sm ghost" data-view-play="${escapeHTML(report.play_id)}">View play</button></div>` : "")}
        </div>`).join("")
        : emptyHTML("✅", staffReportFilter === "pending" ? "No pending reports" : "No reports",
            "Nothing needs your attention right now.")}`;

    panel.onclick = async event => {
      const filter = event.target.closest("[data-rf]");
      const view = event.target.closest("[data-view-play]");
      const hide = event.target.closest("[data-hide-play]");
      const review = event.target.closest("[data-review]");

      if (filter) { staffReportFilter = filter.dataset.rf; await renderStaffReports(panel); return; }

      if (view) {
        await busy(view, async () => {
          try {
            const play = await fetchPlayForStaff(view.dataset.viewPlay);
            if (!play) { showMessage("That play no longer exists.", "error"); return; }
            openViewer(play);
          } catch (error) { showMessage(friendlyError(error), "error"); }
        });
      } else if (hide) {
        const reason = await confirmAction({
          title: "Hide this play?",
          message: "It will be removed from the Homeboard and its files will no longer be visible to other users.",
          confirmLabel: "Hide play", danger: true,
          input: { label: "Reason (kept in the moderation history)", min: 3 }
        });
        if (!reason) return;
        await busy(hide, async () => {
          try {
            await callRPC("identity_hide_play", { p_play_id: hide.dataset.hidePlay, p_reason: reason });
            showMessage("Play hidden.", "success");
            await renderStaffReports(panel);
          } catch (error) { showMessage(friendlyError(error), "error"); }
        });
      } else if (review) {
        await busy(review, async () => {
          try {
            await callRPC("identity_review_report", {
              p_report_id: review.dataset.id,
              p_status: review.dataset.review,
              p_notes: getValue("ipReportNotes_" + review.dataset.id) || null
            });
            showMessage("Report updated.", "success");
            await renderStaffReports(panel);
          } catch (error) { showMessage(friendlyError(error), "error"); }
        });
      }
    };
  }

  async function renderHiddenPlays(panel) {
    const items = await callRPC("identity_staff_hidden_plays") || [];
    const isAdmin = currentRole === "admin";

    panel.innerHTML = `
      <h3 style="margin-top:0">Hidden plays</h3>
      ${items.length ? items.map(item => `
        <div class="item">
          <strong>${escapeHTML(item.title)}</strong> <span class="small">by @${escapeHTML(item.owner_username || "unknown")}</span>
          <p>${escapeHTML(item.reason || "No reason recorded.")}</p>
          <div class="small">Hidden by @${escapeHTML(item.hidden_by_username || "unknown")} ·
            ${escapeHTML(formatDate(item.created_at))} · ${Number(item.file_count) || 0} attached file(s)</div>
          <div class="actions">
            <button type="button" class="btn sm ghost" data-view-play="${escapeHTML(item.play_id)}">View</button>
            <button type="button" class="btn sm secondary" data-restore="${escapeHTML(item.play_id)}">Restore</button>
            ${isAdmin ? `<button type="button" class="btn sm danger" data-delete-play="${escapeHTML(item.play_id)}"
              data-title="${escapeHTML(item.title)}">Remove permanently</button>` : ""}
          </div>
        </div>`).join("")
        : emptyHTML("🙈", "No hidden plays", "Plays hidden by staff will appear here.")}`;

    panel.onclick = async event => {
      const view = event.target.closest("[data-view-play]");
      const restore = event.target.closest("[data-restore]");
      const del = event.target.closest("[data-delete-play]");

      if (view) {
        await busy(view, async () => {
          try {
            const play = await fetchPlayForStaff(view.dataset.viewPlay);
            if (play) openViewer(play);
          } catch (error) { showMessage(friendlyError(error), "error"); }
        });
      } else if (restore) {
        const ok = await confirmAction({
          title: "Restore this play?", message: "It will become visible again if its owner made it public.",
          confirmLabel: "Restore"
        });
        if (!ok) return;
        await busy(restore, async () => {
          try {
            await callRPC("identity_restore_play", { p_play_id: restore.dataset.restore });
            showMessage("Play restored.", "success");
            await renderHiddenPlays(panel);
          } catch (error) { showMessage(friendlyError(error), "error"); }
        });
      } else if (del) {
        const ok = await confirmAction({
          title: "Permanently remove this play?",
          message: `“${del.dataset.title}” and all of its attached files will be deleted for good. This cannot be undone.`,
          confirmLabel: "Remove permanently", danger: true, requireText: "REMOVE"
        });
        if (!ok) return;
        await busy(del, async () => {
          try {
            await removePlayFiles(del.dataset.deletePlay);          // stored files first
            await callRPC("identity_delete_play", { p_play_id: del.dataset.deletePlay });
            showMessage("Play and files removed.", "success");
            await renderHiddenPlays(panel);
          } catch (error) { showMessage(friendlyError(error), "error"); }
        });
      }
    };
  }

  async function lookupUser(username) {
    if (!username) throw new Error("Enter a username first.");
    const user = await callRPC("identity_staff_lookup_user", { p_username: username.replace(/^@/, "") });
    if (!user) throw new Error("No user with that username was found.");
    return user;
  }

  function renderUserActions(panel) {
    const isAdmin = currentRole === "admin";
    panel.innerHTML = `
      <h3 style="margin-top:0">Look up a user</h3>
      <form id="ipLookupForm" class="row" style="align-items:flex-end;max-width:520px" novalidate>
        <div class="field" style="flex:1;margin:0;min-width:200px">
          <label for="ipTargetUsername">Username</label>
          <input id="ipTargetUsername" placeholder="@username" autocomplete="off">
        </div>
        <button type="submit" class="btn">Look up</button>
      </form>
      <div id="ipUserResult" style="margin-top:16px"></div>`;

    $("ipLookupForm").onsubmit = async event => {
      event.preventDefault();
      const result = $("ipUserResult");
      result.innerHTML = loadingHTML("Looking up…");
      try {
        const user = await lookupUser(getValue("ipTargetUsername"));
        const restricted = !!user.restriction;
        const canAct = user.role === "user" || (isAdmin && user.role === "moderator");

        result.innerHTML = `
          <div class="item">
            <h3>@${escapeHTML(user.username)} ${roleBadge(user.role)}</h3>
            <p class="muted">Role: ${escapeHTML(user.role)}</p>
            ${restricted ? `<p><span class="pill warn">${escapeHTML(user.restriction.kind === "ban" ? "Blocked" : "Suspended")}</span>
              ${escapeHTML(user.restriction.reason)}
              ${user.restriction.expires_at ? "· until " + escapeHTML(formatDate(user.restriction.expires_at)) : ""}</p>` : ""}
            ${canAct ? `
              <div class="field"><label for="ipActionReason">Reason</label>
                <textarea id="ipActionReason" maxlength="500" placeholder="Explain the reason…"></textarea></div>
              <div class="field" style="max-width:240px"><label for="ipSuspensionHours">Suspension length (hours)</label>
                <input id="ipSuspensionHours" type="number" min="1" max="720" value="24"></div>
              <div class="actions">
                <button type="button" class="btn sm" id="ipSuspendUser">Suspend user</button>
                ${isAdmin
                  ? `<button type="button" class="btn sm danger" id="ipBlockUser">Block permanently</button>`
                  : `<button type="button" class="btn sm danger" id="ipRequestBan">Request permanent block</button>`}
                ${isAdmin && restricted ? `<button type="button" class="btn sm secondary" id="ipLiftRestriction">Lift restriction</button>` : ""}
              </div>`
              : `<p class="muted">You cannot take action on this account.</p>`}
          </div>`;

        const act = (id, fn, successMessage, confirmOptions) => {
          const button = $(id);
          if (!button) return;
          button.onclick = async () => {
            const reason = getValue("ipActionReason");
            if (id !== "ipLiftRestriction" && reason.length < 3) {
              showMessage("Please add a reason first.", "error");
              $("ipActionReason").focus();
              return;
            }
            const ok = await confirmAction(confirmOptions);
            if (!ok) return;
            await busy(button, async () => {
              try {
                await fn(reason);
                showMessage(successMessage, "success");
                $("ipLookupForm").requestSubmit();
              } catch (error) { showMessage(friendlyError(error), "error"); }
            });
          };
        };

        act("ipSuspendUser",
          reason => callRPC("identity_suspend_user", {
            p_user_id: user.id, p_reason: reason, p_hours: Number(getValue("ipSuspensionHours")) }),
          "Suspension recorded.",
          { title: `Suspend @${user.username}?`, message: "They will not be able to post or edit until it ends.", confirmLabel: "Suspend", danger: true });
        act("ipRequestBan",
          reason => callRPC("identity_request_ban", { p_user_id: user.id, p_reason: reason }),
          "Block request sent to the administrators.",
          { title: `Request a permanent block for @${user.username}?`, message: "An administrator will review your request.", confirmLabel: "Send request" });
        act("ipBlockUser",
          reason => callRPC("identity_block_user", { p_user_id: user.id, p_reason: reason }),
          "User blocked.",
          { title: `Permanently block @${user.username}?`, message: "Their public plays disappear and they lose the ability to post.", confirmLabel: "Block user", danger: true });
        act("ipLiftRestriction",
          reason => callRPC("identity_lift_restriction", { p_user_id: user.id, p_reason: reason || null }),
          "Restriction lifted.",
          { title: `Lift the restriction on @${user.username}?`, confirmLabel: "Lift restriction" });
      } catch (error) {
        result.innerHTML = `<p class="field-error" role="alert">${escapeHTML(friendlyError(error))}</p>`;
      }
    };
  }

  async function renderBlockedUsers(panel) {
    const items = await callRPC("identity_admin_restrictions") || [];
    panel.innerHTML = `
      <h3 style="margin-top:0">Blocked and suspended users</h3>
      ${items.length ? items.map(item => `
        <div class="item">
          <strong>@${escapeHTML(item.username || "unknown")}</strong>
          <span class="pill warn">${item.kind === "ban" ? "Blocked" : "Suspended"}</span>
          <p>${escapeHTML(item.reason)}</p>
          <div class="small">${escapeHTML(formatDate(item.created_at))}
            ${item.expires_at ? "· ends " + escapeHTML(formatDate(item.expires_at)) : "· no end date"}</div>
          <div class="actions">
            <button type="button" class="btn sm secondary" data-lift="${escapeHTML(item.user_id)}"
              data-name="${escapeHTML(item.username || "this user")}">Lift restriction</button>
          </div>
        </div>`).join("")
        : emptyHTML("🕊️", "No active restrictions", "Nobody is currently blocked or suspended.")}`;

    panel.onclick = async event => {
      const button = event.target.closest("[data-lift]");
      if (!button) return;
      const ok = await confirmAction({
        title: `Lift the restriction on @${button.dataset.name}?`, confirmLabel: "Lift restriction"
      });
      if (!ok) return;
      await busy(button, async () => {
        try {
          await callRPC("identity_lift_restriction", { p_user_id: button.dataset.lift, p_reason: null });
          showMessage("Restriction lifted.", "success");
          await renderBlockedUsers(panel);
        } catch (error) { showMessage(friendlyError(error), "error"); }
      });
    };
  }

  async function renderBanRequests(panel) {
    const items = await callRPC("identity_admin_ban_requests") || [];
    panel.innerHTML = `
      <h3 style="margin-top:0">Permanent block requests</h3>
      ${items.length ? items.map(item => `
        <div class="item">
          <strong>${escapeHTML(item.status.toUpperCase())}</strong>
          · @${escapeHTML(item.target_username || "unknown")}
          <p>${escapeHTML(item.reason)}</p>
          <div class="small">Requested by @${escapeHTML(item.requested_by_username || "unknown")} ·
            ${escapeHTML(formatDate(item.created_at))}</div>
          ${item.review_notes ? `<p class="small">Notes: ${escapeHTML(item.review_notes)}</p>` : ""}
          ${item.status === "pending" ? `
            <div class="field"><label for="ipBanNotes_${escapeHTML(item.id)}">Review notes (optional)</label>
              <textarea id="ipBanNotes_${escapeHTML(item.id)}" maxlength="500"></textarea></div>
            <div class="actions">
              <button type="button" class="btn sm danger" data-ban-decision="approved" data-id="${escapeHTML(item.id)}">Approve block</button>
              <button type="button" class="btn sm secondary" data-ban-decision="rejected" data-id="${escapeHTML(item.id)}">Reject</button>
            </div>` : ""}
        </div>`).join("")
        : emptyHTML("📭", "No requests", "Moderators' block requests will appear here.")}`;

    panel.onclick = async event => {
      const button = event.target.closest("[data-ban-decision]");
      if (!button) return;
      const approve = button.dataset.banDecision === "approved";
      const ok = await confirmAction({
        title: approve ? "Approve this permanent block?" : "Reject this request?",
        confirmLabel: approve ? "Approve block" : "Reject", danger: approve
      });
      if (!ok) return;
      await busy(button, async () => {
        try {
          await callRPC("identity_review_ban", {
            p_request_id: button.dataset.id, p_decision: button.dataset.banDecision,
            p_notes: getValue("ipBanNotes_" + button.dataset.id) || null
          });
          showMessage("Request reviewed.", "success");
          await renderBanRequests(panel);
        } catch (error) { showMessage(friendlyError(error), "error"); }
      });
    };
  }

  async function renderStaffAppeals(panel) {
    const items = await callRPC("identity_admin_appeals") || [];
    panel.innerHTML = `
      <h3 style="margin-top:0">Appeals</h3>
      ${items.length ? items.map(item => `
        <div class="item">
          <strong>${escapeHTML(item.status.toUpperCase())}</strong> · @${escapeHTML(item.username || "unknown")}
          <p>${escapeHTML(item.reason)}</p>
          <div class="small">${escapeHTML(formatDate(item.created_at))}</div>
          ${item.review_notes ? `<p class="small">Notes: ${escapeHTML(item.review_notes)}</p>` : ""}
          ${item.status === "pending" ? `
            <div class="field"><label for="ipAppealNotes_${escapeHTML(item.id)}">Review notes (optional)</label>
              <textarea id="ipAppealNotes_${escapeHTML(item.id)}" maxlength="500"></textarea></div>
            <div class="actions">
              <button type="button" class="btn sm" data-appeal="approved" data-id="${escapeHTML(item.id)}">Approve (lifts restriction)</button>
              <button type="button" class="btn sm secondary" data-appeal="rejected" data-id="${escapeHTML(item.id)}">Reject</button>
            </div>` : ""}
        </div>`).join("")
        : emptyHTML("📬", "No appeals", "Appeals from restricted users will appear here.")}`;

    panel.onclick = async event => {
      const button = event.target.closest("[data-appeal]");
      if (!button) return;
      const approve = button.dataset.appeal === "approved";
      const ok = await confirmAction({
        title: approve ? "Approve this appeal?" : "Reject this appeal?",
        message: approve ? "The user's restriction will be lifted." : "",
        confirmLabel: approve ? "Approve" : "Reject"
      });
      if (!ok) return;
      await busy(button, async () => {
        try {
          await callRPC("identity_review_appeal", {
            p_appeal_id: button.dataset.id, p_decision: button.dataset.appeal,
            p_notes: getValue("ipAppealNotes_" + button.dataset.id) || null
          });
          showMessage("Appeal reviewed.", "success");
          await renderStaffAppeals(panel);
        } catch (error) { showMessage(friendlyError(error), "error"); }
      });
    };
  }

  async function renderModerators(panel) {
    const items = await callRPC("identity_list_moderators") || [];
    panel.innerHTML = `
      <h3 style="margin-top:0">Manage moderators</h3>
      <form id="ipAddModForm" class="row" style="align-items:flex-end;max-width:520px" novalidate>
        <div class="field" style="flex:1;margin:0;min-width:200px">
          <label for="ipModeratorUser">Username to promote</label>
          <input id="ipModeratorUser" placeholder="@username" autocomplete="off">
        </div>
        <button type="submit" class="btn">Add moderator</button>
      </form>
      <hr class="divider">
      <h3>Current moderators</h3>
      ${items.length ? items.map(item => `
        <div class="item row">
          <div><strong>@${escapeHTML(item.username || "unknown")}</strong> ${roleBadge("moderator")}
            <div class="small">Added ${escapeHTML(formatDate(item.created_at))}</div></div>
          <button type="button" class="btn sm danger" data-remove-mod="${escapeHTML(item.user_id)}"
            data-name="${escapeHTML(item.username || "this user")}">Remove</button>
        </div>`).join("")
        : emptyHTML("🛡️", "No moderators yet", "Promote a trusted user by username.")}`;

    $("ipAddModForm").onsubmit = async event => {
      event.preventDefault();
      await busy(event.submitter, async () => {
        try {
          const user = await lookupUser(getValue("ipModeratorUser"));
          const ok = await confirmAction({
            title: `Make @${user.username} a moderator?`,
            message: "They will be able to read reports, hide plays and suspend users.",
            confirmLabel: "Add moderator"
          });
          if (!ok) return;
          await callRPC("identity_add_moderator", { p_user_id: user.id });
          showMessage("Moderator added.", "success");
          await renderModerators(panel);
        } catch (error) { showMessage(friendlyError(error), "error"); }
      });
    };

    panel.onclick = async event => {
      const button = event.target.closest("[data-remove-mod]");
      if (!button) return;
      const ok = await confirmAction({
        title: `Remove @${button.dataset.name} as moderator?`, confirmLabel: "Remove", danger: true
      });
      if (!ok) return;
      await busy(button, async () => {
        try {
          await callRPC("identity_remove_moderator", { p_user_id: button.dataset.removeMod });
          showMessage("Moderator removed.", "success");
          await renderModerators(panel);
        } catch (error) { showMessage(friendlyError(error), "error"); }
      });
    };
  }

  async function renderAnnouncement(panel) {
    const { data } = await supabaseClient.from("identity_announcements")
      .select("message").eq("active", true).order("created_at", { ascending: false }).limit(1);
    const current = data?.[0]?.message || "";

    panel.innerHTML = `
      <h3 style="margin-top:0">Homeboard announcement</h3>
      <p class="muted">Shown at the top of the Homeboard for everyone. Leave empty and save to remove it.</p>
      <div class="field">
        <label for="ipAnnouncementText">Message (max 280 characters)</label>
        <textarea id="ipAnnouncementText" maxlength="280">${escapeHTML(current)}</textarea>
      </div>
      <button type="button" class="btn" id="ipSaveAnnouncement">Save announcement</button>`;

    $("ipSaveAnnouncement").onclick = event => busy(event.currentTarget, async () => {
      try {
        await callRPC("identity_set_announcement", { p_message: getValue("ipAnnouncementText") });
        showMessage("Announcement saved.", "success");
      } catch (error) { showMessage(friendlyError(error), "error"); }
    });
  }

  async function renderModerationLogs(panel) {
    const items = await callRPC("identity_admin_logs") || [];
    panel.innerHTML = `
      <h3 style="margin-top:0">Moderation history</h3>
      <p class="muted">Every staff action is recorded here. Entries cannot be edited or deleted.</p>
      ${items.length ? `
        <div class="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Action</th><th>By</th><th>Target</th><th>Details</th></tr></thead>
            <tbody>
              ${items.map(item => `
                <tr>
                  <td>${escapeHTML(formatDate(item.created_at))}</td>
                  <td>${escapeHTML(String(item.action).replace(/_/g, " "))}</td>
                  <td>${escapeHTML(item.actor_username ? "@" + item.actor_username : "System")}</td>
                  <td>${escapeHTML(item.target_username ? "@" + item.target_username : "—")}</td>
                  <td>${escapeHTML(JSON.stringify(item.details || {}))}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>`
        : emptyHTML("🗒️", "No history yet", "Staff actions will be listed here.")}`;
  }

  /* ------------------------------------------------------------
     SESSION, ROLE, AND PROFILE
  ------------------------------------------------------------ */

  async function signOut() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) { showMessage(friendlyError(error), "error"); return; }
    currentTab = "home";
    renderAuth();
  }

  function renderStartupError(error) {
    setMode("app");
    $("appNav").innerHTML = "";
    $("ipDock").hidden = true;
    root.innerHTML = `
      <div class="shell"><div class="card">
        <div class="field-error" role="alert">${escapeHTML(friendlyError(error))}</div>
        <div class="actions">
          <button type="button" id="ipRetry" class="btn">Retry</button>
          <button type="button" id="ipErrorSignout" class="btn secondary">Sign out</button>
        </div>
      </div></div>`;
    $("ipRetry").onclick = () => loadApplication(true);
    $("ipErrorSignout").onclick = signOut;
  }

  async function loadApplication(force = false) {
    const seq = ++loadSeq;

    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    if (seq !== loadSeq) return;
    if (sessionError || !sessionData.session) { renderAuth(); return; }

    currentUser = sessionData.session.user;
    if (!force && loadedUserId === currentUser.id && currentProfile) return;   // already showing this user

    setMode("boot");
    root.innerHTML = `<div class="shell">${loadingHTML("Loading your playbook…")}</div>`;

    const { data: profile, error: profileError } = await supabaseClient
      .from("identity_profiles").select("*").eq("id", currentUser.id).maybeSingle();
    if (seq !== loadSeq) return;
    if (profileError) { renderStartupError(profileError); return; }

    currentProfile = profile;
    if (!currentProfile?.username) { renderUsernameSetup(); return; }

    if (currentProfile.theme) applyTheme(currentProfile.theme);

    try {
      const [isAdmin, isModerator, restriction] = await Promise.all([
        callRPC("identity_is_admin"),
        callRPC("identity_is_moderator"),
        callRPC("identity_my_restriction")
      ]);
      currentRole = isAdmin ? "admin" : isModerator ? "moderator" : "user";
      currentRestriction = restriction || null;
    } catch (error) {
      renderStartupError(error);
      return;
    }
    if (seq !== loadSeq) return;

    loadedUserId = currentUser.id;
    setMode("app");
    updateHeader();
    buildNav();
    root.innerHTML = `<div class="shell"><div id="ipContent"></div></div>`;
    renderDock();
    await openTab(currentRestriction ? "account" : (currentTab === "edit" ? "home" : currentTab));
  }

  window.identityOnPolicyDeclined = () => {
    if (currentUser) signOut();
  };

  /* ------------------------------------------------------------
     INITIALIZATION
  ------------------------------------------------------------ */

  let initializationStarted = false;

  async function initializeApp() {
    if (initializationStarted) return;
    initializationStarted = true;

    supabaseClient.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        if (loadedUserId || currentUser) renderAuth();
      } else if (event === "SIGNED_IN" && session?.user && session.user.id !== loadedUserId) {
        // Do not await Supabase calls inside this callback (avoids a known deadlock).
        setTimeout(() => loadApplication(), 0);
      }
    });

    await loadApplication();
  }

  window.initializeIdentityApp = initializeApp;

  // Only start once the privacy policy has been accepted.
  if (policyAccepted()) initializeApp();
})();
