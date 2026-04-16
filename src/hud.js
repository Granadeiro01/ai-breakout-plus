/* ============================================================
 * hud.js
 * ------------------------------------------------------------
 * The "numbers on the side". Keeps the non-canvas parts of the
 * screen up to date: the score/lives/level panel on the right,
 * the vision diagnostics on the left, and the READY/DETECTED/
 * BLINK! badge on top of the webcam preview.
 *
 * It also owns the overlay element on top of the canvas — that's
 * where calibration instructions, pause screens, game-over form
 * and leaderboard list are rendered as plain HTML.
 * ========================================================== */

import { game, input } from './state.js';

// Tiny shortcut: look up an element by its id attribute.
const el = (id) => document.getElementById(id);

// Cached references to DOM elements. We look them up once on boot
// (bindHud) instead of every frame, which is much faster.
const nodes = {
  face: null, headx: null, blink: null, vfps: null,
  score: null, lives: null, level: null,
  badge: null, overlay: null,
};

/** Call once at startup after the DOM is ready. */
export function bindHud() {
  nodes.face    = el('meta-face');
  nodes.headx   = el('meta-headx');
  nodes.blink   = el('meta-blink');
  nodes.vfps    = el('meta-vfps');
  nodes.score   = el('hud-score');
  nodes.lives   = el('hud-lives');
  nodes.level   = el('hud-level');
  nodes.badge   = el('preview-badge');
  nodes.overlay = el('overlay');
}

// Timestamp (ms) until which we keep showing the "BLINK!" badge.
let blinkFlashUntil = 0;

/** Called every animation frame from main.js. */
export function updateHud() {
  if (!nodes.face) return; // bindHud hasn't run yet

  // Left panel — vision diagnostics.
  nodes.face.textContent  = input.faceDetected ? 'OK' : 'lost';
  nodes.headx.textContent = input.headX.toFixed(2);
  nodes.blink.textContent = input.blinkValue.toFixed(2);
  nodes.vfps.textContent  = input.visionFps.toFixed(0);

  // Right panel — game stats.
  nodes.score.textContent = game.score;
  nodes.lives.textContent = game.lives;
  nodes.level.textContent = game.level;

  // Webcam badge cycles through four states.
  const now = performance.now();
  let badge = 'idle';
  if (!input.initialized)             badge = 'idle';
  else if (!input.faceDetected)       badge = 'lost';
  else if (now < blinkFlashUntil)     badge = 'blink';
  else if (input.blinkActive)         badge = 'detected';
  else                                badge = 'ready';

  // Only touch the DOM if the badge actually changed — saves redraws.
  if (nodes.badge.dataset.status !== badge) {
    nodes.badge.dataset.status = badge;
    nodes.badge.textContent = badge.toUpperCase();
  }
}

/** Briefly flash the "BLINK!" badge. Called on detected blinks. */
export function flashBlink() {
  blinkFlashUntil = performance.now() + 140;
}

/** Replace the overlay content (HTML). Pass '' to clear. */
export function setOverlay(html) {
  nodes.overlay.innerHTML = html || '';
}
