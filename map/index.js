// map/index.js
import { generateDungeon } from './generator.js';

export class GameMap {
  constructor(width, height, chunkSize) {
    this.width     = width;
    this.height    = height;
    this.chunkSize = chunkSize;
    this.tiles     = [];
    this._buildEmpty();
    this.regenerate();
  }

  _buildEmpty() {
    this.tiles = Array.from({length: this.height}, () =>
      Array.from({length: this.width}, () => ({ type: 'wall' }))
    );
  }

  regenerate() {
    // заново чистим и генерим
    this._buildEmpty();
    generateDungeon(this.tiles);
  }

  isFloor(x, y) {
    const t = this.tiles[y] && this.tiles[y][x];
    return t && t.type.startsWith('floor');
  }
}