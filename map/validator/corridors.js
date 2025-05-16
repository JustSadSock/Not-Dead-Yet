// map/validator/corridors.js
import { shuffle } from './utils.js';

/**
 * Соединяет двери попарно L-образными коридорами толщиной 2–3,
 * и для каждого длинного (>10) вырезает перпендикулярное ответвление.
 * @param {string[][]} tiles
 * @param {Array<{x,y,room}>} doors
 * @param {number} S
 * @returns {Array<[number,number][]>} paths — список путей hall
 */
export function carveAllCorridors(tiles, doors, S) {
  shuffle(doors);
  const connected = new Set();
  const allPaths  = [];

  for (let i=0;i<doors.length;i++){
    if (connected.has(i)) continue;
    const A = doors[i];
    let best = null, bi=-1;
    for (let j=0;j<doors.length;j++){
      if (i===j||connected.has(j)) continue;
      const B = doors[j];
      if (B.room===A.room) continue;
      const dx=A.x-B.x, dy=A.y-B.y, d2=dx*dx+dy*dy;
      if (!best||d2<best.d2) best={B,d2}, bi=j;
    }
    if (best) {
      const path = carveCorridor(tiles, A.x,A.y, best.B.x,best.B.y);
      allPaths.push(path);
      connected.add(i);
      connected.add(bi);
    }
  }

  // ответвления
  for (const path of allPaths) {
    if (path.length <= 10) continue;
    const mid = path[Math.floor(path.length/2)];
    const [cx,cy] = mid;
    // определяем направление сегмента
    const [p0,p1] = path.length>1 ? [path[0],path[path.length-1]] : [mid,mid];
    const dx = (p1[0]-p0[0]), dy = (p1[1]-p0[1]);
    const dirs = dx? [[0,1],[0,-1]] : [[1,0],[-1,0]];
    const [odx,ody] = dirs[Math.random()<0.5?0:1];
    const len = 3 + Math.floor(Math.random()*4);
    for (let k=1;k<=len;k++){
      const x = cx+odx*k, y=cy+ody*k;
      if (x<0||y<0||x>=S||y>=S) break;
      if (tiles[y][x]==='wall') tiles[y][x]='hall';
      else break;
    }
  }

  return allPaths;
}

// вырез L-образного коридора, возвращает path
function carveCorridor(tiles, x1,y1,x2,y2) {
  const S = tiles.length;
  const W = 2 + Math.floor(Math.random()*2);
  const path = [];

  const doSeg = (xa,xb, y0, dx, dy) => {
    for (let x=xa; x<=xb; x++) for (let t=0;t<W;t++){
      const yy = y0 + t;
      if (tiles[yy]?.[x]==='wall') {
        tiles[yy][x]='hall'; path.push([x,yy]);
      }
    }
  };
  const doSegV = (ya,yb, x0, dx, dy) => {
    for (let y=ya; y<=yb; y++) for (let t=0;t<W;t++){
      const xx = x0 + t;
      if (tiles[y]?.[xx]==='wall') {
        tiles[y][xx]='hall'; path.push([xx,y]);
      }
    }
  };

  if (Math.random()<0.5) {
    const xa=Math.min(x1,x2), xb=Math.max(x1,x2), y0=y1-((W/2)|0);
    doSeg(xa,xb,y0);
    const ya=Math.min(y1,y2), yb=Math.max(y1,y2), x0=x2-((W/2)|0);
    doSegV(ya,yb,x0);
  } else {
    const ya=Math.min(y1,y2), yb=Math.max(y1,y2), x0=x1-((W/2)|0);
    doSegV(ya,yb,x0);
    const xa=Math.min(x1,x2), xb=Math.max(x1,x2), y0=y2-((W/2)|0);
    doSeg(xa,xb,y0);
  }

  return path;
}
