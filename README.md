# AI Breakout+ — Accessibility Edition

Hands-free Arkanoid-style game controlled by webcam head movement and eye blinks.
Lean MVP: head-tracked paddle · blink launch / laser · Expand + Laser power-ups ·
colorblind-safe palette · keyboard fallback · session leaderboard.

## Run

`getUserMedia` requires a secure context — **do not open `index.html` via `file://`**. From this folder:

```bash
python3 -m http.server 8000
```

Then open **http://localhost:8000** in Chrome (recommended) or Safari 17+.

First visit triggers calibration (face → neutral → left → right → blink threshold). Result is cached in `localStorage`; press **R** to redo.

## Keys

| Key | Action |
|---|---|
| `←` / `→` | Move paddle (fallback without webcam) |
| `Space` | Launch ball / fire laser (fallback for blink) |
| `P` | Pause / resume |
| `D` | Toggle debug overlay (FPS, phase) |
| `R` | Recalibrate |

## How the code is organised

The whole game is plain HTML + CSS + JavaScript — **no build step, no bundler, no frameworks**. You can open any file in a text editor and read it top to bottom. Every `src/*.js` file starts with a big comment block explaining what it does in plain English.

### The "shell" — what the browser loads first

- **`index.html`** — the page itself. Contains the `<canvas>` that the game is drawn on, the `<video>` that receives the webcam feed, the side panels for live stats, and the `<div id="overlay">` where pop-ups (pause, calibration, leaderboard) are shown. Loads `src/main.js` as a module.
- **`style.css`** — all visual styling: colours, panel layout, webcam badge states (READY / DETECTED / BLINK! / LOST), and the leaderboard form + ranked list styles.

### The modules (`src/`)

Think of these like **Lego bricks**. Each file has one job. Files only talk to each other through clean imports — nobody reaches into someone else's variables.

| File | One-line job | Beginner analogy |
|---|---|---|
| **`main.js`** | Boots everything, runs the per-frame game loop | The conductor of an orchestra — starts each section, keeps time |
| **`config.js`** | All tunable numbers and colours (thresholds, speeds, palette, countries) | The settings menu — change numbers here, never hunt through code |
| **`state.js`** | The shared "current state" of the game (score, lives, paddle, balls, bricks…) | The score-sheet everyone reads from and writes to |
| **`vision.js`** | Talks to the webcam and the face-tracking AI (MediaPipe) | The "eyes" — reports where your head is and whether you blinked |
| **`calibration.js`** | The wizard on first load (look left, look right, blink a few times) | Eye-exam at the optician — tunes the game to **your** face |
| **`game.js`** | The rules: paddle movement, ball physics, brick breaking, power-ups | The referee — decides what happens every frame |
| **`render.js`** | Paints the current state onto the `<canvas>` | The artist — never changes the game, only draws it |
| **`hud.js`** | Updates the numbers on the side panels + the overlay pop-up | The scoreboard operator |
| **`leaderboard.js`** | The "enter your name + country" form after game over, plus the ranked list | The high-scores screen at the end of an arcade game |

### How a single frame works

Every ~16 ms (60 times a second), this happens:

```
webcam frame ─► vision.js  ─► updates `input` (headX, blinkActive) in state.js
                                         │
game loop ◄──────────────────────────────┘
   ├─ updatePaddle   (move paddle toward head or arrow keys)
   ├─ updateGame     (move ball, check collisions, handle power-ups)
   ├─ render         (paint canvas)
   └─ updateHud      (update side-panel numbers)
```

Vision and the game each have their **own** frame loop. They share data through the `input` object in `state.js` — vision writes, game reads. Nothing else.

### Where to change common things

| I want to… | Edit this file |
|---|---|
| Make the paddle faster / slower | `config.js` → `physics.paddleMaxVx` *(keyboard)* or `game.js` → `updatePaddle` *(head tracking easing)* |
| Make the blink easier / harder to detect | `config.js` → `blink.threshold` and `calibration.js` → threshold formula |
| Change the colour scheme | `config.js` → `palette` |
| Add a new country to the leaderboard | `config.js` → `countries` array (code + flag + name) |
| Add a new brick layout or difficulty | `config.js` → `level` + `game.js` → `buildBricks` |
| Add a keyboard shortcut | `main.js` → `setupInput` |

## Stack

- Vanilla ES modules, no build step
- HTML5 Canvas2D
- `@mediapipe/tasks-vision@0.10.14` (FaceLandmarker, blendshape-based blink)

## Accessibility notes

- **Palette**: Okabe-Ito colorblind-safe; no red/green dependence.
- **Power-ups**: Letter labels (**E**, **L**) + pattern (vertical stripes, diagonal hatch) in addition to color.
- **Keyboard fallback**: All actions work without webcam.
- **Calibration**: Adapts head range + blink threshold to the individual user.
- **Auto-pause**: Switching browser tabs pauses the game.

## Leaderboard

- Appears automatically when you lose your third life.
- Choose a name (max 16 characters) and one of four countries (flag shown).
- Ranks top 10 by score, highest first.
- **Session-only**: refreshing the page clears it. This is intentional — a kiosk-style leaderboard, not a global one.

## Deferred (future passes)

- Shrink / Triple / Slow / Fast power-ups
- AI4VET + EU funding branding bar
- Light/dark mode toggle
- Protanopia / Deuteranopia / Tritanopia simulation
- Adjustable sensitivity sliders beyond calibration

## Known caveats

- First load pulls the MediaPipe `.task` model (~6 MB) from Google's CDN.
- Safari cold-start for WASM is noticeably slower than Chrome.
- Flag emojis (🇵🇹 🇸🇮 🇸🇰 🇷🇸) render as colourful flags on macOS/iOS/Linux and recent Chrome; older Windows may show two-letter boxes instead.
