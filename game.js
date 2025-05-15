// game.js

// ——————————————
//  Константы и настройка холста
// ——————————————
const TILE_SIZE    = 32;           // фиксированный размер тайла в пикселях
const MOVE_SPEED   = 3;            // скорость игрока (тайлов в секунду)
const FOV_ANGLE    = Math.PI / 3;  // 60°
const FOV_HALF     = FOV_ANGLE / 2;
const FOV_DIST     = 6;            // видимость в тайлах
const FADE_RATE    = 1 / 4;        // затухание memoryAlpha за 4 сек
const REGEN_PERIOD = 1.0;          // интервал пакетной перегенерации (сек)

const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
let C_W, C_H;

// подстройка canvas под окно
function resize() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  C_W = canvas.width;
  C_H = canvas.height;
}
window.addEventListener('resize', resize);
resize();

// ——————————————
//  Игрок и ввод
// ——————————————
let playerX = 0, playerY = 0, playerA = 0;
window.Input   = { dx:0, dy:0 };   // выставляется в controls.js

// ——————————————
//  Инициализация карты
// ——————————————
const gameMap = new GameMap();
gameMap.ensureChunk(0, 0);
playerX = gameMap.chunkSize/2;
playerY = gameMap.chunkSize/2;
gameMap.currentChunkX = 0;
gameMap.currentChunkY = 0;

// вспомогательный throttle для перегенерации
let lastTime   = performance.now();
let regenTimer = 0;
const toRegen  = new Set();

// ——————————————
//  Основной игровой цикл
// ——————————————
function gameLoop(now = performance.now()) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  regenTimer += dt;

  // 1) Движение
  let vx = Input.dx, vy = Input.dy;
  const mag = Math.hypot(vx, vy) || 1;
  vx /= mag; vy /= mag;
  if(vx || vy) {
    playerA = Math.atan2(vy, vx);
    const nx = playerX + vx * MOVE_SPEED * dt;
    const ny = playerY + vy * MOVE_SPEED * dt;
    // проверка коллизий тайлов
    if(gameMap.isFloor(Math.floor(nx), Math.floor(playerY))) playerX = nx;
    if(gameMap.isFloor(Math.floor(playerX), Math.floor(ny))) playerY = ny;
  }

  // определяем текущий чанк
  const pcx = Math.floor(playerX / gameMap.chunkSize);
  const pcy = Math.floor(playerY / gameMap.chunkSize);

  // 2) FOV + память тайлов
  const vis = computeFOV(playerX, playerY, playerA);
  // обновляем memoryAlpha/visited в метаданных чанков вокруг
  for(let dy=-1; dy<=1; dy++){
    for(let dx=-1; dx<=1; dx++){
      const cx = pcx+dx, cy = pcy+dy;
      gameMap.ensureChunk(cx, cy);
      const chunkKey = `${cx},${cy}`;
      const chunk = gameMap.chunks.get(chunkKey);
      // инициализация мета-данных при первом заходе
      if(!chunk.meta){
        chunk.meta = Array.from({length:chunk.length}, (_,y)=>
          Array.from({length:chunk.length}, (_,x)=>({
            memoryAlpha: 0,
            visited:     false
          }))
        );
      }
      const meta = chunk.meta;
      const baseX = cx * gameMap.chunkSize;
      const baseY = cy * gameMap.chunkSize;
      for(let y=0; y<gameMap.chunkSize; y++){
        for(let x=0; x<gameMap.chunkSize; x++){
          const gx = baseX + x, gy = baseY + y;
          const key = `${gx},${gy}`;
          const cell = meta[y][x];
          if(vis.has(key)){
            cell.visited     = true;
            cell.memoryAlpha = 1;
          } else if(cell.memoryAlpha > 0){
            cell.memoryAlpha = Math.max(0, cell.memoryAlpha - FADE_RATE*dt);
            if(cell.memoryAlpha === 0){
              toRegen.add(`${cx},${cy}`);
            }
          }
        }
      }
    }
  }

  // 3) Троттлинг перегенерации
  if(regenTimer >= REGEN_PERIOD){
    regenTimer -= REGEN_PERIOD;
    if(toRegen.size){
      gameMap.regenerateChunksPreserveFOV(toRegen, (x,y,a)=>computeFOV(x,y,a), {x:playerX,y:playerY,angle:playerA});
      toRegen.clear();
    }
  }

  // 4) Рендер
  render();

  requestAnimationFrame(gameLoop);
}

// ——————————————
//  Функция FOV (с учётом стен, которые блокируют обзор)
// ——————————————
function computeFOV(px, py, angle){
  const visible = new Set();
  for(let i=0; i<=64; i++){
    const a = angle - FOV_HALF + (i/64)*FOV_ANGLE;
    const dx = Math.cos(a), dy = Math.sin(a);
    let d = 0;
    while(d < FOV_DIST){
      const fx = px + dx*d, fy = py + dy*d;
      const ix = Math.floor(fx), iy = Math.floor(fy);
      if(ix<0||iy<0) break;
      visible.add(`${ix},${iy}`);
      if(!gameMap.isFloor(ix, iy)) break;  // стена блокирует дальше
      d += 0.2;
    }
  }
  return visible;
}

// ——————————————
//  Функция отрисовки карты и игрока
// ——————————————
function render(){
  // фон — чёрный
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, C_W, C_H);

  // экранный центр
  const cx = C_W/2, cy = C_H/2;

  // расчёт видимой области в тайлах
  const tilesW = Math.ceil(C_W / TILE_SIZE) + 2;
  const tilesH = Math.ceil(C_H / TILE_SIZE) + 2;
  const left   = Math.floor(playerX) - Math.floor(tilesW/2);
  const top    = Math.floor(playerY) - Math.floor(tilesH/2);

  // рисуем тайлы
  for(let ty=0; ty<tilesH; ty++){
    for(let tx=0; tx<tilesW; tx++){
      const gx = left + tx, gy = top + ty;
      if(gx<0||gy<0) continue;
      const px = cx + (gx - playerX)*TILE_SIZE;
      const py = cy + (gy - playerY)*TILE_SIZE;
      // получить мета-данные
      const cxk = Math.floor(gx / gameMap.chunkSize),
            cyk = Math.floor(gy / gameMap.chunkSize),
            key = `${cxk},${cyk}`;
      if(!gameMap.chunks.has(key)) continue;
      const chunk = gameMap.chunks.get(key);
      const lx = gx - cxk*gameMap.chunkSize,
            ly = gy - cyk*gameMap.chunkSize;
      const cellMeta = chunk.meta ? chunk.meta[ly][lx] : null;
      const alpha = cellMeta ? cellMeta.memoryAlpha : 0;
      if(alpha <= 0) continue;  // забытый — не рисуем (остаётся чёрный)
      // цвет — пол и стена разными серыми
      const isFloor = gameMap.isFloor(gx, gy);
      ctx.globalAlpha = alpha;
      ctx.fillStyle   = isFloor ? '#888' : '#444';
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    }
  }

  // рисуем игрока
  ctx.globalAlpha = 1;
  ctx.fillStyle   = '#f00';
  ctx.beginPath();
  ctx.arc(cx, cy, TILE_SIZE*0.4, 0, Math.PI*2);
  ctx.fill();
}

// старт
requestAnimationFrame(gameLoop);