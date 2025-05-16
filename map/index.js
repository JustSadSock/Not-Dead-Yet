// map/index.js
//
// Главный модуль карты — собирает «сырую» генерацию и валидацию,
// предоставляет единый класс GameMap для game.js

import { buildRawChunk } from './generator.js';
import { applyRules     } from './validator.js';

export class GameMap {
  constructor() {
    this.chunkSize   = 32;           // должен совпадать с game.js
    this.chunks      = new Map();    // Map<"cx,cy", { tiles, meta }>
    this.generating  = new Set();    // ключи чанков в процессе генерации
  }

  /**
   * Убедиться, что чанк (cx,cy) сгенерирован:
   * 1) buildRawChunk() — чистая сетка 'wall'/'room' без коридоров
   * 2) applyRules()     — двери, коридоры, валидация по всем вашим условиям
   */
  ensureChunk(cx, cy) {
    const key = `${cx},${cy}`;
    if (this.chunks.has(key) || this.generating.has(key)) return;
    this.generating.add(key);

    // 1) черновая раскладка комнат (типы 'wall'/'room')
    let tiles = buildRawChunk(this.chunkSize);

    // 2) применить все правила: коридоры, двери, валидация
    tiles = applyRules(tiles, this.chunkSize);

    // 3) метаданные для памяти/FOV
    const meta = Array.from({ length: this.chunkSize }, () =>
      Array.from({ length: this.chunkSize }, () => ({
        memoryAlpha: 0,
        visited:     false
      }))
    );

    this.chunks.set(key, { tiles, meta });
    this.generating.delete(key);
  }

  /** true, если глобальный тайл (gx,gy) проходим (room/hall/door) */
  isFloor(gx, gy) {
    const cx = Math.floor(gx / this.chunkSize),
          cy = Math.floor(gy / this.chunkSize),
          chunk = this.chunks.get(`${cx},${cy}`);
    if (!chunk) return false;

    const lx = gx - cx * this.chunkSize,
          ly = gy - cy * this.chunkSize;
    if (lx < 0 || ly < 0 || lx >= this.chunkSize || ly >= this.chunkSize) return false;

    const t = chunk.tiles[ly][lx];
    return t === 'room' || t === 'hall' || t === 'door';
  }

  /**
   * Пакетная регенерация чанков:
   * сохраняем все тайлы, которые либо в видимости (FOV), либо ещё не потухли,
   * удаляем старый чанк, вызываем ensureChunk, возвращаем сохранённое.
   */
  regenerateChunksPreserveFOV(keys, computeFOV, player) {
    const vis = computeFOV(player.x, player.y, player.angle);

    for (const key of keys) {
      const [cx, cy] = key.split(',').map(Number);
      const oldChunk = this.chunks.get(key);
      if (!oldChunk) continue;

      // стэшируем «живые» тайлы
      const stash = [];
      const bx = cx * this.chunkSize, by = cy * this.chunkSize;
      for (let y = 0; y < this.chunkSize; y++) {
        for (let x = 0; x < this.chunkSize; x++) {
          const gx = bx + x, gy = by + y;
          const m  = oldChunk.meta[y][x];
          if (vis.has(`${gx},${gy}`) || m.memoryAlpha > 0) {
            stash.push({ x, y, tile: oldChunk.tiles[y][x], meta: { ...m } });
          }
        }
      }

      // реген
      this.chunks.delete(key);
      this.ensureChunk(cx, cy);
      const fresh = this.chunks.get(key);

      // восстанавливаем
      for (const s of stash) {
        fresh.tiles[s.y][s.x] = s.tile;
        fresh.meta [s.y][s.x] = s.meta;
      }
    }
  }
}

// чтобы game.js мог получить класс через window.GameMap
window.GameMap = GameMap;
