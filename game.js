// параметры
const TILE_SIZE = 32;
const MAP_W = 40, MAP_H = 30;

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width  = MAP_W * TILE_SIZE;
canvas.height = MAP_H * TILE_SIZE;

// игровые объекты
const gameMap = new GameMap(MAP_W, MAP_H, TILE_SIZE);
const player = {
  x: Math.floor(MAP_W/2),
  y: Math.floor(MAP_H/2),
  directionAngle: 0 // 0 = вправо; будем менять через тач-джойстик
};

let last = performance.now();
function gameLoop(now = performance.now()) {
  const dt = (now - last) / 1000; last = now;

  // 1) считаем видимые тайлы
  const visible = computeFOV(gameMap, player);

  // 2) обновляем память
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const key = `${x},${y}`;
      const tile = gameMap.tiles[y][x];
      if (visible.has(key)) {
        tile.memoryAlpha = 1;
      } else if (tile.memoryAlpha > 0) {
        tile.memoryAlpha = Math.max(0, tile.memoryAlpha - dt * 0.5);
        if (tile.memoryAlpha === 0) {
          gameMap.regenerateTile(x, y);
        }
      }
    }
  }

  // 3) отрисовка
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const tile = gameMap.tiles[y][x];
      const px = x * TILE_SIZE, py = y * TILE_SIZE;

      // если видим — полная яркость; иначе — по memoryAlpha
      ctx.globalAlpha = tile.memoryAlpha;
      ctx.fillStyle = tile.type === 'wall' ? '#444' : '#888';
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    }
  }
  ctx.globalAlpha = 1;

  // 4) рисуем игрока
  ctx.fillStyle = 'red';
  ctx.beginPath();
  ctx.arc(
    (player.x + 0.5)*TILE_SIZE,
    (player.y + 0.5)*TILE_SIZE,
    TILE_SIZE*0.4, 0, Math.PI*2
  );
  ctx.fill();

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
