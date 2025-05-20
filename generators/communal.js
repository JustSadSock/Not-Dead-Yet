// generators/communal.js

/**
 * Утилка: случайное целое в [min…max]
 */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Проверяет, пересекаются ли два прямоугольника.
 * Первый задан x,y,w,h, второй — объектом {minX,maxX,minY,maxY}.
 */
function rectsOverlap(x, y, w, h, r) {
  return !(
    r.minX > x + w - 1 ||
    r.maxX < x ||
    r.minY > y + h - 1 ||
    r.maxY < y
  );
}

/**
 * Вырезает в tiles N комнат (тип 'room'), возвращает массив описаний комнат.
 * Размеры комнат и их количество задаются в рамках «коммуналки».
 */
function carveRooms(tiles) {
  const S = tiles.length;
  const rooms = [];
  const ROOM_MIN = 4, ROOM_MAX = 8;
  const COUNT_MIN = 4, COUNT_MAX = 8;
  const roomCount = randInt(COUNT_MIN, COUNT_MAX);

  for (let i = 0; i < roomCount; i++) {
    const w = randInt(ROOM_MIN, ROOM_MAX);
    const h = randInt(ROOM_MIN, ROOM_MAX);
    const x = randInt(1, S - w - 2);
    const y = randInt(1, S - h - 2);

    // проверяем буфер в 1 тайл вокруг уже вырезанных комнат
    if (rooms.some(r => rectsOverlap(x - 1, y - 1, w + 2, h + 2, r))) {
      i--;
      continue;
    }

    // вырезаем комнату
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        tiles[yy][xx] = 'room';
      }
    }

    rooms.push({
      minX: x,
      minY: y,
      maxX: x + w - 1,
      maxY: y + h - 1,
      cx: x + Math.floor(w / 2),
      cy: y + Math.floor(h / 2)
    });
  }

  return rooms;
}

/**
 * Соединяет комнаты L-образными двумяширокими коридорами ('hall'),
 * ставит двери ('door') лишь на границе room↔hall.
 */
function carveCorridorsAndDoors(tiles, rooms) {
  // упорядочиваем по X, чтобы коридоры шли в одну сторону
  rooms.sort((a, b) => a.cx - b.cx);

  for (let i = 1; i < rooms.length; i++) {
    const A = rooms[i - 1], B = rooms[i];
    let x = A.cx, y = A.cy;

    // горизонтальный сегмент
    while (x !== B.cx) {
      x += Math.sign(B.cx - x);
      if (tiles[y][x] === 'room') {
        tiles[y][x] = 'door';
      } else if (tiles[y][x] === 'wall') {
        tiles[y][x] = 'hall';
        if (y + 1 < tiles.length && tiles[y + 1][x] === 'wall') {
          tiles[y + 1][x] = 'hall';
        }
      }
    }

    // вертикальный сегмент
    while (y !== B.cy) {
      y += Math.sign(B.cy - y);
      if (tiles[y][x] === 'room') {
        tiles[y][x] = 'door';
      } else if (tiles[y][x] === 'wall') {
        tiles[y][x] = 'hall';
        if (x + 1 < tiles[y].length && tiles[y][x + 1] === 'wall') {
          tiles[y][x + 1] = 'hall';
        }
      }
    }
  }
}

/**
 * Основная функция: генерирует «коммуналку» в переданном tiles,
 * возвращает список вырезанных комнат.
 *
 * @param {string[][]} tiles — S×S массив, изначально заполненный 'wall'
 * @returns {Array<{minX,minY,maxX,maxY,cx,cy}>}
 */
export function generateTiles(tiles) {
  // 1) вырезаем комнаты
  const rooms = carveRooms(tiles);

  // 2) прокладываем коридоры и двери
  carveCorridorsAndDoors(tiles, rooms);

  return rooms;
}
