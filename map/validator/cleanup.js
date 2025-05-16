// map/validator/cleanup.js
/**
 * @param {string[][]} tiles
 * @param {Array<{cells:[number,number][]}>} rooms
 * @param {number} S
 */
export function cleanupHalls(tiles, rooms, S) {
  // 1) удаляем висячие hall
  for (let y=0; y<S; y++) {
    for (let x=0; x<S; x++) {
      if (tiles[y][x] === 'hall') {
        const ok = [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy]) =>
          tiles[y+dy]?.[x+dx] === 'room'
        );
        if (!ok) tiles[y][x] = 'wall';
      }
    }
  }
  // 2) запрещаем прямое room↔hall без door
  for (const r of rooms) {
    for (const [cx,cy] of r.cells) {
      for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = cx+dx, ny = cy+dy;
        if (nx<0||ny<0||nx>=S||ny>=S) continue;
        if (tiles[ny][nx] === 'hall') {
          // если рядом нет door — превращаем в wall
          // проверим, что ни одна из 4 сторон у hall не door
          const hasDoor = [[1,0],[-1,0],[0,1],[0,-1]].some(([ox,oy])=>
            tiles[ny+oy]?.[nx+ox] === 'door'
          );
          if (!hasDoor) tiles[ny][nx] = 'wall';
        }
      }
    }
  }
}