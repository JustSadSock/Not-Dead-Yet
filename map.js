// map.js

/**
 * GameMap — чанковая карта с перегенерацией забытых тайлов.
 */
class GameMap {
  /**
   * @param {number} chunkSize — размер чанка в тайлах (по умолчанию 32)
   */
  constructor(chunkSize = 32) {
    this.chunkSize  = chunkSize;           // ширина/высота чанка в тайлах
    this.chunks     = new Map();           // Map<"cx,cy", { tiles: boolean[][], meta: MetaCell[][] }>
    this.generating = new Set();           // ключи чанков, которые сейчас генерируются
  }

  /**
   * Убедиться, что чанк (cx,cy) существует: если нет — создаём.
   */
  ensureChunk(cx, cy) {
    const key = `${cx},${cy}`;
    if (this.chunks.has(key) || this.generating.has(key)) return;
    this.generating.add(key);

    // 1) Генерируем новую сетку пола/стен
    const grid = this._generateChunk(cx, cy);

    // 2) Создаём массив метаданных (память, посещено)
    const meta = Array.from({ length: this.chunkSize }, () =>
      Array.from({ length: this.chunkSize }, () => ({
        memoryAlpha: 0,
        visited:     false
      }))
    );

    // 3) Сохраняем в Map и помечаем чанк готовым
    this.chunks.set(key, { tiles: grid, meta });
    this.generating.delete(key);

    // 4) Соединяем полы по границе с уже существующими соседями
    this._connectWithNeighbors(cx, cy);
  }

  /**
   * Проверка, что в глобальных координатах (x,y) — пол (внутри чанка и там true).
   */
  isFloor(x, y) {
    const cx = Math.floor(x / this.chunkSize),
          cy = Math.floor(y / this.chunkSize);
    const lx = x - cx * this.chunkSize,
          ly = y - cy * this.chunkSize;
    const c  = this.chunks.get(`${cx},${cy}`);
    if (!c) return false;
    if (lx < 0 || ly < 0 || lx >= this.chunkSize || ly >= this.chunkSize) return false;
    return c.tiles[ly][lx];
  }

  /**
   * Перегенерирует чанки из keys, сохраняя в них те тайлы, которые
   * либо ещё не угасли (memoryAlpha>0), либо попали в текущее FOV.
   *
   * @param {Set<string>} keys        — набор ключей чанков "cx,cy"
   * @param {Function}    computeFOV  — функция (px,py,ang)->Set<"x,y">
   * @param {{x:number,y:number,angle:number}} player
   */
  regenerateChunksPreserveFOV(keys, computeFOV, player) {
    // 1) Считаем текущее поле зрения
    const vis = computeFOV(player.x, player.y, player.angle);

    for (let key of keys) {
      const [cx, cy] = key.split(',').map(Number);
      const oldChunk = this.chunks.get(key);
      if (!oldChunk) continue;

      // 2) Собираем «тайлы, которые нужно сохранить»
      const stash = [];
      const baseX = cx * this.chunkSize, baseY = cy * this.chunkSize;
      for (let ly = 0; ly < this.chunkSize; ly++) {
        for (let lx = 0; lx < this.chunkSize; lx++) {
          const gx = baseX + lx, gy = baseY + ly;
          const coord = `${gx},${gy}`;
          const m     = oldChunk.meta[ly][lx];
          if (vis.has(coord) || m.memoryAlpha > 0) {
            stash.push({
              lx, ly,
              tile: oldChunk.tiles[ly][lx],
              meta: { memoryAlpha: m.memoryAlpha, visited: m.visited }
            });
          }
        }
      }

      // 3) Удаляем старый чанк
      this.chunks.delete(key);

      // 4) Генерируем заново
      this.ensureChunk(cx, cy);

      // 5) Восстанавливаем из стэша
      const fresh = this.chunks.get(key);
      for (let s of stash) {
        fresh.tiles[s.ly][s.lx] = s.tile;
        fresh.meta [s.ly][s.lx] = s.meta;
      }
    }
  }

  // ——————————————
  //   Внутренние функции
  // ——————————————

  /**
   * На границе чанка (cx,cy) «докрашивает» стены/полы так, чтобы
   * в стыке двух чанков проходы не разрывались.
   */
  _connectWithNeighbors(cx, cy) {
    const meKey = `${cx},${cy}`;
    const me    = this.chunks.get(meKey).tiles;
    const S     = this.chunkSize;
    const dirs  = [
      { dx:-1, dy: 0, meX: 0,      nbX: S-1, meY0:0, meY1:S-1 },
      { dx: 1, dy: 0, meX: S-1,    nbX: 0,   meY0:0, meY1:S-1 },
      { dx: 0, dy:-1, meY: 0,      nbY: S-1, meX0:0, meX1:S-1 },
      { dx: 0, dy: 1, meY: S-1,    nbY: 0,   meX0:0, meX1:S-1 }
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
   * Новая логика генерации чанка:
   * 1) один коридор по всей ширине/высоте (случайная ориентация),
   *    ширина = 2 клетки
   * 2) N комнат (3–6 штук), прямоугольные w×h:
   *    w∈[5..10], h∈[5..8],
   *    «врезаются» дверью в 1 клетку в коридоре,
   *    не выходят за пределы чанка
   */
  _generateChunk(cx, cy) {
    const S     = this.chunkSize;
    const grid  = Array.from({ length: S }, () => Array(S).fill(false));
    const horizontal = Math.random() < 0.5;
    const COR_W      = 2;         // ширина коридора
    let corridorCells = [];

    // — Коридор —
    if (horizontal) {
      // горизонтальный коридор
      const y0 = Math.floor(Math.random() * (S - COR_W + 1));
      for (let x = 0; x < S; x++) {
        for (let dy = 0; dy < COR_W; dy++) {
          grid[y0 + dy][x] = true;
          corridorCells.push({ x, y: y0 + dy, dir: 'v' });
        }
      }
    } else {
      // вертикальный коридор
      const x0 = Math.floor(Math.random() * (S - COR_W + 1));
      for (let y = 0; y < S; y++) {
        for (let dx = 0; dx < COR_W; dx++) {
          grid[y][x0 + dx] = true;
          corridorCells.push({ x: x0 + dx, y, dir: 'h' });
        }
      }
    }

    // — Комнаты —
    const ROOM_MIN = { w:5,  h:5 };
    const ROOM_MAX = { w:10, h:8 };
    const roomCount = 3 + Math.floor(Math.random() * 4); // 3..6

    for (let i = 0; i < roomCount; i++) {
      // случайная точка входа из коридора
      const cell = corridorCells[Math.floor(Math.random() * corridorCells.length)];
      // размеры
      const w = ROOM_MIN.w + Math.floor(Math.random() * (ROOM_MAX.w - ROOM_MIN.w + 1));
      const h = ROOM_MIN.h + Math.floor(Math.random() * (ROOM_MAX.h - ROOM_MIN.h + 1));

      if (horizontal) {
        // комната «над» или «под» коридором
        const above = Math.random() < 0.5;
        let ry = above ? cell.y - h : cell.y + 1;
        if (ry < 0)       ry = cell.y + 1;
        if (ry + h > S)   ry = cell.y - h;
        let rx = cell.x - Math.floor(w / 2);
        if (rx < 0)       rx = 0;
        if (rx + w > S)   rx = S - w;

        // вырубаем прямоугольник
        for (let yy = ry; yy < ry + h; yy++) {
          for (let xx = rx; xx < rx + w; xx++) {
            grid[yy][xx] = true;
          }
        }
        // дверь в 1 клетку
        grid[cell.y][cell.x] = true;

      } else {
        // комната «слева» или «справа» от коридора
        const left = Math.random() < 0.5;
        let rx = left ? cell.x - w : cell.x + 1;
        if (rx < 0)       rx = cell.x + 1;
        if (rx + w > S)   rx = cell.x - w;
        let ry = cell.y - Math.floor(h / 2);
        if (ry < 0)       ry = 0;
        if (ry + h > S)   ry = S - h;

        for (let yy = ry; yy < ry + h; yy++) {
          for (let xx = rx; xx < rx + w; xx++) {
            grid[yy][xx] = true;
          }
        }
        grid[cell.y][cell.x] = true;
      }
    }

    return grid;
  }
}

// сделать класс глобальным
window.GameMap = GameMap;