// game.js
//
// Полностью рабочий “главный цикл”, взятый из проверенной сборки с коридорами.
// Ничего лишнего — только: ввод, движение, FOV, fade-память, регенерация,
// рендер.  Для джойстика используется window.joyDX / joyDY из controls.js.

import { GameMap } from './map.js';

// ——————————————————————————
//  Константы
// ——————————————————————————
const TILE_SIZE    = 32;
const MOVE_SPEED   = 3;           // тайлов/сек
const FOV_ANGLE    = Math.PI / 3; // 60°
const FOV_HALF     = FOV_ANGLE / 2;
const FOV_DIST     = 6;           // радиус видимости (тайлы)
const FADE_RATE    = 1 / 4;       // memoryAlpha → 0 за 4 с
const REGEN_PERIOD = 1.0;         // перегенерация чанков, сек

// ——————————————————————————
//  Canvas
// ——————————————————————————
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
let C_W, C_H;
function onResize() {
  C_W = canvas.width  = window.innerWidth;
  C_H = canvas.height = window.innerHeight;
}
window.addEventListener('resize', onResize);
onResize();

// ——————————————————————————
//  Карта и игрок
// ——————————————————————————
const gameMap = new GameMap(32);

// генерим чанк (0,0) и ищем первую клетку 'room'
gameMap.ensureChunk(0, 0);
const start = gameMap.chunks.get('0,0');
let spawnX = 16, spawnY = 16;
outer: for (let y = 0; y < 32; y++) {
  for (let x = 0; x < 32; x++) {
    if (start.tiles[y][x] === 'room') { spawnX = x + 0.5; spawnY = y + 0.5; break outer; }
  }
}
const player = { x: spawnX, y: spawnY, angle: 0 };

// ——————————————————————————
//  Ввод – клавиши (WASD/стрелки)
//  Джойстик задаётся в controls.js как window.joyDX / joyDY
// ——————————————————————————
const keys = {};
window.addEventListener('keydown', e => keys[e.key] = true);
window.addEventListener('keyup',   e => keys[e.key] = false);

// ——————————————————————————
//  Помощник Bresenham
// ——————————————————————————
function getLine(x0, y0, x1, y1) {
  const pts = [];
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1,   sy = y0 < y1 ? 1 : -1;
  let err = dx - dy, x = x0, y = y0;
  while (true) {
    pts.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = err * 2;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 <  dx) { err += dx; y += sy; }
  }
  return pts;
}

// ——————————————————————————
//  FOV (с учётом стен)
// ——————————————————————————
function computeFOV(px, py, angle) {
  const vis = new Set();
  const cosA = Math.cos(angle), sinA = Math.sin(angle);
  const x0 = Math.floor(px), y0 = Math.floor(py);

  for (let dy = -FOV_DIST; dy <= FOV_DIST; dy++) {
    for (let dx = -FOV_DIST; dx <= FOV_DIST; dx++) {
      const gx = x0 + dx, gy = y0 + dy;
      const vx = gx + 0.5 - px, vy = gy + 0.5 - py;
      const dist = Math.hypot(vx, vy);
      if (dist > FOV_DIST + 0.5) continue;
      const dot = (vx * cosA + vy * sinA) / dist;
      if (dot < Math.cos(FOV_HALF)) continue;

      let blocked = false;
      for (const [lx, ly] of getLine(x0, y0, gx, gy).slice(1)) {
        if (!gameMap.isFloor(lx, ly)) { blocked = true; break; }
      }
      if (!blocked) vis.add(`${gx},${gy}`);
    }
  }
  return vis;
}

// ——————————————————————————
//  Главный цикл
// ——————————————————————————
let lastTime   = performance.now();
let regenTimer = 0;

function loop(now = performance.now()) {
  const dt = (now - lastTime) / 1000;
  lastTime  = now;
  regenTimer += dt;

  // — движение —
  const joyX = window.joyDX ?? 0,
        joyY = window.joyDY ?? 0;
  let dx = (+!!(keys.d || keys.ArrowRight)) - (+!!(keys.a || keys.ArrowLeft)) + joyX;
  let dy = (+!!(keys.s || keys.ArrowDown)) - (+!!(keys.w || keys.ArrowUp))   + joyY;

  if (dx || dy) {
    const m = Math.hypot(dx, dy);
    dx = dx * MOVE_SPEED * dt / m;
    dy = dy * MOVE_SPEED * dt / m;
    const nx = player.x + dx, ny = player.y + dy;
    if (gameMap.isFloor(Math.floor(nx), Math.floor(player.y))) player.x = nx;
    if (gameMap.isFloor(Math.floor(player.x), Math.floor(ny))) player.y = ny;
    player.angle = Math.atan2(dy, dx);
  }

  // — ensureChunk вокруг игрока 3×3 —
  const pcx = Math.floor(player.x / gameMap.chunkSize);
  const pcy = Math.floor(player.y / gameMap.chunkSize);
  for (let cy = pcy - 1; cy <= pcy + 1; cy++)
    for (let cx = pcx - 1; cx <= pcx + 1; cx++)
      gameMap.ensureChunk(cx, cy);

  // — перегенерация забытых чанков —
  if (regenTimer >= REGEN_PERIOD) {
    regenTimer = 0;
    const toRegen = [];
    for (const key of gameMap.chunks.keys()) {
      const [cx, cy] = key.split(',').map(Number);
      if (Math.abs(cx - pcx) > 1 || Math.abs(cy - pcy) > 1)
        toRegen.push(key);
    }
    if (toRegen.length) {
      console.log('Regen:', toRegen.join('; '));
      gameMap.regenerateChunksPreserveFOV(toRegen, computeFOV, player);
    }
  }

  // — fade memory —
  for (const { meta } of gameMap.chunks.values())
    for (const row of meta)
      for (const m of row)
        if (m.memoryAlpha > 0)
          m.memoryAlpha = Math.max(0, m.memoryAlpha - dt * FADE_RATE);

  // — рендер —
  ctx.clearRect(0,0,C_W,C_H);
  ctx.save();
  ctx.translate(C_W/2 - player.x*TILE_SIZE,
                C_H/2 - player.y*TILE_SIZE);

  const vis = computeFOV(player.x, player.y, player.angle);

  for (const [key, chunk] of gameMap.chunks) {
    const [cx, cy] = key.split(',').map(Number);
    const baseX = cx * gameMap.chunkSize,
          baseY = cy * gameMap.chunkSize;

    for (let y = 0; y < gameMap.chunkSize; y++) {
      for (let x = 0; x < gameMap.chunkSize; x++) {
        const t = chunk.tiles[y][x];
        const gx = baseX + x, gy = baseY + y;
        const c  = `${gx},${gy}`;

        let alpha = chunk.meta[y][x].memoryAlpha;
        if (vis.has(c)) {
          alpha = 1;
          chunk.meta[y][x].memoryAlpha = 1;
        }
        if (alpha <= 0) continue;

        ctx.globalAlpha = alpha;
        ctx.fillStyle = (t === 'room') ? '#88b4ff'
                     : (t === 'hall') ? '#6c9eff'
                     : (t === 'door') ? '#ffa500'
                     :                  '#666';  // wall (видимый)
        ctx.fillRect(gx*TILE_SIZE, gy*TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
  }

  // игрок
  ctx.globalAlpha = 1;
  ctx.fillStyle   = '#f00';
  ctx.beginPath();
  ctx.arc(player.x*TILE_SIZE, player.y*TILE_SIZE,
          TILE_SIZE*0.4, 0, Math.PI*2);
  ctx.fill();

  ctx.restore();
  requestAnimationFrame(loop);
}

// — globals —
window.ctx       = ctx;
window.gameMap   = gameMap;
window.player    = player;
window.TILE_SIZE = TILE_SIZE;

// — старт —
requestAnimationFrame(loop);