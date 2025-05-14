// map.js

class GameMap {
  /**
   * cols×rows — общий размер мира в тайлах,
   * renderW×renderH — размер чанка (видимой области) в тайлах,
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

    // Основной массив: tiles[y][x] = { type:'wall'|'floor', memoryAlpha:0…1 }
    this.tiles = [];
    for (let y = 0; y < this.rows; y++) {
      this.tiles[y] = [];
      for (let x = 0; x < this.cols; x++) {
        this.tiles[y][x] = { type: 'wall', memoryAlpha: 0 };
      }
    }

    // Для детерминированного PRNG
    this.worldSeed      = Math.floor(Math.random() * 0xFFFFFFFF);
    this.chunkSeeds     = {};      // хранит, сколько раз регенерился каждый чанк
    this.generatedChunks = new Set();

    // Mulberry32-фабрика
    this._makeMulberry = () => {
      return seed => {
        let t = seed >>> 0;
        return () => {
          t += 0x6D2B79F5;
          let r = Math.imul(t ^ (t >>> 15), 1 | t);
          r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
          return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
        };
      };
    };
    this._mulberry32 = this._makeMulberry();

    // Сразу генерируем чанк [0,0]
    this.generateChunk(0, 0);
  }

  /**
   * Генерирует или перегенерирует чанк с индексом (cx,cy).
   * Каждый вызов даёт новую схему комнат+коридоров в пределах этого чанка.
   */
  generateChunk(cx, cy) {
    const key   = `${cx},${cy}`;
    const count = (this.chunkSeeds[key] || 0) + 1;
    this.chunkSeeds[key] = count;

    // Сид зависит от мирового seed, от координат чанка и от числа регенераций
    const seed = this.worldSeed ^ (cx * 0x9249249) ^ (cy << 16) ^ count;
    const rng  = this._mulberry32(seed);

    // Границы чанка в тайлах
    const x0 = cx * this.renderW;
    const y0 = cy * this.renderH;

    // Инициализируем область чанка стенами + сбрасываем память
    for (let y = y0; y < y0 + this.renderH; y++) {
      if (y < 0 || y >= this.rows) continue;
      for (let x = x0; x < x0 + this.renderW; x++) {
        if (x < 0 || x >= this.cols) continue;
        this.tiles[y][x] = { type: 'wall', memoryAlpha: 0 };
      }
    }

    // 1) Рандомно создаём 3–5 комнат в этом чанке
    const rooms = [];
    const roomCount = 3 + Math.floor(rng() * 3); // 3–5 комнат
    for (let i = 0; i < roomCount; i++) {
      const w  = 4 + Math.floor(rng() * 4); // ширина 4–7
      const h  = 4 + Math.floor(rng() * 4); // высота 4–7
      const rx = x0 + Math.floor(rng() * (this.renderW - w));
      const ry = y0 + Math.floor(rng() * (this.renderH - h));
      rooms.push({ rx, ry, w, h });

      // «Вырубаем» пол внутри комнаты
      for (let yy = ry; yy < ry + h; yy++) {
        for (let xx = rx; xx < rx + w; xx++) {
          if (yy >= 0 && yy < this.rows && xx >= 0 && xx < this.cols) {
            this.tiles[yy][xx].type = 'floor';
          }
        }
      }
    }

    // 2) Соединяем комнаты широкими (2-тайловыми) коридорами
    for (let i = 1; i < rooms.length; i++) {
      const A = rooms[i - 1],
            B = rooms[i];
      const ax = Math.floor(A.rx + A.w / 2),
            ay = Math.floor(A.ry + A.h / 2);
      const bx = Math.floor(B.rx + B.w / 2),
            by = Math.floor(B.ry + B.h / 2);

      // Горизонтальный сегмент
      const x1 = Math.min(ax, bx),
            x2 = Math.max(ax, bx);
      for (let x = x1; x <= x2; x++) {
        for (let dy = 0; dy < 2; dy++) {
          const y = ay + dy;
          if (y >= 0 && y < this.rows && x >= 0 && x < this.cols) {
            this.tiles[y][x].type = 'floor';
          }
        }
      }

      // Вертикальный сегмент
      const y1 = Math.min(ay, by),
            y2 = Math.max(ay, by);
      for (let y = y1; y <= y2; y++) {
        for (let dx = 0; dx < 2; dx++) {
          const x = bx + dx;
          if (y >= 0 && y < this.rows && x >= 0 && x < this.cols) {
            this.tiles[y][x].type = 'floor';
          }
        }
      }
    }

    this.generatedChunks.add(key);
  }

  /** Проверка выхода за границы */
  _inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
  }

  /** true, если на (x,y) стена или это вне карты */
  isWall(x, y) {
    if (!this._inBounds(x, y)) return true;
    return this.tiles[y][x].type === 'wall';
  }

  /**
   * Когда тайл (x,y) «забыт» (memoryAlpha опустился до 0),
   * перегенерируем целиком его чанк.
   */
  regenerateTile(x, y) {
    const cx = Math.floor(x / this.renderW);
    const cy = Math.floor(y / this.renderH);
    this.generateChunk(cx, cy);
  }
}