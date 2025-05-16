// map.js
// --------------------------------------------------
// ES-модуль: экспортируем GameMap
// --------------------------------------------------

/**
 * carveRoomsAndHalls, placeAndValidateDoors и все вспомогательные
 * вынесены прямо сюда, чтобы не было import/export внутри IIFE.
 */
function rectanglesOverlap(x, y, w, h, r) {
  return !(r.minX > x + w || r.maxX < x || r.minY > y + h || r.maxY < y);
}
function weightedRandom(min, max) {
  const r = Math.random(), w = Math.random();
  const v = min + (max - min) * ((r + w) / 2);
  return Math.min(max, Math.max(min, Math.floor(v)));
}
function carveCorridor(tiles, a, b) {
  let x = Math.floor((a.minX + a.maxX) / 2);
  let y = Math.floor((a.minY + a.maxY) / 2);
  const tx = Math.floor((b.minX + b.maxX) / 2);
  const ty = Math.floor((b.minY + b.maxY) / 2);

  // по X
  while (x !== tx) {
    tiles[y][x] = 'hall';
    tiles[y + 1]?.[x] = 'hall';
    x += Math.sign(tx - x);
  }
  // по Y
  while (y !== ty) {
    tiles[y][x] = 'hall';
    tiles[y]?.[x + 1] = 'hall';
    y += Math.sign(ty - y);
  }
}

function carveRoomsAndHalls(S) {
  // 1) инициализируем всё как стена
  const tiles = Array.from({ length: S }, () => Array(S).fill('wall'));

  // 2) параметры комнат
  const ROOM_MIN = 4;
  const ROOM_MAX = 8;
  const ROOM_COUNT = 3 + Math.floor(Math.random() * 6); // от 3 до 8
  const rooms = [];

  for (let i = 0; i < ROOM_COUNT; i++) {
    const w = weightedRandom(ROOM_MIN, ROOM_MAX);
    const h = weightedRandom(ROOM_MIN, ROOM_MAX);
    const x = 1 + Math.floor(Math.random() * (S - w - 2));
    const y = 1 + Math.floor(Math.random() * (S - h - 2));

    // проверяем запас в 1 клетку вокруг
    if (rooms.some(r => rectanglesOverlap(x - 1, y - 1, w + 2, h + 2, r))) {
      i--;
      continue;
    }
    rooms.push({ minX: x, minY: y, maxX: x + w - 1, maxY: y + h - 1 });

    // вырезаем пол комнаты
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        tiles[yy][xx] = 'room';
      }
    }
  }

  // 3) соединяем последовательные комнаты коридорами
  for (let i = 1; i < rooms.length; i++) {
    carveCorridor(tiles, rooms[i - 1], rooms[i]);
  }

  return { tiles, rooms };
}

function placeAndValidateDoors(tiles, rooms, S) {
  const doors = [];

  for (let room of rooms) {
    // собираем список клеток по периметру, где сосед есть hall
    const candidates = [];
    // верх/низ
    for (let x = room.minX; x <= room.maxX; x++) {
      if (tiles[room.minY - 1]?.[x] === 'hall') candidates.push([x, room.minY]);
      if (tiles[room.maxY + 1]?.[x] === 'hall') candidates.push([x, room.maxY]);
    }
    // левый/правый
    for (let y = room.minY; y <= room.maxY; y++) {
      if (tiles[y][room.minX - 1] === 'hall') candidates.push([room.minX, y]);
      if (tiles[y][room.maxX + 1] === 'hall') candidates.push([room.maxX, y]);
    }

    // валидируем: не более 2 дверей подряд
    const used = [];
    for (let [x, y] of candidates) {
      if (used.length >= 2) break;
      // соседей дверей по периметру у нас пока нет ⇒ просто берём первые два
      if (tiles[y][x] === 'room') {
        tiles[y][x] = 'door';
        used.push([x, y]);
      }
    }
    for (let d of used) doors.push({ x: d[0], y: d[1], room });
  }

  console.log('placeAndValidateDoors → doors:', doors);
  return doors;
}


export class GameMap {
  constructor() {
    this.chunkSize = 32;
    this.chunks = new Map();
    this.generating = new Set();
  }

  ensureChunk(cx, cy) {
    const key = `${cx},${cy}`;
    if (this.chunks.has(key) || this.generating.has(key)) return;
    this.generating.add(key);

    const { tiles, rooms } = carveRoomsAndHalls(this.chunkSize);
    placeAndValidateDoors(tiles, rooms, this.chunkSize);

    const meta = Array.from({ length: this.chunkSize }, () =>
      Array.from({ length: this.chunkSize }, () => ({
        memoryAlpha: 0,
        visited: false
      }))
    );

    this.chunks.set(key, { tiles, meta });
    this.generating.delete(key);
  }

  isFloor(gx, gy) {
    const cx = Math.floor(gx / this.chunkSize);
    const cy = Math.floor(gy / this.chunkSize);
    const key = `${cx},${cy}`;
    const chunk = this.chunks.get(key);
    if (!chunk) return false;
    const lx = gx - cx * this.chunkSize;
    const ly = gy - cy * this.chunkSize;
    if (lx < 0 || ly < 0 || lx >= this.chunkSize || ly >= this.chunkSize)
      return false;
    // пол = room || hall || door
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
      const baseX = cx * this.chunkSize;
      const baseY = cy * this.chunkSize;

      for (let y = 0; y < this.chunkSize; y++) {
        for (let x = 0; x < this.chunkSize; x++) {
          const gx = baseX + x, gy = baseY + y;
          const coord = `${gx},${gy}`;
          const m = oldC.meta[y][x];
          if (vis.has(coord) || m.memoryAlpha > 0) {
            stash.push({ x, y, tile: oldC.tiles[y][x], meta: { ...m } });
          }
        }
      }

      this.chunks.delete(key);
      this.ensureChunk(cx, cy);

      const fresh = this.chunks.get(key);
      for (let s of stash) {
        fresh.tiles[s.y][s.x] = s.tile;
        fresh.meta[s.y][s.x] = s.meta;
      }
    }
  }
}