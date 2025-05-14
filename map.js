// map.js

class GameMap {
  /**
   * cols×rows — общий размер мира в тайлах,
   * renderW×renderH — размер одного чанка (в тайлах),
   * tileSize — пикселей на тайл (только для справки).
   */
  constructor(cols = 300, rows = 300, renderW = 30, renderH = 30, tileSize = 100) {
    this.cols     = cols;
    this.rows     = rows;
    this.renderW  = renderW;
    this.renderH  = renderH;
    this.tileSize = tileSize;

    // Сколько чанков по X/Y помещается в этом мире
    this.chunkCountX = Math.ceil(cols  / renderW);
    this.chunkCountY = Math.ceil(rows  / renderH);

    // Инициализируем весь массив тайлов стенами + memoryAlpha=0
    this.tiles = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({ type: 'wall', memoryAlpha: 0 }))
    );

    // Глобальный сид
    this.worldSeed       = Math.floor(Math.random() * 0xFFFFFFFF);
    // Сколько раз регенерился каждый чанк
    this.chunkRegenCount = {};     // ключ "cx,cy" → число вызовов
    // Набор сгенерированных чанков
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

    // Генерируем стартовый чанк (0,0)
    this.ensureChunk(0, 0);
  }

  /**
   * Гарантированно сгенерировать чанк (cx,cy),
   * но только если он в пределах [0..chunkCountX-1]×[0..chunkCountY-1].
   */
  ensureChunk(cx, cy) {
    if (cx < 0 || cy < 0 || cx >= this.chunkCountX || cy >= this.chunkCountY) {
      // за картой — ничего не делаем
      return;
    }
    const key = `${cx},${cy}`;
    if (!this.generatedChunks.has(key)) {
      this._generateChunk(cx, cy);
      this.generatedChunks.add(key);
    }
  }

  /**
   * (Re)генерация ровно одного чанка (cx, cy).
   * Никаких рекурсивных ensureChunk внутри!
   */
  _generateChunk(cx, cy) {
    const key   = `${cx},${cy}`;
    const count = (this.chunkRegenCount[key] || 0) + 1;
    this.chunkRegenCount[key] = count;

    // Детерминированный сид
    const seed = this.worldSeed ^ (cx * 0x9249249) ^ (cy << 16) ^ count;
    const rng  = this._makeMulberry(seed);

    // Координаты тайлов, покрываемых этим чанком
    const x0 = cx * this.renderW;
    const y0 = cy * this.renderH;

    // 1) Сбрасываем чанк в «стены» + memoryAlpha=0
    for (let y = y0; y < y0 + this.renderH; y++) {
      if (y < 0 || y >= this.rows) continue;
      for (let x = x0; x < x0 + this.renderW; x++) {
        if (x < 0 || x >= this.cols) continue;
        this.tiles[y][x] = { type: 'wall', memoryAlpha: 0 };
      }
    }

    // 2) Генерируем 3–5 комнат
    const rooms    = [];
    const roomCount = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < roomCount; i++) {
      const w  = 4 + Math.floor(rng() * 4);
      const h  = 4 + Math.floor(rng() * 4);
      const rx = x0 + Math.floor(rng() * (this.renderW - w));
      const ry = y0 + Math.floor(rng() * (this.renderH - h));
      rooms.push({ rx, ry, w, h });

      // «Вырубаем» пол
      for (let yy = ry; yy < ry + h; yy++) {
        for (let xx = rx; xx < rx + w; xx++) {
          if (yy >= 0 && yy < this.rows && xx >= 0 && xx < this.cols) {
            this.tiles[yy][xx].type = 'floor';
          }
        }
      }
    }

    // 3) Соединяем комнаты широкими (2-тайловыми) коридорами
    for (let i = 1; i < rooms.length; i++) {
      const A = rooms[i - 1], B = rooms[i];
      const ax = Math.floor(A.rx + A.w/2),
            ay = Math.floor(A.ry + A.h/2);
      const bx = Math.floor(B.rx + B.w/2),
            by = Math.floor(B.ry + B.h/2);

      // горизонтальный отрезок
      for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) {
        for (let dy = 0; dy < 2; dy++) {
          const y = ay + dy;
          if (y>=0 && y<this.rows && x>=0 && x<this.cols) {
            this.tiles[y][x].type = 'floor';
          }
        }
      }
      // вертикальный отрезок
      for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) {
        for (let dx = 0; dx < 2; dx++) {
          const x = bx + dx;
          if (y>=0 && y<this.rows && x>=0 && x<this.cols) {
            this.tiles[y][x].type = 'floor';
          }
        }
      }
    }
  }

  /**
   * true, если (x,y) — стена или вне границ.
   * При попытке проверить любой тайл за пределами существующих чанков
   * он не завалится — просто вернёт true.
   */
  isWall(x, y) {
    const cx = Math.floor(x / this.renderW);
    const cy = Math.floor(y / this.renderH);
    // сгенерировать чанк, только если он легально существует
    this.ensureChunk(cx, cy);
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) {
      return true;
    }
    return this.tiles[y][x].type === 'wall';
  }

  /**
   * Регенерирует чанк при «забывании» тайла (x,y),
   * но если это чанк с игроком, сбрасывает только память (memoryAlpha).
   */
  regenerateTile(x, y) {
    const cx = Math.floor(x / this.renderW);
    const cy = Math.floor(y / this.renderH);

    // если игрок находится в этом же чанке — не трогаем структуру
    if (window.player) {
      const pcx = Math.floor(window.player.x / this.renderW),
            pcy = Math.floor(window.player.y / this.renderH);
      if (pcx === cx && pcy === cy) {
        this.tiles[y][x].memoryAlpha = 0;
        return;
      }
    }

    // иначе — полная перегенерация чанка
    this._generateChunk(cx, cy);
  }
}