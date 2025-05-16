// map/validator/doors.js
import { shuffle } from './utils.js';

const sideOffsets = { N:[0,-1], S:[0,1], W:[-1,0], E:[1,0] };

/**
 * @param {string[][]} tiles — матрица 'wall'/'room'/'hall'/'door'
 * @param {Array<{cells:[number,number][],minX,maxX,minY,maxY}>} rooms
 * @param {number} S — размер чанка
 * @returns {Array<{x:number,y:number,room:number}>} allDoors
 */
export function placeAndValidateDoors(tiles, rooms, S) {
  const roomDoors = rooms.map(() => []);
  const allDoors  = [];

  // 1) Первичное расположение 1–3 дверей на каждую комнату
  for (let i = 0; i < rooms.length; i++) {
    const { minX, maxX, minY, maxY } = rooms[i];
    const area = (maxX - minX + 1) * (maxY - minY + 1);
    const cnt  = area < 16 ? 1 : 1 + Math.floor(Math.random() * 2);

    // собираем всех соседей «wall» по периметру
    const cands = [];
    for (let x = minX; x <= maxX; x++) {
      cands.push({ x, y: minY - 1 });
      cands.push({ x, y: maxY + 1 });
    }
    for (let y = minY; y <= maxY; y++) {
      cands.push({ x: minX - 1, y });
      cands.push({ x: maxX + 1, y });
    }
    // фильтруем по границам и «wall»
    const valid = cands.filter(({ x, y }) =>
      x >= 0 && y >= 0 && x < S && y < S &&
      tiles[y][x] === 'wall'
    );
    shuffle(valid);

    // выбираем до cnt дверей
    const pick = valid.slice(0, cnt);
    pick.forEach(({ x, y }) => {
      tiles[y][x] = 'door';
      roomDoors[i].push({ x, y, room: i });
    });

    // 2) Если для комнаты не получилось ни одного валидного — делаем фолбэк
    if (roomDoors[i].length === 0) {
      // возьмём «серединную северную» позицию, если там стена
      const cx = Math.floor((minX + maxX) / 2);
      const cy = minY - 1;
      if (cy >= 0 && tiles[cy][cx] === 'wall') {
        tiles[cy][cx] = 'door';
        roomDoors[i].push({ x: cx, y: cy, room: i });
        console.warn(`Fallback door for room ${i} at (${cx},${cy})`);
      }
    }
  }

  // 3) Первичная валидация дверей (≤1 door, =1 room, =1 hall, 1–2 wall)
  roomDoors.forEach(arr => {
    arr.forEach(({ x, y }) => {
      let nD=0, nR=0, nH=0, nW=0;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const t = tiles[y+dy]?.[x+dx];
        if      (t === 'door') nD++;
        else if (t === 'room') nR++;
        else if (t === 'hall') nH++;
        else                  nW++;
      }
      if (!(nD <= 1 && nR === 1 && nH === 1 && (nW === 1 || nW === 2))) {
        tiles[y][x] = 'wall';
        console.info(`Removed invalid door at (${x},${y})`);
      }
    });
  });

  // 4) Собираем окончательный список
  roomDoors.forEach(arr => {
    arr.forEach(d => {
      if (tiles[d.y][d.x] === 'door') {
        allDoors.push(d);
      }
    });
  });

  console.log('placeAndValidateDoors → doors:', allDoors);
  return allDoors;
}