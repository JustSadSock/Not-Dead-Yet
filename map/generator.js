// map/generator.js
//
// Генерация «сырой» сетки комнат (без коридоров/дверей):
// — комнаты 4×4…8×8,
// — количество 3…8,
// — минимум GAP=5 клеток между ними,
// — все остальное «wall».
//
// Экспортирует функцию buildRawChunk(chunkSize).

/**
 * @param {number} chunkSize — размер чанка (например, 32)
 * @returns {string[][]} tiles — матрица размером chunkSize×chunkSize,
 *                              где каждый элемент 'wall' или 'room'
 */
export function buildRawChunk(chunkSize) {
  const S   = chunkSize;
  const GAP = 5; // минимальное расстояние между комнатами

  // 1) инициализация всех тайлов как «стена»
  const tiles = Array.from({ length: S }, () => Array(S).fill('wall'));

  // 2) случайное число комнат 3…8
  const roomCount = 3 + Math.floor(Math.random() * 6);
  const rooms = [];

  let attempts = 0;
  while (rooms.length < roomCount && attempts < roomCount * 10) {
    attempts++;

    // размер комнаты 4…8
    const w = 4 + Math.floor(Math.random() * 5);
    const h = 4 + Math.floor(Math.random() * 5);

    // случайная позиция с запасом 1 клетка от границ
    const x = 1 + Math.floor(Math.random() * (S - w - 2));
    const y = 1 + Math.floor(Math.random() * (S - h - 2));

    // проверка GAP-разноса от всех уже существующих комнат
    let ok = true;
    for (const r of rooms) {
      if (
        x + w + GAP > r.x - 1 &&
        r.x + r.w + GAP > x - 1 &&
        y + h + GAP > r.y - 1 &&
        r.y + r.h + GAP > y - 1
      ) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    // добавляем комнату
    rooms.push({ x, y, w, h });
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        tiles[yy][xx] = 'room';
      }
    }
  }

  return tiles;
}
