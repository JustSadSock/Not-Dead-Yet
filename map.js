// map.js

class GameMap {
  /**
   * cols×rows — общий размер мира в тайлах,
   * renderW×renderH — размер чанка (видимой области) в тайлах,
   * tileSize — пикселей на тайл.
   */
  constructor(cols = 300, rows = 300, renderW = 30, renderH = 30, tileSize = 100) {
    this.cols     = cols;
    this.rows     = rows;
    this.renderW  = renderW;
    this.renderH  = renderH;
    this.tileSize = tileSize;

    // инициализируем карту стенами, памятью и флагом visited
    this.tiles = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({
        type: 'wall',
        memoryAlpha: 0,
        visited: false
      }))
    );

    // для детерминированного псевдо-рандома по чанкам
    this.worldSeed       = Math.floor(Math.random() * 0xFFFFFFFF);
    this.chunkRegenCount = {};      // key "cx,cy" → число перегенераций
    this.generatedChunks = new Set();

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

    // сгенерируем стартовый чанк [0,0]
    this.ensureChunk(0, 0);
  }

  /** Убедиться, что чанк (cx,cy) сгенерирован */
  ensureChunk(cx, cy) {
    const key = `${cx},${cy}`;
    if (!this.generatedChunks.has(key)) {
      this._generateChunk(cx, cy);
      this.generatedChunks.add(key);
    }
  }

  /**
   * Полная генерация чанка (cx,cy) в основную карту:
   * — сброс стен, memoryAlpha=0, visited=false,
   * — 3–5 комнат + широкие (2-тайловые) коридоры.
   */
  _generateChunk(cx, cy) {
    const key   = `${cx},${cy}`;
    const count = (this.chunkRegenCount[key] || 0) + 1;
    this.chunkRegenCount[key] = count;

    const seed = this.worldSeed ^ (cx * 0x9249249) ^ (cy << 16) ^ count;
    const rng  = this._makeMulberry(seed);

    const x0 = cx * this.renderW;
    const y0 = cy * this.renderH;

    // 1) Reset
    for (let y = y0; y < y0 + this.renderH; y++) {
      if (y < 0 || y >= this.rows) continue;
      for (let x = x0; x < x0 + this.renderW; x++) {
        if (x < 0 || x >= this.cols) continue;
        const tile = this.tiles[y][x];
        tile.type        = 'wall';
        tile.memoryAlpha = 0;
        tile.visited     = false;
      }
    }

    // 2) Случайные комнаты
    const rooms = [];
    const roomCount = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < roomCount; i++) {
      const w  = 4 + Math.floor(rng() * 4);
      const h  = 4 + Math.floor(rng() * 4);
      const rx = x0 + Math.floor(rng() * (this.renderW - w));
      const ry = y0 + Math.floor(rng() * (this.renderH - h));
      rooms.push({ rx, ry, w, h });
      for (let yy = ry; yy < ry + h; yy++) {
        for (let xx = rx; xx < rx + w; xx++) {
          if (yy >= 0 && yy < this.rows && xx >= 0 && xx < this.cols) {
            this.tiles[yy][xx].type = 'floor';
          }
        }
      }
    }

    // 3) Коридоры
    for (let i = 1; i < rooms.length; i++) {
      const A  = rooms[i - 1], B = rooms[i];
      const ax = Math.floor(A.rx + A.w / 2),
            ay = Math.floor(A.ry + A.h / 2);
      const bx = Math.floor(B.rx + B.w / 2),
            by = Math.floor(B.ry + B.h / 2);

      // горизонтальный
      for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) {
        for (let dy = 0; dy < 2; dy++) {
          const y = ay + dy;
          if (y >= 0 && y < this.rows && x >= 0 && x < this.cols) {
            this.tiles[y][x].type = 'floor';
          }
        }
      }
      // вертикальный
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
   * Сгенерировать буфер для чанка (cx,cy),
   * не затрагивая основную карту. Возвращает matrix[renderH][renderW].
   */
  _generateChunkBuffer(cx, cy) {
    const key   = `${cx},${cy}`;
    const count = (this.chunkRegenCount[key] || 0) + 1;
    this.chunkRegenCount[key] = count;

    const seed = this.worldSeed ^ (cx * 0x9249249) ^ (cy << 16) ^ count;
    const rng  = this._makeMulberry(seed);

    // создаём пустой буфер стен
    const buffer = Array.from({ length: this.renderH }, () =>
      Array.from({ length: this.renderW }, () => ({ type: 'wall' }))
    );

    // комнаты
    const rooms      = [];
    const roomCount  = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < roomCount; i++) {
      const w  = 4 + Math.floor(rng() * 4);
      const h  = 4 + Math.floor(rng() * 4);
      const rx = Math.floor(rng() * (this.renderW - w));
      const ry = Math.floor(rng() * (this.renderH - h));
      rooms.push({ rx, ry, w, h });
      for (let yy = ry; yy < ry + h; yy++) {
        for (let xx = rx; xx < rx + w; xx++) {
          buffer[yy][xx].type = 'floor';
        }
      }
    }

    // коридоры
    for (let i = 1; i < rooms.length; i++) {
      const A  = rooms[i - 1], B = rooms[i];
      const ax = Math.floor(A.rx + A.w/2),
            ay = Math.floor(A.ry + A.h/2);
      const bx = Math.floor(B.rx + B.w/2),
            by = Math.floor(B.ry + B.h/2);

      // горизонтальный
      for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) {
        for (let dy = 0; dy < 2; dy++) {
          const y = ay + dy;
          buffer[y]?.[x] && (buffer[y][x].type = 'floor');
        }
      }
      // вертикальный
      for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) {
        for (let dx = 0; dx < 2; dx++) {
          const x = bx + dx;
          buffer[y]?.[x] && (buffer[y][x].type = 'floor');
        }
      }
    }

    return buffer;
  }

  /**
   * true, если (x,y) стена или вне границ.
   * Автоматически генерирует чанк, если нужно.
   */
  isWall(x, y) {
    const cx = Math.floor(x / this.renderW);
    const cy = Math.floor(y / this.renderH);
    this.ensureChunk(cx, cy);
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return true;
    return this.tiles[y][x].type === 'wall';
  }

  /**
   * При «забывании» тайла (memoryAlpha → 0):
   * — генерим буфер чанка,
   * — копируем из него только те клетки,
   *   которые игрок уже видел (visited===true) и у которых memoryAlpha===0.
   */
  regenerateTile(x, y) {
    const cx = Math.floor(x / this.renderW);
    const cy = Math.floor(y / this.renderH);
    const x0 = cx * this.renderW;
    const y0 = cy * this.renderH;

    const buffer = this._generateChunkBuffer(cx, cy);

    for (let yy = 0; yy < this.renderH; yy++) {
      for (let xx = 0; xx < this.renderW; xx++) {
        const gx = x0 + xx, gy = y0 + yy;
        if (gy < 0 || gy >= this.rows || gx < 0 || gx >= this.cols) continue;
        const tile = this.tiles[gy][gx];
        if (tile.visited && tile.memoryAlpha === 0) {
          tile.type = buffer[yy][xx].type;
        }
      }
    }
  }
}

window.GameMap = GameMap;