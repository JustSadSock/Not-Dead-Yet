// map.js

/**
 * Класс GameMap отвечает за:
 *  - чанковую генерацию и пересборку чанков
 *  - хранение тайлов (стена/пол) и метаданных (visited, memoryAlpha)
 *  - перегенерацию забытых чанков с сохранением FOV
 */
class GameMap {
  constructor() {
    this.chunkSize = 32;              // размер одного чанка в тайлах (32×32)
    this.chunks    = new Map();       // Map<"cx,cy", ChunkData>
    this.generating = new Set();      // текущие чанки в процессе генерации
    this.currentChunkX = null;        // координаты чанка игрока
    this.currentChunkY = null;
  }

  /**
   * Гарантированно создает чанк (если не существует).
   * @param {number} cx — номер чанка по X
   * @param {number} cy — номер чанка по Y
   */
  ensureChunk(cx, cy) {
    const key = `${cx},${cy}`;
    if (this.chunks.has(key) || this.generating.has(key)) return;
    this.generating.add(key);

    // Собственно генерация
    const grid = this._generateChunk(cx, cy);
    // Вставляем метаданные
    const meta = [];
    for (let y = 0; y < this.chunkSize; y++) {
      meta[y] = [];
      for (let x = 0; x < this.chunkSize; x++) {
        meta[y][x] = {
          memoryAlpha: 0,  // текущее "память" (0..1)
          visited:     false // видел ли игрок этот тайл хоть раз
        };
      }
    }
    // Сохраняем в Map
    this.chunks.set(key, { tiles: grid, meta: meta });
    this.generating.delete(key);

    // Соединяем с соседями, если они есть
    this._connectWithNeighbors(cx, cy);
  }

  /**
   * Проверка, является ли тайл по глобальным координатам (x,y) полом.
   * Если чанка нет — возвращает false (стена).
   */
  isFloor(x, y) {
    const cx = Math.floor(x / this.chunkSize);
    const cy = Math.floor(y / this.chunkSize);
    const lx = x - cx * this.chunkSize;
    const ly = y - cy * this.chunkSize;
    const chunk = this.chunks.get(`${cx},${cy}`);
    if (!chunk) return false;
    if (lx < 0 || ly < 0 || lx >= this.chunkSize || ly >= this.chunkSize) return false;
    return chunk.tiles[ly][lx];
  }

  /**
   * Удаляет чанки вне радиуса 1 от (cx,cy) — "забвение" дальних чанков.
   */
  forgetDistantChunks(cx, cy) {
    for (let key of this.chunks.keys()) {
      const [ccx, ccy] = key.split(',').map(Number);
      if (Math.abs(ccx - cx) > 1 || Math.abs(ccy - cy) > 1) {
        this.chunks.delete(key);
      }
    }
  }

  /**
   * Перегенерирует чанки из множества keys, сохраняя FOV-тайлы.
   * @param {Set<string>} keys — например "0,1","-1,0" и т.д.
   * @param {function} computeFOV — функция (x,y,a)->Set<"gx,gy">
   * @param {{x,y,angle}} player — положение/угол игрока
   */
  regenerateChunksPreserveFOV(keys, computeFOV, player) {
    // Сначала получим текущий FOV
    const vis = computeFOV(player.x, player.y, player.angle);
    for (let key of keys) {
      const [cx, cy] = key.split(',').map(Number);
      // Сохраняем видимые куски внутри этого чанка
      const chunk = this.chunks.get(key);
      if (!chunk) continue;
      const saved = [];
      const baseX = cx * this.chunkSize;
      const baseY = cy * this.chunkSize;
      for (let gyx of vis) {
        const [gx, gy] = gyx.split(',').map(Number);
        const ccx = Math.floor(gx / this.chunkSize);
        const ccy = Math.floor(gy / this.chunkSize);
        if (ccx === cx && ccy === cy) {
          const lx = gx - baseX, ly = gy - baseY;
          saved.push({ lx, ly, tile: chunk.tiles[ly][lx], meta: {...chunk.meta[ly][lx]} });
        }
      }
      // Переген
      this.ensureChunk(cx, cy);
      // Заменить вновь созданные мета-данные на сохраненные для FOV
      const newChunk = this.chunks.get(key);
      for (let s of saved) {
        newChunk.tiles[s.ly][s.lx] = s.tile;
        newChunk.meta[s.ly][s.lx]  = s.meta;
      }
    }
  }

  // ———————————
  //  Внутренняя часть генератора
  // ———————————
  _generateChunk(cx, cy) {
    const N = 11;                   // внутр. сетка для дамбиных комнат
    const size = this.chunkSize;    // 32
    // 1) инициализируем все стены = false
    const grid = Array.from({length: size}, ()=>Array(size).fill(false));

    // 2) создаем лабиринт на сетке N×N (carve spanning tree)
    const conn = Array.from({length: N}, ()=>Array.from({length: N}, ()=>({N:0,S:0,E:0,W:0})));
    const visited = Array.from({length: N}, ()=>Array(N).fill(false));
    const stack = [{x:Math.floor(N/2),y:Math.floor(N/2)}];
    visited[stack[0].y][stack[0].x] = true;
    while(stack.length){
      const top = stack[stack.length-1];
      const dirs = [];
      if(top.y>0        && !visited[top.y-1][top.x]) dirs.push('N');
      if(top.y<N-1      && !visited[top.y+1][top.x]) dirs.push('S');
      if(top.x>0        && !visited[top.y][top.x-1]) dirs.push('W');
      if(top.x<N-1      && !visited[top.y][top.x+1]) dirs.push('E');
      if(dirs.length){
        const d = dirs[Math.floor(Math.random()*dirs.length)];
        let nx=top.x, ny=top.y;
        if(d==='N') ny--;
        if(d==='S') ny++;
        if(d==='W') nx--;
        if(d==='E') nx++;
        conn[top.y][top.x][d] = 1;
        conn[ny][nx][{'N':'S','S':'N','E':'W','W':'E'}[d]] = 1;
        visited[ny][nx] = true;
        stack.push({x:nx,y:ny});
      } else {
        stack.pop();
      }
    }

    // 3) прокладываем комнаты и коридоры в реальный grid
    // каждый узел сетки = 3×3 блока с проходами по соединениям
    for(let j=0; j<N; j++){
      for(let i=0; i<N; i++){
        const baseX = i*3, baseY = j*3;
        // 2×2 пол
        grid[baseY][  baseX] = true;
        grid[baseY][  baseX+1] = true;
        grid[baseY+1][baseX] = true;
        grid[baseY+1][baseX+1] = true;
        // восток
        if(conn[j][i].E){
          grid[baseY][  baseX+2] = true;
          grid[baseY+1][baseX+2] = true;
        }
        // юг
        if(conn[j][i].S){
          grid[baseY+2][baseX]   = true;
          grid[baseY+2][baseX+1] = true;
        }
      }
    }
    return grid;
  }

  /**
   * Соединяем свежесозданный чанк с уже существующими соседями
   */
  _connectWithNeighbors(cx, cy) {
    const meKey = `${cx},${cy}`;
    const me     = this.chunks.get(meKey).tiles;
    const size   = this.chunkSize;
    const dirs = [
      {dx:-1,dy:0, meX:0, meY0:0, meY1:size-1, nbX:size-1, nbY0:0, nbY1:size-1}, // W
      {dx: 1,dy:0, meX:size-1, meY0:0, meY1:size-1, nbX:0,   nbY0:0, nbY1:size-1}, // E
      {dx:0, dy:-1, meY:0, meX0:0, meX1:size-1, nbY:size-1, nbX0:0, nbX1:size-1}, // N
      {dx:0, dy: 1, meY:size-1, meX0:0, meX1:size-1, nbY:0,   nbX0:0, nbX1:size-1}  // S
    ];
    for(let d of dirs){
      const nbKey = `${cx+d.dx},${cy+d.dy}`;
      if(!this.chunks.has(nbKey)) continue;
      const nb = this.chunks.get(nbKey).tiles;
      if(d.dx!==0){
        // соединяем вертикальные границы
        for(let yy=d.meY0; yy<=d.meY1; yy++){
          if(me[yy][d.meX] && !nb[yy][d.nbX]) {
            nb[yy][d.nbX] = true;
          }
          if(nb[yy][d.nbX] && !me[yy][d.meX]) {
            me[yy][d.meX] = true;
          }
        }
      } else {
        // соединяем горизонтальные границы
        for(let xx=d.meX0; xx<=d.meX1; xx++){
          if(me[d.meY][xx] && !nb[d.nbY][xx]) {
            nb[d.nbY][xx] = true;
          }
          if(nb[d.nbY][xx] && !me[d.meY][xx]) {
            me[d.meY][xx] = true;
          }
        }
      }
    }
  }
}

// Делаем GameMap глобальным
window.GameMap = GameMap;