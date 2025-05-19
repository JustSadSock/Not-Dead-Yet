// ——————————————————————————————
//  Константы и canvas-настройка
// ——————————————————————————————
const TILE_SIZE    = 32;            // размер тайла в px
const MOVE_SPEED   = 3;             // тайлов/сек
const FOV_ANGLE    = Math.PI / 3;   // 60°
const FOV_HALF     = FOV_ANGLE / 2;
const FOV_DIST     = 6;             // радиус видимости (тайлы)
const FADE_RATE    = 1 / 4;         // memoryAlpha → 0 за 4 с
const REGEN_PERIOD = 1.0;           // пакетная перегенерация (сек)

const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
let C_W, C_H;
function onResize() {
  C_W = canvas.width  = window.innerWidth;
  C_H = canvas.height = window.innerHeight;
}
window.addEventListener('resize', onResize);
onResize();

// ——————————————————————————————
//  Карта и игрок
// ——————————————————————————————
const gameMap = new window.GameMap(32);
const player  = { x:2, y:2, angle:0 };

// ——————————————————————————————
//  Управление (WASD + джойстик)
// ——————————————————————————————
const keys = {};
window.addEventListener('keydown', e => keys[e.key] = true);
window.addEventListener('keyup',   e => keys[e.key] = false);

let joyDX=0, joyDY=0;
const joy = document.getElementById('joystick');
const knob= document.getElementById('joystick-knob');
joy.addEventListener('pointerdown', e=>{
  e.preventDefault();
  const id=e.pointerId;
  const move=ev=>{
    if(ev.pointerId!==id) return;
    const r=joy.getBoundingClientRect();
    joyDX=(ev.clientX-(r.left+r.right)/2)/(r.width/2);
    joyDY=(ev.clientY-(r.top +r.bottom)/2)/(r.height/2);
    const m=Math.hypot(joyDX,joyDY);
    if(m>1){ joyDX/=m; joyDY/=m; }
    knob.style.transform=`translate(${joyDX*25}px,${joyDY*25}px)`;
  };
  const end=ev=>{
    if(ev.pointerId!==id) return;
    joyDX=joyDY=0;
    knob.style.transform='';
    window.removeEventListener('pointermove',move);
    window.removeEventListener('pointerup',end);
  };
  window.addEventListener('pointermove',move);
  window.addEventListener('pointerup',end);
});

// ——————————————————————————————
//  Помощник для лучевой проверки (Bresenham)
// ——————————————————————————————
function getLine(x0,y0,x1,y1){
  const pts=[],
        dx=Math.abs(x1-x0), dy=Math.abs(y1-y0),
        sx=x0<x1?1:-1, sy=y0<y1?1:-1;
  let err=dx-dy, x=x0, y=y0;
  while(true){
    pts.push([x,y]);
    if(x===x1 && y===y1) break;
    const e2=2*err;
    if(e2>-dy){ err-=dy; x+=sx; }
    if(e2<dx ){ err+=dx; y+=sy; }
  }
  return pts;
}

// ——————————————————————————————
//  FOV с учётом стен (лучевая трассировка)
// ——————————————————————————————
function computeFOV(px,py,angle){
  const visible = new Set(),
        cosA= Math.cos(angle),
        sinA= Math.sin(angle);
  const x0 = Math.floor(px), y0 = Math.floor(py);
  for(let dy=-FOV_DIST; dy<=FOV_DIST; dy++){
    for(let dx=-FOV_DIST; dx<=FOV_DIST; dx++){
      const gx = x0 + dx, gy = y0 + dy,
            vx = gx+0.5 - px, vy = gy+0.5 - py,
            dist = Math.hypot(vx,vy);
      if(dist>FOV_DIST+0.5) continue;
      const dot = (vx*cosA + vy*sinA)/dist;
      if(dot < Math.cos(FOV_HALF)) continue;
      // трассировка луча
      const line = getLine(x0,y0,gx,gy);
      let blocked = false;
      for(let i=1; i<line.length; i++){
        const [lx,ly]=line[i];
        if(!gameMap.isFloor(lx,ly)){ blocked=true; break; }
      }
      if(blocked) continue;
      visible.add(`${gx},${gy}`);
    }
  }
  return visible;
}

// ——————————————————————————————
//  Главный цикл
// ——————————————————————————————
let lastTime = performance.now(),
    regenT   = 0;

function loop(now=performance.now()){
  const dt = (now - lastTime)/1000;
  lastTime = now;
  regenT   += dt;

  // движение
  let dx = (+!!(keys.d||keys.ArrowRight)) - (+!!(keys.a||keys.ArrowLeft)) + joyDX;
  let dy = (+!!(keys.s||keys.ArrowDown))  - (+!!(keys.w||keys.ArrowUp))  + joyDY;
  if(dx||dy){
    const m=Math.hypot(dx,dy);
    dx*=MOVE_SPEED*dt/m; dy*=MOVE_SPEED*dt/m;
    const nx=player.x+dx, ny=player.y+dy;
    if(gameMap.isFloor(Math.floor(nx),Math.floor(player.y))) player.x=nx;
    if(gameMap.isFloor(Math.floor(player.x),Math.floor(ny))) player.y=ny;
    player.angle = Math.atan2(dy,dx);
  }

  // подгрузка чанков 3×3
  const pcx=Math.floor(player.x/gameMap.chunkSize),
        pcy=Math.floor(player.y/gameMap.chunkSize);
  for(let cy=pcy-1; cy<=pcy+1; cy++){
    for(let cx=pcx-1; cx<=pcx+1; cx++){
      gameMap.ensureChunk(cx,cy);
    }
  }

  // реген забытых чанков
  if(regenT >= REGEN_PERIOD){
    regenT = 0;
    const toR=[];
    gameMap.chunks.forEach((_,key)=>{
      const [cx,cy]=key.split(',').map(Number);
      if(Math.abs(cx-pcx)>1 || Math.abs(cy-pcy)>1) toR.push(key);
    });
    if(toR.length)
      gameMap.regenerateChunksPreserveFOV(toR, computeFOV, player);
  }

  // fade memory
  gameMap.chunks.forEach(chunk=>{
    for(let y=0; y<gameMap.chunkSize; y++){
      for(let x=0; x<gameMap.chunkSize; x++){
        const m = chunk.meta[y][x];
        if(m.memoryAlpha>0)
          m.memoryAlpha = Math.max(0, m.memoryAlpha - dt*FADE_RATE);
      }
    }
  });

  // отрисовка
  ctx.clearRect(0,0,C_W,C_H);
  ctx.save();
  ctx.translate(C_W/2 - player.x*TILE_SIZE,
                C_H/2 - player.y*TILE_SIZE);

  const vis = computeFOV(player.x,player.y,player.angle);

  gameMap.chunks.forEach((chunk,key)=>{
    const [cx,cy]=key.split(',').map(Number),
          baseX = cx*gameMap.chunkSize,
          baseY = cy*gameMap.chunkSize;
    for(let y=0; y<gameMap.chunkSize; y++){
      for(let x=0; x<gameMap.chunkSize; x++){
        const t = chunk.tiles[y][x],
              gx=baseX+x, gy=baseY+y,
              coord=`${gx},${gy}`;

        // memoryAlpha для всех типов
        let alpha = chunk.meta[y][x].memoryAlpha;
        if(vis.has(coord)){
          alpha = 1;
          chunk.meta[y][x].memoryAlpha = 1;
        }
        if(alpha<=0) continue;

        ctx.globalAlpha = alpha;
        if(t==='wall')    ctx.fillStyle = '#444';       // тёмно-серый
        else if(t==='room')ctx.fillStyle = '#88b4ff';   // комнаты
        else if(t==='hall')ctx.fillStyle = '#6c9eff';   // коридоры
        ctx.fillRect(gx*TILE_SIZE, gy*TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
  });

  // игрок
  ctx.globalAlpha = 1;
  ctx.fillStyle   = '#f00';
  ctx.beginPath();
  ctx.arc(player.x*TILE_SIZE, player.y*TILE_SIZE,
          TILE_SIZE*0.4, 0, Math.PI*2);
  ctx.fill();

  ctx.restore();
  requestAnimationFrame(loop);
}

// globals для legacy
window.ctx       = ctx;
window.gameMap   = gameMap;
window.player    = player;
window.TILE_SIZE = TILE_SIZE;
window.C_W       = C_W;
window.C_H       = C_H;

// старт
requestAnimationFrame(loop);