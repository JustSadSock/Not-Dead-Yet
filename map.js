// map.js

import { generateTiles } from './generators/communal.js';  // генератор по-умолчанию

export class GameMap {
  constructor(chunkSize = 32) {
    this.chunkSize  = chunkSize;
    this.chunks     = new Map();    // key="cx,cy" → { tiles, meta }
    this.generating = new Set();
  }

  ensureChunk(cx, cy) {
    const key = `${cx},${cy}`;
    if (this.chunks.has(key) || this.generating.has(key)) return;
    this.generating.add(key);

    // 1) создаём S×S из «wall»
    const tiles = Array.from({ length: this.chunkSize }, () =>
      Array(this.chunkSize).fill('wall')
    );
    // 2) вызываем конкретный генератор, он порежет комнаты/коридоры/двери
    const rooms = generateTiles(tiles);

    // 3) meta-слой для fade memory
    const meta = Array.from({ length: this.chunkSize }, () =>
      Array.from({ length: this.chunkSize }, () => ({ memoryAlpha: 0 }))
    );

    this.chunks.set(key, { tiles, meta, rooms });
    this.generating.delete(key);
  }

  isFloor(x, y) {
    // проверяет «можно ли ходить» — независмо от вида комнаты/коридора
    const cx = Math.floor(x/this.chunkSize),
          cy = Math.floor(y/this.chunkSize),
          chunk = this.chunks.get(`${cx},${cy}`);
    if (!chunk) return false;
    const lx = x - cx*this.chunkSize,
          ly = y - cy*this.chunkSize;
    const t = chunk.tiles[ly][lx];
    return t === 'room' || t === 'hall' || t === 'door';
  }

  regenerateChunksPreserveFOV(toRegen, computeFOV, player) {
    // Ваша логика перегенерации «забытых» чанков
    // (копирование видимых или memoryAlpha>0 клеток)
  }
}