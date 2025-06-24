// map.js

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
    const tiles = this._generateChunk(cx, cy);

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
   * коридорами шириной 1 тайл. Типы клеток:
   *   0 — стена, 1 — коридор, 2 — комната, 3 — дверь.
   * Возвращает number[][] размером chunkSize×chunkSize.
   */
  _generateChunk(cx, cy) {
    const WALL = 0, CORR = 1, ROOM = 2, DOOR = 3;
    const S = this.chunkSize;
    const grid = Array.from({ length: S }, () => Array(S).fill(WALL));

    const rooms = [];
    const roomCount = 3 + Math.floor(Math.random()*3); // 3-5 комнат
    const margin = 2;

    function rand(min, max) { return Math.floor(Math.random()*(max-min+1))+min; }

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

    function carveDoor(room, used = new Set()) {
      const sides = ['N','S','W','E'].filter(s => !used.has(s));
      while (sides.length) {
        const side = sides.splice(Math.floor(Math.random()*sides.length),1)[0];
        if (side==='N' && room.y>3) {
          const x = rand(room.x+1, room.x+room.w-2);
          grid[room.y][x] = DOOR;
          grid[room.y-1][x] = CORR;
          return {x, y: room.y-2, side};
        }
        if (side==='S' && room.y+room.h < S-3) {
          const x = rand(room.x+1, room.x+room.w-2);
          grid[room.y+room.h-1][x] = DOOR;
          grid[room.y+room.h][x] = CORR;
          return {x, y: room.y+room.h+1, side};
        }
        if (side==='W' && room.x>3) {
          const y = rand(room.y+1, room.y+room.h-2);
          grid[y][room.x] = DOOR;
          grid[y][room.x-1] = CORR;
          return {x: room.x-2, y, side};
        }
        if (side==='E' && room.x+room.w < S-3) {
          const y = rand(room.y+1, room.y+room.h-2);
          grid[y][room.x+room.w-1] = DOOR;
          grid[y][room.x+room.w] = CORR;
          return {x: room.x+room.w+1, y, side};
        }
      }
      return null;
    }

    function digHoriz(y,x1,x2) {
      const step = Math.sign(x2 - x1);
      for (let x=x1; x!==x2+step; x+=step) {
        grid[y][x] = CORR;
      }
    }

    function digVert(x,y1,y2) {
      const step = Math.sign(y2 - y1);
      for (let y=y1; y!==y2+step; y+=step) {
        grid[y][x] = CORR;
      }
    }

    function nearRoom(x,y) {
      for (let dy=-1; dy<=1; dy++) {
        for (let dx=-1; dx<=1; dx++) {
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
          grid[p.y][p.x]=CORR;
        }
        return;
      }
      if (Math.random()<0.5) {
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
      const doorNum = 1 + Math.floor(Math.random()*3);
      for (let i=0; i<doorNum; i++) {
        const d = carveDoor(room, used);
        if (d) { doorPoints.push(d); used.add(d.side); }
      }
    }

    for (let i=1; i<doorPoints.length; i++) {
      digCorridor(doorPoints[i-1], doorPoints[i]);
    }

    return grid;
  }
}

// делаем доступным в глобальной области, чтобы game.js увидел
window.GameMap = GameMap;