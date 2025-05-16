/* ============================================================
   game.js   —   управление, FOV, память, перегенерация, рендер
   ============================================================ */

/* ----------  константы и Canvas  --------------------------- */
const TILE_SIZE    = 32;           // px на тайл
const MOVE_SPEED   = 3;            // тайлов / сек
const FOV_ANGLE    = Math.PI / 3;  // 60°
const FOV_DIST     = 6;            // радиус в тайлах
const FADE_RATE    = 1 / 4;        // memoryAlpha → 0 за 4 с
const REGEN_PERIOD = 1.0;          // пакетная перегенерация

const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
let C_W, C_H;
function resize () {
  C_W = canvas.width  = window.innerWidth;
  C_H = canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize); resize();

/* ----------  ввод  (WASD / стрелки) ----------------------- */
const Input = { dx:0, dy:0 };
window.addEventListener('keydown', e=>{
  switch(e.key){
    case'ArrowUp':case'w':case'W': Input.dy=-1;break;
    case'ArrowDown':case's':case'S': Input.dy= 1;break;
    case'ArrowLeft':case'a':case'A': Input.dx=-1;break;
    case'ArrowRight':case'd':case'D': Input.dx= 1;break;
  }
});
window.addEventListener('keyup', e=>{
  switch(e.key){
    case'ArrowUp':case'w':case'W': if(Input.dy<0) Input.dy=0;break;
    case'ArrowDown':case's':case'S': if(Input.dy>0) Input.dy=0;break;
    case'ArrowLeft':case'a':case'A': if(Input.dx<0) Input.dx=0;break;
    case'ArrowRight':case'd':case'D': if(Input.dx>0) Input.dx=0;break;
  }
});

/* ----------  карта и игрок  ------------------------------- */
const gameMap = new GameMap(32);      // класс из map.js
gameMap.ensureChunk(0,0);

const player = {
  x: gameMap.chunkSize / 2,
  y: gameMap.chunkSize / 2,
  angle: 0
};

/* ----------  служебные переменные  ------------------------ */
let lastTime = performance.now();
let regenAcc = 0;
const toRegen = new Set();

/* ============================================================
                        MAIN LOOP
   ============================================================ */
function loop (now = performance.now()) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  regenAcc += dt;

  /* ----- предзагрузка чанков вокруг игрока (5×5) --------- */
  const pcx = Math.floor(player.x / gameMap.chunkSize),
        pcy = Math.floor(player.y / gameMap.chunkSize);
  for (let dy=-2; dy<=2; dy++)
    for (let dx=-2; dx<=2; dx++)
      gameMap.ensureChunk(pcx+dx, pcy+dy);

  /* ----- движение игрока --------------------------------- */
  let vx=Input.dx, vy=Input.dy;
  const mag=Math.hypot(vx,vy)||1; vx/=mag; vy/=mag;
  if(vx||vy){
    player.angle=Math.atan2(vy,vx);
    const nx=player.x+vx*MOVE_SPEED*dt,
          ny=player.y+vy*MOVE_SPEED*dt;
    if(gameMap.isFloor(Math.floor(nx), Math.floor(player.y))) player.x=nx;
    if(gameMap.isFloor(Math.floor(player.x), Math.floor(ny))) player.y=ny;
  }

  /* ----- FOV и память ------------------------------------ */
  const vis = computeFOV(player.x, player.y, player.angle);
  for(let dy=-1; dy<=1; dy++){
    for(let dx=-1; dx<=1; dx++){
      const key=`${pcx+dx},${pcy+dy}`;
      const ch=gameMap.chunks.get(key); if(!ch) continue;
      const {meta}=ch;
      const bx=(pcx+dx)*gameMap.chunkSize,
            by=(pcy+dy)*gameMap.chunkSize;
      for(let y=0;y<gameMap.chunkSize;y++)
        for(let x=0;x<gameMap.chunkSize;x++){
          const gx=bx+x, gy=by+y, m=meta[y][x];
          if(vis.has(`${gx},${gy}`)){ m.visited=true; m.memoryAlpha=1; }
          else if(m.memoryAlpha>0){
            m.memoryAlpha=Math.max(0,m.memoryAlpha-FADE_RATE*dt);
            if(m.memoryAlpha===0) toRegen.add(key);
          }
        }
    }
  }

  /* ----- пакетная перегенерация раз в секунду ------------- */
  if(regenAcc>=REGEN_PERIOD){
    regenAcc=0;
    if(toRegen.size){
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
function isPassable(gx,gy){ return gameMap.isFloor(gx,gy); }

function computeFOV(px,py,ang){
  const set=new Set(), rays=64, half=FOV_ANGLE/2;
  for(let i=0;i<=rays;i++){
    const a=ang-half+(i/rays)*FOV_ANGLE,
          dx=Math.cos(a), dy=Math.sin(a);
    let dist=0;
    while(dist<FOV_DIST){
      const fx=px+dx*dist, fy=py+dy*dist,
            gx=Math.floor(fx), gy=Math.floor(fy);
      set.add(`${gx},${gy}`);
      if(!isPassable(gx,gy)) break;
      dist+=0.2;
    }
  }
  return set;
}

/* ============================================================
                         RENDER
   ============================================================ */
function render(){
  ctx.fillStyle="#000"; ctx.fillRect(0,0,C_W,C_H);

  ctx.save();
  ctx.translate(C_W/2-player.x*TILE_SIZE,
                C_H/2-player.y*TILE_SIZE);

  const rangeX=Math.ceil(C_W/TILE_SIZE/2)+2,
        rangeY=Math.ceil(C_H/TILE_SIZE/2)+2;

  for(let gy=Math.floor(player.y)-rangeY; gy<=Math.floor(player.y)+rangeY; gy++){
    for(let gx=Math.floor(player.x)-rangeX; gx<=Math.floor(player.x)+rangeX; gx++){
      const cx=Math.floor(gx/gameMap.chunkSize),
            cy=Math.floor(gy/gameMap.chunkSize);
      const ch=gameMap.chunks.get(`${cx},${cy}`); if(!ch) continue;
      const lx=gx-cx*gameMap.chunkSize,
            ly=gy-cy*gameMap.chunkSize;
      const meta=ch.meta[ly][lx];
      if(meta.memoryAlpha<=0) continue;

      /* --- выбор цвета по типу тайла --- */
      const t=ch.tiles[ly][lx];          // 0 wall / 'corridor' / 'room' / 'door'
      let color="#303030";               // стены по умолчанию (не рисуем)
      if(t==='corridor') color="#6c6c6c";
      else if(t==='room') color="#4b728e";
      else if(t==='door') color="#a97447";
      else continue;                     // стену пропускаем

      ctx.globalAlpha=meta.memoryAlpha;
      ctx.fillStyle = color;
      ctx.fillRect(gx*TILE_SIZE, gy*TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
  }

  /* --- игрок --- */
  ctx.globalAlpha=1;
  ctx.fillStyle="#e05050";
  ctx.beginPath();
  ctx.arc(player.x*TILE_SIZE,player.y*TILE_SIZE,TILE_SIZE*0.4,0,Math.PI*2);
  ctx.fill();

  ctx.restore();
}

/* ============================================================
                         START
   ============================================================ */
requestAnimationFrame(loop);