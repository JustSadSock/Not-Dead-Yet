// map.js

class GameMap {
  /**
   * cols×rows — общий размер мира,
   * renderW×renderH — размер «чунка» (30×30),
   * tileSize — пикселей на тайл (для справки).
   */
  constructor(
    cols     = 100,
    rows     = 100,
    renderW  = 30,
    renderH  = 30,
    tileSize = 100
  ) {
    this.cols     = cols;
    this.rows     = rows;
    this.renderW  = renderW;
    this.renderH  = renderH;
    this.tileSize = tileSize;

    // tiles[y][x] = { type: 'wall'|'floor', memoryAlpha: 0…1 }
    this.tiles = [];

    // Для детерминированного PRNG
    this.worldSeed   = Math.floor(Math.random() * 0xFFFFFFFF);
    this.chunkSeeds  = {};       // { "cx,cy": counter }
    this.generatedChunks = new Set();

    // Фабрика мульберри-генератора
    this._makeMulberry = () => {
      return seed => {
        let a = seed >>> 0;
        return () => {
          a |= 0;
          a = (a + 0x6D2B79F5) | 0;
          let t = Math.imul(a ^ (a >>> 15), 1 | a);
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      };
    };
    this._mulberry32 = this._makeMulberry();

    // Сразу генерируем чанк {0,0}
    this.generateChunk(0, 0);
  }

  /**
   * Генерирует или перегенерирует чанк по координатам чанка (cx,cy).
   * Каждая регенерация даёт новую схему комнат+корридоров в этом блоке.
   */
  generateChunk(cx, cy) {
    const key = `${cx},${cy}`;
    const count = (this.chunkSeeds[key] || 0) + 1;
    this.chunkSeeds[key] = count;

    // Детерминированный сид для этого чанка
    const seed = this.worldSeed ^ (cx * 0x9249249) ^ (cy << 16) ^ count;
    const rng  = this._mulberry32(seed);

    // Границы чанка в координатах тайлов
    const x0 = cx * this.renderW;
    const y0 = cy * this.renderH;

    // Инициализируем тайлы чанка стенами + сбросом памяти
    for (let y = y0; y < y0 + this.renderH; y++) {
      if (y < 0 || y >= this.rows) continue;
      this.tiles[y] = this.tiles[y] || [];
      for (let x = x0; x < x0 + this.renderW; x++) {
        if (x < 0 || x >= this.cols) continue;
        this.tiles[y][x] = { type: 'wall', memoryAlpha: 0 };
      }
    }

    // 1) Рандомно создаём несколько комнат в рамках чанка
    const rooms = [];
    const roomCount = 3 + Math.floor(rng() * 3); // 3–5 комнат
    for (let i = 0; i < roomCount; i++) {
      const w = 4 + Math.floor(rng() * 4); // ширина 4–7
      const h = 4 + Math.floor(rng() * 4); // высота 4–7
      const rx = x0 + Math.floor(rng() * (this.renderW - w));
      const ry = y0 + Math.floor(rng() * (this.renderH - h));
      rooms.push({ rx, ry, w, h });

      // «Вырубаем» пол внутри комнаты
      for (let yy = ry; yy < ry + h; yy++) {
        for (let xx = rx; xx < rx + w; xx++) {
          this.tiles[yy][xx].type = 'floor';
        }
      }
    }

    // 2) Соединяем комнаты широкими (2-тайловыми) коридорами
    for (let i = 1; i < rooms.length; i++) {
      const A = rooms[i - 1], B = rooms[i];
      const ax = Math.floor(A.rx + A.w / 2), ay = Math.floor(A.ry + A.h / 2);
      const bx = Math.floor(B.rx + B.w / 2), by = Math.floor(B.ry + B.h / 2);

      // Горизонтальный сегмент
      const x1 = Math.min(ax, bx), x2 = Math.max(ax, bx);
      for (let x = x1; x <= x2; x++) {
        for (let dy = 0; dy < 2; dy++) {
          const y = ay + dy;
          if (y >= y0 && y < y0 + this.renderH) this.tiles[y][x].type = 'floor';
        }
      }

      // Вертикальный сегмент
      const y1 = Math.min(ay, by), y2 = Math.max(ay, by);
      for (let y = y1; y <= y2; y++) {
        for (let dx = 0; dx < 2; dx++) {
          const x = bx + dx;
          if (x >= x0 && x < x0 + this.renderW) this.tiles[y][x].type = 'floor';
        }
      }
    }

    this.generatedChunks.add(key);
  }

  /** Проверяет, что (x,y) внутри границ карты */
  _inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
  }

  /** Коллизия: true, если (x,y) стена или за границей */
  isWall(x, y) {
    if (!this._inBounds(x, y)) return true;
    return this.tiles[y][x].type === 'wall';
  }

  /**
   * Вызывается, когда тайл (x,y) «потускнел» и забыт героем:
   * полностью перегенерируем его чанк, давая новую схему.
   */
  regenerateTile(x, y) {
    const cx = Math.floor(x / this.renderW);
    const cy = Math.floor(y / this.renderH);
    this.generateChunk(cx, cy);
  }
}