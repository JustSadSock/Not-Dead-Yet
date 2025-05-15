// map.js

/**
 * GameMap — бесконечная чанковая карта с процедурной генерацией комнат
 * и коридоров, детерминированным сидом и без искусственных границ.
 */
class GameMap {
  /**
   * @param {number} chunkSize — размер одного чанка в тайлах (например, 30)
   */
  constructor(chunkSize = 30) {
    this.chunkSize   = chunkSize;            // тайлов на сторону
    this.chunks      = new Map();            // Map<"cx,cy", { tiles: boolean[][] }>
    this.chunkSeeds  = new Map();            // Map<"cx,cy", regenCount>
    this.worldSeed   = Math.floor(Math.random() * 0xFFFFFFFF);
    // Mulberry32 PRNG-фабрика
    this._seedToRng = seed => {
      let t = seed >>> 0;
      return () => {
        t += 0x6D2B79F5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
      };
    };
  }

  /**
   * Гарантированно сгенерировать чанк (cx,cy), если его ещё нет.
   */
  ensureChunk(cx, cy) {
    const key = `${cx},${cy}`;
    if (this.chunks.has(key)) return;
    this._generateChunk(cx, cy);
  }

  /**
   * Собственно генерация (или перегенерация) чанка (cx,cy).
   * В нём создаётся 3–5 прямоугольных комнат и широкие коридоры между ними.
   */
  _generateChunk(cx, cy) {
    const key   = `${cx},${cy}`;
    const prev  = this.chunkSeeds.get(key) || 0;
    const count = prev + 1;
    this.chunkSeeds.set(key, count);

    // Собираем «сид» для этого чанка: постоянно + координаты + сколько раз уже генерили
    const seed = this.worldSeed
               ^ (cx * 0x9249249)
               ^ (cy << 16)
               ^ count;
    const rng  = this._seedToRng(seed);

    // Подготовка пустого поля (везде «стена»)
    const tiles = Array.from({ length: this.chunkSize }, () =>
      Array(this.chunkSize).fill(false)
    );

    // 1) Случайно 3–5 комнат
    const rooms     = [];
    const roomCount = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < roomCount; i++) {
      const w  = 4 + Math.floor(rng() * 4);
      const h  = 4 + Math.floor(rng() * 4);
      const rx = Math.floor(rng() * (this.chunkSize - w));
      const ry = Math.floor(rng() * (this.chunkSize - h));
      rooms.push({ rx, ry, w, h });
      // «Вырубаем» стены в прямоугольнике
      for (let y = ry; y < ry + h; y++) {
        for (let x = rx; x < rx + w; x++) {
          tiles[y][x] = true;
        }
      }
    }

    // 2) Широкие (2-тайловые) коридоры между соседними комнатами
    for (let i = 1; i < rooms.length; i++) {
      const A  = rooms[i - 1], B = rooms[i];
      const ax = Math.floor(A.rx + A.w / 2),
            ay = Math.floor(A.ry + A.h / 2);
      const bx = Math.floor(B.rx + B.w / 2),
            by = Math.floor(B.ry + B.h / 2);

      // горизонтальный сегмент
      for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) {
        for (let dy = 0; dy < 2; dy++) {
          const y = ay + dy;
          if (y >= 0 && y < this.chunkSize) tiles[y][x] = true;
        }
      }
      // вертикальный сегмент
      for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) {
        for (let dx = 0; dx < 2; dx++) {
          const x = bx + dx;
          if (x >= 0 && x < this.chunkSize) tiles[y][x] = true;
        }
      }
    }

    // Сохраняем готовый чанк
    this.chunks.set(key, { tiles });
  }

  /**
   * Проверка, проходим ли глобальный тайл (gx,gy).
   * Автоматически генерирует отсутствующий чанк.
   */
  isFloor(gx, gy) {
    const cx = Math.floor(gx / this.chunkSize);
    const cy = Math.floor(gy / this.chunkSize);
    const key = `${cx},${cy}`;
    if (!this.chunks.has(key)) {
      // теперь границ нет — и сверху, и снизу, и по бокам генерируем
      this._generateChunk(cx, cy);
    }
    const chunk = this.chunks.get(key).tiles;
    // локальные координаты внутри чанка (коррекция для отрицательных gx/gy)
    const lx = ((gx % this.chunkSize) + this.chunkSize) % this.chunkSize;
    const ly = ((gy % this.chunkSize) + this.chunkSize) % this.chunkSize;
    return chunk[ly][lx];
  }
}

// Делаем GameMap глобально доступным
window.GameMap = GameMap;