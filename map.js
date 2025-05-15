// map.js

/**
 * GameMap — чанковая карта с регенерацией забытых тайлов.
 */
class GameMap {
  constructor() {
    // размер одного чанка (в тайлах) — должен совпадать с game.js.chunkSize
    this.chunkSize   = 32;

    // храним чанки: Map<"cx,cy", {tiles: bool[][], meta: {memoryAlpha,visited}[][]}>
    this.chunks      = new Map();

    // чтобы не генерировать один и тот же чанк дважды параллельно
    this.generating  = new Set();
  }

  /**
   * Убедиться, что чанк (cx,cy) есть в this.chunks.
   * Если нет — сгенерировать сразу tiles и meta.
   */
  ensureChunk(cx, cy) {
    const key = `${cx},${cy}`;
    if (this.chunks.has(key) || this.generating.has(key)) return;
    this.generating.add(key);

    // 1) Генерим саму сетку пола/стен
    const tiles = this._generateChunk(cx, cy);

    // 2) Создаём пустой meta-массив с memoryAlpha=0, visited=false
    const meta = Array.from({ length: this.chunkSize }, () =>
      Array.from({ length: this.chunkSize }, () => ({
        memoryAlpha: 0,
        visited:     false
      }))
    );

    // 3) Сохраняем
    this.chunks.set(key, { tiles, meta });
    this.generating.delete(key);
  }

  /**
   * Проверка, можно ли ходить по глобальным координатам (gx,gy).
   * Возвращает true, если внутри чанка и в tiles[ly][lx] = true (пол).
   */
  isFloor(gx, gy) {
    const cx = Math.floor(gx / this.chunkSize);
    const cy = Math.floor(gy / this.chunkSize);
    const key = `${cx},${cy}`;
    const chunk = this.chunks.get(key);
    if (!chunk) return false;
    const lx = gx - cx * this.chunkSize;
    const ly = gy - cy * this.chunkSize;
    if (lx < 0 || ly < 0 || lx >= this.chunkSize || ly >= this.chunkSize) return false;
    return !!chunk.tiles[ly][lx];
  }

  /**
   * Пакетная перегенерация тех чанков, ключи которых в keys:
   * — сохраняем все тайлы и meta, где либо в FOV, либо memoryAlpha>0
   * — удаляем старый чанк
   * — генерируем новый (ensureChunk)
   * — заливаем туда сохранённые tile/meta
   */
  regenerateChunksPreserveFOV(keys, computeFOV, player) {
    // сначала FOV текущей позиции
    const vis = computeFOV(player.x, player.y, player.angle);

    for (let key of keys) {
      const [cx, cy] = key.split(',').map(Number);
      const oldChunk = this.chunks.get(key);
      if (!oldChunk) continue;

      // 1) стэшируем все "видимые" или "ещё не потухшие" квадратики
      const stash = [];
      const baseX = cx * this.chunkSize;
      const baseY = cy * this.chunkSize;
      for (let ly = 0; ly < this.chunkSize; ly++) {
        for (let lx = 0; lx < this.chunkSize; lx++) {
          const gx = baseX + lx, gy = baseY + ly;
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

      // 2) удаляем старый
      this.chunks.delete(key);

      // 3) генерим снова
      this.ensureChunk(cx, cy);

      // 4) возвращаем сохранённые квадратики
      const fresh = this.chunks.get(key);
      for (let s of stash) {
        fresh.tiles[s.ly][s.lx] = s.tile;
        fresh.meta [s.ly][s.lx] = s.meta;
      }
    }
  }

  // ————————
  // Внутренние вспомогательные
  // ————————

  /**
   * Процедурная генерация одного чанка cx,cy:
   * — строим лабиринт на N×N клетках методом spanning-tree
   * — раскладываем его в actualTiles через 3×3 масштаб
   * Возвращает Boolean[][] размером chunkSize×chunkSize.
   */
  _generateChunk(cx, cy) {
    const N    = 11;   // размер «маппинга» комн/коридоров
    const S    = this.chunkSize;
    // пустая сетка
    const grid = Array.from({ length: S }, () => Array(S).fill(false));

    // 1) spanning-tree на N×N
    const conn    = Array.from({ length: N }, () =>
      Array.from({ length: N }, () => ({ N:0,S:0,E:0,W:0 }))
    );
    const visited = Array.from({ length: N }, () => Array(N).fill(false));
    const stack   = [{ x: Math.floor(N/2), y: Math.floor(N/2) }];
    visited[stack[0].y][stack[0].x] = true;

    while (stack.length) {
      const top = stack[stack.length-1];
      const nbr = [];
      if (top.y>0   && !visited[top.y-1][top.x]) nbr.push('N');
      if (top.y<N-1 && !visited[top.y+1][top.x]) nbr.push('S');
      if (top.x>0   && !visited[top.y][top.x-1]) nbr.push('W');
      if (top.x<N-1 && !visited[top.y][top.x+1]) nbr.push('E');

      if (nbr.length) {
        const d = nbr[Math.floor(Math.random()*nbr.length)];
        let nx = top.x, ny = top.y;
        if (d==='N') ny--;
        if (d==='S') ny++;
        if (d==='W') nx--;
        if (d==='E') nx++;
        conn[top.y][top.x][d] = 1;
        conn[ny][nx][{N:'S',S:'N',E:'W',W:'E'}[d]] = 1;
        visited[ny][nx] = true;
        stack.push({ x: nx, y: ny });
      } else {
        stack.pop();
      }
    }

    // 2) масштабируем N×N → chunkSize×chunkSize
    //    каждый блок N→3×3 тайла, плюс коридоры
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const bx = i*3, by = j*3;
        // всегда 2×2 «комната»
        grid[by][bx]     = true;
        grid[by][bx+1]   = true;
        grid[by+1][bx]   = true;
        grid[by+1][bx+1] = true;
        // если есть связь на восток — 2×1 коридор
        if (conn[j][i].E) {
          grid[by][bx+2]   = true;
          grid[by+1][bx+2] = true;
        }
        // если связь на юг — 1×2 коридор
        if (conn[j][i].S) {
          grid[by+2][bx]   = true;
          grid[by+2][bx+1] = true;
        }
      }
    }

    return grid;
  }
}

// делаем доступным в глобальной области, чтобы game.js увидел
window.GameMap = GameMap;