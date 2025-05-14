// game.js

// ========== КОНСТАНТЫ ==========
const RENDER_W       = 30,    // размеры «камера» в тайлах
      RENDER_H       = 30,
      TILE_SIZE      = 100,   // пикселей на тайл (приближение)
      SPEED          = 3,     // тайлов в секунду
      FOG_FADE       = 0.5;   // скорость тускнения (альфа/сек)

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

  // 1) Читаем вектор от джойстика
  const iv = window.inputVector || { x: 0, y: 0 };

  // 2) Обновляем направление взгляда, если есть движение
  if (iv.x !== 0 || iv.y !== 0) {
    player.directionAngle = Math.atan2(iv.y, iv.x);
  }

  // 3) Плавное движение с коллизиями
  let nx = player.x + iv.x * SPEED * dt;
  let ny = player.y + iv.y * SPEED * dt;

  // проверяем по X
  if (!gameMap.isWall(Math.floor(nx), Math.floor(player.y))) {
    player.x = nx;
  }
  // по Y
  if (!gameMap.isWall(Math.floor(player.x), Math.floor(ny))) {
    player.y = ny;
  }

  // 4) Считаем новое поле зрения
  const visible = computeFOV(gameMap, {
    x: player.x,
    y: player.y,
    directionAngle: player.directionAngle
  });

  // 5) Обновляем memoryAlpha и перегенерируем «забытые» тайлы
  for (let y = 0; y < gameMap.rows; y++) {
    for (let x = 0; x < gameMap.cols; x++) {
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

  // 6) Обновляем и очищаем монстров
  window.monsters.forEach(m => m.update(dt, visible));
  window.monsters = window.monsters.filter(m => !m.dead);

  // 7) Отрисовка: камера всегда центрирована на игроке
  const camX = player.x - RENDER_W / 2;
  const camY = player.y - RENDER_H / 2;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(-camX * TILE_SIZE, -camY * TILE_SIZE);

  // — тайлы
  const startX = Math.floor(camX), endX = Math.ceil(camX + RENDER_W);
  const startY = Math.floor(camY), endY = Math.ceil(camY + RENDER_H);
  for (let yy = startY; yy < endY; yy++) {
    for (let xx = startX; xx < endX; xx++) {
      if (xx < 0 || yy < 0 || xx >= gameMap.cols || yy >= gameMap.rows) continue;
      const tile = gameMap.tiles[yy][xx];
      ctx.globalAlpha = tile.memoryAlpha;
      ctx.fillStyle   = tile.type === 'wall' ? '#444' : '#888';
      ctx.fillRect(xx * TILE_SIZE, yy * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
  }
  ctx.globalAlpha = 1;

  // — монстры
  window.monsters.forEach(m => m.draw(ctx));

  // — игрок
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