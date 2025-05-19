// map/validator/rooms.js
import { randInt } from './utils.js';

/**
 * Находит места для N комнат, гарантируя отсутствие пересечений,
 * вырезает в tiles пространство типа 'floorRoom'.
 * Возвращает массив комнат вида { x, y, w, h, center:{x,y} }.
 */
export function carveRooms(tiles) {
  const rooms = [];
  const MAX_ROOMS = 8;
  const MIN_SIZE  = 4;
  const MAX_SIZE  = 8;
  const H = tiles.length, W = tiles[0].length;

  for (let i = 0; i < MAX_ROOMS; i++) {
    const w = randInt(MIN_SIZE, MAX_SIZE);
    const h = randInt(MIN_SIZE, MAX_SIZE);
    const x = randInt(1, W - w - 2);
    const y = randInt(1, H - h - 2);

    // проверяем пересечение с уже вырезанными
    let ok = true;
    for (let yy = y - 1; yy <= y + h; yy++) {
      for (let xx = x - 1; xx <= x + w; xx++) {
        if (tiles[yy][xx].type !== 'wall') {
          ok = false;
          break;
        }
      }
      if (!ok) break;
    }
    if (!ok) continue;

    // вырезаем пол для комнаты
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        tiles[yy][xx].type = 'floorRoom';
      }
    }
    rooms.push({
      x, y, w, h,
      center: { x: x + Math.floor(w/2), y: y + Math.floor(h/2) }
    });
  }

  return rooms;
}