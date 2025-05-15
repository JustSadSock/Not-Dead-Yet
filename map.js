// map.js

/**
 * GameMap — чанковая карта с перегенерацией забытых тайлов.
 */
class GameMap {
  constructor() {
    this.chunkSize   = 32;           // размер чанка в тайлах
    this.chunks      = new Map();    // Map<"cx,cy", {tiles, meta}>
    this.generating  = new Set();    // чанки в процессе генерации
    this.currentChunkX = null;
    this.currentChunkY = null;
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

    // 2) Создаём массив метаданных
    const meta = [];
    for (let y = 0; y < this.chunkSize; y++) {
      meta[y] = [];
      for (let x = 0; x < this.chunkSize; x++) {
        meta[y][x] = {
          memoryAlpha: 0,
          visited:     false
        };
      }
    }

    // 3) Сохраняем в Map
    this.chunks.set(key, { tiles: grid, meta: meta });
    this.generating.delete(key);

    // 4) Соединяем с уже существующими соседями
    this._connectWithNeighbors(cx, cy);
  }

  /**
   * Проверка, можно ли в (x,y) ходить (пол).
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
   * Забыть все чанки дальше чем в 1 чанке от (cx,cy).
   */
  forgetDistantChunks(cx, cy) {
    for (let key of this.chunks.keys()) {
      const [ccx, ccy] = key.split(',').map(Number);
      if (Math.abs(ccx - cx) > 1 || Math.abs(ccy - cy) > 1) {
        this.chunks.delete(key);
      }
    }
  }

  /**
   * Перегенерирует чанки из keys, сохраняя FOV-тайлы и все ещё не потухшие тайлы.
   * keys — Set<"cx,cy">.
   * computeFOV(x,y,angle) → Set<"gx,gy">.
   * player = {x,y,angle}.
   */
  regenerateChunksPreserveFOV(keys, computeFOV, player) {
    const vis = computeFOV(player.x, player.y, player.angle);

    for (let key of keys) {
      const [cx, cy] = key.split(',').map(Number);
      const oldChunk  = this.chunks.get(key);
      if (!oldChunk) continue;

      // 1) Сохраняем в стэш все tile/meta, где либо в FOV, либо memoryAlpha>0
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

      // 3) Генерируем заново
      this.ensureChunk(cx, cy);

      // 4) Восстанавливаем сохранённые tile/meta
      const fresh = this.chunks.get(key);
      for (let s of stash) {
        fresh.tiles[s.ly][s.lx] = s.tile;
        fresh.meta [s.ly][s.lx] = s.meta;
      }
    }
  }

  // ————————
  // Внутренние функции
  // ————————

  _connectWithNeighbors(cx, cy) {
    const meKey = `${cx},${cy}`;
    const me    = this.chunks.get(meKey).tiles;
    const size  = this.chunkSize;
    const dirs  = [
      {dx:-1, dy:0, meX:0,          nbX:size-1, meY0:0,    meY1:size-1},
      {dx: 1, dy:0, meX:size-1,     nbX:0,       meY0:0,    meY1:size-1},
      {dx:0,  dy:-1, meY:0,         nbY:size-1, meX0:0,    meX1:size-1},
      {dx:0,  dy: 1, meY:size-1,    nbY:0,       meX0:0,    meX1:size-1}
    ];
    for (let d of dirs) {
      const nbKey = `${cx+d.dx},${cy+d.dy}`;
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

  _generateChunk(cx, cy) {
    const N    = 11;
    const size = this.chunkSize;
    const grid = Array.from({length:size}, ()=>Array(size).fill(false));

    // carve spanning tree на N×N
    const conn    = Array.from({length:N}, ()=>Array.from({length:N}, ()=>({N:0,S:0,E:0,W:0})));
    const visited = Array.from({length:N}, ()=>Array(N).fill(false));
    const stack   = [{x:Math.floor(N/2), y:Math.floor(N/2)}];
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
        conn[ny][nx][{'N':'S','S':'N','E':'W','W':'E'}[d]] = 1;
        visited[ny][nx] = true;
        stack.push({x:nx,y:ny});
      } else {
        stack.pop();
      }
    }

    // маппинг N×N в тайлы
    for (let j=0; j<N; j++) {
      for (let i=0; i<N; i++) {
        const bx = i*3, by = j*3;
        // 2×2
        grid[by][bx]     = true;
        grid[by][bx+1]   = true;
        grid[by+1][bx]   = true;
        grid[by+1][bx+1] = true;
        if (conn[j][i].E) {
          grid[by][bx+2]   = true;
          grid[by+1][bx+2] = true;
        }
        if (conn[j][i].S) {
          grid[by+2][bx]   = true;
          grid[by+2][bx+1] = true;
        }
      }
    }

    return grid;
  }
}

window.GameMap = GameMap;