// map.js

class GameMap {
  /**
   * cols×rows — общий размер “бесконечного” мира,
   * renderW×renderH — размер области вокруг игрока (30×30),
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

    // Основной массив тайлов
    // tiles[y][x] = { type: 'wall'|'floor', memoryAlpha: 0…1 }
    this.tiles = [];
    // После первичной генерации сюда скопируем только типы
    this._original = [];

    // Для layout
    this.rooms = [];

    this._generateLayout();

    // Клонируем начальную структуру в _original
    for (let y = 0; y < this.rows; y++) {
      this._original[y] = [];
      for (let x = 0; x < this.cols; x++) {
        this._original[y][x] = this.tiles[y][x].type;
      }
    }
  }

  /** Первичная генерация: заливаем стенами, создаём комнаты и коридоры */
  _generateLayout() {
    // 1) Заливаем все стены
    for (let y = 0; y < this.rows; y++) {
      this.tiles[y] = [];
      for (let x = 0; x < this.cols; x++) {
        this.tiles[y][x] = { type: 'wall', memoryAlpha: 0 };
      }
    }

    // 2) Создаём несколько комнат
    const roomCount = 8;
    const roomMin   = 8;
    const roomMax   = 16;
    for (let i = 0; i < roomCount; i++) {
      const w  = roomMin + Math.floor(Math.random() * (roomMax - roomMin));
      const h  = roomMin + Math.floor(Math.random() * (roomMax - roomMin));
      const x0 = 1 + Math.floor(Math.random() * (this.cols - w - 2));
      const y0 = 1 + Math.floor(Math.random() * (this.rows - h - 2));
      const cx = x0 + Math.floor(w / 2);
      const cy = y0 + Math.floor(h / 2);
      this.rooms.push({ x:x0, y:y0, w, h, cx, cy });

      // Чистим пол в комнате
      for (let yy = y0; yy < y0 + h; yy++) {
        for (let xx = x0; xx < x0 + w; xx++) {
          this.tiles[yy][xx].type = 'floor';
        }
      }
    }

    // 3) Соединяем комнаты широкими коридорами
    for (let i = 1; i < this.rooms.length; i++) {
      const prev = this.rooms[i - 1];
      const cur  = this.rooms[i];

      // Горизонтальный проход (2 тайла высоты)
      const x1 = Math.min(prev.cx, cur.cx);
      const x2 = Math.max(prev.cx, cur.cx);
      for (let xx = x1; xx <= x2; xx++) {
        for (let dy = 0; dy < 2; dy++) {
          const yy = prev.cy + dy;
          if (this._inBounds(xx, yy)) {
            this.tiles[yy][xx].type = 'floor';
          }
        }
      }

      // Вертикальный проход (2 тайла ширины)
      const y1 = Math.min(prev.cy, cur.cy);
      const y2 = Math.max(prev.cy, cur.cy);
      for (let yy = y1; yy <= y2; yy++) {
        for (let dx = 0; dx < 2; dx++) {
          const xx = cur.cx + dx;
          if (this._inBounds(xx, yy)) {
            this.tiles[yy][xx].type = 'floor';
          }
        }
      }
    }
  }

  /** Проверяет, что (x,y) в пределах массива */
  _inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
  }

  /**
   * Истинно, если на (x,y) стена или точка вне карты
   */
  isWall(x, y) {
    if (!this._inBounds(x, y)) return true;
    return this.tiles[y][x].type === 'wall';
  }

  /**
   * Перегенерирует «забытый» тайл, возвращая его
   * к изначальному типу из первичной генерации.
   * Сбрасывает memoryAlpha.
   */
  regenerateTile(x, y) {
    const orig = this._original[y]?.[x] || 'floor';
    this.tiles[y][x] = { type: orig, memoryAlpha: 0 };
  }
}