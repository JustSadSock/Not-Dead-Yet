const GameMap = require('../map');

const gm = new GameMap();
const WALL = 0, CORR = 1, ROOM = 2, DOOR = 3;
const S = gm.chunkSize;
const errors = [];

function checkChunk(cx, cy) {
  gm.ensureChunk(cx, cy);
  const tiles = gm.chunks.get(`${cx},${cy}`).tiles;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const t = tiles[y][x];
      if (t === CORR) {
        const horiz = (x > 0 && tiles[y][x - 1] === CORR) ||
                      (x < S - 1 && tiles[y][x + 1] === CORR);
        const vert  = (y > 0 && tiles[y - 1][x] === CORR) ||
                      (y < S - 1 && tiles[y + 1][x] === CORR);
        if (!(horiz && vert)) {
          errors.push(`Corridor width broken at chunk ${cx},${cy} tile ${x},${y}`);
        }
      }
      if (t === ROOM) {
        const dirs = [
          [1, 0], [-1, 0], [0, 1], [0, -1]
        ];
        for (const [dx, dy] of dirs) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
          const nt = tiles[ny][nx];
          if (nt === CORR) {
            errors.push(`Room directly touches corridor at chunk ${cx},${cy} tile ${x},${y}`);
          } else if (nt === DOOR) {
            const bx = nx + dx, by = ny + dy;
            if (bx >= 0 && by >= 0 && bx < S && by < S && tiles[by][bx] !== CORR) {
              errors.push(`Door at chunk ${cx},${cy} tile ${nx},${ny} does not lead to corridor`);
            }
          }
        }
      }
    }
  }
}

for (let cx = -1; cx <= 1; cx++) {
  for (let cy = -1; cy <= 1; cy++) {
    checkChunk(cx, cy);
  }
}

if (errors.length) {
  for (const e of errors) console.error(e);
  process.exit(1);
}
console.log('Geometry constraints satisfied.');
