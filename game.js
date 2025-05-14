// game.js

// ========== КОНСТАНТЫ ==========
const RENDER_W       = 30;    // область 30×30 тайлов
const RENDER_H       = 30;
const TILE_SIZE      = 80;    // пикселей на тайл (приближение ×2.5)
const SPEED          = 3;     // тайлы в секунду
const FOG_FADE       = 0.5;   // альфа/секунду для memoryAlpha

// ========== CANVAS ==========
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

// внутренняя «логическая» резолюция
canvas.width  = RENDER_W * TILE_SIZE;
canvas.height = RENDER_H * TILE_SIZE;

// ========== ИГРОВЫЕ ОБЪЕКТЫ ==========
const gameMap = new GameMap(100, 100, RENDER_W, RENDER_H, TILE_SIZE);
const player  = {
  // старт в центре первой комнаты (добавляем +0.5, чтобы взять центр тайла)
  x: gameMap.rooms[0].cx + 0.5,
  y: gameMap.rooms[0].cy + 0.5,
  directionAngle: 0
};

// таймер для dt
let lastTime = performance.now();

function gameLoop(now = performance.now()) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  // 1) Считываем вектор от джойстика
  const iv = window.inputVector || { x: 0, y: 0 };

  // 2) Обновляем направление взгляда, если есть движение
  if (iv.x !== 0 || iv.y !== 0) {
    player.directionAngle = Math.atan2(iv.y, iv.x);
  }

  // 3) Плавное движение персонажа с учётом столкновений
  let nx = player.x + iv.x * SPEED * dt;
  let ny = player.y + iv.y * SPEED * dt;

  // Проверяем по X
  const tx = Math.floor(nx), ty = Math.floor(player.y);
  if (!gameMap.isWall(tx, ty)) {
    player.x = nx;
  }
  // Проверяем по Y
  const tx2 = Math.floor(player.x), ty2 = Math.floor(ny);
  if (!gameMap.isWall(tx2, ty2)) {
    player.y = ny;
  }

  // 4) Считаем новое поле зрения из текущей позиции и угла
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

  // 7) Отрисовка: камера всегда по центру игрока
  const camX = player.x - RENDER_W / 2;
  const camY = player.y - RENDER_H / 2;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // — отрисовываем тайлы
  for (let ry = 0; ry < RENDER_H; ry++) {
    for (let rx = 0; rx < RENDER_W; rx++) {
      const mx = Math.floor(camX + rx);
      const my = Math.floor(camY + ry);
      if (mx < 0 || my < 0 || mx >= gameMap.cols || my >= gameMap.rows) continue;
      const tile = gameMap.tiles[my][mx];
      ctx.globalAlpha = tile.memoryAlpha;
      ctx.fillStyle   = tile.type === 'wall' ? '#444' : '#888';
      ctx.fillRect(rx * TILE_SIZE, ry * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
  }
  ctx.globalAlpha = 1;

  // — отрисовываем монстров, смещая их на камеру
  window.monsters.forEach(m => {
    const sx = (m.x - camX) * TILE_SIZE;
    const sy = (m.y - camY) * TILE_SIZE;
    // Предполагаем, что в monsters.js есть метод drawAt(ctx, sx, sy)
    m.drawAt(ctx, sx, sy);
  });

  // — отрисовываем игрока в самом центре
  const px = (RENDER_W / 2 + 0.5) * TILE_SIZE;
  const py = (RENDER_H / 2 + 0.5) * TILE_SIZE;
  ctx.fillStyle = 'red';
  ctx.beginPath();
  ctx.arc(px, py, TILE_SIZE * 0.4, 0, Math.PI * 2);
  ctx.fill();

  requestAnimationFrame(gameLoop);
}

// Старт игрового цикла
gameLoop();