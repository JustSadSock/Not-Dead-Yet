// game.js

// ——————————————
//  Константы и Canvas
// ——————————————
const TILE_SIZE    = 32;           // размер тайла
const MOVE_SPEED   = 3;            // тайлов/сек
const FOV_ANGLE    = Math.PI/3;    // 60°
const FOV_HALF     = FOV_ANGLE/2;
const FOV_DIST     = 6;            // радиус видимости (тайлы)
const FADE_RATE    = 1/4;          // затухание memoryAlpha за 4 сек
const REGEN_PERIOD = 1.0;          // интервал пакетной перегенерации (сек)

const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
let C_W, C_H;
function onResize(){
  C_W = canvas.width  = window.innerWidth;
  C_H = canvas.height = window.innerHeight;
}
window.addEventListener('resize', onResize);
onResize();

// ——————————————
//  Игрок и ввод
// ——————————————
let player = { x:0, y:0, angle:0 };
if (!window.Input) window.Input = { dx:0, dy:0 };

// ——————————————
//  Инициализация карты
// ——————————————
const gameMap = new GameMap();
gameMap.ensureChunk(0, 0);
player.x = player.y = gameMap.chunkSize / 2;

// таймер и набор для пакетной регенерации
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

  // 0) Текущий чанк
  const pcx = Math.floor(player.x / gameMap.chunkSize),
        pcy = Math.floor(player.y / gameMap.chunkSize);

  // 1) Предзагрузка в радиусе CHUNK_RADIUS чанков
  const CHUNK_RADIUS = 2;   // 2 → 5×5 чанков
  for (let dy = -CHUNK_RADIUS; dy <= CHUNK_RADIUS; dy++) {
    for (let dx = -CHUNK_RADIUS; dx <= CHUNK_RADIUS; dx++) {
      gameMap.ensureChunk(pcx + dx, pcy + dy);
    }
  }

  // 2) Движение
  let vx = Input.dx, vy = Input.dy;
  const mag = Math.hypot(vx, vy) || 1;
  vx /= mag; vy /= mag;
  if (vx || vy) {
    player.angle = Math.atan2(vy, vx);
    const nx = player.x + vx * MOVE_SPEED * dt;
    const ny = player.y + vy * MOVE_SPEED * dt;
    if (gameMap.isFloor(Math.floor(nx), Math.floor(player.y))) player.x = nx;
    if (gameMap.isFloor(Math.floor(player.x), Math.floor(ny))) player.y = ny;
  }

  // 3) FOV + память тайлов
  const vis = computeFOV(player.x, player.y, player.angle);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx  = pcx + dx, cy = pcy + dy;
      const key = `${cx},${cy}`;
      const chunk = gameMap.chunks.get(key);
      const meta  = chunk.meta;
      const baseX = cx * gameMap.chunkSize;
      const baseY = cy * gameMap.chunkSize;
      for (let y = 0; y < gameMap.chunkSize; y++) {
        for (let x = 0; x < gameMap.chunkSize; x++) {
          const gx = baseX + x, gy = baseY + y;
          const coord = `${gx},${gy}`;
          const cell  = meta[y][x];
          if (vis.has(coord)) {
            cell.visited     = true;
            cell.memoryAlpha = 1;
          } else if (cell.memoryAlpha > 0) {
            cell.memoryAlpha = Math.max(0, cell.memoryAlpha - FADE_RATE * dt);
            if (cell.memoryAlpha === 0) {
              toRegen.add(key);
            }
          }
        }
      }
    }
  }

  // 4) Пакетная перегенерация с логами
  if (regenTimer >= REGEN_PERIOD) {
    regenTimer -= REGEN_PERIOD;
    if (toRegen.size) {
      console.log(">>> Пакет перегенерации:", Array.from(toRegen));
      gameMap.regenerateChunksPreserveFOV(
        toRegen,
        computeFOV,
        { x: player.x, y: player.y, angle: player.angle }
      );
      console.log(">>> После regen, ключи чанков:", Array.from(gameMap.chunks.keys()));
      toRegen.clear();
    }
  }

  // 5) Рендер
  render();
  requestAnimationFrame(loop);
}

// ——————————————
//  FOV (стены блокируют)
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
      if (ix<0||iy<0) break;
      visible.add(`${ix},${iy}`);
      if (!gameMap.isFloor(ix, iy)) break;
      dist += 0.2;
    }
  }
  return visible;
}

// ——————————————
//  Рендер
// ——————————————
function render() {
  ctx.fillStyle = "#000";
  ctx.fillRect(0,0,C_W,C_H);

  ctx.save();
  ctx.translate(C_W/2 - player.x*TILE_SIZE,
                C_H/2 - player.y*TILE_SIZE);

  const vis = computeFOV(player.x, player.y, player.angle);
  const minX = Math.floor(player.x - C_W/TILE_SIZE/2) - 1;
  const maxX = Math.floor(player.x + C_W/TILE_SIZE/2) + 1;
  const minY = Math.floor(player.y - C_H/TILE_SIZE/2) - 1;
  const maxY = Math.floor(player.y + C_H/TILE_SIZE/2) + 1;

  for (let gy = minY; gy <= maxY; gy++) {
    for (let gx = minX; gx <= maxX; gx++) {
      if (gx<0||gy<0) continue;
      const px = gx*TILE_SIZE, py = gy*TILE_SIZE;
      const ck = `${Math.floor(gx/gameMap.chunkSize)},${Math.floor(gy/gameMap.chunkSize)}`;
      if (!gameMap.chunks.has(ck)) continue;
      const ch   = gameMap.chunks.get(ck);
      const lx   = gx - Math.floor(gx/gameMap.chunkSize)*gameMap.chunkSize;
      const ly   = gy - Math.floor(gy/gameMap.chunkSize)*gameMap.chunkSize;
      const cell = ch.meta[ly][lx];
      const α    = cell.memoryAlpha;
      if (α <= 0) continue;
      ctx.globalAlpha = α;
      ctx.fillStyle   = ch.tiles[ly][lx] ? "#888" : "#444";
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    }
  }

  // рисуем игрока
  ctx.globalAlpha = 1;
  ctx.fillStyle   = "#f00";
  ctx.beginPath();
  ctx.arc(player.x*TILE_SIZE, player.y*TILE_SIZE, TILE_SIZE*0.4, 0, Math.PI*2);
  ctx.fill();

  ctx.restore();
}

// старт
requestAnimationFrame(loop);