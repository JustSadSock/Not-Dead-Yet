// game.js
// ==========================================================
//  Настройки и Canvas
// ==========================================================
const TILE_SIZE    = 32;
const MOVE_SPEED   = 3;
const FOV_ANGLE    = Math.PI / 3;
const FOV_DIST     = 6;
const FADE_RATE    = 1 / 4;
const REGEN_PERIOD = 1.0;

const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
let C_W, C_H;
function resize() {
  C_W = canvas.width  = window.innerWidth;
  C_H = canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// ==========================================================
//  Игрок и ввод
// ==========================================================
const player = { x:0, y:0, angle:0 };
const Input  = { dx:0, dy:0 };

// ——— WASD ——————————————————————————
const k = {};
document.addEventListener('keydown',  e => k[e.key.toLowerCase()] = true );
document.addEventListener('keyup',    e => k[e.key.toLowerCase()] = false);
function readKeyboard() {
  Input.dx = (k['d']?1:0) - (k['a']?1:0);
  Input.dy = (k['s']?1:0) - (k['w']?1:0);
}

// ——— Джойстик —————————————————————————
// на вашем <div id="joystick">
const joyEl = document.getElementById('joystick');
const knob  = document.getElementById('joystick-knob');
let   joyId = null;
let   rect, maxR;

// при инициализации
function setupJoystick() {
  rect = joyEl.getBoundingClientRect();
  maxR = rect.width/2;
  // центрим «ручку»
  knob.style.left = `${rect.width/2}px`;
  knob.style.top  = `${rect.height/2}px`;
}
window.addEventListener('load', setupJoystick);
window.addEventListener('resize', setupJoystick);

joyEl.addEventListener('pointerdown', e => {
  e.preventDefault();
  joyEl.setPointerCapture(e.pointerId);
  joyId = e.pointerId;
});

joyEl.addEventListener('pointermove', e => {
  if (e.pointerId !== joyId) return;
  const cx = rect.left + rect.width/2;
  const cy = rect.top  + rect.height/2;
  let dx = e.clientX - cx;
  let dy = e.clientY - cy;
  const dist = Math.hypot(dx, dy);
  const clamped = Math.min(dist, maxR);
  const nx = dx / maxR;
  const ny = dy / maxR;
  Input.dx = nx;
  Input.dy = ny;
  // передвинуть ручку
  const ux = (dist>maxR ? dx/dist*maxR : dx) + rect.width/2;
  const uy = (dist>maxR ? dy/dist*maxR : dy) + rect.height/2;
  knob.style.left = `${ux}px`;
  knob.style.top  = `${uy}px`;
});

joyEl.addEventListener('pointerup', e => {
  if (e.pointerId !== joyId) return;
  joyEl.releasePointerCapture(e.pointerId);
  joyId = null;
  Input.dx = Input.dy = 0;
  // вернуть ручку в центр
  knob.style.left = `${rect.width/2}px`;
  knob.style.top  = `${rect.height/2}px`;
});
joyEl.addEventListener('pointercancel', e => {
  joyEl.dispatchEvent(new PointerEvent('pointerup', { pointerId: e.pointerId }));
});

// ==========================================================
//  Карта и стартовый спавн
// ==========================================================
const gameMap = new GameMap();  // из map/index.js
const CHUNK   = gameMap.chunkSize;

// гарантированно проходимая старт-позиция
function findSpawn() {
  gameMap.ensureChunk(0, 0);
  const tiles = gameMap.chunks.get('0,0').tiles;
  const cx = (CHUNK/2)|0, cy = (CHUNK/2)|0;
  const R  = CHUNK/2;
  for (let r = 0; r <= R; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x<0||y<0||x>=CHUNK||y>=CHUNK) continue;
        const t = tiles[y][x];
        if (t==='room' || t==='hall' || t==='door') {
          return { x: x + 0.5, y: y + 0.5 };
        }
      }
    }
  }
  return { x: cx+0.5, y: cy+0.5 };
}

Object.assign(player, findSpawn());
player.angle = 0;

// таймеры регена и FOV
let lastT = performance.now();
let regenT = 0;
const toRegen = new Set();

// ==========================================================
//  Основной цикл
// ==========================================================
function loop(now = performance.now()) {
  const dt = (now - lastT) / 1000;
  lastT = now;
  regenT += dt;

  readKeyboard();

  const pcx = Math.floor(player.x / CHUNK),
        pcy = Math.floor(player.y / CHUNK);

  // догрузка соседних чанков
  for (let oy = -2; oy <= 2; oy++) {
    for (let ox = -2; ox <= 2; ox++) {
      gameMap.ensureChunk(pcx + ox, pcy + oy);
    }
  }

  // движение
  let { dx, dy } = Input;
  const mag = Math.hypot(dx, dy) || 1;
  dx /= mag; dy /= mag;
  if (dx || dy) {
    player.angle = Math.atan2(dy, dx);
    const nx = player.x + dx * MOVE_SPEED * dt;
    if (gameMap.isFloor(nx|0, player.y|0)) player.x = nx;
    const ny = player.y + dy * MOVE_SPEED * dt;
    if (gameMap.isFloor(player.x|0, ny|0)) player.y = ny;
  }

  // FOV + память
  const vis = computeFOV(player.x, player.y, player.angle);
  for (const [key, ch] of gameMap.chunks) {
    const [cx, cy] = key.split(',').map(Number);
    const bx = cx * CHUNK, by = cy * CHUNK;
    for (let y = 0; y < CHUNK; y++) {
      for (let x = 0; x < CHUNK; x++) {
        const meta = ch.meta[y][x];
        const coord = `${bx + x},${by + y}`;
        if (vis.has(coord)) {
          meta.visited = true;
          meta.memoryAlpha = 1;
        } else if (meta.memoryAlpha > 0) {
          meta.memoryAlpha = Math.max(0, meta.memoryAlpha - FADE_RATE * dt);
          if (meta.memoryAlpha === 0) toRegen.add(key);
        }
      }
    }
  }

  // пакетная регенерация
  if (regenT >= REGEN_PERIOD) {
    regenT -= REGEN_PERIOD;
    if (toRegen.size) {
      gameMap.regenerateChunksPreserveFOV(toRegen, computeFOV, player);
      toRegen.clear();
    }
  }

  render();
  requestAnimationFrame(loop);
}

// ==========================================================
//  FOV
// ==========================================================
function computeFOV(px, py, angle) {
  const visible = new Set();
  const half = FOV_ANGLE/2, steps = 64;
  for (let i = 0; i <= steps; i++) {
    const a = angle - half + (i/steps)*FOV_ANGLE;
    const dx = Math.cos(a), dy = Math.sin(a);
    let d = 0;
    while (d < FOV_DIST) {
      const gx = Math.floor(px + dx*d),
            gy = Math.floor(py + dy*d);
      visible.add(`${gx},${gy}`);
      if (!gameMap.isFloor(gx, gy)) break;
      d += 0.2;
    }
  }
  return visible;
}

// ==========================================================
//  Рендер
// ==========================================================
function render() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0,0,C_W,C_H);

  ctx.save();
  ctx.translate(C_W/2 - player.x*TILE_SIZE, C_H/2 - player.y*TILE_SIZE);

  const vis = computeFOV(player.x, player.y, player.angle);
  const minX = Math.floor(player.x - C_W/TILE_SIZE/2) - 1;
  const maxX = Math.floor(player.x + C_W/TILE_SIZE/2) + 1;
  const minY = Math.floor(player.y - C_H/TILE_SIZE/2) - 1;
  const maxY = Math.floor(player.y + C_H/TILE_SIZE/2) + 1;

  for (let gy = minY; gy <= maxY; gy++) {
    for (let gx = minX; gx <= maxX; gx++) {
      const ck = `${Math.floor(gx/CHUNK)},${Math.floor(gy/CHUNK)}`;
      const ch = gameMap.chunks.get(ck);
      if (!ch) continue;
      const lx = ((gx % CHUNK)+CHUNK)%CHUNK;
      const ly = ((gy % CHUNK)+CHUNK)%CHUNK;
      const cell = ch.meta[ly][lx];
      if (cell.memoryAlpha <= 0) continue;

      const t = ch.tiles[ly][lx];
      let col = '#222';
      if (t === 'hall') col = '#5e5e5e';
      else if (t === 'door') col = '#cfa35e';
      else if (t === 'room') col = '#3e7eaa';

      ctx.globalAlpha = cell.memoryAlpha;
      ctx.fillStyle   = col;
      ctx.fillRect(gx*TILE_SIZE, gy*TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
  }

  // игрок
  ctx.globalAlpha = 1;
  ctx.fillStyle   = '#ff1e1e';
  ctx.beginPath();
  ctx.arc(
    player.x*TILE_SIZE,
    player.y*TILE_SIZE,
    TILE_SIZE*0.35, 0, Math.PI*2
  );
  ctx.fill();

  ctx.restore();
}

requestAnimationFrame(loop);