const GameMap = require('../map');

const gm = new GameMap();
const ROOM = 2, DOOR = 3, CORR = 1;

function checkChunk(chunkX, chunkY) {
  gm.ensureChunk(chunkX, chunkY);
  const S = gm.chunkSize;
  const tiles = gm.chunks.get(`${chunkX},${chunkY}`).tiles;

  // corridor width check
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (tiles[y][x] === CORR) {
        const horiz = (x>0 && tiles[y][x-1]===CORR) || (x<S-1 && tiles[y][x+1]===CORR);
        const vert  = (y>0 && tiles[y-1][x]===CORR) || (y<S-1 && tiles[y+1][x]===CORR);
        const nearDoor = (x>0 && tiles[y][x-1]===DOOR) || (x<S-1 && tiles[y][x+1]===DOOR) ||
                         (y>0 && tiles[y-1][x]===DOOR) || (y<S-1 && tiles[y+1][x]===DOOR);
        if (!horiz && !vert && !nearDoor) {
          console.error(`Isolated corridor tile at ${x},${y} in ${chunkX},${chunkY}`);
          return false;
        }
      }
    }
  }

  // room enclosure check
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (tiles[y][x] === ROOM) {
        const neighbors = [
          [x-1, y], [x+1, y], [x, y-1], [x, y+1]
        ];
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
          const t = tiles[ny][nx];
          if (t === CORR) {
            if (tiles[y][x] !== DOOR && tiles[ny][nx] !== DOOR) {
              console.error(`Room open to corridor at ${x},${y} in ${chunkX},${chunkY}`);
              return false;
            }
          }
        }
      }
    }
  }

  // room rectangle and door side checks using stored room data
  const chunkRooms = gm.chunks.get(`${chunkX},${chunkY}`).rooms || [];
  for (const room of chunkRooms) {
    const { x: rx, y: ry, w, h } = room;
    if (w < 4 || w > 8 || h < 4 || h > 8) {
      console.error(`Room size ${w}x${h} out of range in ${chunkX},${chunkY}`);
      return false;
    }
    const count = (room.doorSides || []).length;
    if (count > 3) {
      console.error(`Room with more than 3 door sides in ${chunkX},${chunkY}`);
      return false;
    }
  }

  // corridor length check
  const dist = Array.from({ length: S }, () => Array(S).fill(Infinity));
  const q = [];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (tiles[y][x] === DOOR) {
        dist[y][x] = 0;
        q.push([x, y]);
      } else if (tiles[y][x] === CORR && (x === 0 || y === 0 || x === S - 1 || y === S - 1)) {
        dist[y][x] = 0;
        q.push([x, y]);
      }
    }
  }
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  while (q.length) {
    const [cx1, cy1] = q.shift();
    for (const [dx, dy] of dirs) {
      const nx = cx1 + dx, ny = cy1 + dy;
      if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
      if (tiles[ny][nx] !== CORR && tiles[ny][nx] !== DOOR) continue;
      const nd = dist[cy1][cx1] + 1;
      if (nd < dist[ny][nx]) {
        dist[ny][nx] = nd;
        q.push([nx, ny]);
      }
    }
  }
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (tiles[y][x] === CORR && dist[y][x] > 20) {
        console.error(`Corridor longer than 20 tiles at ${x},${y} in ${chunkX},${chunkY}`);
        return false;
      }
    }
  }

  return true;
}

for (let cy=-1; cy<=1; cy++) {
  for (let cx=-1; cx<=1; cx++) {
    if (!checkChunk(cx, cy)) process.exit(1);
  }
}
console.log('Geometry invariants satisfied.');
