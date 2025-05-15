// map.js

// Типы тайлов
var WALL  = 0;
var FLOOR = 1;

// Размеры одного чанка (в клетках)
var CHUNK_W = 30;
var CHUNK_H = 30;

// Хранилище всех чанков: key = "cx,cy" → { tiles, exits, regenCount, meta? }
var worldChunks = new Map();

/**
 * Создаёт 2D-массив [height][width], заполненный value.
 */
function createEmptyTiles(width, height, value) {
  var a = [];
  for (var y = 0; y < height; y++) {
    a[y] = [];
    for (var x = 0; x < width; x++) {
      a[y][x] = value;
    }
  }
  return a;
}

/**
 * Основной генератор чанка: чистое генерирование «с нуля»,
 * каждый раз вызывает новую seed-ную генерацию, в том числе
 * если чанку уже делали regenCount>0.
 */
function generateChunk(cx, cy) {
  var key = cx + "," + cy;
  var prev = worldChunks.get(key);
  var regenCount = prev ? prev.regenCount + 1 : 1;

  // Seed-random (если подключён seedrandom.js)
  if (Math.seedrandom) {
    Math.seedrandom("worldSeed|" + key + "|" + regenCount);
  }

  // 1) чистый массив стен
  var tiles = createEmptyTiles(CHUNK_W, CHUNK_H, WALL);

  // 2) рисуем пещеры/туннели
  carveRandomCaves(tiles);

  // 3) убираем диагонали и расширяем узкие проходы
  fixDiagonalsAndCorridors(tiles);

  // 4) удаляем тупики (пробиваем тоннель к краю)
  removeDeadEnds(tiles);

  // 5) извлекаем выходы на границе
  var exits = extractBorderExits(tiles);

  // сохраняем
  worldChunks.set(key, { tiles: tiles, exits: exits, regenCount: regenCount });
  return worldChunks.get(key);
}

/** Пример простой генерации: случайное блуждание */
function carveRandomCaves(tiles) {
  var x = Math.floor(CHUNK_W/2), y = Math.floor(CHUNK_H/2);
  tiles[y][x] = FLOOR;
  var steps = CHUNK_W * CHUNK_H;
  for (var i = 0; i < steps; i++) {
    var dir = Math.floor(Math.random()*4);
    if (dir===0 && x<CHUNK_W-1) x++;
    else if (dir===1 && x>0) x--;
    else if (dir===2 && y<CHUNK_H-1) y++;
    else if (dir===3 && y>0) y--;
    tiles[y][x] = FLOOR;
  }
}

/** Убираем диагональные «дыры» и расширяем узкие коридоры до 2 клеток */
function fixDiagonalsAndCorridors(t) {
  // избегаем выхода за границы при [y+1] или [x+1]
  for (var y = 1; y < CHUNK_H - 1; y++) {
    for (var x = 1; x < CHUNK_W - 1; x++) {
      if (t[y][x] !== FLOOR) continue;

      // диагонали
      if (t[y-1][x-1] === FLOOR && t[y-1][x] === WALL && t[y][x-1] === WALL) {
        t[y-1][x] = FLOOR;
      }
      if (t[y-1][x+1] === FLOOR && t[y-1][x] === WALL && t[y][x+1] === WALL) {
        t[y-1][x] = FLOOR;
      }
      if (t[y+1][x-1] === FLOOR && t[y][x-1] === WALL && t[y+1][x] === WALL) {
        t[y][x-1] = FLOOR;
      }
      if (t[y+1][x+1] === FLOOR && t[y][x+1] === WALL && t[y+1][x] === WALL) {
        t[y][x+1] = FLOOR;
      }

      // узкие вертикальные коридоры
      if (t[y][x-1] === WALL && t[y][x+1] === WALL &&
          (t[y-1][x] === FLOOR || t[y+1][x] === FLOOR)) {
        t[y][x+1] = FLOOR;
      }
      // узкие горизонтальные коридоры
      if (t[y-1][x] === WALL && t[y+1][x] === WALL &&
          (t[y][x-1] === FLOOR || t[y][x+1] === FLOOR)) {
        t[y+1][x] = FLOOR;
      }
    }
  }
}

/**
 * Удаляет тупики: где 3 стены → пробивает прямой коридор до границы чанка
 */
function removeDeadEnds(t) {
  for (var y = 1; y < CHUNK_H - 1; y++) {
    for (var x = 1; x < CHUNK_W - 1; x++) {
      if (t[y][x] !== FLOOR) continue;
      var walls = 0;
      if (t[y-1][x] === WALL) walls++;
      if (t[y+1][x] === WALL) walls++;
      if (t[y][x-1] === WALL) walls++;
      if (t[y][x+1] === WALL) walls++;
      if (walls >= 3) carveExitToBorder(t, x, y);
    }
  }
}

/** Пробивает прямой коридор от (sx,sy) до ближайшей границы чанка */
function carveExitToBorder(t, sx, sy) {
  var dl = sx, dr = CHUNK_W-1 - sx;
  var dt = sy, db = CHUNK_H-1 - sy;
  var m  = Math.min(dl, dr, dt, db);
  if (m === dl) for (var x = sx; x >= 0; x--) t[sy][x] = FLOOR;
  else if (m === dr) for (var x = sx; x < CHUNK_W;  x++) t[sy][x] = FLOOR;
  else if (m === dt) for (var y = sy; y >= 0; y--) t[y][sx] = FLOOR;
  else             for (var y = sy; y < CHUNK_H;  y++) t[y][sx] = FLOOR;
}

/**
 * Собирает все открытые клетки по границам чанка
 * и возвращает { north:[], south:[], west:[], east:[] }
 */
function extractBorderExits(t) {
  var e = { north:[], south:[], west:[], east:[] };
  for (var x = 1; x < CHUNK_W - 1; x++) {
    if (t[0][x] === FLOOR)                    e.north.push({x:x, y:0});
    if (t[CHUNK_H-1][x] === FLOOR)            e.south.push({x:x, y:CHUNK_H-1});
  }
  for (var y = 1; y < CHUNK_H - 1; y++) {
    if (t[y][0] === FLOOR)                    e.west.push({x:0, y:y});
    if (t[y][CHUNK_W-1] === FLOOR)            e.east.push({x:CHUNK_W-1, y:y});
  }
  return e;
}

/** Ленивое создание чанка по координатам */
function ensureChunk(cx, cy) {
  var key = cx + "," + cy;
  if (!worldChunks.has(key)) {
    generateChunk(cx, cy);
    connectChunkToNeighbors(cx, cy);
  }
}

/** Стыкуем выходы нового чанка с уже загруженными соседями */
function connectChunkToNeighbors(cx, cy) {
  var key   = cx + "," + cy;
  var chunk = worldChunks.get(key);
  var dirs  = [
    { dx:0,  dy:-1, side:"north", opp:"south" },
    { dx:0,  dy: 1, side:"south", opp:"north" },
    { dx:-1, dy:0,  side:"west",  opp:"east"  },
    { dx: 1, dy:0,  side:"east",  opp:"west"  }
  ];
  dirs.forEach(function(d) {
    var nk = (cx+d.dx) + "," + (cy+d.dy);
    if (!worldChunks.has(nk)) return;
    var nCh = worldChunks.get(nk);
    // для каждого выхода на нашей стороне — прорезаем ответный в соседнем
    chunk.exits[d.side].forEach(function(p) {
      nCh.tiles[p.y][p.x] = FLOOR;
    });
  });
}

/**
 * Проверка стеной ли является глобальная клетка
 */
function isWall(gx, gy) {
  if (gx < 0 || gy < 0) return true;
  var cx = Math.floor(gx/CHUNK_W),
      cy = Math.floor(gy/CHUNK_H);
  ensureChunk(cx, cy);
  var lx = ((gx%CHUNK_W)+CHUNK_W)%CHUNK_W,
      ly = ((gy%CHUNK_H)+CHUNK_H)%CHUNK_H;
  return worldChunks.get(cx+","+cy).tiles[ly][lx] === WALL;
}

/**
 * Перегенерация забытых чанков:
 * для каждого key="cx,cy" из chunksSet
 * — полностью генерируем заново (bump regenCount),
 * — затем восстанавливаем только FOV-тайлы,
 * — остальные (memoryAlpha===0) остаются новыми.
 */
function regenerateChunksPreserveFOV(chunksSet, computeFOV, player) {
  chunksSet.forEach(function(key) {
    var parts = key.split(","), cx=+parts[0], cy=+parts[1];
    // 1) сохраним FOV-тайлы
    var vis = computeFOV(player.x, player.y, player.angle);
    var saved = [];
    vis.forEach(function(k) {
      var p = k.split(","), gx=+p[0], gy=+p[1];
      if (Math.floor(gx/CHUNK_W)===cx && Math.floor(gy/CHUNK_H)===cy) {
        var lx = ((gx%CHUNK_W)+CHUNK_W)%CHUNK_W,
            ly = ((gy%CHUNK_H)+CHUNK_H)%CHUNK_H;
        var tile = worldChunks.get(key).tiles[ly][lx];
        saved.push({ gx:gx, gy:gy, type: tile });
      }
    });
    // 2) полностью реген чанк
    worldChunks.delete(key);
    generateChunk(cx, cy);
    connectChunkToNeighbors(cx, cy);
    // 3) восстановим FOV-тайлы
    var chunk = worldChunks.get(key);
    saved.forEach(function(s) {
      var lx = ((s.gx%CHUNK_W)+CHUNK_W)%CHUNK_W,
          ly = ((s.gy%CHUNK_H)+CHUNK_H)%CHUNK_H;
      chunk.tiles[ly][lx] = s.type;
    });
  });
}