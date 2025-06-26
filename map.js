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
  ensureChunk(cx, cy, extraSeed = 0) {
    const key = `${cx},${cy}`;
    if (this.chunks.has(key) || this.generating.has(key)) return;
    this.generating.add(key);

    // 1) Генерим саму сетку пола/стен
    const seed = ((cx * 73856093) ^ (cy * 19349663) ^ extraSeed) >>> 0;
    const rng  = mulberry32(seed);
    const { grid: tiles, rooms } = this._generateChunk(cx, cy, rng);

    // 2) Создаём пустой meta-массив с memoryAlpha=0, visited=false
    const meta = Array.from({ length: this.chunkSize }, () =>
      Array.from({ length: this.chunkSize }, () => ({
        memoryAlpha: 0,
        visited:     false
      }))
    );

    // 3) Сохраняем
    this.chunks.set(key, { tiles, meta, rooms });
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
  regenerateChunksPreserveFOV(keys, computeFOV, player, extraSeed = 0) {
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
      this.ensureChunk(cx, cy, extraSeed);

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
   * Возвращает { grid, rooms } где grid — массив chunkSize×chunkSize.
  */
  _generateChunk(cx, cy, rng = Math.random) {
    const WALL = 0, CORR = 1, ROOM = 2, DOOR = 3;
    const S = this.chunkSize;
    const CORRIDOR_WIDTH = 2;
    const MAX_CORRIDOR_LEN = 20;
    const grid = Array.from({ length: S }, () => Array(S).fill(WALL));

    const rooms = [];
    const roomCount = 3 + Math.floor(rng()*3); // 3-5 комнат
    const margin = 2;

    function rand(min, max) { return Math.floor(rng()*(max-min+1))+min; }

    function roomTiles(x, y, w, h) {
      const tiles = [];
      for (let yy = y; yy < y + h; yy++)
        for (let xx = x; xx < x + w; xx++)
          tiles.push({ x: xx, y: yy });
      return tiles;
    }

    function canPlace(tiles){
      for(const {x,y} of tiles){
        for(let dy=-2;dy<=2;dy++){
          for(let dx=-2;dx<=2;dx++){
            const nx=x+dx, ny=y+dy;
            if(nx<0||ny<0||nx>=S||ny>=S) continue;
            if(grid[ny][nx]!==WALL) return false;
          }
        }
      }
      return true;
    }

    // попытки расположить комнаты без перекрытия
    for (let r = 0; r < roomCount; r++) {
      for (let t = 0; t < 20; t++) {
        const w = rand(4, 8);
        const h = rand(4, 8);
        const x = rand(margin, S - w - margin);
        const y = rand(margin, S - h - margin);
        const tiles = roomTiles(x, y, w, h);
        if (canPlace(tiles)) {
          rooms.push({ x, y, w, h, tiles, id: rooms.length, doorSides: [] });
          for (const { x: tx, y: ty } of tiles) grid[ty][tx] = ROOM;
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
          if(grid[room.y][x]!==ROOM||grid[room.y][x+1]!==ROOM) continue;
          if(grid[room.y-1][x]!==WALL||grid[room.y-1][x+1]!==WALL||
             grid[room.y-2][x]!==WALL||grid[room.y-2][x+1]!==WALL) continue;
          grid[room.y][x] = DOOR; grid[room.y][x+1] = DOOR;
          grid[room.y-1][x] = CORR; grid[room.y-1][x+1] = CORR;
          grid[room.y-2][x] = CORR; grid[room.y-2][x+1] = CORR;
          return {x, y: room.y-3, side, roomId: room.id};
        }
        if (side==='S' && room.y+room.h < S-4) {
          const x = rand(room.x+1, room.x+room.w-3);
          const y0 = room.y+room.h-1;
          if(grid[y0][x]!==ROOM||grid[y0][x+1]!==ROOM) continue;
          if(grid[y0+1][x]!==WALL||grid[y0+1][x+1]!==WALL||
             grid[y0+2][x]!==WALL||grid[y0+2][x+1]!==WALL) continue;
          grid[y0][x] = DOOR; grid[y0][x+1] = DOOR;
          grid[y0+1][x] = CORR; grid[y0+1][x+1] = CORR;
          grid[y0+2][x] = CORR; grid[y0+2][x+1] = CORR;
          return {x, y: y0+3, side, roomId: room.id};
        }
        if (side==='W' && room.x>4) {
          const y = rand(room.y+1, room.y+room.h-3);
          if(grid[y][room.x]!==ROOM||grid[y+1][room.x]!==ROOM) continue;
          if(grid[y][room.x-1]!==WALL||grid[y+1][room.x-1]!==WALL||
             grid[y][room.x-2]!==WALL||grid[y+1][room.x-2]!==WALL) continue;
          grid[y][room.x] = DOOR; grid[y+1][room.x] = DOOR;
          grid[y][room.x-1] = CORR; grid[y+1][room.x-1] = CORR;
          grid[y][room.x-2] = CORR; grid[y+1][room.x-2] = CORR;
          return {x: room.x-3, y, side, roomId: room.id};
        }
        if (side==='E' && room.x+room.w < S-4) {
          const y = rand(room.y+1, room.y+room.h-3);
          const x0 = room.x+room.w-1;
          if(grid[y][x0]!==ROOM||grid[y+1][x0]!==ROOM) continue;
          if(grid[y][x0+1]!==WALL||grid[y+1][x0+1]!==WALL||
             grid[y][x0+2]!==WALL||grid[y+1][x0+2]!==WALL) continue;
          grid[y][x0] = DOOR; grid[y+1][x0] = DOOR;
          grid[y][x0+1] = CORR; grid[y+1][x0+1] = CORR;
          grid[y][x0+2] = CORR; grid[y+1][x0+2] = CORR;
          return {x: x0+3, y, side, roomId: room.id};
        }
      }
      return null;
    }

    function digHoriz(y,x1,x2) {
      const step = Math.sign(x2 - x1);
      for (let x=x1; x!==x2+step; x+=step) {
        for (let i=0; i<CORRIDOR_WIDTH; i++) {
          if (y+i < S) grid[y+i][x] = CORR;
        }
      }
    }

    function digVert(x,y1,y2) {
      const step = Math.sign(y2 - y1);
      for (let y=y1; y!==y2+step; y+=step) {
        for (let i=0; i<CORRIDOR_WIDTH; i++) {
          if (x+i < S) grid[y][x+i] = CORR;
        }
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

    function aStarPath(start, goal) {
      const key=p=>`${p.x},${p.y}`;
      const open=[start];
      const came=new Map();
      const gScore=new Map([[key(start),0]]);
      const fScore=new Map([[key(start),Math.hypot(goal.x-start.x,goal.y-start.y)]]);
      const dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];

      while(open.length){
        open.sort((a,b)=>fScore.get(key(a))-fScore.get(key(b)));
        const cur=open.shift();
        if(cur.x===goal.x&&cur.y===goal.y) break;
        for(const [dx,dy] of dirs){
          const nx=cur.x+dx, ny=cur.y+dy;
          if(nx<0||ny<0||nx>=S||ny>=S) continue;
          if(Math.abs(dx)===1 && Math.abs(dy)===1){
            if(grid[cur.y][cur.x+dx]===ROOM || grid[cur.y+dy][cur.x]===ROOM) continue;
          }
          if(grid[ny][nx]===ROOM) continue;
          if(nearRoom(nx,ny) && !(nx===goal.x&&ny===goal.y)) continue;
          const step=Math.hypot(dx,dy);
          const tg=(gScore.get(key(cur))||Infinity)+step;
          if(tg < (gScore.get(key({x:nx,y:ny}))||Infinity)){
            came.set(key({x:nx,y:ny}),cur);
            gScore.set(key({x:nx,y:ny}),tg);
            fScore.set(key({x:nx,y:ny}),tg+Math.hypot(goal.x-nx,goal.y-ny));
            if(!open.find(p=>p.x===nx&&p.y===ny)) open.push({x:nx,y:ny});
          }
        }
      }
      const gk=key(goal);
      if(!came.has(gk) && key(start)!==gk) return null;
      const path=[goal];
      let cur=goal;
      while(key(cur)!==key(start)){
        cur=came.get(key(cur));
        if(!cur){ return null; }
        path.push(cur);
      }
      path.reverse();
      return path;
    }

   function digCorridor(a,b) {
     const path=aStarPath(a,b);
     if(path){
        if(path.length-1>MAX_CORRIDOR_LEN) return;
        for(const p of path){
          for(let dy=0; dy<CORRIDOR_WIDTH; dy++)
            for(let dx=0; dx<CORRIDOR_WIDTH; dx++)
              if(p.x+dx < S && p.y+dy < S) grid[p.y+dy][p.x+dx]=CORR;
        }
        return;
      }
      const straightDist=Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
      if(straightDist>MAX_CORRIDOR_LEN) return;
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
      let doorNum = Math.max(1, Math.floor((room.w + room.h)/6));
      if (rng() < 0.5) doorNum++;
      doorNum = Math.min(3, doorNum); // doors on 1-3 sides only
      let placed = 0;
      for (let i=0; i<doorNum; i++) {
        const d = carveDoor(room, used);
        if (d) { doorPoints.push(d); used.add(d.side); room.doorSides.push(d.side); placed++; }
      }
      // If the room ended up without a door, keep trying with relaxed
      // constraints (ignore previously used sides) until one is placed
      let attempts = 0;
      while (placed === 0 && attempts < 4) {
        const d = carveDoor(room);
        if (d) { doorPoints.push(d); room.doorSides.push(d.side); placed++; break; }
        attempts++;
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
        for (let i=0; i<CORRIDOR_WIDTH; i++) {
          for (let j=0; j<CORRIDOR_WIDTH; j++) {
            grid[i][pos+j] = CORR;
          }
        }
        return { x: pos, y: CORRIDOR_WIDTH, side: 'N' };
      }
      if (dir === 'S') {
        for (let i=0; i<CORRIDOR_WIDTH; i++) {
          for (let j=0; j<CORRIDOR_WIDTH; j++) {
            grid[S-1-i][pos+j] = CORR;
          }
        }
        return { x: pos, y: S-CORRIDOR_WIDTH-1, side: 'S' };
      }
      if (dir === 'W') {
        for (let i=0; i<CORRIDOR_WIDTH; i++) {
          for (let j=0; j<CORRIDOR_WIDTH; j++) {
            grid[pos+i][j] = CORR;
          }
        }
        return { x: CORRIDOR_WIDTH, y: pos, side: 'W' };
      }
      if (dir === 'E') {
        for (let i=0; i<CORRIDOR_WIDTH; i++) {
          for (let j=0; j<CORRIDOR_WIDTH; j++) {
            grid[pos+i][S-1-j] = CORR;
          }
        }
        return { x: S-CORRIDOR_WIDTH-1, y: pos, side: 'E' };
      }
    }

    const edges = ['N','S','W','E'];
    const connectors = [];
    for (let dir of edges) {
      const pos = 2 + Math.floor(edgeRand(dir, 1) * (S - 6));
      connectors.push(carveEdge(dir, pos));
    }
    doorPoints.push(...connectors);

    function mst(points, maxDistSq = Infinity) {
      const n = points.length;
      const visited = new Set([0]);
      const edges = [];
      while (visited.size < n) {
        let best = null, bi = -1, bj = -1;
        for (let i of visited) {
          for (let j = 0; j < n; j++) if (!visited.has(j)) {
            const dx = points[i].x - points[j].x;
            const dy = points[i].y - points[j].y;
            const d2 = dx*dx + dy*dy;
            if (d2 > maxDistSq) continue;
            if (best === null || d2 < best) { best = d2; bi = i; bj = j; }
          }
        }
        if (best === null) { // nothing within threshold, ignore it
          for (let i of visited) {
            for (let j = 0; j < n; j++) if (!visited.has(j)) {
              const dx = points[i].x - points[j].x;
              const dy = points[i].y - points[j].y;
              const d2 = dx*dx + dy*dy;
              if (best === null || d2 < best) { best = d2; bi = i; bj = j; }
            }
          }
        }
        visited.add(bj);
        edges.push([bi, bj]);
      }
      return edges;
    }

    const MAX_DIST = (S/2) * (S/2);
    const connections = mst(doorPoints, MAX_DIST);
    for(const [a,b] of connections){
      if(doorPoints[a].roomId===doorPoints[b].roomId) continue;
      digCorridor(doorPoints[a],doorPoints[b]);
    }
    for(let i=0;i<doorPoints.length;i++){
      for(let j=i+1;j<doorPoints.length;j++){
        const dx=doorPoints[i].x-doorPoints[j].x;
        const dy=doorPoints[i].y-doorPoints[j].y;
        if(dx*dx+dy*dy>MAX_DIST) continue;
        if(doorPoints[i].roomId===doorPoints[j].roomId) continue;
        if(rng()<0.10) digCorridor(doorPoints[i],doorPoints[j]);
      }
    }

    // Remove any corridor tile that touches a room without a door next to it.
    // This keeps rooms properly enclosed while allowing only the doors placed
    // by carveDoor() to remain.
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        if (grid[y][x] !== CORR) continue;
        const card = [[1,0],[-1,0],[0,1],[0,-1]];
        for (const [dx,dy] of card) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
          if (grid[ny][nx] === ROOM) { grid[y][x] = WALL; break; }
        }
      }
    }

    // Clean up any corridor segments that became disconnected from doors or
    // the chunk edges after the pruning above.
    const reachable = Array.from({ length: S }, () => Array(S).fill(false));
    const queue = [];
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        if (grid[y][x] === DOOR ||
            (grid[y][x] === CORR && (x === 0 || y === 0 || x === S-1 || y === S-1))) {
          reachable[y][x] = true;
          queue.push([x, y]);
        }
      }
    }
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    while (queue.length) {
      const [cx, cy] = queue.shift();
      for (const [dx, dy] of dirs) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
        if (reachable[ny][nx]) continue;
        if (grid[ny][nx] !== CORR && grid[ny][nx] !== DOOR) continue;
        reachable[ny][nx] = true;
        queue.push([nx, ny]);
      }
    }
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        if ((grid[y][x] === CORR || grid[y][x] === DOOR) && !reachable[y][x]) {
          grid[y][x] = WALL;
        }
      }
    }

    // Enforce the maximum corridor length by measuring distance from doors and
    // chunk edges, trimming any tiles that lie beyond the limit.
    const dist = Array.from({ length: S }, () => Array(S).fill(Infinity));
    const q2 = [];
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        if (grid[y][x] === DOOR ||
            (grid[y][x] === CORR && (x === 0 || y === 0 || x === S-1 || y === S-1))) {
          dist[y][x] = 0;
          q2.push([x, y]);
        }
      }
    }
    while (q2.length) {
      const [cx, cy] = q2.shift();
      for (const [dx, dy] of dirs) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
        if (grid[ny][nx] !== CORR && grid[ny][nx] !== DOOR) continue;
        const nd = dist[cy][cx] + 1;
        if (nd < dist[ny][nx]) {
          dist[ny][nx] = nd;
          q2.push([nx, ny]);
        }
      }
    }
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        if (grid[y][x] === CORR && dist[y][x] > MAX_CORRIDOR_LEN) {
          grid[y][x] = WALL;
        }
      }
    }

    // Surround every room with walls so corridors don't create accidental
    // openings where no door exists.
    for (const room of rooms) {
      for (const { x, y } of room.tiles) {
        // Ensure there is a wall around the room tile where nothing else exists
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
            if (grid[ny][nx] === ROOM || grid[ny][nx] === DOOR || grid[ny][nx] === CORR) continue;
            grid[ny][nx] = WALL;
          }
        }
      }
    }

    return { grid, rooms };
  }
}

// делаем доступным в глобальной области, чтобы game.js увидел
if (typeof window !== 'undefined') window.GameMap = GameMap;
if (typeof module !== 'undefined' && module.exports) module.exports = GameMap;
