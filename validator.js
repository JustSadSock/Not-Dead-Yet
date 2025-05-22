// validator.js
//
// Проверяет, что чанк удовлетворяет “правилам коммуналки”.
// tiles — квадрат S×S (строки «wall|room|hall|door»).
// Возвращает true, если всё OK.

export function chunkIsValid(tiles) {
  const S = tiles.length;

  /* --- утилиты --- */
  const inRange = (x,y) => (x>=0&&y>=0&&x<S&&y<S);
  const dirs4 = [[1,0],[-1,0],[0,1],[0,-1]];

  /* собираем комнаты */
  const rooms = [];
  const seen = Array.from({length:S},()=>Array(S).fill(false));
  for (let y=0;y<S;y++) for (let x=0;x<S;x++) {
    if (tiles[y][x]!=='room' || seen[y][x]) continue;
    /* flood-fill отдельную комнату */
    const q=[[x,y]]; let minX=x,maxX=x,minY=y,maxY=y;
    while (q.length) {
      const [cx,cy]=q.pop();
      if (seen[cy][cx]) continue;
      seen[cy][cx]=true;
      minX=Math.min(minX,cx); maxX=Math.max(maxX,cx);
      minY=Math.min(minY,cy); maxY=Math.max(maxY,cy);
      for (const [dx,dy] of dirs4) {
        const nx=cx+dx, ny=cy+dy;
        if (inRange(nx,ny) && tiles[ny][nx]==='room' && !seen[ny][nx])
          q.push([nx,ny]);
      }
    }
    const w=maxX-minX+1, h=maxY-minY+1;
    if (w<4||h<4) return false;                    // минимум 4×4
    rooms.push({minX,maxX,minY,maxY});
  }

  /* проверяем каждую комнату */
  for (const R of rooms) {
    const doorCnt = {L:0,R:0,T:0,B:0};
    /* перебираем периметр комнаты */
    for (let x=R.minX; x<=R.maxX; x++) {
      if (tiles[R.minY][x]==='door') doorCnt.T++;
      if (tiles[R.maxY][x]==='door') doorCnt.B++;
    }
    for (let y=R.minY; y<=R.maxY; y++) {
      if (tiles[y][R.minX]==='door') doorCnt.L++;
      if (tiles[y][R.maxX]==='door') doorCnt.R++;
    }

    const doorsTotal = doorCnt.L+doorCnt.R+doorCnt.T+doorCnt.B;
    if (doorsTotal < 2) return false;              // ≥2 двери в сумме
    if (doorCnt.L>2||doorCnt.R>2||doorCnt.T>2||doorCnt.B>2) return false;

    /* проверяем, что нет “room рядом с hall без door” */
    for (let y=R.minY; y<=R.maxY; y++) {
      for (let x=R.minX; x<=R.maxX; x++) {
        for (const [dx,dy] of dirs4) {
          const nx=x+dx, ny=y+dy;
          if(!inRange(nx,ny)) continue;
          if (tiles[ny][nx]==='hall' && tiles[y][x]!=='door') {
            /* сосед hall, а между ними не door → ошибка */
            return false;
          }
        }
      }
    }
  }

  /* проверяем, что hall всегда 2-тайловый (минимум 2 ширины) */
  for (let y=0;y<S;y++) for (let x=0;x<S;x++) if (tiles[y][x]==='hall') {
    const horiz = tiles[y]?.[x+1]==='hall' || tiles[y]?.[x-1]==='hall';
    const vert  = tiles[y+1]?.[x]==='hall' || tiles[y-1]?.[x]==='hall';
    if (!horiz && !vert) return false;             // одиночный hall
  }

  return true;
}
