// map.js
//
// Чанковый движок карты + память + «автопроверка чанка».
//  ✓ ensureChunk генерирует чанк, вызывая generators/communal.js
//  ✓ после генерации вызывает chunkIsValid() из validator.js
//    и, если правила нарушены, пере-генерирует до 10 раз.
//  ✓ остальная логика (isFloor, regenerateChunksPreserveFOV) —
//    как в проверенной рабочей версии.

import { generateTiles } from './generators/communal.js';
import { chunkIsValid }  from './generators/validator.js';

export class GameMap {
  constructor(chunkSize = 32) {
    this.chunkSize  = chunkSize;
    this.chunks     = new Map();          // key="cx,cy" → {tiles,meta}
    this.generating = new Set();          // защита от двойного вызова
  }

  /* ───────── ensureChunk ───────── */
  ensureChunk(cx, cy) {
    const key = `${cx},${cy}`;
    if (this.chunks.has(key) || this.generating.has(key)) return;
    this.generating.add(key);

    const S = this.chunkSize;
    const tiles = Array.from({ length: S }, () => Array(S).fill('wall'));

    /* — генерация с автопроверкой — */
    let tries = 0;
    do {
      /* обнуляем tiles до wall перед каждой попыткой */
      for (let y = 0; y < S; y++) tiles[y].fill('wall');
      generateTiles(tiles);               // генерируем «коммуналку»
      tries++;
    } while (!chunkIsValid(tiles) && tries < 10);

    /* meta-слой fade memory */
    const meta = Array.from({ length: S }, () =>
      Array.from({ length: S }, () => ({ memoryAlpha: 0 }))
    );

    this.chunks.set(key, { tiles, meta });
    this.generating.delete(key);
  }

  /* ───────── isFloor ───────── */
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

  /* ───────── перегенерация с сохранением FOV ───────── */
  regenerateChunksPreserveFOV(keys, computeFOV, player) {
    const vis = computeFOV(player.x, player.y, player.angle);

    for (const key of keys) {
      const [cx, cy] = key.split(',').map(Number);
      const oldC = this.chunks.get(key);
      if (!oldC) continue;

      /* stash видимых + fade>0 тайлов */
      const stash = [];
      const baseX = cx * this.chunkSize, baseY = cy * this.chunkSize;
      for (let y = 0; y < this.chunkSize; y++) {
        for (let x = 0; x < this.chunkSize; x++) {
          const coord = `${baseX + x},${baseY + y}`;
          const m = oldC.meta[y][x];
          if (vis.has(coord) || m.memoryAlpha > 0) {
            stash.push({ x, y, t: oldC.tiles[y][x], m: { ...m } });
          }
        }
      }

      /* генерируем заново (с проверкой) */
      this.chunks.delete(key);
      this.ensureChunk(cx, cy);

      /* возвращаем сохранённые клетки */
      const fresh = this.chunks.get(key);
      for (const s of stash) {
        fresh.tiles[s.y][s.x] = s.t;
        fresh.meta [s.y][s.x] = s.m;
      }
    }
  }
}

/* legacy global (если где-то нужно) */
window.GameMap = GameMap;
