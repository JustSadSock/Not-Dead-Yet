const GameMap = require('../map');

const gm = new GameMap();
const ROOM = 2, DOOR = 3, CORR = 1;

function checkChunk(cx, cy) {
  gm.ensureChunk(cx, cy);
  const S = gm.chunkSize;
  const tiles = gm.chunks.get(`${cx},${cy}`).tiles;

  // corridor width check
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (tiles[y][x] === CORR) {
        const horiz = (x>0 && tiles[y][x-1]===CORR) || (x<S-1 && tiles[y][x+1]===CORR);
        const vert  = (y>0 && tiles[y-1][x]===CORR) || (y<S-1 && tiles[y+1][x]===CORR);
        const nearDoor = (x>0 && tiles[y][x-1]===DOOR) || (x<S-1 && tiles[y][x+1]===DOOR) ||
                         (y>0 && tiles[y-1][x]===DOOR) || (y<S-1 && tiles[y+1][x]===DOOR);
        if (!horiz && !vert && !nearDoor) {
          console.error(`Isolated corridor tile at ${x},${y} in ${cx},${cy}`);
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
              console.error(`Room open to corridor at ${x},${y} in ${cx},${cy}`);
              return false;
            }
          }
        }
      }
    }
  }

  return true;
}

for (let cy=-1; cy<=1; cy++) {
  for (let cx=-1; cx<=1; cx++) {
    if (!checkChunk(cx,cy)) process.exit(1);
  }
}
console.log('Geometry invariants satisfied.');
