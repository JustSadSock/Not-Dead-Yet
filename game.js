// game.js

// ========== КОНСТАНТЫ ==========
const RENDER_W   = 30;    // ширина области в тайлах
const RENDER_H   = 30;    // высота области в тайлах
const TILE_SIZE  = 100;   // пикселей на тайл (приближение)
const SPEED      = 3;     // тайлы в секунду
const FOG_FADE   = 0.5;   // скорость тускнения (альфа/секунда)

// ========== CANVAS ==========
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
canvas.width  = RENDER_W * TILE_SIZE;
canvas.height = RENDER_H * TILE_SIZE;

// ========== ИГРОВЫЕ ОБЪЕКТЫ ==========
const gameMap = new GameMap(300, 300, RENDER_W, RENDER_H, TILE_SIZE);
const player  = {
  x: RENDER_W / 2 + 0.5,   // старт в центре чанка [0,0]
  y: RENDER_H / 2 + 0.5,
  directionAngle: 0
};
window.player   = player;
window.monsters = window.monsters || [];

// ========== ДЕЛТА-ВРЕМЯ ==========
let lastTime = performance.now();

// ========== ИГРОВОЙ ЦИКЛ ==========
function gameLoop(now = performance.now()) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  // --- 1) СНЯТИЕ ВВОДА И ПОВОРОТ ---
  const iv = window.inputVector || { x: 0, y: 0 };
  if (iv.x !== 0 || iv.y !== 0) {
    player.directionAngle = Math.atan2(iv.y, iv.x);
  }

  // --- 2) ПЛАВНОЕ ДВИЖЕНИЕ С ЖЁСТКОЙ КОЛЛИЗИЕЙ ---
  const nx = player.x + iv.x * SPEED * dt;
  const ny = player.y + iv.y * SPEED * dt;
  // шагаем только если оба тайла свободны
  if (!gameMap.isWall(Math.floor(nx), Math.floor(ny))) {
    player.x = nx;
    player.y = ny;
  }

  // --- 3) РАСЧЁТ ПОЛЯ ЗРЕНИЯ ---
  const visible = computeFOV(gameMap, {
    x: player.x,
    y: player.y,
    directionAngle: player.directionAngle
  });

  // --- 4) ОБНОВЛЕНИЕ memoryAlpha & РЕГЕНЕРАЦИЯ ВСЕХ ТАЙЛОВ ---
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

  // --- 5) ОБНОВЛЕНИЕ И ОЧИСТКА МОНСТРОВ ---
  window.monsters.forEach(m => m.update(dt, visible));
  window.monsters = window.monsters.filter(m => !m.dead);

  // --- 6) ОТРИСОВКА ---
  // смещение камеры так, чтобы игрок был в центре
  const camX = player.x - RENDER_W / 2;
  const camY = player.y - RENDER_H / 2;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(-camX * TILE_SIZE, -camY * TILE_SIZE);

  // отрисовка тайлов только в видимой области
  const startX = Math.floor(camX);
  const startY = Math.floor(camY);
  const endX   = Math.ceil(camX + RENDER_W);
  const endY   = Math.ceil(camY + RENDER_H);

  for (let y = startY; y < endY; y++) {
    if (y < 0 || y >= gameMap.rows) continue;
    for (let x = startX; x < endX; x++) {
      if (x < 0 || x >= gameMap.cols) continue;
      const tile = gameMap.tiles[y][x];
      ctx.globalAlpha = tile.memoryAlpha;
      ctx.fillStyle   = tile.type === 'wall' ? '#444' : '#888';
      ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
  }
  ctx.globalAlpha = 1;

  // отрисовка монстров (draw(ctx) использует абсолютные координаты)
  window.monsters.forEach(m => m.draw(ctx));

  // отрисовка игрока в центре экрана
  const px = (player.x + 0.5) * TILE_SIZE;
  const py = (player.y + 0.5) * TILE_SIZE;
  ctx.fillStyle = 'red';
  ctx.beginPath();
  ctx.arc(px, py, TILE_SIZE * 0.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
  requestAnimationFrame(gameLoop);
}

// ========== СТАРТ ==========
gameLoop();