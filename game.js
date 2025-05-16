/* ============================================================
   game.js   —   управление, FOV, затухание, регенерация, рендер
   ============================================================ */

/* ----------  константы и Canvas  --------------------------- */
const TILE_SIZE    = 32;          // px на тайл
const MOVE_SPEED   = 3;           // тайлов / сек
const FOV_ANGLE    = Math.PI/3;   // 60°
const FOV_DIST     = 6;           // тайлов
const FADE_RATE    = 1/4;         // memoryAlpha → 0 за 4 c
const REGEN_PERIOD = 1.0;         // пакетная перегенерация

const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
let C_W, C_H;
function onResize () {
  C_W = canvas.width  = window.innerWidth;
  C_H = canvas.height = window.innerHeight;
}
window.addEventListener('resize', onResize); onResize();

/* ----------  ввод (WASD / arrows)  ------------------------ */
const Input = { dx:0, dy:0 };
window.addEventListener('keydown', e => {
  switch (e.key) {
    case 'ArrowUp': case 'w': case 'W': Input.dy = -1; break;
    case 'ArrowDown': case 's': case 'S': Input.dy = 1; break;
    case 'ArrowLeft': case 'a': case 'A': Input.dx = -1; break;
    case 'ArrowRight': case 'd': case 'D': Input.dx = 1; break;
  }
});
window.addEventListener('keyup', e => {
  switch (e.key) {
    case 'ArrowUp': case 'w': case 'W': if (Input.dy < 0) Input.dy = 0; break;
    case 'ArrowDown': case 's': case 'S': if (Input.dy > 0) Input.dy = 0; break;
    case 'ArrowLeft': case 'a': case 'A': if (Input.dx < 0) Input.dx = 0; break;
    case 'ArrowRight': case 'd': case 'D': if (Input.dx > 0) Input.dx = 0; break;
  }
});

/* ----------  инициализация карты и игрока  ---------------- */
const gameMap = new GameMap(32);      // класс из map.js
gameMap.ensureChunk(0, 0);

const player = {
  x: gameMap.chunkSize / 2,
  y: gameMap.chunkSize / 2,
  angle: 0
};

/*  пакетная регенерация  */
let lastTime = performance.now();
let regenAcc = 0;
const toRegen = new Set();

/* ============================================================
                     MAIN  LOOP
   ============================================================ */
function loop (now = performance.now()) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  regenAcc += dt;

  /* preload ближайших чанков (5×5) */
  const pcx = Math.floor(player.x / gameMap.chunkSize),
        pcy = Math.floor(player.y / gameMap.chunkSize);
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++)
      gameMap.ensureChunk(pcx + dx, pcy + dy);

  /* ------- движение игрока ------- */
  let vx = Input.dx, vy = Input.dy;
  const mag = Math.hypot(vx, vy) || 1; vx /= mag; vy /= mag;
  if (vx || vy) {
    player.angle = Math.atan2(vy, vx);
    const nx = player.x + vx * MOVE_SPEED * dt;
    const ny = player.y + vy * MOVE_SPEED * dt;
    if (isPassable(Math.floor(nx), Math.floor(player.y))) player.x = nx;
    if (isPassable(Math.floor(player.x), Math.floor(ny))) player.y = ny;
  }

  /* ------- FOV + память ----------- */
  const vis = computeFOV(player.x, player.y, player.angle);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const key = `${pcx+dx},${pcy+dy}`;
      const ch = gameMap.chunks.get(key); if (!ch) continue;
      const { meta } = ch;
      const baseX = (pcx+dx) * gameMap.chunkSize,
            baseY = (pcy+dy) * gameMap.chunkSize;
      for (let y = 0; y < gameMap.chunkSize; y++) {
        for (let x = 0; x < gameMap.chunkSize; x++) {
          const gx = baseX + x, gy = baseY + y;
          const m  = meta[y][x];
          if (vis.has(`${gx},${gy}`)) {
            m.visited = true; m.memoryAlpha = 1;
          } else if (m.memoryAlpha > 0) {
            m.memoryAlpha = Math.max(0, m.memoryAlpha - FADE_RATE * dt);
            if (m.memoryAlpha === 0) toRegen.add(key);
          }
        }
      }
    }
  }

  /* ------- пакетная перегенерация ------- */
  if (regenAcc >= REGEN_PERIOD) {
    regenAcc = 0;
    if (toRegen.size) {
      gameMap.regenerateChunksPreserveFOV(toRegen, computeFOV, player);
      toRegen.clear();
    }
  }

  render();
  requestAnimationFrame(loop);
}

/* ============================================================
                     HELPERS
   ============================================================ */
function isPassable (gx, gy) {          // любой тайл ≠ 0
  return gameMap.isFloor(gx, gy);
}

/* --------- FOV (стены блокируют луч) ---------- */
function computeFOV (px, py, ang) {
  const set = new Set(), rays = 64, half = FOV_ANGLE/2;
  for (let i = 0; i <= rays; i++) {
    const a  = ang - half + (i/rays)*FOV_ANGLE;
    const dx = Math.cos(a),  dy = Math.sin(a);
    let dist = 0;
    while (dist < FOV_DIST) {
      const fx = px + dx*dist,  fy = py + dy*dist;
      const gx = Math.floor(fx), gy = Math.floor(fy);
      set.add(`${gx},${gy}`);
      if (!isPassable(gx, gy)) break;
      dist += 0.2;
    }
  }
  return set;
}

/* ============================================================
                      RENDER
   ============================================================ */
function render () {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, C_W, C_H);

  ctx.save();
  ctx.translate(C_W/2 - player.x*TILE_SIZE,
                C_H/2 - player.y*TILE_SIZE);

  const vis = computeFOV(player.x, player.y, player.angle);
  const rangeX = Math.ceil(C_W/TILE_SIZE/2)+2,
        rangeY = Math.ceil(C_H/TILE_SIZE/2)+2;

  for (let gy = Math.floor(player.y)-rangeY; gy <= Math.floor(player.y)+rangeY; gy++) {
    for (let gx = Math.floor(player.x)-rangeX; gx <= Math.floor(player.x)+rangeX; gx++) {
      if (gx < 0 || gy < 0) continue;

      const cx  = Math.floor(gx / gameMap.chunkSize),
            cy  = Math.floor(gy / gameMap.chunkSize);
      const ch  = gameMap.chunks.get(`${cx},${cy}`); if (!ch) continue;

      const lx  = gx - cx*gameMap.chunkSize,
            ly  = gy - cy*gameMap.chunkSize;
      const meta = ch.meta[ly][lx];
      if (meta.memoryAlpha <= 0) continue;
      ctx.globalAlpha = meta.memoryAlpha;

      const t = ch.tiles[ly][lx];            // 0 wall, 1 corridor, 2 room, 3 door
      ctx.fillStyle = t===1 ? "#6c6c6c"      // коридор (приглушённый серо-тёплый)
                    : t===2 ? "#4b728e"      // комната (стально-синий)
                    : t===3 ? "#a97447"      // дверь  (приглушённый коричневый)
                    : "#303030";             // стенa  (тёмный графит)
      ctx.fillRect(gx*TILE_SIZE, gy*TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
  }

  /* ---- player ---- */
  ctx.globalAlpha = 1;
  ctx.fillStyle   = "#e05050";
  ctx.beginPath();
  ctx.arc(player.x*TILE_SIZE, player.y*TILE_SIZE, TILE_SIZE*0.4, 0, Math.PI*2);
  ctx.fill();

  ctx.restore();
}

/* ============================================================
                      START
   ============================================================ */
requestAnimationFrame(loop);