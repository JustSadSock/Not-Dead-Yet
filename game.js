// game.js
// ——————————————
//  Глобальные структуры ввода  (объявляем в самом верху!)
// ——————————————
let player = { x: 0, y: 0, angle: 0 };
let Input  = { dx: 0, dy: 0 };        // заполняется WASD-клавишами и джойстиком

// ——————————————
//  Константы и Canvas
// ——————————————
const TILE_SIZE    = 32;
const MOVE_SPEED   = 3;
const FOV_ANGLE    = Math.PI / 3;
const FOV_HALF     = FOV_ANGLE / 2;
const FOV_DIST     = 6;
const FADE_RATE    = 1 / 4;
const REGEN_PERIOD = 1.0;

const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
let C_W, C_H;
function onResize() {
  C_W = canvas.width  = window.innerWidth;
  C_H = canvas.height = window.innerHeight;
}
window.addEventListener('resize', onResize);
onResize();

// ——————————————
//  Клавиатура (W-A-S-D)
// ——————————————
const keyState = {};
window.addEventListener('keydown', e => { keyState[e.key.toLowerCase()] = true; });
window.addEventListener('keyup',   e => { keyState[e.key.toLowerCase()] = false; });

// ——————————————
//  Инициализация карты
// ——————————————
const gameMap = new GameMap();
gameMap.ensureChunk(0, 0);
player.x = player.y = gameMap.chunkSize / 2;

// таймер и набор для перегенерации
let lastTime   = performance.now();
let regenTimer = 0;
const toRegen  = new Set();

// ——————————————
//  Основной цикл
// ——————————————
function loop(now = performance.now()) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  regenTimer += dt;

  // 1) ввод (клавиатура + джой-стик)
  Input.dx = (keyState['d'] ? 1 : 0) - (keyState['a'] ? 1 : 0);
  Input.dy = (keyState['s'] ? 1 : 0) - (keyState['w'] ? 1 : 0);
  // (логика виртуального джой-стика должна где-то менять Input.dx/dy — оставлена как была)

  // 2) прогрузка чанков вокруг
  const pcx = Math.floor(player.x / gameMap.chunkSize);
  const pcy = Math.floor(player.y / gameMap.chunkSize);
  const R   = 2;                       // радиус пред-загрузки
  for (let dy = -R; dy <= R; dy++)
    for (let dx = -R; dx <= R; dx++)
      gameMap.ensureChunk(pcx + dx, pcy + dy);

  // 3) движение
  let vx = Input.dx, vy = Input.dy;
  const mag = Math.hypot(vx, vy) || 1;
  vx /= mag; vy /= mag;
  if (vx || vy) {
    player.angle = Math.atan2(vy, vx);
    const nx = player.x + vx * MOVE_SPEED * dt;
    const ny = player.y + vy * MOVE_SPEED * dt;
    if (gameMap.isFloor(Math.floor(nx), Math.floor(player.y))) player.x = nx;
    if (gameMap.isFloor(Math.floor(player.x), Math.floor(ny))) player.y = ny;
  }

  // 4) FOV + запоминание тайлов
  const vis = computeFOV(player.x, player.y, player.angle);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = pcx + dx, cy = pcy + dy;
      const chunk = gameMap.chunks.get(`${cx},${cy}`);
      if (!chunk) continue;
      const baseX = cx * gameMap.chunkSize;
      const baseY = cy * gameMap.chunkSize;

      for (let y = 0; y < gameMap.chunkSize; y++) {
        for (let x = 0; x < gameMap.chunkSize; x++) {
          const gx = baseX + x, gy = baseY + y;
          const m  = chunk.meta[y][x];

          if (vis.has(`${gx},${gy}`)) {
            m.visited     = true;
            m.memoryAlpha = 1;
          } else if (m.memoryAlpha > 0) {
            m.memoryAlpha = Math.max(0, m.memoryAlpha - FADE_RATE * dt);
            if (m.memoryAlpha === 0) toRegen.add(`${cx},${cy}`);
          }
        }
      }
    }
  }

  // 5) пакетная перегенерация
  if (regenTimer >= REGEN_PERIOD && toRegen.size) {
    regenTimer = 0;
    gameMap.regenerateChunksPreserveFOV(
      toRegen,
      computeFOV,
      { x: player.x, y: player.y, angle: player.angle }
    );
    toRegen.clear();
  }

  render();
  requestAnimationFrame(loop);
}

// ——————————————
//  Field-of-View
// ——————————————
function computeFOV(px, py, angle) {
  const visible = new Set();
  const steps = 64;
  for (let i = 0; i <= steps; i++) {
    const a  = angle - FOV_HALF + (i / steps) * FOV_ANGLE;
    const dx = Math.cos(a), dy = Math.sin(a);
    let dist = 0;
    while (dist < FOV_DIST) {
      const fx = px + dx * dist, fy = py + dy * dist;
      const ix = Math.floor(fx), iy = Math.floor(fy);
      visible.add(`${ix},${iy}`);
      if (!gameMap.isFloor(ix, iy)) break;
      dist += 0.25;
    }
  }
  return visible;
}

// ——————————————
//  Рендер
// ——————————————
function render() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, C_W, C_H);

  ctx.save();
  ctx.translate(C_W/2 - player.x*TILE_SIZE,
                C_H/2 - player.y*TILE_SIZE);

  const vis = computeFOV(player.x, player.y, player.angle);
  const minX = Math.floor(player.x - C_W/TILE_SIZE/2) - 2;
  const maxX = Math.floor(player.x + C_W/TILE_SIZE/2) + 2;
  const minY = Math.floor(player.y - C_H/TILE_SIZE/2) - 2;
  const maxY = Math.floor(player.y + C_H/TILE_SIZE/2) + 2;

  for (let gy = minY; gy <= maxY; gy++) {
    for (let gx = minX; gx <= maxX; gx++) {
      const ck = `${Math.floor(gx/gameMap.chunkSize)},${Math.floor(gy/gameMap.chunkSize)}`;
      const chunk = gameMap.chunks.get(ck); if (!chunk) continue;
      const lx = gx - Math.floor(gx/gameMap.chunkSize)*gameMap.chunkSize;
      const ly = gy - Math.floor(gy/gameMap.chunkSize)*gameMap.chunkSize;
      const m  = chunk.meta[ly][lx];
      if (m.memoryAlpha <= 0) continue;

      ctx.globalAlpha = m.memoryAlpha;
      const t = chunk.tiles[ly][lx];
      ctx.fillStyle =
          t === 'room' ? '#214'
        : t === 'door' ? '#533'
        : t === 'hall' ? '#666'
        : /*wall*/       '#333';
      ctx.fillRect(gx*TILE_SIZE, gy*TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
  }

  ctx.globalAlpha = 1;
  ctx.fillStyle   = '#f00';
  ctx.beginPath();
  ctx.arc(player.x*TILE_SIZE, player.y*TILE_SIZE, TILE_SIZE*0.4, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();
}

// ——————————————
requestAnimationFrame(loop);