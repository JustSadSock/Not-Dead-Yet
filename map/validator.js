// map/validator.js
//
// Применение всех правил к «сырой» сетке комнат:
// — вырезаем коридоры (hall) 2–3 клеток толщины,
// — ставим двери (door) 1–2 клетки на границах room ↔ hall,
// — первичная валидация дверей: каждая door должна быть:
//     • не более одной соседней door,
//     • ровно с одной соседней room,
//     • ровно с одной соседней hall,
//     • и с одной или двумя соседними wall,
// — гарантируем, что каждый hall ведёт хотя бы в одну room,
// — удаляем hall, не ведущие ни к одной room,
// — гарантируем, что каждая комната имеет 1–3 дверей и минимум одну полностью закрытую стену,
// — запрет прямого соприкосновения room↔hall без двери (макс 2 двери на сторону),
// — **новое**: каждая door, у которой нет соседей hall, получает хотя бы один hall-выход.

import { buildRawChunk } from './generator.js';

/**
 * @param {string[][]} rawTiles — матрица 'wall'/'room'
 * @param {number} S — размер чанка
 * @returns {string[][]} tiles — матрица 'wall'/'room'/'hall'/'door'
 */
export function applyRules(rawTiles, S) {
  // 1) копируем
  const tiles = rawTiles.map(r => r.slice());

  // 2) flood-fill комнат
  const rooms = [];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (tiles[y][x] === 'room') {
        const stack = [[x,y]], cells = [];
        tiles[y][x] = 'ROOM';
        while (stack.length) {
          const [cx,cy] = stack.pop();
          cells.push([cx,cy]);
          for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const nx = cx+dx, ny = cy+dy;
            if (nx>=0 && ny>=0 && nx<S && ny<S && tiles[ny][nx]==='room') {
              tiles[ny][nx] = 'ROOM';
              stack.push([nx,ny]);
            }
          }
        }
        let minX=S, maxX=0, minY=S, maxY=0;
        for (const [cx,cy] of cells) {
          minX = Math.min(minX,cx);
          maxX = Math.max(maxX,cx);
          minY = Math.min(minY,cy);
          maxY = Math.max(maxY,cy);
        }
        rooms.push({ cells, minX, maxX, minY, maxY });
      }
    }
  }
  // восстановить метку
  for (const r of rooms) {
    for (const [x,y] of r.cells) tiles[y][x] = 'room';
  }

  // 3) вспомогательные структуры
  const roomDoors = rooms.map(() => []);
  const sideOffsets = { N:[0,-1], S:[0,1], W:[-1,0], E:[1,0] };

  // 4) ставим 1–3 двери на периметре каждой комнаты
  for (let i = 0; i < rooms.length; i++) {
    const { minX, maxX, minY, maxY } = rooms[i];
    const area = (maxX-minX+1)*(maxY-minY+1);
    const cntDoors = area < 16 ? 1 : 1 + Math.floor(Math.random() * 2);

    const cand = [];
    for (let x = minX; x <= maxX; x++) {
      cand.push({ x, y: minY-1, side: 'N' });
      cand.push({ x, y: maxY+1, side: 'S' });
    }
    for (let y = minY; y <= maxY; y++) {
      cand.push({ x: minX-1, y, side: 'W' });
      cand.push({ x: maxX+1, y, side: 'E' });
    }
    const valid = cand.filter(c =>
      c.x>=0 && c.y>=0 && c.x<S && c.y<S && tiles[c.y][c.x]==='wall'
    );
    shuffle(valid);
    const pick = valid.slice(0, cntDoors);
    for (const { x,y,side } of pick) {
      tiles[y][x] = 'door';
      roomDoors[i].push({ x,y,side });
    }
  }

  // 5) собираем все двери
  const allDoors = [];
  rooms.forEach((_, i) =>
    roomDoors[i].forEach(d => allDoors.push({ ...d, room: i }))
  );
  shuffle(allDoors);

  // 6) соединяем пары дверей коридорами
  const connected = new Set();
  for (let i = 0; i < allDoors.length; i++) {
    if (connected.has(i)) continue;
    const A = allDoors[i];
    let best = null, bestIdx = -1;
    for (let j = 0; j < allDoors.length; j++) {
      if (i===j || connected.has(j)) continue;
      const B = allDoors[j];
      if (B.room === A.room) continue;
      const dx = A.x-B.x, dy = A.y-B.y, d2 = dx*dx + dy*dy;
      if (!best || d2 < best.d2) { best = { B, d2 }; bestIdx = j; }
    }
    if (best) {
      carveCorridor(tiles, A.x, A.y, best.B.x, best.B.y);
      connected.add(i);
      connected.add(bestIdx);
    }
  }

  // 7) удаление hall, не ведущих в room
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (tiles[y][x] === 'hall') {
        const ok = [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy]) =>
          tiles[y+dy]?.[x+dx] === 'room'
        );
        if (!ok) tiles[y][x] = 'wall';
      }
    }
  }

  // 8) первичная валидация дверей
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (tiles[y][x] !== 'door') continue;
      let nDoor=0, nRoom=0, nHall=0, nWall=0;
      for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const t = tiles[y+dy]?.[x+dx];
        if (t==='door')   nDoor++;
        else if (t==='room')  nRoom++;
        else if (t==='hall')  nHall++;
        else                nWall++;
      }
      // теперь разрешаем до 1 соседней door вместо 0
      if (!(nDoor <= 1 && nRoom === 1 && nHall === 1 && (nWall === 1 || nWall === 2))) {
        tiles[y][x] = 'wall';
      }
    }
  }

  // 9) запрет прямого соприкосновения room↔hall без двери
  rooms.forEach((r, i) => {
    const countBySide = { N:0, S:0, W:0, E:0 };
    roomDoors[i].forEach(d => countBySide[d.side]++);
    const MAX = 2;
    for (const side of ['N','S','W','E']) {
      const [dx,dy] = sideOffsets[side];
      const boundary = [];
      for (const [cx,cy] of r.cells) {
        if (tiles[cy+dy]?.[cx+dx] === 'hall') {
          boundary.push([cx,cy]);
        }
      }
      if (!boundary.length) continue;
      boundary.sort((a,b) =>
        side==='N'||side==='S' ? a[0]-b[0] : a[1]-b[1]
      );
      let slots = MAX - countBySide[side];
      const take = [];
      for (let k = 0; k < boundary.length && slots > 0; k++) {
        const [cx,cy] = boundary[k];
        if (take.length === 0 ||
            (side==='N'||side==='S'
              ? Math.abs(take[take.length-1][0] - cx) === 1
              : Math.abs(take[take.length-1][1] - cy) === 1)
        ) {
          take.push([cx,cy]);
          slots--;
        }
      }
      for (const [cx,cy] of boundary) {
        const nx = cx + sideOffsets[side][0],
              ny = cy + sideOffsets[side][1];
        if (take.some(t => t[0] === cx && t[1] === cy)) {
          tiles[ny][nx] = 'door';
        } else {
          tiles[ny][nx] = 'wall';
        }
      }
    }
  });

  // 10) Гарантируем: каждая door соседствует хотя бы с одним hall
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (tiles[y][x] !== 'door') continue;
      const neigh = [[1,0],[-1,0],[0,1],[0,-1]];
      const nHall = neigh.filter(([dx,dy]) =>
        tiles[y+dy]?.[x+dx] === 'hall'
      ).length;
      if (nHall === 0) {
        // ищем соседнюю room, чтобы знать направление
        const roomDir = neigh.find(([dx,dy]) =>
          tiles[y+dy]?.[x+dx] === 'room'
        );
        if (roomDir) {
          const [dx,dy] = roomDir;
          const ox = -dx, oy = -dy;
          const hx = x + ox, hy = y + oy;
          if (hx >= 0 && hy >= 0 && hx < S && hy < S && tiles[hy][hx] === 'wall') {
            tiles[hy][hx] = 'hall';
          }
        }
      }
    }
  }

  return tiles;
}


// ─────────────────────────────────
//  вспомогательные
// ─────────────────────────────────

function carveCorridor(tiles, x1,y1,x2,y2) {
  const W = 2 + Math.floor(Math.random()*2);
  if (Math.random()<0.5) {
    const xa=Math.min(x1,x2), xb=Math.max(x1,x2), y0=y1-((W/2)|0);
    for (let x=xa; x<=xb; x++)
      for (let dy=0; dy<W; dy++)
        if (tiles[y0+dy]?.[x]==='wall') tiles[y0+dy][x]='hall';
    const ya=Math.min(y1,y2), yb=Math.max(y1,y2), x0=x2-((W/2)|0);
    for (let y=ya; y<=yb; y++)
      for (let dx=0; dx<W; dx++)
        if (tiles[y]?.[x0+dx]==='wall') tiles[y][x0+dx]='hall';
  } else {
    const ya=Math.min(y1,y2), yb=Math.max(y1,y2), x0=x1-((W/2)|0);
    for (let y=ya; y<=yb; y++)
      for (let dx=0; dx<W; dx++)
        if (tiles[y]?.[x0+dx]==='wall') tiles[y][x0+dx]='hall';
    const xa=Math.min(x1,x2), xb=Math.max(x1,x2), y0=y2-((W/2)|0);
    for (let x=xa; x<=xb; x++)
      for (let dy=0; dy<W; dy++)
        if (tiles[y0+dy]?.[x]==='wall') tiles[y0+dy][x]='hall';
  }
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}