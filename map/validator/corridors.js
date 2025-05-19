// map/validator/corridors.js
/**
 * Соединяет комнаты в порядке their.center по простому MST-линии.
 * Каждый коридор вырезается L-образно: сначала горизонтально, потом вертикально (или наоборот).
 */
export function carveCorridors(tiles, rooms) {
  if (rooms.length < 2) return;

  // сортируем центры, чтобы коридоры не вразброс
  rooms.sort((a, b) => a.center.x - b.center.x);

  for (let i = 1; i < rooms.length; i++) {
    const c1 = rooms[i - 1].center;
    const c2 = rooms[i].center;

    if (Math.random() < 0.5) {
      // горизонтально → вертикально
      for (let x = Math.min(c1.x, c2.x); x <= Math.max(c1.x, c2.x); x++) {
        if (tiles[c1.y][x].type === 'wall')
          tiles[c1.y][x].type = 'floorCorridor';
      }
      for (let y = Math.min(c1.y, c2.y); y <= Math.max(c1.y, c2.y); y++) {
        if (tiles[y][c2.x].type === 'wall')
          tiles[y][c2.x].type = 'floorCorridor';
      }
    } else {
      // вертикально → горизонтально
      for (let y = Math.min(c1.y, c2.y); y <= Math.max(c1.y, c2.y); y++) {
        if (tiles[y][c1.x].type === 'wall')
          tiles[y][c1.x].type = 'floorCorridor';
      }
      for (let x = Math.min(c1.x, c2.x); x <= Math.max(c1.x, c2.x); x++) {
        if (tiles[c2.y][x].type === 'wall')
          tiles[c2.y][x].type = 'floorCorridor';
      }
    }
  }
}