// map.js

class GameMap {
  /**
   * cols×rows — общий размер мира,
   * renderW×renderH — размер области вокруг игрока (30×30),
   * tileSize — пиксели на тайл.
   */
  constructor(
    cols = 100, rows = 100,
    renderW = 30, renderH = 30,
    tileSize = 80
  ) {
    this.cols      = cols;
    this.rows      = rows;
    this.renderW   = renderW;
    this.renderH   = renderH;
    this.tileSize  = tileSize;
    this.tiles     = [];
    this.rooms     = [];
    this._generateLayout();
  }

  _generateLayout() {
    // 1) Заливаем всё стенами
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
      const w = roomMin + Math.floor(Math.random() * (roomMax - roomMin));
      const h = roomMin + Math.floor(Math.random() * (roomMax - roomMin));
      const x = 1 + Math.floor(Math.random() * (this.cols - w - 2));
      const y = 1 + Math.floor(Math.random() * (this.rows - h - 2));
      // запоминаем центр комнаты
      const centerX = x + Math.floor(w / 2);
      const centerY = y + Math.floor(h / 2);
      this.rooms.push({ x, y, w, h, cx: centerX, cy: centerY });
      // чистим пол в комнате
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
          this.tiles[yy][xx].type = 'floor';
        }
      }
    }

    // 3) Соединяем комнаты коридорами шириной 2
    for (let i = 1; i < this.rooms.length; i++) {
      const prev = this.rooms[i - 1];
      const cur  = this.rooms[i];
      // Горизонтальный проход
      const x1 = Math.min(prev.cx, cur.cx);
      const x2 = Math.max(prev.cx, cur.cx);
      for (let xx = x1; xx <= x2; xx++) {
        for (let dy = 0; dy < 2; dy++) {
          const yy = prev.cy + dy;
          if (this._inBounds(xx, yy))
            this.tiles[yy][xx].type = 'floor';
        }
      }
      // Вертикальный проход
      const y1 = Math.min(prev.cy, cur.cy);
      const y2 = Math.max(prev.cy, cur.cy);
      for (let yy = y1; yy <= y2; yy++) {
        for (let dx = 0; dx < 2; dx++) {
          const xx = cur.cx + dx;
          if (this._inBounds(xx, yy))
            this.tiles[yy][xx].type = 'floor';
        }
      }
    }
  }

  _inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
  }

  isWall(x, y) {
    if (!this._inBounds(x, y)) return true;
    return this.tiles[y][x].type === 'wall';
  }

  regenerateTile(x, y) {
    // для деменции можно позже расширить
    this.tiles[y][x] = { type: 'floor', memoryAlpha: 0 };
  }
}