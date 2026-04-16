/* ============================================================
 * config.js
 * ------------------------------------------------------------
 * The "settings file" for the whole game.
 *
 * Every number that controls how the game feels (ball speed,
 * paddle size, how sensitive blink detection is, which colours
 * to use, etc.) lives here. If you want to tune something,
 * change the value in this file — you do not need to touch any
 * of the other files.
 *
 * The CONFIG object below is imported by the other modules. It
 * is read-only in practice; nobody changes these values once the
 * game starts.
 * ========================================================== */

export const CONFIG = {
  // Size of the play area in pixels. Must match the <canvas> in index.html.
  canvas: { w: 960, h: 640 },

  // How the ball and paddle behave physically.
  physics: {
    paddleW: 110,                 // paddle width in pixels (default)
    paddleH: 14,                  // paddle height
    paddleY: 600,                 // paddle's fixed y-position near the bottom
    paddleMaxVx: 1400,            // max horizontal speed when using keyboard
    ballR: 7,                     // ball radius
    ballSpeed: 420,               // starting ball speed (pixels per second)
    ballMaxBounceAngleDeg: 60,    // steepest angle a ball can leave the paddle
    ballSpeedUpEveryBrick: 1.5,   // how much faster the ball gets per brick
    ballMaxSpeed: 720,            // upper speed cap so it never becomes unplayable
  },

  // Head-tracking: how the nose position on camera becomes paddle position.
  head: {
    smoothingAlpha: 0.35,         // 0 = never move, 1 = snap instantly. 0.35 = smooth.
    deadzoneNorm: 0.02,           // tiny head wobble near centre is treated as "still"
  },

  // Blink detection. MediaPipe reports an "eyeBlink" score 0..1; higher
  // means eyes more closed. We fire an action when it crosses `threshold`
  // for at least `minDurMs` and it has been more than `cooldownMs` since
  // the last fire (so one blink doesn't count as two).
  blink: {
    threshold: 0.40,              // below this → eyes open; above → blinking
    minDurMs: 100,                // hold eyes shut at least this long (ms)
    cooldownMs: 500,              // min gap between two fires (ms)
  },

  // Power-ups that fall from broken bricks.
  powerup: {
    dropChance: 0.2,              // 20% chance a destroyed brick drops one
    fallSpeed: 160,               // how fast a power-up drifts downward (px/s)
    expandDurMs: 10000,           // "Expand" paddle stays wider this long
    expandScale: 1.5,             // paddle width × 1.5 while Expand is active
    laserDurMs: 12000,            // "Laser" pickup lasts this long
    laserCooldownMs: 150,         // min gap between two laser shots (ms)
    laserSpeed: 900,              // laser projectile speed (px/s)
  },

  // Layout of the brick wall at the top of the screen.
  level: {
    cols: 12,                     // bricks per row
    rows: 6,                      // starting rows (grows slightly per level)
    gap: 4,                       // space between bricks in pixels
    topPad: 80,                   // empty space above the wall
    sidePad: 40,                  // empty space to the left/right of the wall
    brickH: 22,                   // brick height in pixels
  },

  // Four countries shown on the leaderboard form. The "flag" is a Unicode
  // emoji that renders as a real flag on macOS/iOS/Android. On Windows it
  // may appear as two letters — the country name is always shown next to
  // it so the meaning is still clear.
  countries: [
    { code: 'PT', name: 'Portugal', flag: '\u{1F1F5}\u{1F1F9}' },
    { code: 'SI', name: 'Slovenia', flag: '\u{1F1F8}\u{1F1EE}' },
    { code: 'SK', name: 'Slovakia', flag: '\u{1F1F8}\u{1F1F0}' },
    { code: 'RS', name: 'Serbia',   flag: '\u{1F1F7}\u{1F1F8}' },
  ],

  // Colour palette. Chosen from the "Okabe-Ito" set, which stays
  // distinguishable even for people with colour-vision deficiencies.
  // No red/green pair carries meaning anywhere in the game.
  palette: {
    bg: '#0B1020',                // dark navy background
    paddle: '#56B4E9',            // sky blue paddle
    paddleExpand: '#7FD0F3',      // lighter blue when paddle is "expanded"
    ball: '#F0E442',              // yellow ball
    brickTier1: '#009E73',        // bluish-green (bottom rows)
    brickTier2: '#E69F00',        // orange (middle rows)
    brickTier3: '#CC79A7',        // reddish-purple (top rows — worth more)
    puExpand: '#56B4E9',          // Expand power-up colour (with "E" label)
    puLaser: '#D55E00',           // Laser power-up colour (with "L" label)
    laserBeam: '#F0E442',         // yellow laser beam
    text: '#F5F5F5',              // main text colour
    muted: '#9AA3BD',             // secondary text colour
  },
};
