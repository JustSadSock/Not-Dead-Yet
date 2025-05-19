// map.js

/**
 * Простая утилка для случайного целого между min и max включительно
 */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Проверяет, пересекаются ли два прямоугольника:
 * — первый задан x,y,w,h
 * — второй задан {minX,maxX,minY,maxY}
 */
function rectsOverlap(x, y, w, h, r) {
  return !(
    r.minX > x + w - 1 ||
    r.maxX < x ||
    r.minY > y + h - 1 ||
    r.maxY < y
  );
}

/**
 * Вырезает N комнат (4×4…8×8) в сетке tiles и возвращает их описания
 */
function carveRooms(tiles, N = 6) {
  const H = tiles.length, W = tiles[0].length;
  const rooms = [];
  for (let i = 0; i < N; i++) {
    const w = randInt(4, 8), h = randInt(4, 8);
    const x = randInt(1, W - w - 2), y = randInt(1, H - h - 2);

    // буфер в 1 тайл вокруг
    if (rooms.some(r => rectsOverlap(x - 1, y - 1, w + 2, h + 2, r))) {
      i--; continue;
    }
    // вырезаем комнату
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        tiles[yy][xx] = 'room';
      }
    }
    rooms.push({ minX: x, minY: y, maxX: x + w - 1, maxY: y + h - 1,
                 cx: x + Math.floor(w/2), cy: y + Math.floor(h/2) });
  }
  return rooms;
}

/**
 * Соединяет комнаты L-образными коридорами, красит в 'hall'
 */
function carveCorridors(tiles, rooms) {
  // сортируем по X, чтобы цепочка была менее хаотична
  rooms.sort((a,b)=>a.cx - b.cx);
  for (let i = 1; i < rooms.length; i++) {
    const A = rooms[i-1], B = rooms[i];
    let x = A.cx, y = A.cy;

    // сначала по горизонтали
    while (x !== B.cx) {
      tiles[y][x] = 'hall';
      x += Math.sign(B.cx - x);
    }
    // потом по вертикали
    while (y !== B.cy) {
      tiles[y][x] = 'hall';
      y += Math.sign(B.cy - y);
    }
  }
}

/**
 * GameMap — чанковая карта, каждый чанк генерится при обращении
 */
class GameMap {
  constructor(chunkSize = 32) {
    this.chunkSize  = chunkSize;
    this.chunks     = new Map();
    this.generating = new Set();
  }

  ensureChunk(cx, cy) {
    const key = `${cx},${cy}`;
    if (this.chunks.has(key) || this.generating.has(key)) return;
    this.generating.add(key);

    // создаём пустую матрицу 'wall'
    const S = this.chunkSize;
    const tiles = Array.from({length:S},()=>Array(S).fill('wall'));

    // 1) вырезаем комнаты
    const rooms = carveRooms(tiles, 5 + Math.floor(Math.random()*4));
    // 2) соединяем коридорами
    carveCorridors(tiles, rooms);

    // 3) сохраняем мета-слой для memoryAlpha
    const meta = Array.from({length:S},()=>Array.from({length:S},()=>{
      return { memoryAlpha: 0, visited: false };
    }));

    this.chunks.set(key, { tiles, meta });
    this.generating.delete(key);
  }

  isFloor(gx, gy) {
    const cx = Math.floor(gx/this.chunkSize),
          cy = Math.floor(gy/this.chunkSize),
          key = `${cx},${cy}`,
          chunk = this.chunks.get(key);
    if (!chunk) return false;
    const lx = gx - cx*this.chunkSize,
          ly = gy - cy*this.chunkSize;
    if (lx<0||ly<0||lx>=this.chunkSize||ly>=this.chunkSize) return false;
    const t = chunk.tiles[ly][lx];
    return (t==='room' || t==='hall');
  }

  regenerateChunksPreserveFOV(keys, computeFOV, player) {
    // оставляем вашу логику пакета перегенерации без изменений
    const vis = computeFOV(player.x, player.y, player.angle);
    for (let key of keys) {
      const [cx,cy] = key.split(',').map(Number),
            oldC    = this.chunks.get(key);
      if (!oldC) continue;
      const stash = [], baseX = cx*this.chunkSize, baseY = cy*this.chunkSize;
      for (let y=0;y<this.chunkSize;y++){
        for (let x=0;x<this.chunkSize;x++){
          const gx = baseX+x, gy = baseY+y,
                coord = `${gx},${gy}`,
                m     = oldC.meta[y][x];
          if (vis.has(coord)||m.memoryAlpha>0) {
            stash.push({x,y,t:oldC.tiles[y][x],m:{...m}});
          }
        }
      }
      this.chunks.delete(key);
      this.ensureChunk(cx,cy);
      const fresh = this.chunks.get(key);
      for (let s of stash){
        fresh.tiles[s.y][s.x] = s.t;
        fresh.meta[s.y][s.x]  = s.m;
      }
    }
  }
}

// делаем глобально видимым
window.GameMap = GameMap;