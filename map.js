// map.js

/**
 * Проверка, пересекаются ли два прямоугольника:
 * — первый задан x,y,w,h
 * — второй задан объектом {minX,maxX,minY,maxY}
 */
function rectanglesOverlap(x, y, w, h, r) {
  return !(
    r.minX > x + w - 1 ||
    r.maxX < x ||
    r.minY > y + h - 1 ||
    r.maxY < y
  );
}

/**
 * Случайное целое [min..max], но с пиковой вероятностью ближе к середине.
 */
function weightedRandom(min, max) {
  const r = Math.random(), s = Math.random();
  const v = min + (max - min) * ((r + s) / 2);
  return Math.floor(Math.max(min, Math.min(max, v)));
}

/**
 * Прорезает в tiles (S×S) 2-клеточный коридор между центрами rectA и rectB
 * rectA/B имеют {minX,maxX,minY,maxY}
 */
function carveCorridor(tiles, rectA, rectB) {
  let x = Math.floor((rectA.minX + rectA.maxX) / 2);
  let y = Math.floor((rectA.minY + rectA.maxY) / 2);
  const tx = Math.floor((rectB.minX + rectB.maxX) / 2);
  const ty = Math.floor((rectB.minY + rectB.maxY) / 2);

  // по X
  while (x !== tx) {
    tiles[y][x] = 'hall';
    if (y + 1 < tiles.length) tiles[y + 1][x] = 'hall';
    x += Math.sign(tx - x);
  }
  // по Y
  while (y !== ty) {
    tiles[y][x] = 'hall';
    if (x + 1 < tiles[y].length) tiles[y][x + 1] = 'hall';
    y += Math.sign(ty - y);
  }
}

/**
 * Создаёт S×S сетку: в ней вырезаются
 * — КОМНАТЫ прям-угол. формата от 4×4 до 8×8, не более 8 штук
 * — МЕЖДУ ними коридоры «labyrinth-style»
 */
function carveRoomsAndHalls(S) {
  const tiles = Array.from({ length: S }, () => Array(S).fill('wall'));
  const ROOM_MIN = 4, ROOM_MAX = 8;
  const roomCount = 3 + Math.floor(Math.random() * 6); // 3..8
  const rooms = [];

  for (let i = 0; i < roomCount; i++) {
    const w = weightedRandom(ROOM_MIN, ROOM_MAX);
    const h = weightedRandom(ROOM_MIN, ROOM_MAX);
    const x = 1 + Math.floor(Math.random() * (S - w - 2));
    const y = 1 + Math.floor(Math.random() * (S - h - 2));

    // проверка буфера вокруг
    if (rooms.some(r => rectanglesOverlap(x - 1, y - 1, w + 2, h + 2, r))) {
      i--;
      continue;
    }
    const room = { minX: x, minY: y, maxX: x + w - 1, maxY: y + h - 1 };
    rooms.push(room);

    // вырезаем комнату
    for (let yy = y; yy <= room.maxY; yy++) {
      for (let xx = x; xx <= room.maxX; xx++) {
        tiles[yy][xx] = 'room';
      }
    }
  }

  // свяжем их в цепочку лабиринтом
  for (let i = 1; i < rooms.length; i++) {
    carveCorridor(tiles, rooms[i - 1], rooms[i]);
  }

  return { tiles, rooms };
}

/**
 * Вставляет двери ('door') по стыку room↔hall, максимум 2 на одну сторону.
 */
function placeAndValidateDoors(tiles, rooms) {
  const doors = [];
  for (let room of rooms) {
    const candidates = [];

    // север/юг
    for (let x = room.minX; x <= room.maxX; x++) {
      if (tiles[room.minY - 1] && tiles[room.minY - 1][x] === 'hall')
        candidates.push([x, room.minY]);
      if (tiles[room.maxY + 1] && tiles[room.maxY + 1][x] === 'hall')
        candidates.push([x, room.maxY]);
    }
    // запад/восток
    for (let y = room.minY; y <= room.maxY; y++) {
      if (tiles[y][room.minX - 1] === 'hall')
        candidates.push([room.minX, y]);
      if (tiles[y][room.maxX + 1] === 'hall')
        candidates.push([room.maxX, y]);
    }

    const used = [];
    for (let [x, y] of candidates) {
      if (used.length >= 2) break;
      if (tiles[y][x] === 'room') {
        tiles[y][x] = 'door';
        used.push([x, y]);
      }
    }
    for (let [x, y] of used) {
      doors.push({ x, y, room });
    }
  }
  console.log('Doors placed:', doors);
  return doors;
}

/**
 * Класс чанковой карты
 */
export class GameMap {
  constructor() {
    this.chunkSize  = 32;
    this.chunks     = new Map();
    this.generating = new Set();
  }

  ensureChunk(cx, cy) {
    const key = `${cx},${cy}`;
    if (this.chunks.has(key) || this.generating.has(key)) return;
    this.generating.add(key);

    const { tiles, rooms } = carveRoomsAndHalls(this.chunkSize);
    placeAndValidateDoors(tiles, rooms);

    const meta = Array.from({ length: this.chunkSize }, () =>
      Array.from({ length: this.chunkSize }, () => ({
        memoryAlpha: 0,
        visited:     false
      }))
    );

    this.chunks.set(key, { tiles, meta });
    this.generating.delete(key);
  }

  isFloor(gx, gy) {
    const cx = Math.floor(gx / this.chunkSize);
    const cy = Math.floor(gy / this.chunkSize);
    const chunk = this.chunks.get(`${cx},${cy}`);
    if (!chunk) return false;
    const lx = gx - cx * this.chunkSize,
          ly = gy - cy * this.chunkSize;
    if (
      lx < 0 || ly < 0 ||
      lx >= this.chunkSize || ly >= this.chunkSize
    ) return false;
    const t = chunk.tiles[ly][lx];
    return t === 'room' || t === 'hall' || t === 'door';
  }

  regenerateChunksPreserveFOV(keys, computeFOV, player) {
    const vis = computeFOV(player.x, player.y, player.angle);
    for (let key of keys) {
      const [cx, cy] = key.split(',').map(Number);
      const oldC = this.chunks.get(key);
      if (!oldC) continue;

      const stash = [];
      const baseX = cx * this.chunkSize,
            baseY = cy * this.chunkSize;

      for (let y = 0; y < this.chunkSize; y++) {
        for (let x = 0; x < this.chunkSize; x++) {
          const gx = baseX + x, gy = baseY + y;
          const coord = `${gx},${gy}`;
          const m = oldC.meta[y][x];
          if (vis.has(coord) || m.memoryAlpha > 0) {
            stash.push({ x,y, tile: oldC.tiles[y][x], meta: { ...m } });
          }
        }
      }

      this.chunks.delete(key);
      this.ensureChunk(cx, cy);

      const fresh = this.chunks.get(key);
      for (let s of stash) {
        fresh.tiles[s.y][s.x] = s.tile;
        fresh.meta [s.y][s.x] = s.meta;
      }
    }
  }
}