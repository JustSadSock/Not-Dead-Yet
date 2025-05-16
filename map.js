// map.js, внутри GameMap
import { carveRoomsAndHalls } from './map/rooms.js';
import { placeAndValidateDoors } from './map/validator/doors.js';

_generateChunk(cx, cy) {
  // 1) Вырезаем комнаты и коридоры
  const { tiles, rooms } = carveRoomsAndHalls(this.chunkSize);

  // 2) Расставляем валидные двери
  this.doors = placeAndValidateDoors(tiles, rooms, this.chunkSize);

  return tiles;
}