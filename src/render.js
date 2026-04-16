/* ============================================================
 * render.js
 * ------------------------------------------------------------
 * The "painter". Draws the current state of the game onto the
 * HTML5 <canvas> once per animation frame.
 *
 * This file never changes the game — it only reads it. Game rules
 * live in game.js. Here we take whatever is in `game` right now
 * (paddle position, bricks, balls, power-ups) and paint it.
 *
 * Drawing order matters: things drawn later appear on top.
 * We draw: background → bricks → paddle → balls → lasers →
 * power-ups → on-screen hints → debug overlay.
 * ========================================================== */

import { CONFIG } from './config.js';
import { game, PHASE } from './state.js';

const { canvas: C, palette: PAL } = CONFIG;

/** Main entry. Called from main.js every animation frame. */
export function render(ctx) {
  // Clear the whole canvas by painting the background colour over it.
  ctx.fillStyle = PAL.bg;
  ctx.fillRect(0, 0, C.w, C.h);

  // ── BRICKS ──────────────────────────────────────────────────
  for (const br of game.bricks) {
    if (br.hp <= 0) continue; // already broken — don't draw
    const color = br.tier === 3 ? PAL.brickTier3
                : br.tier === 2 ? PAL.brickTier2
                : PAL.brickTier1;
    roundRect(ctx, br.x, br.y, br.w, br.h, 4, color);
    // If a multi-hit brick has been damaged, show a little crack.
    if (br.hp < br.tier) {
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(br.x + 4, br.y + br.h / 2);
      ctx.lineTo(br.x + br.w - 4, br.y + br.h / 2 - 2);
      ctx.stroke();
    }
  }

  // ── PADDLE ──────────────────────────────────────────────────
  const p = game.paddle;
  if (p) {
    const expanded = performance.now() < game.activeBuffs.expandUntil;
    roundRect(ctx, p.x, p.y, p.w, p.h, 6,
              expanded ? PAL.paddleExpand : PAL.paddle);

    if (expanded) {
      // Vertical stripes to show "Expand" is active (redundant cue:
      // colour + pattern, for colourblind accessibility).
      ctx.strokeStyle = 'rgba(11, 16, 32, 0.55)';
      ctx.lineWidth = 1.5;
      for (let sx = p.x + 6; sx < p.x + p.w - 6; sx += 6) {
        ctx.beginPath();
        ctx.moveTo(sx, p.y + 2);
        ctx.lineTo(sx, p.y + p.h - 2);
        ctx.stroke();
      }
    }
    // Thin orange underline when Laser is ready.
    if (performance.now() < game.activeBuffs.laserUntil) {
      ctx.fillStyle = PAL.puLaser;
      ctx.fillRect(p.x, p.y + p.h + 2, p.w, 2);
    }
  }

  // ── BALLS ───────────────────────────────────────────────────
  for (const b of game.balls) {
    ctx.fillStyle = PAL.ball;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── LASERS ──────────────────────────────────────────────────
  for (const ls of game.lasers) {
    ctx.fillStyle = PAL.laserBeam;
    ctx.fillRect(ls.x - 1.5, ls.y, 3, 14);
  }

  // ── POWER-UPS ───────────────────────────────────────────────
  // Each power-up is a coloured tile + pattern + big letter.
  // The letter is the most important cue — it's readable even when
  // colour and pattern are hard to tell apart.
  for (const pu of game.powerups) {
    const color = pu.kind === 'E' ? PAL.puExpand : PAL.puLaser;
    roundRect(ctx, pu.x - pu.w / 2, pu.y - pu.h / 2, pu.w, pu.h, 4, color);

    // Clip so the pattern lines don't spill outside the tile.
    ctx.save();
    ctx.beginPath();
    ctx.rect(pu.x - pu.w / 2, pu.y - pu.h / 2, pu.w, pu.h);
    ctx.clip();
    ctx.strokeStyle = 'rgba(11, 16, 32, 0.45)';
    ctx.lineWidth = 1.2;
    if (pu.kind === 'E') {
      // Vertical stripes → "Expand"
      for (let sx = pu.x - pu.w / 2 + 3; sx < pu.x + pu.w / 2; sx += 4) {
        ctx.beginPath();
        ctx.moveTo(sx, pu.y - pu.h / 2);
        ctx.lineTo(sx, pu.y + pu.h / 2);
        ctx.stroke();
      }
    } else {
      // Diagonal hatch → "Laser"
      for (let sx = pu.x - pu.w; sx < pu.x + pu.w; sx += 5) {
        ctx.beginPath();
        ctx.moveTo(sx, pu.y - pu.h / 2);
        ctx.lineTo(sx + pu.h, pu.y + pu.h / 2);
        ctx.stroke();
      }
    }
    ctx.restore();

    // Big letter label on top.
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pu.kind, pu.x, pu.y + 0.5);
  }

  // ── HINT: "blink / space to launch" when ball is stuck ──────
  if (game.phase === PHASE.READY && game.balls[0]?.stuck) {
    ctx.fillStyle = PAL.muted;
    ctx.font = '14px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('blink / space to launch', C.w / 2, p.y - 28);
  }

  // ── DEBUG OVERLAY (press D) ─────────────────────────────────
  if (game.debug) drawDebug(ctx);
}

/** Tiny diagnostic panel in the top-left when debug is on. */
function drawDebug(ctx) {
  ctx.fillStyle = 'rgba(245,245,245,0.85)';
  ctx.font = '12px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`gameFps ${game.gameFps.toFixed(0)}`, 8, 8);
  ctx.fillText(`phase   ${game.phase}`, 8, 22);
}

/**
 * Draw a filled rectangle with rounded corners.
 * Canvas has no built-in "rounded rect" in older browsers, so we
 * build one out of four quadratic curves. Fine for our sizes.
 */
function roundRect(ctx, x, y, w, h, r, fill) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
  ctx.fill();
}
