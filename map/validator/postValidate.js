// map/validator/postValidate.js
/**
 * @param {string[][]} tiles
 * @param {number} S
 */
export function enforcePostValidate(tiles, S) {
  for (let y=0; y<S; y++) {
    for (let x=0; x<S; x++) {
      if (tiles[y][x] !== 'door') continue;
      const neigh = [[1,0],[-1,0],[0,1],[0,-1]];
      const nH = neigh.filter(([dx,dy]) =>
        tiles[y+dy]?.[x+dx] === 'hall'
      ).length;
      if (nH === 0) {
        // ищем направление на room
        const dir = neigh.find(([dx,dy]) =>
          tiles[y+dy]?.[x+dx] === 'room'
        );
        if (dir) {
          const [dx,dy] = dir;
          const hx = x - dx, hy = y - dy;
          if (tiles[hy]?.[hx] === 'wall') tiles[hy][hx] = 'hall';
        }
      }
    }
  }
}