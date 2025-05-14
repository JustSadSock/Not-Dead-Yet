// map.js

class GameMap {
  /**
   * cols×rows — размер всего мира,
   * renderW×renderH — размер «окна» (чанка) в тайлах,
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

    // инициализируем ВСЕ тайлы стенами + нулевой памятью
    this.tiles = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({ type:'wall', memoryAlpha:0 }))
    );

    // генерация первого чанка [0,0]
    this.worldSeed   = Math.floor(Math.random() * 0xFFFFFFFF);
    this._makeMulberry();
    this.generateChunk(0, 0);
  }

  /** Mulberry32 PRNG фабрика */
  _makeMulberry() {
    this._mulberry32 = seed => {
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
   * Генерация одного чанка (renderW×renderH) по координатам чанка (cx,cy)
   * — классика: 3–5 случайных комнат + широкие коридоры.
   */
  generateChunk(cx, cy) {
    const seed = this.worldSeed ^ (cx * 0x9249249) ^ (cy << 16);
    const rng  = this._mulberry32(seed);

    const x0 = cx * this.renderW;
    const y0 = cy * this.renderH;

    // шаг 1: заливаем область стенами + сбрасываем память
    for (let y = y0; y < y0 + this.renderH; y++) {
      if (y < 0 || y >= this.rows) continue;
      for (let x = x0; x < x0 + this.renderW; x++) {
        if (x < 0 || x >= this.cols) continue;
        this.tiles[y][x] = { type:'wall', memoryAlpha:0 };
      }
    }

    // шаг 2: генерим 3–5 комнат
    const roomsCount = 3 + Math.floor(rng() * 3);
    const rooms = [];
    for (let i = 0; i < roomsCount; i++) {
      const w  = 4 + Math.floor(rng() * 4);
      const h  = 4 + Math.floor(rng() * 4);
      const rx = x0 + Math.floor(rng() * (this.renderW  - w));
      const ry = y0 + Math.floor(rng() * (this.renderH  - h));
      rooms.push({ rx, ry, w, h });
      for (let yy = ry; yy < ry + h; yy++) {
        for (let xx = rx; xx < rx + w; xx++) {
          if (yy>=0 && yy< this.rows && xx>=0 && xx<this.cols) {
            this.tiles[yy][xx].type = 'floor';
          }
        }
      }
    }

    // шаг 3: соединяем коридорами
    for (let i = 1; i < rooms.length; i++) {
      const A = rooms[i-1], B = rooms[i];
      const ax = Math.floor(A.rx + A.w/2), ay = Math.floor(A.ry + A.h/2);
      const bx = Math.floor(B.rx + B.w/2), by = Math.floor(B.ry + B.h/2);
      // горизонталь
      for (let x = Math.min(ax,bx); x <= Math.max(ax,bx); x++) {
        for (let dy=0; dy<2; dy++) {
          const y = ay + dy;
          if (y>=0 && y<this.rows && x>=0 && x<this.cols) {
            this.tiles[y][x].type = 'floor';
          }
        }
      }
      // вертикаль
      for (let y = Math.min(ay,by); y <= Math.max(ay,by); y++) {
        for (let dx=0; dx<2; dx++) {
          const x = bx + dx;
          if (y>=0 && y<this.rows && x>=0 && x<this.cols) {
            this.tiles[y][x].type = 'floor';
          }
        }
      }
    }
  }

  _inBounds(x,y) {
    return x>=0 && y>=0 && x<this.cols && y<this.rows;
  }

  /** Проверка столкновения */
  isWall(x,y) {
    if (!this._inBounds(x,y)) return true;
    return this.tiles[y][x].type === 'wall';
  }

  /**
   * Перегенерировать **только** этот один тайл,
   * **никогда** не трогая тот, где стоит игрок.
   */
  regenerateTile(x, y) {
    // если этот тайл прямо под игроком — не трогаем
    if (window.player) {
      const px = Math.floor(window.player.x);
      const py = Math.floor(window.player.y);
      if (px === x && py === y) return;
    }
    // иначе просто заново выберем wall/floor
    this.tiles[y][x] = {
      type: Math.random() < 0.4 ? 'wall' : 'floor',
      memoryAlpha: 0
    };
  }
}