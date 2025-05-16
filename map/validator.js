// map/validator.js
//
// Применение всех правил к «сырой» сетке комнат:
// — вырезаем коридоры (hall) 2–3 клеток толщины,
// — ставим двери (door) 1–2 клетки на границах room ↔ hall,
// — первичная валидация дверей: каждая door должна быть:
//     • ≤1 соседней door,
//     • ровно 1 соседняя room,
//     • ровно 1 соседняя hall,
//     • и 1–2 соседние wall,
// — запрет прямых соприкосновений room↔hall без door (≤2 door/сторона),
// — после основных коридоров: для каждого path>10 создаём хотя бы одно ответвление.

// Импорт генератора для типов (не используется внутри)
import { buildRawChunk } from './generator.js';

export function applyRules(rawTiles, S) {
  const tiles = rawTiles.map(r => r.slice());

  // —— 1) Flood-fill комнат —— 
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
  for (const r of rooms) for (const [x,y] of r.cells) tiles[y][x] = 'room';

  // —— 2) Ставим двери на периметре комнат ——
  const roomDoors = rooms.map(() => []);
  const sideOffsets = { N:[0,-1], S:[0,1], W:[-1,0], E:[1,0] };

  for (let i = 0; i < rooms.length; i++) {
    const { minX, maxX, minY, maxY } = rooms[i];
    const area = (maxX-minX+1)*(maxY-minY+1);
    const cnt = area < 16 ? 1 : 1 + Math.floor(Math.random()*2);

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
      c.x>=0&&c.y>=0&&c.x<S&&c.y<S&&tiles[c.y][c.x]==='wall'
    );
    shuffle(valid);
    for (const {x,y,side} of valid.slice(0,cnt)) {
      tiles[y][x] = 'door';
      roomDoors[i].push({ x,y,side });
    }
  }

  // —— 3) Собираем все двери и соединяем их L-образными коридорами —— 
  const allDoors = [];
  rooms.forEach((_,i)=>roomDoors[i].forEach(d=>allDoors.push({...d,room:i})));
  shuffle(allDoors);

  const connected = new Set();
  const allPaths  = [];

  for (let i = 0; i < allDoors.length; i++) {
    if (connected.has(i)) continue;
    const A = allDoors[i];
    let best = null, bestIdx=-1;
    for (let j=0; j<allDoors.length; j++) {
      if (i===j||connected.has(j)) continue;
      const B = allDoors[j];
      if (B.room===A.room) continue;
      const dx=A.x-B.x, dy=A.y-B.y, d2=dx*dx+dy*dy;
      if (!best||d2<best.d2) best={B,d2}, bestIdx=j;
    }
    if (best) {
      const path = carveCorridor(tiles, A.x,A.y, best.B.x,best.B.y);
      allPaths.push(path);
      connected.add(i);
      connected.add(bestIdx);
    }
  }

  // —— 4) Удаляем висячие hall —— 
  for (let y=0;y<S;y++) for (let x=0;x<S;x++){
    if (tiles[y][x]==='hall') {
      const ok = [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>
        tiles[y+dy]?.[x+dx]==='room'
      );
      if (!ok) tiles[y][x]='wall';
    }
  }

  // —— 5) Валидация дверей —— 
  for (let y=0;y<S;y++) for (let x=0;x<S;x++){
    if (tiles[y][x]!=='door') continue;
    let nD=0,nR=0,nH=0,nW=0;
    for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const t=tiles[y+dy]?.[x+dx];
      if (t==='door') nD++;
      else if (t==='room') nR++;
      else if (t==='hall') nH++;
      else nW++;
    }
    if (!(nD<=1 && nR===1 && nH===1 && (nW===1||nW===2))) {
      tiles[y][x]='wall';
    }
  }

  // —— 6) Прямое соприкосновение room↔hall без door —— 
  rooms.forEach((r,i)=>{
    const cntBySide = { N:0,S:0,W:0,E:0 };
    roomDoors[i].forEach(d=>cntBySide[d.side]++);
    const MAX=2;
    for (const side of ['N','S','W','E']){
      const [dx,dy]=sideOffsets[side];
      const boundary = r.cells.filter(([cx,cy])=>
        tiles[cy+dy]?.[cx+dx]==='hall'
      );
      if (!boundary.length) continue;
      boundary.sort((a,b)=>
        side==='N'||side==='S' ? a[0]-b[0] : a[1]-b[1]
      );
      let slots = MAX - cntBySide[side];
      const take = [];
      for (const [cx,cy] of boundary){
        if (slots<=0) break;
        if (!take.length ||
           (side==='N'||side==='S'
             ? Math.abs(take[take.length-1][0]-cx)===1
             : Math.abs(take[take.length-1][1]-cy)===1)
        ) {
          take.push([cx,cy]);
          slots--;
        }
      }
      for (const [cx,cy] of boundary){
        const nx=cx+dx, ny=cy+dy;
        tiles[ny][nx] = take.some(t=>t[0]===cx&&t[1]===cy) ? 'door' : 'wall';
      }
    }
  });

  // —— 7) Для каждого длинного коридора (>10) обеспечиваем ветвление —— 
  for (const path of allPaths) {
    if (path.length <= 10) continue;
    const mid = path[Math.floor(path.length/2)];
    const [cx,cy] = mid;
    // определяем направление основного сегмента
    let prev = path[0], next = path[path.length-1];
    if (path.length>1) { prev=path[1]; next=path[path.length-2]; }
    const dx = next[0] - prev[0], dy = next[1] - prev[1];
    // выбираем перпендикуляр
    const dirs = dx!==0
      ? [[0,1],[0,-1]]
      : [[1,0],[-1,0]];
    const [bdx,bdy] = dirs[Math.floor(Math.random()*dirs.length)];
    // вырезаем branch длиной 3–6
    const len = 3 + Math.floor(Math.random()*4);
    for (let k=1; k<=len; k++){
      const x = cx + bdx*k, y = cy + bdy*k;
      if (x<0||y<0||x>=S||y>=S) break;
      if (tiles[y][x]==='wall') tiles[y][x] = 'hall';
      else break;
    }
  }

  return tiles;
}

// ——— carveCorridor возвращает список [x,y] путевых клеток hall ——
function carveCorridor(tiles, x1,y1,x2,y2) {
  const S = tiles.length;
  const W = 2 + Math.floor(Math.random()*2);
  const path = [];

  if (Math.random()<0.5) {
    // горизонтальный сегмент
    const xa=Math.min(x1,x2), xb=Math.max(x1,x2), y0=y1-((W/2)|0);
    for (let x=xa; x<=xb; x++)
      for (let dy=0; dy<W; dy++)
        if (tiles[y0+dy]?.[x]==='wall') {
          tiles[y0+dy][x]='hall';
          path.push([x,y0+dy]);
        }
    // вертикальный сегмент
    const ya=Math.min(y1,y2), yb=Math.max(y1,y2), x0=x2-((W/2)|0);
    for (let y=ya; y<=yb; y++)
      for (let dx=0; dx<W; dx++)
        if (tiles[y]?.[x0+dx]==='wall') {
          tiles[y][x0+dx]='hall';
          path.push([x0+dx,y]);
        }
  } else {
    // вертикальный сначала
    const ya=Math.min(y1,y2), yb=Math.max(y1,y2), x0=x1-((W/2)|0);
    for (let y=ya; y<=yb; y++)
      for (let dx=0; dx<W; dx++)
        if (tiles[y]?.[x0+dx]==='wall') {
          tiles[y][x0+dx]='hall';
          path.push([x0+dx,y]);
        }
    const xa=Math.min(x1,x2), xb=Math.max(x1,x2), y0=y2-((W/2)|0);
    for (let x=xa; x<=xb; x++)
      for (let dy=0; dy<W; dy++)
        if (tiles[y0+dy]?.[x]==='wall') {
          tiles[y0+dy][x]='hall';
          path.push([x,y0+dy]);
        }
  }

  return path;
}

function shuffle(arr) {
  for (let i=arr.length-1; i>0; i--){
    const j = Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]] = [arr[j],arr[i]];
  }
}