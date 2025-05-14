// map.js

class GameMap {
  /**
   * cols×rows — общий размер мира в тайлах,
   * renderW×renderH — размер чанка (видимой области) в тайлах,
   * tileSize — пикселей на тайл (для справки).
   */
  constructor(cols = 300, rows = 300, renderW = 30, renderH = 30, tileSize = 100) {
    this.cols     = cols;
    this.rows     = rows;
    this.renderW  = renderW;
    this.renderH  = renderH;
    this.tileSize = tileSize;

    // 1) Инициализируем всю карту стенами + memoryAlpha=0
    this.tiles = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({ type: 'wall', memoryAlpha: 0 }))
    );

    // 2) Для детерминированной генерации чанков
    this.worldSeed       = Math.floor(Math.random() * 0xFFFFFFFF);
    this.chunkRegenCount = {};             // сколько раз регенерился каждый чанк
    this.generatedChunks = new Set();      // какие чанки уже сделаны

    // 3) Простой Mulberry32
    this._makeMulberry = seed => {
      let t = seed >>> 0;
      return () => {
        t += 0x6D2B79F5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
      };
    };

    // 4) Сразу формируем стартовый чанк (0,0)
    this.ensureChunk(0, 0);
  }

  /**
   * Убедиться, что чанк (cx,cy) сгенерирован.
   */
  ensureChunk(cx, cy) {
    const key = `${cx},${cy}`;
    if (!this.generatedChunks.has(key)) {
      this.generateChunk(cx, cy);
      this.generatedChunks.add(key);
    }
  }

  /**
   * Полная (re)генерация чанка (cx,cy):
   * — 3–5 комнат
   * — широкие (2-тайловые) коридоры между ними
   * — двери на каждом из 4 краёв чанка, прорубаем и в соседях
   */
  generateChunk(cx, cy) {
    const key   = `${cx},${cy}`;
    const count = (this.chunkRegenCount[key] || 0) + 1;
    this.chunkRegenCount[key] = count;

    const seed = this.worldSeed ^ (cx * 0x9249249) ^ (cy << 16) ^ count;
    const rng  = this._makeMulberry(seed);

    const x0 = cx * this.renderW;
    const y0 = cy * this.renderH;

    // 1) Заливаем весь чанк «стеной»
    for (let y = y0; y < y0 + this.renderH; y++) {
      if (y < 0 || y >= this.rows) continue;
      for (let x = x0; x < x0 + this.renderW; x++) {
        if (x < 0 || x >= this.cols) continue;
        this.tiles[y][x] = { type: 'wall', memoryAlpha: 0 };
      }
    }

    // 2) Внутренние комнаты
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

    // 3) Коридоры между внутренними комнатами
    for (let i = 1; i < rooms.length; i++) {
      const A = rooms[i - 1], B = rooms[i];
      const ax = Math.floor(A.rx + A.w/2),
            ay = Math.floor(A.ry + A.h/2);
      const bx = Math.floor(B.rx + B.w/2),
            by = Math.floor(B.ry + B.h/2);

      // горизонтальный участок
      for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) {
        for (let dy = 0; dy < 2; dy++) {
          const y = ay + dy;
          if (y>=0 && y<this.rows && x>=0 && x<this.cols) {
            this.tiles[y][x].type = 'floor';
          }
        }
      }
      // вертикальный участок
      for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) {
        for (let dx = 0; dx < 2; dx++) {
          const x = bx + dx;
          if (y>=0 && y<this.rows && x>=0 && x<this.cols) {
            this.tiles[y][x].type = 'floor';
          }
        }
      }
    }

    // 4) Двери на границе чанка: N, S, W, E
    //    — для каждой стороны берём одно рандомное место
    const doorN = y0,
          doorS = y0 + this.renderH - 1,
          doorWx = x0,
          doorEx = x0 + this.renderW - 1;
    const pickX = () => x0 + Math.floor(rng() * this.renderW);
    const pickY = () => y0 + Math.floor(rng() * this.renderH);

    // север (и соседняя граница в chunk(cx,cy-1))
    {
      const dx = pickX(), dy = doorN;
      this.tiles[dy][dx].type = 'floor';
      this.ensureChunk(cx, cy-1);
      this.tiles[dy - 1]?.[dx] && (this.tiles[dy - 1][dx].type = 'floor');
    }
    // юг
    {
      const dx = pickX(), dy = doorS;
      this.tiles[dy][dx].type = 'floor';
      this.ensureChunk(cx, cy+1);
      this.tiles[dy + 1]?.[dx] && (this.tiles[dy + 1][dx].type = 'floor');
    }
    // запад
    {
      const dy = pickY(), dx = doorWx;
      this.tiles[dy][dx].type = 'floor';
      this.ensureChunk(cx-1, cy);
      this.tiles[dy]?.[dx - 1] && (this.tiles[dy][dx - 1].type = 'floor');
    }
    // восток
    {
      const dy = pickY(), dx = doorEx;
      this.tiles[dy][dx].type = 'floor';
      this.ensureChunk(cx+1, cy);
      this.tiles[dy]?.[dx + 1] && (this.tiles[dy][dx + 1].type = 'floor');
    }
  }

  /**
   * true, если (x,y) стена или вне мира.
   * Вызывает генерацию нужного чанка по координатам.
   */
  isWall(x, y) {
    const cx = Math.floor(x / this.renderW);
    const cy = Math.floor(y / this.renderH);
    this.ensureChunk(cx, cy);
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return true;
    return this.tiles[y][x].type === 'wall';
  }

  /**
   * Вызывается, когда память о тайле (x,y) окончательно потускнела.
   * Если это тайл в чанке игрока — просто сброс memoryAlpha.
   * Иначе — полная регенерация этого чанка.
   */
  regenerateTile(x, y) {
    const cx = Math.floor(x / this.renderW),
          cy = Math.floor(y / this.renderH);
    if (window.player) {
      const pcx = Math.floor(window.player.x / this.renderW),
            pcy = Math.floor(window.player.y / this.renderH);
      if (pcx === cx && pcy === cy) {
        this.tiles[y][x].memoryAlpha = 0;
        return;
      }
    }
    // иначе: пересоздаём чанк целиком
    this.generateChunk(cx, cy);
  }
}