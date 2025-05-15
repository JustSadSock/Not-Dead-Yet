// map.js

/**
 * GameMap — чанковая карта с процедурной генерацией “советской квартиры”:
 * — 2-тайловые коридоры с максимальной длиной 25 и мелкими изгибами,
 * — 3–6 комнат (5×5..10×10) с дверями 1–3 тайла,
 * — гарантированная связность между чанками.
 */
class GameMap {
  /**
   * @param {number} chunkSize — размер чанка в тайлах (по умолчанию 30)
   * @param {number} worldSeed — общий сид мира (если нужен повторяемый результат)
   */
  constructor(chunkSize = 30, worldSeed = Math.floor(Math.random()*0xFFFFFFFF)) {
    this.chunkSize = chunkSize;
    this.worldSeed = worldSeed;
    this.chunks    = new Map();     // Map<"cx,cy", { tiles: string[][], meta: MetaCell[][] }>
    this.generating = new Set();    // чтобы избежать рекурсивных вызовов
  }

  /** Убедиться, что чанк (cx,cy) сгенерирован */
  ensureChunk(cx, cy) {
    const key = `${cx},${cy}`;
    if (this.chunks.has(key) || this.generating.has(key)) return;
    this.generating.add(key);

    // 1) Генерация тайлов: 'W' = стена, '.' = пол
    const tiles = this._generateChunk(cx, cy);

    // 2) Метаданные: memoryAlpha, visited
    const meta = Array.from({ length: this.chunkSize }, () =>
      Array.from({ length: this.chunkSize }, () => ({
        memoryAlpha: 0,
        visited: false
      }))
    );

    // 3) Сохраняем чанк
    this.chunks.set(key, { tiles, meta });
    this.generating.delete(key);
  }

  /** Проверка, что глобальная клетка (gx, gy) — пол */
  isFloor(gx, gy) {
    const cx = Math.floor(gx / this.chunkSize);
    const cy = Math.floor(gy / this.chunkSize);
    const key = `${cx},${cy}`;
    const c = this.chunks.get(key);
    if (!c) return false;
    const lx = gx - cx * this.chunkSize;
    const ly = gy - cy * this.chunkSize;
    if (lx < 0 || ly < 0 || lx >= this.chunkSize || ly >= this.chunkSize) return false;
    return (c.tiles[ly][lx] === '.');
  }

  /**
   * Пакетная перегенерация чанков, ключи в keys:
   * сохраняет все тайлы, где memoryAlpha>0 или в current FOV.
   */
  regenerateChunksPreserveFOV(keys, computeFOV, player) {
    const vis = computeFOV(player.x, player.y, player.angle);
    for (let key of keys) {
      const [cx, cy] = key.split(',').map(Number);
      const old = this.chunks.get(key);
      if (!old) continue;
      // собрать стэш
      const stash = [];
      const baseX = cx * this.chunkSize, baseY = cy * this.chunkSize;
      for (let ly = 0; ly < this.chunkSize; ly++) {
        for (let lx = 0; lx < this.chunkSize; lx++) {
          const gx = baseX + lx, gy = baseY + ly;
          const coord = `${gx},${gy}`;
          const m = old.meta[ly][lx];
          if (vis.has(coord) || m.memoryAlpha > 0) {
            stash.push({ lx, ly,
              tile: old.tiles[ly][lx],
              meta: { memoryAlpha: m.memoryAlpha, visited: m.visited }
            });
          }
        }
      }
      // удалить старый и сгенерировать новый
      this.chunks.delete(key);
      this.ensureChunk(cx, cy);
      const fresh = this.chunks.get(key);
      // восстановить сохранённое
      for (let s of stash) {
        fresh.tiles[s.ly][s.lx] = s.tile;
        fresh.meta[s.ly][s.lx]  = s.meta;
      }
    }
  }

  // ————— Внутренние утилиты —————

  /** Линейный конгруэнтный PRNG на основе общего worldSeed и координат */
  _rng(seedOffset) {
    // simple LCG: x_{n+1} = (a x_n + c) mod m
    const m = 0x80000000, a = 1103515245, c = 12345;
    let x = (this.worldSeed ^ seedOffset) >>> 0;
    return () => {
      x = (a * x + c) % m;
      return x / m;
    };
  }

  /**
   * Генерация одного чанка (cx, cy):
   * — carveCorridors()
   * — carveRooms()
   * Возвращает tiles[y][x] как 'W' или '.'.
   */
  _generateChunk(cx, cy) {
    const S = this.chunkSize;
    // инициализация стенами
    const tiles = Array.from({ length: S }, () => Array(S).fill('W'));
    const rng   = this._rng(cx * 37 + cy * 101);

    // 1) Определяем baseline для коридоров так, чтобы стыковаться в соседних чанках:
    //    значения в [6, S-8], одинаковые для всей колонки и всей строки.
    const crossX = 6 + Math.floor(rng() * (S - 14));
    const crossY = 6 + Math.floor(rng() * (S - 14));

    // Вспомогательные для мелких изгибов
    let segLenV = 0, jogRight = rng() < 0.5;
    let segLenH = 0, jogDown  = rng() < 0.5;

    // carve vertical corridor (2-wide) with occasional jogs
    for (let y = 0; y < S; y++) {
      tiles[y][crossX]   = '.';
      tiles[y][crossX+1] = '.';
      segLenV++;
      if (segLenV >= 25 && y < S-2) {
        // проводим небольшой горизонтальный изгиб
        const dir = jogRight ? 1 : -1;
        if (crossX+dir >= 1 && crossX+dir+1 < S) {
          tiles[y][crossX+dir]   = '.';
          tiles[y][crossX+dir+1] = '.';
          const ny = y+1;
          tiles[ny][crossX+dir]   = '.';
          tiles[ny][crossX+dir+1] = '.';
          crossX += dir;
        }
        segLenV = 0;
        jogRight = !jogRight;
      }
    }

    // carve horizontal corridor (2-high) with occasional jogs
    for (let x = 0; x < S; x++) {
      tiles[crossY][x]   = '.';
      tiles[crossY+1][x] = '.';
      segLenH++;
      if (segLenH >= 25 && x < S-2) {
        // небольшой вертикальный изгиб
        const dir = jogDown ? 1 : -1;
        if (crossY+dir >= 1 && crossY+dir+1 < S) {
          tiles[crossY+dir][x]   = '.';
          tiles[crossY+dir+1][x] = '.';
          const nx = x+1;
          tiles[crossY+dir][nx]   = '.';
          tiles[crossY+dir+1][nx] = '.';
          crossY += dir;
        }
        segLenH = 0;
        jogDown = !jogDown;
      }
    }

    // 2) Закрываем стены вдоль коридоров:
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        if (tiles[y][x] === '.') {
          [[x-1,y],[x+1,y],[x,y-1],[x,y+1]].forEach(([nx,ny]) => {
            if (nx>=0&&nx<S&&ny>=0&&ny<S && tiles[ny][nx]!=='.') {
              tiles[ny][nx] = 'W';
            }
          });
        }
      }
    }

    // 3) Определяем 4 региона, разбитые коридорами:
    const regs = [
      { x1:0,     x2:crossX-2, y1:0,     y2:crossY-2, side:'BR' }, // top-left
      { x1:crossX+2,x2:S-1,    y1:0,     y2:crossY-2, side:'BL' }, // top-right
      { x1:0,     x2:crossX-2, y1:crossY+2,y2:S-1,   side:'TR' }, // bottom-left
      { x1:crossX+2,x2:S-1,    y1:crossY+2,y2:S-1,   side:'TL' }  // bottom-right
    ];

    // 4) В каждом регионе создаём комнату (или 2, если большой):
    const rooms = [];
    regs.forEach(reg => {
      const rw = reg.x2 - reg.x1 + 1;
      const rh = reg.y2 - reg.y1 + 1;
      if (rw < 5 || rh < 5) return;

      // количество комнат: 1 или 2 (если регион >10 по одной стороне)
      const splitH = rh > 12, splitV = rw > 12;
      if (!splitH && !splitV) {
        rooms.push(...this._makeRoomInRegion(reg, rng, rw, rh));
      } else {
        // разбиваем пополам по большей стороне
        if (splitV) {
          // вертикальный сплит
          const mid = Math.floor((reg.x1 + reg.x2)/2);
          const r1 = { ...reg, x2: mid-1 };
          const r2 = { ...reg, x1: mid+1 };
          rooms.push(...this._makeRoomInRegion(r1, rng, mid - reg.x1, rh));
          rooms.push(...this._makeRoomInRegion(r2, rng, reg.x2-mid, rh));
          // стена-разделитель:
          for (let y=reg.y1; y<=reg.y2; y++) tiles[y][mid] = 'W';
        } else {
          // горизонтальный сплит
          const mid = Math.floor((reg.y1 + reg.y2)/2);
          const r1 = { ...reg, y2: mid-1 };
          const r2 = { ...reg, y1: mid+1 };
          rooms.push(...this._makeRoomInRegion(r1, rng, rw, mid - reg.y1));
          rooms.push(...this._makeRoomInRegion(r2, rng, rw, reg.y2-mid));
          for (let x=reg.x1; x<=reg.x2; x++) tiles[mid][x] = 'W';
        }
      }
    });

    // 5) Возвращаем готовую сетку
    return tiles;
  }

  /**
   * Создаёт одну комнату в заданном регионе reg,
   * где rw = width of region, rh = height of region.
   * Возвращает [room], где room = {x,y,w,h,attachSide}.
   */
  _makeRoomInRegion(reg, rng, rw, rh) {
    // там, где reg.side = 'BR' → attach to Bottom or Right → choose randomly
    const sides = {
      'BR': ['bottom','right'],
      'BL': ['bottom','left'],
      'TR': ['top','right'],
      'TL': ['top','left']
    }[reg.side];
    const attach = sides[Math.floor(rng() * sides.length)];

    // размер комнаты: 5..10, среднее 7 likelier via triangular distribution
    const pickSize = () => {
      const a = 5 + Math.floor(rng()*6);
      const b = 5 + Math.floor(rng()*6);
      return Math.min(10, Math.max(5, Math.floor((a + b)/2)));
    };
    const w = pickSize();
    const h = pickSize();
    // смещение внутри региона по оставшейся оси
    let x, y;
    if (attach === 'bottom') {
      y = reg.y2 - h + 1;
      x = reg.x1 + Math.floor(rng() * (rw - w + 1));
    } else if (attach === 'top') {
      y = reg.y1;
      x = reg.x1 + Math.floor(rng() * (rw - w + 1));
    } else if (attach === 'left') {
      x = reg.x1;
      y = reg.y1 + Math.floor(rng() * (rh - h + 1));
    } else {
      x = reg.x2 - w + 1;
      y = reg.y1 + Math.floor(rng() * (rh - h + 1));
    }
    // carve floor and perimeter walls + door
    this._carveRoom(x,y,w,h,attach);

    return [{ x,y,w,h,attachSide:attach }];
  }

  /**
   * Вырезает комнату по x,y,w,h и добавляет дверь 1..3 тайла
   */
  _carveRoom(x, y, w, h, side) {
    const S = this.chunkSize;
    // carve interior
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        this.chunks
          .get(`${Math.floor(xx/S)},${Math.floor(yy/S)}`)
          .tiles[yy%S][xx%S] = '.';
      }
    }
    // carve door
    const len = 1 + Math.floor(Math.random()*3);
    if (side === 'bottom') {
      const py = y + h;
      const px0 = x + Math.floor((w-len)/2);
      for (let dx=0; dx<len; dx++) {
        this._open(px0+dx, py);
      }
    } else if (side === 'top') {
      const py = y - 1;
      const px0 = x + Math.floor((w-len)/2);
      for (let dx=0; dx<len; dx++) this._open(px0+dx, py);
    } else if (side === 'left') {
      const px = x - 1;
      const py0 = y + Math.floor((h-len)/2);
      for (let dy=0; dy<len; dy++) this._open(px, py0+dy);
    } else { // right
      const px = x + w;
      const py0 = y + Math.floor((h-len)/2);
      for (let dy=0; dy<len; dy++) this._open(px, py0+dy);
    }
  }

  /** Превращает глобальную клетку (gx,gy) в пол, создавая дверь */
  _open(gx, gy) {
    const cx = Math.floor(gx / this.chunkSize);
    const cy = Math.floor(gy / this.chunkSize);
    const key = `${cx},${cy}`;
    const chunk = this.chunks.get(key);
    if (!chunk) return;
    const lx = ((gx % this.chunkSize)+this.chunkSize)%this.chunkSize;
    const ly = ((gy % this.chunkSize)+this.chunkSize)%this.chunkSize;
    chunk.tiles[ly][lx] = '.';
  }
}

// экспорт для game.js
window.GameMap = GameMap;