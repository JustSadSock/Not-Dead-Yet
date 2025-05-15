// map.js

/**
 * GameMap — чанковая карта «советской квартиры»:
 * — ≈5 комнат (5×5…8×8) на чанк с разбросом треугольным (среднее 6×6),
 * — коридоры ≥2 тайлов шириной, прямые сегменты ≤25, L-образные и перекрёстки,
 * — двери (door) 1–2 тайла на стыках комната↔коридор,
 * — сохранены все механики FOV, памяти, регенерации.
 */
class GameMap {
  /**
   * @param {number} chunkSize — размер чанка в тайлах (по умолчанию 48)
   */
  constructor(chunkSize = 48) {
    this.chunkSize  = chunkSize;
    this.chunks     = new Map();   // Map<"cx,cy", { tiles: Tile[][], meta: Meta[][] }>
    this.generating = new Set();   // ключи чанков, которые сейчас создаются
  }

  /**
   * Убедиться, что чанк (cx,cy) существует; если нет — создать.
   */
  ensureChunk(cx, cy) {
    const key = `${cx},${cy}`;
    if (this.chunks.has(key) || this.generating.has(key)) return;
    this.generating.add(key);

    // 1) Генерим тайлы (wall/floor/door)
    const tiles = this._generateChunk(cx, cy);
    // 2) Мета — для памяти и затухания
    const meta = Array.from({ length: this.chunkSize }, () =>
      Array.from({ length: this.chunkSize }, () => ({
        memoryAlpha: 0,
        visited:     false
      }))
    );

    this.chunks.set(key, { tiles, meta });
    this.generating.delete(key);

    // 3) Соединяем границы с соседями
    this._connectWithNeighbors(cx, cy);
  }

  /**
   * true, если в глобальных тайлах (x,y) — пол или дверь,
   * false — если стена или за пределами.
   */
  isFloor(x, y) {
    const cx = Math.floor(x / this.chunkSize),
          cy = Math.floor(y / this.chunkSize);
    const key = `${cx},${cy}`;
    const chunk = this.chunks.get(key);
    if (!chunk) return false;
    const lx = x - cx * this.chunkSize,
          ly = y - cy * this.chunkSize;
    if (lx < 0 || ly < 0 || lx >= this.chunkSize || ly >= this.chunkSize) return false;
    const t = chunk.tiles[ly][lx].type;
    return (t === 'floor' || t === 'door');
  }

  /**
   * Перегенерирует чанки из keys, сохраняя FOV-тайлы и тайлы с memoryAlpha>0.
   */
  regenerateChunksPreserveFOV(keys, computeFOV, player) {
    const vis = computeFOV(player.x, player.y, player.angle);

    for (let key of keys) {
      const [cx, cy] = key.split(',').map(Number);
      const oldChunk = this.chunks.get(key);
      if (!oldChunk) continue;

      // 1) Собираем stash
      const stash = [];
      const baseX = cx * this.chunkSize,
            baseY = cy * this.chunkSize;
      for (let gy = baseY; gy < baseY + this.chunkSize; gy++) {
        for (let gx = baseX; gx < baseX + this.chunkSize; gx++) {
          const lx = gx - baseX, ly = gy - baseY;
          const m = oldChunk.meta[ly][lx];
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

      // 2) Удаляем старый чанк и создаём заново
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
   * Подключаем границы чанка (cx,cy) к уже существующим соседям.
   */
  _connectWithNeighbors(cx, cy) {
    const S = this.chunkSize;
    const key = `${cx},${cy}`;
    const me  = this.chunks.get(key).tiles;

    const dirs = [
      {dx:-1, dy:0, meX:0,    nbX:S-1, meY0:0,    meY1:S-1},
      {dx: 1, dy:0, meX:S-1, nbX:0,    meY0:0,    meY1:S-1},
      {dx: 0, dy:-1,meY:0,    nbY:S-1, meX0:0,    meX1:S-1},
      {dx: 0, dy: 1,meY:S-1, nbY:0,    meX0:0,    meX1:S-1}
    ];

    for (let d of dirs) {
      const nkey = `${cx + d.dx},${cy + d.dy}`;
      if (!this.chunks.has(nkey)) continue;
      const nb = this.chunks.get(nkey).tiles;

      if (d.dx !== 0) {
        for (let y = d.meY0; y <= d.meY1; y++) {
          if ((me[y][d.meX].type !== 'wall') && nb[y][d.nbX].type === 'wall') {
            nb[y][d.nbX].type = 'floor';
          }
          if ((nb[y][d.nbX].type !== 'wall') && me[y][d.meX].type === 'wall') {
            me[y][d.meX].type = 'floor';
          }
        }
      } else {
        for (let x = d.meX0; x <= d.meX1; x++) {
          if ((me[d.meY][x].type !== 'wall') && nb[d.nbY][x].type === 'wall') {
            nb[d.nbY][x].type = 'floor';
          }
          if ((nb[d.nbY][x].type !== 'wall') && me[d.meY][x].type === 'wall') {
            me[d.meY][x].type = 'floor';
          }
        }
      }
    }
  }

  /**
   * Основной генератор одного чанка:
   * — расстановка ≈5 комнат (5×5…8×8),
   * — построение MST по центрам комнат,
   * — прокладка коридоров (прямые ≤25 и L-образные), двери 1–2 клетки.
   */
  _generateChunk(cx, cy) {
    const S = this.chunkSize;
    // Tile: { type: 'wall' | 'floor' | 'door' }
    const grid = Array.from({ length: S }, () =>
      Array.from({ length: S }, () => ({ type: 'wall' }))
    );

    // 1) Разбросать комнаты
    const rooms = [];
    // треугольное распределение для количества комнат (≈5)
    let n = Math.round((Math.random()+Math.random())*2.5 + 2.5);
    n = Math.max(3, Math.min(7, n));
    for (let i = 0; i < n; i++) {
      let placed = false, tries = 0;
      while (!placed && tries++ < 100) {
        // размер 5..8, треугольно (6.5 среднее)
        const randSize = () => {
          const t = (Math.random()+Math.random())/2;
          return 5 + Math.floor(t * (8-5));
        };
        let w = randSize(), h = randSize();
        if (Math.abs(w - h) > 5) h = w;  // баланс пропорций

        // позиция с отступом 2 от краёв
        const x = 2 + Math.floor(Math.random() * (S - w - 4));
        const y = 2 + Math.floor(Math.random() * (S - h - 4));

        // проверка пересечений (+1 буфер)
        let ok = true;
        for (let [rx,ry,rw,rh] of rooms) {
          if (!(x > rx+rw+1 || x+w+1 < rx || y > ry+rh+1 || y+h+1 < ry)) {
            ok = false; break;
          }
        }
        if (!ok) continue;

        // вырезаем пол комнаты
        for (let yy = y; yy < y + h; yy++) {
          for (let xx = x; xx < x + w; xx++) {
            grid[yy][xx].type = 'floor';
          }
        }
        rooms.push([x,y,w,h]);
        placed = true;
      }
    }

    // 2) MST (Прима) по центрам комнат
    const centers = rooms.map(([x,y,w,h]) => ({ x: x + w/2, y: y + h/2 }));
    const N = centers.length;
    const used = new Set([0]);
    const edges = [];
    // матрица расстояний
    const dist2 = Array.from({ length: N }, () => Array(N).fill(0));
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        if (i === j) continue;
        const dx = centers[i].x - centers[j].x;
        const dy = centers[i].y - centers[j].y;
        dist2[i][j] = dx*dx + dy*dy;
      }
    }
    while (used.size < N) {
      let best = { i:-1, j:-1, d: Infinity };
      for (let i of used) {
        for (let j = 0; j < N; j++) {
          if (used.has(j)) continue;
          if (dist2[i][j] < best.d) {
            best = { i, j, d: dist2[i][j] };
          }
        }
      }
      edges.push([best.i, best.j]);
      used.add(best.j);
    }

    // 3) Прокладка коридоров + дверей
    for (let [i, j] of edges) {
      const [x1,y1,w1,h1] = rooms[i];
      const [x2,y2,w2,h2] = rooms[j];
      const rx1 = x1,   ry1 = y1,   rx1b = x1+w1-1, ry1b = y1+h1-1;
      const rx2 = x2,   ry2 = y2,   rx2b = x2+w2-1, ry2b = y2+h2-1;

      // пересечение по X?
      if (!(rx1b < rx2 || rx2b < rx1)) {
        // вертикальный коридор по общему X
        const cx = Math.floor(
          Math.max(rx1, rx2) + Math.min(rx1b, rx2b) >> 1
        );
        // y-координаты концов
        const sy = ry1b < ry2 ? ry1b + 1 : ry2b + 1;
        const ey = ry1b < ry2 ? ry2 - 1  : ry1 - 1;
        this._carveStraightCorridor(grid, cx, sy, cx, ey);
      }
      // пересечение по Y?
      else if (!(ry1b < ry2 || ry2b < ry1)) {
        // горизонтальный коридор по общему Y
        const cy = Math.floor(
          Math.max(ry1, ry2) + Math.min(ry1b, ry2b) >> 1
        );
        const sx = rx1b < rx2 ? rx1b + 1 : rx2b + 1;
        const ex = rx1b < rx2 ? rx2 - 1  : rx1 - 1;
        this._carveStraightCorridor(grid, sx, cy, ex, cy);
      }
      // иначе L-образный
      else {
        // точка поворота — центр первой комнаты
        const px = Math.floor(centers[i].x);
        const py = Math.floor(centers[j].y);
        this._carveStraightCorridor(grid,
          Math.floor(centers[i].x), Math.floor(centers[i].y),
          px, py
        );
        this._carveStraightCorridor(grid,
          px, py,
          Math.floor(centers[j].x), Math.floor(centers[j].y)
        );
      }
    }

    return grid;
  }

  /**
   * Режет прямой коридор width=2 между (x1,y1) и (x2,y2),
   * ставит пол и двери в концах.
   */
  _carveStraightCorridor(grid, x1, y1, x2, y2) {
    const dx = Math.sign(x2 - x1),
          dy = Math.sign(y2 - y1);
    let length = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) + 1;
    // если длина >25, разбиваем пополам через L-сегмент
    if (length > 25) {
      const midLen = Math.floor(length / 2);
      const xm = x1 + dx * midLen,
            ym = y1 + dy * midLen;
      this._carveStraightCorridor(grid, x1, y1, xm, ym);
      this._carveStraightCorridor(grid, xm, ym, x2, y2);
      return;
    }
    // вырезаем коридор шириной 2
    for (let i = 0; i < length; i++) {
      const cx = x1 + dx * i,
            cy = y1 + dy * i;
      // определяем «ширину» коридора
      if (dx !== 0) {
        // горизонтальный: 2 клетки в высоту
        for (let off of [0, 1]) {
          if (grid[cy+off] && grid[cy+off][cx]) {
            grid[cy+off][cx].type = 'floor';
          }
        }
      } else {
        // вертикальный: 2 клетки в ширину
        for (let off of [0, 1]) {
          if (grid[cy] && grid[cy][cx+off]) {
            grid[cy][cx+off].type = 'floor';
          }
        }
      }
    }
    // ставим двери на концах (ширина 1 или 2)
    const doorSize = (Math.random()<0.5 ? 1 : 2);
    for (let k = 0; k < doorSize; k++) {
      const ex = x2 + (dx===0 ? k : 0),
            ey = y2 + (dy===0 ? k : 0);
      if (grid[ey] && grid[ey][ex]) grid[ey][ex].type = 'door';

      const sx = x1 + (dx===0 ? k : 0),
            sy = y1 + (dy===0 ? k : 0);
      if (grid[sy] && grid[sy][sx]) grid[sy][sx].type = 'door';
    }
  }
}

// экспорт
window.GameMap = GameMap;