// map.js

/**
 * GameMap — чанковая карта с процедурной генерацией комнат и коридоров.
 */
class GameMap {
  /**
   * @param {number} cols     — ширина мира в тайлах (пока не важна, но нужна для bounds)
   * @param {number} rows     — высота мира в тайлах
   * @param {number} renderW  — ширина чанка в тайлах
   * @param {number} renderH  — высота чанка в тайлах
   * @param {number} tileSize — пикселей на тайл (для справки)
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

    // единый массив тайлов мира
    this.tiles = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({ type: 'wall', memoryAlpha: 0 }))
    );

    // детерминированный PRNG по чанкам
    this.worldSeed       = Math.floor(Math.random() * 0xFFFFFFFF);
    this.chunkSeeds      = {};      // сколько раз сгенерили каждый чанк
    this.generatedChunks = new Set(); // ключи "cx,cy"

    // Mulberry32-фабрика
    this._makeMulberry = () => seed => {
      let t = seed >>> 0;
      return () => {
        t += 0x6D2B79F5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
      };
    };
    this._mulberry32 = this._makeMulberry();

    // сразу генерим стартовый чанк
    this.generateChunk(0, 0);
  }

  /**
   * Гарантированно сгенерировать чанк (cx, cy), если он ещё не был.
   */
  ensureChunk(cx, cy) {
    const key = `${cx},${cy}`;
    if (!this.generatedChunks.has(key)) {
      this.generateChunk(cx, cy);
    }
  }

  /**
   * Генерация (или перегенерация) чанка (cx, cy):
   * — наполняем стенами
   * — создаём 3–5 комнат прямоугольной формы
   * — рисуем 2-тайловые коридоры между ними
   */
  generateChunk(cx, cy) {
    const key   = `${cx},${cy}`;
    const count = (this.chunkSeeds[key] || 0) + 1;
    this.chunkSeeds[key] = count;

    // детерминированный seed для этого чанка
    const seed = this.worldSeed ^ (cx * 0x9249249) ^ (cy << 16) ^ count;
    const rng  = this._mulberry32(seed);

    // границы чанка в тайлах глобальной карты
    const x0 = cx * this.renderW;
    const y0 = cy * this.renderH;

    // 1) затираем стенами + сбрасываем память
    for (let y = y0; y < y0 + this.renderH; y++) {
      // **Убрано** условие `y<0`, чтобы чанки над нулём тоже генерились
      if (y >= this.rows) continue;
      for (let x = x0; x < x0 + this.renderW; x++) {
        if (x < 0 || x >= this.cols) continue;
        this.tiles[y][x] = { type: 'wall', memoryAlpha: 0 };
      }
    }

    // 2) создаём 3–5 комнат
    const rooms     = [];
    const roomCount = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < roomCount; i++) {
      const w  = 4 + Math.floor(rng() * 4);
      const h  = 4 + Math.floor(rng() * 4);
      const rx = x0 + Math.floor(rng() * (this.renderW - w));
      const ry = y0 + Math.floor(rng() * (this.renderH - h));
      rooms.push({ rx, ry, w, h });

      // вырубаем пол в комнате
      for (let yy = ry; yy < ry + h; yy++) {
        for (let xx = rx; xx < rx + w; xx++) {
          if (yy >= 0 && yy < this.rows && xx >= 0 && xx < this.cols) {
            this.tiles[yy][xx].type = 'floor';
          }
        }
      }
    }

    // 3) соединяем соседние комнаты коридорами толщиной 2 тайла
    for (let i = 1; i < rooms.length; i++) {
      const A  = rooms[i - 1], B = rooms[i];
      const ax = Math.floor(A.rx + A.w/2), ay = Math.floor(A.ry + A.h/2);
      const bx = Math.floor(B.rx + B.w/2), by = Math.floor(B.ry + B.h/2);

      // горизонтальный ход
      for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) {
        for (let dy = 0; dy < 2; dy++) {
          const y = ay + dy;
          if (y >= 0 && y < this.rows && x >= 0 && x < this.cols) {
            this.tiles[y][x].type = 'floor';
          }
        }
      }
      // вертикальный ход
      for (let y = Math.min(