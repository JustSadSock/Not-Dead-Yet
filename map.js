// map.js

class GameMap {
  /**
   * cols×rows — общий размер мира в тайлах,
   * renderW×renderH — размер чанка (видимой области) в тайлах,
   * tileSize — пикселей на тайл.
   */
  constructor(cols = 300, rows = 300, renderW = 30, renderH = 30, tileSize = 100) {
    this.cols     = cols;
    this.rows     = rows;
    this.renderW  = renderW;
    this.renderH  = renderH;
    this.tileSize = tileSize;

    // массив тайлов: wall/floor + память + флаг “виделось”
    this.tiles = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({
        type: 'wall',
        memoryAlpha: 0,
        visited: false
      }))
    );

    // детерминированный world‐seed и счётчики перегенераций чанков
    this.worldSeed       = Math.floor(Math.random() * 0xFFFFFFFF);
    this.chunkRegenCount = {};       // { "cx,cy": count }
    this.generatedChunks = new Set();

    // Mulberry32 PRNG
    this._makeMulberry = seed => {
      let t = seed >>> 0;
      return () => {
        t += 0x6D2B79F5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
      };
    };

    // сразу делаем первый чанк
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
   * Генерация чанка (cx, cy) с жёсткими правилами:
   * — 5–7 комнат размером 5×5…10×10 без перекрытий,
   * — MST‐граф для связности (коридоры толщиной 2 тайла),
   * — по одному коридору к каждой стороне чанка,
   * — запись результата в this.tiles (сброс memoryAlpha и visited).
   */
  _generateChunk(cx, cy) {
    const key   = `${cx},${cy}`;
    const count = (this.chunkRegenCount[key] || 0) + 1;
    this.chunkRegenCount[key] = count;
    const seed = this.worldSeed ^ (cx * 0x9249249) ^ (cy << 16) ^ count;
    const rng  = this._makeMulberry(seed);

    // 1) Создаём буфер с “wall”
    const buffer = Array.from({ length: this.renderH }, () =>
      Array.from({ length: this.renderW }, () => ({ type: 'wall' }))
    );

    // 2) Пытаемся разместить 5–7 комнат 5×5…10×10 без перекрытий
    const roomCount = 5 + Math.floor(rng() * 3); // 5,6 или 7
    const rooms = [];
    let attempts = 0;
    while (rooms.length < roomCount && attempts < 1000) {
      attempts++;
      const w  = 5 + Math.floor(rng() * 6); // 5..10
      const h  = 5 + Math.floor(rng() * 6);
      const rx = Math.floor(rng() * (this.renderW - w));
      const ry = Math.floor(rng() * (this.renderH - h));
      // проверяем пересечение
      let ok = true;
      for (const r of rooms) {
        if (rx < r.x + r.w && rx + w > r.x && ry < r.y + r.h && ry + h > r.y) {
          ok = false; break;
        }
      }
      if (!ok) continue;
      const centerX = rx + Math.floor(w / 2);
      const centerY = ry + Math.floor(h / 2);
      rooms.push({ x: rx, y: ry, w, h, centerX, centerY });
      // вырубаем пол
      for (let yy = ry; yy < ry + h; yy++) {
        for (let xx = rx; xx < rx + w; xx++) {
          buffer[yy][xx].type = 'floor';
        }
      }
    }

    // 3) Строим MST‐граф между центрами комнат
    // собираем все возможные рёбра
    const edges = [];
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        const a = rooms[i], b = rooms[j];
        const dx = a.centerX - b.centerX, dy = a.centerY - b.centerY;
        edges.push({ i, j, dist: dx*dx + dy*dy });
      }
    }
    edges.sort((a,b) => a.dist - b.dist);

    // Union‐Find для MST
    const parent = rooms.map((_, idx) => idx);
    function find(u) { return parent[u] === u ? u : parent[u] = find(parent[u]); }
    function union(u,v) { parent[find(u)] = find(v); }

    let used = 0;
    for (const e of edges) {
      if (find(e.i) !== find(e.j)) {
        union(e.i, e.j);
        this._carveCorridor(buffer, rooms[e.i], rooms[e.j]);
        used++;
        if (used >= rooms.length - 1) break;
      }
    }
    // добавляем случайные дополнительные соединения (30% шанс)
    for (const e of edges) {
      if (Math.random() < 0.3 && find(e.i) !== find(e.j)) {
        union(e.i, e.j);
        this._carveCorridor(buffer, rooms[e.i], rooms[e.j]);
      }
    }

    // 4) Делаем выходы к границам чанка (north, south, west, east)
    ['north','south','west','east'].forEach(side => {
      const r = rooms[Math.floor(rng() * rooms.length)];
      this._carveToBorder(buffer, r.centerX, r.centerY, side);
    });

    // 5) Пишем из buffer в this.tiles, сбрасывая память и видимость
    const x0 = cx * this.renderW,
          y0 = cy * this.renderH;
    for (let yy = 0; yy < this.renderH; yy++) {
      for (let xx = 0; xx < this.renderW; xx++) {
        const gx = x0 + xx, gy = y0 + yy;
        if (gx < 0 || gy < 0 || gx >= this.cols || gy >= this.rows) continue;
        const t = this.tiles[gy][gx];
        t.type        = buffer[yy][xx].type;
        t.memoryAlpha = 0;
        t.visited     = false;
      }
    }
  }

  /** Прорезаем коридор толщиной 2 тайла между двумя комнатами A и B */
  _carveCorridor(buffer, A, B) {
    const x1 = A.centerX, y1 = A.centerY;
    const x2 = B.centerX, y2 = B.centerY;
    // горизонтальный сегмент
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
      for (let dy = 0; dy < 2; dy++) {
        const y = y1 + dy;
        if (buffer[y] && buffer[y][x]) buffer[y][x].type = 'floor';
      }
    }
    // вертикальный сегмент
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
      for (let dx = 0; dx < 2; dx++) {
        const x = x2 + dx;
        if (buffer[y] && buffer[y][x]) buffer[y][x].type = 'floor';
      }
    }
  }

  /**
   * Прорезаем коридор (толщиной 2) от (sx,sy) к краю чанка по side
   * side ∈ {'north','south','west','east'}.
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
      for (let y = sy; y < this.renderH; y++) {
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
      for (let x = sx; x < this.renderW; x++) {
        for (let dy = 0; dy < 2; dy++) {
          const y = sy + dy;
          if (buffer[y]?.[x]) buffer[y][x].type = 'floor';
        }
      }
    }
  }

  /** Проверка: true, если (x,y) — стена или за пределами мира */
  isWall(x, y) {
    const cx = Math.floor(x / this.renderW),
          cy = Math.floor(y / this.renderH);
    this.ensureChunk(cx, cy);
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return true;
    return this.tiles[y][x].type === 'wall';
  }

  // при “забывании” конкретного тайла регенерим только его чанк
  regenerateTile(x, y) {
    // оставляем прежнюю логику буферного патчинга...
    // ...
  }
}

window.GameMap = GameMap;