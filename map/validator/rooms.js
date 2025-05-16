// map/validator/rooms.js

/**
 * Flood-fill «room» → собираем комнаты и bbox
 * @returns {Array<{ cells:[number,number][], minX, maxX, minY, maxY }>}
 */
export function findRooms(tiles, S) {
  const rooms = [];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (tiles[y][x] === 'room') {
        const stack = [[x,y]], cells = [];
        tiles[y][x] = '_';  // метка
        while (stack.length) {
          const [cx,cy] = stack.pop();
          cells.push([cx,cy]);
          for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const nx = cx+dx, ny = cy+dy;
            if (nx>=0 && ny>=0 && nx<S && ny<S && tiles[ny][nx]==='room') {
              tiles[ny][nx] = '_';
              stack.push([nx,ny]);
            }
          }
        }
        let minX=S, maxX=0, minY=S, maxY=0;
        for (const [cx,cy] of cells) {
          minX = Math.min(minX,cx);
          maxX = Math.max(maxX,cx);
          minY = Math.min(minY,cy);
          maxY = Math.max(maxY,cy);
        }
        rooms.push({ cells, minX, maxX, minY, maxY });
      }
    }
  }
  // восстанавливаем «room»
  for (const r of rooms) for (const [x,y] of r.cells) tiles[y][x] = 'room';
  return rooms;
}
