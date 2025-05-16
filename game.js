// game.js

if (!window.Input) window.Input = { dx:0, dy:0 };

// Добавляем управление по клавишам WASD
const keyState = { w:0, a:0, s:0, d:0 };
window.addEventListener('keydown', e => {
  if (e.key === 'w') keyState.w = 1;
  if (e.key === 'a') keyState.a = 1;
  if (e.key === 's') keyState.s = 1;
  if (e.key === 'd') keyState.d = 1;
  window.Input.dx = keyState.d - keyState.a;
  window.Input.dy = keyState.s - keyState.w;
});
window.addEventListener('keyup', e => {
  if (e.key === 'w') keyState.w = 0;
  if (e.key === 'a') keyState.a = 0;
  if (e.key === 's') keyState.s = 0;
  if (e.key === 'd') keyState.d = 0;
  window.Input.dx = keyState.d - keyState.a;
  window.Input.dy = keyState.s - keyState.w;
});

// ——————————————
// Инициализация карты
// ——————————————
const gameMap = new GameMap();
gameMap.ensureChunk(0, 0);
// Ставим игрока в центр начального чанка (округляем вниз)
player.x = player.y = Math.floor(gameMap.chunkSize / 2);

// Таймер и набор для пакетной перегенерации
let lastTime   = performance.now();
let regenTimer = 0;
const toRegen  = new Set();

// ——————————————
// Основной цикл
// ——————————————
function loop(now = performance.now()) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  regenTimer += dt;

  // 0) Текущий чанк
  const pcx = Math.floor(player.x / gameMap.chunkSize),
        pcy = Math.floor(player.y / gameMap.chunkSize);

  // 1) Предзагрузка в радиусе чанков
  const CHUNK_RADIUS = 2;   // 5×5 чанков
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
      if (!chunk) continue;
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

  // 4) Пакетная регенерация забытых чанков
  if (regenTimer >= REGEN_PERIOD) {
    regenTimer -= REGEN_PERIOD;
    if (toRegen.size) {
      console.log(">>> Пакет перегенерации:", Array.from(toRegen));
      gameMap.regenerateChunksPreserveFOV(
        toRegen,
        computeFOV,
        { x: player.x, y: player.y, angle: player.angle }
      );
      console.log(">>> После regen, чанки:", Array.from(gameMap.chunks.keys()));
      toRegen.clear();
    }
  }

  // 5) Рендер
  render();
  requestAnimationFrame(loop);
}

// Функция отрисовки
function render() {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, C_W, C_H);

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
      const px = gx * TILE_SIZE, py = gy * TILE_SIZE;
      const ck = `${Math.floor(gx/gameMap.chunkSize)},${Math.floor(gy/gameMap.chunkSize)}`;
      if (!gameMap.chunks.has(ck)) continue;
      const ch   = gameMap.chunks.get(ck);
      const lx   = gx - Math.floor(gx/gameMap.chunkSize) * gameMap.chunkSize;
      const ly   = gy - Math.floor(gy/gameMap.chunkSize) * gameMap.chunkSize;
      const cell = ch.meta[ly][lx];
      const α    = cell.memoryAlpha;
      if (α <= 0) continue;
      ctx.globalAlpha = α;

      // Выбираем цвет по типу тайла
      const tileType = ch.tiles[ly][lx];
      if (tileType === 'wall') {
        ctx.fillStyle = "#444";         // тёмно-серый – стены
      } else if (tileType === 'hall') {
        ctx.fillStyle = "#888";         // серый – коридор
      } else if (tileType === 'room') {
        ctx.fillStyle = "#6699cc";      // приглушённо-синий – комната
      } else if (tileType === 'door') {
        ctx.fillStyle = "#cc9933";      // охра – дверь
      } else {
        ctx.fillStyle = "#000";         // на всякий – чёрный
      }
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    }
  }

  // Рисуем игрока (красным)
  ctx.globalAlpha = 1;
  ctx.fillStyle   = "#f00";
  ctx.beginPath();
  ctx.arc(player.x * TILE_SIZE, player.y * TILE_SIZE, TILE_SIZE*0.4, 0, Math.PI*2);
  ctx.fill();

  ctx.restore();
}

// Старт игры
requestAnimationFrame(loop);