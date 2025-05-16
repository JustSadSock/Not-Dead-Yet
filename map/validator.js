// map/validator.js
//
// Применение всех правил к «сырой» сетке комнат:
// — вырезаем коридоры (hall) 2–3 клеток толщины,
// — ставим двери (door) 1–2 клетки на границах room ↔ hall,
// — валидация дверей (nDoor≤1, nRoom=1, nHall=1, 1≤nWall≤2),
// — гарантируем, что каждый hall ведёт хотя бы в одну комнату,
// — удаляем hall, не ведущие ни к одной комнате,
// — гарантируем, что каждая комната имеет 1–3 двери и минимум одну полностью закрытую стену,
// — **НОВАЯ ЛОГИКА**: никакого прямого соседства room↔hall без двери:
//    — если boundary room→hall встречается, а на этой стороне <2 дверей, ставим дверь;
//    — иначе (дверей уже 2) — превращаем hall в wall.

import { buildRawChunk } from './generator.js';

/**
 * @param {string[][]} rawTiles — матрица 'wall'/'room'
 * @param {number} S — размер чанка (например, 32)
 * @returns {string[][]} tiles — матрица 'wall'/'room'/'hall'/'door'
 */
export function applyRules(rawTiles, S) {
  // 1) клонируем
  const tiles = rawTiles.map(row => row.slice());

  // 2) flood-fill комнат и собираем их данные
  const rooms = [];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (tiles[y][x] === 'room') {
        const stack = [[x,y]];
        const cells = [];
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
          minX = Math.min(minX, cx);
          maxX = Math.max(maxX, cx);
          minY = Math.min(minY, cy);
          maxY = Math.max(maxY, cy);
        }
        rooms.push({ cells, minX, maxX, minY, maxY });
      }
    }
  }
  // восстанавливаем метку
  for (const r of rooms) {
    for (const [x,y] of r.cells) tiles[y][x] = 'room';
  }

  // 3) вспомогательные структуры дверей
  const roomDoors = rooms.map(() => []);
  const sideOffsets = { N:[0,-1], S:[0,1], W:[-1,0], E:[1,0] };

  // 4) ставим первые 1–3 двери на каждой комнате
  for (let i = 0; i < rooms.length; i++) {
    const { minX, maxX, minY, maxY } = rooms[i];
    const area = (maxX-minX+1)*(maxY-minY+1);
    const cntDoors = area < 16 ? 1 : 1 + Math.floor(Math.random()*2);

    const candidates = [];
    // Север и Юг
    for (let x = minX; x <= maxX; x++) {
      candidates.push({ x, y: minY-1, side: 'N' });
      candidates.push({ x, y: maxY+1, side: 'S' });
    }
    // Запад и Восток
    for (let y = minY; y <= maxY; y++) {
      candidates.push({ x: minX-1, y, side: 'W' });
      candidates.push({ x: maxX+1, y, side: 'E' });
    }
    // фильтруем валидные точки
    const valid = candidates.filter(c =>
      c.x>=0&&c.y>=0&&c.x<S&&c.y<S&&tiles[c.y][c.x]==='wall'
    );
    shuffle(valid);
    const chosen = valid.slice(0, cntDoors);
    for (const {x,y,side} of chosen) {
      tiles[y][x] = 'door';
      roomDoors[i].push({ x,y,side });
    }
  }

  // 5) собираем все двери для соединения коридоров
  const allDoors = [];
  rooms.forEach((_,i) => roomDoors[i].forEach(d => allDoors.push({...d, room:i})));
  shuffle(allDoors);

  // 6) соединяем двери парно (MST-like)
  const connected = new Set();
  for (let i = 0; i < allDoors.length; i++) {
    if (connected.has(i)) continue;
    const A = allDoors[i];
    let best = null, bestIdx = -1;
    for (let j = 0; j < allDoors.length; j++) {
      if (i===j||connected.has(j)) continue;
      const B = allDoors[j];
      if (B.room === A.room) continue;
      const dx = A.x-B.x, dy = A.y-B.y, d2 = dx*dx+dy*dy;
      if (!best||d2<best.d2) best={B,d2}, bestIdx=j;
    }
    if (best) {
      carveCorridor(tiles, A.x,A.y, best.B.x,best.B.y, S);
      connected.add(i);
      connected.add(bestIdx);
    }
  }

  // 7) убрать hall, не ведущие в room
  for (let y=0; y<S; y++) {
    for (let x=0; x<S; x++) {
      if (tiles[y][x]==='hall') {
        const ok = [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy]) =>
          tiles[y+dy]?.[x+dx]==='room'
        );
        if (!ok) tiles[y][x] = 'wall';
      }
    }
  }

  // 8) проверка дверей: nDoor≤1,nRoom=1,nHall=1,1≤nWall≤2
  for (let y=0; y<S; y++) {
    for (let x=0; x<S; x++) {
      if (tiles[y][x]!=='door') continue;
      let nDoor=0,nRoom=0,nHall=0,nWall=0;
      for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const t = tiles[y+dy]?.[x+dx];
        if (t==='door') nDoor++;
        else if (t==='room') nRoom++;
        else if (t==='hall') nHall++;
        else nWall++;
      }
      if (!(nDoor<=1&&nRoom===1&&nHall===1&&nWall>=1&&nWall<=2)) {
        tiles[y][x]='wall';
      }
    }
  }

  // ────────────────────────────────────────────
  // 9) НОВАЯ ЛОГИКА: запрет прямых соприкосновений room↔hall
  const MAX_DOORS_PER_SIDE = 2;
  rooms.forEach((r,i) => {
    const doorsBySide = { N:0,S:0,W:0,E:0 };
    roomDoors[i].forEach(d => doorsBySide[d.side]++);

    for (const side of ['N','S','W','E']) {
      const [dx,dy] = sideOffsets[side];
      // найти все boundary позиции этой комнаты на этой стороне
      const bps = [];
      for (const [cx,cy] of r.cells) {
        if (tiles[cy+dy]?.[cx+dx]==='hall') {
          bps.push([cx,cy]);
        }
      }
      if (bps.length===0) continue;

      // сколько дверей ещё можно добавить
      let freeSlots = MAX_DOORS_PER_SIDE - doorsBySide[side];
      // сортируем по координате для выборки смежных
      bps.sort((a,b) => side==='N'||side==='S' ? a[0]-b[0] : a[1]-b[1]);

      // выбираем до freeSlots первых, гарантируя смежность
      const toMake = [];
      for (let k=0; k<bps.length && freeSlots>0; k++) {
        const [x,y] = bps[k];
        // проверяем смежность: либо toMake пусто, либо последняя в той же линии ±1
        if (toMake.length===0 ||
            (side==='N'||side==='S'
              ? Math.abs(toMake[toMake.length-1][0]-x)===1
              : Math.abs(toMake[toMake.length-1][1]-y)===1)
        ) {
          toMake.push([x,y]);
          freeSlots--;
        }
      }

      // применяем: для каждой bp
      bps.forEach(([cx,cy]) => {
        const nx=cx+dx, ny=cy+dy;
        // если в toMake => ставим door
        if (toMake.some(t=>t[0]===cx&&t[1]===cy)) {
          tiles[ny][nx] = 'door';
        } else {
          // иначе — закрываем wall
          if (tiles[ny][nx]==='hall') tiles[ny][nx] = 'wall';
        }
      });
    }
  });

  return tiles;
}


// ────────────────────────────────────────────
//  вспомогательные
// ────────────────────────────────────────────

/** L-образный коридор толщиной 2–3 */
function carveCorridor(tiles, x1,y1,x2,y2, S) {
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
        if (tiles[y0+dy]?.[x]=='wall') tiles[y0+dy][x]='hall';
  }
}

/** Fisher–Yates shuffle */
function shuffle(arr) {
  for (let i=arr.length-1; i>0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]] = [arr[j],arr[i]];
  }
}