// map.js

/**
 * GameMap — чанковая карта с коридорами + прямоугольными комнатами,
 * отделёнными стеной и соединёнными дверью (1–2 тайла), плюс перегенерация забытых тайлов.
 */
class GameMap {
  /**
   * @param {number} chunkSize — размер чанка в тайлах (высота=ширина).
   */
  constructor(chunkSize = 30) {
    this.chunkSize  = chunkSize;
    this.chunks     = new Map();    // Map<"cx,cy", { tiles, meta }>
    this.generating = new Set();    // чанки, которые уже в процессе ensureChunk
  }

  /**
   * Убедиться, что чанк (cx,cy) есть; если нет — сгенерить.
   */
  ensureChunk(cx, cy) {
    const key = `${cx},${cy}`;
    if (this.chunks.has(key) || this.generating.has(key)) return;
    this.generating.add(key);

    // 1) срезолвить новый grid пола/стен
    const tiles = this._generateChunk(cx, cy);

    // 2) сбросить meta (memoryAlpha + visited)
    const meta = Array.from({length:this.chunkSize}, ()=>{
      return Array.from({length:this.chunkSize}, ()=>({
        memoryAlpha: 0,
        visited:     false
      }));
    });

    // 3) сохранить
    this.chunks.set(key, {tiles, meta});
    this.generating.delete(key);

    // 4) подцепить границы к уже существующим соседним чанкам
    this._connectWithNeighbors(cx, cy);
  }

  /**
   * Проверить, пол (true) или стена (false) в абсолютных тайлах (x,y).
   */
  isFloor(x, y) {
    const cx = Math.floor(x/this.chunkSize);
    const cy = Math.floor(y/this.chunkSize);
    const lx = x - cx*this.chunkSize;
    const ly = y - cy*this.chunkSize;
    const chunk = this.chunks.get(`${cx},${cy}`);
    if (!chunk) return false;
    if (lx<0||ly<0||lx>=this.chunkSize||ly>=this.chunkSize) return false;
    return chunk.tiles[ly][lx];
  }

  /**
   * Перегенерирует чанки из keys, сохраняя:
   *  - все тайлы в поле зрения computeFOV,
   *  - все тайлы с memoryAlpha>0 (ещё не совсем забытые).
   */
  regenerateChunksPreserveFOV(keys, computeFOV, player) {
    const vis = computeFOV(player.x, player.y, player.angle);

    for (let key of keys) {
      const [cx,cy] = key.split(',').map(Number);
      const oldC = this.chunks.get(key);
      if (!oldC) continue;

      // 1) заберём всё, что в vis или memoryAlpha>0
      const stash = [];
      const baseX = cx*this.chunkSize, baseY = cy*this.chunkSize;
      for (let gy=baseY; gy<baseY+this.chunkSize; gy++) {
        for (let gx=baseX; gx<baseX+this.chunkSize; gx++) {
          const lx = gx-baseX, ly = gy-baseY;
          const m = oldC.meta[ly][lx];
          const coord = `${gx},${gy}`;
          if (vis.has(coord) || m.memoryAlpha>0) {
            stash.push({
              lx, ly,
              tile: oldC.tiles[ly][lx],
              meta: { memoryAlpha: m.memoryAlpha, visited: m.visited }
            });
          }
        }
      }

      // 2) удалить старый, 3) создать новый
      this.chunks.delete(key);
      this.ensureChunk(cx, cy);

      // 4) восстановить
      const fresh = this.chunks.get(key);
      for (let s of stash) {
        fresh.tiles[s.ly][s.lx] = s.tile;
        fresh.meta [s.ly][s.lx] = s.meta;
      }
    }
  }


  // ————— Внутренние вспомогалки —————

  /** Соединяем полы по границе с соседними чанками. */
  _connectWithNeighbors(cx, cy) {
    const S = this.chunkSize;
    const meKey = `${cx},${cy}`;
    const me = this.chunks.get(meKey).tiles;

    const dirs = [
      {dx:-1, dy:0,  meX:0,    nbX:S-1, meY0:0,    meY1:S-1},
      {dx: 1, dy:0,  meX:S-1, nbX:0,    meY0:0,    meY1:S-1},
      {dx:0,  dy:-1, meY:0,    nbY:S-1, meX0:0,    meX1:S-1},
      {dx:0,  dy: 1, meY:S-1, nbY:0,    meX0:0,    meX1:S-1}
    ];

    for (let d of dirs) {
      const nbKey = `${cx+d.dx},${cy+d.dy}`;
      if (!this.chunks.has(nbKey)) continue;
      const nb = this.chunks.get(nbKey).tiles;

      if (d.dx!==0) {
        for (let y=d.meY0; y<=d.meY1; y++) {
          if (me[y][d.meX] && !nb[y][d.nbX]) nb[y][d.nbX] = true;
          if (nb[y][d.nbX] && !me[y][d.meX]) me[y][d.meX] = true;
        }
      } else {
        for (let x=d.meX0; x<=d.meX1; x++) {
          if (me[d.meY][x] && !nb[d.nbY][x]) nb[d.nbY][x] = true;
          if (nb[d.nbY][x] && !me[d.meY][x]) me[d.meY][x] = true;
        }
      }
    }
  }

  /**
   * Генерит один чанк:
   * 1) двухширинный вертик+горизонт коридор,
   * 2) 4–6 прямоугольных комнат до 8×8 с стенами и дверью 1–2 тайла.
   */
  _generateChunk(cx, cy) {
    const S    = this.chunkSize;
    const grid = Array.from({length:S}, ()=>Array(S).fill(false));

    // простой детерминированный rng по координатам чанка
    const seed = (cx*0x9E3779B1) ^ (cy<<16);
    const rng  = this._mulberry32(seed);

    // ————— коридоры —————
    // вертикальный «стержень» в середине
    let midX = Math.floor(S/2), seg=0, jog=1;
    for (let y=0; y<S; y++) {
      grid[y][midX] = grid[y][midX+1] = true;
      if (++seg >= 25 && y<S-2) {
        const tryX = midX + jog;
        if (tryX>=1 && tryX+1<S) {
          grid[y][tryX]   = grid[y][tryX+1] = true;
          midX = tryX;
        }
        seg=0; jog = -jog;
      }
    }
    // горизонтальный «стержень»
    let midY = Math.floor(S/2); seg=0; jog=1;
    for (let x=0; x<S; x++) {
      grid[midY][x] = grid[midY+1][x] = true;
      if (++seg >= 25 && x<S-2) {
        const tryY = midY + jog;
        if (tryY>=1 && tryY+1<S) {
          grid[tryY][x]   = grid[tryY+1][x] = true;
          midY = tryY;
        }
        seg=0; jog = -jog;
      }
    }

    // ————— комнаты —————
    const roomCount = 4 + Math.floor(rng()*3); // 4..6
    for (let i=0; i<roomCount; i++) {
      // 1) точка привязки — любой тайл коридора
      let sx, sy, tries=0;
      do {
        sx = Math.floor(rng()*S);
        sy = Math.floor(rng()*S);
      } while(!grid[sy][sx] && ++tries<100);

      // 2) размер W×H ∈ [5..8], треугольно (8—среднее)
      const pickSize = ()=> {
        const u = rng()+rng();
        return 5 + Math.floor(u*(8-5));
      };
      let W = pickSize(), H = pickSize();
      // разница не больше 5 (в нашем диапазоне всегда <5)
      if (Math.abs(W-H)>5) H = W;

      // 3) определяется ориентация и координаты комнаты
      const horizontal = rng()<0.5;
      let x0,y0;
      if (horizontal) {
        const above = rng()<0.5;
        x0 = sx - Math.floor(W/2);
        y0 = above ? sy - H : sy+1;
      } else {
        const left = rng()<0.5;
        x0 = left ? sx - W : sx+1;
        y0 = sy - Math.floor(H/2);
      }
      // обрежем совсем за край
      x0 = Math.max(1, Math.min(S-W-1, x0));
      y0 = Math.max(1, Math.min(S-H-1, y0));

      // 4) «вырубаем» пол только внутри (оставляя 1-тайловую стену)
      for (let yy=y0+1; yy<y0+H-1; yy++) {
        for (let xx=x0+1; xx<x0+W-1; xx++) {
          grid[yy][xx] = true;
        }
      }

      // 5) делаем дверь 1–2 тайла в стене примыкания
      const doorSize = (rng()<0.5?1:2);
      if (horizontal) {
        const above = (y0+H <= sy); // если y0+H == sy → выше
        const borderY = above ? y0+H-1 : y0;
        // X в пределах [x0+1 .. x0+W-2]
        let dx = Math.min(Math.max(sx, x0+1), x0+W-2);
        for (let k=0; k<doorSize; k++) {
          const px = Math.min(x0+W-2, dx+k);
          grid[borderY][px] = true;
        }
      } else {
        const left = (x0+W <= sx);
        const borderX = left ? x0+W-1 : x0;
        let dy = Math.min(Math.max(sy, y0+1), y0+H-2);
        for (let k=0; k<doorSize; k++) {
          const py = Math.min(y0+H-2, dy+k);
          grid[py][borderX] = true;
        }
      }
    }

    return grid;
  }

  /**
   * Mulberry32 → [0..1)
   */
  _mulberry32(seed) {
    let t = seed >>> 0;
    return function() {
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ (t>>>15), 1|t);
      r = (r + Math.imul(r ^ (r>>>7), 61|r)) ^ r;
      return ((r ^ (r>>>14)) >>> 0) / 4294967296;
    };
  }
}

window.GameMap = GameMap;