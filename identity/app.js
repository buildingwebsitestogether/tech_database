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

  style.textContent += `
    :root{--ip-bg:#080d16;--ip-panel:#101827;--ip-panel2:#172235;--ip-orange:#12c995;--ip-text:#f4f7fb;--ip-muted:#91a0b5;--ip-border:#202d40}
    body{background:#080d16!important;color:#f4f7fb!important}
    #identityAppRoot{--ip-bg:#080d16;--ip-panel:#101827;--ip-panel2:#172235;--ip-orange:#12c995;--ip-text:#f4f7fb;--ip-muted:#91a0b5;--ip-border:#202d40;font-family:Inter,Arial,sans-serif;min-height:100vh}
    #identityAppRoot .ip-shell{max-width:1450px;margin:0 auto;padding:0 22px 100px}
    #identityAppRoot .ip-topbar{height:62px;margin:0 -22px 20px;padding:0 max(22px,calc((100% - 1406px)/2));display:flex;align-items:center;justify-content:space-between;gap:18px;background:#101827;border-bottom:1px solid #202d40;position:sticky;top:0;z-index:20}
    #identityAppRoot .ip-logo{font-size:19px;font-weight:850;letter-spacing:.2px;white-space:nowrap;color:#43dfbd}.ip-logo span{color:#12c995}
    #identityAppRoot .ip-topnav{display:flex;align-items:center;gap:5px;padding:4px;border:1px solid #202d40;border-radius:11px;background:#080f1b;overflow-x:auto}
    #identityAppRoot .ip-topnav button{white-space:nowrap;background:transparent;color:#91a0b5;border:0;margin:0;padding:9px 13px;font-size:12px;border-radius:7px;font-weight:700}
    #identityAppRoot .ip-topnav button.active{background:#073c32;color:#27d7aa;box-shadow:inset 0 0 0 1px #0a745b}
    #identityAppRoot .ip-top-actions{display:flex;align-items:center;gap:8px;white-space:nowrap}
    #identityAppRoot .ip-top-actions button{margin:0;padding:9px 14px;font-size:12px}
    #identityAppRoot .ip-announcement{max-width:1100px;margin:0 auto 13px;padding:10px 14px;background:#111629;border:1px solid #292b54;border-radius:11px;color:#dce6f5;font-size:12px;display:flex;align-items:center;gap:10px}
    #identityAppRoot .ip-announcement .ip-ann-icon{color:#8d83ff;font-size:15px}
    #identityAppRoot .ip-toolbar{max-width:1100px;margin:0 auto 20px;padding:16px;background:#0e1523;border:1px solid #202d40;border-radius:14px}
    #identityAppRoot .ip-toolbar-row{display:flex;align-items:center;gap:12px;justify-content:space-between;flex-wrap:wrap}
    #identityAppRoot .ip-search{max-width:440px;flex:1;position:relative}
    #identityAppRoot .ip-search input{margin:0;background:#080f1b;border-radius:9px;font-size:12px;padding:11px 13px}
    #identityAppRoot .ip-sort{display:flex;align-items:center;gap:9px;color:#91a0b5;font-size:11px}
    #identityAppRoot .ip-sort select{width:auto;min-width:125px;margin:0;padding:9px 12px;font-size:11px}
    #identityAppRoot .ip-categories{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:14px}
    #identityAppRoot .ip-categories .ip-cat-label{font-size:10px;color:#91a0b5;font-weight:800;margin-right:7px}
    #identityAppRoot .ip-categories button{margin:0;padding:6px 12px;border-radius:20px;background:#1b283b;color:#aebbd0;font-size:10px;border:1px solid #29384d}
    #identityAppRoot .ip-categories button.active{background:#063d32;color:#20d5a5;border-color:#087b60}
    #identityAppRoot .ip-play-grid{max-width:1100px;margin:0 auto;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px}
    #identityAppRoot .ip-play-card{min-width:0;background:#101827;border:1px solid #202d40;border-radius:14px;padding:14px;transition:transform .16s,border-color .16s}
    #identityAppRoot .ip-play-card:hover{transform:translateY(-2px);border-color:#31506a}
    #identityAppRoot .ip-play-meta{display:flex;justify-content:space-between;gap:8px;align-items:center;color:#91a0b5;font-size:9px;font-weight:700}
    #identityAppRoot .ip-dot{width:9px;height:9px;border-radius:50%;display:inline-block;background:#12c995;margin-right:6px}
    #identityAppRoot .ip-public{color:#22d6a8;background:#073a32;border:1px solid #0c5749;border-radius:20px;padding:3px 8px;font-size:9px}
    #identityAppRoot .ip-play-card h3{font-size:14px;margin:13px 0 3px;color:#f5f7fb;overflow-wrap:anywhere}
    #identityAppRoot .ip-play-card p{font-size:11px;color:#91a0b5;margin:0;min-height:20px;overflow-wrap:anywhere}
    #identityAppRoot .ip-play-footer{border-top:1px solid #202d40;margin-top:12px;padding-top:10px;display:flex;align-items:center;gap:5px}
    #identityAppRoot .ip-play-owner{color:#20d5a5;font-size:10px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-right:auto}
    #identityAppRoot .ip-icon-btn{background:#1c2a3e!important;color:#aab8cb!important;padding:7px 9px!important;margin:0!important;border-radius:7px!important;font-size:11px!important}
    #identityAppRoot .ip-play-footer .ip-edit-btn{background:#12c995!important;color:#03150e!important;padding:7px 12px!important;margin:0!important;border-radius:8px!important}
    #identityAppRoot .ip-card{background:#101827;border:1px solid #202d40;border-radius:14px;box-shadow:none}
    #identityAppRoot .ip-section-title{color:#42dfbd}
    #identityAppRoot .ip-nav{gap:6px}
    #identityAppRoot .ip-nav button{background:#172235;color:#aebbd0;border:1px solid #26364b}
    #identityAppRoot .ip-nav button.active{background:#063d32;color:#20d5a5;border-color:#087b60}
    #identityAppRoot .ip-play{background:#172235;border:1px solid #26364b}
    #identityAppRoot button{background:#12c995;color:#03150e;border-radius:8px}
    #identityAppRoot button.secondary{background:#1b293d;color:#e4edf8;border:1px solid #29384d}
    #identityAppRoot button.danger{background:#b94455;color:white}
    #identityAppRoot input,#identityAppRoot textarea,#identityAppRoot select{background:#080f1b;border-color:#26364b}
    #identityAppRoot .ip-bottom-bar{position:fixed;z-index:18;bottom:0;left:0;right:0;min-height:76px;background:#050a17;border-top:1px solid #202d40;display:grid;grid-template-columns:minmax(180px,1fr) minmax(280px,1.2fr) minmax(150px,1fr);align-items:center;gap:24px;padding:10px max(22px,calc((100% - 1100px)/2));}
    #identityAppRoot .ip-bottom-title{display:flex;align-items:center;gap:11px;font-size:12px;font-weight:800}.ip-bottom-icon{width:38px;height:38px;border-radius:10px;background:#073a32;color:#20d5a5;display:grid;place-items:center;font-size:19px}
    #identityAppRoot .ip-bottom-sub{font-size:10px;color:#91a0b5;font-weight:500}
    #identityAppRoot .ip-court-mini{height:40px;border:1px solid #26364b;border-radius:9px;background:linear-gradient(90deg,#101827,#0a1421);display:flex;align-items:center;justify-content:center;color:#20d5a5;font-size:10px;position:relative;overflow:hidden}
    #identityAppRoot .ip-court-mini:before{content:'';position:absolute;inset:8px 14px;border:1px solid #214b4b;border-radius:50%}
    #identityAppRoot .ip-bottom-note{text-align:right;color:#91a0b5;font-size:10px}
    #identityAppRoot .ip-empty{grid-column:1/-1;text-align:center;padding:45px 18px;background:#101827;border:1px dashed #2a3a50;border-radius:14px;color:#91a0b5}
    #identityAppRoot .ip-auth-placeholder{display:none}
    @media(max-width:950px){#identityAppRoot .ip-play-grid{grid-template-columns:repeat(2,minmax(0,1fr))}#identityAppRoot .ip-topbar{height:auto;min-height:62px;flex-wrap:wrap;padding:10px 16px}#identityAppRoot .ip-topnav{order:3;width:100%}}
    @media(max-width:600px){#identityAppRoot .ip-shell{padding:0 12px 110px}#identityAppRoot .ip-topbar{margin:0 -12px 15px;padding:10px 12px}#identityAppRoot .ip-play-grid{grid-template-columns:1fr}#identityAppRoot .ip-bottom-bar{grid-template-columns:1fr 1fr;gap:10px;padding:9px 12px}#identityAppRoot .ip-bottom-note{display:none}#identityAppRoot .ip-toolbar{padding:12px}#identityAppRoot .ip-search{max-width:none;flex-basis:100%}}
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

    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
    document.body.classList.remove("ip-app");
    root.innerHTML = "";
    const form = document.getElementById("authForm");
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const submitButton = document.getElementById("submitButton");
    const githubButton = document.getElementById("githubButton");
    const switchButton = document.getElementById("switchButton");
    const switchText = document.getElementById("switchText");
    const title = document.getElementById("formTitle");
    const subtitle = document.getElementById("formSubtitle");
    const rules = document.getElementById("passwordRules");
    if (!form || !emailInput || !passwordInput || !submitButton || !githubButton || !switchButton) return;

    let mode = "login";
    const setMode = next => {
      mode = next;
      const signup = mode === "signup";
      title.textContent = signup ? "Create your account" : "Welcome back";
      subtitle.textContent = signup ? "Create an account to start building your basketball playbook." : "Sign in to get back to your playbook.";
      submitButton.textContent = signup ? "Create account" : "Sign in";
      switchText.textContent = signup ? "Already have an account?" : "New to Identity?";
      switchButton.textContent = signup ? "Sign in" : "Create account";
      passwordInput.autocomplete = signup ? "new-password" : "current-password";
      if (rules) rules.hidden = !signup;
      clearMessage();
    };

    form.onsubmit = async event => {
      event.preventDefault(); clearMessage();
      const email = emailInput.value.trim(); const password = passwordInput.value;
      if (!email || !password) { showMessage("Enter your email and password.", "error"); return; }
      if (mode === "signup" && !(password.length >= 8 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /[0-9]/.test(password))) {
        showMessage("Use at least 8 characters, including uppercase, lowercase, and a number.", "error"); return;
      }
      submitButton.disabled = true; githubButton.disabled = true;
      try {
        if (mode === "signup") {
          const {data,error}=await supabaseClient.auth.signUp({email,password});
          if(error) throw error;
          if(data?.session) await loadApplication();
          else { showMessage("Account created. Check your email if confirmation is enabled, then sign in.","success"); setMode("login"); }
        } else {
          const {error}=await supabaseClient.auth.signInWithPassword({email,password});
          if(error) throw error;
        }
      } catch(error) { showMessage(friendlyError(error),"error"); }
      finally { submitButton.disabled=false; githubButton.disabled=false; }
    };

    switchButton.onclick=()=>setMode(mode === "login" ? "signup" : "login");
    githubButton.onclick=async()=>{
      clearMessage(); githubButton.disabled=true;
      try { const {error}=await supabaseClient.auth.signInWithOAuth({provider:"github",options:{redirectTo:window.location.origin+window.location.pathname}}); if(error) throw error; }
      catch(error){showMessage(friendlyError(error),"error");githubButton.disabled=false;}
    };
    setMode("login");
  }

  function renderUsernameSetup() {
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
      }       if (existing?.length) {
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
    document.body.classList.add("ip-app");
    const username = currentProfile?.username || "Player";
    const tabs = [
      ["plays","⌂ Homeboard"],["plays","▤ My Plays"],["create","✎ Create"],
      ["files","⇧ Files"],["account","☻ Profile"],["account","⚙ Settings"]
    ];
    root.innerHTML = `
      <div class="ip-shell">
        <header class="ip-topbar">
          <div class="ip-logo">◉ IDENTITY<span>.</span></div>
          <nav class="ip-topnav" id="ipNavigation">
            ${tabs.map((item,i)=>`<button type="button" data-tab="${item[0]}" data-nav-index="${i}" class="${i===0?"active":""}">${item[1]}</button>`).join("")}
            ${currentRole === "admin" ? `<button type="button" data-tab="moderation" data-admin-nav="true">♜ Admin Panel</button>` : ""}
          </nav>
          <div class="ip-top-actions"><span class="ip-muted">@${escapeHTML(username)}</span><button id="ipSignout" class="secondary">Sign out</button></div>
        </header>
        <div class="ip-announcement"><span class="ip-ann-icon">⚑</span><span>Welcome to your court. Build, organize, and refine your game.</span></div>
        <div id="ipMessage" class="ip-message ip-hidden"></div>
        <div id="ipContent"></div>
      </div>
      <div class="ip-bottom-bar"><div class="ip-bottom-title"><div class="ip-bottom-icon">🏀</div><div>PLAYBOOK PREVIEW<div class="ip-bottom-sub">Select a play to review your setup</div></div></div><div class="ip-court-mini">COURT VIEW · TACTICAL BOARD</div><div class="ip-bottom-note">YOUR GAME · YOUR IDENTITY</div></div>
    `;
    document.getElementById("ipSignout").onclick=signOut;
    root.querySelectorAll("[data-tab]").forEach(button=>button.onclick=()=>{
      root.querySelectorAll("[data-tab]").forEach(b=>b.classList.toggle("active",b===button));
      openTab(button.dataset.tab);
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
    const {data,error}=await supabaseClient.from("identity_plays").select("*").eq("user_id",currentUser.id).order("updated_at",{ascending:false});
    if(error) throw error;
    cachedPlays=data||[];
    content.innerHTML=`
      <section class="ip-toolbar">
        <div class="ip-toolbar-row"><div class="ip-search"><input id="ipPlaySearch" type="search" placeholder="⌕  Search your plays by title or description..."></div><label class="ip-sort">Sort: <select id="ipPlaySort"><option value="new">Newest First</option><option value="old">Oldest First</option><option value="az">A–Z</option></select></label></div>
        <div class="ip-categories"><span class="ip-cat-label">CATEGORIES:</span><button class="active" data-category="All">All Plays</button><button data-category="Offense">Offense</button><button data-category="Defense">Defense</button><button data-category="Inbound">Inbound</button><button data-category="Transition">Transition</button><button data-category="Other">Other</button><button id="ipNewPlay">＋ Create Play</button></div>
      </section>
      <div id="ipPlayList" class="ip-play-grid"></div>`;
    document.getElementById("ipNewPlay").onclick=()=>openTab("create");
    let category="All";
    const draw=()=>{
      const term=getValue("ipPlaySearch").toLowerCase();
      let items=[...cachedPlays].filter(p=>(category==="All"||(p.play_type||"Other").toLowerCase()===category.toLowerCase())&&(`${p.title||""} ${p.description||""} ${p.play_type||""}`).toLowerCase().includes(term));
      const sort=getValue("ipPlaySort");
      if(sort==="az") items.sort((a,b)=>(a.title||"").localeCompare(b.title||""));
      else items.sort((a,b)=>(new Date(a.updated_at||0)-new Date(b.updated_at||0))*(sort==="old"?1:-1));
      const list=document.getElementById("ipPlayList");
      if(!items.length){list.innerHTML=`<div class="ip-empty">${cachedPlays.length?"No plays match your search or category.":"No plays yet. Create your first basketball play to get started."}</div>`;return;}
      list.innerHTML=items.map(play=>`<article class="ip-play-card"><div class="ip-play-meta"><span><i class="ip-dot"></i>${escapeHTML(play.play_type||"Other")}</span><span class="ip-public">● PRIVATE</span></div><h3>${escapeHTML(play.title||"Untitled Play")}</h3><p>${escapeHTML(play.description||"No description added.")}</p><div class="ip-play-footer"><span class="ip-play-owner">◉ @${escapeHTML(currentProfile?.username||"player")}</span><button class="ip-icon-btn" data-edit="${escapeHTML(play.id)}" title="Edit play">✎</button><button class="ip-icon-btn" data-delete="${escapeHTML(play.id)}" title="Delete play">⌫</button><button class="ip-edit-btn" data-edit="${escapeHTML(play.id)}" title="Open play">▶</button></div></article>`).join("");
      list.querySelectorAll("[data-edit]").forEach(button=>button.onclick=()=>{const play=cachedPlays.find(p=>p.id===button.dataset.edit);if(play)renderPlayEditor(content,play);});
      list.querySelectorAll("[data-delete]").forEach(button=>button.onclick=async()=>{if(!confirm("Delete this play? This cannot be undone."))return;const{error:delError}=await supabaseClient.from("identity_plays").delete().eq("id",button.dataset.delete).eq("user_id",currentUser.id);if(delError){showMessage(friendlyError(delError),"error");return;}showMessage("Play deleted.","success");await renderPlays(content);});
    };
    document.getElementById("ipPlaySearch").addEventListener("input",draw);
    document.getElementById("ipPlaySort").addEventListener("change",draw);
    content.querySelectorAll("[data-category]").forEach(button=>button.onclick=()=>{category=button.dataset.category;content.querySelectorAll("[data-category]").forEach(b=>b.classList.toggle("active",b===button));draw();});
    draw();
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
        <p class="ip-muted">If your account has a restriction, you can submit an appeal.</p>
        <textarea id="ipAppealReason" placeholder="Explain why you are appealing..."></textarea>
        <button id="ipSubmitAppeal">Submit Appeal</button>
        <div id="ipAppealList"></div>
        <hr class="ip-divider">
        <h3>Account Deletion Request</h3>
        <p class="ip-muted">This submits a request for review. It does not immediately delete your account or sign you out.</p>
        <textarea id="ipDeletionReason" placeholder="Optional reason for your request..."></textarea>
        <button id="ipRequestDeletion" class="danger">Request Account Deletion</button>
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

      const { error: updateError } = await supabaseClient.auth.updateUser({ password });

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
        await callRPC("identity_submit_appeal", { p_reason: reason });
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
            ${item.review_notes ? `<p>${escapeHTML(item.review_notes)}</p>` : ""}
          </div>
        `).join("")
      : `<p class="ip-muted">No appeals submitted.</p>`;

    const deletionList = document.getElementById("ipDeletionList");
    deletionList.innerHTML = deletionRequests?.length
      ? deletionRequests.map(item => `
          <div class="ip-play">
            <strong>Request: ${escapeHTML(item.status)}</strong>
            <div class="ip-small">${escapeHTML(formatDate(item.requested_at))}</div>
            ${item.review_notes ? `<p>${escapeHTML(item.review_notes)}</p>` : ""}
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

  async function renderModeration(content) {
    const isAdmin = currentRole === "admin";

    content.innerHTML = `
      <div class="ip-card">
        <h2 class="ip-section-title">${isAdmin ? "Administrator Dashboard" : "Moderator Dashboard"}</h2>
        <p class="ip-muted">Staff actions are checked by Supabase permissions and database functions.</p>
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

    root.querySelector("[data-staff-tab]")?.click();
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
      panel.innerHTML = `<div class="ip-message error">${escapeHTML(friendlyError(error))}</div>`;
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
            <textarea id="ipReportNotes_${escapeHTML(report.id)}" placeholder="Review notes (optional)"></textarea>
            <button data-report-action="reviewed" data-id="${escapeHTML(report.id)}">Mark Reviewed</button>
            <button class="secondary" data-report-action="dismissed" data-id="${escapeHTML(report.id)}">Dismiss</button>
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
          <button data-restore-play="${escapeHTML(item.play_id)}">Restore Play</button>
          ${currentRole === "admin" ? `
            <button class="danger" data-delete-play="${escapeHTML(item.play_id)}">Permanently Delete</button>
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
      <p class="ip-muted">Enter the user's Supabase Auth UUID. Do not use their email address here.</p>
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
          <strong>${escapeHTML(item.status || "pending")}</strong>
          <p><strong>User UUID:</strong> ${escapeHTML(item.user_id || "Unavailable")}</p>
          <p><strong>Reason:</strong> ${escapeHTML(item.reason || "No reason provided.")}</p>
          <div class="ip-small">${escapeHTML(formatDate(item.created_at))}</div>
          ${item.status === "pending" ? `
            <textarea data-ban-notes="${escapeHTML(item.id)}"
              placeholder="Administrator review notes"></textarea>
            <button data-ban-review="approved" data-id="${escapeHTML(item.id)}">
              Approve
            </button>
            <button class="secondary" data-ban-review="rejected" data-id="${escapeHTML(item.id)}">
              Reject
            </button>
          ` : ""}
          ${item.review_notes ? `<p>${escapeHTML(item.review_notes)}</p>` : ""}
        </div>
      `).join("") : `<p class="ip-muted">No ban requests found.</p>`}
    `;

    panel.querySelectorAll("[data-ban-review]").forEach(button => {
      button.onclick = async () => {
        const action = button.dataset.banReview;
        const id = button.dataset.id;

        if (!confirm(`${action === "approved" ? "Approve" : "Reject"} this ban request?`)) return;

        try {
          await callFunction("identity-admin", "review_ban_request", {
            p_request_id: id,
            p_status: action,
            p_notes: panel.querySelector(`[data-ban-notes="${id}"]`)?.value || null
          });

          showMessage("Ban request updated.", "success");
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
      <h3>Account Appeals</h3>
      ${data?.length ? data.map(item => `
        <div class="ip-play">
          <strong>${escapeHTML(item.status || "pending")}</strong>
          <p><strong>User UUID:</strong> ${escapeHTML(item.user_id || "Unavailable")}</p>
          <p>${escapeHTML(item.reason || "No reason provided.")}</p>
          <div class="ip-small">${escapeHTML(formatDate(item.created_at))}</div>
          ${item.status === "pending" ? `
            <textarea data-appeal-notes="${escapeHTML(item.id)}"
              placeholder="Administrator review notes"></textarea>
            <button data-appeal-review="approved" data-id="${escapeHTML(item.id)}">
              Approve Appeal
            </button>
            <button class="secondary" data-appeal-review="rejected" data-id="${escapeHTML(item.id)}">
              Reject Appeal
            </button>
          ` : ""}
          ${item.review_notes ? `<p>${escapeHTML(item.review_notes)}</p>` : ""}
        </div>
      `).join("") : `<p class="ip-muted">No appeals found.</p>`}
    `;

    panel.querySelectorAll("[data-appeal-review]").forEach(button => {
      button.onclick = async () => {
        const id = button.dataset.id;

        try {
          await callFunction("identity-admin", "review_appeal", {
            p_appeal_id: id,
            p_status: button.dataset.appealReview,
            p_notes: panel.querySelector(`[data-appeal-notes="${id}"]`)?.value || null
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
      <h3>Moderator Management</h3>
      <p class="ip-muted">Only administrators can add or remove moderators.</p>

      <label>New Moderator User UUID</label>
      <input id="ipNewModerator" placeholder="Supabase Auth UUID">
      <button id="ipAddModerator">Add Moderator</button>

      <hr class="ip-divider">
      <h4>Current Moderators</h4>

      ${data?.length ? data.map(item => `
        <div class="ip-play">
          <strong>${escapeHTML(item.user_id || "Unknown user")}</strong>
          <div class="ip-small">${escapeHTML(formatDate(item.created_at))}</div>
          <button class="danger" data-remove-moderator="${escapeHTML(item.user_id)}">
            Remove Moderator
          </button>
        </div>
      `).join("") : `<p class="ip-muted">No moderators found.</p>`}
    `;

    document.getElementById("ipAddModerator").onclick = async () => {
      const userId = getValue("ipNewModerator").trim();

      if (!userId) {
        showMessage("Enter a user UUID.", "error");
        return;
      }

      try {
        await callFunction("identity-admin", "add_moderator", {
          p_user_id: userId
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
      ${data?.length ? data.map(item => `
        <div class="ip-play">
          <strong>${escapeHTML(item.status || "pending")}</strong>
          <p><strong>User UUID:</strong> ${escapeHTML(item.user_id || "Unavailable")}</p>
          <p>${escapeHTML(item.reason || "No reason provided.")}</p>
          <div class="ip-small">${escapeHTML(formatDate(item.requested_at))}</div>
          ${item.status === "pending" ? `
            <p class="ip-muted">
              Review this request through your established account-deletion process.
            </p>
          ` : ""}
          ${item.review_notes ? `<p>${escapeHTML(item.review_notes)}</p>` : ""}
        </div>
      `).join("") : `<p class="ip-muted">No deletion requests found.</p>`}
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
      <p class="ip-muted">Most recent 100 recorded moderation actions.</p>
      ${data?.length ? data.map(item => `
        <div class="ip-play">
          <strong>${escapeHTML(item.action || item.action_type || "Staff action")}</strong>
          <p>Actor: ${escapeHTML(item.actor_user_id || "Unavailable")}</p>
          <p>Target: ${escapeHTML(item.target_user_id || "Unavailable")}</p>
          <p>${escapeHTML(item.details || item.reason || "")}</p>
          <div class="ip-small">${escapeHTML(formatDate(item.created_at))}</div>
        </div>
      `).join("") : `<p class="ip-muted">No moderation logs found.</p>`}
    `;
  }

  async function uploadFile() {
    const input = document.getElementById("ipFileInput");
    const file = input?.files?.[0];

    if (!file) {
      showMessage("Choose a file first.", "error");
      return;
    }

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "application/pdf"
    ];

    if (!allowedTypes.includes(file.type)) {
      showMessage("This file type is not allowed.", "error");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      showMessage("The maximum file size is 10 MB.", "error");
      return;
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${currentUser.id}/${Date.now()}-${safeName}`;

    const uploadButton = document.getElementById("ipUploadFile");
    uploadButton.disabled = true;
    uploadButton.textContent = "Uploading...";

    try {
      const { error } = await supabaseClient.storage
        .from(BUCKET)
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type
        });

      if (error) throw error;

      showMessage("File uploaded successfully.", "success");

      const content = document.getElementById("ipContent");
      if (content) await renderFiles(content);
    } catch (error) {
      showMessage(friendlyError(error), "error");
    } finally {
      const button = document.getElementById("ipUploadFile");
      if (button) {
        button.disabled = false;
        button.textContent = "Upload File";
      }
    }
  }
