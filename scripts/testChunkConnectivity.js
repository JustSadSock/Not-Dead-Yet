const GameMap = require('../map');

const gm = new GameMap();
const cx1 = 0, cy1 = 0;
const cx2 = 1, cy2 = 0; // adjacent chunk to the east

gm.ensureChunk(cx1, cy1);
gm.ensureChunk(cx2, cy2);

const key1 = `${cx1},${cy1}`;
const key2 = `${cx2},${cy2}`;
const chunk1 = gm.chunks.get(key1).tiles;
const chunk2 = gm.chunks.get(key2).tiles;

const S = gm.chunkSize;
let connected = false;
for (let y = 0; y < S; y++) {
  const left  = chunk1[y][S-1] === 1 || chunk1[y][S-2] === 1;
  const right = chunk2[y][0] === 1 || chunk2[y][1] === 1;
  if (left && right) {
    connected = true;
    break;
  }
}

if (!connected) {
  console.error('Chunks (0,0) and (1,0) do not share a corridor.');
  process.exit(1);
}
console.log('Chunks are connected by a corridor.');
