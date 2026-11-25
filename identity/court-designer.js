/* ============================================================
   IDENTITY. PLAYBOOK — COURT DESIGNER (Build 5)
   Everything from Build 4 still works: drag players, draw arrows,
   undo / clear / reset, keyboard moves, previews on cards.
   ADDED in Build 5:
   - Regulation court markings (NBA / college / high school rules)
   - Half court / full court toggle (with out-of-bounds room)
   - Court designs (classic original, generic, NBA team colours)
   - Play steps, ball, optional defense and a real-time animation
   Public API (unchanged): initCourtDesigner, getCourtDiagram,
   loadCourtDiagram, renderCourtPreview.
   New: mountCourtPlayer (animated viewer), CourtDesigner (for tests).
   Saved plays: version 1 diagrams still load; version 2 is written.
   Units: 10 units = 1 foot.
   ============================================================ */
(function () {
  "use strict";

  /* ---------- small helpers ---------- */
  const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v)));
  const isNum = v => typeof v === "number" && Number.isFinite(v);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const rnd = v => Math.round(v * 10) / 10;

  /* ---------- rules (all measurements in units, 10 = 1 ft) ---------- */
  const COURT_W = 500, HOOP_Y = 52.5, BB_Y = 40, BB_W = 60, RIM_R = 7.5, CIRCLE_R = 60;
  const RULES = {
    nba:  { label: "NBA (94 × 50 ft)",          len: 940, lane: 160, ft: 190, r3: 237.5, c3: 220,   restricted: 40, marks: [70, 110, 140, 170] },
    ncaa: { label: "College (94 × 50 ft)",      len: 940, lane: 120, ft: 190, r3: 221.5, c3: 216.7, restricted: 40, marks: [70, 100, 130, 160] },
    hs:   { label: "High school (84 × 50 ft)",  len: 840, lane: 120, ft: 190, r3: 197.5, c3: 197.5, restricted: 0,  marks: [70, 100, 130, 160] }
  };

  /* ---------- court designs: colours + a text wordmark only (no official logos) ---------- */
  const SKINS = {
    classic: { label: "Classic (original look)", group: "Standard", floor: "#a96f43", surround: "#8f5c36", line: "#fff0df", paint: null, accent: "#ffb17a", word: "" },
    maple:   { label: "Generic maple",           group: "Standard", floor: "#d9a869", surround: "#b8864d", line: "#ffffff", paint: "#c26d3f", accent: "#ffffff", word: "" }
  };
  [
    ["lakers", "Los Angeles Lakers", "LAKERS", "#552583", "#FDB927"],
    ["celtics", "Boston Celtics", "CELTICS", "#007A33", "#FFFFFF", 1],
    ["warriors", "Golden State Warriors", "WARRIORS", "#1D428A", "#FFC72C"],
    ["thunder", "Oklahoma City Thunder", "THUNDER", "#007AC1", "#EF3B24"],
    ["knicks", "New York Knicks", "KNICKS", "#006BB6", "#F58426"],
    ["bulls", "Chicago Bulls", "BULLS", "#CE1141", "#111111"],
    ["heat", "Miami Heat", "HEAT", "#98002E", "#F9A01B"],
    ["spurs", "San Antonio Spurs", "SPURS", "#2B2B2B", "#C4CED4"],
    ["nets", "Brooklyn Nets", "NETS", "#111111", "#FFFFFF"],
    ["mavericks", "Dallas Mavericks", "MAVERICKS", "#00538C", "#B8C4CA"],
    ["nuggets", "Denver Nuggets", "NUGGETS", "#0E2240", "#FEC524"],
    ["suns", "Phoenix Suns", "SUNS", "#1D1160", "#E56020"],
    ["bucks", "Milwaukee Bucks", "BUCKS", "#00471B", "#EEE1C6"],
    ["raptors", "Toronto Raptors", "RAPTORS", "#CE1141", "#A1A1A4"],
    ["sixers", "Philadelphia 76ers", "76ERS", "#006BB6", "#ED174C"],
    ["clippers", "LA Clippers", "CLIPPERS", "#1D428A", "#C8102E"],
    ["rockets", "Houston Rockets", "ROCKETS", "#CE1141", "#C4CED4"],
    ["cavaliers", "Cleveland Cavaliers", "CAVALIERS", "#860038", "#FDBB30"]
  ].forEach(([k, label, word, primary, accent, parquet]) => {
    SKINS[k] = { label, group: "NBA team designs", floor: parquet ? "#d8b27c" : "#dcae70", surround: primary, line: "#ffffff", paint: primary, accent, word, parquet: !!parquet };
  });

  /* ---------- route types ---------- */
  const KINDS = {
    cut:     { label: "Cut / move", color: "#ffffff", dash: "" },
    dribble: { label: "Dribble",    color: "#ffd166", dash: "9 7" },
    pass:    { label: "Pass",       color: "#7fd6ff", dash: "2 9" },
    screen:  { label: "Screen",     color: "#c9b8ff", dash: "" },
    shot:    { label: "Shot",       color: "#ff8a80", dash: "14 7" }
  };
  const SPEED = { cut: 150, dribble: 115, screen: 100 };   // units per second (15 / 11.5 / 10 ft/s)
  const DEF_SPEED = 140, BALL_SPEED = 350, DT = 1 / 30, MAX_ARROWS = 40, MAX_STEPS = 12;

  /* ---------- geometry of what is on screen ---------- */
  function viewGeom(st) {
    const rule = RULES[st.rules], full = st.court === "full", D = full ? rule.len : rule.len / 2;
    return full
      ? { full, rule, D, len: rule.len, W: D + 90, H: 550, world: "translate(45 525) rotate(-90)", rot: 90, minX: -25, maxX: 525, minY: -45, maxY: D + 45, S: 1.5 }
      : { full, rule, D, len: rule.len, W: 550, H: D + 40, world: "translate(25 25)", rot: 0, minX: -25, maxX: 525, minY: -25, maxY: D + 15, S: 1 };
  }
  function clampPt(g, x, y) {
    return [clampN(x, g.minX + 10, g.maxX - 10), clampN(y, g.minY + 10, g.maxY - 10)];
  }

  /* ---------- court drawing (markings in world coordinates; basket at the top) ---------- */
  function endMarkup(R, sk, lw) {
    const cx = COURT_W / 2, L = R.lane / 2, dy = Math.sqrt(Math.max(0, R.r3 * R.r3 - R.c3 * R.c3)), y3 = HOOP_Y + dy;
    const ln = `fill="none" stroke="${sk.line}" stroke-width="${lw}"`;
    let h = "";
    if (sk.paint) h += `<rect x="${cx - L}" y="0" width="${R.lane}" height="${R.ft}" fill="${sk.paint}"></rect>`;
    h += `<path d="M${cx - R.c3} 0 L${cx - R.c3} ${rnd(y3)} A${R.r3} ${R.r3} 0 0 0 ${cx + R.c3} ${rnd(y3)} L${cx + R.c3} 0" ${ln}></path>`;
    h += `<rect x="${cx - L}" y="0" width="${R.lane}" height="${R.ft}" ${ln}></rect>`;
    h += `<path d="M${cx - CIRCLE_R} ${R.ft} A${CIRCLE_R} ${CIRCLE_R} 0 0 0 ${cx + CIRCLE_R} ${R.ft}" ${ln}></path>`;
    h += `<path d="M${cx - CIRCLE_R} ${R.ft} A${CIRCLE_R} ${CIRCLE_R} 0 0 1 ${cx + CIRCLE_R} ${R.ft}" ${ln} stroke-dasharray="${lw * 2.3} ${lw * 2.3}"></path>`;
    if (R.restricted) h += `<path d="M${cx - R.restricted} ${BB_Y} L${cx - R.restricted} ${HOOP_Y} A${R.restricted} ${R.restricted} 0 0 0 ${cx + R.restricted} ${HOOP_Y} L${cx + R.restricted} ${BB_Y}" ${ln}></path>`;
    R.marks.forEach(y => { h += `<path d="M${cx - L - 10} ${y} H${cx - L} M${cx + L} ${y} H${cx + L + 10}" ${ln}></path>`; });
    h += `<path d="M${cx - BB_W / 2} ${BB_Y} H${cx + BB_W / 2}" stroke="#fff6e8" stroke-width="${lw * 1.7}" stroke-linecap="round"></path>`;
    h += `<path d="M${cx} ${BB_Y} V${HOOP_Y - RIM_R}" stroke="#ff7a1a" stroke-width="${lw * .8}"></path>`;
    h += `<circle cx="${cx}" cy="${HOOP_Y}" r="${RIM_R}" fill="none" stroke="#ff7a1a" stroke-width="${lw * .9}"></circle>`;
    return h;
  }

  function courtMarkup(st, uid) {
    const g = viewGeom(st), R = g.rule, sk = SKINS[st.design], lw = g.full ? 4.5 : 3;
    const ln = `fill="none" stroke="${sk.line}" stroke-width="${lw}"`;
    const lnFill = `fill="${sk.paint || "none"}" stroke="${sk.line}" stroke-width="${lw}"`;
    const cx = COURT_W / 2;
    const pattern = sk.parquet
      ? `<pattern id="${uid}-fl" width="30" height="30" patternUnits="userSpaceOnUse"><rect width="30" height="30" fill="${sk.floor}"></rect><path d="M0 0L30 30M30 0L0 30" stroke="rgba(60,30,0,.14)" stroke-width="1.4"></path></pattern>`
      : `<pattern id="${uid}-fl" width="25" height="60" patternUnits="userSpaceOnUse"><rect width="25" height="60" fill="${sk.floor}"></rect><path d="M0 0V60" stroke="rgba(60,30,0,.13)" stroke-width="1.4"></path></pattern>`;
    let h = `<defs>${pattern}</defs>`;
    h += `<rect x="-80" y="-80" width="${COURT_W + 160}" height="${g.D + 160}" fill="${sk.surround}"></rect>`;
    h += `<rect x="0" y="0" width="${COURT_W}" height="${g.D}" fill="url(#${uid}-fl)"></rect>`;
    h += endMarkup(R, sk, lw);
    if (g.full) {
      h += `<g transform="translate(${COURT_W} ${R.len}) rotate(180)">${endMarkup(R, sk, lw)}</g>`;
      h += `<path d="M0 ${R.len / 2} H${COURT_W}" ${ln}></path>`;
      h += `<circle cx="${cx}" cy="${R.len / 2}" r="${CIRCLE_R}" ${lnFill}></circle>`;
      h += `<circle cx="${cx}" cy="${R.len / 2}" r="20" ${ln}></circle>`;
      if (sk.word) h += wordmark(sk, cx, R.len / 2, 90, 26);
    } else {
      h += `<path d="M${cx - CIRCLE_R} ${g.D} A${CIRCLE_R} ${CIRCLE_R} 0 0 1 ${cx + CIRCLE_R} ${g.D}" ${lnFill}></path>`;
      h += `<path d="M${cx - 20} ${g.D} A20 20 0 0 1 ${cx + 20} ${g.D}" ${ln}></path>`;
      if (sk.word) h += wordmark(sk, cx, g.D - 24, 0, 22);
    }
    h += `<rect x="0" y="0" width="${COURT_W}" height="${g.D}" ${ln}></rect>`;
    return h;
  }
  function wordmark(sk, x, y, rot, size) {
    const fs = Math.min(size, 150 / sk.word.length);
    return `<text transform="translate(${x} ${y}) rotate(${rot})" fill="${sk.accent}" font-family="Arial Black, Arial, sans-serif" font-weight="800" font-size="${rnd(fs)}" text-anchor="middle" dominant-baseline="central" letter-spacing="1">${esc(sk.word)}</text>`;
  }

  /* ---------- the model ---------- */
  const DEFAULT_PLAYERS = [
    { id: 1, x: 250, y: 330 }, { id: 2, x: 70, y: 250 }, { id: 3, x: 430, y: 250 },
    { id: 4, x: 170, y: 190 }, { id: 5, x: 330, y: 190 }
  ];
  function defaultState() {
    return {
      court: "half", rules: "nba", design: "classic", steps: 1, ball: 1,
      players: DEFAULT_PLAYERS.map(p => ({ ...p })),
      defense: { mode: "none", players: [1, 2, 3, 4, 5].map(id => ({ id, x: 250, y: 150 })) },
      arrows: []
    };
  }

  function clampAll(st) {
    const g = viewGeom(st);
    let changed = false;
    const fix = o => {
      const [x, y] = clampPt(g, o.x, o.y);
      if (x !== o.x || y !== o.y) { changed = true; o.x = rnd(x); o.y = rnd(y); }
    };
    st.players.forEach(fix);
    st.defense.players.forEach(fix);
    st.arrows.forEach(a => {
      const p1 = clampPt(g, a.x1, a.y1), p2 = clampPt(g, a.x2, a.y2);
      if (p1[0] !== a.x1 || p1[1] !== a.y1 || p2[0] !== a.x2 || p2[1] !== a.y2) changed = true;
      a.x1 = rnd(p1[0]); a.y1 = rnd(p1[1]); a.x2 = rnd(p2[0]); a.y2 = rnd(p2[1]);
    });
    return changed;
  }

  /* Accepts version 1 (original) and version 2 diagrams, always returns a clean version 2 state. */
  function normalize(d) {
    const st = defaultState();
    if (!d || typeof d !== "object") return st;

    if (d.version === 1) {
      const mx = x => clampN((x - 12) / 576 * COURT_W, -15, 515);
      const my = y => clampN((y - 12) / 476 * 470, -15, 485);
      if (Array.isArray(d.players)) {
        st.players = DEFAULT_PLAYERS.map(dp => {
          const s = d.players.find(p => p && p.id === dp.id);
          return s && isNum(s.x) && isNum(s.y) ? { id: dp.id, x: rnd(mx(s.x)), y: rnd(my(s.y)) } : { ...dp };
        });
      }
      let id = 1;
      st.arrows = (Array.isArray(d.arrows) ? d.arrows : [])
        .filter(a => a && [a.x1, a.y1, a.x2, a.y2].every(isNum)).slice(0, MAX_ARROWS)
        .map(a => ({ id: id++, x1: rnd(mx(a.x1)), y1: rnd(my(a.y1)), x2: rnd(mx(a.x2)), y2: rnd(my(a.y2)), kind: "cut", step: 1, p: null, to: null }));
      // old arrows that start at a player become that player's animated route
      st.arrows.forEach(a => {
        let best = null, bd = 60;
        st.players.forEach(p => { const k = Math.hypot(p.x - a.x1, p.y - a.y1); if (k < bd) { bd = k; best = "o" + p.id; } });
        if (best && !st.arrows.some(o => o !== a && o.p === best)) a.p = best;
      });
      return st;
    }

    if (d.version !== 2) return st;
    if (d.court === "full") st.court = "full";
    if (RULES[d.rules]) st.rules = d.rules;
    if (SKINS[d.design]) st.design = d.design;
    st.ball = Number.isInteger(d.ball) && d.ball >= 1 && d.ball <= 5 ? d.ball : 1;
    const g = viewGeom(st);
    const pt = (s, def) => {
      if (!s || !isNum(s.x) || !isNum(s.y)) return { x: def.x, y: def.y };
      const q = clampPt(g, s.x, s.y); return { x: rnd(q[0]), y: rnd(q[1]) };
    };
    if (Array.isArray(d.players)) st.players = DEFAULT_PLAYERS.map(dp => ({ id: dp.id, ...pt(d.players.find(p => p && p.id === dp.id), dp) }));
    if (d.defense && typeof d.defense === "object") {
      if (["none", "man", "manual"].includes(d.defense.mode)) st.defense.mode = d.defense.mode;
      if (Array.isArray(d.defense.players)) st.defense.players = st.defense.players.map(dp => ({ id: dp.id, ...pt(d.defense.players.find(p => p && p.id === dp.id), dp) }));
    }
    let maxStep = Number.isInteger(d.steps) ? clampN(d.steps, 1, MAX_STEPS) : 1, id = 1;
    st.arrows = (Array.isArray(d.arrows) ? d.arrows : [])
      .filter(a => a && [a.x1, a.y1, a.x2, a.y2].every(isNum)).slice(0, MAX_ARROWS)
      .map(a => {
        const step = Number.isInteger(a.step) ? clampN(a.step, 1, MAX_STEPS) : 1;
        maxStep = Math.max(maxStep, step);
        const p1 = clampPt(g, a.x1, a.y1), p2 = clampPt(g, a.x2, a.y2);
        return {
          id: id++, x1: rnd(p1[0]), y1: rnd(p1[1]), x2: rnd(p2[0]), y2: rnd(p2[1]),
          kind: KINDS[a.kind] ? a.kind : "cut", step,
          p: typeof a.p === "string" && /^[od][1-5]$/.test(a.p) ? a.p : null,
          to: Number.isInteger(a.to) && a.to >= 1 && a.to <= 5 ? a.to : null
        };
      });
    st.steps = maxStep;
    return st;
  }

  function serialize(st) {
    return {
      version: 2, court: st.court, rules: st.rules, design: st.design, steps: st.steps, ball: st.ball,
      players: st.players.map(p => ({ id: p.id, x: p.x, y: p.y })),
      defense: { mode: st.defense.mode, players: st.defense.players.map(p => ({ id: p.id, x: p.x, y: p.y })) },
      arrows: st.arrows.map(a => ({ id: a.id, x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2, kind: a.kind, step: a.step, p: a.p, to: a.to }))
    };
  }

  /* ---------- the animation timeline ---------- */
  const hoopsOf = g => g.full ? [[COURT_W / 2, HOOP_Y], [COURT_W / 2, g.len - HOOP_Y]] : [[COURT_W / 2, HOOP_Y]];
  const nearestHoop = (g, pt) => hoopsOf(g).reduce((b, h) => dist(h, pt) < dist(b, pt) ? h : b);
  function attackHoop(g, p) {
    let x = 0, y = 0;
    for (let i = 1; i <= 5; i++) { x += p["o" + i][0]; y += p["o" + i][1]; }
    return nearestHoop(g, [x / 5, y / 5]);
  }
  function guardPoint(g, p, i, holder) {
    const o = p["o" + i], h = attackHoop(g, p);
    let dx = h[0] - o[0], dy = h[1] - o[1], d = Math.hypot(dx, dy);
    if (d < 1) { dx = 0; dy = 1; d = 1; }
    const gap = Math.min("o" + i === holder ? 38 : 55, d * .9);
    return [o[0] + dx / d * gap, o[1] + dy / d * gap];
  }

  function buildTimeline(st) {
    const g = viewGeom(st), mode = st.defense.mode;
    const p = {};
    st.players.forEach(q => { p["o" + q.id] = [q.x, q.y]; });
    if (mode === "manual") st.defense.players.forEach(q => { p["d" + q.id] = [q.x, q.y]; });
    let holder = "o" + st.ball, free = null, z = 0, origin = null;
    if (mode === "man") for (let i = 1; i <= 5; i++) p["d" + i] = guardPoint(g, p, i, holder);
    const ids = Object.keys(p);
    const frames = [], stepIdx = [], stepEndIdx = [], starts = {}, ends = {};
    let hasMotion = false;

    const ballAt = () => holder && p[holder] ? [p[holder][0] + 14, p[holder][1] - 14] : (free || [250, 250]);
    const cap = () => {
      const b = ballAt(), snap = {};
      ids.forEach(k => { snap[k] = [p[k][0], p[k][1]]; });
      frames.push({ p: snap, b: [b[0], b[1], z], h: holder });
    };
    const routeAt = (r, tau) => {
      if (tau >= r.dur) return r.pts[r.pts.length - 1];
      let e = tau / r.dur; e = e * e * (3 - 2 * e);
      let d = e * r.total;
      for (let i = 0; i < r.segs.length; i++) {
        if (d <= r.segs[i] || i === r.segs.length - 1) {
          const f = r.segs[i] ? d / r.segs[i] : 1, a = r.pts[i], b = r.pts[i + 1];
          return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
        }
        d -= r.segs[i];
      }
      return r.pts[r.pts.length - 1];
    };

    cap();
    for (let s = 1; s <= st.steps; s++) {
      stepIdx[s] = frames.length - 1;
      const sa = st.arrows.filter(a => a.step === s && a.p && p[a.p]);
      const base = {};
      ids.forEach(k => { base[k] = [p[k][0], p[k][1]]; });
      const routes = {};
      sa.filter(a => a.kind !== "pass" && a.kind !== "shot").forEach(a => {
        const r = routes[a.p] || (routes[a.p] = { pts: [base[a.p]], segs: [], total: 0, dur: 0 });
        const prev = r.pts[r.pts.length - 1], len = Math.hypot(a.x2 - prev[0], a.y2 - prev[1]);
        starts[a.id] = { x: prev[0], y: prev[1] };
        ends[a.id] = { x: a.x2, y: a.y2 };
        r.segs.push(len); r.total += len; r.dur += len / (SPEED[a.kind] || 150) * 1.15; r.pts.push([a.x2, a.y2]);
        hasMotion = true;
      });
      const holder0 = holder;
      const lastPt = id => routes[id] ? routes[id].pts[routes[id].pts.length - 1] : base[id];

      let pass = null, passDur = 0, recv = null, shot = null, rel = 0, fl = 0, hoop = null;
      if (holder0) {
        const pa = sa.find(a => a.kind === "pass" && a.p === holder0 && a.to && p["o" + a.to] && "o" + a.to !== holder0);
        if (pa) {
          pass = pa; recv = "o" + pa.to;
          const target = lastPt(recv);
          passDur = Math.max(.3, dist(base[holder0], target) / BALL_SPEED);
          starts[pa.id] = { x: base[holder0][0], y: base[holder0][1] };
          ends[pa.id] = { x: target[0], y: target[1] };
          hasMotion = true;
        } else {
          const sh = sa.find(a => a.kind === "shot" && a.p === holder0);
          if (sh) {
            shot = sh;
            rel = routes[holder0] ? routes[holder0].dur : 0;
            const end = lastPt(holder0);
            hoop = nearestHoop(g, end);
            fl = clampN(dist(end, hoop) / 260, .6, 1.3);
            starts[sh.id] = { x: base[holder0][0], y: base[holder0][1] };
            ends[sh.id] = { x: hoop[0], y: hoop[1] };
            hasMotion = true;
          }
        }
      }

      let dur = .6;
      Object.values(routes).forEach(r => { dur = Math.max(dur, r.dur); });
      dur = Math.max(dur, passDur, shot ? rel + fl : 0) + .3;
      const n = Math.ceil(dur / DT - 1e-9);

      for (let k = 1; k <= n; k++) {
        const tau = k * DT;
        z = 0;
        for (const id in routes) p[id] = routeAt(routes[id], tau).slice();
        if (mode === "man") {
          for (let i = 1; i <= 5; i++) {
            const tg = guardPoint(g, p, i, holder), cur = p["d" + i];
            const dx = tg[0] - cur[0], dy = tg[1] - cur[1], d = Math.hypot(dx, dy);
            if (d > .01) {
              const m = Math.min(Math.min(DEF_SPEED, d * 5) * DT, d);
              p["d" + i] = [cur[0] + dx / d * m, cur[1] + dy / d * m];
            }
          }
        }
        if (pass) {
          if (tau < passDur) {
            if (holder) { origin = ballAt().slice(0, 2); holder = null; }
            const u = tau / passDur, tp = p[recv];
            free = [origin[0] + (tp[0] + 14 - origin[0]) * u, origin[1] + (tp[1] - 14 - origin[1]) * u];
          } else { holder = recv; free = null; }
        } else if (shot) {
          if (tau >= rel && tau < rel + fl) {
            if (holder) { origin = ballAt().slice(0, 2); holder = null; }
            const u = (tau - rel) / fl;
            free = [origin[0] + (hoop[0] - origin[0]) * u, origin[1] + (hoop[1] - origin[1]) * u];
            z = Math.sin(u * Math.PI);
          } else if (tau >= rel + fl) { holder = null; free = [hoop[0], hoop[1]]; }
        }
        if (holder && routes[holder] && tau < routes[holder].dur) z = .35 * Math.abs(Math.sin(tau * 11));
        cap();
      }
      stepEndIdx[s] = frames.length - 1;
    }
    return {
      frames, stepIdx, stepEndIdx, starts, ends, hasMotion,
      duration: (frames.length - 1) * DT,
      stepStarts: stepIdx.map(i => i * DT).slice(1),
      geom: g
    };
  }

  function sample(tl, t) {
    const f = tl.frames, x = clampN(t / DT, 0, f.length - 1), i = Math.floor(x), j = Math.min(f.length - 1, i + 1), u = x - i;
    const A = f[i], B = f[j], p = {};
    for (const k in A.p) p[k] = [A.p[k][0] + (B.p[k][0] - A.p[k][0]) * u, A.p[k][1] + (B.p[k][1] - A.p[k][1]) * u];
    return { p, b: [A.b[0] + (B.b[0] - A.b[0]) * u, A.b[1] + (B.b[1] - A.b[1]) * u, A.b[2] + (B.b[2] - A.b[2]) * u], h: A.h };
  }
  function stepAtTime(tl, t) {
    let s = 1;
    tl.stepStarts.forEach((st, i) => { if (t >= st - 1e-6) s = i + 1; });
    return s;
  }

  /* ---------- markup for the moving parts ---------- */
  function markerDefs(uid) {
    return Object.entries(KINDS).map(([k, v]) => {
      const screen = k === "screen";
      return `<marker id="${uid}-${k}" viewBox="0 0 10 10" refX="${screen ? 5 : 8}" refY="5" markerWidth="3.4" markerHeight="3.4" orient="auto"><path d="${screen ? "M5 0V10" : "M0 0L10 5L0 10z"}" ${screen ? `stroke="${v.color}" stroke-width="3" fill="none"` : `fill="${v.color}"`}></path></marker>`;
    }).join("");
  }

  function arrowsMarkup(st, tl, o) {
    const S = tl.geom.S, w = 4 * S;
    return st.arrows.filter(a => !(a.p && a.p[0] === "d" && st.defense.mode !== "manual")).map(a => {
      const k = KINDS[a.kind], s = tl.starts[a.id] || { x: a.x1, y: a.y1 }, e = tl.ends[a.id] || { x: a.x2, y: a.y2 };
      const faded = o.current && a.step !== o.current;
      return `<g class="court-arrow-g" data-kind="${a.kind}" opacity="${faded ? .28 : 1}">
        <line x1="${rnd(s.x)}" y1="${rnd(s.y)}" x2="${rnd(e.x)}" y2="${rnd(e.y)}" stroke="rgba(16,22,32,.55)" stroke-width="${w + 3.5 * S}" stroke-linecap="round"></line>
        <line class="court-arrow" x1="${rnd(s.x)}" y1="${rnd(s.y)}" x2="${rnd(e.x)}" y2="${rnd(e.y)}" stroke="${k.color}" stroke-width="${w}" stroke-linecap="round"${k.dash ? ` stroke-dasharray="${k.dash.split(" ").map(n => n * S).join(" ")}"` : ""} marker-end="url(#${o.uid}-${a.kind})"></line>
        <circle class="court-arrow-start" cx="${rnd(s.x)}" cy="${rnd(s.y)}" r="${4 * S}" fill="${k.color}" stroke="#202938" stroke-width="2"></circle>
      </g>`;
    }).join("");
  }

  const ft = v => Math.round(v / 10);
  function entitiesMarkup(st, p, o) {
    const S = o.S, rot = o.rot, r = 19 * S, fs = 19 * S;
    let h = "";
    if (st.defense.mode !== "none") {
      for (let i = 1; i <= 5; i++) {
        const q = p["d" + i]; if (!q) continue;
        const drag = o.editable && st.defense.mode === "manual" && o.step === 1;
        h += `<g class="court-defender" data-defender="${i}" ${drag ? `tabindex="0" role="button"` : `role="img"`}
          aria-label="Defender ${i}, ${ft(q[0])} ft across, ${ft(q[1])} ft from the baseline.${drag ? " Use arrow keys to move." : ""}"
          transform="translate(${rnd(q[0])} ${rnd(q[1])}) rotate(${rot})"><circle r="${r}" fill="#e9eef7" stroke="#e64b4b" stroke-width="${4 * S}"></circle><text y="1" fill="#1b2230" font-size="${fs}" font-weight="bold" text-anchor="middle" dominant-baseline="central" font-family="Arial, sans-serif">${i}</text></g>`;
      }
    }
    for (let i = 1; i <= 5; i++) {
      const q = p["o" + i];
      h += `<g class="court-player" data-player="${i}" ${o.editable ? `tabindex="0" role="button"` : `role="img"`}
        aria-label="Player ${i}${st.ball === i && o.step <= 1 ? " (has the ball)" : ""}, ${ft(q[0])} ft across, ${ft(q[1])} ft from the baseline.${o.editable ? " Use arrow keys to move." : ""}"
        transform="translate(${rnd(q[0])} ${rnd(q[1])}) rotate(${rot})"><circle r="${r}" fill="#202938" stroke="#ffb17a" stroke-width="${4 * S}"></circle><text y="1" fill="#fff" font-size="${fs}" font-weight="bold" text-anchor="middle" dominant-baseline="central" font-family="Arial, sans-serif">${i}</text></g>`;
    }
    return h;
  }
  function ballMarkup(b, S) {
    const r = 8 * S;
    return `<g class="court-ball" transform="translate(${rnd(b[0])} ${rnd(b[1])}) scale(${rnd(1 + b[2] * .7)})" aria-hidden="true">
      <circle r="${r}" fill="#f28c28" stroke="#3a1c05" stroke-width="${1.6 * S}"></circle>
      <path d="M${-r} 0H${r}M0 ${-r}V${r}" stroke="#3a1c05" stroke-width="${S}" fill="none"></path></g>`;
  }

  /* A whole <svg>. Layers are filled by the caller (editor/viewer) or by staticSVG. */
  function svgMarkup(st, tl, frame, o) {
    const g = tl.geom, uid = o.uid;
    return `<svg ${o.id ? `id="${o.id}" ` : ""}class="${o.cls || "court-thumb"}" viewBox="0 0 ${g.W} ${g.H}" role="${o.role || "img"}"
      aria-label="${esc(o.label)}" xmlns="http://www.w3.org/2000/svg">
      <defs>${markerDefs(uid)}</defs>
      <g ${o.ids ? `id="courtWorld" ` : ""}class="cl-world" transform="${g.world}">
        ${courtMarkup(st, uid)}
        <g ${o.ids ? `id="courtArrows" ` : ""}class="cl-arrows">${arrowsMarkup(st, tl, { uid, current: o.current })}</g>
        <g ${o.ids ? `id="courtPlayers" ` : ""}class="cl-players">${entitiesMarkup(st, frame.p, { S: g.S, rot: g.rot, editable: !!o.editable, step: o.step || 1, root: !!o.ids })}</g>
        <g ${o.ids ? `id="courtBall" ` : ""}class="cl-ball">${ballMarkup(frame.b, g.S)}</g>
      </g></svg>`;
  }

  /* repaint the three layers of an existing svg (resting state) */
  function paintLayers(root, st, tl, frame, o) {
    const g = tl.geom;
    root.querySelector(".cl-arrows").innerHTML = arrowsMarkup(st, tl, { uid: o.uid, current: o.current });
    root.querySelector(".cl-players").innerHTML = entitiesMarkup(st, frame.p, { S: g.S, rot: g.rot, editable: !!o.editable, step: o.step || 1, root: true });
    root.querySelector(".cl-ball").innerHTML = ballMarkup(frame.b, g.S);
  }
  /* move things during playback without rebuilding the DOM */
  function applyFrame(root, g, fr) {
    root.querySelectorAll("[data-player]").forEach(n => {
      const q = fr.p["o" + n.dataset.player];
      if (q) n.setAttribute("transform", `translate(${rnd(q[0])} ${rnd(q[1])}) rotate(${g.rot})`);
    });
    root.querySelectorAll("[data-defender]").forEach(n => {
      const q = fr.p["d" + n.dataset.defender];
      if (q) n.setAttribute("transform", `translate(${rnd(q[0])} ${rnd(q[1])}) rotate(${g.rot})`);
    });
    const b = root.querySelector(".court-ball");
    if (b) b.setAttribute("transform", `translate(${rnd(fr.b[0])} ${rnd(fr.b[1])}) scale(${rnd(1 + fr.b[2] * .7)})`);
  }

  /* ---------- styles ---------- */
  function addStyles() {
    if (document.getElementById("courtDesignerStyles")) return;
    const style = document.createElement("style");
    style.id = "courtDesignerStyles";
    style.textContent = `
      .court-designer { margin: 8px 0 20px; padding: 18px; border: 1px solid var(--border, #354357); border-radius: 14px; background: var(--panel-2, #182333); color: var(--text, #f5f7fb); }
      .court-heading { display: flex; justify-content: space-between; align-items: start; gap: 12px; flex-wrap: wrap; }
      .court-heading h3 { margin: 4px 0 8px; font-size: 1.2rem; }
      .court-eyebrow { color: var(--accent, #ff9a52); font-size: .75rem; font-weight: 800; letter-spacing: 2px; margin: 0; }
      .court-help, .court-note { color: var(--muted, #c0cada); font-size: .9rem; line-height: 1.6; }
      .court-tag { color: var(--accent, #ffb17a); border: 1px solid var(--accent-line, #805538); border-radius: 20px; padding: 6px 10px; font-size: .72rem; white-space: nowrap; }
      .court-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 14px 0; }
      .court-designer .court-toolbar button, .cp-controls button { min-height: 44px; padding: 9px 13px; font-size: .85rem; font-weight: 700; border-radius: 10px; border: 1px solid var(--border, #53647c); background: var(--panel, #273448); color: var(--text, #fff); cursor: pointer; font-family: inherit; }
      .court-designer .court-toolbar .court-secondary { background: var(--panel, #273448); color: var(--text, #fff); border-color: var(--border, #53647c); }
      .court-designer .court-toolbar button.active, .court-designer .court-toolbar button[aria-pressed="true"], .cp-controls button.cp-play { background: var(--accent, #ff9a52); color: var(--accent-ink, #20150e); border-color: var(--accent, #ff9a52); }
      .court-designer .court-toolbar button:disabled, .cp-controls button:disabled { opacity: .45; cursor: not-allowed; }
      .court-kinds button { display: inline-flex; align-items: center; gap: 7px; }
      .court-kinds .sw { width: 14px; height: 14px; border-radius: 4px; border: 1px solid rgba(0,0,0,.5); display: inline-block; }
      .court-step-label { font-weight: 800; font-size: .9rem; min-width: 7.5em; text-align: center; }
      .court-options { display: flex; flex-wrap: wrap; gap: 12px; margin: 14px 0 4px; }
      .court-options label, .cp-opts label { display: flex; flex-direction: column; gap: 4px; font-size: .75rem; font-weight: 800; letter-spacing: .5px; color: var(--muted, #c0cada); }
      .court-options select, .cp-opts select { min-height: 44px; padding: 8px 10px; font-size: .9rem; border-radius: 10px; border: 1px solid var(--border, #53647c); background: var(--input, #101925); color: var(--text, #fff); font-family: inherit; }
      .court-seg { display: flex; gap: 0; align-self: flex-end; }
      .court-seg button { min-height: 44px; padding: 8px 14px; font-weight: 700; font-size: .85rem; border: 1px solid var(--border, #53647c); background: var(--panel, #273448); color: var(--text, #fff); cursor: pointer; font-family: inherit; }
      .court-seg button:first-child { border-radius: 10px 0 0 10px; } .court-seg button:last-child { border-radius: 0 10px 10px 0; border-left: 0; }
      .court-seg button[aria-pressed="true"] { background: var(--accent, #ff9a52); color: var(--accent-ink, #20150e); border-color: var(--accent, #ff9a52); }
      .court-frame { width: 100%; overflow: hidden; border-radius: 11px; border: 1px solid #805538; background: #a96f43; }
      #basketballCourt, .cp-svg { display: block; width: 100%; height: auto; user-select: none; }
      #basketballCourt { touch-action: none; }
      .court-player { cursor: grab; outline: none; }
      .court-player:active { cursor: grabbing; }
      .court-player:focus-visible circle, .court-defender:focus-visible circle { stroke: #fff; stroke-width: 7; }
      .court-player text, .court-defender text { pointer-events: none; }
      .court-defender { outline: none; }
      #courtDesigner .court-defender[tabindex] { cursor: grab; }
      .court-ball { pointer-events: none; }
      .cp-playing .cl-arrows { opacity: .3; }
      .court-status { min-height: 1.5em; color: var(--accent, #ffb17a); font-size: .9rem; }
      .cp-controls { margin: 12px 0 4px; display: flex; flex-direction: column; gap: 10px; }
      .cp-buttons, .cp-opts, .cp-scrub { display: flex; flex-wrap: wrap; align-items: end; gap: 8px; }
      .cp-scrub { align-items: center; flex-wrap: nowrap; }
      .cp-range { flex: 1; min-width: 0; accent-color: var(--accent, #ff9a52); height: 32px; }
      .cp-time { font-variant-numeric: tabular-nums; font-size: .82rem; color: var(--muted, #c0cada); white-space: nowrap; }
      .cp-check { flex-direction: row !important; align-items: center; gap: 8px !important; min-height: 44px; font-size: .85rem !important; letter-spacing: 0 !important; font-weight: 600 !important; }
      .cp-info { margin: 0; min-height: 1.4em; font-size: .85rem; color: var(--accent, #ffb17a); }
      .court-designer button:focus-visible, .cp-controls button:focus-visible, .cp-controls select:focus-visible, .court-options select:focus-visible, .cp-range:focus-visible { outline: 3px solid var(--focus, #ffd0ad); outline-offset: 3px; }
      @media (max-width: 520px) {
        .court-designer { padding: 13px; }
        .court-designer .court-toolbar button { flex: 1 1 42%; }
        .cp-controls .cp-buttons button { flex: 1 1 40%; }
      }
      @media (prefers-reduced-motion: reduce) { .cp-controls button { transition: none; } }
    `;
    document.head.appendChild(style);
  }

  /* ---------- playback controller (shared by editor and viewer) ---------- */
  function playbackMarkup(extra) {
    return `<div class="cp-controls" role="group" aria-label="Play the animation">
      <div class="cp-buttons">
        <button type="button" class="cp-restart">⏮ Restart</button>
        <button type="button" class="cp-prev" aria-label="Back one step">◀ Step</button>
        <button type="button" class="cp-play">▶ Play</button>
        <button type="button" class="cp-next" aria-label="Forward one step">Step ▶</button>
      </div>
      <div class="cp-scrub">
        <input type="range" class="cp-range" min="0" max="1000" value="0" aria-label="Animation position (drag to rewind or skip)">
        <span class="cp-time">0.0 / 0.0 s</span>
      </div>
      <div class="cp-opts">
        <label>SPEED<select class="cp-speed" aria-label="Playback speed">
          <option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1" selected>1× (real time)</option>
          <option value="1.5">1.5×</option><option value="2">2×</option></select></label>
        <label class="cp-check"><input type="checkbox" class="cp-stepmode"> Pause after each step</label>
        ${extra || ""}
      </div>
      <p class="cp-info" role="status" aria-live="polite"></p>
    </div>`;
  }

  /* hooks: timeline() -> tl, show(frame|null, t) (null = back to the resting view) */
  function makePlayback(root, hooks) {
    const q = s => root.querySelector(s);
    let t = 0, playing = false, raf = 0, last = 0, speed = 1, stepMode = false, dead = false;
    const T = () => hooks.timeline();
    const info = text => { const e = q(".cp-info"); if (e) e.textContent = text; };

    function ui() {
      const tl = T(), play = q(".cp-play");
      if (!play) return;
      play.textContent = playing ? "⏸ Pause" : (t >= tl.duration - 1e-6 && t > 0 ? "↺ Replay" : "▶ Play");
      play.setAttribute("aria-label", playing ? "Pause" : "Play");
      q(".cp-range").value = tl.duration ? Math.round(t / tl.duration * 1000) : 0;
      q(".cp-time").textContent = `${t.toFixed(1)} / ${tl.duration.toFixed(1)} s`;
      const noMotion = !tl.hasMotion;
      ["cp-restart", "cp-prev", "cp-play", "cp-next", "cp-range"].forEach(c => { q("." + c).disabled = noMotion; });
      if (noMotion) info("Draw a route that starts at a player (or a pass, dribble or shot from the ball handler) to animate this play.");
    }
    function show() {
      const tl = T();
      hooks.show(sample(tl, t), t);
      info(`Step ${stepAtTime(tl, t)} of ${tl.stepStarts.length}`);
      ui();
    }
    function pause() { playing = false; cancelAnimationFrame(raf); ui(); }
    function tick(now) {
      if (!playing || dead) return;
      if (hooks.alive && !hooks.alive()) { dead = true; playing = false; return; }
      const tl = T(), prev = t;
      t = Math.min(tl.duration, t + Math.min(.1, (now - last) / 1000) * speed);
      last = now;
      if (stepMode) {
        for (let i = 1; i < tl.stepStarts.length; i++) {
          const b = tl.stepStarts[i];
          if (prev < b - 1e-6 && t >= b - 1e-6) { t = b; show(); pause(); info(`Paused. Step ${i + 1} is next.`); return; }
        }
      }
      show();
      if (t >= tl.duration - 1e-6) { pause(); info("Play finished. Press Replay to watch again."); return; }
      raf = requestAnimationFrame(tick);
    }
    function play() {
      const tl = T();
      if (!tl.hasMotion) return;
      if (t >= tl.duration - 1e-6) t = 0;
      playing = true; last = performance.now();
      root.classList.add("cp-active");
      cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); show();
    }
    const api = {
      play, pause,
      toggle() { playing ? pause() : play(); },
      restart() { t = 0; play(); },
      prevStep() {
        const tl = T(); pause();
        const earlier = tl.stepStarts.filter(s => s < t - .05);
        t = earlier.length ? earlier[earlier.length - 1] : 0; show();
      },
      nextStep() {
        const tl = T(); pause();
        const later = tl.stepStarts.filter(s => s > t + .01);
        t = later.length ? later[0] : tl.duration; show();
      },
      seek(v) { pause(); t = clampN(v, 0, T().duration); show(); },
      setSpeed(v) { speed = clampN(v, .1, 4); },
      setStepMode(v) { stepMode = !!v; },
      reset() { pause(); t = 0; root.classList.remove("cp-active"); hooks.show(null, 0); ui(); info(""); },
      refresh() { if (!playing) { t = Math.min(t, T().duration); ui(); } },
      get time() { return t; }, get playing() { return playing; },
      destroy() { dead = true; pause(); }
    };
    q(".cp-play").addEventListener("click", api.toggle);
    q(".cp-restart").addEventListener("click", api.restart);
    q(".cp-prev").addEventListener("click", api.prevStep);
    q(".cp-next").addEventListener("click", api.nextStep);
    q(".cp-range").addEventListener("input", e => api.seek(Number(e.target.value) / 1000 * T().duration));
    q(".cp-speed").addEventListener("change", e => api.setSpeed(Number(e.target.value)));
    q(".cp-stepmode").addEventListener("change", e => api.setStepMode(e.target.checked));
    ui();
    return api;
  }

  /* ============================================================
     EDITOR
     ============================================================ */
  let st = defaultState();
  let tl = null, viewStep = 1, drawingMode = false, drawKind = "cut", arrowStart = null, draggingId = null;
  let nextArrowId = 1, backup = null, pb = null, previewCounter = 0;
  const EDIT_UID = "ce";

  function status(text) {
    const element = document.getElementById("courtStatus");
    if (element) element.textContent = text;
  }
  const touch = () => { backup = null; };

  function editorMarkup() {
    const rulesOpts = Object.entries(RULES).map(([k, r]) => `<option value="${k}">${esc(r.label)}</option>`).join("");
    const groups = {};
    Object.entries(SKINS).forEach(([k, s]) => { (groups[s.group] = groups[s.group] || []).push(`<option value="${k}">${esc(s.label)}</option>`); });
    const designOpts = Object.entries(groups).map(([gname, o]) => `<optgroup label="${esc(gname)}">${o.join("")}</optgroup>`).join("");
    const kindBtns = Object.entries(KINDS).map(([k, v]) =>
      `<button type="button" class="court-secondary" data-kind="${k}" aria-pressed="${k === "cut"}"><span class="sw" style="background:${v.color}"></span>${v.label}</button>`).join("");
    return `
      <section id="courtDesigner" class="court-designer" aria-labelledby="courtDesignerTitle">
        <div class="court-heading">
          <div>
            <p class="court-eyebrow">PLAY DESIGNER</p>
            <h3 id="courtDesignerTitle">Draw your play</h3>
            <p class="court-help">
              Drag players to move them, or Tab to a player and use the arrow keys
              (hold Shift to move faster). Turn on arrows, then click two court
              locations to draw a movement route. Touch works on supported devices.
              Start a route on a player to animate it; use Add step for what happens next, then press Play.
            </p>
          </div>
          <span class="court-tag" id="courtTag">HALF COURT</span>
        </div>

        <div class="court-options" role="group" aria-label="Court options">
          <div class="court-seg" role="group" aria-label="Court size">
            <button type="button" id="courtModeHalf" aria-pressed="true">Half court</button>
            <button type="button" id="courtModeFull" aria-pressed="false">Full court</button>
          </div>
          <label>RULES<select id="courtRules" aria-label="Court rules and dimensions">${rulesOpts}</select></label>
          <label>COURT DESIGN<select id="courtDesign" aria-label="Court design">${designOpts}</select></label>
          <label>DEFENSE<select id="courtDefense" aria-label="Defense">
            <option value="none">None</option><option value="man">Man-to-man (automatic)</option><option value="manual">Manual (I place and draw them)</option></select></label>
          <label>BALL<select id="courtBallHolder" aria-label="Player who starts with the ball">
            ${[1, 2, 3, 4, 5].map(n => `<option value="${n}">Player ${n} starts with it</option>`).join("")}</select></label>
        </div>

        <div class="court-toolbar" role="group" aria-label="Court drawing tools">
          <button type="button" id="courtArrowToggle" aria-pressed="false">Draw arrows: Off</button>
          <button type="button" id="courtUndo" class="court-secondary" disabled>Undo arrow</button>
          <button type="button" id="courtClearArrows" class="court-secondary" disabled>Clear arrows</button>
          <button type="button" id="courtReset" class="court-secondary">Reset court</button>
        </div>
        <div class="court-toolbar court-kinds" role="group" aria-label="Route type">${kindBtns}</div>
        <div class="court-toolbar court-steps" role="group" aria-label="Play steps">
          <button type="button" id="courtStepPrev" class="court-secondary" aria-label="Previous step">◀</button>
          <span class="court-step-label" id="courtStepLabel" aria-live="polite">Step 1 of 1</span>
          <button type="button" id="courtStepNext" class="court-secondary" aria-label="Next step">▶</button>
          <button type="button" id="courtStepAdd" class="court-secondary">+ Add step</button>
          <button type="button" id="courtStepDelete" class="court-secondary">Delete step</button>
        </div>

        <div class="court-frame" id="courtFrame"></div>
        <div id="courtPlayback"></div>

        <p id="courtStatus" class="court-status" role="status" aria-live="polite" aria-atomic="true">
          Drag a player or turn on Draw arrows.
        </p>
        <p class="court-note">
          The court layout is included when you save this play. Use Reset court to restore the starting positions.
          Court designs only change how the court looks; they never change your play.
        </p>
      </section>
    `;
  }

  function editPositions() { return tl.frames[tl.stepIdx[viewStep]]; }

  /* rebuilds the court picture itself (size, rules or design changed) */
  function rebuildCourt() {
    tl = buildTimeline(st);
    const fr = editPositions(), g = tl.geom;
    const frame = document.getElementById("courtFrame");
    const label = `Interactive basketball ${g.full ? "full" : "half"} court. Drag numbered players to move them, or use the arrow tool to draw routes.`;
    frame.innerHTML = svgMarkup(st, tl, fr, { uid: EDIT_UID, id: "basketballCourt", ids: true, cls: "", role: "group", label, editable: true, step: viewStep, current: st.steps > 1 ? viewStep : 0 });
    document.getElementById("courtTag").textContent = g.full ? "FULL COURT" : "HALF COURT";
    syncControls();
  }

  /* repaints moving parts (positions, arrows) */
  function render(focusId) {
    const svg = document.getElementById("basketballCourt");
    if (!svg) return;
    tl = buildTimeline(st);
    paintLayers(svg, st, tl, editPositions(), { uid: EDIT_UID, editable: true, step: viewStep, current: st.steps > 1 ? viewStep : 0 });
    svg.classList.remove("cp-playing");
    if (focusId) {
      const sel = focusId[0] === "d" ? `[data-defender="${focusId.slice(1)}"]` : `[data-player="${focusId.slice(1)}"]`;
      const node = svg.querySelector(sel);
      if (node) node.focus({ preventScroll: true });
    }
    syncControls();
    if (pb) pb.refresh();
  }

  function syncControls() {
    const $ = id => document.getElementById(id);
    if (!$("courtDesigner")) return;
    $("courtUndo").disabled = st.arrows.length === 0;
    $("courtClearArrows").disabled = st.arrows.length === 0;
    $("courtArrowToggle").setAttribute("aria-pressed", String(drawingMode));
    $("courtModeHalf").setAttribute("aria-pressed", String(st.court === "half"));
    $("courtModeFull").setAttribute("aria-pressed", String(st.court === "full"));
    $("courtRules").value = st.rules; $("courtDesign").value = st.design;
    $("courtDefense").value = st.defense.mode; $("courtBallHolder").value = String(st.ball);
    document.querySelectorAll("#courtDesigner .court-kinds [data-kind]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.kind === drawKind)));
    $("courtStepLabel").textContent = `Step ${viewStep} of ${st.steps}`;
    $("courtStepPrev").disabled = viewStep <= 1;
    $("courtStepNext").disabled = viewStep >= st.steps;
    $("courtStepAdd").disabled = st.steps >= MAX_STEPS;
    $("courtStepDelete").disabled = st.steps <= 1;
    $("courtBallHolder").disabled = viewStep !== 1;
  }

  const stopPB = () => { if (pb && (pb.playing || document.querySelector("#courtDesigner .cp-active"))) pb.reset(); };

  function pointFromEvent(event) {
    const world = document.getElementById("courtWorld"), svg = world.ownerSVGElement;
    const g = tl.geom;
    const point = svg.createSVGPoint();
    point.x = event.clientX; point.y = event.clientY;
    const matrix = world.getScreenCTM();
    if (!matrix) return { x: 250, y: 200 };
    const local = point.matrixTransform(matrix.inverse());
    const c = clampPt(g, local.x, local.y);
    return { x: c[0], y: c[1] };
  }

  /* decide which player an arrow belongs to, and for passes who receives it */
  function attribute(step, kind, s, e) {
    const g = tl.geom, near = 36 * g.S;
    const f = tl.frames[tl.stepIdx[step]], endF = tl.frames[tl.stepEndIdx[step]];
    const holder = f.h, S2 = [s.x, s.y], E2 = [e.x, e.y];
    if (kind === "pass" || kind === "shot") {
      if (!holder) return { p: null, msg: "Nobody has the ball at this point, so this line is drawn but not animated." };
      if (dist(S2, f.p[holder]) > near * 1.4) return { p: null, msg: `Passes and shots start at the player with the ball (Player ${holder.slice(1)} in this step). Drawn as a plain line.` };
      if (kind === "shot") return { p: holder, to: null };
      let best = null, bd = 55 * g.S;
      for (let i = 1; i <= 5; i++) {
        const id = "o" + i; if (id === holder) continue;
        [f.p[id], endF.p[id]].forEach(pos => { const d = dist(E2, pos); if (d < bd) { bd = d; best = i; } });
      }
      return best ? { p: holder, to: best } : { p: null, msg: "Finish the pass on a teammate (or where a teammate is cutting to). Drawn as a plain line." };
    }
    for (let i = st.arrows.length - 1; i >= 0; i--) {
      const a = st.arrows[i];
      if (a.step === step && a.p && a.kind !== "pass" && a.kind !== "shot" && dist(S2, [a.x2, a.y2]) < near) return { p: a.p, to: null };
    }
    let best = null, bd = near;
    Object.keys(f.p).forEach(id => { const d = dist(S2, f.p[id]); if (d < bd) { bd = d; best = id; } });
    return best ? { p: best, to: null } : { p: null, msg: "Drawn as a plain line. Start a route on a player to animate it." };
  }

  function onPointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    stopPB();
    const frame = document.getElementById("courtFrame");
    const playerGroup = event.target.closest("[data-player],[data-defender]");

    if (drawingMode) {
      const point = pointFromEvent(event);
      if (!arrowStart) {
        arrowStart = point;
        status("Start selected. Click the destination for the arrow.");
      } else {
        const distance = Math.hypot(point.x - arrowStart.x, point.y - arrowStart.y);
        if (distance < 10) { status("Choose a destination farther from the start."); return; }
        if (st.arrows.length >= MAX_ARROWS) {
          status("That is the maximum of 40 arrows. Undo or clear some first.");
          arrowStart = null; return;
        }
        const at = attribute(viewStep, drawKind, arrowStart, point);
        st.arrows.push({
          id: nextArrowId++, x1: Math.round(arrowStart.x), y1: Math.round(arrowStart.y),
          x2: Math.round(point.x), y2: Math.round(point.y),
          kind: drawKind, step: viewStep, p: at.p, to: at.to || null
        });
        arrowStart = null; touch();
        status(at.msg || (at.p ? `${KINDS[drawKind].label} added for ${at.p[0] === "d" ? "defender" : "player"} ${at.p.slice(1)}.` : "Arrow added."));
        render();
      }
      return;
    }

    if (playerGroup) {
      const isDef = playerGroup.hasAttribute("data-defender");
      if (isDef && !(st.defense.mode === "manual" && viewStep === 1)) return;
      if (viewStep !== 1) {
        status("Players can be moved in Step 1 only. Later steps start where the earlier steps end. Go to Step 1 to change starting positions.");
        return;
      }
      draggingId = (isDef ? "d" : "o") + (isDef ? playerGroup.dataset.defender : playerGroup.dataset.player);
      document.getElementById("basketballCourt").setPointerCapture?.(event.pointerId);
      event.preventDefault();
    }
    void frame;
  }

  function entityRef(id) {
    return id[0] === "d" ? st.defense.players.find(p => p.id === Number(id.slice(1))) : st.players.find(p => p.id === Number(id.slice(1)));
  }
  function onPointerMove(event) {
    if (draggingId === null) return;
    const point = pointFromEvent(event), ent = entityRef(draggingId);
    if (!ent) return;
    ent.x = Math.round(point.x); ent.y = Math.round(point.y);
    touch(); render();
  }
  function onPointerUp() {
    if (draggingId !== null) status("Player position updated.");
    draggingId = null;
  }

  function onKeyDown(event) {
    const group = event.target.closest && event.target.closest("[data-player],[data-defender]");
    if (!group || drawingMode) return;
    const step = event.shiftKey ? 25 : 8;
    const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const d = dirs[event.key];
    if (!d) return;
    event.preventDefault();
    stopPB();
    if (viewStep !== 1) { status("Players can be moved in Step 1 only. Later steps start where the earlier steps end."); return; }
    const isDef = group.hasAttribute("data-defender");
    const id = (isDef ? "d" : "o") + (isDef ? group.dataset.defender : group.dataset.player);
    const ent = entityRef(id);
    if (!ent) return;
    const g = tl.geom;
    // on the rotated full court, screen "left" is world y minus, screen "up" is world x plus
    const dx = g.full ? -d[1] : d[0], dy = g.full ? d[0] : d[1];
    const c = clampPt(g, ent.x + dx * step, ent.y + dy * step);
    ent.x = rnd(c[0]); ent.y = rnd(c[1]);
    touch(); render(id);
    status(`${isDef ? "Defender" : "Player"} ${id.slice(1)} moved.`);
  }

  function setDrawingMode(enabled) {
    drawingMode = enabled;
    arrowStart = null;
    const button = document.getElementById("courtArrowToggle");
    if (button) {
      button.textContent = `Draw arrows: ${enabled ? "On" : "Off"}`;
      button.classList.toggle("active", enabled);
    }
    syncControls();
    status(enabled
      ? "Click the start point, then click the destination."
      : "Drag a player or turn on Draw arrows.");
  }

  function resetState() {
    st = defaultState();
    viewStep = 1; arrowStart = null; nextArrowId = 1; drawingMode = false; drawKind = "cut";
    draggingId = null; backup = null;
  }
  function resetCourt() {
    stopPB();
    const keep = { court: st.court, rules: st.rules, design: st.design };
    resetState();
    Object.assign(st, keep);
    clampAll(st);
    setDrawingMode(false);
    rebuildCourt();
    status("Court reset to the starting positions.");
  }

  function getDiagram() { return serialize(st); }

  function loadDiagram(diagram) {
    stopPB();
    if (!diagram || (diagram.version !== 1 && diagram.version !== 2)) { resetCourt(); return; }
    st = normalize(diagram);
    nextArrowId = st.arrows.reduce((m, a) => Math.max(m, a.id), 0) + 1;
    viewStep = 1; arrowStart = null; backup = null;
    setDrawingMode(false);
    rebuildCourt();
    status("Saved court layout loaded.");
  }

  function setCourtMode(mode) {
    if (mode === st.court) return;
    stopPB();
    if (mode === "half") {
      const before = JSON.stringify(serialize(st));
      st.court = "half";
      const changed = clampAll(st);
      backup = changed ? before : null;
      status(changed ? "Half court. Anything beyond half court was moved to the edge. Switch back to Full court to restore it." : "Half court.");
    } else {
      if (backup) {
        const keep = { rules: st.rules, design: st.design };
        st = normalize(JSON.parse(backup));
        Object.assign(st, keep);
        nextArrowId = st.arrows.reduce((m, a) => Math.max(m, a.id), 0) + 1;
        status("Full court. Your earlier positions were restored.");
      } else { st.court = "full"; status("Full court. The area just outside the lines is open so you can draw inbound plays."); }
      backup = null;
    }
    rebuildCourt();
  }

  function initOnce() {
    const $ = id => document.getElementById(id);
    const frame = $("courtFrame");
    frame.addEventListener("pointerdown", onPointerDown);
    frame.addEventListener("pointermove", onPointerMove);
    frame.addEventListener("pointerup", onPointerUp);
    frame.addEventListener("pointercancel", onPointerUp);
    frame.addEventListener("keydown", onKeyDown);

    $("courtArrowToggle").addEventListener("click", () => { stopPB(); setDrawingMode(!drawingMode); });
    $("courtUndo").addEventListener("click", () => {
      stopPB();
      if (!st.arrows.length) { status("There are no arrows to undo."); return; }
      st.arrows.pop(); arrowStart = null; touch(); render();
      status("Last arrow removed.");
    });
    $("courtClearArrows").addEventListener("click", () => {
      stopPB();
      if (!st.arrows.length) return;
      st.arrows = []; arrowStart = null; touch(); render();
      status("All arrows cleared.");
    });
    $("courtReset").addEventListener("click", resetCourt);

    $("courtModeHalf").addEventListener("click", () => setCourtMode("half"));
    $("courtModeFull").addEventListener("click", () => setCourtMode("full"));
    $("courtRules").addEventListener("change", e => {
      stopPB(); st.rules = e.target.value; clampAll(st); touch(); rebuildCourt();
      status(`${RULES[st.rules].label} markings applied. Your players and routes were kept.`);
    });
    $("courtDesign").addEventListener("change", e => {
      stopPB(); st.design = e.target.value; rebuildCourt();
      status(`Court design: ${SKINS[st.design].label}. Only the look changed; your play is untouched.`);
    });
    $("courtDefense").addEventListener("change", e => {
      stopPB();
      const mode = e.target.value;
      if (mode === "manual" && st.defense.mode !== "manual") {
        const probe = { ...st, defense: { mode: "man", players: st.defense.players } };
        const f = buildTimeline(probe).frames[0];
        st.defense.players = st.defense.players.map(p => ({ id: p.id, x: Math.round(f.p["d" + p.id][0]), y: Math.round(f.p["d" + p.id][1]) }));
      }
      st.defense.mode = mode; touch(); render();
      status(mode === "none" ? "Defense hidden." : mode === "man" ? "Man-to-man: each defender guards the same-numbered offensive player and reacts as they move." : "Manual defense: drag defenders in Step 1 and draw their routes starting on them.");
    });
    $("courtBallHolder").addEventListener("change", e => {
      stopPB(); st.ball = Number(e.target.value); touch(); render(); status(`Player ${st.ball} starts with the ball.`);
    });

    document.querySelectorAll("#courtDesigner .court-kinds [data-kind]").forEach(b => b.addEventListener("click", () => {
      stopPB(); drawKind = b.dataset.kind; setDrawingMode(true);
      const hint = { cut: "Start on a player and click where they run.", dribble: "Start on the ball handler; the ball dribbles along.", pass: "Start on the ball handler, finish on the receiver.", screen: "Start on the screener and click where they set it.", shot: "Start on the ball handler. The ball goes to the basket." };
      status(`${KINDS[drawKind].label}: ${hint[drawKind]}`);
    }));

    $("courtStepPrev").addEventListener("click", () => { stopPB(); viewStep = Math.max(1, viewStep - 1); arrowStart = null; render(); status(`Step ${viewStep}.`); });
    $("courtStepNext").addEventListener("click", () => { stopPB(); viewStep = Math.min(st.steps, viewStep + 1); arrowStart = null; render(); status(`Step ${viewStep}.`); });
    $("courtStepAdd").addEventListener("click", () => {
      stopPB();
      if (st.steps >= MAX_STEPS) return;
      st.steps++; viewStep = st.steps; touch(); arrowStart = null; render();
      status(`Step ${viewStep} added. Players start where the last step ended.`);
    });
    $("courtStepDelete").addEventListener("click", () => {
      stopPB();
      if (st.steps <= 1) return;
      const has = st.arrows.some(a => a.step === viewStep);
      if (has && !window.confirm(`Delete step ${viewStep} and its routes?`)) return;
      st.arrows = st.arrows.filter(a => a.step !== viewStep);
      st.arrows.forEach(a => { if (a.step > viewStep) a.step--; });
      st.steps--; viewStep = Math.min(viewStep, st.steps); touch(); arrowStart = null; render();
      status("Step deleted.");
    });

    tl = buildTimeline(st);
    $("courtPlayback").innerHTML = playbackMarkup("");
    pb = makePlayback($("courtPlayback"), {
      timeline: () => tl,
      alive: () => !!document.getElementById("courtDesigner"),
      show(frame2, t) {
        const svg = $("basketballCourt");
        if (!svg) return;
        if (frame2 === null) { render(); return; }
        svg.classList.add("cp-playing");
        applyFrame(svg, tl.geom, frame2);
        void t;
      }
    });
  }

  /* initCourtDesigner mounts into #ipCourtArea when present (inside the play form),
     otherwise right after #playForm. A new editor always starts from a clean court. */
  window.initCourtDesigner = function () {
    const form = document.getElementById("playForm");
    if (!form) return;
    addStyles();
    if (pb) { pb.destroy(); pb = null; }
    const mount = document.getElementById("ipCourtArea");
    const existing = document.getElementById("courtDesigner");
    if (existing) existing.remove();
    resetState();

    if (mount) mount.insertAdjacentHTML("beforeend", editorMarkup());
    else form.insertAdjacentHTML("afterend", editorMarkup());
    initOnce();
    rebuildCourt();
  };

  window.getCourtDiagram = getDiagram;
  window.loadCourtDiagram = loadDiagram;

  /* Read-only picture of a saved diagram (cards, viewer fallback, dock). Returns an SVG string.
     Everything is coerced and whitelisted, so a saved diagram can never inject markup. */
  window.renderCourtPreview = function (diagram, options) {
    const opts = options || {};
    const s = normalize(diagram), t = buildTimeline(s), g = t.geom;
    const arrows = s.arrows.filter(a => !(a.p && a.p[0] === "d" && s.defense.mode !== "manual")).length;
    const label = `${opts.label || "Basketball court diagram"}. ${g.full ? "Full" : "Half"} court. ${arrows} movement ${arrows === 1 ? "arrow" : "arrows"}.`;
    return svgMarkup(s, t, t.frames[0], { uid: "cpv" + (++previewCounter), label, cls: "court-thumb", current: 0 });
  };

  /* Animated viewer. container: where the court goes. opts.controls: where the buttons go (optional).
     Plays without motion (nothing linked to a player) just show the picture, as before. */
  window.mountCourtPlayer = function (container, diagram, opts) {
    addStyles();
    opts = opts || {};
    const s = normalize(diagram), uid = "cv" + (++previewCounter);
    const t = buildTimeline(s), tl2 = t;
    const label = `${opts.label || "Basketball court diagram"}. ${t.geom.full ? "Full" : "Half"} court.`;
    container.innerHTML = svgMarkup(s, t, t.frames[0], { uid, label, cls: "court-thumb cp-svg", current: 0 });
    const svgNow = () => container.querySelector("svg");
    if (!t.hasMotion) return { destroy() {} };

    const host = opts.controls || (() => { const d = document.createElement("div"); container.after(d); return d; })();
    const designs = {};
    Object.entries(SKINS).forEach(([k, v]) => { (designs[v.group] = designs[v.group] || []).push(`<option value="${k}"${k === s.design ? " selected" : ""}>${esc(v.label)}</option>`); });
    const designSel = `<label>COURT DESIGN (viewing only)<select class="cp-design" aria-label="Court design for viewing">${Object.entries(designs).map(([n, o]) => `<optgroup label="${esc(n)}">${o.join("")}</optgroup>`).join("")}</select></label>`;
    host.innerHTML = playbackMarkup(designSel);
    let dead = false;
    const pbv = makePlayback(host, {
      timeline: () => tl2,
      alive: () => !dead && container.isConnected,
      show(fr) {
        const svg = svgNow();
        if (!svg) return;
        if (fr === null) {
          svg.classList.remove("cp-playing");
          paintLayers(svg, s, tl2, tl2.frames[0], { uid, current: 0 });
          return;
        }
        svg.classList.add("cp-playing");
        applyFrame(svg, tl2.geom, fr);
      }
    });
    host.querySelector(".cp-design").addEventListener("change", e => {
      if (!SKINS[e.target.value]) return;
      s.design = e.target.value;                       // display only; nothing is saved
      const was = pbv.playing, at = pbv.time;
      container.innerHTML = svgMarkup(s, tl2, tl2.frames[0], { uid, label, cls: "court-thumb cp-svg", current: 0 });
      if (was) { pbv.seek(at); pbv.play(); } else if (at > 0) pbv.seek(at);
    });
    return {
      destroy() { dead = true; pbv.destroy(); },
      player: pbv
    };
  };

  /* handles for automated tests */
  window.CourtDesigner = { RULES, SKINS, KINDS, normalize, serialize, buildTimeline, sample, viewGeom, getState: () => st };
})();
