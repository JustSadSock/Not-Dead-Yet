// map.js  (Движок чанков + память)  — ничего нового, кроме импорта генератора
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

    // — шаг 1: создаём пустую S×S сетку из 'wall'
    const S = this.chunkSize;
    const tiles = Array.from({ length: S }, () => Array(S).fill('wall'));

    // — шаг 2: передаём генератору «коммуналки» порезать комнаты/коридоры/двери
    generateTiles(tiles);

    // — шаг 3: meta-слой памяти
    const meta = Array.from({ length: S }, () =>
      Array.from({ length: S }, () => ({ memoryAlpha: 0 }))
    );

    this.chunks.set(key, { tiles, meta });
    this.generating.delete(key);
  }

  /** true, если можно ходить (room|hall|door) */
  isFloor(gx, gy) {
    const cx = Math.floor(gx / this.chunkSize),
          cy = Math.floor(gy / this.chunkSize),
          chunk = this.chunks.get(`${cx},${cy}`);
    if (!chunk) return false;
    const lx = gx - cx*this.chunkSize,
          ly = gy - cy*this.chunkSize;
    const t = chunk.tiles[ly][lx];
    return t === 'room' || t === 'hall' || t === 'door';
  }

  /** ваш старый рабочий алгоритм сохранения FOV-клеток */
  regenerateChunksPreserveFOV(keys, computeFOV, player) {
    const vis = computeFOV(player.x, player.y, player.angle);

    for (const key of keys) {
      const [cx, cy] = key.split(',').map(Number);
      const oldC = this.chunks.get(key);
      if (!oldC) continue;

      const stash = [], baseX = cx*this.chunkSize, baseY = cy*this.chunkSize;
      for (let y = 0; y < this.chunkSize; y++) {
        for (let x = 0; x < this.chunkSize; x++) {
          const coord = `${baseX+x},${baseY+y}`;
          const m = oldC.meta[y][x];
          if (vis.has(coord) || m.memoryAlpha > 0) {
            stash.push({ x,y,t:oldC.tiles[y][x], m:{...m} });
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