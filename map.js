// map.js

import { generateTiles } from './generators/communal.js';

export class GameMap {
  constructor(chunkSize = 32) {
    this.chunkSize  = chunkSize;
    this.chunks     = new Map();
    this.generating = new Set();
  }

  ensureChunk(cx, cy) {
    const key = `${cx},${cy}`;
    if (this.chunks.has(key) || this.generating.has(key)) return;
    this.generating.add(key);

    // 1) создаём S×S из 'wall'
    const tiles = Array.from({ length: this.chunkSize }, () =>
      Array(this.chunkSize).fill('wall')
    );
    // 2) вызываем конкретный генератор уровней
    const rooms = generateTiles(tiles);

    // 3) meta-слой для памяти
    const meta = Array.from({ length: this.chunkSize }, () =>
      Array.from({ length: this.chunkSize }, () => ({ memoryAlpha: 0 }))
    );

    this.chunks.set(key, { tiles, meta, rooms });
    this.generating.delete(key);
  }

  isFloor(x, y) {
    const cx = Math.floor(x / this.chunkSize),
          cy = Math.floor(y / this.chunkSize),
          chunk = this.chunks.get(`${cx},${cy}`);
    if (!chunk) return false;
    const lx = x - cx * this.chunkSize,
          ly = y - cy * this.chunkSize;
    const t = chunk.tiles[ly][lx];
    return t === 'room' || t === 'hall' || t === 'door';
  }

  regenerateChunksPreserveFOV(keys, computeFOV, player) {
    const vis = computeFOV(player.x, player.y, player.angle);

    for (const key of keys) {
      const [cx, cy] = key.split(',').map(Number);
      console.log(`Re-gen chunk ${cx},${cy}`);
      const oldC = this.chunks.get(key);
      if (!oldC) continue;

      const stash = [], baseX = cx * this.chunkSize, baseY = cy * this.chunkSize;
      for (let y = 0; y < this.chunkSize; y++) {
        for (let x = 0; x < this.chunkSize; x++) {
          const coord = `${baseX + x},${baseY + y}`;
          const m     = oldC.meta[y][x];
          if (vis.has(coord) || m.memoryAlpha > 0) {
            stash.push({ x, y, t: oldC.tiles[y][x], m: { ...m } });
          }
        }
      }

      this.chunks.delete(key);
      this.ensureChunk(cx, cy);
      const fresh = this.chunks.get(key);
      for (const s of stash) {
        fresh.tiles[s.y][s.x] = s.t;
        fresh.meta [s.y][s.x] = s.m;
      }
    }
  }
}