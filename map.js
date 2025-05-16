// map.js
//
// Чанковая карта 32×32 с комнатами 4×4…8×8 и 2–3-клеточными коридорами.
// Тайлы: 'room', 'door', 'hall', 'wall'

class GameMap {
  constructor() {
    this.chunkSize  = 32;            // размер чанка
    this.chunks     = new Map();     // Map<"cx,cy", { tiles, meta }>
    this.generating = new Set();     // ключи чанков в процессе генерации
  }

  // ------------------ публичный API ------------------

  /** Убедиться, что чанк (cx,cy) сгенерирован */
  ensureChunk(cx, cy) {
    const key = `${cx},${cy}`;
    if (this.chunks.has(key) || this.generating.has(key)) return;
    this.generating.add(key);

    const tiles = this._generateChunk(cx, cy);
    const meta  = Array.from({ length: this.chunkSize }, () =>
      Array.from({ length: this.chunkSize }, () => ({
        memoryAlpha: 0,
        visited:     false
      }))
    );

    this.chunks.set(key, { tiles, meta });
    this.generating.delete(key);
  }

  /** true, если глобальный тайл (gx,gy) можно пройти */
  isFloor(gx, gy) {
    const cx = Math.floor(gx / this.chunkSize),
          cy = Math.floor(gy / this.chunkSize),
          chunk = this.chunks.get(`${cx},${cy}`);
    if (!chunk) return false;

    const lx = gx - cx * this.chunkSize,
          ly = gy - cy * this.chunkSize;
    if (lx < 0 || ly < 0 || lx >= this.chunkSize || ly >= this.chunkSize) return false;

    const t = chunk.tiles[ly][lx];
    return t === 'room' || t === 'hall' || t === 'door';
  }

  /**
   * Пакетная перегенерация чанков:
   * сохраняем все тайлы, видимые или непотухшие,
   * удаляем чанк, генерируем заново, восстанавливаем их.
   */
  regenerateChunksPreserveFOV(keys, computeFOV, player) {
    const vis = computeFOV(player.x, player.y, player.angle);

    for (const key of keys) {
      const [cx, cy] = key.split(',').map(Number);
      const oldC = this.chunks.get(key);
      if (!oldC) continue;

      // стэш «живых» тайлов
      const stash = [];
      const bx = cx * this.chunkSize, by = cy * this.chunkSize;
      for (let y = 0; y < this.chunkSize; y++) {
        for (let x = 0; x < this.chunkSize; x++) {
          const gx = bx + x, gy = by + y;
          const m  = oldC.meta[y][x];
          if (vis.has(`${gx},${gy}`) || m.memoryAlpha > 0) {
            stash.push({ x, y, tile: oldC.tiles[y][x], meta: { ...m } });
          }
        }
      }

      // реген
      this.chunks.delete(key);
      this.ensureChunk(cx, cy);
      const fresh = this.chunks.get(key);
      for (const s of stash) {
        fresh.tiles[s.y][s.x] = s.tile;
        fresh.meta [s.y][s.x] = s.meta;
      }
    }
  }

  // ------------------ внутренняя генерация ------------------

  _generateChunk(cx, cy) {
    const S = this.chunkSize;
    // 1) изначально всё — стены
    const tiles = Array.from({ length: S }, () => Array(S).fill('wall'));

    // 2) размещаем 3–8 случайных непересекающихся комнат 4×4…8×8
    const rooms = [];
    const count = 3 + Math.floor(Math.random() * 6);
    for (let i = 0; i < count && rooms.length < count; i++) {
      const w = 4 + Math.floor(Math.random() * 5), // [4..8]
            h = 4 + Math.floor(Math.random() * 5),
            x = 1 + Math.floor(Math.random() * (S - w - 2)),
            y = 1 + Math.floor(Math.random() * (S - h - 2));
      // проверка зазора 1 клетка вокруг
      let ok = true;
      for (const r of rooms) {
        if (!(x + w < r.x - 1 || r.x + r.w < x - 1 ||
              y + h < r.y - 1 || r.y + r.h < y - 1)) {
          ok = false; break;
        }
      }
      if (!ok) { i--; continue; }

      rooms.push({ x, y, w, h });
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
          tiles[yy][xx] = 'room';
        }
      }
    }

    // 3) строим минимальное остовное дерево по центрам комнат
    const centers = rooms.map(r => ({
      x: r.x + Math.floor(r.w/2),
      y: r.y + Math.floor(r.h/2)
    }));
    const connected = new Set([0]);
    const edges = [];
    while (connected.size < rooms.length) {
      let best = null;
      for (const i of connected) {
        for (let j = 0; j < rooms.length; j++) {
          if (connected.has(j)) continue;
          const dx = centers[i].x - centers[j].x,
                dy = centers[i].y - centers[j].y,
                d2 = dx*dx + dy*dy;
          if (!best || d2 < best.d2) best = { i, j, d2 };
        }
      }
      connected.add(best.j);
      edges.push([best.i, best.j]);
    }

    // 4) для каждого ребра: двери + коридор
    const carveHall = (x1, y1, x2, y2) => {
      const W = 2 + Math.floor(Math.random() * 2);  // ширина 2..3
      // горизонтальный сегмент
      const xa = Math.min(x1, x2), xb = Math.max(x1, x2);
      const yc = y1;
      const y0 = yc - Math.floor(W/2);
      for (let x = xa; x <= xb; x++) {
        for (let dy = 0; dy < W; dy++) {
          const yy = y0 + dy;
          if (yy >= 0 && yy < S && tiles[yy][x] === 'wall') {
            tiles[yy][x] = 'hall';
          }
        }
      }
      // вертикальный сегмент
      const ya = Math.min(y1, y2), yb = Math.max(y1, y2);
      const xc = x2;
      const x0 = xc - Math.floor(W/2);
      for (let y = ya; y <= yb; y++) {
        for (let dx = 0; dx < W; dx++) {
          const xx = x0 + dx;
          if (xx >= 0 && xx < S && tiles[y][xx] === 'wall') {
            tiles[y][xx] = 'hall';
          }
        }
      }
    };

    for (const [i, j] of edges) {
      const A = rooms[i], B = rooms[j];
      // выбираем сторону дверей для A и B
      const dx = centers[j].x - centers[i].x;
      const dy = centers[j].y - centers[i].y;
      let doorA, doorB;
      if (Math.abs(dx) > Math.abs(dy)) {
        // горизонтальное соединение
        if (dx > 0) { 
          // дверь справа у A
          const ya = A.y + Math.floor(Math.random() * A.h);
          doorA = [A.x + A.w - 1, ya];
          // дверь слева у B
          const yb = B.y + Math.floor(Math.random() * B.h);
          doorB = [B.x, yb];
        } else {
          const ya = A.y + Math.floor(Math.random() * A.h);
          doorA = [A.x, ya];
          const yb = B.y + Math.floor(Math.random() * B.h);
          doorB = [B.x + B.w - 1, yb];
        }
      } else {
        // вертикальное соединение
        if (dy > 0) {
          const xa = A.x + Math.floor(Math.random() * A.w);
          doorA = [xa, A.y + A.h - 1];
          const xb = B.x + Math.floor(Math.random() * B.w);
          doorB = [xb, B.y];
        } else {
          const xa = A.x + Math.floor(Math.random() * A.w);
          doorA = [xa, A.y];
          const xb = B.x + Math.floor(Math.random() * B.w);
          doorB = [xb, B.y + B.h - 1];
        }
      }
      // ставим двери
      tiles[doorA[1]][doorA[0]] = 'door';
      tiles[doorB[1]][doorB[0]] = 'door';
      // вырубаем коридор из двери в дверь
      carveHall(doorA[0], doorA[1], doorB[0], doorB[1]);
    }

    return tiles;
  }
}

window.GameMap = GameMap;