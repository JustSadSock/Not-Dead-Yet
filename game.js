// game.js
// ==========================================================
//  Канвас, базовые константы
// ==========================================================
const TILE_SIZE    = 32;          // px
const MOVE_SPEED   = 3;           // тайлов/сек
const FOV_ANGLE    = Math.PI / 3; // 60°
const FOV_DIST     = 6;           // тайлов
const FADE_RATE    = 1 / 4;       // α → 0 за 4 c
const REGEN_PERIOD = 1.0;         // сек

const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
let C_W, C_H;
function resize () {
  C_W = canvas.width  = window.innerWidth;
  C_H = canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// ==========================================================
//  Игрок + ввод  (W-A-S-D и виртуальный джойстик)
// ==========================================================
const player = { x: 0, y: 0, angle: 0 };
const Input  = { dx: 0, dy: 0 };

// --- клавиатура WASD --------------------------------------------------------
const kState = {};
window.addEventListener('keydown', e => {
  kState[e.key.toLowerCase()] = true;
});
window.addEventListener('keyup', e => {
  kState[e.key.toLowerCase()] = false;
});
function readKeyboard () {
  Input.dx = (kState['d'] ? 1 : 0) - (kState['a'] ? 1 : 0);
  Input.dy = (kState['s'] ? 1 : 0) - (kState['w'] ? 1 : 0);
}

// --- мобильный джойстик -----------------------------------------------------
/*  Простейший «палец-джойстик»: при touchstart фиксируем центр,
 *  движение пальца → вектор [-1..1] в Input.dx/dy  */
let joyCenter = null;
canvas.addEventListener('touchstart', ev => {
  const t = ev.touches[0];
  joyCenter = { x: t.clientX, y: t.clientY };
});
canvas.addEventListener('touchmove', ev => {
  if (!joyCenter) return;
  const t = ev.touches[0];
  const dx = (t.clientX - joyCenter.x) / 64;
  const dy = (t.clientY - joyCenter.y) / 64;
  Input.dx = Math.max(-1, Math.min(1, dx));
  Input.dy = Math.max(-1, Math.min(1, dy));
});
canvas.addEventListener('touchend', () => {
  joyCenter = null;
  Input.dx = Input.dy = 0;
});

// ==========================================================
//  Карта
// ==========================================================
const gameMap = new GameMap();        // из map.js
const CHUNK   = gameMap.chunkSize;

gameMap.ensureChunk(0, 0);
player.x = player.y = CHUNK / 2;

// таймеры
let lastT = performance.now();
let regenT = 0;
const toRegen = new Set();

// ==========================================================
//  Основной цикл
// ==========================================================
function loop (now = performance.now()) {
  const dt = (now - lastT) / 1000;
  lastT = now;
  regenT += dt;

  readKeyboard();                            // WASD

  const pcx = Math.floor(player.x / CHUNK);
  const pcy = Math.floor(player.y / CHUNK);

  // ---------- догружаем соседние чанки --------------------
  const R = 2;                               // радиус в чанках
  for (let dy = -R; dy <= R; dy++)
    for (let dx = -R; dx <= R; dx++)
      gameMap.ensureChunk(pcx + dx, pcy + dy);

  // ---------- движение ------------------------------------
  let { dx, dy } = Input;
  const mag = Math.hypot(dx, dy) || 1;
  dx /= mag; dy /= mag;

  if (dx || dy) {
    player.angle = Math.atan2(dy, dx);

    const nx = player.x + dx * MOVE_SPEED * dt;
    if (gameMap.isFloor(nx | 0, player.y | 0)) player.x = nx;

    const ny = player.y + dy * MOVE_SPEED * dt;
    if (gameMap.isFloor(player.x | 0, ny | 0)) player.y = ny;
  }

  // ---------- FOV + память --------------------------------
  const vis = computeFOV(player.x, player.y, player.angle);

  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const cx = pcx + dx, cy = pcy + dy, key = `${cx},${cy}`;
      const ch = gameMap.chunks.get(key);
      if (!ch) continue;

      const bX = cx * CHUNK, bY = cy * CHUNK;
      for (let y = 0; y < CHUNK; y++)
        for (let x = 0; x < CHUNK; x++) {
          const m = ch.meta[y][x];
          const gk = `${bX + x},${bY + y}`;

          if (vis.has(gk)) {
            m.visited = true;
            m.memoryAlpha = 1;
          } else if (m.memoryAlpha > 0) {
            m.memoryAlpha = Math.max(0, m.memoryAlpha - FADE_RATE * dt);
            if (m.memoryAlpha === 0) toRegen.add(key);
          }
        }
    }

  // ---------- пакетная регенерация ------------------------
  if (regenT >= REGEN_PERIOD) {
    regenT -= REGEN_PERIOD;
    if (toRegen.size) {
      gameMap.regenerateChunksPreserveFOV(
        toRegen,
        computeFOV,
        player
      );
      toRegen.clear();
    }
  }

  render();
  requestAnimationFrame(loop);
}

// ==========================================================
//  FOV — лучевой кастинг 60°
// ==========================================================
function computeFOV (px, py, angle) {
  const res = new Set();
  const steps = 64;
  const half = FOV_ANGLE / 2;

  for (let i = 0; i <= steps; i++) {
    const a  = angle - half + (i / steps) * FOV_ANGLE;
    const dx = Math.cos(a), dy = Math.sin(a);
    let d = 0;

    while (d < FOV_DIST) {
      const gx = Math.floor(px + dx * d);
      const gy = Math.floor(py + dy * d);
      res.add(`${gx},${gy}`);
      if (!gameMap.isFloor(gx, gy)) break;
      d += 0.2;
    }
  }
  return res;
}

// ==========================================================
//  Рендер
// ==========================================================
function render () {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, C_W, C_H);

  ctx.save();
  ctx.translate(C_W / 2 - player.x * TILE_SIZE,
                C_H / 2 - player.y * TILE_SIZE);

  const vis = computeFOV(player.x, player.y, player.angle);

  const minX = Math.floor(player.x - C_W / TILE_SIZE / 2) - 1;
  const maxX = Math.floor(player.x + C_W / TILE_SIZE / 2) + 1;
  const minY = Math.floor(player.y - C_H / TILE_SIZE / 2) - 1;
  const maxY = Math.floor(player.y + C_H / TILE_SIZE / 2) + 1;

  for (let gy = minY; gy <= maxY; gy++)
    for (let gx = minX; gx <= maxX; gx++) {
      const ck = `${Math.floor(gx / CHUNK)},${Math.floor(gy / CHUNK)}`;
      const ch = gameMap.chunks.get(ck);
      if (!ch) continue;

      const lx = ((gx % CHUNK) + CHUNK) % CHUNK;
      const ly = ((gy % CHUNK) + CHUNK) % CHUNK;

      const meta = ch.meta[ly][lx];
      if (meta.memoryAlpha <= 0) continue;

      const t = ch.tiles[ly][lx];
      let col = '#222';
      if (t === 'hall')  col = '#5e5e5e';
      if (t === 'door')  col = '#cfa35e';
      if (t === 'room')  col = '#3e7eaa';

      ctx.globalAlpha = meta.memoryAlpha;
      ctx.fillStyle   = col;
      ctx.fillRect(gx * TILE_SIZE, gy * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }

  // игрок
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ff1e1e';
  ctx.beginPath();
  ctx.arc(player.x * TILE_SIZE, player.y * TILE_SIZE, TILE_SIZE * 0.35, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ==========================================================
requestAnimationFrame(loop);