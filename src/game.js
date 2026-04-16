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

// ── Starting a match / level ─────────────────────────────────────

/** Reset everything — called on first boot and on "Play again". */
export function newGame() {
  game.score = 0;
  game.lives = 3;
  game.level = 1;
  game.activeBuffs = { expandUntil: 0, laserUntil: 0 };
  game.lastLaserMs = 0;
  game.powerups = [];
  game.lasers = [];
  resetLevel();
  game.phase = PHASE.READY;
  game.overlayText = 'Blink or press Space to launch';
}

/** Rebuild the paddle, ball and brick wall for the current level. */
export function resetLevel() {
  game.paddle = {
    x: C.w / 2 - P.paddleW / 2,
    y: P.paddleY,
    w: P.paddleW,
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
    speed: P.ballSpeed,    // speed may increase as bricks break
  };
}

/** Build the wall of bricks. Higher levels get a few more rows. */
function buildBricks(level) {
  const cols = L.cols;
  const rows = Math.min(L.rows + Math.floor((level - 1) / 2), 9);
  const innerW = C.w - L.sidePad * 2 - (cols - 1) * L.gap;
  const brickW = innerW / cols;
  const arr = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Top rows are tougher (tier 3) and worth more points.
      const tier = r < 2 ? 3 : r < 4 ? 2 : 1;
      arr.push({
        x: L.sidePad + c * (brickW + L.gap),
        y: L.topPad + r * (L.brickH + L.gap),
        w: brickW,
        h: L.brickH,
        hp: tier,   // hit points — brick disappears at 0
        tier,       // original tier (for colour)
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

/** Fire a pair of lasers from the paddle if the Laser power-up is active. */
export function fireLaser(now) {
  if (now > game.activeBuffs.laserUntil) return;                // power-up expired
  if (now - game.lastLaserMs < PU.laserCooldownMs) return;      // cooldown
  game.lastLaserMs = now;
  const p = game.paddle;
  game.lasers.push({ x: p.x + 12,          y: p.y, vy: -PU.laserSpeed });
  game.lasers.push({ x: p.x + p.w - 12,    y: p.y, vy: -PU.laserSpeed });
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

  // Smoothly grow/shrink the paddle when Expand is active / ending.
  const expanded = performance.now() < game.activeBuffs.expandUntil;
  const targetW = expanded ? P.paddleW * PU.expandScale : P.paddleW;
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
      game.score += 10 * br.tier;
      b.speed = Math.min(P.ballMaxSpeed, b.speed + P.ballSpeedUpEveryBrick);
      // Chance for a power-up to fall out.
      if (br.hp <= 0 && Math.random() < PU.dropChance) {
        const kind = Math.random() < 0.5 ? 'E' : 'L';
        game.powerups.push({
          x: br.x + br.w / 2, y: br.y + br.h / 2,
          w: 28, h: 20, kind,
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
      if (pu.kind === 'E') game.activeBuffs.expandUntil = now + PU.expandDurMs;
      if (pu.kind === 'L') game.activeBuffs.laserUntil  = now + PU.laserDurMs;
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
        game.score += 5 * br.tier;
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
