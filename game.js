// game.js

// ========== КОНСТАНТЫ ==========
const RENDER_W   = 30,    // область 30×30 тайлов
      RENDER_H   = 30,
      TILE_SIZE  = 80,    // 2.5×32
      SPEED      = 3,     // тайлы/сек
      FOG_FADE   = 0.5;   // альфа/сек

// ========== CANVAS ==========
const canvas = document.getElementById('gameCanvas'),
      ctx    = canvas.getContext('2d');

// внутренняя резолюция: 30×30 тайлов
canvas.width  = RENDER_W * TILE_SIZE;
canvas.height = RENDER_H * TILE_SIZE;

// ========== ИГРОВЫЕ ОБЪЕКТЫ ==========
const gameMap = new GameMap(100, 100, RENDER_W, RENDER_H, TILE_SIZE);
const player  = {
  x: gameMap.rooms[0].cx + 0.5,  // стартуем в центре первой комнаты
  y: gameMap.rooms[0].cy + 0.5,
  dir: 0                         // угол взгляда
};

let last = performance.now();

// ========== ЦИКЛ ==========
function gameLoop(now = performance.now()) {
  const dt = (now - last) / 1000;
  last = now;

  // 1) Читаем вектор от джойстика
  const iv = window.inputVector || { x: 0, y: 0 };

  // 2) Предлагаем движение
  let nx = player.x + iv.x * SPEED * dt;
  let ny = player.y + iv.y * SPEED * dt;

  // 3) Проверяем коллизию со стенами (по тайлу)
  // по X
  const tx = Math.floor(nx), ty = Math.floor(player.y);
  if (!gameMap.isWall(tx, ty)) player.x = nx;
  // по Y
  const ty2 = Math.floor(ny), tx2 = Math.floor(player.x);
  if (!gameMap.isWall(tx2, ty2)) player.y = ny;

  // 4) Обновляем направление взгляда
  player.dir = window.player && window.player.directionAngle || player.dir;

  // 5) Считаем FOV из центра клетки
  const visible = computeFOV(gameMap, {
    x: Math.floor(player.x) + 0.5,
    y: Math.floor(player.y) + 0.5,
    directionAngle: player.dir
  });

  // 6) memoryAlpha + перегенерация
  for (let y = 0; y < gameMap.rows; y++) {
    for (let x = 0; x < gameMap.cols; x++) {
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

  // 7) Обновляем монстров
  window.monsters.forEach(m => m.update(dt, visible));
  window.monsters = window.monsters.filter(m => !m.dead);

  // 8) Отрисовка — камера следует за игроком
  const camX = player.x - RENDER_W/2,
        camY = player.y - RENDER_H/2;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // тайлы
  for (let ry = 0; ry < RENDER_H; ry++) {
    for (let rx = 0; rx < RENDER_W; rx++) {
      const mx = Math.floor(camX + rx),
            my = Math.floor(camY + ry);
      if (mx < 0 || my < 0 || mx >= gameMap.cols || my >= gameMap.rows) continue;
      const tile = gameMap.tiles[my][mx];
      ctx.globalAlpha = tile.memoryAlpha;
      ctx.fillStyle   = tile.type === 'wall' ? '#444' : '#888';
      ctx.fillRect(rx * TILE_SIZE, ry * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
  }
  ctx.globalAlpha = 1;

  // монстры
  window.monsters.forEach(m => {
    // рисуем их смещёнными на камеру
    const sx = (m.x - camX) * TILE_SIZE,
          sy = (m.y - camY) * TILE_SIZE;
    m.drawAt(ctx, sx, sy);
  });

  // игрок – всегда в центре: (RENDER_W/2, RENDER_H/2)
  const px = (RENDER_W/2 + 0.5) * TILE_SIZE,
        py = (RENDER_H/2 + 0.5) * TILE_SIZE;
  ctx.fillStyle = 'red';
  ctx.beginPath();
  ctx.arc(px, py, TILE_SIZE * 0.4, 0, Math.PI*2);
  ctx.fill();

  requestAnimationFrame(gameLoop);
}

// старт
gameLoop();