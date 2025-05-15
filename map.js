// map.js

/**
 * GameMap — чанковая карта с перегенерацией забытых тайлов.
 */
class GameMap {
  /**
   * @param {number} chunkSize — размер чанка в тайлах (например, 30)
   */
  constructor(chunkSize = 30) {
    this.chunkSize  = chunkSize;       // ширина/высота чанка в тайлах
    this.chunks     = new Map();       // Map<"cx,cy", { tiles: boolean[][], meta: Meta[][] }>
    this.generating = new Set();       // пока в процессе генерации
  }

  /**
   * Убедиться, что чанк (cx, cy) существует; если нет — создать.
   * Никаких ограничений на отрицательные cx/cy.
   */
  ensureChunk(cx, cy) {
    const key = `${cx},${cy}`;
    if (this.chunks.has(key) || this.generating.has(key)) return;
    this.generating.add(key);

    // 1) Генерируем новую сетку пола/стен
    const grid = this._generateChunk(cx, cy);

    // 2) Создаём метаданные (memoryAlpha, visited)
    const meta = Array.from({ length: this.chunkSize }, () =>
      Array.from({ length: this.chunkSize }, () => ({
        memoryAlpha: 0,
        visited:     false
      }))
    );

    // 3) Сохраняем
    this.chunks.set(key, { tiles: grid, meta });
    this.generating.delete(key);

    // 4) Подцепляем границы к уже существующим соседям
    this._connectWithNeighbors(cx, cy);
  }

  /**
   * Проверка: в (x,y) — пол? (если вне чанков — считаем стеной)
   */
  isFloor(x, y) {
    const cx = Math.floor(x / this.chunkSize);
    const cy = Math.floor(y / this.chunkSize);
    const lx = x - cx * this.chunkSize;
    const ly = y - cy * this.chunkSize;
    const chunk = this.chunks.get(`${cx},${cy}`);
    if (!chunk) return false;
    if (lx < 0 || ly < 0 || lx >= this.chunkSize || ly >= this.chunkSize) return false;
    return chunk.tiles[ly][lx];
  }

  /**
   * Перегенерирует все чанки из `keys`, сохраняя:
   *  - видимые в FOV тайлы,
   *  - тайлы с memoryAlpha > 0 (т.е. «забытые, но ещё горящие»).
   */
  regenerateChunksPreserveFOV(keys, computeFOV, player) {
    const vis = computeFOV(player.x, player.y, player.angle);

    for (let key of keys) {
      const [cx, cy] = key.split(',').map(Number);
      const oldChunk = this.chunks.get(key);
      if (!oldChunk) continue;

      // 1) Собираем «в стэш» все нужные tile/meta
      const stash = [];
      const baseX = cx * this.chunkSize;
      const baseY = cy * this.chunkSize;
      for (let gy = baseY; gy < baseY + this.chunkSize; gy++) {
        for (let gx = baseX; gx < baseX + this.chunkSize; gx++) {
          const lx = gx - baseX, ly = gy - baseY;
          const m   = oldChunk.meta[ly][lx];
          const coord = `${gx},${gy}`;
          if (vis.has(coord) || m.memoryAlpha > 0) {
            stash.push({
              lx, ly,
              tile: oldChunk.tiles[ly][lx],
              meta: { memoryAlpha: m.memoryAlpha, visited: m.visited }
            });
          }
        }
      }

      // 2) Удаляем старый чанк
      this.chunks.delete(key);

      // 3) Генерим заново
      this.ensureChunk(cx, cy);

      // 4) Копируем назад из стэша
      const fresh = this.chunks.get(key);
      for (let s of stash) {
        fresh.tiles[s.ly][s.lx] = s.tile;
        fresh.meta [s.ly][s.lx] = s.meta;
      }
    }
  }

  // ————— ВНУТРЕННИЕ МЕТОДЫ —————

  /**
   * Соединяем текущий чанк (cx,cy) с уже существующими в 4-х соседних направлениях.
   */
  _connectWithNeighbors(cx, cy) {
    const meKey = `${cx},${cy}`;
    const size  = this.chunkSize;
    const me    = this.chunks.get(meKey).tiles;
    const dirs = [
      { dx:-1, dy: 0, meX: 0,      nbX: size-1, meY0: 0,      meY1: size-1 },
      { dx: 1, dy: 0, meX: size-1, nbX: 0,      meY0: 0,      meY1: size-1 },
      { dx: 0, dy:-1, meY: 0,      nbY: size-1, meX0: 0,      meX1: size-1 },
      { dx: 0, dy: 1, meY: size-1, nbY: 0,      meX0: 0,      meX1: size-1 }
    ];

    for (let d of dirs) {
      const nbKey = `${cx + d.dx},${cy + d.dy}`;
      if (!this.chunks.has(nbKey)) continue;
      const nb = this.chunks.get(nbKey).tiles;

      if (d.dx !== 0) {
        for (let y = d.meY0; y <= d.meY1; y++) {
          if (me[y][d.meX] && !nb[y][d.nbX]) nb[y][d.nbX] = true;
          if (nb[y][d.nbX] && !me[y][d.meX]) me[y][d.meX] = true;
        }
      } else {
        for (let x = d.meX0; x <= d.meX1; x++) {
          if (me[d.meY][x] && !nb[d.nbY][x]) nb[d.nbY][x] = true;
          if (nb[d.nbY][x] && !me[d.meY][x]) me[d.meY][x] = true;
        }
      }
    }
  }

  /**
   * Генерирует один чанк (cx, cy):
   *  - делает пустую сетку `size×size`,
   *  - рисует дваширинные коридоры (вертикальный + горизонтальный),
   *    с периодическими «jog»-сдвигами,
   *  - возвращает булевую матрицу `tiles[y][x]`.
   */
  _generateChunk(cx, cy) {
    const S    = this.chunkSize;
    const grid = Array.from({ length: S }, () => Array(S).fill(false));
    const rng  = this._mulberry32((cx * 0x9E3779B1) ^ (cy << 16));

    // начальные позиции «прожорных» коридоров
    let crossX = Math.floor(S/2);
    let crossY = Math.floor(S/2);

    // вертикальный коридор (2-тайла шириной)
    let segV = 0, jogRight = true;
    for (let y = 0; y < S; y++) {
      grid[y][crossX]   = true;
      grid[y][crossX+1] = true;
      segV++;
      if (segV >= 25 && y < S-2) {
        const dir = jogRight ? 1 : -1;
        if (crossX+dir >= 1 && crossX+dir+1 < S) {
          grid[y][crossX+dir]   = true;
          grid[y][crossX+dir+1] = true;
          crossX += dir;
        }
        segV = 0;
        jogRight = !jogRight;
      }
    }

    // горизонтальный коридор (2-тайла высотой)
    let segH = 0, jogDown = true;
    for (let x = 0; x < S; x++) {
      grid[crossY][x]   = true;
      grid[crossY+1][x] = true;
      segH++;
      if (segH >= 25 && x < S-2) {
        const dir = jogDown ? 1 : -1;
        if (crossY+dir >= 1 && crossY+dir+1 < S) {
          grid[crossY+dir][x]   = true;
          grid[crossY+dir+1][x] = true;
          crossY += dir;
        }
        segH = 0;
        jogDown = !jogDown;
      }
    }

    return grid;
  }

  /**
   * Простая Mulberry32-фабрика для детерминированного рандома
   */
  _mulberry32(seed) {
    return function() {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
}

window.GameMap = GameMap;