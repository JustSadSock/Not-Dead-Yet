// map.js

class GameMap {
  /**
   * @param cols  — общее число тайлов по X (можно большое, например 1000)
   * @param rows  — общее число тайлов по Y
   * @param renderW — ширина чанка (в тайлах), например 30
   * @param renderH — высота чанка (в тайлах), например 30
   * @param tileSize — пикселей на тайл (только для справки)
   */
  constructor(cols = 300, rows = 300, renderW = 30, renderH = 30, tileSize = 100) {
    this.cols     = cols;
    this.rows     = rows;
    this.renderW  = renderW;
    this.renderH  = renderH;
    this.tileSize = tileSize;

    // Массив тайлов: заполним пустыми стенами, но чанки ещё не «рабочие»
    this.tiles = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({ type: 'wall', memoryAlpha: 0 }))
    );

    // Мирозданческий seed
    this.worldSeed       = Math.floor(Math.random() * 0xFFFFFFFF);
    // Счётчик регенераций чанков
    this.chunkRegenCount = {};   // ключ "cx,cy" → число вызовов generateChunk

    // Mulberry32-фабрика
    this._makeMulberry = seed => {
      let t = seed >>> 0;
      return () => {
        t += 0x6D2B79F5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
      };
    };

    // Множество сгенерированных чанков
    this.generatedChunks = new Set();

    // Генерируем чанк с координатами, где стартует игрок (0,0)
    this.ensureChunk(0, 0);
  }

  /**
   * Проверка, сгенерирован ли чанк (cx,cy) — если нет, вызываем generateChunk.
   */
  ensureChunk(cx, cy) {
    const key = `${cx},${cy}`;
    if (!this.generatedChunks.has(key)) {
      this.generateChunk(cx, cy);
      this.generatedChunks.add(key);
    }
  }

  /**
   * Генерация или перегенерация чанка (cx, cy):
   * создаём 3–5 комнат и широкие (2-тайловые) коридоры между ними.
   */
  generateChunk(cx, cy) {
    // счётчик регенераций
    const key   = `${cx},${cy}`;
    const count = (this.chunkRegenCount[key] || 0) + 1;
    this.chunkRegenCount[key] = count;

    // детерминированный seed для этого чанка
    const seed = this.worldSeed ^ (cx * 0x9249249) ^ (cy << 16) ^ count;
    const rng  = this._makeMulberry(seed);

    // абсолютные координаты чанка в тайлах
    const x0 = cx * this.renderW;
    const y0 = cy * this.renderH;

    // 1) Сброс всего чанка в «стену» + сброс memoryAlpha
    for (let y = y0; y < y0 + this.renderH; y++) {
      if (y < 0 || y >= this.rows) continue;
      for (let x = x0; x < x0 + this.renderW; x++) {
        if (x < 0 || x >= this.cols) continue;
        this.tiles[y][x] = { type: 'wall', memoryAlpha: 0 };
      }
    }

    // 2) Сгенерировать 3–5 комнат
    const rooms = [];
    const roomCount = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < roomCount; i++) {
      const w  = 4 + Math.floor(rng() * 4);
      const h  = 4 + Math.floor(rng() * 4);
      const rx = x0 + Math.floor(rng() * (this.renderW - w));
      const ry = y0 + Math.floor(rng() * (this.renderH - h));
      rooms.push({ rx, ry, w, h });

      // чистим пол
      for (let yy = ry; yy < ry + h; yy++) {
        for (let xx = rx; xx < rx + w; xx++) {
          if (yy >= 0 && yy < this.rows && xx >= 0 && xx < this.cols) {
            this.tiles[yy][xx].type = 'floor';
          }
        }
      }
    }

    // 3) Соединяем комнаты 2-тайловыми коридорами
    for (let i = 1; i < rooms.length; i++) {
      const A = rooms[i - 1], B = rooms[i];
      const ax = Math.floor(A.rx + A.w / 2),
            ay = Math.floor(A.ry + A.h / 2);
      const bx = Math.floor(B.rx + B.w / 2),
            by = Math.floor(B.ry + B.h / 2);

      // горизонтальный сегмент
      for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) {
        for (let dy = 0; dy < 2; dy++) {
          const y = ay + dy;
          if (y >= 0 && y < this.rows && x >= 0 && x < this.cols) {
            this.tiles[y][x].type = 'floor';
          }
        }
      }
      // вертикальный сегмент
      for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) {
        for (let dx = 0; dx < 2; dx++) {
          const x = bx + dx;
          if (y >= 0 && y < this.rows && x >= 0 && x < this.cols) {
            this.tiles[y][x].type = 'floor';
          }
        }
      }
    }
  }

  /**
   * Коллизия: true, если (x,y) стена или вне границ.
   * При обращении к новому чанку автоматически его создаём.
   */
  isWall(x, y) {
    const cx = Math.floor(x / this.renderW);
    const cy = Math.floor(y / this.renderH);
    this.ensureChunk(cx, cy);
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return true;
    return this.tiles[y][x].type === 'wall';
  }

  /**
   * Когда тайл (x,y) «забывается» (memoryAlpha → 0),
   * перегенерируем чанк, где он лежит, за исключением чанка
   * с игроком — в нём мы просто сбросим memoryAlpha у этого тайла.
   */
  regenerateTile(x, y) {
    const cx = Math.floor(x / this.renderW);
    const cy = Math.floor(y / this.renderH);

    // если игрок в том же чанке — не трогаем структуру, только память
    if (window.player) {
      const pcx = Math.floor(window.player.x / this.renderW);
      const pcy = Math.floor(window.player.y / this.renderH);
      if (pcx === cx && pcy === cy) {
        this.tiles[y][x].memoryAlpha = 0;
        return;
      }
    }

    // иначе полностью пересоздаём чанк
    this.generateChunk(cx, cy);
  }
}