// map.js

/**
 * Возвращает случайное целое в диапазоне [min…max].
 */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

class GameMap {
  /**
   * @param {number} chunkSize — размер чанка в тайлах (например, 32)
   */
  constructor(chunkSize = 32) {
    this.chunkSize  = chunkSize;
    this.chunks     = new Map();
    this.generating = new Set();
  }

  /**
   * Убеждаемся, что чанк с координатами (cx, cy) существует:
   * если нет — генерируем его с N случайными комнатами
   */
  ensureChunk(cx, cy) {
    const key = `${cx},${cy}`;
    if (this.chunks.has(key) || this.generating.has(key)) return;
    this.generating.add(key);

    const S = this.chunkSize;
    // 1) полный чанк "стена"
    const tiles = Array.from({ length: S }, () => Array(S).fill('wall'));
    // 2) мета-данные для FOV и регена
    const meta = Array.from({ length: S }, () =>
      Array.from({ length: S }, () => ({ memoryAlpha: 0, visited: false }))
    );

    // 3) вырезаем от 4 до 8 комнат, каждая размером 4×4…8×8,
    //    и гарантируем вокруг каждую комнату хотя бы одним слоем стен
    const roomCount = randInt(4, 8);
    for (let i = 0; i < roomCount; i++) {
      const w = randInt(4, 8),
            h = randInt(4, 8),
            // отступ по 1 тайлу со всех сторон (чтобы стен было достаточно)
            x = randInt(1, S - w - 2),
            y = randInt(1, S - h - 2);

      // вырезаем "пол" комнаты (оставляя по краям неизменённые 'wall')
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
          tiles[yy][xx] = 'room';
        }
      }
    }

    // сохраняем чанк
    this.chunks.set(key, { tiles, meta });
    this.generating.delete(key);
  }

  /**
   * Проверяет, проходим ли тайл (gx,gy) — то есть является ли
   * он комнатой.
   */
  isFloor(gx, gy) {
    const cx = Math.floor(gx / this.chunkSize),
          cy = Math.floor(gy / this.chunkSize),
          chunk = this.chunks.get(`${cx},${cy}`);
    if (!chunk) return false;
    const lx = gx - cx * this.chunkSize,
          ly = gy - cy * this.chunkSize;
    if (lx < 0 || ly < 0 || lx >= this.chunkSize || ly >= this.chunkSize) return false;
    return chunk.tiles[ly][lx] === 'room';
  }

  /**
   * Перегенерация забытых чанков с сохранением FOV/памяти.
   * (Не меняем логику — оставляем как было.)
   */
  regenerateChunksPreserveFOV(keys, computeFOV, player) {
    const vis = computeFOV(player.x, player.y, player.angle);
    for (let key of keys) {
      const [cx, cy] = key.split(',').map(Number);
      console.log(`Re-gen chunk ${cx},${cy}`);
      const oldC = this.chunks.get(key);
      if (!oldC) continue;

      // stash тех клеток, которые в FOV или еще не забыты
      const stash = [], baseX = cx * this.chunkSize, baseY = cy * this.chunkSize;
      for (let yy = 0; yy < this.chunkSize; yy++) {
        for (let xx = 0; xx < this.chunkSize; xx++) {
          const coord = `${baseX + xx},${baseY + yy}`;
          const m = oldC.meta[yy][xx];
          if (vis.has(coord) || m.memoryAlpha > 0) {
            stash.push({ x: xx, y: yy, t: oldC.tiles[yy][xx], m: { ...m } });
          }
        }
      }

      this.chunks.delete(key);
      this.ensureChunk(cx, cy);

      const fresh = this.chunks.get(key);
      for (let s of stash) {
        fresh.tiles[s.y][s.x] = s.t;
        fresh.meta [s.y][s.x] = s.m;
      }
    }
  }
}

// делаем класс доступным глобально
window.GameMap = GameMap;