// map.js

/**
 * GameMap — чанковая карта с коридорами + комнатами + перегенерацией забытых тайлов.
 */
class GameMap {
  /**
   * @param {number} chunkSize — ширина/высота одного чанка в тайлах.
   */
  constructor(chunkSize = 30) {
    this.chunkSize  = chunkSize;
    this.chunks     = new Map();    // Map<"cx,cy", { tiles, meta }>
    this.generating = new Set();    // чанки, которые сейчас в ensureChunk
  }

  /**
   * Убедиться, что чанк (cx,cy) есть; если нет — сгенерить.
   */
  ensureChunk(cx, cy) {
    const key = `${cx},${cy}`;
    if (this.chunks.has(key) || this.generating.has(key)) return;
    this.generating.add(key);

    // 1) режем пол/стены
    const tiles = this._generateChunk(cx, cy);

    // 2) готовим мета—таблицу (память α, visited)
    const meta = Array.from({length: this.chunkSize}, () =>
      Array.from({length: this.chunkSize}, () => ({
        memoryAlpha: 0,
        visited:     false
      }))
    );

    // 3) сохраняем
    this.chunks.set(key, { tiles, meta });
    this.generating.delete(key);

    // 4) подцепляем границы к уже существующим соседям
    this._connectWithNeighbors(cx, cy);
  }

  /**
   * true, если в абсолютных координатах (x,y) — пол.
   */
  isFloor(x, y) {
    const cx = Math.floor(x / this.chunkSize);
    const cy = Math.floor(y / this.chunkSize);
    const lx = x - cx*this.chunkSize;
    const ly = y - cy*this.chunkSize;
    const chunk = this.chunks.get(`${cx},${cy}`);
    if (!chunk) return false;
    if (lx<0||ly<0||lx>=this.chunkSize||ly>=this.chunkSize) return false;
    return chunk.tiles[ly][lx];
  }

  /**
   * Перегенерирует чанки из keys, сохраняя FOV и «не до конца забытые» тайлы.
   */
  regenerateChunksPreserveFOV(keys, computeFOV, player) {
    const vis = computeFOV(player.x, player.y, player.angle);

    for (let key of keys) {
      const [cx, cy] = key.split(',').map(Number);
      const oldC = this.chunks.get(key);
      if (!oldC) continue;

      // собрать всё, что в vis или α>0
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

      // удаляем, генерим заново, клонируем назад
      this.chunks.delete(key);
      this.ensureChunk(cx, cy);
      const fresh = this.chunks.get(key);
      for (let s of stash) {
        fresh.tiles[s.ly][s.lx] = s.tile;
        fresh.meta [s.ly][s.lx] = s.meta;
      }
    }
  }


  // ————— ВНУТРЕННИЕ МЕТОДЫ —————

  /**
   * Соединяем чанк (cx,cy) с уже существующими соседями.
   */
  _connectWithNeighbors(cx, cy) {
    const S = this.chunkSize;
    const meKey = `${cx},${cy}`;
    const me = this.chunks.get(meKey).tiles;

    const dirs = [
      {dx:-1,dy:0, meX:0,    nbX:S-1, meY0:0,    meY1:S-1},
      {dx: 1,dy:0, meX:S-1, nbX:0,   meY0:0,    meY1:S-1},
      {dx:0, dy:-1,meY:0,    nbY:S-1, meX0:0,    meX1:S-1},
      {dx:0, dy: 1,meY:S-1, nbY:0,    meX0:0,    meX1:S-1}
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
   * Рисует сначала «двухширинные» коридоры (V + H), потом 4–6 комнат.
   */
  _generateChunk(cx, cy) {
    const S   = this.chunkSize;
    const grid = Array.from({length:S}, ()=>Array(S).fill(false));

    // детерминированный RNG по (cx,cy)
    const seed = (cx*0x9E3779B1) ^ (cy<<16);
    const rng  = this._mulberry32(seed);

    // — Коридоры —
    let crossX = Math.floor(S/2);
    let crossY = Math.floor(S/2);
    let segV=0, jogR=true;
    for (let y=0; y<S; y++) {
      grid[y][crossX] = grid[y][crossX+1] = true;
      segV++;
      if (segV>=25 && y<S-2) {
        const dir = jogR?1:-1;
        if (crossX+dir>=1 && crossX+dir+1<S) {
          grid[y][crossX+dir] = grid[y][crossX+dir+1] = true;
          crossX += dir;
        }
        segV=0; jogR=!jogR;
      }
    }
    let segH=0, jogD=true;
    for (let x=0; x<S; x++) {
      grid[crossY][x] = grid[crossY+1][x] = true;
      segH++;
      if (segH>=25 && x<S-2) {
        const dir = jogD?1:-1;
        if (crossY+dir>=1 && crossY+dir+1<S) {
          grid[crossY+dir][x] = grid[crossY+dir+1][x] = true;
          crossY += dir;
        }
        segH=0; jogD=!jogD;
      }
    }

    // — Комнаты —
    const roomCount = 4 + Math.floor(rng()*3);  // 4..6 комнат
    for (let i=0; i<roomCount; i++) {
      // 1) случайная точка на коридоре
      let tries=0, sx, sy;
      do {
        sx = Math.floor(rng()*S);
        sy = Math.floor(rng()*S);
        tries++;
      } while(!grid[sy][sx] && tries<100);

      // 2) размер комнаты: W,H ∈ [5..12], среднее ~8
      const pickSize = () => {
        // треугольная распределённая от 0..1
        const u = rng()+rng();
        return Math.floor(5 + u*(12-5));
      };
      let W = pickSize(), H = pickSize();
      if (Math.abs(W-H)>5) { H = W + (rng()<0.5?-1:1)*5; }

      // 3) привязать одну грань к (sx,sy)
      const horizontalAttach = (rng()<0.5);
      let x0,y0;
      if (horizontalAttach) {
        // комната снизу или сверху
        const above = (rng()<0.5);
        x0 = sx - Math.floor(W/2);
        y0 = above ? sy-H : sy+1;
      } else {
        // слева или справа
        const left = (rng()<0.5);
        x0 = left? sx-W : sx+1;
        y0 = sy - Math.floor(H/2);
      }

      // 4) резка комнаты, не выходя за границы чанка
      x0 = Math.max(1, Math.min(S-W-1, x0));
      y0 = Math.max(1, Math.min(S-H-1, y0));

      // 5) «вырубить» пол внутри (оставив стены)
      for (let yy=y0; yy<y0+H; yy++) {
        for (let xx=x0; xx<x0+W; xx++) {
          grid[yy][xx] = true;
        }
      }
    }

    return grid;
  }

  /**
   * Mulberry32 → [0..1).
   */
  _mulberry32(seed) {
    let t = seed >>> 0;
    return function() {
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ (t>>>15), 1|t);
      r = (r + Math.imul(r ^ (r>>>7), 61|r)) ^ r;
      return ((r ^ (r>>>14))>>>0) / 4294967296;
    };
  }
}

window.GameMap = GameMap;