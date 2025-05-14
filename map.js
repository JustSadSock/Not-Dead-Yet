// map.js

class GameMap {
  /**
   * cols×rows — общий размер мира в тайлах,
   * chunkW×chunkH — размер одного чанка в тайлах,
   * tileSize — пикселей на тайл.
   */
  constructor(
    cols     = 300,
    rows     = 300,
    chunkW   = 30,
    chunkH   = 30,
    tileSize = 27
  ) {
    this.cols     = cols;
    this.rows     = rows;
    this.chunkW   = chunkW;
    this.chunkH   = chunkH;
    this.tileSize = tileSize;

    // основной массив тайлов
    this.tiles = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({
        type: 'wall',
        memoryAlpha: 0,
        visited: false
      }))
    );

    // детерминированный PRNG
    this.worldSeed       = Math.floor(Math.random() * 0xFFFFFFFF);
    this.chunkRegenCount = {};   // { "cx,cy": count }
    this.generatedChunks = new Set();

    // Mulberry32
    this._makeMulberry = seed => {
      let t = seed >>> 0;
      return () => {
        t += 0x6D2B79F5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
      };
    };

    // генерируем стартовый чанк
    this.ensureChunk(0, 0);
  }

  /** Убедиться, что чанк (cx,cy) сгенерирован */
  ensureChunk(cx, cy) {
    const key = `${cx},${cy}`;
    if (!this.generatedChunks.has(key)) {
      this._generateChunk(cx, cy);
      this.generatedChunks.add(key);
    }
  }

  /**
   * Полная генерация чанка (cx,cy) — комнаты, коридоры, выходы
   */
  _generateChunk(cx, cy) {
    const key   = `${cx},${cy}`;
    const count = (this.chunkRegenCount[key] || 0) + 1;
    this.chunkRegenCount[key] = count;

    const seed = this.worldSeed ^ (cx * 0x9249249) ^ (cy << 16) ^ count;
    const rng  = this._makeMulberry(seed);

    // 1) буфер стен
    const buffer = Array.from({ length: this.chunkH }, () =>
      Array.from({ length: this.chunkW }, () => ({ type: 'wall' }))
    );

    // 2) размещаем 4–6 комнат 5×5…9×9
    const roomCount = 4 + Math.floor(rng() * 3);
    const rooms = [];
    let attempts = 0;
    const margin = 2;

    while (rooms.length < roomCount && attempts < 500) {
      attempts++;
      const w  = 5 + Math.floor(rng() * 5); 
      const h  = 5 + Math.floor(rng() * 5);
      const rx = margin + Math.floor(rng() * (this.chunkW - w - margin*2));
      const ry = margin + Math.floor(rng() * (this.chunkH - h - margin*2));

      let ok = true;
      for (const r of rooms) {
        if (rx - margin < r.x + r.w + margin &&
            rx + w + margin > r.x - margin &&
            ry - margin < r.y + r.h + margin &&
            ry + h + margin > r.y - margin) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;

      const centerX = rx + Math.floor(w/2);
      const centerY = ry + Math.floor(h/2);
      rooms.push({ x: rx, y: ry, w, h, centerX, centerY });

      for (let yy = ry; yy < ry + h; yy++) {
        for (let xx = rx; xx < rx + w; xx++) {
          buffer[yy][xx].type = 'floor';
        }
      }
    }

    // 3) MST-коридоры
    const edges = [];
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i+1; j < rooms.length; j++) {
        const a = rooms[i], b = rooms[j];
        const dx = a.centerX - b.centerX, dy = a.centerY - b.centerY;
        edges.push({ i, j, dist: dx*dx + dy*dy });
      }
    }
    edges.sort((a,b) => a.dist - b.dist);

    const parent = rooms.map((_,i) => i);
    const find   = u => parent[u] === u ? u : parent[u] = find(parent[u]);
    const union  = (u,v) => parent[find(u)] = find(v);

    let used = 0;
    for (const e of edges) {
      if (find(e.i) !== find(e.j)) {
        union(e.i, e.j);
        this._carveCorridor(buffer, rooms[e.i], rooms[e.j]);
        used++;
        if (used >= rooms.length - 1) break;
      }
    }

    // 4) петли (~30%)
    for (const e of edges) {
      if (rng() < 0.3 && find(e.i) !== find(e.j)) {
        union(e.i, e.j);
        this._carveCorridor(buffer, rooms[e.i], rooms[e.j]);
      }
    }

    // 5) выходы на границы (минимум один)
    const sides = ['north','south','west','east'];
    let hadExit = false;
    for (const side of sides) {
      if (rng() < 0.5) {
        const r = rooms[Math.floor(rng() * rooms.length)];
        this._carveToBorder(buffer, r.centerX, r.centerY, side);
        hadExit = true;
      }
    }
    if (!hadExit) {
      const side = sides[Math.floor(rng() * sides.length)];
      const r = rooms[Math.floor(rng() * rooms.length)];
      this._carveToBorder(buffer, r.centerX, r.centerY, side);
    }

    // 6) пишем buffer в this.tiles
    const x0 = cx * this.chunkW, y0 = cy * this.chunkH;
    for (let yy = 0; yy < this.chunkH; yy++) {
      for (let xx = 0; xx < this.chunkW; xx++) {
        const gx = x0 + xx, gy = y0 + yy;
        if (gx < 0 || gy < 0 || gx >= this.cols || gy >= this.rows) continue;
        const t = this.tiles[gy][gx];
        t.type        = buffer[yy][xx].type;
        t.memoryAlpha = 0;
        t.visited     = false;
      }
    }
  }

  /** Коридор 2-тайла между комнатами A и B */
  _carveCorridor(buffer, A, B) {
    const x1 = A.centerX, y1 = A.centerY;
    const x2 = B.centerX, y2 = B.centerY;
    for (let x = Math.min(x1,x2); x <= Math.max(x1,x2); x++) {
      for (let dy = 0; dy < 2; dy++) {
        const y = y1 + dy;
        if (buffer[y]?.[x]) buffer[y][x].type = 'floor';
      }
    }
    for (let y = Math.min(y1,y2); y <= Math.max(y1,y2); y++) {
      for (let dx = 0; dx < 2; dx++) {
        const x = x2 + dx;
        if (buffer[y]?.[x]) buffer[y][x].type = 'floor';
      }
    }
  }

  /** Коридор к границе по side */
  _carveToBorder(buffer, sx, sy, side) {
    if (side === 'north') {
      for (let y = sy; y >= 0; y--) {
        for (let dx = 0; dx < 2; dx++) {
          const x = sx + dx;
          if (buffer[y]?.[x]) buffer[y][x].type = 'floor';
        }
      }
    } else if (side === 'south') {
      for (let y = sy; y < this.chunkH; y++) {
        for (let dx = 0; dx < 2; dx++) {
          const x = sx + dx;
          if (buffer[y]?.[x]) buffer[y][x].type = 'floor';
        }
      }
    } else if (side === 'west') {
      for (let x = sx; x >= 0; x--) {
        for (let dy = 0; dy < 2; dy++) {
          const y = sy + dy;
          if (buffer[y]?.[x]) buffer[y][x].type = 'floor';
        }
      }
    } else if (side === 'east') {
      for (let x = sx; x < this.chunkW; x++) {
        for (let dy = 0; dy < 2; dy++) {
          const y = sy + dy;
          if (buffer[y]?.[x]) buffer[y][x].type = 'floor';
        }
      }
    }
  }

  /**
   * Проверка стены + генерация чанка по запросу
   */
  isWall(x, y) {
    const cx = Math.floor(x / this.chunkW),
          cy = Math.floor(y / this.chunkH);
    this.ensureChunk(cx, cy);
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return true;
    return this.tiles[y][x].type === 'wall';
  }

  /**
   * Создает буфер чанка с теми же шагами, что _generateChunk,
   * но не трогает this.tiles — нужен для перегенерации.
   */
  _generateChunkBuffer(cx, cy) {
    const key   = `${cx},${cy}`;
    const count = (this.chunkRegenCount[key] || 0) + 1;
    const seed = this.worldSeed ^ (cx * 0x9249249) ^ (cy << 16) ^ count;
    const rng  = this._makeMulberry(seed);

    // аналогично _generateChunk, но работаем только с buffer:
    const buffer = Array.from({ length: this.chunkH }, () =>
      Array.from({ length: this.chunkW }, () => ({ type: 'wall' }))
    );

    // 1) комнаты
    const roomCount = 4 + Math.floor(rng() * 3);
    const rooms = [];
    let attempts = 0;
    const margin = 2;
    while (rooms.length < roomCount && attempts < 500) {
      attempts++;
      const w  = 5 + Math.floor(rng() * 5);
      const h  = 5 + Math.floor(rng() * 5);
      const rx = margin + Math.floor(rng() * (this.chunkW - w - margin*2));
      const ry = margin + Math.floor(rng() * (this.chunkH - h - margin*2));
      let ok = true;
      for (const r of rooms) {
        if (rx - margin < r.x + r.w + margin &&
            rx + w + margin > r.x - margin &&
            ry - margin < r.y + r.h + margin &&
            ry + h + margin > r.y - margin) {
          ok = false; break;
        }
      }
      if (!ok) continue;
      const centerX = rx + Math.floor(w/2);
      const centerY = ry + Math.floor(h/2);
      rooms.push({ x: rx, y: ry, w, h, centerX, centerY });
      for (let yy = ry; yy < ry + h; yy++) {
        for (let xx = rx; xx < rx + w; xx++) {
          buffer[yy][xx].type = 'floor';
        }
      }
    }

    // 2) MST-коридоры
    const edges = [];
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i+1; j < rooms.length; j++) {
        const a = rooms[i], b = rooms[j];
        const dx = a.centerX - b.centerX, dy = a.centerY - b.centerY;
        edges.push({ i,j,dist: dx*dx + dy*dy });
      }
    }
    edges.sort((a,b) => a.dist - b.dist);

    const parent = rooms.map((_,i) => i);
    const find   = u => parent[u] === u ? u : parent[u] = find(parent[u]);
    const union  = (u,v) => parent[find(u)] = find(v);

    let used = 0;
    for (const e of edges) {
      if (find(e.i) !== find(e.j)) {
        union(e.i, e.j);
        this._carveCorridor(buffer, rooms[e.i], rooms[e.j]);
        used++;
        if (used >= rooms.length-1) break;
      }
    }
    for (const e of edges) {
      if (rng() < 0.3 && find(e.i) !== find(e.j)) {
        union(e.i, e.j);
        this._carveCorridor(buffer, rooms[e.i], rooms[e.j]);
      }
    }

    // 3) выходы на границы
    const sides = ['north','south','west','east'];
    let hadExit = false;
    for (const side of sides) {
      if (rng() < 0.5) {
        const r = rooms[Math.floor(rng() * rooms.length)];
        this._carveToBorder(buffer, r.centerX, r.centerY, side);
        hadExit = true;
      }
    }
    if (!hadExit) {
      const side = sides[Math.floor(rng() * sides.length)];
      const r = rooms[Math.floor(rng() * rooms.length)];
      this._carveToBorder(buffer, r.centerX, r.centerY, side);
    }

    return buffer;
  }

  /**
   * Перегенерация чанков из Set<"cx,cy">:
   * сохраняем FOV, генерим buffer, патчим visited & memoryAlpha===0,
   * восстанавливаем FOV-тайлы.
   */
  regenerateChunksPreserveFOV(chunksSet, computeFOV, player) {
    for (const key of chunksSet) {
      const [cx, cy] = key.split(',').map(Number);

      // сохранить FOV в этом чанке
      const visKeys = computeFOV(this, player);
      const saved   = [];
      for (const k of visKeys) {
        const [ix, iy] = k.split(',').map(Number);
        if (Math.floor(ix/this.chunkW)===cx && Math.floor(iy/this.chunkH)===cy) {
          saved.push({ x: ix, y: iy, type: this.tiles[iy][ix].type });
        }
      }

      // получить свежий буфер
      const buffer = this._generateChunkBuffer(cx, cy);

      // патчить visited & memoryAlpha===0
      const x0 = cx * this.chunkW, y0 = cy * this.chunkH;
      for (let yy = 0; yy < this.chunkH; yy++) {
        for (let xx = 0; xx < this.chunkW; xx++) {
          const gx = x0 + xx, gy = y0 + yy;
          if (gy<0||gy>=this.rows||gx<0||gx>=this.cols) continue;
          const tile = this.tiles[gy][gx];
          if (tile.visited && tile.memoryAlpha === 0) {
            tile.type = buffer[yy][xx].type;
          }
        }
      }

      // восстановить FOV
      for (const s of saved) {
        const tile = this.tiles[s.y][s.x];
        tile.type        = s.type;
        tile.memoryAlpha = 1;
        tile.visited     = true;
      }
    }
  }
}

window.GameMap = GameMap;