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
  // Note: paddleW, ballSpeed, and starting lives are now set per-difficulty
  // (see `difficulty` below). The values here are only used as the fallback
  // defaults if somehow no difficulty has been picked.
  physics: {
    paddleW: 110,                 // fallback paddle width (difficulty overrides this)
    paddleH: 14,                  // paddle height
    paddleY: 600,                 // paddle's fixed y-position near the bottom
    paddleMaxVx: 1400,            // max horizontal speed when using keyboard
    ballR: 7,                     // ball radius
    ballSpeed: 288,               // fallback starting ball speed (difficulty overrides)
    ballMaxBounceAngleDeg: 60,    // steepest angle a ball can leave the paddle
    ballSpeedUpEveryBrick: 1.5,   // how much faster the ball gets per brick
    ballMaxSpeed: 720,            // upper speed cap so it never becomes unplayable
  },

  // Difficulty presets. The player picks one before each new game.
  // `speedBase` is in pixels-per-frame at 60 fps — we convert to pixels
  // per second internally by multiplying by 60. (px/frame @ 60fps × 60 = px/s.)
  difficulty: {
    easy:   { paddleW: 120, lives: 5, speedBase: 3.8 }, // 228 px/s
    medium: { paddleW: 88,  lives: 3, speedBase: 4.8 }, // 288 px/s
    hard:   { paddleW: 64,  lives: 2, speedBase: 5.8 }, // 348 px/s
  },
  defaultDifficulty: 'medium',

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

  // Power-ups that fall from broken bricks. There are six kinds; one
  // is picked at random each time a brick drops a power-up.
  powerup: {
    dropChance: 0.20,             // 20% chance a destroyed brick drops one
    fallSpeed: 160,               // how fast a power-up drifts downward (px/s)
    durMs: 8000,                  // most timed buffs last this long
    // Expand / Shrink — paddle size buffs.
    expandScale: 1.4,             // paddle width × 1.4 while Expand is active
    expandMaxPx: 180,             // hard cap on paddle width
    shrinkScale: 0.7,             // paddle width × 0.7 while Shrink is active
    shrinkMinPx: 40,              // hard floor on paddle width
    // Triple — spawns extra balls on pickup.
    tripleSpawn: 2,               // how many extra balls appear
    tripleSpeedMult: 1.5,         // those balls start 1.5× the normal speed
    // Slow / Fast — multiply the ball speed.
    slowMult: 0.7,
    fastMult: 1.3,
    // Laser — ammo-based, not timed. Each pickup grants this many shots.
    laserAmmoPerPickup: 10,
    laserCooldownMs: 150,         // min gap between two laser shots (ms)
    laserSpeed: 900,              // laser projectile speed (px/s)
    // Random pool — equal weight for each kind. Edit this array to bias drops.
    kinds: ['expand', 'shrink', 'triple', 'slow', 'fast', 'laser'],
  },

  // Layout of the brick wall at the top of the screen.
  level: {
    cols: 12,                     // bricks per row
    rows: 6,                      // starting rows (grows slightly per level)
    gap: 4,                       // space between bricks in pixels
    topPad: 80,                   // empty space above the wall
    sidePad: 40,                  // empty space to the left/right of the wall
    brickH: 22,                   // brick height in pixels
    // Row colours, top → bottom. The Nth row uses rowColors[N % length].
    // Top row is worth the most points (matches arcade-Breakout convention).
    rowColors: ['magenta', 'orange', 'yellow', 'teal', 'blue', 'cyan'],
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

  // Colour palette — daltonism-safe candy palette. Each named colour
  // is used in multiple places so the game stays visually consistent
  // (e.g. the Slow buff, its falling pickup tile, and the brick row
  // it can come out of all share the same hue).
  palette: {
    bg: '#0B1020',                // dark navy background
    text: '#F5F5F5',
    muted: '#9AA3BD',
    // Named hues. Six are enough for all bricks and all power-ups.
    cyan:    '#00D9FF',           // paddle, main UI
    teal:    '#40E0D0',           // slow bonus
    magenta: '#FF006E',           // shrink bonus, danger
    orange:  '#FF8C00',           // laser, fast bonus
    yellow:  '#FFD60A',           // ball, score, expand bonus
    blue:    '#3A86FF',           // triple bonus
    // Aliases used by other modules. Mapping the candy palette onto the
    // existing names so we don't have to chase every usage. Change a
    // mapping here if you want to re-skin without touching render code.
    paddle:        '#00D9FF',     // cyan
    paddleExpand:  '#7AE9FF',     // lighter cyan when Expand is active
    paddleShrink:  '#FF4D94',     // pinker cyan when Shrink is active
    ball:          '#FFD60A',     // yellow
    laserBeam:     '#FFD60A',     // yellow beam
    // Per-power-up colours (keyed by power-up "kind" string).
    puExpand:  '#FFD60A',         // E — yellow
    puShrink:  '#FF006E',         // S — magenta
    puTriple:  '#3A86FF',         // T — blue
    puSlow:    '#40E0D0',         // SL — teal
    puFast:    '#FF8C00',         // F — orange
    puLaser:   '#FF8C00',         // L — orange
  },
};
