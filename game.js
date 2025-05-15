// game.js

// ——————————————
//  Параметры и холст
// ——————————————
var TILE_PX      = 27;    // размер тайла в пикселях
var MOVE_SPEED   = 3;     // тайлов в секунду
var FOG_FADE     = 0.5;   // размер уменьшения memoryAlpha в секунду
var REGEN_PERIOD = 1.0;   // секунд между срабатываниями перегенерации

var canvas = document.getElementById('gameCanvas');
var ctx    = canvas.getContext('2d');
var VIEW_W, VIEW_H;

function onResize() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  VIEW_W = Math.ceil(canvas.width  / TILE_PX) + 1;
  VIEW_H = Math.ceil(canvas.height / TILE_PX) + 1;
}
window.addEventListener('resize', onResize);
onResize();

// ——————————————
//  Состояние игрока + ввод
// ——————————————
var player = {
  x: CHUNK_W/2,
  y: CHUNK_H/2,
  angle: 0
};

var keyDir = { x: 0, y: 0 };
// гарантируем, что joyDir всегда определён
if (!window.joyDir) window.joyDir = { x: 0, y: 0 };

window.addEventListener('keydown', function(e) {
  if (e.key === 'w' || e.key === 'ArrowUp')    keyDir.y = -1;
  if (e.key === 's' || e.key === 'ArrowDown')  keyDir.y = +1;
  if (e.key === 'a' || e.key === 'ArrowLeft')  keyDir.x = -1;
  if (e.key === 'd' || e.key === 'ArrowRight') keyDir.x = +1;
});
window.addEventListener('keyup', function(e) {
  if (e.key === 'w' || e.key === 'ArrowUp')    keyDir.y = 0;
  if (e.key === 's' || e.key === 'ArrowDown')  keyDir.y = 0;
  if (e.key === 'a' || e.key === 'ArrowLeft')  keyDir.x = 0;
  if (e.key === 'd' || e.key === 'ArrowRight') keyDir.x = 0;
});

// ——————————————
//  FOV (Field of View) — конус в 60°
// ——————————————
function computeFOV(px, py, angle) {
  var visible = new Set();
  var R   = 10,
      FOV = Math.PI / 3,
      HALF = FOV/2,
      STEPS = 64;

  for (var i = 0; i <= STEPS; i++) {
    var a  = angle - HALF + (i/STEPS)*FOV;
    var dx = Math.cos(a), dy = Math.sin(a), dist = 0;
    while (dist < R) {
      var fx = px + dx*dist,
          fy = py + dy*dist;
      var ix = Math.floor(fx),
          iy = Math.floor(fy);
      // подгружаем чанк под этой клеткой
      ensureChunk(Math.floor(ix/CHUNK_W), Math.floor(iy/CHUNK_H));
      if (ix < 0 || iy < 0) break;
      visible.add(ix + ',' + iy);
      if (isWall(ix, iy)) break;
      dist += 0.2;
    }
  }
  return visible;
}

// ——————————————
//  Троттл перегенерации
// ——————————————
var lastTime   = performance.now();
var regenTimer = 0;
var toRegen    = new Set();

// ——————————————
//  Главный игровой цикл
// ——————————————
function gameLoop(now) {
  now = now || performance.now();
  var dt = (now - lastTime) / 1000;
  lastTime = now;
  regenTimer += dt;

  // 1) ДВИЖЕНИЕ + ПОВОРОТ
  var vx = keyDir.x || window.joyDir.x,
      vy = keyDir.y || window.joyDir.y;
  var mag = Math.hypot(vx, vy) || 1;
  vx /= mag; vy /= mag;
  if (vx || vy) {
    player.angle = Math.atan2(vy, vx);
    var nx = player.x + vx * MOVE_SPEED * dt,
        ny = player.y + vy * MOVE_SPEED * dt;
    if (!isWall(Math.floor(nx), Math.floor(ny))) {
      player.x = nx;
      player.y = ny;
    }
  }

  // 2) FOV + ЗАТУХАНИЕ ПАМЯТИ
  var vis = computeFOV(player.x, player.y, player.angle);
  var pcx = Math.floor(player.x / CHUNK_W),
      pcy = Math.floor(player.y / CHUNK_H);

  for (var dy = -1; dy <= 1; dy++) {
    for (var dx = -1; dx <= 1; dx++) {
      var cx = pcx + dx, cy = pcy + dy;
      ensureChunk(cx, cy);
      var chunk = worldChunks.get(cx + ',' + cy);
      if (!chunk.meta) {
        // инициализируем мета-данные при первой загрузке
        chunk.meta = [];
        for (var yy = 0; yy < CHUNK_H; yy++) {
          chunk.meta[yy] = [];
          for (var xx = 0; xx < CHUNK_W; xx++) {
            chunk.meta[yy][xx] = {
              type:        chunk.tiles[yy][xx],
              memoryAlpha: 0,
              visited:     false
            };
          }
        }
      }
      var meta = chunk.meta,
          ox   = cx * CHUNK_W,
          oy   = cy * CHUNK_H;

      for (var yy = 0; yy < CHUNK_H; yy++) {
        for (var xx = 0; xx < CHUNK_W; xx++) {
          var gx  = ox + xx,
              gy  = oy + yy,
              cell = meta[yy][xx],
              key  = gx + ',' + gy;
          if (vis.has(key)) {
            cell.visited     = true;
            cell.memoryAlpha = 1;
          } else if (cell.memoryAlpha > 0) {
            cell.memoryAlpha = Math.max(0, cell.memoryAlpha - FOG_FADE * dt);
            if (cell.memoryAlpha === 0) {
              toRegen.add(cx + ',' + cy);
            }
          }
        }
      }
    }
  }

  // 3) ПЕРЕГЕНЕРАЦИЯ ЧАНКОВ (троттл)
  if (regenTimer >= REGEN_PERIOD) {
    regenTimer -= REGEN_PERIOD;
    if (toRegen.size) {
      regenerateChunksPreserveFOV(toRegen, computeFOV, player);
      toRegen.clear();
    }
  }

  // 4) РЕНДЕРИНГ
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  // центрирование камеры
  ctx.translate(
    canvas.width/2  - player.x * TILE_PX,
    canvas.height/2 - player.y * TILE_PX
  );

  var left   = Math.floor(player.x - VIEW_W/2),
      top    = Math.floor(player.y - VIEW_H/2);

  for (var yy = 0; yy < VIEW_H; yy++) {
    for (var xx = 0; xx < VIEW_W; xx++) {
      var gx = left + xx,
          gy = top  + yy;
      if (gx < 0 || gy < 0) continue;
      var cx = Math.floor(gx/CHUNK_W),
          cy = Math.floor(gy/CHUNK_H),
          key = cx + ',' + cy;
      if (!worldChunks.has(key)) continue;
      var chunk = worldChunks.get(key),
          meta  = chunk.meta;
      var lx = ((gx % CHUNK_W) + CHUNK_W) % CHUNK_W,
          ly = ((gy % CHUNK_H) + CHUNK_H) % CHUNK_H;
      var cell = meta[ly][lx];
      ctx.globalAlpha = cell.memoryAlpha;
      ctx.fillStyle   = (cell.type === WALL ? '#333' : '#888');
      ctx.fillRect(gx * TILE_PX, gy * TILE_PX, TILE_PX, TILE_PX);
    }
  }

  // рисуем игрока
  ctx.globalAlpha = 1;
  ctx.fillStyle   = 'red';
  ctx.beginPath();
  ctx.arc(player.x * TILE_PX, player.y * TILE_PX, TILE_PX*0.4, 0, Math.PI*2);
  ctx.fill();

  ctx.restore();
  requestAnimationFrame(gameLoop);
}

// стартуем цикл
requestAnimationFrame(gameLoop);