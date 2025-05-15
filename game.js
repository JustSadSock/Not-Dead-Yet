// game.js

// ——————————————
//  Константы и холст
// ——————————————
const TILE_SIZE    = 32;           // размер тайла в px
const MOVE_SPEED   = 3;            // скорость игрока (тайлы/сек)
const FOV_ANGLE    = Math.PI / 3;  // 60°
const FOV_HALF     = FOV_ANGLE / 2;
const FOV_DIST     = 6;            // видимость в тайлах
const FADE_RATE    = 1 / 4;        // memoryAlpha до 0 за 4 сек
const REGEN_PERIOD = 1.0;          // интервал пакета переген. сек

const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
let C_W, C_H;

// подстройка размера canvas
function onResize() {
  C_W = canvas.width  = window.innerWidth;
  C_H = canvas.height = window.innerHeight;
}
window.addEventListener('resize', onResize);
onResize();

// ——————————————
//  Игрок и ввод
// ——————————————
let player = { x:0, y:0, angle:0 };
// Controls.js пишет в window.Input.dx/y
if (!window.Input) window.Input = { dx:0, dy:0 };

// ——————————————
//  Инициализация карты
// ——————————————
const gameMap = new GameMap();
gameMap.ensureChunk(0, 0);
player.x = player.y = gameMap.chunkSize / 2;
gameMap.currentChunkX = 0;
gameMap.currentChunkY = 0;

// для перегенерации
let lastTime   = performance.now();
let regenTimer = 0;
const toRegen  = new Set();

// ——————————————
//  Основной цикл
// ——————————————
function loop(now = performance.now()) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  regenTimer += dt;

  // 1) движение
  let vx = Input.dx, vy = Input.dy;
  const mag = Math.hypot(vx, vy) || 1;
  vx /= mag; vy /= mag;
  if (vx || vy) {
    player.angle = Math.atan2(vy, vx);
    const nx = player.x + vx * MOVE_SPEED * dt;
    const ny = player.y + vy * MOVE_SPEED * dt;
    // коллизии
    if (gameMap.isFloor(Math.floor(nx), Math.floor(player.y))) player.x = nx;
    if (gameMap.isFloor(Math.floor(player.x), Math.floor(ny))) player.y = ny;
  }

  // 2) FOV и память
  const vis = computeFOV(player.x, player.y, player.angle);
  const pcx = Math.floor(player.x / gameMap.chunkSize);
  const pcy = Math.floor(player.y / gameMap.chunkSize);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = pcx + dx, cy = pcy + dy;
      gameMap.ensureChunk(cx, cy);
      const chunkKey = `${cx},${cy}`;
      const chunk    = gameMap.chunks.get(chunkKey);
      const meta     = chunk.meta;
      const baseX    = cx * gameMap.chunkSize;
      const baseY    = cy * gameMap.chunkSize;
      for (let y = 0; y < gameMap.chunkSize; y++) {
        for (let x = 0; x < gameMap.chunkSize; x++) {
          const gx = baseX + x;
          const gy = baseY + y;
          const key = `${gx},${gy}`;
          const cell = meta[y][x];
          if (vis.has(key)) {
            cell.visited     = true;
            cell.memoryAlpha = 1;
          } else if (cell.memoryAlpha > 0) {
            cell.memoryAlpha = Math.max(0, cell.memoryAlpha - FADE_RATE * dt);
            if (cell.memoryAlpha === 0) {
              toRegen.add(chunkKey);
            }
          }
        }
      }
    }
  }

  // 3) троттл перегенерации
  if (regenTimer >= REGEN_PERIOD) {
    regenTimer -= REGEN_PERIOD;
    if (toRegen.size) {
      gameMap.regenerateChunksPreserveFOV(
        toRegen,
        computeFOV,
        { x: player.x, y: player.y, angle: player.angle }
      );
      toRegen.clear();
    }
  }

  // 4) отрисовка
  render();

  requestAnimationFrame(loop);
}

// ——————————————
//  Вычисление FOV (стены блокируют обзор)
// ——————————————
function computeFOV(px, py, angle) {
  const visible = new Set();
  const steps = 64;
  for (let i = 0; i <= steps; i++) {
    const a  = angle - FOV_HALF + (i/steps)*FOV_ANGLE;
    const dx = Math.cos(a), dy = Math.sin(a);
    let dist = 0;
    while (dist < FOV_DIST) {
      const fx = px + dx*dist, fy = py + dy*dist;
      const ix = Math.floor(fx), iy = Math.floor(fy);
      if (ix < 0 || iy < 0) break;
      const key = `${ix},${iy}`;
      visible.add(key);
      if (!gameMap.isFloor(ix, iy)) break;
      dist += 0.2;
    }
  }
  return visible;
}

// ——————————————
//  Рендеринг
// ——————————————
function render() {
  // чёрный фон
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, C_W, C_H);

  // центруем камеру на игроке
  const ox = C_W/2 - player.x*TILE_SIZE;
  const oy = C_H/2 - player.y*TILE_SIZE;
  ctx.save();
  ctx.translate(ox, oy);

  const vis = computeFOV(player.x, player.y, player.angle);
  const minX = Math.floor(player.x - C_W/TILE_SIZE/2) - 1;
  const maxX = Math.floor(player.x + C_W/TILE_SIZE/2) + 1;
  const minY = Math.floor(player.y - C_H/TILE_SIZE/2) - 1;
  const maxY = Math.floor(player.y + C_H/TILE_SIZE/2) + 1;

  for (let gy = minY; gy <= maxY; gy++) {
    for (let gx = minX; gx <= maxX; gx++) {
      if (gx < 0 || gy < 0) continue;
      const px = gx * TILE_SIZE;
      const py = gy * TILE_SIZE;
      const cx = Math.floor(gx / gameMap.chunkSize);
      const cy = Math.floor(gy / gameMap.chunkSize);
      const chunkKey = `${cx},${cy}`;
      if (!gameMap.chunks.has(chunkKey)) continue;
      const chunk = gameMap.chunks.get(chunkKey);
      const lx = gx - cx*gameMap.chunkSize;
      const ly = gy - cy*gameMap.chunkSize;
      const cell = chunk.meta[ly][lx];
      const α = cell.memoryAlpha;
      if (α <= 0) continue;
      ctx.globalAlpha = α;
      if (vis.has(`${gx},${gy}`)) {
        // в FOV: земля — светло-серая, стена — тёмно-серая
        ctx.fillStyle = gameMap.isFloor(gx,gy) ? '#aaa' : '#444';
      } else {
        // по памяти — средняя серая
        ctx.fillStyle = gameMap.isFloor(gx,gy) ? '#888' : '#444';
      }
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    }
  }

  // рисуем игрока красным
  ctx.globalAlpha = 1;
  ctx.fillStyle   = '#f00';
  ctx.beginPath();
  ctx.arc(player.x*TILE_SIZE, player.y*TILE_SIZE, TILE_SIZE*0.4, 0, Math.PI*2);
  ctx.fill();

  ctx.restore();
}

// старт
requestAnimationFrame(loop);