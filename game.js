// ——————————————————————————————
//  Canvas & константы
// ——————————————————————————————
const TILE_SIZE    = 32,
      MOVE_SPEED   = 3,
      FOV_ANGLE    = Math.PI/3,
      FOV_HALF     = FOV_ANGLE/2,
      FOV_DIST     = 6,
      FADE_RATE    = 1/4,
      REGEN_PERIOD = 1.0;

const canvas = document.getElementById('gameCanvas'),
      ctx    = canvas.getContext('2d');
let C_W, C_H;
function onResize(){
  C_W = canvas.width  = window.innerWidth;
  C_H = canvas.height = window.innerHeight;
}
window.addEventListener('resize', onResize);
onResize();

// ——————————————————————————————
//  Карта и динамический спавн
// ——————————————————————————————
const gameMap = new window.GameMap(32);

// сразу генерируем стартовый чанк (0,0)
gameMap.ensureChunk(0,0);

// находим первую «room» клетку в этом чанке
let player = { x:0, y:0, angle:0 };
let spawned = false;
const startChunk = gameMap.chunks.get('0,0');
for(let yy=0; yy<gameMap.chunkSize && !spawned; yy++){
  for(let xx=0; xx<gameMap.chunkSize; xx++){
    if(startChunk.tiles[yy][xx] === 'room'){
      player.x = xx + 0.5;
      player.y = yy + 0.5;
      spawned = true;
      break;
    }
  }
}
if(!spawned){
  // fallback — центр чанка
  player.x = gameMap.chunkSize/2;
  player.y = gameMap.chunkSize/2;
}
player.angle = 0;

// ——————————————————————————————
//  Управление
// ——————————————————————————————
const keys = {};
window.addEventListener('keydown', e=>keys[e.key]=true);
window.addEventListener('keyup',   e=>keys[e.key]=false);

let joyDX=0, joyDY=0;
const joy = document.getElementById('joystick'),
      knob= document.getElementById('joystick-knob');
joy.addEventListener('pointerdown', e=>{
  e.preventDefault(); const id=e.pointerId;
  function move(ev){
    if(ev.pointerId!==id) return;
    const r=joy.getBoundingClientRect();
    joyDX=(ev.clientX-(r.left+r.right)/2)/(r.width/2);
    joyDY=(ev.clientY-(r.top +r.bottom)/2)/(r.height/2);
    const m=Math.hypot(joyDX,joyDY);
    if(m>1){ joyDX/=m; joyDY/=m; }
    knob.style.transform = `translate(${joyDX*25}px,${joyDY*25}px)`;
  }
  function up(ev){
    if(ev.pointerId!==id) return;
    joyDX=joyDY=0; knob.style.transform='';
    window.removeEventListener('pointermove',move);
    window.removeEventListener('pointerup',  up);
  }
  window.addEventListener('pointermove',move);
  window.addEventListener('pointerup',  up);
});

// ——————————————————————————————
//  Bresenham для FOV
// ——————————————————————————————
function getLine(x0,y0,x1,y1){
  const pts=[], dx=Math.abs(x1-x0), dy=Math.abs(y1-y0),
        sx=x0<x1?1:-1, sy=y0<y1?1:-1;
  let err=dx-dy, x=x0, y=y0;
  while(true){
    pts.push([x,y]);
    if(x===x1 && y===y1) break;
    const e2 = err*2;
    if(e2 > -dy){ err -= dy; x += sx; }
    if(e2 <  dx){ err += dx; y += sy; }
  }
  return pts;
}

// ——————————————————————————————
//  FOV с учётом стен
// ——————————————————————————————
function computeFOV(px,py,angle){
  const vis  = new Set(),
        cosA = Math.cos(angle),
        sinA = Math.sin(angle),
        x0   = Math.floor(px),
        y0   = Math.floor(py);

  for(let dy=-FOV_DIST; dy<=FOV_DIST; dy++){
    for(let dx=-FOV_DIST; dx<=FOV_DIST; dx++){
      const gx = x0+dx, gy = y0+dy,
            vx = gx+0.5 - px, vy = gy+0.5 - py,
            dist = Math.hypot(vx,vy);
      if(dist > FOV_DIST+0.5) continue;
      const dot = (vx*cosA + vy*sinA) / dist;
      if(dot < Math.cos(FOV_HALF)) continue;

      // проверка луча
      const line = getLine(x0,y0,gx,gy);
      let blocked = false;
      for(let i=1; i<line.length; i++){
        const [lx,ly] = line[i];
        if(!gameMap.isFloor(lx, ly)){ blocked = true; break; }
      }
      if(!blocked) vis.add(`${gx},${gy}`);
    }
  }
  return vis;
}

// ——————————————————————————————
//  Главный цикл
// ——————————————————————————————
let lastT = performance.now(),
    regenT = 0;

function loop(now=performance.now()){
  const dt = (now - lastT)/1000;
  lastT = now;
  regenT += dt;

  // — движение —
  let dx = (+!!(keys.d||keys.ArrowRight)) - (+!!(keys.a||keys.ArrowLeft)) + joyDX;
  let dy = (+!!(keys.s||keys.ArrowDown)) - (+!!(keys.w||keys.ArrowUp))    + joyDY;
  if(dx||dy){
    const m = Math.hypot(dx,dy);
    dx*=MOVE_SPEED*dt/m; dy*=MOVE_SPEED*dt/m;
    const nx = player.x+dx, ny = player.y+dy;
    if(gameMap.isFloor(Math.floor(nx),Math.floor(player.y))) player.x = nx;
    if(gameMap.isFloor(Math.floor(player.x),Math.floor(ny))) player.y = ny;
    player.angle = Math.atan2(dy,dx);
  }

  // — предзагрузка чанков 3×3 —
  const pcx = Math.floor(player.x/gameMap.chunkSize),
        pcy = Math.floor(player.y/gameMap.chunkSize);
  for(let cy=pcy-1; cy<=pcy+1; cy++){
    for(let cx=pcx-1; cx<=pcx+1; cx++){
      gameMap.ensureChunk(cx, cy);
    }
  }

  // — перегенерация забытых чанков + лог —
  if(regenT >= REGEN_PERIOD){
    regenT = 0;
    const toR = [];
    gameMap.chunks.forEach((_, key)=>{
      const [cx,cy] = key.split(',').map(Number);
      if(Math.abs(cx-pcx)>1 || Math.abs(cy-pcy)>1) toR.push(key);
    });
    if(toR.length){
      console.log('Re-gen chunks:', toR.join('; '));
      gameMap.regenerateChunksPreserveFOV(toR, computeFOV, player);
    }
  }

  // — fade memory —
  gameMap.chunks.forEach(chunk=>{
    for(let y=0;y<gameMap.chunkSize;y++){
      for(let x=0;x<gameMap.chunkSize;x++){
        const m = chunk.meta[y][x];
        if(m.memoryAlpha>0) m.memoryAlpha = Math.max(0, m.memoryAlpha - dt*FADE_RATE);
      }
    }
  });

  // — отрисовка —
  ctx.clearRect(0,0,C_W,C_H);
  ctx.save();
  ctx.translate(C_W/2 - player.x*TILE_SIZE,
                C_H/2 - player.y*TILE_SIZE);

  const vis = computeFOV(player.x, player.y, player.angle);

  gameMap.chunks.forEach((chunk, key)=>{
    const [cx,cy] = key.split(',').map(Number),
          baseX = cx * gameMap.chunkSize,
          baseY = cy * gameMap.chunkSize;

    for(let y=0;y<gameMap.chunkSize;y++){
      for(let x=0;x<gameMap.chunkSize;x++){
        const t = chunk.tiles[y][x],
              gx = baseX + x,
              gy = baseY + y,
              coord = `${gx},${gy}`;

        // стены: видимые — #666, невидимые — #000
        if(t === 'wall'){
          ctx.globalAlpha = 1;
          ctx.fillStyle   = vis.has(coord) ? '#666' : '#000';
          ctx.fillRect(gx*TILE_SIZE, gy*TILE_SIZE, TILE_SIZE, TILE_SIZE);
          continue;
        }

        let alpha = chunk.meta[y][x].memoryAlpha;
        if(vis.has(coord)){
          alpha = 1;
          chunk.meta[y][x].memoryAlpha = 1;
        }
        if(alpha <= 0) continue;

        ctx.globalAlpha = alpha;
        if(t === 'room')      ctx.fillStyle = '#88b4ff';
        else if(t === 'hall') ctx.fillStyle = '#6c9eff';
        else if(t === 'door') ctx.fillStyle = '#ffa500';
        ctx.fillRect(gx*TILE_SIZE, gy*TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
  });

  // — игрок —
  ctx.globalAlpha = 1;
  ctx.fillStyle   = '#f00';
  ctx.beginPath();
  ctx.arc(player.x*TILE_SIZE, player.y*TILE_SIZE,
          TILE_SIZE*0.4,0,Math.PI*2);
  ctx.fill();

  ctx.restore();
  requestAnimationFrame(loop);
}

// expose globals для старых скриптов
window.ctx       = ctx;
window.gameMap   = gameMap;
window.player    = player;
window.TILE_SIZE = TILE_SIZE;
window.C_W       = C_W;
window.C_H       = C_H;

// стартуем
requestAnimationFrame(loop);