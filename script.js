/* Starchild Vanguard Invite: Dynamic Maze + Trivia */

const $ = (id) => document.getElementById(id);

const SCREENS = {
  welcome: "screenWelcome",
  maze: "screenMaze",
  quiz: "screenQuiz",
  win: "screenWin",
};

const DIR = {
  N: 0,
  E: 1,
  S: 2,
  W: 3,
};

// bitmask walls (N=1, E=2, S=4, W=8) => 2D array as requested
const WALL = {
  N: 1,
  E: 2,
  S: 4,
  W: 8,
  ALL: 1 | 2 | 4 | 8,
};

const DISCORD_INVITE_CODE = "7KqduugrFQ";
const DISCORD_INVITE_URL = `https://discord.gg/${DISCORD_INVITE_CODE}`;

const THEME_LS_KEY = "sv_theme_v1";
const THEMES = {
  cyan: { primary: "#19d8f6", primary2: "#67ecff", primaryRgb: "25,216,246", primary2Rgb: "103,236,255", focus: "rgba(25,216,246,.35)" },
  purple: { primary: "#8b5cf6", primary2: "#c4b5fd", primaryRgb: "139,92,246", primary2Rgb: "196,181,253", focus: "rgba(139,92,246,.35)" },
  green: { primary: "#37f0b1", primary2: "#a7f3d0", primaryRgb: "55,240,177", primary2Rgb: "167,243,208", focus: "rgba(55,240,177,.30)" },
  amber: { primary: "#ffd26a", primary2: "#ffe7a3", primaryRgb: "255,210,106", primary2Rgb: "255,231,163", focus: "rgba(255,210,106,.30)" },
};

const els = {
  playAgainBtn: $("playAgainBtn"),

  startMazeBtn: $("startMazeBtn"),
  startQuizBtn: $("startQuizBtn"),

  canvas: $("mazeCanvas"),
  newMazeBtn: $("newMazeBtn"),
  homeFromMazeBtn: $("homeFromMazeBtn"),

  btnUp: $("btnUp"),
  btnDown: $("btnDown"),
  btnLeft: $("btnLeft"),
  btnRight: $("btnRight"),

  quizMeta: $("quizMeta"),
  quizQuestion: $("quizQuestion"),
  quizChoices: $("quizChoices"),
  quizNote: $("quizNote"),
  quizNextBtn: $("quizNextBtn"),
  homeFromQuizBtn: $("homeFromQuizBtn"),

  modal: $("modal"),
  modalTitle: $("modalTitle"),
  modalText: $("modalText"),
  modalPrimaryBtn: $("modalPrimaryBtn"),
};

const state = {
  screen: SCREENS.welcome,

  // Maze
  mazeGrid: [], // 2D array of wall bitmasks
  rows: 0,
  cols: 0,
  cell: 16,
  pad: { x: 16, y: 16 },
  player: { r: 0, c: 0, x: 0, y: 0, tx: 0, ty: 0, moving: false },
  exit: { r: 0, c: 0 },
  moves: 0,
  trail: [],
  touchStart: null,
  raf: 0,
  canvasPx: { w: 0, h: 0 },
  staticLayer: null,
  staticDirty: true,
  lastInputDir: null,
  inputHeld: false,
  inputBufferDir: null,
  inputBufferUntil: 0,
  lastTickTs: 0,

  // Quiz
  quizQueue: [],
  quizIndex: 0,
  quizScore: 0,
  quizPicked: null,
  quizLocked: false,
};

function showScreen(which) {
  state.screen = which;
  document.body.dataset.screen = which;
  for (const id of Object.values(SCREENS)) {
    const el = $(id);
    if (!el) continue;
    el.classList.toggle("screen--active", id === which);
  }
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getDpr() {
  // Cap DPR for performance on mobile (prevents huge canvases)
  return Math.min(window.devicePixelRatio || 1, 2);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function cssVar(name, fallback = "") {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function rgbaFromVar(varName, a) {
  const rgb = cssVar(varName, "25,216,246");
  return `rgba(${rgb},${a})`;
}

function openModal({ title, text, primary }, onPrimary) {
  els.modalTitle.textContent = title;
  els.modalText.textContent = text;
  els.modal.classList.add("modal--open");
  els.modal.setAttribute("aria-hidden", "false");
  document.body.dataset.modal = "open";

  const handler = () => {
    els.modalPrimaryBtn.removeEventListener("click", handler);
    closeModal();
    onPrimary?.();
  };
  els.modalPrimaryBtn.textContent = primary || "Continue";
  els.modalPrimaryBtn.addEventListener("click", handler);
}

function closeModal() {
  els.modal.classList.remove("modal--open");
  els.modal.setAttribute("aria-hidden", "true");
  delete document.body.dataset.modal;
}

// ---------------------------
// Maze generation (DFS backtracker)
// ---------------------------

function makeGrid(rows, cols, fill) {
  const g = new Array(rows);
  for (let r = 0; r < rows; r++) {
    g[r] = new Array(cols).fill(fill);
  }
  return g;
}

function carveMaze(rows, cols) {
  const grid = makeGrid(rows, cols, WALL.ALL);
  const visited = makeGrid(rows, cols, false);

  const stack = [];
  const start = { r: 0, c: 0 };
  visited[start.r][start.c] = true;
  stack.push(start);

  const deltas = [
    { d: DIR.N, dr: -1, dc: 0, a: WALL.N, b: WALL.S },
    { d: DIR.E, dr: 0, dc: 1, a: WALL.E, b: WALL.W },
    { d: DIR.S, dr: 1, dc: 0, a: WALL.S, b: WALL.N },
    { d: DIR.W, dr: 0, dc: -1, a: WALL.W, b: WALL.E },
  ];

  while (stack.length) {
    const cur = stack[stack.length - 1];
    const neighbors = [];

    for (const step of deltas) {
      const nr = cur.r + step.dr;
      const nc = cur.c + step.dc;
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
      if (visited[nr][nc]) continue;
      neighbors.push({ nr, nc, step });
    }

    if (!neighbors.length) {
      stack.pop();
      continue;
    }

    const pick = neighbors[Math.floor(Math.random() * neighbors.length)];
    const { nr, nc, step } = pick;

    grid[cur.r][cur.c] &= ~step.a;
    grid[nr][nc] &= ~step.b;

    visited[nr][nc] = true;
    stack.push({ r: nr, c: nc });
  }

  return grid;
}

function pickFarExit(rows, cols) {
  return { r: rows - 1, c: cols - 1 };
}

function computeCanvasMetrics() {
  const canvas = els.canvas;
  const rect = canvas.getBoundingClientRect();
  const dpr = getDpr();
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));

  // Ignore tiny size fluctuations (mobile URL bar / viewport micro-resizes)
  if (
    state.canvasPx.w &&
    state.canvasPx.h &&
    Math.abs(width - state.canvasPx.w) < Math.max(2, Math.round(2 * dpr)) &&
    Math.abs(height - state.canvasPx.h) < Math.max(2, Math.round(2 * dpr))
  ) {
    return;
  }

  canvas.width = width;
  canvas.height = height;
  state.canvasPx.w = width;
  state.canvasPx.h = height;
  state.staticDirty = true;

  const outerPad = Math.floor(14 * dpr);
  const cell = Math.floor(Math.min((width - outerPad * 2) / state.cols, (height - outerPad * 2) / state.rows));
  state.cell = clamp(cell, Math.floor(10 * dpr), Math.floor(28 * dpr));

  // Center the maze inside the canvas
  const mazeW = state.cols * state.cell;
  const mazeH = state.rows * state.cell;
  state.pad = {
    x: Math.floor((width - mazeW) / 2),
    y: Math.floor((height - mazeH) / 2),
  };
}

function rebuildStaticLayer() {
  if (!state.staticDirty) return;
  if (!state.rows || !state.cols) return;

  const main = els.canvas;
  const w = main.width;
  const h = main.height;
  if (!w || !h) return;

  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const ctx = off.getContext("2d");
  if (!ctx) return;

  const dpr = getDpr();
  const wall = clamp(Math.floor(2.4 * dpr), 2, 5);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = rgbaFromVar("--primary-rgb", 0.22);
  ctx.lineWidth = wall + 4;
  ctx.shadowBlur = 14 * dpr;
  ctx.shadowColor = rgbaFromVar("--primary-rgb", 0.18);
  strokeMazeWalls(ctx);
  ctx.restore();

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = rgbaFromVar("--primary2-rgb", 0.95);
  ctx.lineWidth = wall;
  ctx.shadowBlur = 0;
  strokeMazeWalls(ctx);
  ctx.restore();

  const ex = cellCenter(state.exit.r, state.exit.c);
  ctx.save();
  ctx.fillStyle = rgbaFromVar("--success-rgb", 0.16);
  ctx.strokeStyle = rgbaFromVar("--success-rgb", 0.55);
  ctx.lineWidth = 2 * dpr;
  ctx.beginPath();
  ctx.arc(ex.x, ex.y, state.cell * 0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  state.staticLayer = off;
  state.staticDirty = false;
}

function cellCenter(r, c) {
  const x = state.pad.x + c * state.cell + state.cell / 2;
  const y = state.pad.y + r * state.cell + state.cell / 2;
  return { x, y };
}

function startMaze({ difficulty = "hard" } = {}) {
  // mobile-first sizes (portrait): wider than tall is rare; keep it challenging
  const rows = difficulty === "hard" ? 23 : 17;
  const cols = difficulty === "hard" ? 15 : 13;

  state.rows = rows;
  state.cols = cols;
  state.mazeGrid = carveMaze(rows, cols);
  state.exit = pickFarExit(rows, cols);

  state.moves = 0;

  showScreen(SCREENS.maze);

  // Canvas size is 0 when the screen is hidden; measure after layout.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      computeCanvasMetrics();
      const p0 = cellCenter(0, 0);
      state.player = { r: 0, c: 0, x: p0.x, y: p0.y, tx: p0.x, ty: p0.y, moving: false };
      state.trail = [{ x: p0.x, y: p0.y, t: performance.now() }];
      state.staticDirty = true;
      rebuildStaticLayer();
      tick();
    });
  });
}

function canStep(r, c, dir) {
  const w = state.mazeGrid[r][c];
  if (dir === DIR.N) return (w & WALL.N) === 0;
  if (dir === DIR.E) return (w & WALL.E) === 0;
  if (dir === DIR.S) return (w & WALL.S) === 0;
  if (dir === DIR.W) return (w & WALL.W) === 0;
  return false;
}

function tryMove(dir) {
  if (state.screen !== SCREENS.maze) return;
  if (state.player.moving) {
    // Buffer the next direction briefly for smoother chaining.
    state.inputBufferDir = dir;
    state.inputBufferUntil = performance.now() + 180;
    return;
  }

  const { r, c } = state.player;
  if (!canStep(r, c, dir)) return;

  let nr = r;
  let nc = c;
  if (dir === DIR.N) nr--;
  if (dir === DIR.E) nc++;
  if (dir === DIR.S) nr++;
  if (dir === DIR.W) nc--;

  if (nr < 0 || nc < 0 || nr >= state.rows || nc >= state.cols) return;

  const to = cellCenter(nr, nc);
  state.player.tx = to.x;
  state.player.ty = to.y;
  state.player.moving = true;
  state.player.r = nr;
  state.player.c = nc;

  state.moves++;

  state.trail.push({ x: to.x, y: to.y, t: performance.now() });
  // Keep a long persistent trail, but cap for performance.
  if (state.trail.length > 2200) state.trail.splice(0, state.trail.length - 2200);

  if (nr === state.exit.r && nc === state.exit.c) {
    openModal(
      {
        title: "Completed.",
        text: "Screenshot the pass on the next screen to claim your stickers.",
        primary: "Show Pass",
      },
      () => showScreen(SCREENS.win),
    );
  }
}

function drawMaze() {
  const ctx = els.canvas.getContext("2d");
  if (!ctx) return;

  rebuildStaticLayer();
  ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
  if (state.staticLayer) ctx.drawImage(state.staticLayer, 0, 0);

  // trail
  drawTrail(ctx);

  // player
  drawPlayer(ctx);
}

function strokeMazeWalls(ctx) {
  const x0 = state.pad.x;
  const y0 = state.pad.y;
  const cell = state.cell;

  ctx.beginPath();
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const w = state.mazeGrid[r][c];
      const x = x0 + c * cell;
      const y = y0 + r * cell;
      if (w & WALL.N) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + cell, y);
      }
      if (w & WALL.W) {
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + cell);
      }
      // draw outer borders on last row/col via S/E walls
      if (r === state.rows - 1 && (w & WALL.S)) {
        ctx.moveTo(x, y + cell);
        ctx.lineTo(x + cell, y + cell);
      }
      if (c === state.cols - 1 && (w & WALL.E)) {
        ctx.moveTo(x + cell, y);
        ctx.lineTo(x + cell, y + cell);
      }
    }
  }
  ctx.stroke();
}

function drawTrail(ctx) {
  const dpr = getDpr();
  const count = state.trail.length;
  if (count < 2) return;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = rgbaFromVar("--primary-rgb", 0.35);
  ctx.lineWidth = clamp(Math.floor(2.2 * dpr), 2, 4);
  ctx.shadowBlur = 6 * dpr;
  ctx.shadowColor = rgbaFromVar("--primary-rgb", 0.18);
  ctx.beginPath();
  ctx.moveTo(state.trail[0].x, state.trail[0].y);
  for (let i = 1; i < state.trail.length; i++) {
    ctx.lineTo(state.trail[i].x, state.trail[i].y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawPlayer(ctx) {
  const dpr = getDpr();
  const r = state.cell * 0.22;

  ctx.save();
  // Black core + subtle white glow (no ring/outline)
  ctx.shadowBlur = 10 * dpr;
  ctx.shadowColor = "rgba(255,255,255,.55)";
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.arc(state.player.x, state.player.y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function tick() {
  cancelAnimationFrame(state.raf);
  let lastDraw = 0;
  const step = (ts) => {
    const now = performance.now();
    const t = ts ?? now;
    const prev = state.lastTickTs || t;
    const dt = clamp(t - prev, 0, 40); // ms
    state.lastTickTs = t;

    // smooth movement
    if (state.player.moving) {
      const dx = state.player.tx - state.player.x;
      const dy = state.player.ty - state.player.y;
      const dist = Math.hypot(dx, dy);
      // Time-based speed (px/sec) for consistent feel across devices.
      const pxPerSec = Math.max(220, state.cell * 14);
      const stepDist = (pxPerSec * dt) / 1000;

      if (dist <= stepDist) {
        state.player.x = state.player.tx;
        state.player.y = state.player.ty;
        state.player.moving = false;
      } else {
        state.player.x += (dx / dist) * stepDist;
        state.player.y += (dy / dist) * stepDist;
      }
    }

    // If a direction is held, keep stepping.
    if (!state.player.moving && state.inputHeld && state.lastInputDir != null) {
      tryMove(state.lastInputDir);
    }

    // Apply buffered direction as soon as we stop moving.
    if (!state.player.moving && state.inputBufferDir != null && now <= state.inputBufferUntil) {
      const d = state.inputBufferDir;
      state.inputBufferDir = null;
      tryMove(d);
    } else if (now > state.inputBufferUntil) {
      state.inputBufferDir = null;
    }

    // Draw at ~30fps, and go near-idle when nothing changes.
    const needsAnim = state.player.moving || state.inputHeld;
    if (state.screen === SCREENS.maze && (needsAnim || now - lastDraw > 250)) {
      // 60fps while moving, 30fps otherwise
      const targetFrame = state.player.moving ? 16 : 33;
      if (now - lastDraw > targetFrame) {
        drawMaze();
        lastDraw = now;
      }
    }
    state.raf = requestAnimationFrame(step);
  };
  state.raf = requestAnimationFrame(step);
}

function bindMazeControls() {
  const bind = (el, dir) => {
    const startHold = (ev) => {
      ev.preventDefault?.();
      state.inputHeld = true;
      state.lastInputDir = dir;
      tryMove(dir);
      if (typeof ev.pointerId === "number" && el.setPointerCapture) {
        try {
          el.setPointerCapture(ev.pointerId);
        } catch {
          // ignore
        }
      }
    };
    const stopHold = () => {
      state.inputHeld = false;
    };

    // Pointer events (best cross-device behavior)
    el.addEventListener("pointerdown", startHold, { passive: false });
    el.addEventListener("pointerup", stopHold, { passive: true });
    el.addEventListener("pointercancel", stopHold, { passive: true });
    el.addEventListener("pointerleave", stopHold, { passive: true });

    // Fallback for older browsers
    el.addEventListener("touchstart", startHold, { passive: false });
    el.addEventListener("touchend", stopHold, { passive: true });
    el.addEventListener("touchcancel", stopHold, { passive: true });
    el.addEventListener("mousedown", startHold);
    el.addEventListener("mouseup", stopHold);
  };
  bind(els.btnUp, DIR.N);
  bind(els.btnRight, DIR.E);
  bind(els.btnDown, DIR.S);
  bind(els.btnLeft, DIR.W);

  // Make sure we always stop when the finger/mouse is released anywhere.
  window.addEventListener("pointerup", () => (state.inputHeld = false), { passive: true });
  window.addEventListener("pointercancel", () => (state.inputHeld = false), { passive: true });
  window.addEventListener("touchend", () => (state.inputHeld = false), { passive: true });
  window.addEventListener("mouseup", () => (state.inputHeld = false), { passive: true });

  const area = document.querySelector(".maze-frame");
  if (!area) return;
  const minDist = 26;
  const maxOffAxis = 26;

  area.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      state.touchStart = { x: t.clientX, y: t.clientY };
    },
    { passive: true },
  );

  area.addEventListener(
    "touchend",
    (e) => {
      const s = state.touchStart;
      state.touchStart = null;
      if (!s) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);
      if (adx < minDist && ady < minDist) return;
      if (adx > ady) {
        if (ady > maxOffAxis) return;
        tryMove(dx > 0 ? DIR.E : DIR.W);
      } else {
        if (adx > maxOffAxis) return;
        tryMove(dy > 0 ? DIR.S : DIR.N);
      }
    },
    { passive: true },
  );
}

// ---------------------------
// Trivia bank (200+)
// Notes: short factual questions (no copyrighted quote dumps)
// ---------------------------

const TRIVIA_BANK = [
  { q: "In The Dark Knight, what is Batman’s city called?", c: ["Metropolis", "Gotham", "Atlantis", "Springfield"], a: 1 },
  { q: "Which film features the planet Pandora?", c: ["Avatar", "Dune", "Interstellar", "Blade Runner 2049"], a: 0 },
  { q: "Who directed Inception?", c: ["Denis Villeneuve", "Christopher Nolan", "James Cameron", "David Fincher"], a: 1 },
  { q: "In Titanic, what is the ship’s name?", c: ["Britannic", "Lusitania", "Titanic", "Queen Mary"], a: 2 },
  { q: "In The Matrix, what is Neo’s real name?", c: ["Thomas Anderson", "John Wick", "Peter Parker", "Ethan Hunt"], a: 0 },
  { q: "Which movie is set on the desert planet Arrakis?", c: ["Mad Max: Fury Road", "Dune", "Lawrence of Arabia", "Arrival"], a: 1 },
  { q: "In Interstellar, what is the name of the robot with a rectangular body?", c: ["TARS", "R2-D2", "WALL·E", "K-2SO"], a: 0 },
  { q: "Which film features the Infinity Gauntlet?", c: ["Avengers: Infinity War", "Guardians of the Galaxy", "Iron Man", "Thor"], a: 0 },
  { q: "Jack Sparrow is a character from which series?", c: ["Pirates of the Caribbean", "Star Trek", "Indiana Jones", "James Bond"], a: 0 },
  { q: "In Harry Potter, what is the school called?", c: ["Beauxbatons", "Hogwarts", "Durmstrang", "Ilvermorny"], a: 1 },

  // --- Bulk-generated set: popular-film focused, factual, 4-choice each ---
  { q:"In The Lord of the Rings, what is Frodo’s surname?", c:["Baggins","Brandybuck","Took","Gamgee"], a:0 },
  { q:"Which character says 'I am your father' in Star Wars?", c:["Obi-Wan Kenobi","Darth Vader","Yoda","Han Solo"], a:1 },
  { q:"In Avengers: Endgame, what time-travel device do they use?", c:["Tesseract","Quantum Tunnel","Time Stone only","DeLorean"], a:1 },
  { q:"Who directed Pulp Fiction?", c:["Quentin Tarantino","Martin Scorsese","Guy Ritchie","Paul Thomas Anderson"], a:0 },
  { q:"In Gladiator, what is Maximus’ role at the start?", c:["Senator","General","Merchant","Slave"], a:1 },
  { q:"In Jurassic Park, what kind of creature is the main threat in the finale?", c:["Velociraptors","Pterosaurs","Mosasaur","Triceratops"], a:0 },
  { q:"In Forrest Gump, what sport does Forrest receive a scholarship for?", c:["Football","Basketball","Baseball","Hockey"], a:0 },
  { q:"Which Pixar film features a rat who cooks in Paris?", c:["Up","Ratatouille","Toy Story","Coco"], a:1 },
  { q:"In Spider-Man: No Way Home, which villain is associated with mechanical tentacles?", c:["Green Goblin","Doctor Octopus","Sandman","Lizard"], a:1 },
  { q:"In The Godfather, the Corleone family business is mainly in…", c:["Shipping","Crime","Banking","Oil"], a:1 },

  // Keep adding to reach 200. (Compact, one-liners)
  { q:"In John Wick, what is John’s former profession?", c:["Detective","Hitman","Lawyer","Doctor"], a:1 },
  { q:"Which movie features the quote 'I'll be back'?", c:["Predator","The Terminator","RoboCop","Die Hard"], a:1 },
  { q:"In The Shawshank Redemption, what is Andy Dufresne’s job?", c:["Accountant","Banker","Doctor","Engineer"], a:1 },
  { q:"In Fight Club, what is NOT allowed to be discussed?", c:["Work","Money","Fight Club","Music"], a:2 },
  { q:"Which film is about dreams within dreams?", c:["Memento","Inception","Tenet","Insomnia"], a:1 },
  { q:"In The Silence of the Lambs, what is Hannibal Lecter’s title?", c:["Dr.","Sir","Captain","Professor"], a:0 },
  { q:"Which movie features the ship 'Black Pearl'?", c:["Pirates of the Caribbean","Master and Commander","Titanic","Moana"], a:0 },
  { q:"In The Avengers, which city hosts the final battle?", c:["New York","London","Sokovia","Wakanda"], a:0 },
  { q:"In Black Panther, what is the country called?", c:["Genosha","Wakanda","Latveria","Elbonia"], a:1 },
  { q:"In Doctor Strange, what is the sanctum located in New York called?", c:["Sanctum Sanctorum","Hall of Justice","Batcave","Citadel"], a:0 },
  { q:"In Iron Man, what powers the arc reactor?", c:["Vibranium","Palladium","Energy core","Kyber crystal"], a:2 },
  { q:"In Captain America: The First Avenger, what is Steve’s last name?", c:["Rogers","Barnes","Stark","Wilson"], a:0 },
  { q:"In Top Gun: Maverick, what is Maverick’s real name?", c:["Pete Mitchell","Nick Bradshaw","Tom Kazansky","Brad Simpson"], a:0 },
  { q:"In Mission: Impossible, what is Ethan Hunt’s job?", c:["Spy/agent","Chef","Teacher","Astronaut"], a:0 },
  { q:"In The Bourne Identity, what is Bourne’s first name?", c:["Jason","Jack","James","John"], a:0 },
  { q:"In The Hunger Games, what is the protagonist’s name?", c:["Katniss Everdeen","Tris Prior","Bella Swan","Rey"], a:0 },
  { q:"In Twilight, what is the vampire family’s surname?", c:["Cullen","Volturi","Swan","Black"], a:0 },
  { q:"The Revenant is mainly a story of…", c:["Survival and revenge","Space travel","A heist","Time loops"], a:0 },
  { q:"In Mad Max: Fury Road, what does Max wear on his face early on?", c:["Gas mask","Muzzle","Helmet","Bandana"], a:1 },
  { q:"In The Prestige, the rivalry is between two…", c:["Lawyers","Magicians","Boxers","Pilots"], a:1 },

  // --- Extra built-in pool (offline fallback): very easy, non-actor ---
  { q:"In Star Wars, what weapon do Jedi often use?", c:["Lightsaber","Magic wand","Laser pointer","Boomerang"], a:0 },
  { q:"In Star Wars, what color is Yoda’s skin?", c:["Green","Blue","Purple","Orange"], a:0 },
  { q:"In Frozen, what is the snowman’s name?", c:["Olaf","Sven","Kristoff","Hans"], a:0 },
  { q:"Which movie features a talking donkey named Donkey?", c:["Shrek","Cars","Coco","Moana"], a:0 },
  { q:"In Toy Story, what is the cowboy doll’s name?", c:["Woody","Buzz","Rex","Hamm"], a:0 },
  { q:"In Toy Story, what is the space ranger’s name?", c:["Buzz Lightyear","Luke Skywalker","Star-Lord","Flash Gordon"], a:0 },
  { q:"Which movie is about blue people called Na’vi?", c:["Avatar","Aladdin","Up","Jaws"], a:0 },
  { q:"In Finding Nemo, what kind of fish is Nemo?", c:["Clownfish","Shark","Goldfish","Tuna"], a:0 },
  { q:"In The Lion King, who is Simba’s father?", c:["Mufasa","Scar","Timon","Zazu"], a:0 },
  { q:"In The Lion King, who is the villain?", c:["Scar","Mufasa","Rafiki","Nala"], a:0 },
  { q:"In Aladdin, what kind of creature is Genie?", c:["Genie","Dragon","Goblin","Robot"], a:0 },
  { q:"In Moana, what is Moana’s friend chicken called?", c:["Heihei","Pua","Maui","Kakamora"], a:0 },
  { q:"In Monsters, Inc., what is the little girl’s nickname?", c:["Boo","Lulu","Mimi","Jojo"], a:0 },
  { q:"In Up, what are the balloons attached to?", c:["A house","A car","A boat","A train"], a:0 },
  { q:"In Cars, what kind of vehicle is Lightning McQueen?", c:["Race car","Truck","Motorcycle","Plane"], a:0 },
  { q:"In Coco, the story focuses on which theme?", c:["Family","Aliens","Pirates","Robots"], a:0 },
  { q:"In Inside Out, which emotion is blue?", c:["Sadness","Anger","Joy","Disgust"], a:0 },
  { q:"In The Incredibles, the family are…", c:["Superheroes","Pirates","Detectives","Wizards"], a:0 },
  { q:"In Spider-Man, Spider-Man shoots…", c:["Webs","Fire","Ice","Water"], a:0 },
  { q:"In Batman, Batman is also known as the…", c:["Dark Knight","Fast Runner","Sky Captain","Metal Man"], a:0 },
  { q:"In Superman, what is Superman’s home planet?", c:["Krypton","Pandora","Arrakis","Vulcan"], a:0 },
  { q:"In The Avengers, what team are they?", c:["Superheroes","Dinosaurs","Robots","Vampires"], a:0 },
  { q:"In Doctor Strange, what kind of power does he use?", c:["Magic","Only swords","Only guns","Only cooking"], a:0 },
  { q:"In Thor, Thor’s weapon is usually a…", c:["Hammer","Bow","Shield","Whip"], a:0 },
  { q:"In Captain America, his famous item is a…", c:["Shield","Crown","Ring","Wand"], a:0 },
  { q:"In Black Panther, the setting is mostly in…", c:["Wakanda","Gotham","Hogwarts","Narnia"], a:0 },
  { q:"In Iron Man, Iron Man wears a…", c:["Suit of armor","Cape","Wizard robe","Spacesuit only"], a:0 },
  { q:"In Guardians of the Galaxy, they travel in…", c:["A spaceship","A submarine","A train","A bicycle"], a:0 },
  { q:"In Harry Potter, what is the sport played on broomsticks?", c:["Quidditch","Soccer","Chess","Baseball"], a:0 },
  { q:"In Harry Potter, what is the magic wand used for?", c:["Casting spells","Cooking pasta","Fixing cars","Playing music"], a:0 },
  { q:"In The Lord of the Rings, the journey is to destroy a…", c:["Ring","Sword","Crown","Map"], a:0 },
  { q:"In The Lord of the Rings, where is the ring taken to be destroyed?", c:["Mount Doom","Hogwarts","Pandora","Atlantis"], a:0 },
  { q:"In The Hobbit, the creature says 'my precious' is a…", c:["Gollum","Smaug","Gandalf","Legolas"], a:0 },
  { q:"In Jurassic Park, what animals return to life?", c:["Dinosaurs","Dragons","Wolves","Whales"], a:0 },
  { q:"In Jaws, what animal is the threat?", c:["Shark","Lion","Bear","Crocodile"], a:0 },
  { q:"In King Kong, King Kong is a…", c:["Giant gorilla","Dragon","Robot","Alien"], a:0 },
  { q:"In Godzilla movies, Godzilla is a…", c:["Giant monster","Wizard","Detective","Pirate"], a:0 },
  { q:"In The Terminator, the Terminator is a…", c:["Robot","Wizard","Vampire","Clown"], a:0 },
  { q:"In Back to the Future, the main vehicle is a…", c:["DeLorean","Motorbike","Boat","Helicopter"], a:0 },
  { q:"In E.T., E.T. is a…", c:["Alien","Dinosaur","Robot","Ghost"], a:0 },
  { q:"In Home Alone, the main character is left…", c:["Home alone","On the moon","In a jungle","In a submarine"], a:0 },
  { q:"In The Wizard of Oz, what color is the famous road?", c:["Yellow","Red","Blue","Green"], a:0 },
  { q:"In The Sound of Music, the story involves…", c:["Singing","Time travel","Space battles","Zombies"], a:0 },
  { q:"In The Great Gatsby, the setting is mainly the…", c:["1920s","Future","Medieval era","Stone Age"], a:0 },
  { q:"In The Hunger Games, the event is a…", c:["Competition","Wedding","Concert","Space mission"], a:0 },
  { q:"In The Matrix, what is the Matrix?", c:["A simulated world","A ship","A school","A treasure"], a:0 },
  { q:"In Interstellar, the story is about…", c:["Space travel","Cooking","Football","Painting"], a:0 },
  { q:"In Inception, the story involves…", c:["Dreams","Dinosaurs","Pirates","Aliens only"], a:0 },
  { q:"In Gladiator, the setting is ancient…", c:["Rome","Japan","Brazil","Australia"], a:0 },
  { q:"In Pirates of the Caribbean, the main theme is…", c:["Pirates","Baseball","Chess","Robots"], a:0 },
  { q:"In James Bond films, Bond is a…", c:["Spy","Astronaut","Chef","Vampire hunter"], a:0 },
  { q:"In Indiana Jones, Indy is an…", c:["Archaeologist","Alien","Wizard","Race car driver"], a:0 },
  { q:"In Transformers, the characters can…", c:["Transform","Teleport only","Fly only","Swim only"], a:0 },
  { q:"In The Little Mermaid, the main character is a…", c:["Mermaid","Witch","Robot","Dinosaur"], a:0 },
  { q:"In Beauty and the Beast, the Beast lives in a…", c:["Castle","Cave","Spaceship","Hotel"], a:0 },
  { q:"In Cinderella, the famous item is a…", c:["Glass slipper","Golden sword","Magic ring","Robot arm"], a:0 },
  { q:"In Snow White, there are… dwarfs.", c:["Seven","Five","Ten","Twelve"], a:0 },
  { q:"In Sleeping Beauty, the princess is put to sleep by a…", c:["Curse","Robot","Car crash","Spaceship"], a:0 },
  { q:"In The Princess Bride, the story is a…", c:["Fairy tale adventure","Space war","Sports documentary","Horror"], a:0 },
  { q:"In The Notebook, the genre is mainly…", c:["Romance","Sci‑fi","Horror","Western"], a:0 },
  { q:"In The Conjuring, the genre is…", c:["Horror","Comedy","Musical","Sports"], a:0 },
  { q:"In The Shining, the setting is a…", c:["Hotel","School","Spaceship","Farm"], a:0 },
  { q:"In The Exorcist, the theme involves…", c:["Possession","Time travel","Aliens","Robots"], a:0 },
  { q:"In The Notebook, the story is about…", c:["A couple","Dinosaurs","Robots","Pirates"], a:0 },
  { q:"In The Social Network, the story is about…", c:["A social media site","A magic school","A pirate ship","A space station"], a:0 },
  { q:"In The Martian, the setting is…", c:["Mars","Venus","The Moon","Earth’s ocean"], a:0 },
  { q:"In Gravity, the setting is…", c:["Space","Underwater","Desert","A castle"], a:0 },
  { q:"In The Fast and the Furious, the focus is…", c:["Cars/racing","Wizards","Dinosaurs","Aliens"], a:0 },
  { q:"In Rocky, the main sport is…", c:["Boxing","Tennis","Golf","Swimming"], a:0 },
  { q:"In The Karate Kid, the sport is…", c:["Karate","Soccer","Basketball","Cycling"], a:0 },
  { q:"In The Notebook, the famous item is…", c:["A notebook","A lightsaber","A shield","A ring"], a:0 },

  // Keep expanding the offline pool with similar “everyone knows” items as needed.
];

let triviaCache = [];
let triviaToken = null;
let triviaWarmupStarted = false;
const TRIVIA_USED_LS_KEY = "sv_trivia_used_v1";
const TRIVIA_USED_MAX = 5000;

function safeJsonParse(s, fallback) {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

function triviaId(item) {
  // stable-enough ID without a crypto dependency
  return [item.q, ...item.c].join("|").toLowerCase();
}

function loadUsedTriviaSet() {
  const arr = safeJsonParse(localStorage.getItem(TRIVIA_USED_LS_KEY) || "[]", []);
  return new Set(Array.isArray(arr) ? arr : []);
}

function saveUsedTriviaSet(set) {
  const arr = [...set];
  if (arr.length > TRIVIA_USED_MAX) arr.splice(0, arr.length - TRIVIA_USED_MAX);
  localStorage.setItem(TRIVIA_USED_LS_KEY, JSON.stringify(arr));
}

function decodeHtml(str) {
  const el = document.createElement("textarea");
  el.innerHTML = str;
  return el.value;
}

async function getTriviaToken() {
  if (triviaToken) return triviaToken;
  try {
    const r = await fetch("https://opentdb.com/api_token.php?command=request");
    const j = await r.json();
    if (j?.response_code === 0 && j?.token) {
      triviaToken = j.token;
      return triviaToken;
    }
  } catch {
    // ignore
  }
  return null;
}

function normalizeOpenTdbItem(it) {
  const correct = decodeHtml(it.correct_answer);
  const incorrect = it.incorrect_answers.map(decodeHtml);
  const choices = shuffle([correct, ...incorrect]);
  const q = decodeHtml(it.question);
  return {
    q,
    c: choices,
    a: choices.indexOf(correct),
  };
}

function looksTooHard(q) {
  const s = q.toLowerCase();
  if (q.length > 95) return true;
  if (/\b(episode|director|composer|screenplay|released|year|academy|oscar|box office|budget)\b/i.test(q)) return true;
  if (/\b(roman numeral|imdb)\b/i.test(q)) return true;
  // Actor / voice / cast questions are often too niche; avoid them.
  if (/\b(actor|actress|cast|portray|played by|who plays|who played|voiced|voice actor)\b/i.test(q)) return true;
  // prefer simple “Which film / character / actor” style
  const ok = /\b(which|who|what)\b/i.test(q);
  return !ok;
}

async function topUpTriviaCache(target = 800) {
  if (triviaCache.length >= target) return;
  const token = await getTriviaToken();

  while (triviaCache.length < target) {
    const amount = Math.min(50, target - triviaCache.length);
    const url =
      "https://opentdb.com/api.php" +
      `?amount=${amount}&category=11&difficulty=easy&type=multiple` +
      (token ? `&token=${encodeURIComponent(token)}` : "");

    try {
      const r = await fetch(url);
      const j = await r.json();
      if (j?.response_code !== 0 || !Array.isArray(j?.results)) break;
      const used = loadUsedTriviaSet();
      const normalized = j.results
        .map(normalizeOpenTdbItem)
        .filter((x) => !looksTooHard(x.q))
        .filter((x) => !used.has(triviaId(x)));
      triviaCache.push(...normalized);
    } catch {
      break;
    }

    // pacing (avoid hammering)
    await new Promise((res) => setTimeout(res, 1200));
  }
}

function startQuiz() {
  if (!triviaWarmupStarted) {
    triviaWarmupStarted = true;
    topUpTriviaCache(800);
  }

  const used = loadUsedTriviaSet();
  const pool = triviaCache.length >= 30 ? triviaCache : TRIVIA_BANK;
  const picked = [];

  // Pick 10 unique questions, removing them from the active pool immediately.
  // This prevents repeats within the same session.
  const candidates = shuffle([...pool]);
  for (const item of candidates) {
    const id = triviaId(item);
    if (used.has(id)) continue;
    picked.push(item);
    used.add(id);
    if (picked.length >= 10) break;
  }

  // Persist used IDs (avoid repeats across sessions).
  saveUsedTriviaSet(used);

  // Remove picked questions from the in-memory cache right now.
  if (pool === triviaCache) {
    const pickedIds = new Set(picked.map(triviaId));
    triviaCache = triviaCache.filter((x) => !pickedIds.has(triviaId(x)));
    // Keep the cache topped up in the background.
    topUpTriviaCache(800);
  }

  state.quizQueue = picked.length ? picked : shuffle([...TRIVIA_BANK]).slice(0, 10);
  state.quizIndex = 0;
  state.quizScore = 0;
  state.quizPicked = null;
  state.quizLocked = false;
  showScreen(SCREENS.quiz);
  renderQuiz();
}

function renderQuiz() {
  const item = state.quizQueue[state.quizIndex];
  els.quizMeta.textContent = `${state.quizIndex + 1}/10`;
  els.quizQuestion.textContent = item.q;
  els.quizChoices.innerHTML = "";
  els.quizNextBtn.disabled = true;
  els.quizNote.textContent = "Pick one answer.";
  state.quizPicked = null;
  state.quizLocked = false;

  item.c.forEach((label, idx) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "choice";
    b.textContent = label;
    b.addEventListener("click", () => pickQuiz(idx));
    els.quizChoices.appendChild(b);
  });
}

function pickQuiz(idx) {
  if (state.quizLocked) return;
  state.quizPicked = idx;
  els.quizNextBtn.disabled = false;
  [...els.quizChoices.children].forEach((el, i) => {
    el.classList.toggle("choice--selected", i === idx);
  });
}

function submitQuiz() {
  const item = state.quizQueue[state.quizIndex];
  const picked = state.quizPicked;
  if (picked == null) return;
  state.quizLocked = true;

  const kids = [...els.quizChoices.children];
  kids.forEach((el, i) => {
    el.classList.remove("choice--selected");
    if (i === item.a) el.classList.add("choice--correct");
    else if (i === picked) el.classList.add("choice--wrong");
  });

  const ok = picked === item.a;
  if (ok) state.quizScore++;
  els.quizNote.textContent = ok ? "Correct." : `Wrong. Correct answer: ${item.c[item.a]}`;

  els.quizNextBtn.textContent = state.quizIndex === 9 ? "Finish" : "Next";
}

function nextQuiz() {
  if (!state.quizLocked) {
    submitQuiz();
    return;
  }

  if (state.quizIndex === 9) {
    if (state.quizScore >= 5) {
      openModal(
        {
          title: "Nice!",
          text: `Score: ${state.quizScore}/10. That counts — here’s your pass.`,
          primary: "Show Pass",
        },
        () => showScreen(SCREENS.win),
      );
    } else {
      openModal(
        {
          title: "Almost.",
          text: `Score: ${state.quizScore}/10. Get 5/10 or more to earn the pass.`,
          primary: "Try Again",
        },
        () => startQuiz(),
      );
    }
    return;
  }

  state.quizIndex++;
  renderQuiz();
}

function bindUI() {
  els.playAgainBtn.addEventListener("click", () => showScreen(SCREENS.welcome));
  els.startMazeBtn.addEventListener("click", () => startMaze({ difficulty: "hard" }));
  els.startQuizBtn.addEventListener("click", startQuiz);
  els.newMazeBtn.addEventListener("click", () => startMaze({ difficulty: "hard" }));
  els.quizNextBtn.addEventListener("click", nextQuiz);
  els.homeFromMazeBtn.addEventListener("click", () => showScreen(SCREENS.welcome));
  els.homeFromQuizBtn.addEventListener("click", () => showScreen(SCREENS.welcome));

  els.modal.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset.close === "1") closeModal();
  });
}

let resizeRaf = 0;
let resizeT = 0;
function onResize() {
  if (state.screen !== SCREENS.maze) return;
  cancelAnimationFrame(resizeRaf);
  clearTimeout(resizeT);

  // Let the viewport settle a bit (especially on mobile)
  resizeT = setTimeout(() => {
    resizeRaf = requestAnimationFrame(() => {
      const beforeW = state.canvasPx.w;
      const beforeH = state.canvasPx.h;
      computeCanvasMetrics();
      if (state.canvasPx.w !== beforeW || state.canvasPx.h !== beforeH) {
        rebuildStaticLayer();
        const center = cellCenter(state.player.r, state.player.c);
        state.player.x = center.x;
        state.player.y = center.y;
        state.player.tx = center.x;
        state.player.ty = center.y;
      }
    });
  }, 120);
}

function boot() {
  showScreen(SCREENS.welcome);
  bindUI();
  bindMazeControls();
  window.addEventListener("resize", onResize);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", onResize);
  }

  // Warm trivia quietly (web-backed), but never block UI
  triviaWarmupStarted = true;
  topUpTriviaCache(200);

  // Theme picker
  const saved = localStorage.getItem(THEME_LS_KEY) || "cyan";
  applyTheme(saved in THEMES ? saved : "cyan");
  bindThemePicker();
}

boot();

function applyTheme(name) {
  const theme = THEMES[name] || THEMES.cyan;
  const root = document.documentElement;
  root.style.setProperty("--primary-color", theme.primary);
  root.style.setProperty("--primary-2", theme.primary2);
  root.style.setProperty("--primary-rgb", theme.primaryRgb);
  root.style.setProperty("--primary2-rgb", theme.primary2Rgb);
  root.style.setProperty("--focus-ring", theme.focus);
  localStorage.setItem(THEME_LS_KEY, name);

  document.querySelectorAll(".swatch").forEach((b) => {
    if (!(b instanceof HTMLButtonElement)) return;
    b.setAttribute("aria-pressed", b.dataset.theme === name ? "true" : "false");
  });

  // Force maze to rebuild with new colors
  state.staticDirty = true;
  rebuildStaticLayer();
}

function bindThemePicker() {
  const bar = document.getElementById("themebar");
  if (!bar) return;
  bar.querySelectorAll(".swatch").forEach((btn) => {
    if (!(btn instanceof HTMLButtonElement)) return;
    btn.addEventListener("click", () => {
      const t = btn.dataset.theme;
      if (!t) return;
      applyTheme(t);
    });
  });
}

