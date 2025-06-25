// map.js

// небольшая 32-битная PRNG Mulberry32
function mulberry32(seed) {
  let a = seed >>> 0;
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * GameMap — чанковая карта с регенерацией забытых тайлов.
 */
class GameMap {
  constructor() {
    // размер одного чанка (в тайлах) — должен совпадать с game.js.chunkSize
    this.chunkSize   = 32;

    // храним чанки: Map<"cx,cy", {tiles: number[][], meta: {memoryAlpha,visited}[][]}>
    this.chunks      = new Map();

    // чтобы не генерировать один и тот же чанк дважды параллельно
    this.generating  = new Set();
  }

  /**
   * Возвращает случайную клетку типа ROOM внутри указанного чанка
   * (глобальные координаты). Если комнат нет, возвращает центр чанка.
   */
  getRandomRoomTile(cx = 0, cy = 0) {
    this.ensureChunk(cx, cy);
    const key = `${cx},${cy}`;
    const chunk = this.chunks.get(key);
    if (!chunk) {
      return { x: cx * this.chunkSize + Math.floor(this.chunkSize / 2),
               y: cy * this.chunkSize + Math.floor(this.chunkSize / 2) };
    }
    const tiles = [];
    for (let y = 0; y < this.chunkSize; y++) {
      for (let x = 0; x < this.chunkSize; x++) {
        if (chunk.tiles[y][x] === 2) { // ROOM
          tiles.push({
            x: cx * this.chunkSize + x,
            y: cy * this.chunkSize + y
          });
        }
      }
    }
    if (!tiles.length) {
      return { x: cx * this.chunkSize + Math.floor(this.chunkSize / 2),
               y: cy * this.chunkSize + Math.floor(this.chunkSize / 2) };
    }
    return tiles[Math.floor(Math.random() * tiles.length)];
  }

  /**
   * Убедиться, что чанк (cx,cy) есть в this.chunks.
   * Если нет — сгенерировать сразу tiles и meta.
   */
  ensureChunk(cx, cy) {
    const key = `${cx},${cy}`;
    if (this.chunks.has(key) || this.generating.has(key)) return;
    this.generating.add(key);

    // 1) Генерим саму сетку пола/стен
    const seed = ((cx * 73856093) ^ (cy * 19349663)) >>> 0;
    const rng  = mulberry32(seed);
    const tiles = this._generateChunk(cx, cy, rng);

    // 2) Создаём пустой meta-массив с memoryAlpha=0, visited=false
    const meta = Array.from({ length: this.chunkSize }, () =>
      Array.from({ length: this.chunkSize }, () => ({
        memoryAlpha: 0,
        visited:     false
      }))
    );

    // 3) Сохраняем
    this.chunks.set(key, { tiles, meta });
    this.generating.delete(key);
  }

  /**
   * Проверка, можно ли ходить по глобальным координатам (gx,gy).
   * Возвращает true, если внутри чанка и в tiles[ly][lx] = true (пол).
   */
  isFloor(gx, gy) {
    const cx = Math.floor(gx / this.chunkSize);
    const cy = Math.floor(gy / this.chunkSize);
    const key = `${cx},${cy}`;
    const chunk = this.chunks.get(key);
    if (!chunk) return false;
    const lx = gx - cx * this.chunkSize;
    const ly = gy - cy * this.chunkSize;
    if (lx < 0 || ly < 0 || lx >= this.chunkSize || ly >= this.chunkSize) return false;
    return chunk.tiles[ly][lx] !== 0; // 0 = wall
  }

  /**
   * Пакетная перегенерация тех чанков, ключи которых в keys:
   * — сохраняем все тайлы и meta, где либо в FOV, либо memoryAlpha>0
   * — удаляем старый чанк
   * — генерируем новый (ensureChunk)
   * — заливаем туда сохранённые tile/meta
   */
  regenerateChunksPreserveFOV(keys, computeFOV, player) {
    // сначала FOV текущей позиции
    const vis = computeFOV(player.x, player.y, player.angle);

    for (let key of keys) {
      const [cx, cy] = key.split(',').map(Number);
      const oldChunk = this.chunks.get(key);
      if (!oldChunk) continue;

      // 1) стэшируем все "видимые" или "ещё не потухшие" квадратики
      const stash = [];
      const baseX = cx * this.chunkSize;
      const baseY = cy * this.chunkSize;
      for (let ly = 0; ly < this.chunkSize; ly++) {
        for (let lx = 0; lx < this.chunkSize; lx++) {
          const gx = baseX + lx, gy = baseY + ly;
          const m   = oldChunk.meta[ly][lx];
          const coord = `${gx},${gy}`;
          if (vis.has(coord) || m.memoryAlpha > 0) {
            stash.push({
              lx, ly,
              tile: oldChunk.tiles[ly][lx],
              meta: { memoryAlpha: m.memoryAlpha, visited: m.visited }
            });
          }
        }
      }

      // 2) удаляем старый
      this.chunks.delete(key);

      // 3) генерим снова
      this.ensureChunk(cx, cy);

      // 4) возвращаем сохранённые квадратики
      const fresh = this.chunks.get(key);
      for (let s of stash) {
        fresh.tiles[s.ly][s.lx] = s.tile;
        fresh.meta [s.ly][s.lx] = s.meta;
      }
    }
  }

  // ————————
  // Внутренние вспомогательные
  // ————————

  /**
   * Процедурная генерация одного чанка cx,cy:
   * создаёт набор комнат размером 4-8 тайлов и соединяет их
   * коридорами шириной 2 тайла. Типы клеток:
   *   0 — стена, 1 — коридор, 2 — комната, 3 — дверь.
   * Возвращает number[][] размером chunkSize×chunkSize.
   */
  _generateChunk(cx, cy, rng = Math.random) {
    const WALL = 0, CORR = 1, ROOM = 2, DOOR = 3;
    const S = this.chunkSize;
    const grid = Array.from({ length: S }, () => Array(S).fill(WALL));

    const rooms = [];
    const roomCount = 3 + Math.floor(rng()*3); // 3-5 комнат
    const margin = 2;

    function rand(min, max) { return Math.floor(rng()*(max-min+1))+min; }

    // попытки расположить комнаты без перекрытия
    for (let r=0; r<roomCount; r++) {
      for (let t=0; t<20; t++) {
        const w = rand(4,8);
        const h = rand(4,8);
        const x = rand(margin, S - w - margin);
        const y = rand(margin, S - h - margin);
        let overlap = false;
        for (let yy=Math.max(0, y-3); yy<Math.min(S, y+h+3) && !overlap; yy++) {
          for (let xx=Math.max(0, x-3); xx<Math.min(S, x+w+3); xx++) {
            if (grid[yy][xx] !== WALL) { overlap = true; break; }
          }
        }
        if (!overlap) {
          rooms.push({x,y,w,h});
          for (let yy=y; yy<y+h; yy++)
            for (let xx=x; xx<x+w; xx++)
              grid[yy][xx] = ROOM;
          break;
        }
      }
    }

    // создаёт двойную дверь и небольшой тамбур перед ней
    function carveDoor(room, used = new Set()) {
      const sides = ['N','S','W','E'].filter(s => !used.has(s));
      while (sides.length) {
        const side = sides.splice(Math.floor(rng()*sides.length),1)[0];
        if (side==='N' && room.y>4) {
          const x = rand(room.x+1, room.x+room.w-3);
          grid[room.y][x] = DOOR; grid[room.y][x+1] = DOOR;
          grid[room.y-1][x] = CORR; grid[room.y-1][x+1] = CORR;
          grid[room.y-2][x] = CORR; grid[room.y-2][x+1] = CORR;
          return {x, y: room.y-3, side};
        }
        if (side==='S' && room.y+room.h < S-4) {
          const x = rand(room.x+1, room.x+room.w-3);
          const y0 = room.y+room.h-1;
          grid[y0][x] = DOOR; grid[y0][x+1] = DOOR;
          grid[y0+1][x] = CORR; grid[y0+1][x+1] = CORR;
          grid[y0+2][x] = CORR; grid[y0+2][x+1] = CORR;
          return {x, y: y0+3, side};
        }
        if (side==='W' && room.x>4) {
          const y = rand(room.y+1, room.y+room.h-3);
          grid[y][room.x] = DOOR; grid[y+1][room.x] = DOOR;
          grid[y][room.x-1] = CORR; grid[y+1][room.x-1] = CORR;
          grid[y][room.x-2] = CORR; grid[y+1][room.x-2] = CORR;
          return {x: room.x-3, y, side};
        }
        if (side==='E' && room.x+room.w < S-4) {
          const y = rand(room.y+1, room.y+room.h-3);
          const x0 = room.x+room.w-1;
          grid[y][x0] = DOOR; grid[y+1][x0] = DOOR;
          grid[y][x0+1] = CORR; grid[y+1][x0+1] = CORR;
          grid[y][x0+2] = CORR; grid[y+1][x0+2] = CORR;
          return {x: x0+3, y, side};
        }
      }
      return null;
    }

    function digHoriz(y,x1,x2) {
      const step = Math.sign(x2 - x1);
      for (let x=x1; x!==x2+step; x+=step) {
        grid[y][x] = CORR;
        if (y+1 < S) grid[y+1][x] = CORR;
      }
    }

    function digVert(x,y1,y2) {
      const step = Math.sign(y2 - y1);
      for (let y=y1; y!==y2+step; y+=step) {
        grid[y][x] = CORR;
        if (x+1 < S) grid[y][x+1] = CORR;
      }
    }

    function nearRoom(x,y) {
      for (let dy=-2; dy<=2; dy++) {
        for (let dx=-2; dx<=2; dx++) {
          const nx=x+dx, ny=y+dy;
          if (nx<0||ny<0||nx>=S||ny>=S) continue;
          if (grid[ny][nx] === ROOM) return true;
        }
      }
      return false;
    }

    function bfsPath(start, goal) {
      const q=[start];
      const prev=new Map();
      const key=(p)=>`${p.x},${p.y}`;
      const visited=new Set([key(start)]);
      const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
      while(q.length){
        const cur=q.shift();
        if(cur.x===goal.x && cur.y===goal.y) break;
        for(const [dx,dy] of dirs){
          const nx=cur.x+dx, ny=cur.y+dy;
          if(nx<0||ny<0||nx>=S||ny>=S) continue;
          const k=key({x:nx,y:ny});
          if(visited.has(k)) continue;
          if(grid[ny][nx]===ROOM) continue;
          if(nearRoom(nx,ny) && !(nx===goal.x&&ny===goal.y)) continue;
          visited.add(k);
          prev.set(k,cur);
          q.push({x:nx,y:ny});
        }
      }
      const gk=key(goal);
      if(!visited.has(gk)) return null;
      const path=[];
      let cur=goal;
      while(key(cur)!==key(start)){
        path.push(cur);
        cur=prev.get(key(cur));
      }
      path.push(start);
      path.reverse();
      return path;
    }

    function digCorridor(a,b) {
      const path=bfsPath(a,b);
      if(path){
        for(const p of path){
          for(let dy=0; dy<2; dy++)
            for(let dx=0; dx<2; dx++)
              if(p.x+dx < S && p.y+dy < S) grid[p.y+dy][p.x+dx]=CORR;
        }
        return;
      }
      if (rng()<0.5) {
        digHoriz(a.y, a.x, b.x);
        digVert(b.x, a.y, b.y);
      } else {
        digVert(a.x, a.y, b.y);
        digHoriz(b.y, a.x, b.x);
      }
    }

    const doorPoints = [];
    for (let room of rooms) {
      const used = new Set();
      const doorNum = 2 + Math.floor(rng()*2);
      for (let i=0; i<doorNum; i++) {
        const d = carveDoor(room, used);
        if (d) { doorPoints.push(d); used.add(d.side); }
      }
    }

    // Deterministic edge connectors so adjacent chunks line up
    function edgeRand(dir, extra = 0) {
      let ox = 0, oy = 0;
      if (dir === 'N') oy = -1;
      if (dir === 'S') oy = 1;
      if (dir === 'W') ox = -1;
      if (dir === 'E') ox = 1;
      const seed = ((cx + cx + ox) * 73856093) ^ ((cy + cy + oy) * 19349663) ^ extra;
      const v = Math.sin(seed) * 43758.5453;
      return v - Math.floor(v);
    }

    function carveEdge(dir, pos) {
      if (dir === 'N') {
        for (let i=0; i<2; i++) {
          grid[i][pos] = CORR;
          grid[i][pos+1] = CORR;
        }
        return { x: pos, y: 2, side: 'N' };
      }
      if (dir === 'S') {
        for (let i=0; i<2; i++) {
          grid[S-1-i][pos] = CORR;
          grid[S-1-i][pos+1] = CORR;
        }
        return { x: pos, y: S-3, side: 'S' };
      }
      if (dir === 'W') {
        for (let i=0; i<2; i++) {
          grid[pos][i] = CORR;
          grid[pos+1][i] = CORR;
        }
        return { x: 2, y: pos, side: 'W' };
      }
      if (dir === 'E') {
        for (let i=0; i<2; i++) {
          grid[pos][S-1-i] = CORR;
          grid[pos+1][S-1-i] = CORR;
        }
        return { x: S-3, y: pos, side: 'E' };
      }
    }

    const edges = ['N','S','W','E'];
    const connectors = [];
    for (let dir of edges) {
      const pos = 2 + Math.floor(edgeRand(dir, 1) * (S - 6));
      connectors.push(carveEdge(dir, pos));
    }
    doorPoints.push(...connectors);

    for (let i=1; i<doorPoints.length; i++) {
      digCorridor(doorPoints[i-1], doorPoints[i]);
    }

    return grid;
  }
}

// делаем доступным в глобальной области, чтобы game.js увидел
if (typeof window !== 'undefined') window.GameMap = GameMap;
if (typeof module !== 'undefined' && module.exports) module.exports = GameMap;
