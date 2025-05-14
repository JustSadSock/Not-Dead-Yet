class GameMap {
  constructor(cols, rows, tileSize) {
    this.cols = cols;
    this.rows = rows;
    this.tileSize = tileSize;
    this.tiles = [];           // [y][x] = { type, memoryAlpha }
    this.generateFullMap();
  }

  generateFullMap() {
    for (let y = 0; y < this.rows; y++) {
      this.tiles[y] = [];
      for (let x = 0; x < this.cols; x++) {
        this.tiles[y][x] = this._createRandomTile();
      }
    }
  }

  _createRandomTile() {
    // простая генерация: 40% стен, 60% пола
    const type = Math.random() < 0.4 ? 'wall' : 'floor';
    return { type, memoryAlpha: 0 };
  }

  regenerateTile(x, y) {
    // когда память стерта — создаём новый тайл
    this.tiles[y][x] = this._createRandomTile();
  }
}
