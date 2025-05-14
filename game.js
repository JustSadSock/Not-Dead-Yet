// game.js

// ========== КОНСТАНТЫ (zoom ×2) ==========
const RENDER_W   = 15;     // теперь показываем 15×15 тайлов вместо 30×30
const RENDER_H   = 15;
const TILE_SIZE  = 200;    // вместо 100px — 200px на тайл
const SPEED      = 3;      // тайлов в секунду (без изменений)
const FOG_FADE   = 0.5;    // «память» тускнеет на 0.5 в секунду

// ========== CANVAS ==========
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
canvas.width  = RENDER_W * TILE_SIZE;  // теперь 15*200 = 3000px внутренней резолюции
canvas.height = RENDER_H * TILE_SIZE;

// ========== ВВОД ==========
window.inputVector = { x: 0, y: 0 };
window.keyVector   = { x: 0, y: 0 };
window.addEventListener('keydown', e => {
  switch (e.key) {
    case 'ArrowUp': case 'w': window.keyVector.y = -1; break;
    case 'ArrowDown': case 's': window.keyVector.y = +1; break;
    case 'ArrowLeft': case 'a': window.keyVector.x = -1; break;
    case 'ArrowRight': case 'd': window.keyVector.x = +1; break;
  }
});
window.addEventListener('keyup', e => {
  switch (e.key) {
    case 'ArrowUp': case 'w': window.keyVector.y = 0; break;
    case 'ArrowDown': case 's': window.keyVector.y = 0; break;
    case 'ArrowLeft': case 'a': window.keyVector.x = 0; break;
    case 'ArrowRight': case 'd': window.keyVector.x = 0; break;
  }
});

// ========== FOV (ray‐casting) ==========
function computeFOV(map, player) {
  const visible = new Set();
  const maxR    = 10;
  const fullFOV = Math.PI / 3;
  const halfFOV = fullFOV / 2;
  const rays    = 64;

  for (let i = 0; i <= rays; i++) {
    const angle = player.directionAngle - halfFOV + (i / rays) * fullFOV;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    let dist = 0;
    while (dist < maxR) {
      const fx = player.x + dx * dist,
            fy = player.y + dy * dist;
      const ix = Math.floor(fx),
            iy = Math.floor(fy);
      map.ensureChunk(Math.floor(ix / RENDER_W), Math.floor(iy / RENDER_H));
      if (ix < 0 || iy < 0 || ix >= map.cols || iy >= map.rows) break;
      visible.add(`${ix},${iy}`);
      if (map.tiles[iy][ix].type === 'wall') break;
      dist += 0.2;
    }
  }
  return visible;
}

// ========== MONSTER ==========
class Monster {
  constructor(x, y, real = true) {
    this.x = x; this.y = y;
    this.real = real;
    this.timer = 0;
    this.visibleTimer = 0;
    this.dead = false;
  }
  update(dt, visible) {
    const key = `${Math.floor(this.x)},${Math.floor(this.y)}`;
    const inView = visible.has(key);
    this.timer += dt;
    this.visibleTimer = inView ? this.visibleTimer + dt : 0;
    if (!this.real && this.timer > 5) this.dead = true;
  }
  draw(ctx) {
    const px = (this.x + 0.5) * TILE_SIZE,
          py = (this.y + 0.5) * TILE_SIZE;
    if (this.timer < 0.2) {
      ctx.save();
      ctx.globalAlpha = this.real ? 0.5 : 0.2;
      ctx.strokeStyle = 'white';
      ctx.beginPath();
      ctx.arc(px, py, TILE_SIZE * 0.4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (this.real && this.visibleTimer > 0) {
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(px, py, TILE_SIZE * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

// ========== МИР И СПАВН ==========
window.gameMap = new GameMap(300, 300, RENDER_W, RENDER_H, TILE_SIZE);
const gameMap   = window.gameMap;
gameMap.ensureChunk(0, 0);

const spawnList = [];
for (let y = 0; y < RENDER_H; y++) {
  for (let x = 0; x < RENDER_W; x++) {
    if (gameMap.tiles[y][x].type === 'floor') {
      spawnList.push({ x, y });
    }
  }
}
const start = spawnList.length
  ? spawnList[Math.floor(Math.random() * spawnList.length)]
  : { x: Math.floor(RENDER_W / 2), y: Math.floor(RENDER_H / 2) };

window.player = {
  x: start.x + 0.5,
  y: start.y + 0.5,
  directionAngle: 0
};
const player = window.player;

window.monsters = [];
const monsters   = window.monsters;
setInterval(() => {
  const vis = computeFOV(gameMap, player);
  let x, y, key;
  do {
    x = Math.floor(Math.random() * gameMap.cols);
    y = Math.floor(Math.random() * gameMap.rows);
    key = `${x},${y}`;
  } while (vis.has(key) || gameMap.tiles[y][x].type === 'wall');
  monsters.push(new Monster(x, y, Math.random() < 0.3));
}, 2000);

// ========== DELTA-TIME ==========
let lastTime = performance.now();

// ========== ИГРОВОЙ ЦИКЛ ==========
function gameLoop(now = performance.now()) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  // ввод + нормализация
  const iv1 = window.inputVector, iv2 = window.keyVector;
  let iv = { x: iv1.x + iv2.x, y: iv1.y + iv2.y };
  const len = Math.hypot(iv.x, iv.y) || 1;
  iv.x /= len; iv.y /= len;
  if (iv.x || iv.y) player.directionAngle = Math.atan2(iv.y, iv.x);

  // движение с жёсткой коллизией
  const nx = player.x + iv.x * SPEED * dt,
        ny = player.y + iv.y * SPEED * dt;
  if (!gameMap.isWall(Math.floor(nx), Math.floor(ny))) {
    player.x = nx; player.y = ny;
  }

  // FOV
  const visible = computeFOV(gameMap, player);

  // «память» и регенерация по загруженным чанкам
  for (let key of gameMap.generatedChunks) {
    const [cx, cy] = key.split(',').map(Number);
    const x0 = cx * RENDER_W, y0 = cy * RENDER_H;
    for (let y = y0; y < y0 + RENDER_H; y++) {
      for (let x = x0; x < x0 + RENDER_W; x++) {
        if (x<0||y<0||x>=gameMap.cols||y>=gameMap.rows) continue;
        const tile = gameMap.tiles[y][x],
              k    = `${x},${y}`;
        if (visible.has(k)) {
          tile.memoryAlpha = 1;
        } else if (tile.memoryAlpha > 0) {
          tile.memoryAlpha = Math.max(0, tile.memoryAlpha - FOG_FADE * dt);
          if (tile.memoryAlpha === 0) gameMap.regenerateTile(x, y);
        }
      }
    }
  }

  // обновление монстров
  monsters.forEach(m => m.update(dt, visible));
  window.monsters = monsters.filter(m => !m.dead);

  // отрисовка
  const camX = player.x - RENDER_W/2,
        camY = player.y - RENDER_H/2;
  const startX = Math.floor(camX),
        startY = Math.floor(camY),
        endX   = Math.ceil(camX + RENDER_W),
        endY   = Math.ceil(camY + RENDER_H);

  // генерируем новые чанки при приближении
  for (let cy = Math.floor(startY/RENDER_H); cy <= Math.floor((endY-1)/RENDER_H); cy++) {
    for (let cx = Math.floor(startX/RENDER_W); cx <= Math.floor((endX-1)/RENDER_W); cx++) {
      gameMap.ensureChunk(cx, cy);
    }
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(-camX * TILE_SIZE, -camY * TILE_SIZE);

  // тайлы
  for (let y = startY; y < endY; y++) {
    if (y<0||y>=gameMap.rows) continue;
    for (let x = startX; x < endX; x++) {
      if (x<0||x>=gameMap.cols) continue;
      const tile = gameMap.tiles[y][x];
      ctx.globalAlpha = tile.memoryAlpha;
      ctx.fillStyle   = tile.type === 'wall' ? '#444' : '#888';
      ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
  }
  ctx.globalAlpha = 1;

  // монстры
  monsters.forEach(m => m.draw(ctx));

  // игрок
  const px = (player.x + 0.5) * TILE_SIZE,
        py = (player.y + 0.5) * TILE_SIZE;
  ctx.fillStyle = 'red';
  ctx.beginPath();
  ctx.arc(px, py, TILE_SIZE * 0.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
  requestAnimationFrame(gameLoop);
}

// старт
gameLoop();