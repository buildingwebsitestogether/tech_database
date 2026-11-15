(function () {
  const DEFAULT_PLAYERS = [
    { id: 1, x: 300, y: 390 },
    { id: 2, x: 115, y: 325 },
    { id: 3, x: 485, y: 325 },
    { id: 4, x: 205, y: 215 },
    { id: 5, x: 395, y: 215 }
  ];

  let players = DEFAULT_PLAYERS.map(p => ({ ...p }));
  let arrows = [];
  let arrowStart = null;
  let drawingMode = false;
  let draggingPlayer = null;
  let nextArrowId = 1;

  function editorMarkup() {
    return `
      <section id="courtDesigner" class="court-designer" aria-labelledby="courtDesignerTitle">
        <div class="court-heading">
          <div>
            <p class="court-eyebrow">PLAY DESIGNER</p>
            <h3 id="courtDesignerTitle">Draw your play</h3>
            <p class="court-help">
              Drag players to move them. Turn on arrows, then click
              two court locations to draw a movement route. This works with touch on supported devices.
            </p>
          </div>
          <span class="court-tag">HALF COURT</span>
        </div>

        <div class="court-toolbar" aria-label="Court drawing tools">
          <button type="button" id="courtArrowToggle" aria-pressed="false">Draw arrows: Off</button>
          <button type="button" id="courtUndo" class="court-secondary" disabled>Undo arrow</button>
          <button type="button" id="courtClearArrows" class="court-secondary" disabled>Clear arrows</button>
          <button type="button" id="courtReset" class="court-secondary">Reset court</button>
        </div>

        <div class="court-frame">
          <svg id="basketballCourt" viewBox="0 0 600 500"
               role="img" aria-label="Interactive basketball half court. Drag numbered players to move them, or use the arrow tool to draw routes."
               xmlns="http://www.w3.org/2000/svg">
            <defs>
              <marker id="courtArrowHead" markerWidth="8" markerHeight="8"
                      refX="6" refY="3" orient="auto">
                <path d="M0,0 L0,6 L6,3 z" fill="#ffb17a"></path>
              </marker>
            </defs>

            <rect width="600" height="500" fill="#a96f43"></rect>
            <rect x="12" y="12" width="576" height="476"
                  fill="none" stroke="#fff0df" stroke-width="3"></rect>
            <rect x="220" y="250" width="160" height="238"
                  fill="none" stroke="#fff0df" stroke-width="3"></rect>
            <path d="M220 250 A80 80 0 0 0 380 250"
                  fill="none" stroke="#fff0df" stroke-width="3"></path>
            <path d="M220 250 A80 80 0 0 1 380 250"
                  fill="none" stroke="#fff0df" stroke-width="3"
                  stroke-dasharray="7 7"></path>
            <path d="M265 55 L335 55" stroke="#fff3df" stroke-width="5"></path>
            <circle cx="300" cy="72" r="14"
                    fill="none" stroke="#fff3df" stroke-width="3"></circle>
            <path d="M260 88 L340 88" stroke="#fff3df" stroke-width="2"></path>
            <path d="M270 88 A30 30 0 0 0 330 88"
                  fill="none" stroke="#fff3df" stroke-width="2"></path>
            <path d="M70 488 A230 230 0 0 1 530 488"
                  fill="none" stroke="#fff0df" stroke-width="3"></path>
            <path d="M12 160 L12 250 M588 160 L588 250"
                  stroke="#fff0df" stroke-width="3"></path>
            <g id="courtArrows"></g>
            <g id="courtPlayers"></g>
          </svg>
        </div>

        <p id="courtStatus" class="court-status" role="status" aria-live="polite" aria-atomic="true">
          Drag a player or turn on Draw arrows.
        </p>
        <p class="court-note">
          The court layout is included when you save this play. Use Reset court to restore the starting positions.
        </p>
      </section>
    `;
  }

  function addStyles() {
    if (document.getElementById("courtDesignerStyles")) return;
    const style = document.createElement("style");
    style.id = "courtDesignerStyles";
    style.textContent = `
      .court-designer {
        margin-top: 24px;
        padding: 20px;
        border: 1px solid #354357;
        border-radius: 14px;
        background: #182333;
        color: #f5f7fb;
      }
      .court-heading { display: flex; justify-content: space-between; align-items: start; gap: 12px; flex-wrap: wrap; }
      .court-heading h3 { margin: 4px 0 8px; font-size: 1.3rem; }
      .court-eyebrow { color: #ff9a52; font-size: .75rem; font-weight: 800; letter-spacing: 2px; margin: 0; }
      .court-help, .court-note { color: #c0cada; font-size: .9rem; line-height: 1.6; }
      .court-tag { color: #ffb17a; border: 1px solid #805538; border-radius: 20px; padding: 6px 10px; font-size: .72rem; white-space: nowrap; }
      .court-toolbar { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; }
      .court-designer .court-toolbar button { min-height: 44px; width: auto; margin: 0; padding: 9px 13px; font-size: .85rem; }
      .court-designer .court-toolbar .court-secondary { background: #273448; color: #fff; border: 1px solid #53647c; }
      .court-designer .court-toolbar button.active { background: #ff9a52; color: #20150e; border-color: #ff9a52; }
      .court-designer .court-toolbar button:disabled { opacity: .45; cursor: not-allowed; }
      .court-frame { width: 100%; overflow: hidden; border-radius: 11px; border: 1px solid #805538; background: #a96f43; }
      #basketballCourt { display: block; width: 100%; height: auto; touch-action: none; user-select: none; }
      .court-player { cursor: grab; }
      .court-player:active { cursor: grabbing; }
      .court-player circle { fill: #202938; stroke: #ffb17a; stroke-width: 4; }
      .court-player text { fill: #fff; font-size: 19px; font-weight: bold; text-anchor: middle; dominant-baseline: central; pointer-events: none; }
      .court-arrow { stroke: #ffb17a; stroke-width: 4; fill: none; marker-end: url(#courtArrowHead); stroke-linecap: round; }
      .court-arrow-start { fill: #ffb17a; stroke: #202938; stroke-width: 2; }
      .court-status { min-height: 1.5em; color: #ffb17a; font-size: .9rem; }
      .court-designer button:focus-visible { outline: 3px solid #ffd0ad; outline-offset: 3px; }
      @media (max-width: 520px) {
        .court-designer { padding: 13px; }
        .court-designer .court-toolbar button { flex: 1 1 42%; }
      }
    `;
    document.head.appendChild(style);
  }

  function status(text) {
    const element = document.getElementById("courtStatus");
    if (element) element.textContent = text;
  }

  function updateToolbarState() {
    const undo = document.getElementById("courtUndo");
    const clear = document.getElementById("courtClearArrows");
    const toggle = document.getElementById("courtArrowToggle");
    if (undo) undo.disabled = arrows.length === 0;
    if (clear) clear.disabled = arrows.length === 0;
    if (toggle) toggle.setAttribute("aria-pressed", String(drawingMode));
  }

  function render() {
    const playerLayer = document.getElementById("courtPlayers");
    const arrowLayer = document.getElementById("courtArrows");
    if (!playerLayer || !arrowLayer) return;

    arrowLayer.innerHTML = arrows.map(arrow => `
      <g>
        <line class="court-arrow"
          x1="${arrow.x1}" y1="${arrow.y1}"
          x2="${arrow.x2}" y2="${arrow.y2}"></line>
        <circle class="court-arrow-start"
          cx="${arrow.x1}" cy="${arrow.y1}" r="4"></circle>
      </g>
    `).join("");

    playerLayer.innerHTML = players.map(player => `
      <g class="court-player" data-player="${player.id}"
         transform="translate(${player.x} ${player.y})">
        <circle r="19"></circle>
        <text y="1">${player.id}</text>
      </g>
    `).join("");
    updateToolbarState();
  }

  function pointFromEvent(event) {
    const svg = document.getElementById("basketballCourt");
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = svg.getScreenCTM();
    if (!matrix) return { x: 300, y: 250 };
    const local = point.matrixTransform(matrix.inverse());
    return { x: Math.max(15, Math.min(585, local.x)), y: Math.max(15, Math.min(485, local.y)) };
  }

  function onPointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    const svg = document.getElementById("basketballCourt");
    const playerGroup = event.target.closest("[data-player]");

    if (drawingMode) {
      const point = pointFromEvent(event);
      if (!arrowStart) {
        arrowStart = point;
        status("Start selected. Click the destination for the arrow.");
      } else {
        const distance = Math.hypot(point.x - arrowStart.x, point.y - arrowStart.y);
        if (distance < 10) {
          status("Choose a destination farther from the start.");
          return;
        }
        arrows.push({
          id: nextArrowId++,
          x1: Math.round(arrowStart.x),
          y1: Math.round(arrowStart.y),
          x2: Math.round(point.x),
          y2: Math.round(point.y)
        });
        arrowStart = null;
        status("Arrow added.");
        render();
      }
      return;
    }

    if (playerGroup) {
      draggingPlayer = Number(playerGroup.dataset.player);
      svg.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    }
  }

  function onPointerMove(event) {
    if (draggingPlayer === null) return;
    const point = pointFromEvent(event);
    const player = players.find(p => p.id === draggingPlayer);
    if (!player) return;
    player.x = Math.round(point.x);
    player.y = Math.round(point.y);
    render();
  }

  function onPointerUp() {
    if (draggingPlayer !== null) status("Player position updated.");
    draggingPlayer = null;
  }

  function setDrawingMode(enabled) {
    drawingMode = enabled;
    arrowStart = null;
    const button = document.getElementById("courtArrowToggle");
    if (button) {
      button.textContent = `Draw arrows: ${enabled ? "On" : "Off"}`;
      button.classList.toggle("active", enabled);
    }
    updateToolbarState();
    status(enabled
      ? "Click the start point, then click the destination."
      : "Drag a player or turn on Draw arrows.");
  }

  function resetCourt() {
    players = DEFAULT_PLAYERS.map(p => ({ ...p }));
    arrows = [];
    arrowStart = null;
    nextArrowId = 1;
    setDrawingMode(false);
    render();
    status("Court reset to the starting positions.");
  }

  function getDiagram() {
    return {
      version: 1,
      court: "half",
      players: players.map(p => ({ ...p })),
      arrows: arrows.map(a => ({ ...a }))
    };
  }

  function loadDiagram(diagram) {
    if (!diagram || diagram.version !== 1) {
      resetCourt();
      return;
    }

    if (Array.isArray(diagram.players)) {
      players = DEFAULT_PLAYERS.map(defaultPlayer => {
        const saved = diagram.players.find(p => p.id === defaultPlayer.id);
        if (!saved) return { ...defaultPlayer };
        return {
          id: defaultPlayer.id,
          x: Number.isFinite(saved.x) ? Math.max(15, Math.min(585, saved.x)) : defaultPlayer.x,
          y: Number.isFinite(saved.y) ? Math.max(15, Math.min(485, saved.y)) : defaultPlayer.y
        };
      });
    }

    arrows = Array.isArray(diagram.arrows)
      ? diagram.arrows
          .filter(a => [a.x1, a.y1, a.x2, a.y2].every(Number.isFinite))
          .map(a => ({
            id: nextArrowId++,
            x1: Math.max(0, Math.min(600, a.x1)),
            y1: Math.max(0, Math.min(500, a.y1)),
            x2: Math.max(0, Math.min(600, a.x2)),
            y2: Math.max(0, Math.min(500, a.y2))
          }))
      : [];

    arrowStart = null;
    setDrawingMode(false);
    render();
    status("Saved court layout loaded.");
  }

  window.initCourtDesigner = function () {
    const editor = document.getElementById("playEditor");
    const form = document.getElementById("playForm");
    if (!editor || !form) return;
    addStyles();

    if (!document.getElementById("courtDesigner")) {
      form.insertAdjacentHTML("afterend", editorMarkup());
    }

    const svg = document.getElementById("basketballCourt");
    if (svg.dataset.ready === "true") {
      render();
      return;
    }
    svg.dataset.ready = "true";
    svg.addEventListener("pointerdown", onPointerDown);
    svg.addEventListener("pointermove", onPointerMove);
    svg.addEventListener("pointerup", onPointerUp);
    svg.addEventListener("pointercancel", onPointerUp);

    document.getElementById("courtArrowToggle")
      .addEventListener("click", () => setDrawingMode(!drawingMode));

    document.getElementById("courtUndo").addEventListener("click", () => {
      if (!arrows.length) {
        status("There are no arrows to undo.");
        return;
      }
      arrows.pop();
      arrowStart = null;
      render();
      status("Last arrow removed.");
    });

    document.getElementById("courtClearArrows").addEventListener("click", () => {
      if (!arrows.length) return;
      arrows = [];
      arrowStart = null;
      render();
      status("All arrows cleared.");
    });

    document.getElementById("courtReset").addEventListener("click", resetCourt);
    render();
  };

  window.getCourtDiagram = getDiagram;
  window.loadCourtDiagram = loadDiagram;
})();
