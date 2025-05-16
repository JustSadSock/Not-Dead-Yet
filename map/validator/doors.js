// map/validator/doors.js
import { shuffle } from './utils.js';

const sideOffsets = { N:[0,-1], S:[0,1], W:[-1,0], E:[1,0] };

/**
 * @param {string[][]} tiles — матрица 'wall'/'room'/'hall'/'door'
 * @param {Array<{cells:[number,number][],minX,maxX,minY,maxY}>} rooms
 * @param {number} S — размер чанка
 * @returns {Array<{x:number,y:number,side:string,room:number}>} allDoors
 */
export function placeAndValidateDoors(tiles, rooms, S) {
  const roomDoors = rooms.map(() => []);
  const allDoors  = [];

  // 1) Первичное расположение 1–3 дверей на каждую комнату
  for (let i = 0; i < rooms.length; i++) {
    const { minX, maxX, minY, maxY } = rooms[i];
    const area = (maxX - minX + 1) * (maxY - minY + 1);
    const cnt  = area < 16 ? 1 : 1 + Math.floor(Math.random() * 2);

    const candidates = [];
    for (let x = minX; x <= maxX; x++) {
      candidates.push({ x, y: minY - 1, side: 'N' });
      candidates.push({ x, y: maxY + 1, side: 'S' });
    }
    for (let y = minY; y <= maxY; y++) {
      candidates.push({ x: minX - 1, y, side: 'W' });
      candidates.push({ x: maxX + 1, y, side: 'E' });
    }
    // только в пределах и только на стенах
    const valid = candidates.filter(c =>
      c.x >= 0 && c.y >= 0 &&
      c.x < S && c.y < S &&
      tiles[c.y][c.x] === 'wall'
    );
    shuffle(valid);
    for (const { x, y, side } of valid.slice(0, cnt)) {
      tiles[y][x] = 'door';
      roomDoors[i].push({ x, y, side, room: i });
    }
  }

  // 2) Максимум 2 двери на одну сторону комнаты (соседство ±1)
  for (let i = 0; i < rooms.length; i++) {
    const doors = roomDoors[i];
    const counts = { N:0,S:0,W:0,E:0 };
    doors.forEach(d => counts[d.side]++);
    for (const side of ['N','S','W','E']) {
      const [dx,dy] = sideOffsets[side];
      // boundary — все клетки рядом с этой стороной комнаты
      const boundary = rooms[i].cells
        .filter(([cx,cy]) => tiles[cy+dy]?.[cx+dx] === 'door');
      // разрешённых слотов
      let free = 2 - counts[side];
      if (free <= 0) {
        // убрать все двери на этой стороне
        for (const [cx,cy] of boundary) {
          tiles[cy+dy][cx+dx] = 'wall';
          // удалить из roomDoors
          const idx = doors.findIndex(d=>d.x===cx+dx&&d.y===cy+dy);
          if (idx>=0) doors.splice(idx,1);
        }
      } else {
        // если boundary > free, оставляем первые free по координате (соседству)
        boundary.sort((a,b) =>
          side==='N'||side==='S' ? a[0]-b[0] : a[1]-b[1]
        );
        const keep = boundary.slice(0, free);
        for (const [cx,cy] of boundary) {
          if (!keep.some(k=>k[0]===cx&&k[1]===cy)) {
            tiles[cy+dy][cx+dx] = 'wall';
            const idx = doors.findIndex(d=>d.x===cx+dx&&d.y===cy+dy);
            if (idx>=0) doors.splice(idx,1);
          }
        }
      }
    }
  }

  // 3) Первичная валидация: каждая door —
  //    ≤1 сосед door, =1 сосед room, =1 сосед hall, 1–2 соседей wall
  for (let i = 0; i < rooms.length; i++) {
    for (const { x,y } of roomDoors[i]) {
      let nD=0,nR=0,nH=0,nW=0;
      for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const t = tiles[y+dy]?.[x+dx];
        if      (t==='door') nD++;
        else if (t==='room') nR++;
        else if (t==='hall') nH++;
        else                 nW++;
      }
      if (!(nD <= 1 && nR === 1 && nH === 1 && (nW === 1 || nW === 2))) {
        tiles[y][x] = 'wall';
      }
    }
  }

  // 4) Собираем итоговый список дверей
  roomDoors.forEach(arr => arr.forEach(d => {
    if (tiles[d.y][d.x] === 'door') allDoors.push(d);
  }));

  return allDoors;
}