// map/validator/corridors.js
import { shuffle } from './utils.js';

/**
 * @param {string[][]} tiles
 * @param {Array<{x,y,room}>} doors
 * @param {number} S
 * @returns {Array<[number,number][]>} paths
 */
export function carveAllCorridors(tiles, doors, S) {
  shuffle(doors);
  const used = new Set();
  const paths = [];

  for (let i = 0; i < doors.length; i++) {
    if (used.has(i)) continue;
    const A = doors[i];
    let best = null, bi = -1;
    for (let j = 0; j < doors.length; j++) {
      if (used.has(j) || A.room === doors[j].room) continue;
      const dx = A.x - doors[j].x, dy = A.y - doors[j].y;
      const d2 = dx*dx + dy*dy;
      if (!best || d2 < best.d2) { best = { B: doors[j], d2 }; bi = j; }
    }
    if (!best) continue;
    const path = carveCorridor(tiles, A.x, A.y, best.B.x, best.B.y);
    paths.push(path);
    used.add(i);
    used.add(bi);
  }

  // 2) Для каждого длинного (>10) коридора делаем одно ответвление 3–6
  for (const path of paths) {
    if (path.length <= 10) continue;
    const idx = Math.floor(path.length/2);
    const [cx,cy] = path[idx];
    // определяем направление основного вреза
    const [x0,y0] = path[0], [x1,y1] = path[path.length-1];
    const dx = x1 - x0, dy = y1 - y0;
    const dirs = dx ? [[0,1],[0,-1]] : [[1,0],[-1,0]];
    const [odx,ody] = dirs[Math.random()<0.5?0:1];
    const len = 3 + Math.floor(Math.random()*4);
    for (let k = 1; k <= len; k++) {
      const x = cx + odx*k, y = cy + ody*k;
      if (x<0||y<0||x>=S||y>=S) break;
      if (tiles[y][x] === 'wall') tiles[y][x] = 'hall';
      else break;
    }
  }

  return paths;
}

function carveCorridor(tiles,x1,y1,x2,y2) {
  const S = tiles.length, W = 2 + Math.floor(Math.random()*2), path = [];
  const segH = (xa,xb,y0) => {
    for (let x = xa; x <= xb; x++) for (let t = 0; t < W; t++) {
      const yy = y0 + t;
      if (tiles[yy]?.[x] === 'wall') {
        tiles[yy][x] = 'hall'; path.push([x,yy]);
      }
    }
  };
  const segV = (ya,yb,x0) => {
    for (let y = ya; y <= yb; y++) for (let t = 0; t < W; t++) {
      const xx = x0 + t;
      if (tiles[y]?.[xx] === 'wall') {
        tiles[y][xx] = 'hall'; path.push([xx,y]);
      }
    }
  };

  if (Math.random() < 0.5) {
    segH(Math.min(x1,x2), Math.max(x1,x2), y1 - (W>>1));
    segV(Math.min(y1,y2), Math.max(y1,y2), x2 - (W>>1));
  } else {
    segV(Math.min(y1,y2), Math.max(y1,y2), x1 - (W>>1));
    segH(Math.min(x1,x2), Math.max(x1,x2), y2 - (W>>1));
  }
  return path;
}