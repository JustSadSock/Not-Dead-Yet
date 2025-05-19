// map/validator/doors.js
/**
 * Ставим двери там, где corridor примыкает к room:
 * ищем все точки, где соседний тайл «floorRoom» и «floorCorridor» рядом
 * и меняем его тип на 'door'.
 */
export function placeDoors(tiles, rooms) {
  const H = tiles.length, W = tiles[0].length;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (tiles[y][x].type !== 'wall') continue;
      const neigh = [
        tiles[y][x-1].type,
        tiles[y][x+1].type,
        tiles[y-1][x].type,
        tiles[y+1][x].type,
      ];
      if (neigh.includes('floorRoom') && neigh.includes('floorCorridor')) {
        tiles[y][x].type = 'door';
      }
    }
  }
}