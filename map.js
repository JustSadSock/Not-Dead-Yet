// map.js

/**
 * GameMap — чанковая карта «советской квартиры» с комнатами, коридорами и регенерацией забытых тайлов.
 */
class GameMap {
  constructor() {
    this.chunkSize   = 32;           // размер чанка в тайлах
    this.chunks      = new Map();    // Map<"cx,cy", { tiles: bool[][], meta: {memoryAlpha,visited}[][] }>
    this.generating  = new Set();    // для блокировки параллельной генерации одного чанка
  }

  /** Убедиться, что чанк (cx,cy) существует; если нет — создать. */
  ensureChunk(cx, cy) {
    const key = `${cx},${cy}`;
    if (this.chunks.has(key) || this.generating.has(key)) return;
    this.generating.add(key);

    // 1) Сгенерировать булевую сетку комнат и коридоров
    const tiles = this._generateChunk(cx, cy);

    // 2) Инициализировать meta для памяти (memoryAlpha) и visited
    const meta = Array.from({ length: this.chunkSize }, () =>
      Array.from({ length: this.chunkSize }, () => ({
        memoryAlpha: 0,
        visited:     false
      }))
    );

    this.chunks.set(key, { tiles, meta });
    this.generating.delete(key);
  }

  /**
   * Проверить, проходима ли клетка (gx,gy) в глобальных координатах.
   * true = пол или дверь, false = стена или за границами.
   */
  isFloor(gx, gy) {
    const cx = Math.floor(gx / this.chunkSize),
          cy = Math.floor(gy / this.chunkSize);
    const key = `${cx},${cy}`;
    const chunk = this.chunks.get(key);
    if (!chunk) return false;
    const lx = gx - cx * this.chunkSize,
          ly = gy - cy * this.chunkSize;
    if (lx < 0 || ly < 0 || lx >= this.chunkSize || ly >= this.chunkSize) return false;
    return chunk.tiles[ly][lx];
  }

  /**
   * Пакетная регенерация чанков из keys:
   * сохраняем тайлы в поле зрения и с memoryAlpha>0,
   * пересоздаём чанк через ensureChunk, восстанавливаем stash.
   */
  regenerateChunksPreserveFOV(keys, computeFOV, player) {
    const vis = computeFOV(player.x, player.y, player.angle);

    for (let key of keys) {
      const [cx, cy] = key.split(',').map(Number);
      const oldChunk = this.chunks.get(key);
      if (!oldChunk) continue;

      // 1) Собираем stash—все тайлы, что в FOV или ещё не забыты
      const stash = [];
      const baseX = cx * this.chunkSize, baseY = cy * this.chunkSize;
      for (let ly = 0; ly < this.chunkSize; ly++) {
        for (let lx = 0; lx < this.chunkSize; lx++) {
          const gx = baseX + lx, gy = baseY + ly;
          const coord = `${gx},${gy}`;
          const m = oldChunk.meta[ly][lx];
          if (vis.has(coord) || m.memoryAlpha > 0) {
            stash.push({
              lx, ly,
              tile: oldChunk.tiles[ly][lx],
              meta: { memoryAlpha: m.memoryAlpha, visited: m.visited }
            });
          }
        }
      }

      // 2) Пересоздаём чанк
      this.chunks.delete(key);
      this.ensureChunk(cx, cy);

      // 3) Восстанавливаем stash
      const fresh = this.chunks.get(key);
      for (let s of stash) {
        fresh.tiles[s.ly][s.lx] = s.tile;
        fresh.meta [s.ly][s.lx] = s.meta;
      }
    }
  }


  // ————— ВНУТРЕННИЕ МЕТОДЫ —————

  /**
   * Генерация одного чанка (cx,cy):
   * 1. Расстановка 3–7 комнат (5×5…8×8), без пересечений.
   * 2. Построение MST между центрами комнат.
   * 3. Прорезка коридоров шириной 2 (прямые ≤25, разбивка при необходимости).
   * 4. Гарантированный выход коридором к одной границе чанка.
   * Возвращает булевую сетку: true=пол, false=стена.
   */
  _generateChunk(cx, cy) {
    const S = this.chunkSize;
    const grid = Array.from({ length: S }, () => Array(S).fill(false));

    // 1) Разбросать комнаты
    const rooms = [];
    // треугольное распределение числа комнат: от 3 до 7, в среднем ≈5
    let roomCount = Math.floor((Math.random()+Math.random())*2) + 3;
    roomCount = Math.max(3, Math.min(7, roomCount));
    for (let i = 0; i < roomCount; i++) {
      let placed = false, tries = 0;
      while (!placed && tries++ < 100) {
        // размеры 5..8, треугольно (среднее ≈6.5)
        const pickSize = () => {
          const t = (Math.random() + Math.random()) / 2;
          return 5 + Math.floor(t * (8 - 5 + 1));
        };
        let w = pickSize(), h = pickSize();
        // ограничить разницу сторон ≤4
        if (Math.abs(w - h) > 4) h = w;

        const x0 = 1 + Math.floor(Math.random() * (S - w - 2));
        const y0 = 1 + Math.floor(Math.random() * (S - h - 2));

        // проверка пересечений (+1 тайл буфера)
        let ok = true;
        for (let [rx, ry, rw, rh] of rooms) {
          if (!(x0 > rx + rw + 1 ||
                x0 + w + 1 < rx ||
                y0 > ry + rh + 1 ||
                y0 + h + 1 < ry)) {
            ok = false; break;
          }
        }
        if (!ok) continue;

        // вырезаем пол комнаты
        for (let yy = y0; yy < y0 + h; yy++) {
          for (let xx = x0; xx < x0 + w; xx++) {
            grid[yy][xx] = true;
          }
        }
        rooms.push([x0, y0, w, h]);
        placed = true;
      }
    }

    // 2) Построить MST между центрами комнат
    const centers = rooms.map(([x,y,w,h]) => ({ x: x + w/2, y: y + h/2 }));
    const N = centers.length;
    const used = new Set([0]);
    const edges = [];
    const dist2 = Array.from({ length: N }, () => Array(N).fill(0));
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        if (i !== j) {
          const dx = centers[i].x - centers[j].x;
          const dy = centers[i].y - centers[j].y;
          dist2[i][j] = dx*dx + dy*dy;
        }
      }
    }
    while (used.size < N) {
      let best = { i:-1, j:-1, d: Infinity };
      for (let i of used) {
        for (let j = 0; j < N; j++) {
          if (!used.has(j) && dist2[i][j] < best.d) {
            best = { i, j, d: dist2[i][j] };
          }
        }
      }
      edges.push([best.i, best.j]);
      used.add(best.j);
    }

    // 3) Прокладка коридоров шириной 2
    for (let [i, j] of edges) {
      const c1 = centers[i], c2 = centers[j];
      this._carveCorridor(grid,
        Math.floor(c1.x), Math.floor(c1.y),
        Math.floor(c2.x), Math.floor(c2.y)
      );
    }

    // 4) Гарантированный выход к границе чанка от первой комнаты
    if (rooms.length) {
      const [x0,y0,w0,h0] = rooms[0];
      const sx = x0 + Math.floor(w0/2),
            sy = y0 + Math.floor(h0/2);
      const side = Math.floor(Math.random()*4);
      let tx = sx, ty = sy;
      if (side === 0) ty = 0;
      else if (side === 1) tx = S-1;
      else if (side === 2) ty = S-1;
      else tx = 0;
      this._carveCorridor(grid, sx, sy, tx, ty);
    }

    return grid;
  }

  /**
   * Прорезает коридор шириной 2 от (x1,y1) до (x2,y2).
   * Если длина >25, разбивает пополам.
   */
  _carveCorridor(grid, x1, y1, x2, y2) {
    const dx = Math.sign(x2 - x1),
          dy = Math.sign(y2 - y1);
    const length = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) + 1;

    if (length > 25) {
      const mid = Math.floor(length / 2);
      const xm = x1 + dx*(mid-1),
            ym = y1 + dy*(mid-1);
      this._carveCorridor(grid, x1, y1, xm, ym);
      this._carveCorridor(grid, xm, ym, x2, y2);
      return;
    }

    for (let i = 0; i < length; i++) {
      const cx = x1 + dx*i,
            cy = y1 + dy*i;
      if (dx !== 0) {
        // горизонтальный коридор — 2 тайла в высоту
        if (grid[cy]   !== undefined && grid[cy][cx]   !== undefined) grid[cy][cx]   = true;
        if (grid[cy+1] !== undefined && grid[cy+1][cx] !== undefined) grid[cy+1][cx] = true;
      } else {
        // вертикальный коридор — 2 тайла в ширину
        if (grid[cy] !== undefined && grid[cy][cx]   !== undefined) grid[cy][cx]   = true;
        if (grid[cy] !== undefined && grid[cy][cx+1] !== undefined) grid[cy][cx+1] = true;
      }
    }
  }
}

// экспорт в глобальную область
window.GameMap = GameMap;