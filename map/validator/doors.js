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

  for (let i = 0; i < rooms.length; i++) {
    const { minX, maxX, minY, maxY, cells } = rooms[i];
    const area = (maxX - minX + 1) * (maxY - minY + 1);
    const desiredCount = area < 16 ? 1 : 1 + Math.floor(Math.random() * 2);

    // 1) Собираем кандидатов — внешние соседи «wall»
    const cands = [];
    for (let x = minX; x <= maxX; x++) {
      cands.push({ x, y: minY - 1, side: 'N' });
      cands.push({ x, y: maxY + 1, side: 'S' });
    }
    for (let y = minY; y <= maxY; y++) {
      cands.push({ x: minX - 1, y, side: 'W' });
      cands.push({ x: maxX + 1, y, side: 'E' });
    }
    const valid = cands.filter(c =>
      c.x >= 0 && c.y >= 0 && c.x < S && c.y < S &&
      tiles[c.y][c.x] === 'wall'
    );

    shuffle(valid);
    const pick = valid.slice(0, desiredCount);
    // 2) Если ни одного валидного — fallback: любой сосед
    if (pick.length === 0) {
      const fallback = cands.filter(c =>
        c.x >= 0 && c.y >= 0 && c.x < S && c.y < S
      );
      shuffle(fallback);
      pick.push(fallback[0]);
    }

    // 3) Применяем двери
    for (const { x, y, side } of pick) {
      tiles[y][x] = 'door';
      roomDoors[i].push({ x, y, side, room: i });
    }

    // 4) Ограничиваем до 2 дверей на сторону (смежные ±1)
    const counts = { N:0,S:0,W:0,E:0 };
    roomDoors[i].forEach(d => counts[d.side]++);
    [ 'N','S','W','E' ].forEach(side => {
      const [dx,dy] = sideOffsets[side];
      // все двери этой комнаты на этой стороне
      const list = roomDoors[i].filter(d => d.side === side);
      if (list.length <= 2) return;
      // сорт по координате для «смежности»
      list.sort((a,b) =>
        (side==='N'||side==='S') ? a.x - b.x : a.y - b.y
      );
      // оставляем только первые две
      const keep = list.slice(0,2);
      for (const d of list) {
        if (!keep.includes(d)) {
          tiles[d.y][d.x] = 'wall';
          const idx = roomDoors[i].indexOf(d);
          roomDoors[i].splice(idx,1);
        }
      }
    });
  }

  // 5) Первичная валидация дверей
  for (let i = 0; i < rooms.length; i++) {
    for (const { x, y } of roomDoors[i]) {
      let nD=0, nR=0, nH=0, nW=0;
      for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const t = tiles[y+dy]?.[x+dx];
        if      (t==='door') nD++;
        else if (t==='room') nR++;
        else if (t==='hall') nH++;
        else                 nW++;
      }
      // до 1 двери, ровно 1 комната, ровно 1 коридор, 1–2 стены
      if (!(nD <= 1 && nR === 1 && nH === 1 && (nW === 1 || nW === 2))) {
        tiles[y][x] = 'wall';
      }
    }
  }

  // 6) Сформируем итоговый список дверей
  roomDoors.forEach(arr =>
    arr.forEach(d => {
      if (tiles[d.y][d.x] === 'door') allDoors.push(d);
    })
  );

  return allDoors;
}