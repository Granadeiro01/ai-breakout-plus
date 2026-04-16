/* ============================================================
 * main.js
 * ------------------------------------------------------------
 * The "conductor". Starts everything up in the right order and
 * runs the main per-frame game loop.
 *
 * Boot sequence:
 *   1. Grab references to the canvas and <video> elements.
 *   2. Wire up keyboard input.
 *   3. Ask the vision module to load the face-tracking model.
 *   4. Run calibration (or skip if one is cached).
 *   5. Start the game.
 *
 * Every frame after that:
 *   updatePaddle → updateGame → render → updateHud
 * (vision.js runs on its own parallel frame loop; we just read
 *  its results.)
 * ========================================================== */

import { CONFIG } from './config.js';
import { game, input, PHASE } from './state.js';
import { initVision, startVision } from './vision.js';
import { loadCalib, runCalibration, clearCalib } from './calibration.js';
import { newGame, updateGame, updatePaddle, onBlink } from './game.js';
import { render } from './render.js';
import { bindHud, updateHud, flashBlink, setOverlay } from './hud.js';
import { showLeaderboardForm } from './leaderboard.js';

// DOM references. Looked up once because they never change.
const canvas = document.getElementById('game');
const ctx    = canvas.getContext('2d', { alpha: false });
const video  = document.getElementById('webcam');

// Current state of the arrow keys. Updated by the key handlers.
const kb = { left: false, right: false };

// ── Keyboard input ──────────────────────────────────────────────

/** Is the user currently typing into a form field? If so, ignore game keys. */
function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}

function setupInput() {
  window.addEventListener('keydown', (e) => {
    // Don't hijack keys when the user is typing their name.
    if (isTypingTarget(e.target)) return;
    if (e.key === 'ArrowLeft')  kb.left  = true;
    if (e.key === 'ArrowRight') kb.right = true;
    if (e.code === 'Space') {
      e.preventDefault();               // don't scroll the page
      onBlink(performance.now());       // Space = fake blink
      flashBlink();
    }
    if (e.key === 'p' || e.key === 'P') togglePause();
    if (e.key === 'd' || e.key === 'D') game.debug = !game.debug;
    if (e.key === 'r' || e.key === 'R') recalibrate();
  });
  window.addEventListener('keyup', (e) => {
    if (isTypingTarget(e.target)) return;
    if (e.key === 'ArrowLeft')  kb.left  = false;
    if (e.key === 'ArrowRight') kb.right = false;
  });
  // Auto-pause if the player switches tabs.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.phase === PHASE.PLAYING) togglePause();
  });
}

// ── High-level actions ──────────────────────────────────────────

function togglePause() {
  if (game.phase === PHASE.PLAYING) {
    game.phase = PHASE.PAUSED;
    setOverlay(`<div class="card"><h1>Paused</h1><p>Press P to resume.</p></div>`);
  } else if (game.phase === PHASE.PAUSED) {
    game.phase = PHASE.PLAYING;
    setOverlay('');
  }
}

async function recalibrate() {
  // Don't allow recalibration mid-game — it would strand the ball.
  if (game.phase === PHASE.PLAYING || game.phase === PHASE.CALIBRATE) return;
  clearCalib();
  game.phase = PHASE.CALIBRATE;
  await runCalibration(setOverlay);
  setOverlay('');
  newGame();
}

// ── Difficulty picker ──────────────────────────────────────────
//
// Shown at boot (before the first game) and whenever the player
// starts a new match. Blocks until the player clicks one of the
// three cards. Writes the choice into game.difficulty so that
// newGame() and makeBall() pick up the right paddleW / lives /
// ball speed.

function difficultyHtml() {
  const d = CONFIG.difficulty;
  const card = (key, title, sub) => `
    <button type="button" class="diff-card" data-diff="${key}">
      <h2>${title}</h2>
      <p class="diff-sub">${sub}</p>
      <ul class="diff-stats">
        <li><span>Paddle</span><b>${d[key].paddleW}px</b></li>
        <li><span>Lives</span><b>${d[key].lives}</b></li>
        <li><span>Ball speed</span><b>${d[key].speedBase}</b></li>
      </ul>
    </button>`;
  return `
    <div class="card diff-card-wrap">
      <h1>Choose difficulty</h1>
      <p class="diff-hint">You can change this next game.</p>
      <div class="diff-grid">
        ${card('easy',   'Easy',   'Wider paddle, slower ball, 5 lives.')}
        ${card('medium', 'Medium', 'Balanced — recommended.')}
        ${card('hard',   'Hard',   'Narrow paddle, fast ball, 2 lives.')}
      </div>
    </div>`;
}

function chooseDifficulty() {
  return new Promise((resolve) => {
    setOverlay(difficultyHtml());
    const overlayEl = document.getElementById('overlay');
    overlayEl.querySelectorAll('.diff-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pick = btn.dataset.diff;
        if (CONFIG.difficulty[pick]) {
          game.difficulty = pick;
          setOverlay('');
          resolve(pick);
        }
      });
    });
  });
}

function showError(html) {
  setOverlay(`<div class="card error">${html}</div>`);
}

/**
 * The camera APIs only work on a "secure context" (https or localhost).
 * Opening index.html directly (file://) fails, so we show a clear
 * message telling the user how to serve it.
 */
function secureContextOk() {
  return window.isSecureContext ||
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1';
}

// ── Boot ────────────────────────────────────────────────────────

async function boot() {
  bindHud();
  setupInput();
  setOverlay(`<div class="card"><h1>Loading vision…</h1><p>Preparing face tracking model.</p></div>`);

  if (!secureContextOk()) {
    showError(`
      <h1>Cannot access camera</h1>
      <p>Camera APIs require a secure context. Open this page via a local server:</p>
      <p><code>python3 -m http.server 8000</code></p>
      <p>then browse to <code>http://localhost:8000</code>.</p>`);
    return;
  }

  try {
    await initVision(video);
  } catch (e) {
    // Camera failed (denied permission, no device, etc.). We still let
    // the player use the keyboard fallback rather than hard-fail.
    showError(`
      <h1>Camera unavailable</h1>
      <p>${e?.message ?? e}</p>
      <p>Check browser permissions, then reload. Keyboard fallback still works.</p>`);
    await chooseDifficulty();
    newGame();
    startGameLoop();
    return;
  }

  startVision();

  // Reuse a saved calibration if the player has one, else run the wizard.
  const existing = loadCalib();
  if (existing) {
    setOverlay(`<div class="card"><h1>Welcome back</h1><p>Using saved calibration. Press <kbd>R</kbd> to redo.</p></div>`);
    await new Promise((r) => setTimeout(r, 900));
  } else {
    game.phase = PHASE.CALIBRATE;
    await runCalibration(setOverlay);
  }
  setOverlay('');
  await chooseDifficulty();
  newGame();
  startGameLoop();
}

// ── The game loop ───────────────────────────────────────────────

/** Called by the leaderboard screen's "Play again" button. */
async function onPlayAgain() {
  setOverlay('');
  await chooseDifficulty();
  newGame();
}

function startGameLoop() {
  let lastTs = performance.now();
  let fpsEma = 0;
  let prevBlinkActive = false;
  let prevPhase = game.phase;
  const overlayEl = document.getElementById('overlay');

  function frame(ts) {
    // dt = seconds since last frame. Used so physics speed doesn't
    // depend on how fast the player's machine draws.
    let dt = (ts - lastTs) / 1000;
    lastTs = ts;
    // If the tab was hidden, dt could be huge — clamp so the ball
    // doesn't teleport across the screen on resume.
    if (dt > 1 / 30) dt = 1 / 30;

    // Flash the HUD badge on the rising edge of a blink BEFORE
    // updateGame consumes input.blinkEdge.
    if (input.blinkActive && !prevBlinkActive) flashBlink();
    prevBlinkActive = input.blinkActive;

    // Drive the paddle: keyboard wins if pressed, otherwise head-x.
    const kbDir = (kb.left ? -1 : 0) + (kb.right ? 1 : 0);
    updatePaddle(dt, kbDir);
    updateGame(dt);

    // When we just entered the leaderboard phase, show the form.
    // We detect the transition rather than re-rendering every frame.
    if (prevPhase !== PHASE.LEADERBOARD && game.phase === PHASE.LEADERBOARD) {
      showLeaderboardForm(overlayEl, { onPlayAgain });
    }
    prevPhase = game.phase;

    render(ctx);
    updateHud();

    // Track game FPS for the debug overlay.
    const fps = dt > 0 ? 1 / dt : 0;
    fpsEma = fpsEma === 0 ? fps : fpsEma * 0.9 + fps * 0.1;
    game.gameFps = fpsEma;

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

boot();
