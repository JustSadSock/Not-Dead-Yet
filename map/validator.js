// map/validator.js
console.log('validator.applyRules called');
import { findRooms }       from './validator/rooms.js';
import { placeAndValidateDoors } from './validator/doors.js';
import { carveAllCorridors }     from './validator/corridors.js';
import { cleanupHalls }          from './validator/cleanup.js';
import { enforcePostValidate }   from './validator/postValidate.js';

/**
 * @param {string[][]} rawTiles — 'wall'/'room'
 * @param {number} S — размер чанка
 * @returns {string[][]} tiles — 'wall'/'room'/'hall'/'door'
 */
export function applyRules(rawTiles, S) {
  // копируем
  const tiles = rawTiles.map(r => r.slice());

  // 1) находим комнаты
  const rooms = findRooms(tiles, S);

  // 2) ставим и сразу первично валидируем двери
  const doors = placeAndValidateDoors(tiles, rooms, S);

  // 3) вырезаем коридоры, сохраняем пути (для ветвлений)
  const paths = carveAllCorridors(tiles, doors, S);

  // 4) чистим висячие hall и запрещаем прямой room↔hall без door
  cleanupHalls(tiles, rooms, S);

  // 5) финальная проверка: каждая door должна иметь хотя бы 1 сосед hall
  enforcePostValidate(tiles, S);

  return tiles;
}