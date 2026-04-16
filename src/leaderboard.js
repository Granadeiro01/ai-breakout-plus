/* ============================================================
 * leaderboard.js
 * ------------------------------------------------------------
 * The "high scores screen" shown after a player loses all 3 lives.
 *
 * We ask the player for their name and country (4 countries, each
 * with a flag), save the entry into the `leaderboard` array in
 * state.js, and show a ranked list of the top scores.
 *
 * The leaderboard only lives in memory — refresh the page and it
 * clears. That's intentional: this is a single-session kiosk-style
 * leaderboard, not a global ranking.
 * ========================================================== */

import { CONFIG } from './config.js';
import { game, leaderboard, PHASE } from './state.js';

/**
 * Turn user-typed text into safe HTML. Without this, a name like
 * "<script>" could inject code into the page. esc() replaces the
 * dangerous characters with harmless entities.
 */
function esc(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

/** Find a country object (flag/name) by its ISO code like "PT". */
function countryByCode(code) {
  return CONFIG.countries.find((c) => c.code === code) || null;
}

// ── HTML generators ──────────────────────────────────────────────

/** HTML for the "Game over — enter your name" form. */
export function formHtml() {
  // Build one radio option per country. First one is pre-selected.
  const options = CONFIG.countries.map((c, i) => `
    <label class="lb-country">
      <input type="radio" name="country" value="${c.code}" ${i === 0 ? 'checked' : ''} required />
      <span class="lb-flag" aria-hidden="true">${c.flag}</span>
      <span class="lb-cname">${c.name}</span>
    </label>
  `).join('');

  return `
    <div class="card lb-card lb-form-card">
      <h1>Game over</h1>
      <p class="big">Score <b>${game.score}</b> · Level <b>${game.level}</b></p>
      <form id="lb-form" autocomplete="off">
        <label class="lb-name-field">
          Player name
          <input id="lb-name" type="text" maxlength="16" required autofocus
                 placeholder="Enter your name" />
        </label>
        <fieldset class="lb-countries" aria-label="Country">
          <legend>Country</legend>
          ${options}
        </fieldset>
        <div class="lb-actions">
          <button type="submit" class="lb-btn primary">Save &amp; view leaderboard</button>
          <button type="button" id="lb-skip" class="lb-btn ghost">Skip</button>
        </div>
      </form>
    </div>
  `;
}

/** HTML for the ranked list after a score has been submitted. */
export function listHtml() {
  // Copy the array so we don't mutate the original, then sort highest first.
  const sorted = [...leaderboard].sort((a, b) => b.score - a.score).slice(0, 10);
  const rows = sorted.length === 0
    ? `<li class="lb-empty">No entries yet — be the first.</li>`
    : sorted.map((e, i) => `
        <li class="lb-row">
          <span class="lb-rank">${i + 1}</span>
          <span class="lb-flag" aria-hidden="true">${e.flag}</span>
          <span class="lb-name">${esc(e.name)}</span>
          <span class="lb-level">L${e.level}</span>
          <span class="lb-score">${e.score}</span>
        </li>
      `).join('');

  return `
    <div class="card lb-card lb-list-card">
      <h1>Leaderboard <span class="lb-sub">(this session)</span></h1>
      <ol class="lb-list" aria-label="Top scores this session">
        ${rows}
      </ol>
      <div class="lb-actions">
        <button type="button" id="lb-play-again" class="lb-btn primary">Play again</button>
      </div>
      <p class="hint">Clears when you refresh the page.</p>
    </div>
  `;
}

// ── Data layer ──────────────────────────────────────────────────

/** Push a new entry onto the session leaderboard array. */
export function addEntry({ name, countryCode, score, level }) {
  const country = countryByCode(countryCode);
  if (!country) return;
  leaderboard.push({
    name: name.trim().slice(0, 16) || 'Anon',
    country: country.code,
    countryName: country.name,
    flag: country.flag,
    score,
    level,
    when: Date.now(),
  });
}

// ── DOM wiring ───────────────────────────────────────────────────

/**
 * Wire up the form: handle Submit, handle Skip. On submit or skip
 * we swap the overlay HTML to show the ranked list instead.
 *
 * `onPlayAgain` is a callback from main.js that resets the game.
 */
export function bindFormHandlers(overlayEl, { onPlayAgain, onSubmitted }) {
  const form = overlayEl.querySelector('#lb-form');
  const skipBtn = overlayEl.querySelector('#lb-skip');
  if (!form) return;

  const submit = (e) => {
    e?.preventDefault?.();
    const nameEl    = form.querySelector('#lb-name');
    const countryEl = form.querySelector('input[name="country"]:checked');
    const name = nameEl?.value?.trim() || '';
    const countryCode = countryEl?.value;
    if (!name || !countryCode) { nameEl?.focus(); return; }

    addEntry({ name, countryCode, score: game.score, level: game.level });
    overlayEl.innerHTML = listHtml();
    bindListHandlers(overlayEl, { onPlayAgain });
    onSubmitted?.();
  };

  form.addEventListener('submit', submit);
  skipBtn?.addEventListener('click', () => {
    overlayEl.innerHTML = listHtml();
    bindListHandlers(overlayEl, { onPlayAgain });
  });
}

/** Wire up the list screen: just the "Play again" button. */
export function bindListHandlers(overlayEl, { onPlayAgain }) {
  overlayEl.querySelector('#lb-play-again')?.addEventListener('click', () => {
    onPlayAgain?.();
  });
}

/** Entry point used by main.js on GAMEOVER → LEADERBOARD transition. */
export function showLeaderboardForm(overlayEl, { onPlayAgain }) {
  overlayEl.innerHTML = formHtml();
  bindFormHandlers(overlayEl, { onPlayAgain, onSubmitted: () => {} });
  // Focus the name input once the browser has actually rendered it.
  setTimeout(() => overlayEl.querySelector('#lb-name')?.focus({ preventScroll: true }), 0);
}

/** Helper — other modules can ask "are we in the leaderboard phase?". */
export function isActive() {
  return game.phase === PHASE.LEADERBOARD;
}
