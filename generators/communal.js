// generators/communal.js
//
// Генератор “советской коммуналки”
// ─ 4-8 комнат размером 4×4…8×8
// ─ коридоры шириной 2 тайла
// ─ дверь (type 'door') – единственный стык room↔hall
//
// Функция generateTiles(tiles) вызывается из map.js и
// напрямую изменяет переданный массив tiles[S][S].

function rand(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}
function overlap(x, y, w, h, r) {
  return !(
    r.minX > x + w - 1 ||
    r.maxX < x ||
    r.minY > y + h - 1 ||
    r.maxY < y
  );
}

/** Вырезаем комнаты и возвращаем массив описаний */
function carveRooms(tiles) {
  const S = tiles.length, rooms = [];
  const CNT = rand(4, 8);
  for (let i = 0; i < CNT; i++) {
    const w = rand(4, 8), h = rand(4, 8);
    const x = rand(1, S - w - 2), y = rand(1, S - h - 2);
    if (rooms.some(r => overlap(x - 1, y - 1, w + 2, h + 2, r))) { i--; continue; }
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++)
        tiles[yy][xx] = 'room';
    rooms.push({ minX: x, minY: y, maxX: x + w - 1, maxY: y + h - 1,
                 cx: x + Math.floor(w / 2), cy: y + Math.floor(h / 2) });
  }
  return rooms;
}

/** Прокладываем L-образные коридоры, ставим двери */
function corridorsAndDoors(tiles, rooms) {
  rooms.sort((a, b) => a.cx - b.cx);               // цепочка по X
  for (let i = 1; i < rooms.length; i++) {
    const A = rooms[i - 1], B = rooms[i];
    let x = A.cx, y = A.cy;

    // горизонтальный сегмент
    while (x !== B.cx) {
      x += Math.sign(B.cx - x);
      carveTile(tiles, x, y);
    }
    // вертикальный сегмент
    while (y !== B.cy) {
      y += Math.sign(B.cy - y);
      carveTile(tiles, x, y);
    }
  }
}

/** Правило: если тайл 'wall' → превращаем в 'hall' (с утолщением 2 тайла);
 * если 'room' — ставим 'door'. */
function carveTile(tiles, x, y) {
  const H = tiles.length, W = tiles[0].length;
  if (tiles[y][x] === 'room') { tiles[y][x] = 'door'; return; }
  if (tiles[y][x] === 'wall') {
    tiles[y][x] = 'hall';
    // коридор шириной 2 тайла
    if (y + 1 < H && tiles[y + 1][x] === 'wall') tiles[y + 1][x] = 'hall';
    if (x + 1 < W && tiles[y][x + 1] === 'wall') tiles[y][x + 1] = 'hall';
  }
}

/** Точка входа для map.js */
export function generateTiles(tiles) {
  const rooms = carveRooms(tiles);          // 1. комнаты
  corridorsAndDoors(tiles, rooms);          // 2. коридоры + двери
}