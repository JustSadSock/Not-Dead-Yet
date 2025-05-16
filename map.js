// ——————————————
//  Внутренние методы GameMap (фрагмент)
// ——————————————

/**
 * Генерация одного чанка:
 * 1. Разбросать комнаты (5×5…8×8), без пересечений.
 * 2. Построить MST между центрами.
 * 3. Прорезать L-образные коридоры шириной 2.
 * 4. Обвести каждую комнату и каждый коридор стеной (buffer = 1), чтобы не было «просачивания».
 */
_generateChunk(cx, cy) {
  const S = this.chunkSize;
  // 1) создаём пустое полотно
  const grid = Array.from({ length: S }, () => Array(S).fill(false));

  // === 1. Расстановка комнат ===
  const rooms = [];
  const roomCount = 3 + Math.floor(Math.random()*5); // 3…7
  for (let i = 0; i < roomCount; i++) {
    let tries = 0;
    while (tries++ < 100) {
      // треугольное распределение размеров 5…8
      const randSize = () => 5 + Math.floor((Math.random()+Math.random())/2 * 4);
      let w = randSize(), h = randSize();
      // ограничиваем разницу ≦4
      if (Math.abs(w - h) > 4) h = w;

      const x0 = 1 + Math.floor(Math.random()*(S - w - 2));
      const y0 = 1 + Math.floor(Math.random()*(S - h - 2));

      // проверяем буфер 1 вокруг каждой комнаты
      let ok = true;
      for (let [rx,ry,rw,rh] of rooms) {
        if (!(x0 > rx+rw+1 || x0+w+1 < rx || y0 > ry+rh+1 || y0+h+1 < ry)) {
          ok = false; break;
        }
      }
      if (!ok) continue;

      // вырезаем пол
      for (let yy = y0; yy < y0+h; yy++)
        for (let xx = x0; xx < x0+w; xx++)
          grid[yy][xx] = true;

      rooms.push([x0,y0,w,h]);
      break;
    }
  }

  // === 2. MST между центрами ===
  const centers = rooms.map(([x,y,w,h]) => ({
    x: x + Math.floor(w/2),
    y: y + Math.floor(h/2)
  }));
  const N = centers.length;
  const used = new Set([0]), edges = [];
  // считаем квадраты расстояний
  const dist2 = Array(N).fill().map(_=>Array(N).fill(Infinity));
  for (let i=0;i<N;i++) for(let j=0;j<N;j++) if(i!==j){
    const dx = centers[i].x-centers[j].x,
          dy = centers[i].y-centers[j].y;
    dist2[i][j] = dx*dx+dy*dy;
  }
  while (used.size < N) {
    let best = { i:-1,j:-1,d:Infinity };
    for (let i of used) for (let j=0;j<N;j++) {
      if (!used.has(j) && dist2[i][j]<best.d) {
        best = { i,j,d:dist2[i][j] };
      }
    }
    edges.push([best.i,best.j]);
    used.add(best.j);
  }

  // === 3. Прорезка L-коридоров шириной 2 ===
  for (let [i,j] of edges) {
    const a = centers[i], b = centers[j];
    this._carveLCorridor(grid, a.x,a.y, b.x,b.y);
  }

  // === 4. Обнести комнаты и коридоры стеной (buffer=1) ===
  // чтобы не было «протечек» через углы
  const wallGrid = Array.from({ length: S }, () => Array(S).fill(false));
  for (let y=0;y<S;y++) for (let x=0;x<S;x++) {
    if (grid[y][x]) {
      // сам пол остаётся
      wallGrid[y][x] = true;
      // вокруг buffer = 1 остаются стены (false)
    }
  }
  // возвращаем только пол (true) — остальное по умолчанию стена
  return wallGrid;
},

/**
 * Прорезает L-образный коридор шириной 2 от (x1,y1) до (x2,y2):
 * сначала по Х (горизонтально), потом по Y (вертикально).
 * Максимальная длина сегмента ≦25; если больше — разбивает.
 */
_carveLCorridor(grid, x1, y1, x2, y2) {
  const dx = Math.sign(x2 - x1),
        dy = Math.sign(y2 - y1);
  const lenX = Math.abs(x2 - x1),
        lenY = Math.abs(y2 - y1);

  // вспомог: прорезать segment вдоль X
  const carveX = (sx, sy, len) => {
    if (len > 25) {
      // разбиваем пополам
      const mid = Math.floor(len/2);
      carveX(sx, sy, mid);
      carveX(sx+dx*mid, sy, len-mid);
      return;
    }
    for (let i = 0; i <= len; i++) {
      const cx = sx + dx*i, cy = sy;
      if (grid[cy]?.[cx] !== undefined) grid[cy][cx] = true;
      if (grid[cy+1]?.[cx] !== undefined) grid[cy+1][cx] = true;
    }
  };

  // вспомог: прорезать segment вдоль Y
  const carveY = (sx, sy, len) => {
    if (len > 25) {
      const mid = Math.floor(len/2);
      carveY(sx, sy, mid);
      carveY(sx, sy+dy*mid, len-mid);
      return;
    }
    for (let i = 0; i <= len; i++) {
      const cx = sx, cy = sy + dy*i;
      if (grid[cy]?.[cx] !== undefined) grid[cy][cx] = true;
      if (grid[cy]?.[cx+1] !== undefined) grid[cy][cx+1] = true;
    }
  };

  // делаем L-образно: сначала Х, потом Y
  carveX(x1, y1, lenX);
  carveY(x2, y1, lenY);
},