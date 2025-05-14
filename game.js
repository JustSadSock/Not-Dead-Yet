// game.js

// ========== КОНСТАНТЫ ==========
const TILE_SIZE            = 32;   // размер тайла в пикселях
const MAP_W                = 40;   // ширина карты в тайлах
const MAP_H                = 30;   // высота карты в тайлах
const SPEED                = 3;    // скорость игрока (тайлы/секунда)
const FOG_FADE             = 0.5;  // скорость тускнения вне обзора (альфа/секунда)
const JOYSTICK_ZONE_HEIGHT = 120;  // высота зоны под джойстик (px)

// ========== CANVAS & RESIZE ==========
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

// Логические размеры
canvas.width  = MAP_W * TILE_SIZE;
canvas.height = MAP_H * TILE_SIZE;

// Адаптивные CSS-размеры под мобильный экран
function resizeCanvas() {
  const vw = window.innerWidth;
  const vh = window.innerHeight - JOYSTICK_ZONE_HEIGHT;
  canvas.style.width  = vw + 'px';
  canvas.style.height = vh + 'px';
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ========== ИГРОВЫЕ ОБЪЕКТЫ ==========
const gameMap = new GameMap(MAP_W, MAP_H, TILE_SIZE);
const player  = {
  x: MAP_W / 2,             // позиция в тайлах (float для плавного движения)
  y: MAP_H / 2,
  directionAngle: 0         // угол взгляда в радианах
};

// Таймер последнего кадра
let lastTime = performance.now();

// ========== ОСНОВНОЙ ЦИКЛ ==========
function gameLoop(now = performance.now()) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  // --- 1) ДВИЖЕНИЕ И ПОВОРОТ ---
  const iv = window.inputVector || { x: 0, y: 0 };
  player.x += iv.x * SPEED * dt;
  player.y += iv.y * SPEED * dt;
  // ограничиваем внутри карты
  player.x = Math.max(0, Math.min(player.x, MAP_W - 1));
  player.y = Math.max(0, Math.min(player.y, MAP_H - 1));

  // --- 2) ВЫЧИСЛЕНИЕ ПОЛЯ ЗРЕНИЯ ---
  const visible = computeFOV(gameMap, {
    x: Math.floor(player.x),
    y: Math.floor(player.y),
    directionAngle: player.directionAngle
  });

  // --- 3) ОБНОВЛЕНИЕ memoryAlpha И РЕГЕНЕРАЦИЯ ТАЙЛОВ ---
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
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

  // --- 4) ОБНОВЛЕНИЕ И ОЧИСТКА МОНСТРОВ ---
  window.monsters.forEach(m => m.update(dt, visible));
  window.monsters = window.monsters.filter(m => !m.dead);

  // --- 5) ОТРИСОВКА КАРТЫ ---
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const tile = gameMap.tiles[y][x];
      ctx.globalAlpha = tile.memoryAlpha;
      ctx.fillStyle   = tile.type === 'wall' ? '#444' : '#888';
      ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
  }
  ctx.globalAlpha = 1;

  // --- 6) ОТРИСОВКА МОНСТРОВ ---
  window.monsters.forEach(m => m.draw(ctx));

  // --- 7) ОТРИСОВКА ИГРОКА ---
  ctx.fillStyle = 'red';
  ctx.beginPath();
  ctx.arc(
    (player.x + 0.5) * TILE_SIZE,
    (player.y + 0.5) * TILE_SIZE,
    TILE_SIZE * 0.4,
    0,
    Math.PI * 2
  );
  ctx.fill();

  // --- 8) НОВЫЙ КАДР ---
  requestAnimationFrame(gameLoop);
}

// Стартуем!
requestAnimationFrame(gameLoop);