// game.js
// game.js (верхняя строка)
import { GameMap } from './map.js';

const TILE_SIZE  = 32;
const MOVE_SPEED = 3;
const FOV_ANGLE  = Math.PI/3;
const FOV_HALF   = FOV_ANGLE/2;
const FOV_DIST   = 6;
const FADE_RATE  = 1/4;
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

let player = { x:0, y:0, angle:0 };
window.Input = { dx:0, dy:0 };

const gameMap = new GameMap();
gameMap.ensureChunk(0,0);
player.x = player.y = gameMap.chunkSize/2;

let lastTime = performance.now(), regenTimer = 0;
const toRegen = new Set();

function loop(now = performance.now()) {
  const dt = (now - lastTime)/1000;
  lastTime = now;
  regenTimer += dt;

  const pcx = Math.floor(player.x / gameMap.chunkSize),
        pcy = Math.floor(player.y / gameMap.chunkSize);

  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++)
      gameMap.ensureChunk(pcx+dx, pcy+dy);

  // движение WASD
  let vx = Input.dx, vy = Input.dy;
  const m = Math.hypot(vx,vy)||1;
  vx/=m; vy/=m;
  if (vx||vy) {
    player.angle = Math.atan2(vy,vx);
    const nx = player.x + vx*MOVE_SPEED*dt;
    const ny = player.y + vy*MOVE_SPEED*dt;
    if (gameMap.isFloor(Math.floor(nx), Math.floor(player.y)))
      player.x = nx;
    if (gameMap.isFloor(Math.floor(player.x), Math.floor(ny)))
      player.y = ny;
  }

  // FOV + память
  const vis = computeFOV(player.x, player.y, player.angle);
  for (let dy=-1; dy<=1; dy++) for (let dx=-1; dx<=1; dx++) {
    const cx=pcx+dx, cy=pcy+dy;
    const key = `${cx},${cy}`;
    const chunk = gameMap.chunks.get(key);
    if (!chunk) continue;
    const meta = chunk.meta;
    const baseX = cx*gameMap.chunkSize,
          baseY = cy*gameMap.chunkSize;
    for (let y=0;y<gameMap.chunkSize;y++)for(let x=0;x<gameMap.chunkSize;x++){
      const gx=baseX+x, gy=baseY+y, coord = `${gx},${gy}`,
            cell = meta[y][x];
      if (vis.has(coord)) {
        cell.visited = true;
        cell.memoryAlpha = 1;
      } else if (cell.memoryAlpha>0) {
        cell.memoryAlpha = Math.max(0, cell.memoryAlpha - FADE_RATE*dt);
        if (cell.memoryAlpha===0) toRegen.add(key);
      }
    }
  }

  if (regenTimer >= REGEN_PERIOD) {
    regenTimer -= REGEN_PERIOD;
    if (toRegen.size) {
      console.log('>>> regen:', Array.from(toRegen));
      gameMap.regenerateChunksPreserveFOV(toRegen, computeFOV, player);
      toRegen.clear();
    }
  }

  render();
  requestAnimationFrame(loop);
}

function computeFOV(px,py,angle) {
  const vis = new Set(), steps=64;
  for (let i=0;i<=steps;i++){
    const a=angle-FOV_HALF+(i/steps)*FOV_ANGLE,
          dx=Math.cos(a), dy=Math.sin(a);
    let dist=0;
    while(dist<FOV_DIST){
      const fx=px+dx*dist, fy=py+dy*dist,
            ix=Math.floor(fx), iy=Math.floor(fy);
      vis.add(`${ix},${iy}`);
      if (!gameMap.isFloor(ix,iy)) break;
      dist += 0.2;
    }
  }
  return vis;
}

function render(){
  ctx.fillStyle = "#000";
  ctx.fillRect(0,0,C_W,C_H);

  ctx.save();
  ctx.translate(C_W/2-player.x*TILE_SIZE,
                C_H/2-player.y*TILE_SIZE);

  const vis = computeFOV(player.x, player.y, player.angle);
  const minX = Math.floor(player.x - C_W/TILE_SIZE/2)-1;
  const maxX = Math.floor(player.x + C_W/TILE_SIZE/2)+1;
  const minY = Math.floor(player.y - C_H/TILE_SIZE/2)-1;
  const maxY = Math.floor(player.y + C_H/TILE_SIZE/2)+1;

  for (let gy=minY; gy<=maxY; gy++){
    for (let gx=minX; gx<=maxX; gx++){
      const px=gx*TILE_SIZE, py=gy*TILE_SIZE;
      const ck = `${Math.floor(gx/gameMap.chunkSize)},${Math.floor(gy/gameMap.chunkSize)}`;
      if (!gameMap.chunks.has(ck)) continue;
      const ch = gameMap.chunks.get(ck),
            lx = gx - Math.floor(gx/gameMap.chunkSize)*gameMap.chunkSize,
            ly = gy - Math.floor(gy/gameMap.chunkSize)*gameMap.chunkSize;
      const tile = ch.tiles[ly][lx],
            α = ch.meta[ly][lx].memoryAlpha;
      if (α<=0) continue;
      ctx.globalAlpha = α;
      // цвета: комната, коридор, дверь, стена
      switch(tile){
        case 'room': ctx.fillStyle = "#334455"; break;
        case 'hall': ctx.fillStyle = "#556677"; break;
        case 'door': ctx.fillStyle = "#aa8855"; break;
        default:      ctx.fillStyle = "#222";     break;
      }
      ctx.fillRect(px,py,TILE_SIZE,TILE_SIZE);
    }
  }

  ctx.globalAlpha = 1;
  ctx.fillStyle = "#f00";
  ctx.beginPath();
  ctx.arc(player.x*TILE_SIZE, player.y*TILE_SIZE,
          TILE_SIZE*0.4, 0, Math.PI*2);
  ctx.fill();

  ctx.restore();
}

// --- Expose globals for legacy scripts ---
window.ctx     = ctx;
window.gameMap = gameMap;
window.player  = player;
window.TILE_SIZE = TILE_SIZE;
window.C_W     = C_W;
window.C_H     = C_H;
// (window.monsters уже создаётся в monsters.js,
// window.computeFOV — в fov.js, так что их трогать не нужно)
// В конце game.js, перед requestAnimationFrame(loop)

window.ctx     = ctx;
window.gameMap = gameMap;
window.player  = player;
window.TILE_SIZE = TILE_SIZE;
requestAnimationFrame(loop);