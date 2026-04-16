/* ============================================================
 * calibration.js
 * ------------------------------------------------------------
 * The five-step "learn about the player" wizard that runs before
 * the first game starts.
 *
 * Every face is different: seating distance, eye shape, lighting,
 * whether the player wears glasses. Instead of assuming one set of
 * numbers works for everyone, we measure the player once and save
 * the result. This module runs that measurement.
 *
 * Steps:
 *   1. Wait for a face to appear on camera.
 *   2. "Look straight ahead" → record the centre head position.
 *   3. "Turn LEFT"           → record how far left they go.
 *   4. "Turn RIGHT"          → record how far right they go.
 *   5. "Relax with eyes open" → record the natural eyeBlink score,
 *      then pick a threshold slightly above it. That way real
 *      blinks will clear the bar but natural breathing won't.
 *
 * The result is saved to localStorage under "breakout-plus-calib"
 * so the player doesn't have to redo it on every reload. Press R
 * in-game to clear it and run calibration again.
 * ========================================================== */

import { CONFIG } from './config.js';
import { input } from './state.js';
import { setCalibration } from './vision.js';

const STORAGE_KEY = 'breakout-plus-calib';

// ── Storage helpers ──────────────────────────────────────────────

/** Try to read a saved calibration. Returns null if nothing valid is found. */
export function loadCalib() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (typeof c?.neutralX !== 'number') return null;
    setCalibration(c);
    return c;
  } catch {
    return null;
  }
}

/** Forget the saved calibration (used when the player presses R). */
export function clearCalib() {
  localStorage.removeItem(STORAGE_KEY);
}

/** Write calibration to storage AND tell vision.js about it. */
function saveCalib(c) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  setCalibration(c);
}

// ── Small utility helpers ────────────────────────────────────────

/** Pause for `ms` milliseconds without blocking the page. */
function waitMs(ms) { return new Promise((r) => setTimeout(r, ms)); }

/**
 * Collect samples from the vision data for `durationMs`. Calls the
 * `picker` function ~30 times per second and returns all the values.
 */
async function collectSamples(durationMs, picker) {
  const start = performance.now();
  const vals = [];
  while (performance.now() - start < durationMs) {
    vals.push(picker());
    await waitMs(30);
  }
  return vals;
}

/** Show a big title + message on top of the canvas. */
function prompt(setOverlay, title, body) {
  setOverlay(`
    <div class="card">
      <h1>${title}</h1>
      <p class="big">${body}</p>
    </div>
  `);
}

/** Average of a numeric array. */
function avg(arr) { return arr.reduce((s, v) => s + v, 0) / arr.length; }

// ── The main wizard ──────────────────────────────────────────────

/**
 * Walk the player through all five steps. Returns the calibration
 * object once it has been saved to localStorage.
 *
 * `setOverlay` is a function (from hud.js) that puts HTML on top of
 * the canvas so we can show instructions to the player.
 */
export async function runCalibration(setOverlay) {
  // Step 1 — wait for a face.
  prompt(setOverlay,
    'Calibration 1 / 5',
    'Sit facing the camera in good light. Detecting your face…');
  while (!input.faceDetected) await waitMs(100);
  await waitMs(800); // let the user settle

  // Step 2 — neutral (straight ahead) head position.
  prompt(setOverlay,
    'Calibration 2 / 5',
    'Look straight ahead. Hold still for 2 seconds.');
  await waitMs(800);
  const neutralSamples = await collectSamples(1500, () => input.headXRaw);
  const neutralX = avg(neutralSamples);

  // Step 3 — left extreme.
  prompt(setOverlay,
    'Calibration 3 / 5',
    'Turn your head to the <b>LEFT</b> as far as comfortable. Hold.');
  await waitMs(1200);
  const leftSamples = await collectSamples(1500, () => input.headXRaw);
  // Guard: if the player barely moved, still give them some range.
  const leftX = Math.min(...leftSamples, neutralX - 0.05);

  // Step 4 — right extreme.
  prompt(setOverlay,
    'Calibration 4 / 5',
    'Turn your head to the <b>RIGHT</b> as far as comfortable. Hold.');
  await waitMs(1200);
  const rightSamples = await collectSamples(1500, () => input.headXRaw);
  const rightX = Math.max(...rightSamples, neutralX + 0.05);

  // Step 5 — blink baseline and threshold.
  prompt(setOverlay,
    'Calibration 5 / 5',
    'Relax. Look at the screen with eyes <b>open</b> for 2 seconds.');
  await waitMs(800);
  const blinkBaseline = await collectSamples(2000, () => input.blinkValue);
  const baselineMax = Math.max(...blinkBaseline);

  // Tuned to favour false-positives over missed blinks, even when
  // light is poor or the player wears glasses. Floor 0.22 stops noise
  // from firing; ceiling 0.55 stops bad lighting from locking the
  // player out entirely.
  const blinkThreshold = Math.max(0.22, Math.min(0.55, baselineMax + 0.12));

  prompt(setOverlay,
    'Almost done',
    'Now <b>blink</b> firmly three times. (threshold locked.)');
  await waitMs(3500);

  // Save and tell the vision module.
  const calib = { neutralX, leftX, rightX, blinkThreshold, savedAt: Date.now() };
  saveCalib(calib);

  prompt(setOverlay,
    'Calibration complete',
    `Threshold ${blinkThreshold.toFixed(2)} · range ${(leftX).toFixed(2)}→${(rightX).toFixed(2)}.`);
  await waitMs(900);
  return calib;
}
