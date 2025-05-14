// game.js

import {
  ensureChunk,
  isWall,
  regenerateChunksPreserveFOV,
  CHUNK_W,
  CHUNK_H,
  worldChunks
} from './map.js';

// ========== CONSTANTS ==========
const TILE_PX      = 27;    // размер тайла в пикселях
const MOVE_SPEED   = 3;     // тайлов в секунду
const FOG_FADE     = 0.5;   // единиц memoryAlpha в секунду
const REGEN_PERIOD = 1.0;   // секунд между пакетами перегенерации

// ========== CANVAS SETUP ==========
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
let VIEW_TILES_W, VIEW_TILES_H;

function resize() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  VIEW_TILES_W = Math.ceil(canvas.width  / TILE_PX) + 1;
  VIEW_TILES_H = Math.ceil(canvas.height / TILE_PX) + 1;
}
window.addEventListener('resize', resize);
resize();

// ========== PLAYER STATE ==========
const player = {
  x: 0.5 * CHUNK_W,
  y: 0.5 * CHUNK_H,
  angle: 0
};

// ========== TRACK INPUT ==========
const keyDir = { x: 0, y: 0 };
window.addEventListener('keydown', e => {
  if (e.key === 'w' || e.key === 'ArrowUp')    keyDir.y = -1;
  if (e.key === 's' || e.key === 'ArrowDown')  keyDir.y = +1;
  if (e.key === 'a' || e.key === 'ArrowLeft')  keyDir.x = -1;
  if (e.key === 'd' || e.key === 'ArrowRight') keyDir.x = +1;
});
window.addEventListener('keyup', e => {
  if (e.key === 'w' || e.key === 'ArrowUp')    keyDir.y = 0;
  if (e.key === 's' || e.key === 'ArrowDown')  keyDir.y = 0;
  if (e.key === 'a' || e.key === 'ArrowLeft')  keyDir.x = 0;
  if (e.key === 'd' || e.key === 'ArrowRight') keyDir.x = 0;
});

// ========== META for memory & visited ==========
// Мы храним для каждого чанка массив meta[y][x] = { type, memoryAlpha, visited }
function ensureChunkMeta(cx, cy) {
  const key = `${cx},${cy}`;
  ensureChunk(cx, cy);
  const chunk = worldChunks.get(key);
  if (!chunk.meta) {
    chunk.meta = Array.from({ length: CHUNK_H }, (_, y) =>
      Array.from({ length: CHUNK_W }, (_, x) => ({
        type:    chunk.tiles[y][x],
        memoryAlpha: 0,
        visited:     false
      }))
    );
  }
  return chunk.meta;
}

// ========== FOV CALCULATION ==========
function computeFOV(px, py, angle) {
  const visible = new Set();
  const R       = 10;
  const FOV     = Math.PI / 3;
  const HALF    = FOV/2;
  const STEPS   = 64;

  for (let i = 0; i <= STEPS; i++) {
    const a = angle - HALF + (i/STEPS)*FOV;
    const dx = Math.cos(a), dy = Math.sin(a);
    let dist = 0;
    while (dist < R) {
      const fx = px + dx*dist;
      const fy = py + dy*dist;
      const ix = Math.floor(fx), iy = Math.floor(fy);
      // Подгружаем чанк под этой клеткой
      ensureChunk(Math.floor(ix/CHUNK_W), Math.floor(iy/CHUNK_H));
      if (ix<0||iy<0) break;
      visible.add(`${ix},${iy}`);
      if (isWall(ix, iy)) break;
      dist += 0.2;
    }
  }
  return visible;
}

// ========== REGENERATION THROTTLE ==========
let lastTime   = performance.now();
let regenTimer = 0;
const toRegen  = new Set();

// ========== GAME LOOP ==========
function gameLoop(now=performance.now()) {
  const dt = (now - lastTime)/1000;
  lastTime = now;
  regenTimer += dt;

  // --- 1) MOVE & ROTATE ---
  let vx = keyDir.x, vy = keyDir.y;
  const mag = Math.hypot(vx, vy) || 1;
  vx /= mag; vy /= mag;
  if (vx||vy) player.angle = Math.atan2(vy, vx);
  const nx = player.x + vx * MOVE_SPEED * dt;
  const ny = player.y + vy * MOVE_SPEED * dt;
  if (!isWall(Math.floor(nx), Math.floor(ny))) {
    player.x = nx;
    player.y = ny;
  }

  // --- 2) FOV & MEMORY FADE ---
  const vis = computeFOV(player.x, player.y, player.angle);

  // Проходим по всем загруженным чанкам вокруг игрока
  const pxCh = Math.floor(player.x/CHUNK_W),
        pyCh = Math.floor(player.y/CHUNK_H);

  for (let cy = pyCh-1; cy <= pyCh+1; cy++) {
    for (let cx = pxCh-1; cx <= pxCh+1; cx++) {
      const meta = ensureChunkMeta(cx, cy);
      const baseX = cx*CHUNK_W, baseY = cy*CHUNK_H;
      for (let y=0; y<CHUNK_H; y++) {
        for (let x=0; x<CHUNK_W; x++) {
          const gx = baseX + x, gy = baseY + y;
          const cell = meta[y][x];
          const key  = `${gx},${gy}`;
          if (vis.has(key)) {
            // в поле зрения: отмечаем посещённым и выставляем память
            cell.visited = true;
            cell.memoryAlpha = 1;
          } else if (cell.memoryAlpha > 0) {
            // вне поля зрения: затухание
            cell.memoryAlpha = Math.max(0, cell.memoryAlpha - FOG_FADE*dt);
            if (cell.memoryAlpha === 0) {
              // полностью забыт — помечаем чанк на перегенерацию
              toRegen.add(`${cx},${cy}`);
            }
          }
        }
      }
    }
  }

  // --- 3) THROTTLED REGENERATION ---
  if (regenTimer >= REGEN_PERIOD) {
    regenTimer -= REGEN_PERIOD;
    if (toRegen.size) {
      regenerateChunksPreserveFOV(toRegen, coords=>{
        // адаптируем computeFOV→ возвращает Set<"gx,gy">
        return computeFOV(coords.x, coords.y, coords.angle);
      }, player);
      toRegen.clear();
    }
  }

  // --- 4) RENDER ---
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  // Центрируем камеру на игроке
  ctx.translate(
    canvas.width/2  - player.x*TILE_PX,
    canvas.height/2 - player.y*TILE_PX
  );

  // Рисуем видимую область: от (player.x - w/2) до ( +w/2 ), аналогично по y
  const left   = Math.floor(player.x - VIEW_TILES_W/2),
        top    = Math.floor(player.y - VIEW_TILES_H/2),
        right  = left + VIEW_TILES_W,
        bottom = top  + VIEW_TILES_H;

  for (let gy = top; gy <= bottom; gy++) {
    for (let gx = left; gx <= right; gx++) {
      if (gx < 0 || gy < 0) continue;
      const cx = Math.floor(gx/CHUNK_W), cy = Math.floor(gy/CHUNK_H);
      const lx = ((gx%CHUNK_W)+CHUNK_W)%CHUNK_W;
      const ly = ((gy%CHUNK_H)+CHUNK_H)%CHUNK_H;
      const key = `${cx},${cy}`;
      if (!worldChunks.has(key)) continue;
      const chunk = worldChunks.get(key);
      if (!chunk.meta) continue;
      const cell = chunk.meta[ly][lx];
      ctx.globalAlpha = cell.memoryAlpha;
      ctx.fillStyle   = (cell.type === WALL ? '#333' : '#888');
      ctx.fillRect(gx*TILE_PX, gy*TILE_PX, TILE_PX, TILE_PX);
    }
  }

  // Рисуем игрока
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'red';
  ctx.beginPath();
  ctx.arc(player.x*TILE_PX, player.y*TILE_PX, TILE_PX*0.4, 0, Math.PI*2);
  ctx.fill();

  ctx.restore();

  requestAnimationFrame(gameLoop);
}

// стартуем
requestAnimationFrame(gameLoop);