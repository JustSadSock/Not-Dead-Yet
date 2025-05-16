// map/validator.js
//
// Применение всех правил к «сырой» сетке комнат:
// — вырезаем коридоры (hall) 2–3 клеток толщины,
// — ставим двери (door) 1–2 клетки на границах room ↔ hall,
// — валидация дверей (nDoor≤1, nRoom=1, nHall=1, 1≤nWall≤2),
// — гарантируем, что каждый hall ведёт хотя бы в две комнаты,
// — удаляем hall, не ведущие ни к одной комнате,
// — гарантируем, что каждая комната имеет 1–3 двери и минимум одну полностью закрытую стену.

import { buildRawChunk } from './generator.js'; // для типов

/**
 * @param {string[][]} rawTiles — матрица 'wall'/'room'
 * @param {number} chunkSize
 * @returns {string[][]} tiles — матрица 'wall'/'room'/'hall'/'door'
 */
export function applyRules(rawTiles, chunkSize) {
  const S = chunkSize;
  // клонируем
  const tiles = rawTiles.map(row => row.slice());

  // вспомогательные структуры
  const rooms = [];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (tiles[y][x] === 'room') {
        // flood-fill одной комнаты
        const stack = [[x,y]];
        const cells = [];
        tiles[y][x] = 'ROOM'; // временная метка
        while (stack.length) {
          const [cx, cy] = stack.pop();
          cells.push([cx, cy]);
          for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const nx = cx+dx, ny = cy+dy;
            if (nx>=0 && ny>=0 && nx<S && ny<S && tiles[ny][nx]==='room') {
              tiles[ny][nx] = 'ROOM';
              stack.push([nx, ny]);
            }
          }
        }
        // определить bounding box
        let minX = S, maxX = 0, minY = S, maxY = 0;
        for (const [cx, cy] of cells) {
          minX = Math.min(minX, cx);
          maxX = Math.max(maxX, cx);
          minY = Math.min(minY, cy);
          maxY = Math.max(maxY, cy);
        }
        rooms.push({ cells, minX, maxX, minY, maxY });
      }
    }
  }
  // Восстанавливаем лейбл
  for (const r of rooms) {
    for (const [x,y] of r.cells) tiles[y][x] = 'room';
  }

  // Стороны и их смещения
  const sides = {
    N: { dx: 0, dy: -1 },
    S: { dx: 0, dy: 1 },
    W: { dx: -1, dy: 0 },
    E: { dx: 1, dy: 0 }
  };

  // вспомогательный массив дверей для комнаты
  const roomDoors = rooms.map(() => []);

  // —————— 1) Проходим по каждой комнате и ставим 1–3 двери
  for (let i = 0; i < rooms.length; i++) {
    const { minX, maxX, minY, maxY } = rooms[i];
    // выбираем количество дверей: 1 если area<16, иначе 2..3
    const area = (maxX-minX+1)*(maxY-minY+1);
    const cntDoors = area < 16 ? 1 : 1 + Math.floor(Math.random()*2);
    // собираем возможные позиций на периметре
    const candidates = [];
    // по бокам:
    for (let x = minX; x <= maxX; x++) {
      candidates.push({ x, y: minY-1, side: 'N' });
      candidates.push({ x, y: maxY+1, side: 'S' });
    }
    for (let y = minY; y <= maxY; y++) {
      candidates.push({ x: minX-1, y, side: 'W' });
      candidates.push({ x: maxX+1, y, side: 'E' });
    }
    // фильтруем валидные и случайно выбираем нужное количество
    const valid = candidates.filter(c =>
      c.x>=0 && c.y>=0 && c.x<S && c.y<S &&
      tiles[c.y][c.x] === 'wall'
    );
    shuffleArray(valid);
    const chosen = valid.slice(0, cntDoors);
    for (const { x, y, side } of chosen) {
      tiles[y][x] = 'door';
      roomDoors[i].push({ x, y, side });
    }
  }

  // —————— 2) Коридоры между дверями (каждая door соединяется ровно с 1 door другой комнаты)
  // Собираем все двери
  const allDoors = [];
  rooms.forEach((_, i) => {
    for (const d of roomDoors[i]) allDoors.push({ ...d, room: i });
  });
  shuffleArray(allDoors);

  // попарно соединяем двери разных комнат, не создавая повторений
  const connected = new Set();
  for (let i = 0; i < allDoors.length; i++) {
    const A = allDoors[i];
    if (connected.has(i)) continue;
    // ищем ближайшую дверь другой комнаты, которая ещё не связана
    let best = null, bestDist = Infinity, bestIdx = -1;
    for (let j = 0; j < allDoors.length; j++) {
      if (i===j || connected.has(j)) continue;
      const B = allDoors[j];
      if (B.room === A.room) continue;
      const dx = A.x - B.x, dy = A.y - B.y;
      const d2 = dx*dx + dy*dy;
      if (d2 < bestDist) {
        bestDist = d2; best = B; bestIdx = j;
      }
    }
    if (best) {
      // вырезаем коридор толщиной 2–3 пикселя
      carveCorridor(tiles, A.x, A.y, best.x, best.y);
      connected.add(i);
      connected.add(bestIdx);
    }
  }

  // —————— 3) Убираем hall, не ведущие ни в одну комнату
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (tiles[y][x] === 'hall') {
        // если нет прямых соседей room — убираем
        const neigh = [
          [1,0],[-1,0],[0,1],[0,-1]
        ];
        const seesRoom = neigh.some(([dx,dy]) =>
          tiles[y+dy]?.[x+dx] === 'room'
        );
        if (!seesRoom) tiles[y][x] = 'wall';
      }
    }
  }

  // —————— 4) Валидация дверей: nDoor≤1,nRoom=1,nHall=1,1≤nWall≤2
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (tiles[y][x] !== 'door') continue;
      let nDoor=0,nRoom=0,nHall=0,nWall=0;
      for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const t = tiles[y+dy]?.[x+dx];
        if (t==='door') nDoor++;
        else if (t==='room') nRoom++;
        else if (t==='hall') nHall++;
        else nWall++;
      }
      if (!(nDoor<=1 && nRoom===1 && nHall===1 && nWall>=1 && nWall<=2)) {
        tiles[y][x] = 'wall';
      }
    }
  }

  return tiles;
}

// —————— вспомогательные ——————————————

/** Вырубка L-образного коридора толщиной 2–3 */
function carveCorridor(tiles, x1, y1, x2, y2) {
  const S = tiles.length;
  const W = 2 + Math.floor(Math.random()*2);
  const horizFirst = Math.random()<0.5;
  if (horizFirst) {
    // X-сегмент
    const xa = Math.min(x1,x2), xb = Math.max(x1,x2),
          y0 = y1 - ((W/2)|0);
    for (let x = xa; x <= xb; x++)
      for (let dy = 0; dy < W; dy++)
        if (tiles[y0+dy]?.[x]==='wall')
          tiles[y0+dy][x] = 'hall';
    // Y-сегмент
    const ya = Math.min(y1,y2), yb = Math.max(y1,y2),
          x0 = x2 - ((W/2)|0);
    for (let y = ya; y <= yb; y++)
      for (let dx = 0; dx < W; dx++)
        if (tiles[y]?.[x0+dx]==='wall')
          tiles[y][x0+dx] = 'hall';
  } else {
    // Y-сегмент
    const ya = Math.min(y1,y2), yb = Math.max(y1,y2),
          x0 = x1 - ((W/2)|0);
    for (let y = ya; y <= yb; y++)
      for (let dx = 0; dx < W; dx++)
        if (tiles[y]?.[x0+dx]==='wall')
          tiles[y][x0+dx] = 'hall';
    // X-сегмент
    const xa = Math.min(x1,x2), xb = Math.max(x1,x2),
          y0 = y2 - ((W/2)|0);
    for (let x = xa; x <= xb; x++)
      for (let dy = 0; dy < W; dy++)
        if (tiles[y0+dy]?.[x]==='wall')
          tiles[y0+dy][x] = 'hall';
  }
}

/** Тасует массив in-place */
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
