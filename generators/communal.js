function generateCommunal(mapWidth, mapHeight) {
  // Инициализируем карту сплошными стенами '#'
  let map = Array.from({length: mapHeight}, () => Array(mapWidth).fill('#'));
  const FLOOR = '.', WALL = '#', DOOR = '+';
  
  // 1. Создаём главный горизонтальный коридор посередине
  let midY = Math.floor(mapHeight/2);
  for (let x = 0; x < mapWidth; x++) {
    map[midY][x] = FLOOR;
  }
  
  // 2. Создаём несколько ответвлений (вертикальных коридоров) от главного
  for (let x = 2; x < mapWidth-2; x += 8) {
    let extendUp = Math.random() < 0.5;
    let startY = midY + (extendUp ? -1 : 1);
    while (startY > 1 && startY < mapHeight-1 && Math.random() < 0.8) {
      map[startY][x] = FLOOR;
      startY += (extendUp ? -1 : 1);
    }
  }
  
  // 3. Располагаем комнаты вдоль коридоров
  const rooms = [];
  for (let x = 2; x < mapWidth-6; x += 6) {
    // Вертикальная ориентация для каждой потенциальной комнаты
    if (Math.random() < 0.6) {
      let roomW = 3 + Math.floor(Math.random() * 4);
      let roomH = 3 + Math.floor(Math.random() * 4);
      let sign = (Math.random() < 0.5 ? 1 : -1); // вверх или вниз от центрального коридора
      let topY = midY + (sign === 1 ? 1 : -roomH - 1);
      // Проверяем область перед прорезанием
      let canPlace = true;
      for (let yy = topY; yy < topY + roomH; yy++) {
        for (let xx = x; xx < x + roomW; xx++) {
          if (yy < 0 || yy >= mapHeight || xx < 0 || xx >= mapWidth || map[yy][xx] !== WALL) {
            canPlace = false;
          }
        }
      }
      if (!canPlace) continue;
      // 4. Помечаем комнату как пол и ставим дверь у стыка с коридором
      for (let yy = topY; yy < topY + roomH; yy++) {
        for (let xx = x; xx < x + roomW; xx++) {
          map[yy][xx] = FLOOR;
        }
      }
      // Ставим дверь: если комната вверху, дверь в нижней стене комнаты, иначе в верхней
      let doorY = (sign === 1 ? topY : topY + roomH - 1);
      map[doorY][x] = DOOR;
      rooms.push({x, topY, roomW, roomH});
    }
  }
  
  return map;
}