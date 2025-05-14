// game.js

// ========== CONSTANTS ==========
const TILE_SIZE  = 100;   // фиксированный размер тайла в пикселях
const SPEED      = 3;     // тайлов в секунду
const FOG_FADE   = 0.5;   // альфа/секунда для “памяти”


// ========== DYNAMIC VIEWPORT ==========
let RENDER_W, RENDER_H;
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

function updateViewport() {
  // установим размер канваса под окно
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  // сколько целых тайлов помещается
  RENDER_W = Math.floor(canvas.width  / TILE_SIZE);
  RENDER_H = Math.floor(canvas.height / TILE_SIZE);
  // если карта уже создана, подправим её чанк-размер
  if (window.gameMap) {
    window.gameMap.renderW = RENDER_W;
    window.gameMap.renderH = RENDER_H;
  }
}
window.addEventListener('resize', updateViewport);
updateViewport();


// ========== INPUT STATE ==========
window.inputVector = { x: 0, y: 0 };  // от сенсорного джойстика
window.keyVector   = { x: 0, y: 0 };  // от клавиатуры WASD/стрелки

window.addEventListener('keydown', e => {
  switch (e.key) {
    case 'ArrowUp':    case 'w': window.keyVector.y = -1; break;
    case 'ArrowDown':  case 's': window.keyVector.y = +1; break;
    case 'ArrowLeft':  case 'a': window.keyVector.x = -1; break;
    case 'ArrowRight': case 'd': window.keyVector.x = +1; break;
  }
});
window.addEventListener('keyup', e => {
  switch (e.key) {
    case 'ArrowUp':    case 'w': window.keyVector.y = 0; break;
    case 'ArrowDown':  case 's': window.keyVector.y = 0; break;
    case 'ArrowLeft':  case 'a': window.keyVector.x = 0; break;
    case 'ArrowRight': case 'd': window.keyVector.x = 0; break;
  }
});


// ========== FOV (ray‐casting) ==========
function computeFOV(map, player) {
  const visible  = new Set();
  const maxR     = 10;
  const fullFOV  = Math.PI / 3; // 60°
  const halfFOV  = fullFOV / 2;
  const rays     = 64;

  for (let i = 0; i <= rays; i++) {
    const angle = player.directionAngle - halfFOV + (i / rays) * fullFOV;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    let dist = 0;
    while (dist < maxR) {
      const fx = player.x + dx * dist;
      const fy = player.y + dy * dist;
      const ix = Math.floor(fx), iy = Math.floor(fy);
      // убедимся, что чанк существует
      map.ensureChunk(Math.floor(ix / RENDER_W), Math.floor(iy / RENDER_H));
      if (ix < 0 || iy < 0 || ix >= map.cols || iy >= map.rows) break;
      visible.add(`${ix},${iy}`);
      if (map.tiles[iy][ix].type === 'wall') break;
      dist += 0.2;
    }
  }
  return visible;
}


// ========== MONSTER CLASS ==========
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
    const px = (this.x + 0.5) * TILE_SIZE;
    const py = (this.y + 0.5) * TILE_SIZE;

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


// ========== MAP & SPAWN ==========
window.gameMap = new GameMap(
  300,            // cols всего мира
  300,            // rows всего мира
  RENDER_W,       // renderW = tiles per row
  RENDER_H,       // renderH = tiles per column
  TILE_SIZE
);
const gameMap = window.gameMap;

// сгенерируем стартовый чанк и найдём все полы для спавна
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
  : { x: Math.floor(RENDER_W/2), y: Math.floor(RENDER_H/2) };

window.player = {
  x: start.x + 0.5,
  y: start.y + 0.5,
  directionAngle: 0
};
const player = window.player;


// ========== MONSTERS LIST & SPAWN ==========
window.monsters = [];
const monsters = window.monsters;
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


// ========== GAME LOOP ==========
let lastTime = performance.now();
function gameLoop(now = performance.now()) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  // 1) INPUT & DIRECTION
  const iv1 = window.inputVector, iv2 = window.keyVector;
  let iv = { x: iv1.x + iv2.x, y: iv1.y + iv2.y };
  const len = Math.hypot(iv.x, iv.y) || 1;
  iv.x /= len; iv.y /= len;
  if (iv.x || iv.y) {
    player.directionAngle = Math.atan2(iv.y, iv.x);
  }

  // 2) MOVE & COLLISION
  const nx = player.x + iv.x * SPEED * dt;
  const ny = player.y + iv.y * SPEED * dt;
  if (!gameMap.isWall(Math.floor(nx), Math.floor(ny))) {
    player.x = nx; player.y = ny;
  }

  // 3) FOV
  const visible = computeFOV(gameMap, player);

  // 4) MEMORY & REGEN TILE
  for (let key of gameMap.generatedChunks) {
    const [cx, cy] = key.split(',').map(Number);
    const x0 = cx * RENDER_W, y0 = cy * RENDER_H;
    for (let y = y0; y < y0 + RENDER_H; y++) {
      for (let x = x0; x < x0 + RENDER_W; x++) {
        if (x<0||y<0||x>=gameMap.cols||y>=gameMap.rows) continue;
        const tile = gameMap.tiles[y][x], k = `${x},${y}`;
        if (visible.has(k)) {
          tile.memoryAlpha = 1;
        } else if (tile.memoryAlpha > 0) {
          tile.memoryAlpha = Math.max(0, tile.memoryAlpha - FOG_FADE * dt);
          if (tile.memoryAlpha === 0) {
            gameMap.regenerateTile(x, y);
          }
        }
      }
    }
  }

  // 5) UPDATE & CLEAN MONSTERS
  monsters.forEach(m => m.update(dt, visible));
  window.monsters = monsters.filter(m => !m.dead);

  // 6) RENDER
  const camX = player.x - RENDER_W/2;
  const camY = player.y - RENDER_H/2;
  const startX = Math.floor(camX), startY = Math.floor(camY);
  const endX   = Math.ceil(camX + RENDER_W), endY = Math.ceil(camY + RENDER_H);

  // ensure neighbor chunks exist
  for (let cy = Math.floor(startY/RENDER_H); cy <= Math.floor((endY-1)/RENDER_H); cy++) {
    for (let cx = Math.floor(startX/RENDER_W); cx <= Math.floor((endX-1)/RENDER_W); cx++) {
      gameMap.ensureChunk(cx, cy);
    }
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(-camX * TILE_SIZE, -camY * TILE_SIZE);

  // draw tiles
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

  // draw monsters
  monsters.forEach(m => m.draw(ctx));

  // draw player
  const px = (player.x + 0.5) * TILE_SIZE, py = (player.y + 0.5) * TILE_SIZE;
  ctx.fillStyle = 'red';
  ctx.beginPath();
  ctx.arc(px, py, TILE_SIZE * 0.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
  requestAnimationFrame(gameLoop);
}

gameLoop();