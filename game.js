// game.js

// ——————————————————————————————
//  Импорты и константы
// ——————————————————————————————
import { GameMap } from './map.js';

const TILE_SIZE    = 32;            // размер тайла в px
const MOVE_SPEED   = 3;             // тайлов в секунду
const FOV_ANGLE    = Math.PI / 3;   // угол обзора — 60°
const FOV_HALF     = FOV_ANGLE / 2;
const FOV_DIST     = 6;             // дальность видимости в тайлах
const FADE_RATE    = 1 / 4;         // память стирается за 4 секунды
const REGEN_PERIOD = 1.0;           // каждые 1 секунду перегенерация вне поля зрения

// ——————————————————————————————
//  Canvas и размер окна
// ——————————————————————————————
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
let C_W, C_H;
function onResize() {
  C_W = canvas.width  = window.innerWidth;
  C_H = canvas.height = window.innerHeight;
}
window.addEventListener('resize', onResize);
onResize();

// ——————————————————————————————
//  Карта и игрок
// ——————————————————————————————
const gameMap = new GameMap(32);  // map.js сам вызывает генератор communal.js
const player  = { x: 0, y: 0, angle: 0 };

// чтобы не заспавниться в стене — поставим в центр чанка (0,0)
player.x = player.y = gameMap.chunkSize / 2;

// ——————————————————————————————
//  Управление (WASD + виртуальный джойстик)
// ——————————————————————————————
const keys = {};
window.addEventListener('keydown', e => { keys[e.key] = true; });
window.addEventListener('keyup',   e => { keys[e.key] = false; });

let joyDX = 0, joyDY = 0;
const joy  = document.getElementById('joystick');
const knob = document.getElementById('joystick-knob');

joy.addEventListener('pointerdown', e => {
  e.preventDefault();
  const id = e.pointerId;
  function onMove(ev) {
    if (ev.pointerId !== id) return;
    const r = joy.getBoundingClientRect();
    joyDX = (ev.clientX - (r.left + r.right)/2) / (r.width/2);
    joyDY = (ev.clientY - (r.top  + r.bottom)/2) / (r.height/2);
    const m = Math.hypot(joyDX, joyDY);
    if (m > 1) { joyDX /= m; joyDY /= m; }
    knob.style.transform = `translate(${joyDX*25}px,${joyDY*25}px)`;
  }
  function onUp(ev) {
    if (ev.pointerId !== id) return;
    joyDX = joyDY = 0;
    knob.style.transform = '';
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  }
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup',   onUp);
});

// ——————————————————————————————
//  Bresenham для лучевой проверки
// ——————————————————————————————
function getLine(x0, y0, x1, y1) {
  const pts = [];
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy, x = x0, y = y0;
  while (true) {
    pts.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx ) { err += dx; y += sy; }
  }
  return pts;
}

// ——————————————————————————————
//  computeFOV: проверка стен
// ——————————————————————————————
function computeFOV(px, py, angle) {
  const visible = new Set();
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

      // трассируем луч
      let blocked = false;
      for (const [lx, ly] of getLine(x0, y0, gx, gy).slice(1)) {
        if (!gameMap.isFloor(lx, ly)) {
          blocked = true;
          break;
        }
      }
      if (!blocked) visible.add(`${gx},${gy}`);
    }
  }

  return visible;
}

// ——————————————————————————————
//  Главный цикл
// ——————————————————————————————
let lastTime = performance.now();
let regenTimer = 0;

function loop(now = performance.now()) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  regenTimer += dt;

  // — движение игрока —
  let dx = (+!!(keys.d || keys.ArrowRight))
         - (+!!(keys.a || keys.ArrowLeft))
         + joyDX;
  let dy = (+!!(keys.s || keys.ArrowDown))
         - (+!!(keys.w || keys.ArrowUp))
         + joyDY;

  if (dx || dy) {
    const m = Math.hypot(dx, dy);
    dx = dx * MOVE_SPEED * dt / m;
    dy = dy * MOVE_SPEED * dt / m;

    const nx = player.x + dx;
    const ny = player.y + dy;

    if (gameMap.isFloor(Math.floor(nx), Math.floor(player.y))) player.x = nx;
    if (gameMap.isFloor(Math.floor(player.x), Math.floor(ny))) player.y = ny;

    player.angle = Math.atan2(dy, dx);
  }

  // — ensureChunk вокруг игрока 3×3 —
  const pcx = Math.floor(player.x / gameMap.chunkSize);
  const pcy = Math.floor(player.y / gameMap.chunkSize);
  for (let cy = pcy - 1; cy <= pcy + 1; cy++) {
    for (let cx = pcx - 1; cx <= pcx + 1; cx++) {
      gameMap.ensureChunk(cx, cy);
    }
  }

  // — реген забытых чанков —
  if (regenTimer >= REGEN_PERIOD) {
    regenTimer = 0;
    const toRegen = [];
    for (const key of gameMap.chunks.keys()) {
      const [cx, cy] = key.split(',').map(Number);
      if (Math.abs(cx - pcx) > 1 || Math.abs(cy - pcy) > 1) {
        toRegen.push(key);
      }
    }
    if (toRegen.length) {
      console.log('Regen chunks:', toRegen.join('; '));
      gameMap.regenerateChunksPreserveFOV(toRegen, computeFOV, player);
    }
  }

  // — fade memoryAlpha —
  for (const { meta } of gameMap.chunks.values()) {
    for (let y = 0; y < gameMap.chunkSize; y++) {
      for (let x = 0; x < gameMap.chunkSize; x++) {
        const m = meta[y][x];
        if (m.memoryAlpha > 0) {
          m.memoryAlpha = Math.max(0, m.memoryAlpha - dt * FADE_RATE);
        }
      }
    }
  }

  // — рендер —
  ctx.clearRect(0, 0, C_W, C_H);
  ctx.save();
  ctx.translate(
    C_W / 2 - player.x * TILE_SIZE,
    C_H / 2 - player.y * TILE_SIZE
  );

  const vis = computeFOV(player.x, player.y, player.angle);

  for (const { tiles, meta } of gameMap.chunks.values()) {
    for (let y = 0; y < gameMap.chunkSize; y++) {
      for (let x = 0; x < gameMap.chunkSize; x++) {
        const t = tiles[y][x];
        const gx = x + tiles.length * 0; // chunk offset handled in map.render if needed
        const gy = y + tiles.length * 0;

        const coord = `${gx},${gy}`;
        let alpha = meta[y][x].memoryAlpha;
        if (vis.has(coord)) {
          alpha = 1;
          meta[y][x].memoryAlpha = 1;
        }
        if (alpha <= 0) continue;

        ctx.globalAlpha = alpha;

        // цвета в render могут быть вынесены в CSS или спрайты
        ctx.fillStyle = (t === 'room'  ? '#88b4ff'
                        : t === 'hall'  ? '#6c9eff'
                        : t === 'door'  ? '#ffa500'
                        :                '#444');
        ctx.fillRect(gx * TILE_SIZE, gy * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
  }

  // — игрок —
  ctx.globalAlpha = 1;
  ctx.fillStyle   = '#f00';
  ctx.beginPath();
  ctx.arc(
    player.x * TILE_SIZE,
    player.y * TILE_SIZE,
    TILE_SIZE * 0.4,
    0,
    Math.PI * 2
  );
  ctx.fill();

  ctx.restore();
  requestAnimationFrame(loop);
}

// — глобальные ссылки (legacy) —
window.ctx       = ctx;
window.gameMap   = gameMap;
window.player    = player;
window.TILE_SIZE = TILE_SIZE;
window.C_W       = C_W;
window.C_H       = C_H;

// — старт —
requestAnimationFrame(loop);