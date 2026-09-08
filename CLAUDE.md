# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Tetris in vanilla JavaScript, HTML5 Canvas, CSS. No dependencies, no build step, no package.json.

## Run

```bash
open index.html              # macOS, just open it
python3 -m http.server 8000  # or serve locally, then visit localhost:8000
```

No build, lint, or test commands exist — none configured in repo.

## Architecture

Three files, no modules:

- `index.html` — DOM structure: `#board` canvas (300×600, 10×20 grid at `BLOCK=30`), `#next-canvas` preview (120×120), HUD spans (`#score`/`#lines`/`#level`), `#overlay` for pause/game-over.
- `style.css` — dark/retro arcade visuals only.
- `game.js` — all game logic, single global scope, no classes.

### State

Module-level `let` variables (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropAccum`, `dropInterval`, `animId`) hold all mutable game state. `board` is a `ROWS × COLS` matrix of `0` (empty) or color index `1–7`.

### Game loop

`requestAnimationFrame`-driven `loop(ts)`: accumulates `dt`, drops the piece one row when `dropAccum >= dropInterval`, otherwise locks it (`lockPiece` → `merge` + `clearLines` + `spawn`), then calls `draw()`.

### Key functions

- `collide(shape, ox, oy)` — bounds/overlap check, used by movement, rotation, and ghost projection.
- `rotateCW(shape)` — transpose + reverse rows.
- `tryRotate()` — rotates then wall-kicks through offsets `[0, -1, 1, -2, 2]`, discarding if all collide.
- `clearLines()` — bottom-up scan, splices full rows, unshifts empty ones, updates score/level/`dropInterval`.
- `ghostY()` — projects `current` straight down for the ghost-piece render.
- `spawn()` — promotes `next` to `current`, generates a new `next`; if the new `current` immediately collides, calls `endGame()`.

Tunable constants live at the top of `game.js`: `COLS`, `ROWS`, `BLOCK`, `COLORS`, `PIECES`, `LINE_SCORES`. Changing `COLS`/`ROWS`/`BLOCK` requires updating the `#board` canvas `width`/`height` in `index.html` to match (`COLS × BLOCK`, `ROWS × BLOCK`).
