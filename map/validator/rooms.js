// map/rooms.js
export function carveRoomsAndHalls(S) {
  // 1) Начнём с чистого массива стен
  const tiles = Array.from({length: S}, () => Array(S).fill('wall'));

  // 2) Параметры комнат
  const ROOM_MIN  = 4;
  const ROOM_MAX  = 8;
  const ROOM_COUNT = 3 + Math.floor(Math.random() * 6); // от 3 до 8

  /** структура комнаты {minX,maxX,minY,maxY} */
  const rooms = [];

  for (let i = 0; i < ROOM_COUNT; i++) {
    // случайные размеры с вероятностью получить средние чаще
    const w = weightedRandom(ROOM_MIN, ROOM_MAX);
    const h = weightedRandom(ROOM_MIN, ROOM_MAX);
    const x = 1 + Math.floor(Math.random() * (S - w - 2));
    const y = 1 + Math.floor(Math.random() * (S - h - 2));

    // проверим, не пересекается ли с существующими + оставляем рамку в 1
    if (rooms.some(r => rectanglesOverlap(x-1, y-1, w+2, h+2, r))) {
      i--; continue;
    }
    rooms.push({minX: x, minY: y, maxX: x + w - 1, maxY: y + h -1});

    // вырезаем «пол» комнаты
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        tiles[yy][xx] = 'room';
      }
    }
  }

  // 3) Соединяем комнаты коридорами (двухпиксельной толщины)
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i-1], b = rooms[i];
    carveCorridor(tiles, a, b);
  }

  return { tiles, rooms };
}

// вспомогательные
function rectanglesOverlap(x,y,w,h, r) {
  return !(r.minX > x+w || r.maxX < x || r.minY > y+h || r.maxY < y);
}
function weightedRandom(min,max) {
  const mid = (min+max)/2;
  const r = Math.random(), w = Math.random(); 
  // сводим к нормальному распределению
  const v = Math.floor(min + (max-min) * ((r + w)/2) );
  return Math.min(max, Math.max(min, v|0));
}
function carveCorridor(tiles, a, b) {
  // начальная точка — центр a
  let x = Math.floor((a.minX + a.maxX)/2);
  let y = Math.floor((a.minY + a.maxY)/2);
  const tx = Math.floor((b.minX + b.maxX)/2);
  const ty = Math.floor((b.minY + b.maxY)/2);

  // сначала по X, потом по Y
  while (x !== tx) {
    tiles[y][x]     = 'hall';
    tiles[y+1] && (tiles[y+1][x] = 'hall');
    x += Math.sign(tx-x);
  }
  while (y !== ty) {
    tiles[y][x]     = 'hall';
    tiles[y][x+1] = 'hall';
    y += Math.sign(ty-y);
  }
}
export { carveRoomsAndHalls as findRooms };