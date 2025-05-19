// map/generator.js
import { carveRooms }     from './validator/rooms.js';
import { carveCorridors } from './validator/corridors.js';
import { placeDoors }     from './validator/doors.js';
import { applyRules }     from './validator.js';

/**
 * @param {Array<Array<{type:string}>>} tiles — пустая сетка 'wall'
 */
export function generateDungeon(tiles) {
  // 1) «нарезаем» независимые комнаты
  const rooms = carveRooms(tiles);

  // 2) прокладываем коридоры между комнатами
  carveCorridors(tiles, rooms);

  // 3) при желании ставим двери на узких местах
  placeDoors(tiles, rooms);

  // 4) чистим «мертвые» полу-участки, проверяем связность
  applyRules(tiles);

  return { tiles, rooms };
}