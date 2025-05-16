// map.js

/**
 * GameMap — чанковая карта с регенерацией забытых тайлов.
 */
class GameMap {
  constructor() {
    // размер одного чанка (в тайлах) — должен совпадать с game.js.chunkSize
    this.chunkSize   = 32;

    // храним чанки: Map<"cx,cy", {tiles: number[][], meta: {memoryAlpha,visited}[][]}>
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

    // 1) Генерим саму сетку пола/стен с комнатами и коридорами
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
   * Возвращает true, если внутри чанка и tiles[ly][lx] != 0 (пол или дверь).
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
    return chunk.tiles[ly][lx] !== 0;
  }

  /**
   * Пакетная перегенерация чанков:
   * сохраняем все тайлы и meta, где либо в FOV, либо memoryAlpha>0,
   * удаляем старый чанк, генерим новый, возвращаем сохранённые квадратики.
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

  /**
   * Процедурная генерация одного чанка cx,cy:
   * — строим лабиринт с коридорами и размещаем комнаты.
   * Возвращает Number[][] размером chunkSize×chunkSize с кодами тайлов:
   *   0 — стена, 1 — коридор, 2 — комната, 3 — дверь.
   */
  _generateChunk(cx, cy) {
    const S    = this.chunkSize;
    // Инициализируем все стены (0)
    const tiles = Array.from({ length: S }, () => Array(S).fill(0));

    // 1) Генерим коридоры: используем блочную решетку N×N и случайную расстановку центров
    const block = 4;
    const N = Math.floor(S / block);  // ожидаем 32/4 = 8
    // Решетка наличия центральной клетки коридора
    const hasCenter = Array.from({ length: N }, () => Array(N).fill(false));
    for (let ry = 0; ry < N; ry++) {
      for (let cx2 = 0; cx2 < N; cx2++) {
        // С вероятностью ~0.5 делаем центральную точку коридора
        hasCenter[ry][cx2] = (Math.random() < 0.5);
      }
    }
    // Если в центральной строке нет ни одной центральной точки, создадим её по центру
    const midRow = Math.floor(N/2);
    let anyMid = false;
    for (let c2 = 0; c2 < N; c2++) {
      if (hasCenter[midRow][c2]) { anyMid = true; break; }
    }
    if (!anyMid) {
      hasCenter[midRow][Math.floor(N/2)] = true;
    }
    // Прорисовка центральных клеток и соединительных коридоров
    for (let ry = 0; ry < N; ry++) {
      for (let cx2 = 0; cx2 < N; cx2++) {
        if (!hasCenter[ry][cx2]) continue;
        const tx = cx2 * block + 1;
        const ty = ry * block + 1;
        // центральная плитка коридора
        tiles[ty][tx] = 1;
        // соединяем с востоком, если у соседа есть центр
        if (cx2 < N-1 && hasCenter[ry][cx2+1]) {
          for (let x = tx; x <= tx + block; x++) {
            if (x < S) tiles[ty][x] = 1;
          }
        }
        // соединяем с югом
        if (ry < N-1 && hasCenter[ry+1][cx2]) {
          for (let y = ty; y <= ty + block; y++) {
            if (y < S) tiles[y][tx] = 1;
          }
        }
      }
    }
    // соединяем центр чанка краевыми коридорами
    const mid = Math.floor(S/2);
    tiles[mid][0] = 1; 
    tiles[mid][S-1] = 1;
    tiles[0][mid] = 1;
    tiles[S-1][mid] = 1;

    // 2) Размещаем комнаты:
    // Количество комнат 3–8
    const roomCount = 3 + Math.floor(Math.random() * 6); // [3..8]
    let placed = 0;
    let attempts = 0;
    while (placed < roomCount && attempts < roomCount * 20) {
      attempts++;
      // Случайный размер с распределением (скошенное к середине)
      let w = Math.floor(((Math.random() + Math.random())/2) * 4 + 4);
      let h = Math.floor(((Math.random() + Math.random())/2) * 4 + 4);
      if (w > 8) w = 8; if (h > 8) h = 8;
      // Положение внутреннего прямоугольника [1..S-2]
      const maxX = S - w - 1;
      const maxY = S - h - 1;
      if (maxX < 1 || maxY < 1) break;
      const rX = 1 + Math.floor(Math.random() * maxX);
      const rY = 1 + Math.floor(Math.random() * maxY);
      // Проверка на пересечение с уже занятыми (коридоры или другие комнаты)
      let free = true;
      for (let yy = rY; yy < rY + h && free; yy++) {
        for (let xx = rX; xx < rX + w; xx++) {
          if (tiles[yy][xx] !== 0) { free = false; break; }
        }
      }
      if (!free) continue;
      // Поиск возможных позиций для дверей вдоль границы комнаты
      const doorCandidates = [];
      // Левый край
      if (rX > 0) {
        for (let yy = rY; yy < rY + h; yy++) {
          if (tiles[yy][rX-1] === 1) {
            doorCandidates.push({ x: rX, y: yy });
          }
        }
      }
      // Правый край
      if (rX + w < S) {
        for (let yy = rY; yy < rY + h; yy++) {
          if (tiles[yy][rX + w] === 1) {
            doorCandidates.push({ x: rX + w - 1, y: yy });
          }
        }
      }
      // Верхний край
      if (rY > 0) {
        for (let xx = rX; xx < rX + w; xx++) {
          if (tiles[rY-1][xx] === 1) {
            doorCandidates.push({ x: xx, y: rY });
          }
        }
      }
      // Нижний край
      if (rY + h < S) {
        for (let xx = rX; xx < rX + w; xx++) {
          if (tiles[rY + h][xx] === 1) {
            doorCandidates.push({ x: xx, y: rY + h - 1 });
          }
        }
      }
      if (doorCandidates.length === 0) {
        // если нет примыкающего коридора, пропускаем комнату
        continue;
      }
      // Закрашиваем пол комнаты
      for (let yy = rY; yy < rY + h; yy++) {
        for (let xx = rX; xx < rX + w; xx++) {
          tiles[yy][xx] = 2;
        }
      }
      // Определяем количество дверей: минимум 2 если площадь >16, иначе минимум 1
      const area = w * h;
      const minDoors = (area > 16 ? 2 : 1);
      let doorCount = minDoors;
      if (doorCandidates.length > minDoors) {
        doorCount = minDoors + Math.floor(Math.random() * Math.min(3 - minDoors + 1, doorCandidates.length - minDoors + 1));
      }
      // Случайно выбираем позиции дверей
      const chosen = [];
      while (chosen.length < doorCount && doorCandidates.length > 0) {
        const idx = Math.floor(Math.random() * doorCandidates.length);
        const cand = doorCandidates.splice(idx,1)[0];
        chosen.push(cand);
      }
      // Прорисовываем двери (код 3) на границе комнаты
      for (let d of chosen) {
        tiles[d.y][d.x] = 3;
      }
      placed++;
    }

    return tiles;
  }
}

// делаем доступным в глобальной области, чтобы game.js увидел
window.GameMap = GameMap;