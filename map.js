/**
 * map.js
 *
 * Полная логика бесконечной процедурной генерации карты чанками,
 * динамической подгрузки/выгрузки и механики «забывания» с повторной
 * генерацией забытых областей (за исключением текущего поля зрения).
 *
 * Использует детерминированный PRNG (seedrandom.js) для повторяемости чанков.
 */

// ============================================================================
//  Константы и хранилище чанков
// ============================================================================
const WALL  = 0;
const FLOOR = 1;

// Размер одного чанка в тайлах
const CHUNK_W = 30;
const CHUNK_H = 30;

// Глобальное хранилище сгенерированных чанков
// Ключ: "cx,cy" → значение: объект { tiles: [...], exits: {...}, regenCount: N }
const worldChunks = new Map();

// ============================================================================
//  Функция генерации пустого массива тайлов (filledValue = WALL или FLOOR)
// ============================================================================
function createEmptyTiles(width, height, filledValue = WALL) {
  const arr = new Array(height);
  for (let y = 0; y < height; y++) {
    arr[y] = new Array(width).fill(filledValue);
  }
  return arr;
}

// ============================================================================
//  Основная функция генерации чанка по координатам (cx, cy)
//  Возвращает объект { tiles, exits, regenCount }.
//  Для повторной генерации гарантирует новый состав лабиринта.
// ============================================================================
function generateChunk(cx, cy) {
  // 1) Детерминированный PRNG на основе глобального seed + координаты + порядковый номер регена
  const key        = `${cx},${cy}`;
  const prev       = worldChunks.get(key);
  const regenCount = prev ? prev.regenCount + 1 : 1;
  // Зерно: фиксированное мировое + координаты + count
  if (Math.seedrandom) {
    Math.seedrandom(`worldSeed|${cx},${cy}|${regenCount}`);
  }
  // 2) Создаём чистый массив стен
  const tiles = createEmptyTiles(CHUNK_W, CHUNK_H, WALL);
  // 3) Карвинговый алгоритм (пример – случайное блуждание)
  carveRandomCaves(tiles);
  // 4) Пост-обработка: устраняем диагонали и узкие коридоры
  fixDiagonalsAndCorridors(tiles);
  // 5) Пост-обработка: ищем тупики и пробиваем к границе
  removeDeadEnds(tiles);
  // 6) Подготавливаем структуру выходов (чтобы соседям прорезать ответные двери)
  const exits = extractBorderExits(tiles);

  // 7) Сохраняем и возвращаем чанковый объект
  const chunkObj = { tiles, exits, regenCount };
  worldChunks.set(key, chunkObj);
  return chunkObj;
}

// ============================================================================
//  Карвинг «случайных пещер» – простой пример генерации туннелей
// ============================================================================
function carveRandomCaves(tiles) {
  let x = Math.floor(CHUNK_W/2), y = Math.floor(CHUNK_H/2);
  tiles[y][x] = FLOOR;
  const steps = CHUNK_W * CHUNK_H;  // густота туннелей
  for (let i = 0; i < steps; i++) {
    const dir = Math.floor(Math.random() * 4);
    if (dir === 0 && x < CHUNK_W-1) x++;
    if (dir === 1 && x > 0)           x--;
    if (dir === 2 && y < CHUNK_H-1) y++;
    if (dir === 3 && y > 0)           y--;
    tiles[y][x] = FLOOR;
  }
}

// ============================================================================
//  Убираем диагональные «дыры» и расширяем узкие коридоры до 2 клеток
// ============================================================================
function fixDiagonalsAndCorridors(t) {
  for (let y = 1; y < CHUNK_H; y++) {
    for (let x = 1; x < CHUNK_W; x++) {
      if (t[y][x] !== FLOOR) continue;

      // 1) Диагонали
      if (t[y-1][x-1] === FLOOR && t[y-1][x] === WALL && t[y][x-1] === WALL) {
        t[y-1][x] = FLOOR;
      }
      if (t[y-1][x+1] === FLOOR && t[y-1][x] === WALL && t[y][x+1] === WALL) {
        t[y-1][x] = FLOOR;
      }
      if (t[y+1] && t[y+1][x-1] === FLOOR && t[y][x-1] === WALL && t[y+1][x] === WALL) {
        t[y][x-1] = FLOOR;
      }
      if (t[y+1] && t[y+1][x+1] === FLOOR && t[y][x+1] === WALL && t[y+1][x] === WALL) {
        t[y][x+1] = FLOOR;
      }

      // 2) Узкие вертикальные (стены слева/справа)
      if (t[y][x-1] === WALL && t[y][x+1] === WALL &&
          ((t[y-1] && t[y-1][x] === FLOOR) || (t[y+1] && t[y+1][x] === FLOOR))) {
        t[y][x+1] = FLOOR;
      }
      // 3) Узкие горизонтальные (стены сверху/снизу)
      if (t[y-1][x] === WALL && t[y+1][x] === WALL &&
          (t[y][x-1] === FLOOR || t[y][x+1] === FLOOR)) {
        t[y+1][x] = FLOOR;
      }
    }
  }
}

// ============================================================================
//  Удаляем все тупики – проламываем прямой туннель до ближайшей границы чанка
// ============================================================================
function removeDeadEnds(t) {
  for (let y = 1; y < CHUNK_H-1; y++) {
    for (let x = 1; x < CHUNK_W-1; x++) {
      if (t[y][x] !== FLOOR) continue;
      let walls = 0;
      if (t[y-1][x] === WALL) walls++;
      if (t[y+1][x] === WALL) walls++;
      if (t[y][x-1] === WALL) walls++;
      if (t[y][x+1] === WALL) walls++;
      if (walls >= 3) {
        // Тупик – прорываем выход к ближайшей границе
        carveExitToBorder(t, x, y);
      }
    }
  }
}

// Прямой коридор к границе чанка
function carveExitToBorder(t, sx, sy) {
  const dl = sx, dr = CHUNK_W-1 - sx;
  const dt = sy, db = CHUNK_H-1 - sy;
  const minDist = Math.min(dl, dr, dt, db);
  if (minDist === dl) {
    for (let x = sx; x >= 0; x--) t[sy][x] = FLOOR;
  } else if (minDist === dr) {
    for (let x = sx; x < CHUNK_W; x++) t[sy][x] = FLOOR;
  } else if (minDist === dt) {
    for (let y = sy; y >= 0; y--) t[y][sx] = FLOOR;
  } else {
    for (let y = sy; y < CHUNK_H; y++) t[y][sx] = FLOOR;
  }
}

// ============================================================================
//  Извлекаем все «выходы» на границах чанка, чтобы при генерации соседей
//  мы могли проделать ответный коридор.
//  Возвращает объект:
//    { north: [{x}], south: [...], west: [...], east: [...] }
// ============================================================================
function extractBorderExits(t) {
  const exits = { north:[], south:[], west:[], east:[] };
  // Север/юг
  for (let x = 1; x < CHUNK_W-1; x++) {
    if (t[0][x] === FLOOR) exits.north.push({ x, y:0 });
    if (t[CHUNK_H-1][x] === FLOOR) exits.south.push({ x, y:CHUNK_H-1 });
  }
  // Запад/восток
  for (let y = 1; y < CHUNK_H-1; y++) {
    if (t[y][0] === FLOOR) exits.west.push({ x:0, y });
    if (t[y][CHUNK_W-1] === FLOOR) exits.east.push({ x:CHUNK_W-1, y });
  }
  return exits;
}

// ============================================================================
//  «Ленивая» загрузка чанка: если ещё не было – генерируем.
// ============================================================================
function ensureChunk(cx, cy) {
  const key = `${cx},${cy}`;
  if (!worldChunks.has(key)) {
    generateChunk(cx, cy);
    // После генерации соединяем ответные переходы с соседями
    connectChunkToNeighbors(cx, cy);
  }
}

// Соединяем границы чанка (cx,cy) с уже загруженными соседями
function connectChunkToNeighbors(cx, cy) {
  const key   = `${cx},${cy}`;
  const chunk = worldChunks.get(key);
  const dirs  = [
    { dx:  0, dy:-1, side:'north', opp:'south' },
    { dx:  0, dy:+1, side:'south', opp:'north' },
    { dx:-1, dy: 0, side:'west',  opp:'east'  },
    { dx:+1, dy: 0, side:'east',  opp:'west'  }
  ];
  for (const {dx,dy,side,opp} of dirs) {
    const neighKey = `${cx+dx},${cy+dy}`;
    if (!worldChunks.has(neighKey)) continue;
    const nch = worldChunks.get(neighKey);
    // В chunk.exits[side] – список клеток на границе, где есть выход
    for (const pos of chunk.exits[side]) {
      // Прорезаем в соседнем чанке ответный коридор на opp-стороне
      // pos.x,pos.y – координаты на своей стороне
      let nx = pos.x + (dx* (side==='west'?0: side==='east'?0:0));
      let ny = pos.y + (dy* (side==='north'?0: side==='south'?0:0));
      // но проще: берем из nch.exits[opp] и тоже прорезаем
      for (const np of nch.exits[opp]) {
        nch.tiles[np.y][np.x] = FLOOR;
      }
    }
  }
}

// ============================================================================
//  Проверка коллизии: вызывает ensureChunk по необходимости
// ============================================================================
function isWall(globalX, globalY) {
  if (globalX < 0 || globalY < 0) return true;
  const cx = Math.floor(globalX / CHUNK_W);
  const cy = Math.floor(globalY / CHUNK_H);
  ensureChunk(cx, cy);
  const lx = ((globalX % CHUNK_W) + CHUNK_W) % CHUNK_W;
  const ly = ((globalY % CHUNK_H) + CHUNK_H) % CHUNK_H;
  return worldChunks.get(`${cx},${cy}`).tiles[ly][lx] === WALL;
}

// ============================================================================
//  МЕХАНИКА «ЗАБЫВАНИЯ» и повторной генерации: per-chunk regen
//  При каждом забывании (memoryAlpha→0) мы собираем чанки в Set
//  и через throttle вызываем эту функцию.
// ============================================================================
function regenerateChunksPreserveFOV(chunksSet, computeFOV, player) {
  for (const key of chunksSet) {
    const [cx, cy] = key.split(',').map(Number);

    // 1) сохраняем FOV-тайлы
    const vis     = computeFOV(player);
    const saved   = [];
    for (const k of vis) {
      const [gx, gy] = k.split(',').map(Number);
      if (Math.floor(gx/CHUNK_W)===cx && Math.floor(gy/CHUNK_H)===cy) {
        const localX = ((gx % CHUNK_W)+CHUNK_W)%CHUNK_W;
        const localY = ((gy % CHUNK_H)+CHUNK_H)%CHUNK_H;
        const tile   = worldChunks.get(key).tiles[localY][localX];
        saved.push({ gx, gy, type: tile });
      }
    }

    // 2) Полная новая генерация чанка (вызывает generateChunk → bump regenCount)
    worldChunks.delete(key);
    generateChunk(cx, cy);

    // 3) Патчим все ранее забытые тайлы (memoryAlpha===0) — они уже новые
    //    и сбрасываем visited (реализуется в game.js при рендере)
    //    (реализация хранения memoryAlpha и visited — в game.js)

    // 4) Восстанавливаем FOV-тайлы
    const chunk = worldChunks.get(key);
    for (const s of saved) {
      const lx = ((s.gx % CHUNK_W)+CHUNK_W)%CHUNK_W;
      const ly = ((s.gy % CHUNK_H)+CHUNK_H)%CHUNK_H;
      chunk.tiles[ly][lx] = s.type;
      // и далее в game.js при рендере установим memoryAlpha=1, visited=true
    }
  }
}

export {
  ensureChunk,
  isWall,
  regenerateChunksPreserveFOV,
  CHUNK_W,
  CHUNK_H,
  worldChunks
};