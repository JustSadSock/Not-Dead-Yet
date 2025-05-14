// game.js

// ========== КОНСТАНТЫ ==========
const RENDER_W   = 30;     // область просмотра, тайлов
const RENDER_H   = 30;
const TILE_SIZE  = 100;    // пикселей на тайл
const SPEED      = 3;      // тайлы в секунду
const FOG_FADE   = 0.5;    // «память» тускнеет на это за сек

// ========== CANVAS ==========
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
canvas.width  = RENDER_W * TILE_SIZE;
canvas.height = RENDER_H * TILE_SIZE;

// ========== ИГРОВАЯ КАРТА ==========
const gameMap = new GameMap(300, 300, RENDER_W, RENDER_H, TILE_SIZE);
window.gameMap = gameMap;  // доступно глобально

// ========== ПОЛЕ ЗРЕНИЯ (ray-casting) ==========
function computeFOV(map, player) {
  const visible = new Set();
  const maxR    = 10;
  const fov     = Math.PI/3;
  const halfFOV = fov/2;
  const rays    = 64;

  for (let i = 0; i <= rays; i++) {
    const ang = player.directionAngle - halfFOV + (i/rays)*fov;
    const dx  = Math.cos(ang), dy = Math.sin(ang);
    let dist   = 0;
    while (dist < maxR) {
      const fx = player.x + dx*dist,
            fy = player.y + dy*dist;
      const ix = Math.floor(fx),
            iy = Math.floor(fy);
      // генерим чей надо чанк
      map.ensureChunk(Math.floor(ix/RENDER_W), Math.floor(iy/RENDER_H));
      if (ix<0||iy<0||ix>=map.cols||iy>=map.rows) break;
      visible.add(`${ix},${iy}`);
      if (map.tiles[iy][ix].type==='wall') break;
      dist += 0.2;
    }
  }
  return visible;
}

// ========== МОНСТРЫ ==========
class Monster {
  constructor(x,y,real=true) {
    this.x = x; this.y = y;
    this.real = real;
    this.timer = 0;
    this.visibleTimer = 0;
    this.dead = false;
  }
  update(dt, visible) {
    const key = `${Math.floor(this.x)},${Math.floor(this.y)}`;
    const inView = visible.has(key);
    this.timer += dt;
    this.visibleTimer = inView ? this.visibleTimer+dt : 0;
    if (!this.real && this.timer > 5) this.dead = true;
  }
  draw(ctx) {
    const px = (this.x+0.5)*TILE_SIZE,
          py = (this.y+0.5)*TILE_SIZE;
    if (this.timer < 0.2) {
      ctx.save();
      ctx.globalAlpha = this.real ? 0.5 : 0.2;
      ctx.strokeStyle = 'white';
      ctx.beginPath();
      ctx.arc(px,py,TILE_SIZE*0.4,0,Math.PI*2);
      ctx.stroke();
      ctx.restore();
    } else if (this.real && this.visibleTimer>0) {
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(px,py,TILE_SIZE*0.4,0,Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
  }
}

const monsters = [];
window.monsters = monsters;

// спавн монстра каждые 2 сек
setInterval(()=>{
  // берём текущее поле зрения
  const vis = computeFOV(gameMap, player);
  // ищем случайную точку вне FOV и на полу
  let x,y,key;
  do {
    x = Math.floor(Math.random()*gameMap.cols);
    y = Math.floor(Math.random()*gameMap.rows);
    key = `${x},${y}`;
  } while (vis.has(key) || gameMap.tiles[y][x].type==='wall');
  const real = Math.random()<0.3;
  monsters.push(new Monster(x,y,real));
},2000);

// ========== ИГРОК ==========
const player = {
  x: RENDER_W/2 + 0.5,
  y: RENDER_H/2 + 0.5,
  directionAngle: 0
};
window.player = player;

// ========== ДЕЛЬТА-тайм ==========
let last = performance.now();

// ========== ОСНОВНОЙ ЦИКЛ ==========
function gameLoop(now=performance.now()){
  const dt = (now-last)/1000;
  last = now;

  // --- 1) Ввод и поворот ---
  const iv = window.inputVector || {x:0,y:0};
  if (iv.x!==0||iv.y!==0) player.directionAngle = Math.atan2(iv.y, iv.x);

  // --- 2) Плавное движение + коллизии ---
  const nx = player.x + iv.x*SPEED*dt,
        ny = player.y + iv.y*SPEED*dt;
  if (!gameMap.isWall(Math.floor(nx),Math.floor(ny))) {
    player.x = nx; player.y = ny;
  }

  // --- 3) FOV ---
  const visible = computeFOV(gameMap, player);

  // --- 4) «Память» и реген тайлов ---
  for (let y=0;y<gameMap.rows;y++) {
    for (let x=0;x<gameMap.cols;x++) {
      const tile = gameMap.tiles[y][x],
            key  = `${x},${y}`;
      if (visible.has(key)) {
        tile.memoryAlpha = 1;
      } else if (tile.memoryAlpha>0) {
        tile.memoryAlpha = Math.max(0, tile.memoryAlpha - FOG_FADE*dt);
        if (tile.memoryAlpha===0) gameMap.regenerateTile(x,y);
      }
    }
  }

  // --- 5) Обновляем и чистим монстров ---
  monsters.forEach(m=>m.update(dt, visible));
  monsters.filter(m=>!m.dead);

  // --- 6) Отрисовка ---
  const camX = player.x - RENDER_W/2,
        camY = player.y - RENDER_H/2;
  const startX = Math.floor(camX), startY = Math.floor(camY),
        endX   = Math.ceil(camX+RENDER_W),
        endY   = Math.ceil(camY+RENDER_H);

  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.save();
  ctx.translate(-camX*TILE_SIZE, -camY*TILE_SIZE);

  // тайлы
  for (let y=startY; y<endY; y++){
    if (y<0||y>=gameMap.rows) continue;
    for (let x=startX; x<endX; x++){
      if (x<0||x>=gameMap.cols) continue;
      const t = gameMap.tiles[y][x];
      ctx.globalAlpha = t.memoryAlpha;
      ctx.fillStyle   = t.type==='wall' ? '#444' : '#888';
      ctx.fillRect(x*TILE_SIZE, y*TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
  }
  ctx.globalAlpha = 1;

  // монстры
  monsters.forEach(m => m.draw(ctx));

  // игрок
  const px = (player.x+0.5)*TILE_SIZE,
        py = (player.y+0.5)*TILE_SIZE;
  ctx.fillStyle = 'red';
  ctx.beginPath();
  ctx.arc(px,py,TILE_SIZE*0.4,0,Math.PI*2);
  ctx.fill();

  ctx.restore();
  requestAnimationFrame(gameLoop);
}

// старт
gameLoop();