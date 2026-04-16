/* ============================================================
 * game.js
 * ------------------------------------------------------------
 * The rules of the game (physics, scoring, power-ups).
 *
 * This module doesn't know about cameras or the DOM. It just
 * answers: "given the current game state and how much time has
 * passed since the last frame, what should the state look like
 * now?" The main loop (main.js) calls updateGame(dt) on every
 * animation frame. render.js then draws the result.
 *
 * Key ideas used below:
 *   • Axis-Aligned Bounding Box (AABB) hit test — a cheap way to
 *     check if two rectangles overlap (paddle vs power-up).
 *   • Circle-vs-rectangle hit test — for the ball (circle) hitting
 *     bricks and the paddle.
 *   • Paddle-angle physics — where you hit the paddle decides the
 *     angle the ball leaves at, giving the player control.
 * ========================================================== */

import { CONFIG } from './config.js';
import { game, input, consumeBlink, PHASE } from './state.js';

// Short aliases for CONFIG sections to keep lines below readable.
const { canvas: C, physics: P, level: L, powerup: PU } = CONFIG;

/** Read the currently-selected difficulty preset, or fall back to medium. */
function diffPreset() {
  return CONFIG.difficulty[game.difficulty] || CONFIG.difficulty[CONFIG.defaultDifficulty];
}

/** Starting paddle width for the current difficulty. */
export function basePaddleW() {
  return diffPreset().paddleW;
}

/** Starting ball speed (px/s) for the current difficulty.
 *  speedBase is in px/frame @ 60fps → multiply by 60 to get px/s. */
export function baseBallSpeed() {
  return diffPreset().speedBase * 60;
}

// ── Starting a match / level ─────────────────────────────────────

/** Reset everything — called on first boot and on "Play again". */
export function newGame() {
  const d = diffPreset();
  game.score = 0;
  game.lives = d.lives;
  game.level = 1;
  game.activeBuffs = {
    expandUntil: 0, shrinkUntil: 0, tripleUntil: 0,
    slowUntil:   0, fastUntil:   0, laserAmmo:   0,
  };
  game.lastLaserMs = 0;
  game.speedMult = 1;
  game.powerups = [];
  game.lasers = [];
  resetLevel();
  game.phase = PHASE.READY;
  game.overlayText = 'Blink or press Space to launch';
}

/** Rebuild the paddle, ball and brick wall for the current level. */
export function resetLevel() {
  const pw = basePaddleW();
  game.paddle = {
    x: C.w / 2 - pw / 2,
    y: P.paddleY,
    w: pw,
    h: P.paddleH,
  };
  const b = makeBall(true); // true = "stuck to paddle, waiting to launch"
  game.balls = [b];
  game.bricks = buildBricks(game.level);
  game.powerups.length = 0;
  game.lasers.length = 0;
}

/** Create a fresh ball sitting just above the paddle. */
function makeBall(stuck) {
  return {
    x: C.w / 2,
    y: P.paddleY - P.ballR - 1,
    vx: 0,                 // velocity x (px/s)
    vy: 0,                 // velocity y
    r: P.ballR,
    stuck,                 // true until launch
    speed: baseBallSpeed(),// starting speed from the chosen difficulty
  };
}

/** Build the wall of bricks. Higher levels get a few more rows.
 *  Each row gets its own colour from CONFIG.level.rowColors and is
 *  worth more points the higher up the screen it sits. All bricks
 *  break in one hit (multi-hit bricks are a future feature). */
function buildBricks(level) {
  const cols = L.cols;
  const rows = Math.min(L.rows + Math.floor((level - 1) / 2), 9);
  const innerW = C.w - L.sidePad * 2 - (cols - 1) * L.gap;
  const brickW = innerW / cols;
  const arr = [];
  for (let r = 0; r < rows; r++) {
    // Row 0 (top) → first colour in the list, etc.
    const colorName = L.rowColors[r % L.rowColors.length];
    const color = CONFIG.palette[colorName] || CONFIG.palette.cyan;
    // Score: top row worth most, going down. Capped so the bottom
    // is still worth at least 10 points.
    const points = Math.max(10, (L.rowColors.length - r) * 10);
    for (let c = 0; c < cols; c++) {
      arr.push({
        x: L.sidePad + c * (brickW + L.gap),
        y: L.topPad + r * (L.brickH + L.gap),
        w: brickW,
        h: L.brickH,
        hp: 1,        // 1-hit bricks; multi-hit is on the TODO list
        color,        // pre-resolved hex string for the renderer
        points,
      });
    }
  }
  return arr;
}

// ── Actions triggered by input ───────────────────────────────────

/** Launch the ball if it's currently stuck to the paddle. */
export function startRound() {
  if (game.phase !== PHASE.READY) return;
  const b = game.balls[0];
  if (!b || !b.stuck) return;
  // Aim roughly upward with a bit of random angle so it isn't boring.
  const ang = (-Math.PI / 2) + (Math.random() - 0.5) * 0.6;
  b.vx = Math.cos(ang) * b.speed;
  b.vy = Math.sin(ang) * b.speed;
  b.stuck = false;
  game.phase = PHASE.PLAYING;
  game.overlayText = '';
}

/** Fire a pair of lasers from the paddle if the player has ammo.
 *  Each pickup of the "L" power-up grants `laserAmmoPerPickup` shots
 *  (one full pair counts as one shot — both beams fire together). */
export function fireLaser(now) {
  if (game.activeBuffs.laserAmmo <= 0) return;                  // out of ammo
  if (now - game.lastLaserMs < PU.laserCooldownMs) return;      // cooldown
  game.lastLaserMs = now;
  game.activeBuffs.laserAmmo -= 1;
  const p = game.paddle;
  game.lasers.push({ x: p.x + 12,          y: p.y, vy: -PU.laserSpeed });
  game.lasers.push({ x: p.x + p.w - 12,    y: p.y, vy: -PU.laserSpeed });
}

/** Apply the effect of a power-up the player just caught with the paddle.
 *  Six kinds — see CONFIG.powerup.kinds. Each effect is intentionally
 *  short and self-contained so it's easy to read at a glance. */
function applyPowerup(kind, now) {
  switch (kind) {
    case 'expand':
      game.activeBuffs.expandUntil = now + PU.durMs;
      break;
    case 'shrink':
      game.activeBuffs.shrinkUntil = now + PU.durMs;
      break;
    case 'slow':
      game.activeBuffs.slowUntil = now + PU.durMs;
      break;
    case 'fast':
      game.activeBuffs.fastUntil = now + PU.durMs;
      break;
    case 'laser':
      // Stack with whatever ammo the player already had.
      game.activeBuffs.laserAmmo += PU.laserAmmoPerPickup;
      break;
    case 'triple': {
      // Spawn extra balls at the position of the (first) main ball,
      // scattered into different directions and at +50% speed.
      const src = game.balls.find((b) => !b.stuck) || game.balls[0];
      if (!src) break;
      const speed = src.speed * PU.tripleSpeedMult;
      for (let i = 0; i < PU.tripleSpawn; i++) {
        // Spread: -45°, +45° from straight up.
        const ang = (-Math.PI / 2) + ((i === 0) ? -0.6 : 0.6);
        game.balls.push({
          x: src.x, y: src.y,
          vx: Math.cos(ang) * speed * game.speedMult,
          vy: Math.sin(ang) * speed * game.speedMult,
          r: P.ballR,
          stuck: false,
          speed,
        });
      }
      break;
    }
  }
}

/** Called once per blink (and once per Space key press). */
export function onBlink(now) {
  if (game.phase === PHASE.READY) {
    startRound();
  } else if (game.phase === PHASE.PLAYING) {
    fireLaser(now);
  } else if (game.phase === PHASE.GAMEOVER || game.phase === PHASE.WIN) {
    newGame();
  }
  // During LEADERBOARD phase: ignore — the form is taking input.
}

// ── Per-frame updates ────────────────────────────────────────────

/**
 * Move the paddle toward the player's head (or keyboard arrows).
 * `kbDir` is -1 (left arrow), 0 (none), or 1 (right arrow).
 */
export function updatePaddle(dt, kbDir) {
  const p = game.paddle;
  if (!p) return;

  // Combine size buffs. Expand and Shrink can technically stack —
  // we just multiply both factors and then clamp to the configured
  // hard floor / ceiling so the paddle is always playable.
  const now = performance.now();
  const baseW = basePaddleW();
  let mult = 1;
  if (now < game.activeBuffs.expandUntil) mult *= PU.expandScale;
  if (now < game.activeBuffs.shrinkUntil) mult *= PU.shrinkScale;
  const targetW = Math.max(PU.shrinkMinPx, Math.min(PU.expandMaxPx, baseW * mult));
  p.w += (targetW - p.w) * Math.min(1, dt * 12);

  if (Math.abs(kbDir) > 0) {
    // Keyboard fallback — direct velocity movement.
    p.x += kbDir * P.paddleMaxVx * dt;
  } else if (input.faceDetected) {
    // Head-driven movement. -1..1 maps across the full travel width.
    const hx = input.headX;
    const travel = C.w - p.w;
    const targetX = (hx * 0.5 + 0.5) * travel;
    // Ease toward target (lower coefficient = softer tracking).
    p.x += (targetX - p.x) * Math.min(1, dt * 8);
  }

  // Clamp so the paddle never leaves the screen.
  p.x = Math.max(0, Math.min(C.w - p.w, p.x));
}

/** Advance the whole game by `dt` seconds. Called from main.js. */
export function updateGame(dt) {
  // Only run physics while playing (or ready-to-launch).
  if (game.phase !== PHASE.PLAYING && game.phase !== PHASE.READY) return;
  const now = performance.now();

  // ── 0. SLOW / FAST → BALL SPEED MULTIPLIER ──────────────────
  // Compute the multiplier that *should* be active right now. If it
  // changed from last frame (e.g. a buff just expired), rescale every
  // ball's velocity so the change is felt immediately.
  let wantMult = 1;
  if (now < game.activeBuffs.slowUntil) wantMult *= PU.slowMult;
  if (now < game.activeBuffs.fastUntil) wantMult *= PU.fastMult;
  if (wantMult !== game.speedMult) {
    const ratio = wantMult / game.speedMult;
    for (const b of game.balls) {
      if (b.stuck) continue;
      b.vx *= ratio;
      b.vy *= ratio;
    }
    game.speedMult = wantMult;
  }

  // ── 1. BALLS ────────────────────────────────────────────────
  for (const b of game.balls) {
    if (b.stuck) {
      // Stick the ball to the middle-top of the paddle.
      b.x = game.paddle.x + game.paddle.w / 2;
      b.y = game.paddle.y - b.r - 1;
      continue;
    }
    // Move.
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    // Bounce off the side walls and ceiling.
    if (b.x - b.r < 0)    { b.x = b.r;           b.vx =  Math.abs(b.vx); }
    if (b.x + b.r > C.w)  { b.x = C.w - b.r;     b.vx = -Math.abs(b.vx); }
    if (b.y - b.r < 0)    { b.y = b.r;           b.vy =  Math.abs(b.vy); }

    // Fell past the floor → ball is lost.
    if (b.y - b.r > C.h) { b._dead = true; continue; }

    // Paddle bounce — the hit position changes the bounce angle,
    // which is what makes Breakout feel controllable.
    if (circleRectHit(b, game.paddle)) {
      const p = game.paddle;
      const rel = (b.x - (p.x + p.w / 2)) / (p.w / 2);                // -1..1
      const ang = Math.max(-1, Math.min(1, rel)) *
                  (P.ballMaxBounceAngleDeg * Math.PI / 180);
      const sp = Math.min(b.speed, P.ballMaxSpeed);
      b.vx = Math.sin(ang) * sp;
      b.vy = -Math.abs(Math.cos(ang)) * sp; // always upward after paddle
      b.y = p.y - b.r - 0.1;                // nudge above paddle
    }

    // Brick collisions.
    for (const br of game.bricks) {
      if (br.hp <= 0) continue;
      if (!circleRectHit(b, br)) continue;
      // Figure out which side we hit so we can flip the right velocity.
      const { nx, ny } = circleRectNormal(b, br);
      if (nx !== 0) b.vx = Math.sign(nx) * Math.abs(b.vx);
      if (ny !== 0) b.vy = Math.sign(ny) * Math.abs(b.vy);
      br.hp -= 1;
      game.score += br.points;
      b.speed = Math.min(P.ballMaxSpeed, b.speed + P.ballSpeedUpEveryBrick);
      // Chance for a power-up to fall out — pick a random kind from the pool.
      if (br.hp <= 0 && Math.random() < PU.dropChance) {
        const kind = PU.kinds[Math.floor(Math.random() * PU.kinds.length)];
        game.powerups.push({
          x: br.x + br.w / 2, y: br.y + br.h / 2,
          w: 32, h: 22, kind,
        });
      }
      break; // one brick per frame is enough
    }
  }

  // Remove lost balls and handle life loss.
  const alive = game.balls.filter((b) => !b._dead);
  if (alive.length === 0 && game.phase === PHASE.PLAYING) {
    game.lives -= 1;
    if (game.lives <= 0) {
      // Game over → show the leaderboard form (handled in main.js).
      game.phase = PHASE.LEADERBOARD;
      game.overlayText = '';
    } else {
      game.phase = PHASE.READY;
      game.balls = [makeBall(true)];
      game.overlayText = `Lives ${game.lives}. Blink or Space to launch.`;
    }
  } else {
    game.balls = alive;
  }

  // ── 2. POWER-UPS ────────────────────────────────────────────
  for (const pu of game.powerups) {
    pu.y += PU.fallSpeed * dt;
    if (aabbHit(pu, game.paddle)) {
      pu._dead = true;
      applyPowerup(pu.kind, now);
    } else if (pu.y - pu.h > C.h) {
      pu._dead = true; // missed — fell off screen
    }
  }
  game.powerups = game.powerups.filter((p) => !p._dead);

  // ── 3. LASERS ───────────────────────────────────────────────
  for (const ls of game.lasers) {
    ls.y += ls.vy * dt;
    if (ls.y < -20) { ls._dead = true; continue; }
    for (const br of game.bricks) {
      if (br.hp <= 0) continue;
      // Simple point-in-rect test — lasers are thin so this is fine.
      if (ls.x >= br.x && ls.x <= br.x + br.w &&
          ls.y >= br.y && ls.y <= br.y + br.h) {
        br.hp -= 1;
        game.score += Math.floor(br.points / 2);
        ls._dead = true;
        break;
      }
    }
  }
  game.lasers = game.lasers.filter((l) => !l._dead);

  // ── 4. LEVEL CLEAR ──────────────────────────────────────────
  if (game.bricks.every((br) => br.hp <= 0)) {
    game.level += 1;
    resetLevel();
    game.phase = PHASE.READY;
    game.overlayText = `Level ${game.level}! Blink or Space to continue.`;
  }

  // ── 5. BLINK → ACTION ───────────────────────────────────────
  // consumeBlink() returns true at most once per blink.
  if (consumeBlink()) onBlink(now);
}

// ── Geometry helpers ─────────────────────────────────────────────

/** Do two axis-aligned rectangles overlap? */
function aabbHit(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * Does a circle overlap a rectangle? Works by finding the closest
 * point on the rectangle to the circle centre and checking if it
 * lies inside the circle.
 */
function circleRectHit(c, r) {
  const cx = Math.max(r.x, Math.min(c.x, r.x + r.w));
  const cy = Math.max(r.y, Math.min(c.y, r.y + r.h));
  const dx = c.x - cx;
  const dy = c.y - cy;
  return dx * dx + dy * dy < c.r * c.r;
}

/**
 * When a circle/rect collision happens, which side did we hit? Returns
 * a unit-ish normal (nx, ny) pointing away from the rectangle. Used
 * to decide whether to flip vx or vy.
 */
function circleRectNormal(c, r) {
  const cx = Math.max(r.x, Math.min(c.x, r.x + r.w));
  const cy = Math.max(r.y, Math.min(c.y, r.y + r.h));
  const dx = c.x - cx;
  const dy = c.y - cy;
  if (Math.abs(dx) > Math.abs(dy)) return { nx: dx >= 0 ? 1 : -1, ny: 0 };
  return { nx: 0, ny: dy >= 0 ? 1 : -1 };
}
