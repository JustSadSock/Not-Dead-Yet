// game.js

// ========== КОНСТАНТЫ ==========
const RENDER_W  = 30;    // ширина области (тайлов)
const RENDER_H  = 30;    // высота области (тайлов)
const TILE_SIZE = 100;   // пикселей на тайл (зум ×2.5)
const SPEED     = 3;     // тайлов в секунду
const FOG_FADE  = 0.5;   // альфа/секунда для memoryAlpha

// ========== CANVAS ==========
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
// Логическая внутренняя резолюция
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
// чтобы controls.js мог менять направление:
window.player = player;

// таймер для delta time
let lastTime = performance.now();

function gameLoop(now = performance.now()) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  // --- 1) Ввод с джойстика и направление взгляда ---
  const iv = window.inputVector || { x: 0, y: 0 };
  if (iv.x !== 0 || iv.y !== 0) {
    player.directionAngle = Math.atan2(iv.y, iv.x);
  }

  // --- 2) Плавное движение + коллизии ---
  let nx = player.x + iv.x * SPEED * dt;
  let ny = player.y + iv.y * SPEED * dt;
  // проверяем по X
  if (!gameMap.isWall(Math.floor(nx), Math.floor(player.y))) {
    player.x = nx;
  }
  // проверяем по Y
  if (!gameMap.isWall(Math.floor(player.x), Math.floor(ny))) {
    player.y = ny;
  }

  // --- 3) Расчёт поля зрения ---
  const visible = computeFOV(gameMap, {
    x: player.x,
    y: player.y,
    directionAngle: player.directionAngle
  });

  // --- 4) Границы области (кадра) ---
  const camX   = player.x - RENDER_W / 2;
  const camY   = player.y - RENDER_H / 2;
  const startX = Math.floor(camX);
  const startY = Math.floor(camY);
  const endX   = Math.ceil(camX + RENDER_W);
  const endY   = Math.ceil(camY + RENDER_H);

  // --- 5) Обновление memoryAlpha + перегенерация только в области ---
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

  // --- 6) Обновление и очистка монстров ---
  window.monsters.forEach(m => m.update(dt, visible));
  window.monsters = window.monsters.filter(m => !m.dead);

  // --- 7) Отрисовка ---
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  // смещение камеры
  ctx.translate(-camX * TILE_SIZE, -camY * TILE_SIZE);

  // — тайлы
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

  // — монстры
  window.monsters.forEach(m => m.draw(ctx));

  // — игрок (в центре экрана)
  const px = (player.x + 0.5) * TILE_SIZE;
  const py = (player.y + 0.5) * TILE_SIZE;
  ctx.fillStyle = 'red';
  ctx.beginPath();
  ctx.arc(px, py, TILE_SIZE * 0.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
  requestAnimationFrame(gameLoop);
}

// запускаем цикл
gameLoop();