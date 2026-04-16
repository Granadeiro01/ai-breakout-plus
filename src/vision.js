/* ============================================================
 * vision.js
 * ------------------------------------------------------------
 * The "eyes" of the game.
 *
 * This module asks the browser for permission to use the webcam,
 * loads a free face-tracking model from Google (MediaPipe), and
 * then, many times per second, answers two questions:
 *
 *   1. Where is the player's head right now? (left / centre / right)
 *   2. Are they blinking right now?
 *
 * Every answer is written into the shared `input` object in
 * state.js. Other files (game.js, hud.js) just read `input` —
 * they never have to know about cameras or AI models.
 * ========================================================== */

import { CONFIG } from './config.js';
import { input } from './state.js';

// Where to download the model + runtime from. All are public CDNs.
// If you change the version here, change it in all three URLs.
const TASKS_VISION_URL = 'https://esm.sh/@mediapipe/tasks-vision@0.10.14';
const WASM_URL         = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL        = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

// ── Module-private state (not shared with other files) ──────────────
let faceLandmarker = null;   // the AI model instance, after it loads
let video          = null;   // the <video> element showing the webcam
let calib          = null;   // calibration numbers captured by calibration.js
let blinkState     = 'IDLE'; // tiny state machine: IDLE → RISING → FIRED → FALLING
let blinkRiseMs    = 0;      // when the current blink started
let blinkLastFireMs = 0;     // last time we counted a blink
let emaX           = null;   // smoothed head-x, nothing fancy — a running average
let lastTsMs       = 0;      // last frame time (for FPS calc)
let visionFpsEma   = 0;      // smoothed FPS reading shown in the HUD
let running        = false;  // true while the per-frame loop is active

/**
 * Set up the webcam and load the face-tracking model.
 * Call this ONCE at startup. Returns a Promise that resolves when
 * the camera is streaming and the model is ready to use.
 */
export async function initVision(videoEl) {
  video = videoEl;

  // Ask the browser for camera access. The user sees a prompt.
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, facingMode: 'user' },
    audio: false,
  });
  video.srcObject = stream;

  // Wait until the <video> has actual pixels to show.
  await new Promise((res) => {
    if (video.readyState >= 2) return res();
    video.onloadeddata = () => res();
  });
  await video.play();

  // Dynamically import the MediaPipe library and create the model.
  const { FilesetResolver, FaceLandmarker } = await import(TASKS_VISION_URL);
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
  faceLandmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
    runningMode: 'VIDEO',          // we feed it one frame at a time
    numFaces: 1,                   // only track the player, not a crowd
    outputFaceBlendshapes: true,   // <-- gives us eyeBlinkLeft/Right scores
    outputFacialTransformationMatrixes: false,
  });
  input.initialized = true;
}

/**
 * Called once calibration finishes so we can translate raw nose-x
 * into a -1..1 "paddle position" using the player's own head range.
 */
export function setCalibration(c) {
  calib = c;
}

/**
 * Kick off the per-frame loop. It runs on its own schedule using
 * requestAnimationFrame. The game loop (in main.js) runs separately.
 */
export function startVision() {
  if (running) return;
  running = true;
  lastTsMs = performance.now();
  const loop = () => {
    if (!running) return;
    tick();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

/** Stop the vision loop (not currently used, but handy for future). */
export function stopVision() {
  running = false;
}

// ────────────────────────────────────────────────────────────────────
// tick()  — runs on every camera frame. It is the heart of this file.
// ────────────────────────────────────────────────────────────────────
function tick() {
  // If the model or video isn't ready yet, skip this frame.
  if (!faceLandmarker || !video || video.readyState < 2) return;

  // Track how fast we're processing frames (for the HUD).
  const now = performance.now();
  const dt = now - lastTsMs;
  lastTsMs = now;
  if (dt > 0) {
    const instFps = 1000 / dt;
    // EMA = "exponential moving average": a smooth rolling value so
    // the FPS number in the HUD doesn't jitter every frame.
    visionFpsEma = visionFpsEma === 0 ? instFps : visionFpsEma * 0.9 + instFps * 0.1;
    input.visionFps = visionFpsEma;
  }

  // Run the model on the current video frame.
  let result;
  try {
    result = faceLandmarker.detectForVideo(video, now);
  } catch (e) {
    return; // transient — just try again next frame
  }

  // Is there a face in view?
  const faces = result?.faceLandmarks;
  if (!faces || faces.length === 0) {
    input.faceDetected = false;
    return;
  }
  input.faceDetected = true;

  // ── HEAD POSITION ──────────────────────────────────────────────
  // The model returns ~478 "landmarks" (points) on the face. Landmark
  // index 1 is on the bridge of the nose. That's a good proxy for
  // where the head is pointing. Coordinates are normalized 0..1.
  const nose = faces[0][1];

  // The webcam feed is mirrored on screen so left-head = left-paddle
  // feels natural. We mirror the x value here to match.
  const rawX = 1 - nose.x;

  // Smooth the raw number. Without smoothing the paddle would jitter
  // every time your breathing moves your head a millimetre.
  emaX = emaX == null
    ? rawX
    : emaX * (1 - CONFIG.head.smoothingAlpha) + rawX * CONFIG.head.smoothingAlpha;
  input.headXRaw = emaX;

  // Convert raw nose-x into -1..1 using the calibrated head range.
  // If calibration hasn't run yet, fall back to a simple full-range map.
  if (calib) {
    const { neutralX, leftX, rightX } = calib;
    const leftSpan  = Math.max(0.02, neutralX - leftX);  // guard against 0
    const rightSpan = Math.max(0.02, rightX - neutralX);
    const delta = emaX - neutralX;
    let norm = delta >= 0 ? delta / rightSpan : delta / leftSpan;
    // Tiny movements near the centre count as "not moving".
    if (Math.abs(norm) < CONFIG.head.deadzoneNorm) norm = 0;
    input.headX = Math.max(-1, Math.min(1, norm));
  } else {
    input.headX = Math.max(-1, Math.min(1, (emaX - 0.5) * 2));
  }

  // ── BLINK DETECTION ───────────────────────────────────────────
  // MediaPipe reports "blendshapes" for the face, each with a score
  // 0..1. eyeBlinkLeft = how closed the left eye is. Same for right.
  // We take the larger of the two and run it through a little state
  // machine so a single eye-close counts as exactly one blink.
  const blend = result.faceBlendshapes?.[0]?.categories;
  if (blend) {
    let eyeBlinkL = 0, eyeBlinkR = 0;
    for (const c of blend) {
      if (c.categoryName === 'eyeBlinkLeft')       eyeBlinkL = c.score;
      else if (c.categoryName === 'eyeBlinkRight') eyeBlinkR = c.score;
    }
    const b = Math.max(eyeBlinkL, eyeBlinkR);
    input.blinkValue = b;
    const threshold = calib?.blinkThreshold ?? CONFIG.blink.threshold;
    input.blinkActive = b >= threshold;

    // The state machine:
    //   IDLE     → eyes are open; waiting for them to close
    //   RISING   → eyes just closed; wait minDurMs to confirm it's a blink
    //   FIRED    → blink counted; wait for eyes to reopen
    //   FALLING  → eyes re-opening; then back to IDLE
    switch (blinkState) {
      case 'IDLE':
        if (b >= threshold) {
          blinkState = 'RISING';
          blinkRiseMs = now;
        }
        break;
      case 'RISING':
        if (b < threshold) {
          // False alarm — twitch too quick to count.
          blinkState = 'IDLE';
        } else if (now - blinkRiseMs >= CONFIG.blink.minDurMs) {
          // Held shut long enough — count the blink (if not in cooldown).
          if (now - blinkLastFireMs >= CONFIG.blink.cooldownMs) {
            input.blinkEdge = true; // one-shot; consumed by game.js
            blinkLastFireMs = now;
          }
          blinkState = 'FIRED';
        }
        break;
      case 'FIRED':
        if (b < threshold) blinkState = 'FALLING';
        break;
      case 'FALLING':
        // Wait until the score really drops before accepting a new blink.
        if (b < threshold * 0.8) blinkState = 'IDLE';
        break;
    }
  }
}

/**
 * Read the current smoothed values synchronously. Used by the
 * calibration flow to sample the nose and blink over a few seconds.
 */
export function sampleRaw() {
  return { rawX: input.headXRaw, blink: input.blinkValue, face: input.faceDetected };
}
