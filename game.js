// game.js

// ========== КОНСТАНТЫ ==========
const RENDER_W       = 30;    // ширина области в тайлах
const RENDER_H       = 30;    // высота области в тайлах
const TILE_SIZE      = 100;   // пикселей на один тайл
const SPEED          = 3;     // тайлов в секунду
const FOG_FADE       = 0.5;   // скорость тускнения (альфа/сек)

// ========== CANVAS ==========
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
canvas.width  = RENDER_W * TILE_SIZE;
canvas.height = RENDER_H * TILE_SIZE;

// ========== ИГРОВЫЕ ОБЪЕКТЫ ==========
const gameMap = new GameMap(100, 100, RENDER_W, RENDER_H, TILE_SIZE);
// Вариант B: стартуем ровно в центре чанка [0,0]
const player = {
  x: RENDER_W / 2 + 0.5,
  y: RENDER_H / 2 + 0.5,
  directionAngle: 0
};

// таймер для dt
let lastTime = performance.now();

function gameLoop(now = performance.now()) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  // --- 1) Читаем ввод с джойстика и обновляем направление ---
  const iv = window.inputVector || { x: 0, y: 0 };
  if (iv.x !== 0 || iv.y !== 0) {
    player.directionAngle = Math.atan2(iv.y, iv.x);
  }

  // --- 2) Плавное движение с учётом коллизий ---
  let nx = player.x + iv.x * SPEED * dt;
  let ny = player.y + iv.y * SPEED * dt;
  if (!gameMap.isWall(Math.floor(nx), Math.floor(player.y))) {
    player.x = nx;
  }
  if (!gameMap.isWall(Math.floor(player.x), Math.floor(ny))) {
    player.y = ny;
  }

  // --- 3) Считаем поле зрения из текущей позиции ---
  const visible = computeFOV(gameMap, {
    x: player.x,
    y: player.y,
    directionAngle: player.directionAngle
  });

  // --- 4) Вычисляем границы области, которую рисуем и обновляем ---
  const camX   = player.x - RENDER_W / 2;
  const camY   = player.y - RENDER_H / 2;
  const startX = Math.floor(camX);
  const startY = Math.floor(camY);
  const endX   = Math.ceil(camX + RENDER_W);
  const endY   = Math.ceil(camY + RENDER_H);

  // --- 5) Обновляем memoryAlpha и перегенерируем забытые тайлы только в этой области ---
  for (let y = startY; y < endY; y++) {
    if (y < 0 || y >= gameMap.rows) continue;
    for (let x = startX; x < endX; x++) {
      if (x < 0 || x >= gameMap.cols) continue;
      const tile = gameMap.tiles[y][x];
      const key  = `${x},${y}`;
      if (visible.has(key)) {
        tile.memoryAlpha = 1;
      } else if (tile.memoryAlpha > 0) {
        tile.memoryAlpha = Math.max(0, tile.memoryAlpha - FOG_FADE * dt);
        if (tile.memoryAlpha === 0) {
          gameMap.regenerateTile(x, y);
        }
      }
    }
  }

  // --- 6) Обновляем и очищаем монстров ---
  window.monsters.forEach(m => m.update(dt, visible));
  window.monsters = window.monsters.filter(m => !m.dead);

  // --- 7) ОЧИСТКА И ПОДГОТОВКА К ОТРИСОВКЕ ---
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  // Сдвигаем систему координат, чтобы «камера» следовала за игроком
  ctx.translate(-camX * TILE_SIZE, -camY * TILE_SIZE);

  // --- 8) ОТРИСОВКА ТАЙЛОВ В ОБЛАСТИ ---
  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      if (x < 0 || y < 0 || x >= gameMap.cols || y >= gameMap.rows) continue;
      const tile = gameMap.tiles[y][x];
      ctx.globalAlpha = tile.memoryAlpha;
      ctx.fillStyle   = tile.type === 'wall' ? '#444' : '#888';
      ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
  }
  ctx.globalAlpha = 1;

  // --- 9) ОТРИСОВКА МОНСТРОВ ---
  window.monsters.forEach(m => {
    // draw(ctx) уже рисует монстра относительно абсолютных координат
    m.draw(ctx);
  });

  // --- 10) ОТРИСОВКА ИГРОКА ---
  const px = (player.x + 0.5) * TILE_SIZE;
  const py = (player.y + 0.5) * TILE_SIZE;
  ctx.fillStyle = 'red';
  ctx.beginPath();
  ctx.arc(px, py, TILE_SIZE * 0.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
  requestAnimationFrame(gameLoop);
}

// Старт игрового цикла
gameLoop();