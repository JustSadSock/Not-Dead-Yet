// map.js  —— движок карты со всеми рабочими механиками
import { generateTiles } from './generators/communal.js';

export class GameMap {
  constructor(chunkSize = 32) {
    this.chunkSize  = chunkSize;          // размер чанка
    this.chunks     = new Map();          // key="cx,cy" → { tiles, meta }
    this.generating = new Set();          // чтобы не генерить дважды
  }

  // ————————— ensureChunk —————————
  ensureChunk(cx, cy) {
    const key = `${cx},${cy}`;
    if (this.chunks.has(key) || this.generating.has(key)) return;
    this.generating.add(key);

    // пустой чанк «wall»
    const S = this.chunkSize;
    const tiles = Array.from({ length: S }, () => Array(S).fill('wall'));

    // вызываем генератор конкретной карты
    generateTiles(tiles);

    // слой памяти
    const meta = Array.from({ length: S }, () =>
      Array.from({ length: S }, () => ({ memoryAlpha: 0 }))
    );

    this.chunks.set(key, { tiles, meta });
    this.generating.delete(key);
  }

  // ————————— isFloor —————————
  isFloor(gx, gy) {
    const cx = Math.floor(gx / this.chunkSize);
    const cy = Math.floor(gy / this.chunkSize);
    const chunk = this.chunks.get(`${cx},${cy}`);
    if (!chunk) return false;
    const lx = gx - cx * this.chunkSize,
          ly = gy - cy * this.chunkSize;
    const t = chunk.tiles[ly][lx];
    return t === 'room' || t === 'hall' || t === 'door';
  }

  // ————————— перегенерация забытых чанков —————————
  regenerateChunksPreserveFOV(keys, computeFOV, player) {
    const vis = computeFOV(player.x, player.y, player.angle);

    for (const key of keys) {
      const [cx, cy] = key.split(',').map(Number);
      const oldC = this.chunks.get(key);
      if (!oldC) continue;

      // сохраняем всё, что видно или не забыто
      const stash = [],
            baseX = cx * this.chunkSize,
            baseY = cy * this.chunkSize;
      for (let y = 0; y < this.chunkSize; y++) {
        for (let x = 0; x < this.chunkSize; x++) {
          const coord = `${baseX + x},${baseY + y}`;
          const m = oldC.meta[y][x];
          if (vis.has(coord) || m.memoryAlpha > 0) {
            stash.push({ x, y, t: oldC.tiles[y][x], m: { ...m } });
          }
        }
      }

      // генерим заново
      this.chunks.delete(key);
      this.ensureChunk(cx, cy);

      // возвращаем сохранённые тайлы и память
      const fresh = this.chunks.get(key);
      for (const s of stash) {
        fresh.tiles[s.y][s.x] = s.t;
        fresh.meta [s.y][s.x] = s.m;
      }
    }
  }
}

// экспорт глобально (нужно старому коду)
window.GameMap = GameMap;