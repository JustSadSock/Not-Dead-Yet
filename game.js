// game.js

// ========== КОНСТАНТЫ ==========
const RENDER_W  = 30,    // 30×30 тайлов
      RENDER_H  = 30,
      TILE_SIZE = 100,   // увеличили приближение (100px на тайл)
      SPEED     = 3,     // тайлы/сек
      FOG_FADE  = 0.5;   // альфа/сек

// ========== CANVAS ==========
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

// внутренняя резолюция — 30×30 тайлов
canvas.width  = RENDER_W * TILE_SIZE;
canvas.height = RENDER_H * TILE_SIZE;

// ========== ОБЪЕКТЫ ==========
const gameMap = new GameMap(100, 100, RENDER_W, RENDER_H, TILE_SIZE);
const player  = {
  x: gameMap.rooms[0].cx + 0.5,
  y: gameMap.rooms[0].cy + 0.5,
  directionAngle: 0
};

// ========== ЦИКЛ ==========
let lastTime = performance.now();
function gameLoop(now = performance.now()) {
  const dt = (now - lastTime) / 1000;
  lastTime  = now;

  // 1) Читаем джойстик
  const iv = window.inputVector || { x:0, y:0 };

  // 2) Обновляем направление, если движемся
  if (iv.x !== 0 || iv.y !== 0) {
    player.directionAngle = Math.atan2(iv.y, iv.x);
  }

  // 3) Плавное движение + коллизии
  let nx = player.x + iv.x * SPEED * dt;
  let ny = player.y + iv.y * SPEED * dt;
  // X
  if (!gameMap.isWall(Math.floor(nx), Math.floor(player.y))) {
    player.x = nx;
  }
  // Y
  if (!gameMap.isWall(Math.floor(player.x), Math.floor(ny))) {
    player.y = ny;
  }

  // 4) Считаем FOV
  const visible = computeFOV(gameMap, {
    x: player.x,
    y: player.y,
    directionAngle: player.directionAngle
  });

  // 5) memoryAlpha & регенерация
  for (let y=0; y<gameMap.rows; y++) {
    for (let x=0; x<gameMap.cols; x++) {
      const t = gameMap.tiles[y][x];
      const key = `${x},${y}`;
      if (visible.has(key)) {
        t.memoryAlpha = 1;
      } else if (t.memoryAlpha > 0) {
        t.memoryAlpha = Math.max(0, t.memoryAlpha - FOG_FADE * dt);
        if (t.memoryAlpha === 0) {
          gameMap.regenerateTile(x, y);
        }
      }
    }
  }

  // 6) Монстры
  window.monsters.forEach(m => m.update(dt, visible));
  window.monsters = window.monsters.filter(m => !m.dead);

  // 7) Рисуем — двигаем всё на дробной камере
  const camX = player.x - RENDER_W/2;
  const camY = player.y - RENDER_H/2;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  // смещаем систему координат на -camera (в пикселях)
  ctx.translate(-camX * TILE_SIZE, -camY * TILE_SIZE);

  // — тайлы
  const startX = Math.floor(camX), endX = Math.ceil(camX + RENDER_W);
  const startY = Math.floor(camY), endY = Math.ceil(camY + RENDER_H);
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

  // — монстры (drawAt теперь смещается автоматически)
  window.monsters.forEach(m => m.draw(ctx));

  // — игрок
  const px = (player.x + 0.5) * TILE_SIZE;
  const py = (player.y + 0.5) * TILE_SIZE;
  ctx.fillStyle = 'red';
  ctx.beginPath();
  ctx.arc(px, py, TILE_SIZE * 0.4, 0, Math.PI*2);
  ctx.fill();

  ctx.restore();

  requestAnimationFrame(gameLoop);
}

// старт
gameLoop();