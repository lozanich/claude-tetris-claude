'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#64b5f6', // J - pale blue
  '#ffb74d', // L - orange
  '#b0bec5', // Nut - metallic silver
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // Nut
];

const LINE_SCORES = [0, 100, 300, 500, 800];
const MAX_START_LEVEL = 10;

function dropIntervalFor(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
}

const RECORDS_KEY = 'records';
const MAX_RECORDS = 5;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const gameOverRestartBtn = document.getElementById('gameover-restart-btn');
const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const controlsBtn = document.getElementById('controls-btn');
const controlsList = document.getElementById('controls-list');
const startLevelSelect = document.getElementById('start-level');
const themeToggleBtn = document.getElementById('theme-toggle');
const nameForm = document.getElementById('name-form');
const nameLabel = document.getElementById('name-label');
const nameInput = document.getElementById('name-input');
const recordsEl = document.getElementById('records');
const recordsList = document.getElementById('records-list');
const recordsExtra = document.getElementById('records-extra');
const resetRecordsBtn = document.getElementById('reset-records');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let startLevel = 1;
let started = false, combo = 0, maxCombo = 0, pendingRank = -1;

function applyTheme(theme) {
  document.body.classList.toggle('light', theme === 'light');
  themeToggleBtn.textContent = theme === 'light' ? 'MODO OSCURO' : 'MODO CLARO';
}

function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  applyTheme(saved);
}

function toggleTheme() {
  const isLight = document.body.classList.contains('light');
  const theme = isLight ? 'dark' : 'light';
  applyTheme(theme);
  localStorage.setItem('theme', theme);
}

function loadRecords() {
  const empty = { scores: [], bestCombo: 0, maxLines: 0 };
  try {
    const data = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (!data || !Array.isArray(data.scores)) return empty;
    return {
      scores: data.scores.slice(0, MAX_RECORDS),
      bestCombo: data.bestCombo || 0,
      maxLines: data.maxLines || 0,
    };
  } catch {
    return empty;
  }
}

function saveRecords(records) {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch {}
}

// Posición (0-based) que ocuparía `s` en el top, o -1 si no entra.
function rankFor(s, records) {
  if (s <= 0) return -1;
  const idx = records.scores.findIndex(r => s > r.score);
  if (idx !== -1) return idx;
  return records.scores.length < MAX_RECORDS ? records.scores.length : -1;
}

function renderRecords(highlight = -1) {
  const records = loadRecords();
  recordsList.replaceChildren();
  for (let i = 0; i < MAX_RECORDS; i++) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'rec-name';
    const pts = document.createElement('span');
    const rec = records.scores[i];
    if (rec) {
      name.textContent = rec.name;
      pts.textContent = rec.score.toLocaleString();
    } else {
      li.className = 'empty';
      name.textContent = '---';
    }
    if (i === highlight) li.classList.add('highlight');
    li.append(name, pts);
    recordsList.appendChild(li);
  }
  recordsExtra.textContent = `Mejor combo: ${records.bestCombo} · Líneas máx: ${records.maxLines}`;
  resetRecordsBtn.textContent = 'Borrar records';
  resetRecordsBtn.classList.remove('confirm');
}

function submitName(e) {
  e.preventDefault();
  if (pendingRank < 0) return;
  const records = loadRecords();
  const name = nameInput.value.trim().slice(0, 10) || 'ANON';
  const idx = rankFor(score, records);
  records.scores.splice(idx, 0, { name, score });
  records.scores = records.scores.slice(0, MAX_RECORDS);
  saveRecords(records);
  pendingRank = -1;
  nameForm.classList.add('hidden');
  gameOverRestartBtn.classList.remove('hidden');
  renderRecords(idx);
}

function resetRecords() {
  if (!resetRecordsBtn.classList.contains('confirm')) {
    resetRecordsBtn.textContent = '¿Seguro?';
    resetRecordsBtn.classList.add('confirm');
    return;
  }
  saveRecords({ scores: [], bestCombo: 0, maxLines: 0 });
  pendingRank = -1;
  nameForm.classList.add('hidden');
  gameOverRestartBtn.classList.remove('hidden');
  renderRecords();
}

function gridColor() {
  return getComputedStyle(document.body).getPropertyValue('--grid-line').trim();
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * (PIECES.length - 1)) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    combo++;
    maxCombo = Math.max(maxCombo, combo);
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = startLevel + Math.floor(lines / 10);
    dropInterval = dropIntervalFor(level);
    updateHUD();
  } else {
    combo = 0;
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  if (gameOver) return;

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  const records = loadRecords();
  pendingRank = rankFor(score, records);
  records.bestCombo = Math.max(records.bestCombo, maxCombo);
  records.maxLines = Math.max(records.maxLines, lines);
  saveRecords(records);

  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  gameOverRestartBtn.textContent = 'Reiniciar';
  recordsEl.classList.remove('hidden');
  renderRecords();
  if (pendingRank >= 0) {
    nameLabel.textContent = `¡Puesto #${pendingRank + 1} del top!`;
    nameInput.value = '';
    nameForm.classList.remove('hidden');
    gameOverRestartBtn.classList.add('hidden');
    nameInput.focus();
  } else {
    nameForm.classList.add('hidden');
    gameOverRestartBtn.classList.remove('hidden');
  }
  pauseMenu.classList.add('hidden');
  overlay.classList.remove('hidden');
}

function showStart() {
  started = false;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'TETRIS';
  overlayScore.textContent = '';
  gameOverRestartBtn.textContent = 'Jugar';
  gameOverRestartBtn.classList.remove('hidden');
  pauseMenu.classList.add('hidden');
  nameForm.classList.add('hidden');
  recordsEl.classList.remove('hidden');
  renderRecords();
  overlay.classList.remove('hidden');
}

function startGame() {
  started = true;
  init();
}

function togglePause() {
  if (!started || gameOver) return;
  paused = !paused;
  if (!paused) {
    overlay.classList.add('hidden');
    pauseMenu.classList.add('hidden');
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    controlsList.classList.add('hidden');
    controlsBtn.setAttribute('aria-expanded', 'false');
    nameForm.classList.add('hidden');
    recordsEl.classList.add('hidden');
    gameOverRestartBtn.classList.add('hidden');
    pauseMenu.classList.remove('hidden');
    overlay.classList.remove('hidden');
    resumeBtn.focus();
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  paused = false;
  gameOver = false;
  combo = 0;
  maxCombo = 0;
  pendingRank = -1;
  dropInterval = dropIntervalFor(level);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  gameOverRestartBtn.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

function initStartLevelSelect() {
  for (let l = 1; l <= MAX_START_LEVEL; l++) {
    const opt = document.createElement('option');
    opt.value = l;
    opt.textContent = l;
    startLevelSelect.appendChild(opt);
  }
  startLevelSelect.value = startLevel;
}

document.addEventListener('keydown', e => {
  if (e.target === nameInput) return;
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', () => { restartBtn.blur(); init(); });
gameOverRestartBtn.addEventListener('click', () => { gameOverRestartBtn.blur(); startGame(); });
resumeBtn.addEventListener('click', () => { resumeBtn.blur(); togglePause(); });
controlsBtn.addEventListener('click', () => {
  const open = controlsList.classList.toggle('hidden') === false;
  controlsBtn.setAttribute('aria-expanded', String(open));
});
startLevelSelect.addEventListener('change', () => {
  startLevel = Number(startLevelSelect.value);
  startLevelSelect.blur();
});
nameForm.addEventListener('submit', submitName);
resetRecordsBtn.addEventListener('click', resetRecords);
themeToggleBtn.addEventListener('click', toggleTheme);

initTheme();
initStartLevelSelect();
init();
showStart();
