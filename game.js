// ——————————————————————————————
//  Константы и canvas-настройка
// ——————————————————————————————
const TILE_SIZE    = 32;            // размер тайла в px
const MOVE_SPEED   = 3;             // тайлов/сек
const FOV_ANGLE    = Math.PI / 3;   // 60°
const FOV_HALF     = FOV_ANGLE / 2;
const FOV_DIST     = 6;             // радиус видимости (тайлы)
const FADE_RATE    = 1 / 4;         // memoryAlpha → 0 за 4 с
const REGEN_PERIOD = 1.0;           // пакетная перегенерация, сек

const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

// подгоняем канву под окно
let C_W, C_H;
function onResize () {
  C_W = canvas.width  = window.innerWidth;
  C_H = canvas.height = window.innerHeight;
}
window.addEventListener('resize', onResize);
onResize();

// ——————————————————————————————
//  КАРТА и игрок
// ——————————————————————————————
const gameMap = new window.GameMap(32);   // GameMap приходит из map.js (global)

const player = {
  x: 2, y: 2,          // позиция в тайлах
  angle: 0             // направление взгляда (рад)
};

// ——————————————————————————————
//  Управление (WASD + мышь / сенсорный джойстик)
// ——————————————————————————————
const keys = {};
window.addEventListener('keydown', e => keys[e.key] = true );
window.addEventListener('keyup',   e => keys[e.key] = false);

let joyDX = 0, joyDY = 0;           // смещение виртуального джойстика
const joy = document.getElementById('joystick');
const knob = document.getElementById('joystick-knob');

function onJoyStart(e){
  e.preventDefault();
  const id = e.pointerId;
  const move = ev=>{
    if(ev.pointerId!==id) return;
    const r = joy.getBoundingClientRect();
    joyDX = (ev.clientX - (r.left+r.right)/2) / (r.width/2);
    joyDY = (ev.clientY - (r.top +r.bottom)/2) / (r.height/2);
    const m = Math.hypot(joyDX,joyDY);
    if(m>1){ joyDX/=m; joyDY/=m; }
    knob.style.transform = `translate(${joyDX*25}px,${joyDY*25}px)`;
  };
  const end = ev=>{
    if(ev.pointerId!==id) return;
    joyDX = joyDY = 0;
    knob.style.transform = '';
    window.removeEventListener('pointermove',move);
    window.removeEventListener('pointerup',end);
  };
  window.addEventListener('pointermove',move);
  window.addEventListener('pointerup',end);
}
joy.addEventListener('pointerdown',onJoyStart);

// ——————————————————————————————
//  Простенький FOV (псевдо-конус на квадратной сетке)
// ——————————————————————————————
function computeFOV(px, py, angle){
  const visible = new Set();
  const cosA = Math.cos(angle), sinA = Math.sin(angle);
  for(let dy=-FOV_DIST; dy<=FOV_DIST; dy++){
    for(let dx=-FOV_DIST; dx<=FOV_DIST; dx++){
      const gx = Math.floor(px)+dx;
      const gy = Math.floor(py)+dy;
      const vx = gx + 0.5 - px;
      const vy = gy + 0.5 - py;
      const dist = Math.hypot(vx,vy);
      if(dist>FOV_DIST+0.5) continue;
      const dot = (vx*cosA + vy*sinA) / dist;
      if(dot < Math.cos(FOV_HALF)) continue;
      visible.add(`${gx},${gy}`);
    }
  }
  return visible;
}

// ——————————————————————————————
//  Главный цикл
// ——————————————————————————————
let lastTime   = performance.now();
let regenTimer = 0;

function loop(now=performance.now()){
  const dt = (now-lastTime)/1000;
  lastTime = now;
  regenTimer += dt;

  // движение игрока
  let dx = (keys['d']||keys['ArrowRight'] ? 1 : 0) -
           (keys['a']||keys['ArrowLeft']  ? 1 : 0) + joyDX;
  let dy = (keys['s']||keys['ArrowDown'] ? 1 : 0) -
           (keys['w']||keys['ArrowUp']   ? 1 : 0) + joyDY;
  if(dx||dy){
    const m = Math.hypot(dx,dy);
    dx*=MOVE_SPEED*dt/m; dy*=MOVE_SPEED*dt/m;
    const nx = player.x + dx;
    const ny = player.y + dy;
    if(gameMap.isFloor(Math.floor(nx),Math.floor(player.y))) player.x = nx;
    if(gameMap.isFloor(Math.floor(player.x),Math.floor(ny))) player.y = ny;
    player.angle = Math.atan2(dy,dx);
  }

  // заставляем прогенерировать ближайшие чанки 3×3
  const pcx = Math.floor(player.x / gameMap.chunkSize);
  const pcy = Math.floor(player.y / gameMap.chunkSize);
  for(let cy=pcy-1; cy<=pcy+1; cy++)
    for(let cx=pcx-1; cx<=pcx+1; cx++)
      gameMap.ensureChunk(cx,cy);

  // каждые REGEN_PERIOD сек перегенерируем незримые чанки
  if(regenTimer>=REGEN_PERIOD){
    regenTimer = 0;
    const toRegen = [];
    gameMap.chunks.forEach((_,key)=>{
      const [cx,cy] = key.split(',').map(Number);
      if(Math.abs(cx-pcx)>1 || Math.abs(cy-pcy)>1) toRegen.push(key);
    });
    if(toRegen.length)
      gameMap.regenerateChunksPreserveFOV(toRegen, computeFOV, player);
  }

  // fade memoryAlpha
  gameMap.chunks.forEach(chunk=>{
    for(let y=0;y<gameMap.chunkSize;y++){
      for(let x=0;x<gameMap.chunkSize;x++){
        const m = chunk.meta[y][x];
        if(m.memoryAlpha>0) m.memoryAlpha = Math.max(0,m.memoryAlpha-dt*FADE_RATE);
      }
    }
  });

  // РЕНДЕР
  ctx.clearRect(0,0,C_W,C_H);
  ctx.save();
  ctx.translate(C_W/2 - player.x*TILE_SIZE,
                C_H/2 - player.y*TILE_SIZE);

  // поле зрения
  const vis = computeFOV(player.x,player.y,player.angle);

  // рисуем чанки
  gameMap.chunks.forEach((chunk,key)=>{
    const [cx,cy] = key.split(',').map(Number);
    const baseX = cx*gameMap.chunkSize;
    const baseY = cy*gameMap.chunkSize;
    for(let y=0;y<gameMap.chunkSize;y++){
      for(let x=0;x<gameMap.chunkSize;x++){
        const gx = baseX+x, gy = baseY+y;
        const t  = chunk.tiles[y][x];
        if(t==='wall') continue;
        const screen = `${gx},${gy}`;
        let alpha = 0;
        if(vis.has(screen)){
          alpha = 1;
          chunk.meta[y][x].memoryAlpha = 1;
        }else{
          alpha = chunk.meta[y][x].memoryAlpha;
        }
        if(alpha<=0) continue;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = (t==='room') ? '#88b4ff' : '#6c9eff'; // разные цвета
        ctx.fillRect(gx*TILE_SIZE, gy*TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
  });

  // игрок
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#f00';
  ctx.beginPath();
  ctx.arc(player.x*TILE_SIZE, player.y*TILE_SIZE, TILE_SIZE*0.4, 0, Math.PI*2);
  ctx.fill();

  ctx.restore();
  requestAnimationFrame(loop);
}

// делаем глобальные ссылки для старых скриптов
window.ctx       = ctx;
window.gameMap   = gameMap;
window.player    = player;
window.TILE_SIZE = TILE_SIZE;
window.C_W       = C_W;
window.C_H       = C_H;

// старт
requestAnimationFrame(loop);