// map.js
//
// Процедурная «квартира-лабиринт» на чанках 32×32
// Типы тайлов:
//   'hall'  — коридор (проходимо)
//   'door'  — дверной проём (проходимо)
//   'room'  — помещение (проходимо)
//   'wall'  — стена (НЕ проходимо)

class GameMap {
  constructor () {
    this.chunkSize = 32;                     // == game.js.chunkSize
    this.chunks    = new Map();              // Map<"cx,cy", {tiles,meta}>
    this.generating = new Set();             // чтобы не генерить дважды
  }

  // ---------- Публичное API -------------------------------------------------

  /** убедиться, что чанк (cx,cy) существует */
  ensureChunk (cx, cy) {
    const key = `${cx},${cy}`;
    if (this.chunks.has(key) || this.generating.has(key)) return;
    this.generating.add(key);

    const tiles = this._generateChunk(cx, cy);

    const meta = Array.from({ length: this.chunkSize }, () =>
      Array.from({ length: this.chunkSize }, () => ({
        memoryAlpha : 0,
        visited     : false,
      }))
    );

    this.chunks.set(key, { tiles, meta });
    this.generating.delete(key);
  }

  /** true, если глобальный тайл проходимый */
  isFloor (gx, gy) {
    const cx = Math.floor(gx / this.chunkSize);
    const cy = Math.floor(gy / this.chunkSize);
    const chunk = this.chunks.get(`${cx},${cy}`);
    if (!chunk) return false;
    const lx = gx - cx * this.chunkSize;
    const ly = gy - cy * this.chunkSize;
    if (lx < 0 || ly < 0 || lx >= this.chunkSize || ly >= this.chunkSize) return false;

    const t = chunk.tiles[ly][lx];
    return t === 'hall' || t === 'door' || t === 'room';
  }

  /** пакетная регенерация (сохраняем FOV) */
  regenerateChunksPreserveFOV (keys, computeFOV, player) {
    const vis = computeFOV(player.x, player.y, player.angle);

    for (const key of keys) {
      const [cx, cy] = key.split(',').map(Number);
      const old = this.chunks.get(key);
      if (!old) continue;

      const stash = [];
      const bx = cx * this.chunkSize, by = cy * this.chunkSize;

      for (let y = 0; y < this.chunkSize; y++)
        for (let x = 0; x < this.chunkSize; x++) {
          const gx = bx + x, gy = by + y;
          const m  = old.meta[y][x];
          if (vis.has(`${gx},${gy}`) || m.memoryAlpha > 0) {
            stash.push({ x, y, tile: old.tiles[y][x], meta: { ...m } });
          }
        }

      this.chunks.delete(key);
      this.ensureChunk(cx, cy);

      const fresh = this.chunks.get(key);
      for (const s of stash) {
        fresh.tiles[s.y][s.x] = s.tile;
        fresh.meta [s.y][s.x] = s.meta;
      }
    }
  }

  // ---------- Внутренности генерации ---------------------------------------

  /**
   * Генерируем чанк 32×32:
   *  1. На вспомогательной сетке 11×11 строим spanning-tree
   *  2. Каждая «комната» 2×2 клетки и масштаб 3×3 → даёт коридоры 2-клеточной толщины
   *  3. По правилам расставляем 'door' и гарантируем отсутствие диагональных проходов
   */
  _generateChunk (cx, cy) {
    const N = 11;                              // размер вспом. сетки
    const S = this.chunkSize;
    const tiles = Array.from({ length: S }, () => Array(S).fill('wall'));

    // --- 1. spanning-tree на 11×11 -----------------------------------------
    const conn    = Array.from({ length: N },
                  () => Array.from({ length: N },
                  () => ({ N:0,S:0,E:0,W:0 })));
    const vis = Array.from({ length: N }, () => Array(N).fill(false));

    const stack = [{ x: (N/2)|0, y: (N/2)|0 }];
    vis[stack[0].y][stack[0].x] = true;

    const dirDX = { N:0, S:0, W:-1, E:1 };
    const dirDY = { N:-1, S:1, W:0, E:0 };
    const opposite = { N:'S', S:'N', W:'E', E:'W' };

    while (stack.length) {
      const top = stack.at(-1);
      const nd = [];
      if (top.y>0   && !vis[top.y-1][top.x]) nd.push('N');
      if (top.y<N-1 && !vis[top.y+1][top.x]) nd.push('S');
      if (top.x>0   && !vis[top.y][top.x-1]) nd.push('W');
      if (top.x<N-1 && !vis[top.y][top.x+1]) nd.push('E');

      if (nd.length) {
        const d = nd[Math.random()*nd.length|0];
        const nx = top.x + dirDX[d];
        const ny = top.y + dirDY[d];
        conn[top.y][top.x][d] = 1;
        conn[ny][nx][opposite[d]] = 1;
        vis[ny][nx] = true;
        stack.push({ x:nx, y:ny });
      } else {
        stack.pop();
      }
    }

    // --- 2. Раскладываем 11×11 → 32×32 -------------------------------------
    // каждая ячейка 3×3: 2×2 «комната» + коридоры-толстые 2 клетки
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const bx = i*3, by = j*3;

        // ядро комнаты 2×2
        tiles[by  ][bx  ] = 'room';
        tiles[by  ][bx+1] = 'room';
        tiles[by+1][bx  ] = 'room';
        tiles[by+1][bx+1] = 'room';

        // связь E → дверь 2 клетки + коридор 2 клетки
        if (conn[j][i].E) {
          tiles[by  ][bx+2] = 'door';
          tiles[by+1][bx+2] = 'door';
          tiles[by  ][bx+3] = 'hall';
          tiles[by+1][bx+3] = 'hall';
        }

        // связь S → дверь 2 клетки + коридор 2 клетки
        if (conn[j][i].S) {
          tiles[by+2][bx  ] = 'door';
          tiles[by+2][bx+1] = 'door';
          tiles[by+3][bx  ] = 'hall';
          tiles[by+3][bx+1] = 'hall';
        }
      }
    }

    // --- 3. Убираем одиночные диагонали ------------------------------------
    for (let y = 1; y < S; y++) {
      for (let x = 1; x < S; x++) {
        // если (x,y) и (x-1,y-1) оба проходимы, а соседи по +X и +Y — стены,
        // заполняем один из диагональных тайлов стеной, чтоб не было «угла»
        const a = tiles[y  ][x  ], b = tiles[y-1][x-1];
        if (this._pass(a) && this._pass(b) &&
            !this._pass(tiles[y-1][x ]) && !this._pass(tiles[y][x-1])) {
          tiles[y][x] = 'wall';      // ломаем диагональ
        }
      }
    }

    return tiles;
  }

  _pass (t) { return t==='hall'||t==='door'||t==='room'; }
}

window.GameMap = GameMap;