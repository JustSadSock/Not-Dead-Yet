// map.js

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function rectsOverlap(x, y, w, h, r) {
  return !(
    r.minX > x + w - 1 ||
    r.maxX < x ||
    r.minY > y + h - 1 ||
    r.maxY < y
  );
}

// Вырезаем комнаты
function carveRooms(tiles, N = 6) {
  const H = tiles.length, W = tiles[0].length;
  const rooms = [];
  for (let i = 0; i < N; i++) {
    const w = randInt(4, 8), h = randInt(4, 8);
    const x = randInt(1, W - w - 2), y = randInt(1, H - h - 2);
    if (rooms.some(r => rectsOverlap(x - 1, y - 1, w + 2, h + 2, r))) { i--; continue; }
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++)
        tiles[yy][xx] = 'room';
    rooms.push({
      minX: x, minY: y,
      maxX: x + w - 1, maxY: y + h - 1,
      cx: x + Math.floor(w/2),
      cy: y + Math.floor(h/2)
    });
  }
  return rooms;
}

// Соединяем комнаты, не затрагивая их внутренности.
// Двери устанавливаются сразу при выходе из комнаты и перед входом в другую.
function carveCorridors(tiles, rooms) {
  rooms.sort((a,b) => a.cx - b.cx);
  for (let i = 1; i < rooms.length; i++) {
    const A = rooms[i-1], B = rooms[i];
    let x = A.cx, y = A.cy;
    let inRoom = true;

    // горизонтальный сегмент
    while (x !== B.cx) {
      x += Math.sign(B.cx - x);
      if (inRoom) {
        if (tiles[y][x] === 'room') continue;
        tiles[y][x] = 'door'; // выход из комнаты A
        inRoom = false;
      } else if (tiles[y][x] === 'room') {
        tiles[y][x] = 'door'; // вход в комнату B
        break;
      } else {
        tiles[y][x] = 'hall';
        if (y+1 < tiles.length) tiles[y+1][x] = 'hall';
      }
    }

    // вертикальный сегмент
    inRoom = true;
    while (y !== B.cy) {
      y += Math.sign(B.cy - y);
      if (inRoom) {
        if (tiles[y][x] === 'room') continue;
        tiles[y][x] = 'door';
        inRoom = false;
      } else if (tiles[y][x] === 'room') {
        tiles[y][x] = 'door';
        break;
      } else {
        tiles[y][x] = 'hall';
        if (x+1 < tiles[y].length) tiles[y][x+1] = 'hall';
      }
    }
  }
}

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

    const S = this.chunkSize;
    const tiles = Array.from({length: S}, () => Array(S).fill('wall'));

    const rooms = carveRooms(tiles, 5 + Math.floor(Math.random()*4));
    carveCorridors(tiles, rooms);

    const meta = Array.from({length: S}, () =>
      Array.from({length: S}, () => ({ memoryAlpha: 0, visited: false }))
    );

    this.chunks.set(key, { tiles, meta });
    this.generating.delete(key);
  }

  isFloor(gx, gy) {
    const cx = Math.floor(gx/this.chunkSize),
          cy = Math.floor(gy/this.chunkSize),
          chunk = this.chunks.get(`${cx},${cy}`);
    if (!chunk) return false;
    const lx = gx - cx*this.chunkSize,
          ly = gy - cy*this.chunkSize;
    if (lx<0||ly<0||lx>=this.chunkSize||ly>=this.chunkSize) return false;
    const t = chunk.tiles[ly][lx];
    return t === 'room' || t === 'hall' || t === 'door';
  }

  regenerateChunksPreserveFOV(keys, computeFOV, player) {
    const vis = computeFOV(player.x, player.y, player.angle);
    for (let key of keys) {
      const [cx, cy] = key.split(',').map(Number);
      console.log(`Re-gen chunk ${cx},${cy}`);
      const oldC = this.chunks.get(key);
      if (!oldC) continue;

      const stash = [], baseX = cx*this.chunkSize, baseY = cy*this.chunkSize;
      for (let y = 0; y < this.chunkSize; y++) {
        for (let x = 0; x < this.chunkSize; x++) {
          const coord = `${baseX+x},${baseY+y}`;
          const m = oldC.meta[y][x];
          if (vis.has(coord) || m.memoryAlpha > 0) {
            stash.push({ x, y, t: oldC.tiles[y][x], m:{...m} });
          }
        }
      }

      this.chunks.delete(key);
      this.ensureChunk(cx, cy);

      const fresh = this.chunks.get(key);
      for (let s of stash) {
        fresh.tiles[s.y][s.x] = s.t;
        fresh.meta [s.y][s.x] = s.m;
      }
    }
  }
}

window.GameMap = GameMap;