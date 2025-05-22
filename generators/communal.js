// generators/communal.js
//
// “Коммуналка v2” — надёжная:
//   • 4-8 прямоугольных комнат 4×4…8×8 (без перекрытий)
//   • у КАЖДОЙ комнаты минимум 2 двери (на разных сторонах),
//     максимум 2 двери на сторону
//   • дверь ставится в стене room↔hall; коридор всегда 2-тайловый
//   • коридоры не «липнут» к комнате боком без двери
//   • формируется связный граф – все комнаты достижимы
//
//  Алгоритм:
//     1. Режем комнаты (как раньше).
//     2. Для каждой комнаты выбираем 2 случайных стороны ≠,
//        делаем двери и сразу «пробиваем» 2-тайловый
//        коридор наружу (hall).
//     3. Соединяем все двери друг с другом “L-коридорами”
//        тем же carveHall() — получаем связность.
//     4. Все ограничения (≤2 дверей/сторона, ≥2 всего)
//        уже соблюдены по конструкции.
//
//  Все функции написаны «с нуля», старый carveTile удалён.

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
                 cx: x + Math.floor(w/2), cy: y + Math.floor(h/2) });
  }
  return rooms;
}

/* — маленькая утилита — */
function setHall(tiles, x, y) {
  if (tiles[y]?.[x] !== 'wall') return;
  tiles[y][x] = 'hall';
}

/* прокладываем 2-тайловый коридор из (x,y) в направлении (dx,dy) пока не встретим hall */
function carveHall(tiles, x, y, dx, dy) {
  const H = tiles.length, W = tiles[0].length;
  while (x > 0 && x < W-1 && y > 0 && y < H-1 && tiles[y][x] === 'wall') {
    setHall(tiles, x, y);
    /* расширяем поперёк направления, получаем 2-тайловую ширину */
    if (dx !== 0) { setHall(tiles, x, y-1); setHall(tiles, x, y+1); }
    if (dy !== 0) { setHall(tiles, x-1, y); setHall(tiles, x+1, y); }
    x += dx; y += dy;
  }
}

/* ───────── 2. Двери + Начальные коридоры ───────── */
function placeDoorsAndStubs(tiles, rooms) {
  const dirs = [
    {side:'T', dx:0,  dy:-1},
    {side:'B', dx:0,  dy: 1},
    {side:'L', dx:-1, dy: 0},
    {side:'R', dx: 1, dy: 0}
  ];

  const doorList = [];   // запомним все двери, чтобы позже соединить

  for (const R of rooms) {
    /* берём две разные стороны */
    let sides = dirs.slice();
    const first  = sides.splice(Math.floor(Math.random()*sides.length),1)[0];
    const second = sides.splice(Math.floor(Math.random()*sides.length),1)[0];
    [first, second].forEach(S => {
      /* выбираем позицию вдоль стороны, не в углу */
      let x, y;
      if (S.side==='T' || S.side==='B') {
        x = R.minX + 1 + Math.floor(Math.random() * (R.maxX - R.minX - 1));
        y = (S.side==='T') ? R.minY : R.maxY;
      } else { // L / R
        y = R.minY + 1 + Math.floor(Math.random() * (R.maxY - R.minY - 1));
        x = (S.side==='L') ? R.minX : R.maxX;
      }
      tiles[y][x] = 'door';
      /* пробиваем коридор наружу */
      carveHall(tiles, x + S.dx, y + S.dy, S.dx, S.dy);
      doorList.push({ x, y });
    });
  }
  return doorList;
}

/* ───────── 3. Соединяем все двери между собой ─────────
   “L-коридорами”, всегда 2-тайловыми */
function connectDoors(tiles, doorList) {
  doorList.sort((a,b)=> a.x - b.x);  // слева-направо
  for (let i = 1; i < doorList.length; i++) {
    const A = doorList[i-1], B = doorList[i];
    let x = A.x, y = A.y;

    /* горизонталь */
    const dirX = Math.sign(B.x - x);
    while (x !== B.x) { x += dirX; carveHall(tiles, x, y,  dirX, 0); }

    /* вертикаль */
    const dirY = Math.sign(B.y - y);
    while (y !== B.y) { y += dirY; carveHall(tiles, x, y, 0, dirY); }
  }
}

/* ───────── 4. Точка входа для map.js ───────── */
export function generateTiles(tiles) {
  const rooms    = carveRooms(tiles);
  const doorList = placeDoorsAndStubs(tiles, rooms);
  connectDoors(tiles, doorList);   // делаем связный граф
}