// map.js

/**
 * GameMap — чанковая карта «советской квартиры»:
 *  • ≈5 комнат (5×5…8×8) на чанк (size по умолчанию 48),
 *  • коридоры ≥2 тайлов шириной, прямые сегменты ≤25 клеток,
 *  • L-образные ветви, MST-связность между комнатами,
 *  • двери (type='door') 1–2 клетки на стыках комнат и коридоров,
 *  • сохранены FOV, память тайлов и пакетная регенерация.
 */
class GameMap {
  constructor(chunkSize = 48) {
    this.chunkSize  = chunkSize;
    this.chunks     = new Map();    // Map<"cx,cy", {tiles, meta}>
    this.generating = new Set();    // блокировка повторной генерации
  }

  /** Убедиться, что чанк (cx,cy) есть; если нет — создать. */
  ensureChunk(cx, cy) {
    const key = `${cx},${cy}`;
    if (this.chunks.has(key) || this.generating.has(key)) return;
    this.generating.add(key);

    // 1) Генерим сетку тайлов
    const tiles = this._generateChunk(cx, cy);

    // 2) Метаданные для memoryAlpha/visited
    const meta = Array.from({ length: this.chunkSize }, () =>
      Array.from({ length: this.chunkSize }, () => ({
        memoryAlpha: 0,
        visited:     false
      }))
    );

    this.chunks.set(key, { tiles, meta });
    this.generating.delete(key);

    // 3) Подключаем границы к соседним чанкам
    this._connectWithNeighbors(cx, cy);
  }

  /**
   * true, если в глобальных координатах (x,y) — проходимо
   * (пол коридора/комнаты или дверь), иначе false.
   */
  isFloor(x, y) {
    const cx = Math.floor(x / this.chunkSize),
          cy = Math.floor(y / this.chunkSize);
    const key = `${cx},${cy}`;
    const chunk = this.chunks.get(key);
    if (!chunk) return false;
    const lx = x - cx * this.chunkSize,
          ly = y - cy * this.chunkSize;
    if (lx < 0 || ly < 0 || lx >= this.chunkSize || ly >= this.chunkSize)
      return false;
    const t = chunk.tiles[ly][lx].type;
    return (t === 'floor' || t === 'door');
  }

  /**
   * Регенерация чанков из набора keys,
   * сохраняет все тайлы в текущем FOV и с memoryAlpha>0.
   */
  regenerateChunksPreserveFOV(keys, computeFOV, player) {
    const vis = computeFOV(player.x, player.y, player.angle);

    for (let key of keys) {
      const [cx, cy] = key.split(',').map(Number);
      const oldCh = this.chunks.get(key);
      if (!oldCh) continue;

      // 1) Сохраняем stash
      const stash = [];
      const baseX = cx * this.chunkSize,
            baseY = cy * this.chunkSize;
      for (let ly = 0; ly < this.chunkSize; ly++) {
        for (let lx = 0; lx < this.chunkSize; lx++) {
          const gx = baseX + lx, gy = baseY + ly;
          const coord = `${gx},${gy}`;
          const m = oldCh.meta[ly][lx];
          if (vis.has(coord) || m.memoryAlpha > 0) {
            stash.push({
              lx, ly,
              tile: oldCh.tiles[ly][lx],
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

  // ————— ВНУТРЕННИЕ УТИЛИТЫ —————

  /** Стыкует границы чанка (cx,cy) с уже существующими соседними. */
  _connectWithNeighbors(cx, cy) {
    const S = this.chunkSize;
    const meKey = `${cx},${cy}`;
    const me    = this.chunks.get(meKey).tiles;

    const dirs = [
      {dx:-1,dy:0,  meX:0,    nbX:S-1,  meY0:0,    meY1:S-1},
      {dx: 1,dy:0,  meX:S-1, nbX:0,     meY0:0,    meY1:S-1},
      {dx:0, dy:-1, meY:0,    nbY:S-1,  meX0:0,    meX1:S-1},
      {dx:0, dy: 1, meY:S-1, nbY:0,     meX0:0,    meX1:S-1},
    ];

    for (let d of dirs) {
      const nkey = `${cx + d.dx},${cy + d.dy}`;
      if (!this.chunks.has(nkey)) continue;
      const nb = this.chunks.get(nkey).tiles;

      if (d.dx !== 0) {
        for (let y = d.meY0; y <= d.meY1; y++) {
          if (me[y][d.meX].type !== 'wall' && nb[y][d.nbX].type === 'wall') {
            nb[y][d.nbX].type = 'floor';
          }
          if (nb[y][d.nbX].type !== 'wall' && me[y][d.meX].type === 'wall') {
            me[y][d.meX].type = 'floor';
          }
        }
      } else {
        for (let x = d.meX0; x <= d.meX1; x++) {
          if (me[d.meY][x].type !== 'wall' && nb[d.nbY][x].type === 'wall') {
            nb[d.nbY][x].type = 'floor';
          }
          if (nb[d.nbY][x].type !== 'wall' && me[d.meY][x].type === 'wall') {
            me[d.meY][x].type = 'floor';
          }
        }
      }
    }
  }

  /**
   * Генерация одного чанка:
   * 1. Расстановка 3–7 комнат (5×5…8×8), без пересечений.
   * 2. Построение MST по центрам комнат.
   * 3. Прокладка коридоров (прямые ≤25, L-образные), width=2.
   * 4. Создание дверей (type='door') на стыках.
   * 5. Обеспечение выхода к границам чанка.
   */
  _generateChunk(cx, cy) {
    const S = this.chunkSize;
    // tiles[y][x] = { type:'wall'|'floor'|'door' }
    const tiles = Array.from({ length: S }, () =>
      Array.from({ length: S }, () => ({ type: 'wall' }))
    );

    // детерминированный RNG Mulberry32
    const rng = this._mulberry32((cx*0x9E3779B1) ^ (cy<<16));

    // 1) Разбросать комнаты
    const rooms = [];
    // треугольное распределение: 3..7
    let cnt = Math.floor(rng()*4) + Math.floor(rng()*4) + 3;
    cnt = Math.min(7, Math.max(3, cnt));
    for (let i = 0; i < cnt; i++) {
      let ok = false, tries = 0;
      while (!ok && tries++ < 100) {
        // size 5..8, треугольно (среднее ≈6.5)
        const pick = () => {
          const t = rng() + rng();
          return 5 + Math.floor(t * (8 - 5));
        };
        let w = pick(), h = pick();
        if (Math.abs(w - h) > 5) h = w;  // баланс форм

        const x0 = 2 + Math.floor(rng() * (S - w - 4));
        const y0 = 2 + Math.floor(rng() * (S - h - 4));

        // проверка пересечений с буфером 1 клетки
        ok = true;
        for (let [rx, ry, rw, rh] of rooms) {
          if (!(x0 > rx + rw + 1 || x0 + w + 1 < rx ||
                y0 > ry + rh + 1 || y0 + h + 1 < ry)) {
            ok = false; break;
          }
        }
        if (!ok) continue;

        // вырезаем пол комнаты
        for (let yy = y0; yy < y0 + h; yy++) {
          for (let xx = x0; xx < x0 + w; xx++) {
            tiles[yy][xx].type = 'floor';
          }
        }
        rooms.push([x0, y0, w, h]);
      }
    }

    // 2) Построить MST по центрам комнат
    const centers = rooms.map(([x,y,w,h]) =>
      ({ x: x + w/2, y: y + h/2 })
    );
    const N = centers.length;
    const used = new Set([0]);
    const edges = [];
    // матрица квадратов расстояний
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
      let best = { i:-1, j:-1, d:1e18 };
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

    // 3) Прокладка коридоров по MST
    for (let [i, j] of edges) {
      const [x1,y1,w1,h1] = rooms[i];
      const [x2,y2,w2,h2] = rooms[j];
      const r1 = { x0:x1, y0:y1, x1:x1+w1-1, y1:y1+h1-1 };
      const r2 = { x0:x2, y0:y2, x1:x2+w2-1, y1:y2+h2-1 };

      // проверка перекрытия по X
      if (!(r1.x1 < r2.x0 || r2.x1 < r1.x0)) {
        const cx = Math.floor(Math.max(r1.x0, r2.x0) +
                              Math.min(r1.x1, r2.x1) >> 1);
        const sy = (r1.y1 < r2.y0 ? r1.y1+1 : r2.y1+1);
        const ey = (r1.y1 < r2.y0 ? r2.y0-1 : r1.y0-1);
        this._carveCorridor(tiles, cx, sy, cx, ey, rng);
      }
      // перекрытие по Y
      else if (!(r1.y1 < r2.y0 || r2.y1 < r1.y0)) {
        const cy = Math.floor(Math.max(r1.y0, r2.y0) +
                              Math.min(r1.y1, r2.y1) >> 1);
        const sx = (r1.x1 < r2.x0 ? r1.x1+1 : r2.x1+1);
        const ex = (r1.x1 < r2.x0 ? r2.x0-1 : r1.x0-1);
        this._carveCorridor(tiles, sx, cy, ex, cy, rng);
      }
      // иначе L-образный
      else {
        const pX = Math.floor(centers[i].x),
              pY = Math.floor(centers[j].y);
        this._carveCorridor(tiles,
          Math.floor(centers[i].x), Math.floor(centers[i].y),
          pX, pY, rng
        );
        this._carveCorridor(tiles,
          pX, pY,
          Math.floor(centers[j].x), Math.floor(centers[j].y),
          rng
        );
      }
    }

    // 4) Обязательно сделать выход хотя бы к одной границе чанка
    //    (чтобы соединяться с соседями). Берём первую комнату:
    if (rooms.length) {
      const [x0,y0,w0,h0] = rooms[0];
      const cx = x0 + Math.floor(w0/2),
            cy = y0 + Math.floor(h0/2);
      // выберем сторону: 0=N,1=E,2=S,3=W
      const side = Math.floor(rng()*4);
      let tx, ty;
      switch (side) {
        case 0: tx = cx;       ty = 0;            break; // north
        case 1: tx = S-1;      ty = cy;          break; // east
        case 2: tx = cx;       ty = S-1;         break; // south
        case 3: tx = 0;        ty = cy;          break; // west
      }
      this._carveCorridor(tiles, cx, cy, tx, ty, rng);
    }

    return tiles;
  }

  /**
   * Вырезает коридор (прямой или L-образный фрагмент),
   * ширина=2, max segment length=25, и ставит двери на концах.
   */
  _carveCorridor(tiles, x1, y1, x2, y2, rng) {
    const dx = Math.sign(x2 - x1),
          dy = Math.sign(y2 - y1);
    const len = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) + 1;
    // если >25, разбиваем
    if (len > 25) {
      const mid = 25;
      const xm = x1 + dx * (mid - 1),
            ym = y1 + dy * (mid - 1);
      this._carveCorridor(tiles, x1, y1, xm, ym, rng);
      this._carveCorridor(tiles, xm, ym, x2, y2, rng);
      return;
    }
    // вырезаем «ползунок» шириной 2
    for (let i = 0; i < len; i++) {
      const cx = x1 + dx * i,
            cy = y1 + dy * i;
      if (dx !== 0) {
        // горизонтальный: высота 2
        for (let off of [0,1]) {
          if (tiles[cy+off] && tiles[cy+off][cx])
            tiles[cy+off][cx].type = 'floor';
        }
      } else {
        // вертикальный: ширина 2
        for (let off of [0,1]) {
          if (tiles[cy] && tiles[cy][cx+off])
            tiles[cy][cx+off].type = 'floor';
        }
      }
    }
    // двери
    const dsize = (rng() < 0.5 ? 1 : 2);
    for (let k = 0; k < dsize; k++) {
      const sx = x1 + (dx===0 ? k : 0),
            sy = y1 + (dy===0 ? k : 0);
      if (tiles[sy] && tiles[sy][sx]) tiles[sy][sx].type = 'door';
      const ex = x2 + (dx===0 ? k : 0),
            ey = y2 + (dy===0 ? k : 0);
      if (tiles[ey] && tiles[ey][ex]) tiles[ey][ex].type = 'door';
    }
  }

  /**
   * Mulberry32 PRNG → [0,1)
   */
  _mulberry32(seed) {
    let t = seed >>> 0;
    return function() {
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
}

window.GameMap = GameMap;