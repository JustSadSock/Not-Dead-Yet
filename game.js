// game.js

// ========== КОНСТАНТЫ ==========
const RENDER_W   = 30;    // ширина области в тайлах
const RENDER_H   = 30;    // высота области в тайлах
const TILE_SIZE  = 100;   // пикселей на тайл
const SPEED      = 3;     // тайлов в секунду
const FOG_FADE   = 0.5;   // скорость тускнения (альфа/сек)

// ========== CANVAS ==========
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
canvas.width  = RENDER_W * TILE_SIZE;
canvas.height = RENDER_H * TILE_SIZE;

// ========== ПОЛЕ ЗРЕНИЯ ==========
/** 
 * Ray‐casting FOV: возвращает Set строк "x,y" видимых тайлов 
 */
function computeFOV(gameMap, player) {
  const visible  = new Set();
  const maxR     = 10;            // радиус обзора в тайлах
  const fullFOV  = Math.PI / 3;   // 60°
  const halfFOV  = fullFOV / 2;
  const dir      = player.directionAngle;
  const rays     = 64;

  for (let i = 0; i <= rays; i++) {
    const angle = dir - halfFOV + (i / rays) * fullFOV;
    const dx    = Math.cos(angle);
    const dy    = Math.sin(angle);
    let dist    = 0;
    while (dist < maxR) {
      const fx = player.x + dx * dist;
      const fy = player.y + dy * dist;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      // генерируем чанк, если нужно
      gameMap.ensureChunk(Math.floor(ix/RENDER_W), Math.floor(iy/RENDER_H));
      if (ix < 0 || iy < 0 || ix >= gameMap.cols || iy >= gameMap.rows) break;
      visible.add(`${ix},${iy}`);
      if (gameMap.tiles[iy][ix].type === 'wall') break;
      dist += 0.2;
    }
  }
  return visible;
}

// ========== ИГРОВАЯ КАРТА ==========
const gameMap = new GameMap(300, 300, RENDER_W, RENDER_H, TILE_SIZE);

// ========== ИГРОК ==========
const player = {
  x: RENDER_W/2 + 0.5,  // старт в центре чанка [0,0]
  y: RENDER_H/2 + 0.5,
  directionAngle: 0
};
window.player = player;

// ========== МОНСТРЫ ==========
window.monsters = window.monsters || [];

// ========== DELTA-TIME ==========
let lastTime = performance.now();

function gameLoop(now = performance.now()) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  // --- 1) Ввод и поворот ---
  const iv = window.inputVector || { x: 0, y: 0 };
  if (iv.x !== 0 || iv.y !== 0) {
    player.directionAngle = Math.atan2(iv.y, iv.x);
  }

  // --- 2) Плавное движение с жёсткой коллизией ---
  const nx = player.x + iv.x * SPEED * dt;
  const ny = player.y + iv.y * SPEED * dt;
  // если новая клетка свободна, двигаемся
  if (!gameMap.isWall(Math.floor(nx), Math.floor(ny))) {
    player.x = nx;
    player.y = ny;
  }

  // --- 3) Считаем FOV ---
  const visible = computeFOV(gameMap, player);

  // --- 4) Обновляем memoryAlpha и перегенерируем забытые тайлы по всей карте ---
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

  // --- 5) Обновляем и очищаем монстров ---
  window.monsters.forEach(m => m.update(dt, visible));
  window.monsters = window.monsters.filter(m => !m.dead);

  // --- 6) Подготовка к отрисовке ---
  const camX   = player.x - RENDER_W/2;
  const camY   = player.y - RENDER_H/2;
  const startX = Math.floor(camX);
  const startY = Math.floor(camY);
  const endX   = Math.ceil(camX + RENDER_W);
  const endY   = Math.ceil(camY + RENDER_H);

  // убедимся, что все чанки в области видимости существуют
  for (let cx = Math.floor(startX / RENDER_W); cx <= Math.floor((endX-1)/RENDER_W); cx++) {
    for (let cy = Math.floor(startY / RENDER_H); cy <= Math.floor((endY-1)/RENDER_H); cy++) {
      gameMap.ensureChunk(cx, cy);
    }
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(-camX * TILE_SIZE, -camY * TILE_SIZE);

  // --- 7) Отрисовка тайлов ---
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

  // --- 8) Отрисовка монстров ---
  window.monsters.forEach(m => m.draw(ctx));

  // --- 9) Отрисовка игрока в центре экрана ---
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