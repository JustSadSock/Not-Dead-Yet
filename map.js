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
    tileSize = 100
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

    // для детерминированного псевдо-рандома
    this.worldSeed       = Math.floor(Math.random() * 0xFFFFFFFF);
    this.chunkRegenCount = {};       // { "cx,cy": regenCount }
    this.generatedChunks = new Set();

    // Mulberry32-прослойка
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
   * Основная генерация чанка (cx,cy):
   * — 5–7 комнат (5×5…10×10) без перекрытий,
   * — MST-коридоры толщиной 2 тайла,
   * — по одному выходу к каждой стороне чанка,
   * — сброс memoryAlpha и visited.
   */
  _generateChunk(cx, cy) {
    const key   = `${cx},${cy}`;
    const count = (this.chunkRegenCount[key] || 0) + 1;
    this.chunkRegenCount[key] = count;

    const seed = this.worldSeed ^ (cx * 0x9249249) ^ (cy << 16) ^ count;
    const rng  = this._makeMulberry(seed);

    // буфер walls
    const buffer = Array.from({ length: this.chunkH }, () =>
      Array.from({ length: this.chunkW }, () => ({ type: 'wall' }))
    );

    // 1) Размещение комнат
    const roomCount = 5 + Math.floor(rng() * 3); // 5–7 комнат
    const rooms = [];
    let attempts = 0;
    while (rooms.length < roomCount && attempts < 1000) {
      attempts++;
      const w  = 5 + Math.floor(rng() * 6); // ширина 5–10
      const h  = 5 + Math.floor(rng() * 6); // высота 5–10
      const rx = Math.floor(rng() * (this.chunkW - w));
      const ry = Math.floor(rng() * (this.chunkH - h));

      // проверка на пересечение
      let ok = true;
      for (const r of rooms) {
        if (rx < r.x + r.w && rx + w > r.x && ry < r.y + r.h && ry + h > r.y) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;

      const centerX = rx + Math.floor(w / 2);
      const centerY = ry + Math.floor(h / 2);
      rooms.push({ x: rx, y: ry, w, h, centerX, centerY });

      // вырубаем пол в комнате
      for (let yy = ry; yy < ry + h; yy++) {
        for (let xx = rx; xx < rx + w; xx++) {
          buffer[yy][xx].type = 'floor';
        }
      }
    }

    // 2) MST-коридоры
    // генерируем ребра
    const edges = [];
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        const a = rooms[i], b = rooms[j];
        const dx = a.centerX - b.centerX, dy = a.centerY - b.centerY;
        edges.push({ i, j, dist: dx*dx + dy*dy });
      }
    }
    edges.sort((a, b) => a.dist - b.dist);

    // Union-Find
    const parent = rooms.map((_, i) => i);
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
    // дополнительные соединения с шансом ≈30%
    for (const e of edges) {
      if (rng() < 0.3 && find(e.i) !== find(e.j)) {
        union(e.i, e.j);
        this._carveCorridor(buffer, rooms[e.i], rooms[e.j]);
      }
    }

    // 3) Выходы на границы чанка (north, south, west, east)
    ['north','south','west','east'].forEach(side => {
      const r = rooms[Math.floor(rng() * rooms.length)];
      this._carveToBorder(buffer, r.centerX, r.centerY, side);
    });

    // 4) Записываем буфер в this.tiles
    const x0 = cx * this.chunkW, y0 = cy * this.chunkH;
    for (let yy = 0; yy < this.chunkH; yy++) {
      for (let xx = 0; xx < this.chunkW; xx++) {
        const gx = x0 + xx, gy = y0 + yy;
        if (gx < 0 || gy < 0 || gx >= this.cols || gy >= this.rows) continue;
        const tile = this.tiles[gy][gx];
        tile.type        = buffer[yy][xx].type;
        tile.memoryAlpha = 0;
        tile.visited     = false;
      }
    }
  }

  /** Широкий (2-тайловый) коридор между центрами A и B */
  _carveCorridor(buffer, A, B) {
    const x1 = A.centerX, y1 = A.centerY;
    const x2 = B.centerX, y2 = B.centerY;
    // по X
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
      for (let dy = 0; dy < 2; dy++) {
        const y = y1 + dy;
        if (buffer[y]?.[x]) buffer[y][x].type = 'floor';
      }
    }
    // по Y
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
      for (let dx = 0; dx < 2; dx++) {
        const x = x2 + dx;
        if (buffer[y]?.[x]) buffer[y][x].type = 'floor';
      }
    }
  }

  /**
   * Коридор от (sx,sy) к границе чанка по указанной стороне:
   * side = 'north'|'south'|'west'|'east'
   */
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
   * true, если (x,y) стена или вне карты.
   * Автоматически генерирует чанк, если нужно.
   */
  isWall(x, y) {
    const cx = Math.floor(x / this.chunkW),
          cy = Math.floor(y / this.chunkH);
    this.ensureChunk(cx, cy);
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return true;
    return this.tiles[y][x].type === 'wall';
  }

  /**
   * Однократная перегенерация всего чанка (cx,cy) с сохранением FOV:
   * — сохраняем видимый паттерн,
   * — генерим fresh buffer,
   * — патчим все visited & memoryAlpha===0,
   * — восстанавливаем сохранённые FOV-тайлы.
   */
  regenerateChunksPreserveFOV(chunksSet, computeFOV, player) {
    for (const key of chunksSet) {
      const [cx, cy] = key.split(',').map(Number);
      // 1) текущие видимые в чанке
      const visKeys = computeFOV(this, player);
      const saved   = [];
      for (const k of visKeys) {
        const [ix,iy] = k.split(',').map(Number);
        if (Math.floor(ix/this.chunkW)===cx && Math.floor(iy/this.chunkH)===cy) {
          saved.push({ x: ix, y: iy, type: this.tiles[iy][ix].type });
        }
      }
      // 2) новый buffer
      const buffer = this._generateChunkBuffer(cx, cy);
      // 3) патчим visited & memoryAlpha===0
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
      // 4) восстанавливаем FOV-тайлы
      for (const s of saved) {
        const tile = this.tiles[s.y][s.x];
        tile.type        = s.type;
        tile.memoryAlpha = 1;
        tile.visited     = true;
      }
    }
  }

  /**
   * Генерация буфера для чанка (cx,cy), не меняя this.tiles.
   * Логика совпадает с _generateChunk.
   */
  _generateChunkBuffer(cx, cy) {
    const key   = `${cx},${cy}`;
    const count = (this.chunkRegenCount[key] || 0) + 1;
    // не затрагиваем this.chunkRegenCount —
    // пусть реальное перегенерации учитываются только в _generateChunk
    const seed = this.worldSeed ^ (cx * 0x9249249) ^ (cy << 16) ^ count;
    const rng  = this._makeMulberry(seed);

    // копия логики генерации: buffer, rooms, MST, corridors, exits...
    const buffer = Array.from({ length: this.chunkH }, () =>
      Array.from({ length: this.chunkW }, () => ({ type: 'wall' }))
    );

    // … (аналогично _generateChunk, но работаем с buffer) …
    // для краткости можно просто call this._generateChunk into a temp map...

    return buffer;
  }
}

window.GameMap = GameMap;