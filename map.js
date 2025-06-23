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
   * коридорами шириной 2 тайла. Типы клеток:
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
        for (let yy=y-1; yy<y+h+1 && !overlap; yy++) {
          for (let xx=x-1; xx<x+w+1; xx++) {
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

    function carveDoor(room) {
      const sides = ['N','S','W','E'];
      while (sides.length) {
        const side = sides.splice(Math.floor(Math.random()*sides.length),1)[0];
        if (side==='N' && room.y>1) {
          const x = rand(room.x+1, room.x+room.w-2);
          grid[room.y][x] = DOOR;
          return {x, y: room.y-1};
        }
        if (side==='S' && room.y+room.h < S-1) {
          const x = rand(room.x+1, room.x+room.w-2);
          grid[room.y+room.h-1][x] = DOOR;
          return {x, y: room.y+room.h};
        }
        if (side==='W' && room.x>1) {
          const y = rand(room.y+1, room.y+room.h-2);
          grid[y][room.x] = DOOR;
          return {x: room.x-1, y};
        }
        if (side==='E' && room.x+room.w < S-1) {
          const y = rand(room.y+1, room.y+room.h-2);
          grid[y][room.x+room.w-1] = DOOR;
          return {x: room.x+room.w, y};
        }
      }
      // если все стороны заняты — центр
      return {x: Math.floor(room.x+room.w/2), y: Math.floor(room.y+room.h/2)};
    }

    function digHoriz(y,x1,x2) {
      const step = Math.sign(x2 - x1);
      for (let x=x1; x!==x2+step; x+=step) {
        grid[y][x] = CORR;
        if (y+1<S) grid[y+1][x] = CORR;
      }
    }

    function digVert(x,y1,y2) {
      const step = Math.sign(y2 - y1);
      for (let y=y1; y!==y2+step; y+=step) {
        grid[y][x] = CORR;
        if (x+1<S) grid[y][x+1] = CORR;
      }
    }

    function digCorridor(a,b) {
      if (Math.random()<0.5) {
        digHoriz(a.y, a.x, b.x);
        digVert(b.x, a.y, b.y);
      } else {
        digVert(a.x, a.y, b.y);
        digHoriz(b.y, a.x, b.x);
      }
    }

    for (let i=1; i<rooms.length; i++) {
      const doorA = carveDoor(rooms[i-1]);
      const doorB = carveDoor(rooms[i]);
      digCorridor(doorA, doorB);
    }

    return grid;
  }
}

// делаем доступным в глобальной области, чтобы game.js увидел
window.GameMap = GameMap;