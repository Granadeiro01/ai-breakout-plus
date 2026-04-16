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

// Lookup table: power-up kind → { letter shown on the tile, fill colour,
// pattern style }. Patterns are a redundant accessibility cue so the
// kinds stay distinguishable for colour-blind players.
const PU_LOOK = {
  expand: { label: 'E',  color: PAL.puExpand, pattern: 'vstripes' },
  shrink: { label: 'S',  color: PAL.puShrink, pattern: 'arrows-in' },
  triple: { label: 'T',  color: PAL.puTriple, pattern: 'dots' },
  slow:   { label: 'SL', color: PAL.puSlow,   pattern: 'wave' },
  fast:   { label: 'F',  color: PAL.puFast,   pattern: 'arrows-fwd' },
  laser:  { label: 'L',  color: PAL.puLaser,  pattern: 'hatch' },
};

/** Main entry. Called from main.js every animation frame. */
export function render(ctx) {
  // Clear the whole canvas by painting the background colour over it.
  ctx.fillStyle = PAL.bg;
  ctx.fillRect(0, 0, C.w, C.h);

  // ── BRICKS ──────────────────────────────────────────────────
  // Each brick already carries its own pre-resolved colour from
  // buildBricks() in game.js, so we just draw a rounded rectangle.
  for (const br of game.bricks) {
    if (br.hp <= 0) continue;
    roundRect(ctx, br.x, br.y, br.w, br.h, 4, br.color);
  }

  // ── PADDLE ──────────────────────────────────────────────────
  const p = game.paddle;
  if (p) {
    const now = performance.now();
    const expanded = now < game.activeBuffs.expandUntil;
    const shrunk   = now < game.activeBuffs.shrinkUntil;
    // Colour reflects which buff is active (expand wins if both somehow are).
    const paddleColor = expanded ? PAL.paddleExpand
                      : shrunk   ? PAL.paddleShrink
                      :            PAL.paddle;
    roundRect(ctx, p.x, p.y, p.w, p.h, 6, paddleColor);

    if (expanded) {
      // Vertical stripes — redundant cue for "Expand" beyond the colour.
      ctx.strokeStyle = 'rgba(11, 16, 32, 0.55)';
      ctx.lineWidth = 1.5;
      for (let sx = p.x + 6; sx < p.x + p.w - 6; sx += 6) {
        ctx.beginPath();
        ctx.moveTo(sx, p.y + 2);
        ctx.lineTo(sx, p.y + p.h - 2);
        ctx.stroke();
      }
    }
    if (shrunk) {
      // Diagonal stripes — redundant cue for "Shrink".
      ctx.strokeStyle = 'rgba(11, 16, 32, 0.55)';
      ctx.lineWidth = 1.2;
      for (let sx = p.x; sx < p.x + p.w; sx += 5) {
        ctx.beginPath();
        ctx.moveTo(sx, p.y + 2);
        ctx.lineTo(sx + p.h, p.y + p.h - 2);
        ctx.stroke();
      }
    }
    // Thin orange underline + ammo count when laser shots are loaded.
    if (game.activeBuffs.laserAmmo > 0) {
      ctx.fillStyle = PAL.puLaser;
      ctx.fillRect(p.x, p.y + p.h + 2, p.w, 2);
      ctx.fillStyle = PAL.text;
      ctx.font = 'bold 11px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(`L×${game.activeBuffs.laserAmmo}`, p.x + p.w / 2, p.y + p.h + 6);
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
  // Each falling pickup is a coloured tile + pattern + big letter.
  // The letter is the most important cue — readable even when colour
  // and pattern are hard to tell apart.
  for (const pu of game.powerups) {
    const look = PU_LOOK[pu.kind] || PU_LOOK.expand;
    roundRect(ctx, pu.x - pu.w / 2, pu.y - pu.h / 2, pu.w, pu.h, 4, look.color);
    drawPattern(ctx, pu, look.pattern);
    // Big letter label on top.
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(look.label, pu.x, pu.y + 0.5);
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
  ctx.fillText(`gameFps  ${game.gameFps.toFixed(0)}`, 8, 8);
  ctx.fillText(`phase    ${game.phase}`, 8, 22);
  ctx.fillText(`speedMlt ${game.speedMult.toFixed(2)}`, 8, 36);
  ctx.fillText(`balls    ${game.balls.length}`, 8, 50);
  ctx.fillText(`lasers   ${game.activeBuffs.laserAmmo}`, 8, 64);
}

/** Draw a redundant pattern (lines / dots) inside a power-up tile.
 *  Each kind has its own pattern so they remain distinguishable to
 *  colour-blind players. */
function drawPattern(ctx, pu, pattern) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(pu.x - pu.w / 2, pu.y - pu.h / 2, pu.w, pu.h);
  ctx.clip();
  ctx.strokeStyle = 'rgba(11, 16, 32, 0.45)';
  ctx.fillStyle   = 'rgba(11, 16, 32, 0.45)';
  ctx.lineWidth = 1.2;
  const left = pu.x - pu.w / 2, right = pu.x + pu.w / 2;
  const top  = pu.y - pu.h / 2, bot   = pu.y + pu.h / 2;
  switch (pattern) {
    case 'vstripes':
      for (let sx = left + 3; sx < right; sx += 4) {
        ctx.beginPath(); ctx.moveTo(sx, top); ctx.lineTo(sx, bot); ctx.stroke();
      }
      break;
    case 'hatch':
      for (let sx = left - pu.w / 2; sx < right; sx += 5) {
        ctx.beginPath(); ctx.moveTo(sx, top); ctx.lineTo(sx + pu.h, bot); ctx.stroke();
      }
      break;
    case 'arrows-in':
      // Two arrows pointing inward → "shrink".
      ctx.beginPath();
      ctx.moveTo(left + 2, pu.y); ctx.lineTo(left + 7, pu.y - 4); ctx.moveTo(left + 2, pu.y); ctx.lineTo(left + 7, pu.y + 4);
      ctx.moveTo(right - 2, pu.y); ctx.lineTo(right - 7, pu.y - 4); ctx.moveTo(right - 2, pu.y); ctx.lineTo(right - 7, pu.y + 4);
      ctx.stroke();
      break;
    case 'arrows-fwd':
      // Three rightward chevrons → "fast".
      for (let i = 0; i < 3; i++) {
        const cx = left + 6 + i * 8;
        ctx.beginPath();
        ctx.moveTo(cx, pu.y - 4); ctx.lineTo(cx + 4, pu.y); ctx.lineTo(cx, pu.y + 4);
        ctx.stroke();
      }
      break;
    case 'wave':
      // A gentle sine line → "slow".
      ctx.beginPath();
      ctx.moveTo(left + 2, pu.y);
      for (let sx = left + 2; sx < right - 2; sx++) {
        ctx.lineTo(sx, pu.y + Math.sin((sx - left) * 0.6) * 3);
      }
      ctx.stroke();
      break;
    case 'dots':
      // Three dots → "triple".
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(left + 6 + i * 8, pu.y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
  }
  ctx.restore();
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
