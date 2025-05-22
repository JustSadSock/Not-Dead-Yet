// map.js
//
// Движок чанков + память + перегенерация
// ВЗЯТ из полностью рабочей версии, только генерация
// вынесена во внешний модуль ./generators/communal.js

import { generateTiles } from './generators/communal.js';

export class GameMap {
  constructor(chunkSize = 32) {
    this.chunkSize  = chunkSize;   // размер чанка, в тайлах
    this.chunks     = new Map();   // key = "cx,cy" → { tiles, meta }
    this.generating = new Set();   // чтобы не дублировать генерацию
  }

  /** Убедиться, что чанк (cx,cy) существует. */
  ensureChunk(cx, cy) {
    const key = `${cx},${cy}`;
    if (this.chunks.has(key) || this.generating.has(key)) return;
    this.generating.add(key);

    // 1) создаём S×S массив 'wall'
    const S = this.chunkSize;
    const tiles = Array.from({ length: S }, () => Array(S).fill('wall'));

    // 2) вызываем генератор конкретной карты (коммуналки)
    generateTiles(tiles);

    // 3) meta-слой для fade memory
    const meta = Array.from({ length: S }, () =>
      Array.from({ length: S }, () => ({ memoryAlpha: 0 }))
    );

    this.chunks.set(key, { tiles, meta });
    this.generating.delete(key);
  }

  /** true, если тайл (gx,gy) проходимый (room, hall или door) */
  isFloor(gx, gy) {
    const cx = Math.floor(gx / this.chunkSize),
          cy = Math.floor(gy / this.chunkSize),
          chunk = this.chunks.get(`${cx},${cy}`);
    if (!chunk) return false;
    const lx = gx - cx * this.chunkSize,
          ly = gy - cy * this.chunkSize;
    const t = chunk.tiles[ly][lx];
    return (t === 'room' || t === 'hall' || t === 'door');
  }

  /**
   * Перегенерация чанков, находящихся в 'keys', при этом
   * клетки, которые игрок видит (или ещё помнит), копируются.
   *
   * @param {string[]} keys — массив ключей чанков "cx,cy"
   * @param {function} computeFOV — функция (px,py,ang) → Set("gx,gy")
   * @param {object}   player — { x, y, ang }
   */
  regenerateChunksPreserveFOV(keys, computeFOV, player) {
    const vis = computeFOV(player.x, player.y, player.ang);

    for (const key of keys) {
      const [cx, cy] = key.split(',').map(Number);
      const oldC = this.chunks.get(key);
      if (!oldC) continue;

      // — копируем все клетки, которые игрок видит или ещё «помнит»
      const stash = [];
      const baseX = cx * this.chunkSize,
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

      // — генерируем чанк заново
      this.chunks.delete(key);
      this.ensureChunk(cx, cy);

      // — возвращаем сохранённые тайлы и память
      const fresh = this.chunks.get(key);
      for (const s of stash) {
        fresh.tiles[s.y][s.x] = s.t;
        fresh.meta [s.y][s.x] = s.m;
      }
    }
  }
}

// делаем класс доступным глобально (для старых модулей)
window.GameMap = GameMap;