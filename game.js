// game.js
//
// Полностью рабочий цикл из «старой» версии с коридорами.
// ─ движение (WASD + вирту-джойстик из controls.js)
// ─ FOV со стенами
// ─ fade-память
// ─ регулярная перегенерация чанков
// ─ отрисовка: комнаты, коридоры, двери, стены, игрок

import { GameMap } from './map.js';

// ——————————————————  Константы  ——————————————————
const TILE = 32;
const SPEED = 3;                // тайлов/сек
const FOV_ANG = Math.PI / 3;    // 60°
const FOV_HALF = FOV_ANG / 2;
const FOV_DIST = 6;             // радиус
const FADE = 1 / 4;             // память стирается 4 с
const REGEN = 1.0;              // реген чанков, с

// ——————————————————  Canvas  ——————————————————
const cvs = document.getElementById('gameCanvas');
const ctx = cvs.getContext('2d');
let CW, CH;
function fit() {
  CW = cvs.width  = innerWidth;
  CH = cvs.height = innerHeight;
}
addEventListener('resize', fit);
fit();

// ——————————————————  Карта и спавн  ——————————————————
const map = new GameMap(32);
map.ensureChunk(0, 0);
let px = 16, py = 16;           // найдём первый 'room'
outer: for (let y=0;y<32;y++)
  for (let x=0;x<32;x++)
    if (map.chunks.get('0,0').tiles[y][x]==='room'){ px=x+.5; py=y+.5; break outer; }

const player = { x:px, y:py, ang:0 };

// ——————————————————  Ввод  ——————————————————
const keys = {};
addEventListener('keydown', e=>keys[e.key]=true);
addEventListener('keyup',   e=>keys[e.key]=false);

// window.joyDX / joyDY задаёт controls.js
let joyX = 0, joyY = 0;
Object.defineProperty(window,'joyDX',{
  set(v){ joyX=v }, get(){ return joyX }
});
Object.defineProperty(window,'joyDY',{
  set(v){ joyY=v }, get(){ return joyY }
});

// ——————————————————  Bresenham  ——————————————————
function line(x0,y0,x1,y1){
  const out=[], dx=Math.abs(x1-x0),dy=Math.abs(y1-y0),
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

// ——————————————————  FOV  ——————————————————
function FOV(px,py,ang){
  const vis=new Set(), c=Math.cos(ang), s=Math.sin(ang),
        x0=Math.floor(px), y0=Math.floor(py);
  for(let dy=-FOV_DIST;dy<=FOV_DIST;dy++)
    for(let dx=-FOV_DIST;dx<=FOV_DIST;dx++){
      const gx=x0+dx, gy=y0+dy,
            vx=gx+0.5-px, vy=gy+0.5-py,
            d=Math.hypot(vx,vy);
      if(d>FOV_DIST+.5) continue;
      if((vx*c+vy*s)/d < Math.cos(FOV_HALF)) continue;
      let wall=false;
      for(const [lx,ly] of line(x0,y0,gx,gy).slice(1))
        if(!map.isFloor(lx,ly)){ wall=true; break; }
      if(!wall) vis.add(`${gx},${gy}`);
    }
  return vis;
}

// ——————————————————  Главный цикл  ——————————————————
let tPrev=performance.now(), regen=0;
function loop(t=performance.now()){
  const dt=(t-tPrev)/1000; tPrev=t; regen+=dt;

  // движение
  let dx=(+!!keys.d-+!!keys.a)+joyX,
      dy=(+!!keys.s-+!!keys.w)+joyY;
  if(dx||dy){
    const m=Math.hypot(dx,dy);
    dx*=SPEED*dt/m; dy*=SPEED*dt/m;
    const nx=player.x+dx, ny=player.y+dy;
    if(map.isFloor(Math.floor(nx),Math.floor(player.y))) player.x=nx;
    if(map.isFloor(Math.floor(player.x),Math.floor(ny))) player.y=ny;
    player.ang=Math.atan2(dy,dx);
  }

  // подгрузка чанков 3×3
  const pcx=Math.floor(player.x/32), pcy=Math.floor(player.y/32);
  for(let cy=pcy-1;cy<=pcy+1;cy++)
    for(let cx=pcx-1;cx<=pcx+1;cx++)
      map.ensureChunk(cx,cy);

  // регенерация забытых чанков
  if(regen>=REGEN){ regen=0;
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

  // fade памяти
  for(const c of map.chunks.values())
    for(const row of c.meta)
      for(const m of row) if(m.memoryAlpha>0) m.memoryAlpha=Math.max(0,m.memoryAlpha-dt*FADE);

  // ——— рендер ———
  ctx.clearRect(0,0,CW,CH);
  ctx.save();
  ctx.translate(CW/2-player.x*TILE, CH/2-player.y*TILE);

  const vis=FOV(player.x,player.y,player.ang);

  for(const [key,ch] of map.chunks){
    const [cx,cy]=key.split(',').map(Number),
          ox=cx*32, oy=cy*32;
    for(let y=0;y<32;y++)
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