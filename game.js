// game.js
//
// Рабочий игровой цикл с учётом всех правок:
//   • alias player.angle для корректной перегенерации
//   • FOV помечает “стену-блокер” как видимую, поэтому стены рисуются
//   • перегенерация чанков реально срабатывает раз в секунду
//   • управление: клавиатура + виртуальный джойстик (controls.js)

import { GameMap } from './map.js';

/* ───────── Константы ───────── */
const TILE        = 32;
const SPEED       = 3;            // тайл/сек
const FOV_ANGLE   = Math.PI / 3;  // 60°
const FOV_HALF    = FOV_ANGLE / 2;
const FOV_DIST    = 6;            // тайлов
const FADE_RATE   = 1 / 4;        // память → 0 за 4 c
const REGEN_TIME  = 1.0;          // сек

/* ───────── Canvas ───────── */
const cv  = document.getElementById('gameCanvas');
const ctx = cv.getContext('2d');
let CW, CH;
function fit() { CW = cv.width = innerWidth; CH = cv.height = innerHeight; }
addEventListener('resize', fit); fit();

/* ───────── Карта и спавн ───────── */
const map = new GameMap(32);
map.ensureChunk(0, 0);

let spawnX = 16, spawnY = 16;
outer: for (let y = 0; y < 32; y++)
  for (let x = 0; x < 32; x++)
    if (map.chunks.get('0,0').tiles[y][x] === 'room') { spawnX = x + .5; spawnY = y + .5; break outer; }

const player = { x: spawnX, y: spawnY, ang: 0, angle: 0 };  // alias angle

/* ───────── Ввод ───────── */
const keys = {};
addEventListener('keydown', e => keys[e.key] = true);
addEventListener('keyup',   e => keys[e.key] = false);

// controls.js пишет сюда значения
window.joyDX = 0;
window.joyDY = 0;

/* ───────── Bresenham ───────── */
function line(x0,y0,x1,y1){
  const out=[], dx=Math.abs(x1-x0), dy=Math.abs(y1-y0),
        sx=x0<x1?1:-1, sy=y0<y1?1:-1;
  let err=dx-dy, x=x0, y=y0;
  while(true){
    out.push([x,y]);
    if(x===x1 && y===y1) break;
    const e2=err*2;
    if(e2>-dy){ err-=dy; x+=sx; }
    if(e2< dx){ err+=dx; y+=sy; }
  }
  return out;
}

/* ───────── FOV ───────── */
function FOV(px,py,ang){
  const vis=new Set(), c=Math.cos(ang), s=Math.sin(ang),
        x0=Math.floor(px), y0=Math.floor(py);
  for(let dy=-FOV_DIST;dy<=FOV_DIST;dy++)
    for(let dx=-FOV_DIST;dx<=FOV_DIST;dx++){
      const gx=x0+dx, gy=y0+dy,
            vx=gx+0.5-px, vy=gy+0.5-py,
            d =Math.hypot(vx,vy);
      if(d>FOV_DIST+.5) continue;
      if((vx*c+vy*s)/d < Math.cos(FOV_HALF)) continue;

      let blocked=false;
      const ray=line(x0,y0,gx,gy).slice(1); // без стартовой
      for(const [lx,ly] of ray){
        if(!map.isFloor(lx,ly)){            // наткнулись на стену
          vis.add(`${lx},${ly}`);           // сама стена видима
          blocked=true; break;
        }
      }
      if(!blocked) vis.add(`${gx},${gy}`);  // свободный тайл
    }
  return vis;
}

/* ───────── Главный цикл ───────── */
let prev = performance.now(), regen=0;
function loop(now=performance.now()){
  const dt=(now-prev)/1000; prev=now; regen+=dt;

  // движение
  const dxIn = (+!!keys.d - +!!keys.a) + window.joyDX;
  const dyIn = (+!!keys.s - +!!keys.w) + window.joyDY;
  if(dxIn||dyIn){
    const m=Math.hypot(dxIn,dyIn);
    let dx=dxIn*SPEED*dt/m, dy=dyIn*SPEED*dt/m;
    const nx=player.x+dx, ny=player.y+dy;
    if(map.isFloor(Math.floor(nx),Math.floor(player.y))) player.x=nx;
    if(map.isFloor(Math.floor(player.x),Math.floor(ny))) player.y=ny;
    player.ang   = Math.atan2(dy,dx);
    player.angle = player.ang;                      // alias
  }

  // ensureChunk 3×3
  const pcx=Math.floor(player.x/32), pcy=Math.floor(player.y/32);
  for(let cy=pcy-1;cy<=pcy+1;cy++)
    for(let cx=pcx-1;cx<=pcx+1;cx++)
      map.ensureChunk(cx,cy);

  // регенерация
  if(regen>=REGEN_TIME){
    regen=0;
    const lost=[];
    for(const k of map.chunks.keys()){
      const [cx,cy]=k.split(',').map(Number);
      if(Math.abs(cx-pcx)>1||Math.abs(cy-pcy)>1) lost.push(k);
    }
    if(lost.length){
      console.log('regen',lost.join(','));
      map.regenerateChunksPreserveFOV(lost,FOV,player);
    }
  }

  // fade memory
  for(const ch of map.chunks.values())
    for(const row of ch.meta)
      for(const m of row) if(m.memoryAlpha>0)
        m.memoryAlpha=Math.max(0,m.memoryAlpha-dt*FADE_RATE);

  // рендер
  ctx.clearRect(0,0,CW,CH);
  ctx.save();
  ctx.translate(CW/2-player.x*TILE, CH/2-player.y*TILE);

  const vis=FOV(player.x,player.y,player.ang);

  for(const [key,ch] of map.chunks){
    const [cx,cy]=key.split(',').map(Number),
          ox=cx*32, oy=cy*32;
    for(let y=0;y<32;y++){
      for(let x=0;x<32;x++){
        const t=ch.tiles[y][x],
              gx=ox+x, gy=oy+y,
              id=`${gx},${gy}`;
        let a=ch.meta[y][x].memoryAlpha;
        if(vis.has(id)){ a=1; ch.meta[y][x].memoryAlpha=1; }
        if(a<=0) continue;
        ctx.globalAlpha=a;
        ctx.fillStyle = t==='room' ? '#88b4ff'
                     : t==='hall' ? '#6c9eff'
                     : t==='door' ? '#ffa500'
                     :              '#666';
        ctx.fillRect(gx*TILE, gy*TILE, TILE, TILE);
      }
    }
  }

  // игрок
  ctx.globalAlpha=1;
  ctx.fillStyle='#f00';
  ctx.beginPath();
  ctx.arc(player.x*TILE,player.y*TILE,TILE*0.4,0,Math.PI*2);
  ctx.fill();

  ctx.restore();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);