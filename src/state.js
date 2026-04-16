/* ============================================================
 * state.js
 * ------------------------------------------------------------
 * The "whiteboard" that every module writes to and reads from.
 *
 * Think of the game as a small factory. The vision module (camera)
 * writes the latest head position and blink status onto a shared
 * whiteboard. The game module reads that whiteboard and decides
 * where to move the paddle. The HUD module reads the whiteboard
 * to update the numbers on screen. Everyone looks at the SAME
 * whiteboard — that's this file.
 *
 * JavaScript runs on a single thread, so two modules can never
 * write to the whiteboard at exactly the same instant. That's why
 * we don't need any locking code.
 * ========================================================== */

// The possible "modes" the game can be in. Each screen / state uses one.
export const PHASE = Object.freeze({
  LOADING:     'LOADING',     // camera / model still starting up
  MENU:        'MENU',        // (not currently shown, reserved)
  CALIBRATE:   'CALIBRATE',   // running the 5-step calibration wizard
  READY:       'READY',       // paddle waiting, ball stuck, blink to launch
  PLAYING:     'PLAYING',     // actively playing a round
  PAUSED:      'PAUSED',      // player pressed P
  GAMEOVER:    'GAMEOVER',    // (kept for future use)
  LEADERBOARD: 'LEADERBOARD', // showing the name / country form after losing
  WIN:         'WIN',         // (kept for future use)
});

// Everything the camera & model are telling us, right now.
// Updated many times per second by vision.js; read by everyone else.
export const input = {
  headX: 0,            // normalized head position, -1 = left, 0 = centre, 1 = right
  headXRaw: 0,         // the raw smoothed nose x (0..1, already mirrored)
  blinkEdge: false,    // true for exactly ONE frame when a blink "fires"
  blinkActive: false,  // true while both eyes are closed above threshold
  blinkValue: 0,       // latest blink score from MediaPipe (0..1)
  faceDetected: false, // true if the camera currently sees a face
  visionFps: 0,        // how many camera frames per second the model is processing
  initialized: false,  // true once the model has finished loading
};

// Everything about the current match (score, bricks, ball, etc.).
// Updated by game.js, drawn by render.js, shown in numbers by hud.js.
export const game = {
  phase: PHASE.LOADING,                     // current mode (see PHASE above)
  score: 0,
  lives: 3,
  level: 1,
  paddle: null,                             // {x,y,w,h}
  balls: [],                                // array so multi-ball is easy later
  bricks: [],                               // the wall at the top
  powerups: [],                             // falling E / L pickups
  lasers: [],                               // laser beams in flight
  activeBuffs: { expandUntil: 0, laserUntil: 0 }, // ms timestamps (0 = inactive)
  lastLaserMs: 0,                           // last time a laser was fired
  overlayText: '',                          // text shown on top of the canvas
  debug: false,                             // press D in-game to toggle
  gameFps: 0,                               // frames per second of the game loop
};

// Past players' scores, kept only while the tab is open.
// Refreshing the page wipes this array by design.
export const leaderboard = [];

// Blinks arrive as "edges" — one frame only. This helper reads and
// clears the edge so the game reacts exactly once per blink.
export function consumeBlink() {
  if (input.blinkEdge) {
    input.blinkEdge = false;
    return true;
  }
  return false;
}
