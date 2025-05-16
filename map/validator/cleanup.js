// map/validator/cleanup.js
/**
 * @param {string[][]} tiles
 * @param {Array<{cells:[number,number][]}>} rooms
 * @param {number} S
 */
export function cleanupHalls(tiles, rooms, S) {
  // Удаляем «висячие» hall: те, которые не граничат ни с одной room и ни с одной door
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (tiles[y][x] === 'hall') {
        const neigh = [[1,0],[-1,0],[0,1],[0,-1]];
        const hasAnchor = neigh.some(([dx,dy]) => {
          const t = tiles[y+dy]?.[x+dx];
          return t === 'room' || t === 'door';
        });
        if (!hasAnchor) {
          tiles[y][x] = 'wall';
        }
      }
    }
  }
}