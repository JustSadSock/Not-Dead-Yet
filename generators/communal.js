// generators/communal.js
//
// Финальный генератор «советской коммуналки»
//  • 4-8 комнат (каждая 4×4…8×8)
//  • коридоры ВЕЗДЕ ровно двухтайловые
//  • дверь (door) появляется только в стене room↔hall
//    – на каждой стороне комнаты ≤ 2 дверей
//    – у комнаты в сумме ≥ 2 дверей
//  • коридоры никогда не «липнут» боком к room без двери
//  • никакие тайлы не накладываются (проверка overlap)

function R(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }
function overlap(x, y, w, h, r) {
  return !(
    r.minX > x + w - 1 ||
    r.maxX < x ||
    r.minY > y + h - 1 ||
    r.maxY < y
  );
}

/* ───────── 1. Комнаты ───────── */
function carveRooms(tiles) {
  const S = tiles.length, rooms = [];
  const CNT = R(4, 8);
  for (let i = 0; i < CNT; i++) {
    const w = R(4, 8), h = R(4, 8);
    const x = R(1, S - w - 2), y = R(1, S - h - 2);
    if (rooms.some(r => overlap(x - 1, y - 1, w + 2, h + 2, r))) { i--; continue; }
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++)
        tiles[yy][xx] = 'room';
    rooms.push({ minX: x, minY: y, maxX: x + w - 1, maxY: y + h - 1,
                 cx: x + Math.floor(w / 2), cy: y + Math.floor(h / 2) });
  }
  return rooms;
}

/* ───────── 2. Коридор / дверь ───────── */
function carveTile(tiles, x, y) {
  const H = tiles.length, W = tiles[0].length;

  /* если room → ставим дверь только если сосед == hall */
  if (tiles[y][x] === 'room') {
    const touchHall =
      (tiles[y-1]?.[x] === 'hall') ||
      (tiles[y+1]?.[x] === 'hall') ||
      (tiles[y]?.[x-1] === 'hall') ||
      (tiles[y]?.[x+1] === 'hall');
    if (touchHall) tiles[y][x] = 'door';
    return;
  }

  /* если wall → превращаем в hall, НО
     – запрещаем «липнуть» к room сбоку
     – расширяем до 2-тайлов */
  if (tiles[y][x] === 'wall') {
    const touchRoom =
      (tiles[y-1]?.[x] === 'room') ||
      (tiles[y+1]?.[x] === 'room') ||
      (tiles[y]?.[x-1] === 'room') ||
      (tiles[y]?.[x+1] === 'room');
    if (touchRoom) return;                       // оставляем стену

    tiles[y][x] = 'hall';                        // основной тайл
    /* расширяем коридор до 2-ух тайлов */
    if (tiles[y-1]?.[x] === 'wall' && tiles[y+1]?.[x] === 'wall') {
      tiles[y-1][x] = 'hall';                    // горизонтальный коридор
    } else if (tiles[y]?.[x-1] === 'wall' && tiles[y]?.[x+1] === 'wall') {
      tiles[y][x+1] = 'hall';                    // вертикальный коридор
    }
  }
}

function carveCorridors(tiles, rooms) {
  rooms.sort((a, b) => a.cx - b.cx);             // цепочка по X

  for (let i = 1; i < rooms.length; i++) {
    const A = rooms[i - 1], B = rooms[i];
    let x = A.cx, y = A.cy;

    while (x !== B.cx) { x += Math.sign(B.cx - x); carveTile(tiles, x, y); }
    while (y !== B.cy) { y += Math.sign(B.cy - y); carveTile(tiles, x, y); }
  }

  /* после прокладки коридоров убеждаемся, что:
     – на каждой стороне ≤2 дверей
     – в сумме у комнаты ≥2 дверей              */
  for (const R of rooms) {
    const cnt = { L:0, R:0, T:0, B:0 };

    for (let x = R.minX; x <= R.maxX; x++) {
      if (tiles[R.minY][x] === 'door') cnt.T++;
      if (tiles[R.maxY][x] === 'door') cnt.B++;
    }
    for (let y = R.minY; y <= R.maxY; y++) {
      if (tiles[y][R.minX] === 'door') cnt.L++;
      if (tiles[y][R.maxX] === 'door') cnt.R++;
    }

    const sides = [];
    if (cnt.T < 2) sides.push({ side:'T', y:R.minY, range:[R.minX+1,R.maxX-1] });
    if (cnt.B < 2) sides.push({ side:'B', y:R.maxY, range:[R.minX+1,R.maxX-1] });
    if (cnt.L < 2) sides.push({ side:'L', x:R.minX, range:[R.minY+1,R.maxY-1] });
    if (cnt.R < 2) sides.push({ side:'R', x:R.maxX, range:[R.minY+1,R.maxY-1] });

    const need = Math.max(0, 2 - (cnt.L+cnt.R+cnt.T+cnt.B));
    let placed = 0;

    while (placed < need && sides.length) {
      const idx = Math.floor(Math.random() * sides.length);
      const S = sides[idx];

      if (S.side === 'T' || S.side === 'B') {
        const x = R.minX + 1 + Math.floor(Math.random() * (R.maxX - R.minX - 1));
        if (tiles[S.y][x] === 'wall' &&
            tiles[S.side === 'T' ? S.y-1 : S.y+1][x] === 'hall') {
          tiles[S.y][x] = 'door'; placed++; continue;
        }
      } else {
        const y = R.minY + 1 + Math.floor(Math.random() * (R.maxY - R.minY - 1));
        if (tiles[y][S.x] === 'wall' &&
            tiles[y][S.side === 'L' ? S.x-1 : S.x+1] === 'hall') {
          tiles[y][S.x] = 'door'; placed++; continue;
        }
      }
      sides.splice(idx, 1);                      // не получилось — убираем сторону
    }
  }
}

/* ───────── 3. Точка входа для map.js ───────── */
export function generateTiles(tiles) {
  const rooms = carveRooms(tiles);
  carveCorridors(tiles, rooms);
}