// map/validator/cleanup.js
// Убираем висячие hall и запрещаем прямое соприкосновение room↔hall без door

/**
 * @param {string[][]} tiles — текущая матрица 'wall'/'room'/'hall'/'door'
 * @param {Array<{ cells:[number,number][], minX, maxX, minY, maxY }>} rooms
 * @param {number} S — размер чанка
 */
export function cleanupHalls(tiles, rooms, S) {
  // 1) Удаляем висячие hall (не смежные ни с одной room)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (tiles[y][x] === 'hall') {
        const hasRoomNeighbor = [
          [1, 0], [-1, 0],
          [0, 1], [0, -1]
        ].some(([dx, dy]) =>
          tiles[y + dy]?.[x + dx] === 'room'
        );
        if (!hasRoomNeighbor) {
          tiles[y][x] = 'wall';
        }
      }
    }
  }

  // 2) Запрещаем прямое соприкосновение room ↔ hall без промежуточной door
  //    (если room-граничная клетка соседствует с hall, но нет door — превращаем hall в wall)
  for (const r of rooms) {
    for (const [cx, cy] of r.cells) {
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
        if (tiles[ny][nx] === 'hall') {
          // проверяем, есть ли между ними дверь
          // т.е. между room (cx,cy) и hall (nx,ny) должна быть door,
          // но так как они соседние — проверяем именно эту клетку hall
          // если она не door, убираем hall
          tiles[ny][nx] = 'wall';
        }
      }
    }
  }
}
