const GameMap = require('../map');

const gm = new GameMap();

gm.ensureChunk(0, 0);
const neighbors = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
];
for (const [dx, dy] of neighbors) {
  gm.ensureChunk(dx, dy);
}

const S = gm.chunkSize;
const dummyPlayer = { x: 0, y: 0, angle: 0 };
function emptyFOV() { return new Set(); }

function edgeConnected(dx, dy) {
  const c0 = gm.chunks.get('0,0').tiles;
  const cN = gm.chunks.get(`${dx},${dy}`).tiles;
  if (!c0 || !cN) return false;
  if (dx === 1) {
    for (let y = 0; y < S; y++) {
      const left  = c0[y][S-1] === 1 || c0[y][S-2] === 1;
      const right = cN[y][0] === 1 || cN[y][1] === 1;
      if (left && right) return true;
    }
    return false;
  }
  if (dx === -1) {
    for (let y = 0; y < S; y++) {
      const left  = cN[y][S-1] === 1 || cN[y][S-2] === 1;
      const right = c0[y][0] === 1 || c0[y][1] === 1;
      if (left && right) return true;
    }
    return false;
  }
  if (dy === 1) {
    for (let x = 0; x < S; x++) {
      const up   = c0[S-1][x] === 1 || c0[S-2][x] === 1;
      const down = cN[0][x] === 1 || cN[1][x] === 1;
      if (up && down) return true;
    }
    return false;
  }
  if (dy === -1) {
    for (let x = 0; x < S; x++) {
      const up   = cN[S-1][x] === 1 || cN[S-2][x] === 1;
      const down = c0[0][x] === 1 || c0[1][x] === 1;
      if (up && down) return true;
    }
    return false;
  }
  return false;
}

function verifyAll() {
  return neighbors.every(([dx, dy]) => edgeConnected(dx, dy));
}

if (!verifyAll()) {
  console.error('Initial chunks are not properly connected.');
  process.exit(1);
}

for (const [dx, dy] of neighbors) {
  const key = `${dx},${dy}`;
  for (let i = 0; i < 10; i++) {
    gm.regenerateChunksPreserveFOV(new Set([key]), emptyFOV, dummyPlayer);
    if (!edgeConnected(dx, dy)) {
      console.error(`Connection lost with chunk ${key} after regeneration.`);
      process.exit(1);
    }
  }
}

console.log('All corridor connections preserved after repeated regeneration.');
