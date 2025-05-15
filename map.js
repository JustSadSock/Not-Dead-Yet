class GameMap {
  constructor() {
    this.chunkSize = 32;        // number of tiles per chunk side
    this._algoSize = 11;        // internal algorithm grid size for chunk generation
    this.chunks = new Map();    // store generated chunks by key "cx,cy"
    this.generating = new Set(); // track chunks in generation to avoid recursion
    // Track current chunk for forgetting logic
    this.currentChunkX = null;
    this.currentChunkY = null;
  }

  // Ensure chunk at (cx,cy) exists (generate if not)
  ensureChunk(cx, cy) {
    const key = `${cx},${cy}`;
    if(this.chunks.has(key) || this.generating.has(key)) {
      return; // already exists or in progress
    }
    this.generating.add(key);
    // Generate new chunk data
    const chunkData = this._generateChunk(cx, cy);
    this.chunks.set(key, chunkData);
    this.generating.delete(key);
    // After generation, connect with any existing neighbors (both directions)
    const neighbors = [
      {cx: cx-1, cy: cy, side: 'W'}, // west neighbor
      {cx: cx+1, cy: cy, side: 'E'}, // east neighbor
      {cx: cx, cy: cy-1, side: 'N'}, // north neighbor
      {cx: cx, cy: cy+1, side: 'S'}  // south neighbor
    ];
    for(const nb of neighbors) {
      const nbKey = `${nb.cx},${nb.cy}`;
      if(this.chunks.has(nbKey)) {
        // neighbor exists, connect current and neighbor at the shared border
        this._connectChunks(nb.side, chunkData, this.chunks.get(nbKey));
      }
    }
  }

  // Check if given global tile coordinate is floor (open) or wall (solid)
  isFloor(x, y) {
    // Determine chunk coordinates for (x,y)
    const cx = Math.floor(x / this.chunkSize);
    const cy = Math.floor(y / this.chunkSize);
    const ix = x - cx * this.chunkSize;
    const iy = y - cy * this.chunkSize;
    const key = `${cx},${cy}`;
    if(!this.chunks.has(key)) {
      // If chunk not loaded, consider it wall for now (player cannot go there until generated)
      return false;
    }
    const chunk = this.chunks.get(key);
    if(ix < 0 || iy < 0 || ix >= this.chunkSize || iy >= this.chunkSize) {
      return false;
    }
    return chunk[iy][ix] === true;
  }

  // Remove chunks far from current to implement forgetting mechanic
  forgetDistantChunks(curCx, curCy) {
    const keysToRemove = [];
    for(let key of this.chunks.keys()) {
      const [cx, cy] = key.split(',').map(Number);
      // keep chunks within 1 chunk distance (Chebyshev distance) from current
      if(Math.abs(cx - curCx) > 1 || Math.abs(cy - curCy) > 1) {
        keysToRemove.push(key);
      }
    }
    for(let key of keysToRemove) {
      this.chunks.delete(key);
    }
  }

  // Generate chunk data for given chunk coordinates
  _generateChunk(cx, cy) {
    // Use a random seed based on coordinates for repeatable generation if desired (optional)
    // For chaotic effect (changing every time), do not fix seed so it will be random each generation.
    // Create 2D array filled with false (walls)
    const size = this.chunkSize;
    const grid = Array.from({length: size}, () => Array(size).fill(false));

    // Internal algorithm grid of cells for dungeon layout
    const n = this._algoSize;
    // Initialize structure for connections (each cell with N,S,E,W boolean)
    const conn = [];
    for(let j=0; j<n; j++) {
      conn[j] = [];
      for(let i=0; i<n; i++) {
        conn[j][i] = {N:false, S:false, E:false, W:false};
      }
    }
    // Randomized DFS to carve spanning tree
    const startCellX = Math.floor(n/2);
    const startCellY = Math.floor(n/2);
    const stack = [{x: startCellX, y: startCellY}];
    const visited = Array.from({length: n}, () => Array(n).fill(false));
    visited[startCellY][startCellX] = true;
    const dirs = ['N','S','E','W'];
    while(stack.length > 0) {
      const cell = stack[stack.length - 1];
      // collect unvisited neighbors
      const neighbors = [];
      if(cell.y > 0 && !visited[cell.y-1][cell.x]) neighbors.push({dir:'N', x: cell.x, y: cell.y-1});
      if(cell.y < n-1 && !visited[cell.y+1][cell.x]) neighbors.push({dir:'S', x: cell.x, y: cell.y+1});
      if(cell.x > 0 && !visited[cell.y][cell.x-1]) neighbors.push({dir:'W', x: cell.x-1, y: cell.y});
      if(cell.x < n-1 && !visited[cell.y][cell.x+1]) neighbors.push({dir:'E', x: cell.x+1, y: cell.y});
      if(neighbors.length > 0) {
        // choose random neighbor and carve
        const next = neighbors[Math.floor(Math.random() * neighbors.length)];
        const cx2 = next.x, cy2 = next.y;
        // carve connection in both cells
        if(next.dir === 'N') { conn[cell.y][cell.x].N = true; conn[cy2][cx2].S = true; }
        if(next.dir === 'S') { conn[cell.y][cell.x].S = true; conn[cy2][cx2].N = true; }
        if(next.dir === 'W') { conn[cell.y][cell.x].W = true; conn[cy2][cx2].E = true; }
        if(next.dir === 'E') { conn[cell.y][cell.x].E = true; conn[cy2][cx2].W = true; }
        visited[cy2][cx2] = true;
        stack.push({x: cx2, y: cy2});
      } else {
        stack.pop();
      }
    }
    // Remove dead ends by adding extra connections
    let done = false;
    while(!done) {
      done = true;
      for(let j=0; j<n; j++) {
        for(let i=0; i<n; i++) {
          // calculate degree of connections for cell
          const connections = conn[j][i];
          let deg = 0;
          for(let d in connections) { if(connections[d]) deg++; }
          if(deg === 1) {
            // dead end cell: add an extra connection
            done = false;
            // Find a random closed direction to open (inside grid)
            const options = [];
            if(j > 0 && !connections.N) options.push('N');
            if(j < n-1 && !connections.S) options.push('S');
            if(i > 0 && !connections.W) options.push('W');
            if(i < n-1 && !connections.E) options.push('E');
            if(options.length > 0) {
              const dir = options[Math.floor(Math.random() * options.length)];
              let nx = i, ny = j;
              if(dir === 'N') { ny = j-1; conn[j][i].N = true; conn[ny][nx].S = true; }
              if(dir === 'S') { ny = j+1; conn[j][i].S = true; conn[ny][nx].N = true; }
              if(dir === 'W') { nx = i-1; conn[j][i].W = true; conn[ny][nx].E = true; }
              if(dir === 'E') { nx = i+1; conn[j][i].E = true; conn[ny][nx].W = true; }
            }
          }
        }
      }
    }
    // Now conn represents a fully connected labyrinth with no dead ends in cell graph.
    // Map the cell grid to actual tile grid
    for(let j=0; j<n; j++) {
      for(let i=0; i<n; i++) {
        // Base 2x2 floor block for each cell
        const baseX = i * 3;
        const baseY = j * 3;
        grid[baseY][baseX] = true;
        grid[baseY][baseX+1] = true;
        grid[baseY+1][baseX] = true;
        grid[baseY+1][baseX+1] = true;
        // Open passages according to connections
        if(conn[j][i].E) { // east passage
          grid[baseY][baseX+2] = true;
          grid[baseY+1][baseX+2] = true;
        }
        if(conn[j][i].S) { // south passage
          grid[baseY+2][baseX] = true;
          grid[baseY+2][baseX+1] = true;
        }
      }
    }
    return grid;
  }

  // Connect two adjacent chunks (current and neighbor) at their shared border
  _connectChunks(side, chunkA, chunkB) {
    // side indicates which side of chunkA neighbor is on: 'N','S','E','W'
    let ax0, ay0, ax1, ay1, bx0, by0, bx1, by1;
    const size = this.chunkSize;
    // Determine border line coordinates for shared edge
    if(side === 'E') {
      // chunkB is to the east of chunkA
      // x index at east border of A is size-1, at west border of B is 0
      ax0 = size-1; ax1 = size-1;
      bx0 = 0; bx1 = 0;
      ay0 = 0; ay1 = size-1;
      by0 = 0; by1 = size-1;
      // We'll iterate vertical border indices (y from 0 to size-1)
      for(let y = ay0; y <= ay1; y++) {
        const aFloor = chunkA[y][ax0];
        const bFloor = chunkB[y][bx0];
        if(aFloor && !bFloor) {
          // A has floor at border, B has wall: carve B at border and one tile inward
          chunkB[y][0] = true;
          if(1 < size) chunkB[y][1] = true;
        }
        if(bFloor && !aFloor) {
          // B has floor at border, A has wall: carve A at border and one tile inward
          chunkA[y][size-1] = true;
          if(size-2 >= 0) chunkA[y][size-2] = true;
        }
      }
      // After carving, connect carved segments in each chunk to their interior using BFS
      this._integrateBorderOpening(chunkA, 'E');
      this._integrateBorderOpening(chunkB, 'W');
    }
    else if(side === 'W') {
      // chunkB is to the west of chunkA
      // x index at west border of A is 0, east border of B is size-1
      ax0 = 0; ax1 = 0;
      bx0 = size-1; bx1 = size-1;
      ay0 = 0; ay1 = size-1;
      by0 = 0; by1 = size-1;
      for(let y = ay0; y <= ay1; y++) {
        const aFloor = chunkA[y][ax0];
        const bFloor = chunkB[y][bx0];
        if(aFloor && !bFloor) {
          chunkB[y][bx0] = true;
          if(bx0-1 >= 0) chunkB[y][bx0-1] = true;
        }
        if(bFloor && !aFloor) {
          chunkA[y][ax0] = true;
          if(ax0+1 < size) chunkA[y][ax0+1] = true;
        }
      }
      this._integrateBorderOpening(chunkA, 'W');
      this._integrateBorderOpening(chunkB, 'E');
    }
    else if(side === 'S') {
      // chunkB is to the south of chunkA
      // y index at south border of A is size-1, north border of B is 0
      ay0 = size-1; ay1 = size-1;
      by0 = 0; by1 = 0;
      ax0 = 0; ax1 = size-1;
      bx0 = 0; bx1 = size-1;
      for(let x = ax0; x <= ax1; x++) {
        const aFloor = chunkA[ay0][x];
        const bFloor = chunkB[by0][x];
        if(aFloor && !bFloor) {
          chunkB[0][x] = true;
          if(1 < size) chunkB[1][x] = true;
        }
        if(bFloor && !aFloor) {
          chunkA[size-1][x] = true;
          if(size-2 >= 0) chunkA[size-2][x] = true;
        }
      }
      this._integrateBorderOpening(chunkA, 'S');
      this._integrateBorderOpening(chunkB, 'N');
    }
    else if(side === 'N') {
      // chunkB is to the north of chunkA
      ay0 = 0; ay1 = 0;
      by0 = size-1; by1 = size-1;
      ax0 = 0; ax1 = size-1;
      bx0 = 0; bx1 = size-1;
      for(let x = ax0; x <= ax1; x++) {
        const aFloor = chunkA[ay0][x];
        const bFloor = chunkB[by0][x];
        if(aFloor && !bFloor) {
          chunkB[by0][x] = true;
          if(by0-1 >= 0) chunkB[by0-1][x] = true;
        }
        if(bFloor && !aFloor) {
          chunkA[ay0][x] = true;
          if(ay0+1 < size) chunkA[ay0+1][x] = true;
        }
      }
      this._integrateBorderOpening(chunkA, 'N');
      this._integrateBorderOpening(chunkB, 'S');
    }
  }

  // Integrate newly carved border openings into the chunk's existing floor network with BFS
  _integrateBorderOpening(chunk, openedSide) {
    const size = this.chunkSize;
    const visited = Array.from({length: size}, () => Array(size).fill(false));
    const queue = [];
    // Mark all original floor tiles as visited (to preserve them and use as targets)
    // We consider "original" floor as those present before carving border openings.
    // Here, as a heuristic, we'll mark any floor that is not on the border side we just opened as original.
    // (This assumes border new openings were previously walls.)
    if(openedSide === 'E') {
      for(let y=0; y<size; y++) {
        for(let x=0; x<size-2; x++) { // exclude far east columns
          if(chunk[y][x]) visited[y][x] = true;
        }
      }
    } else if(openedSide === 'W') {
      for(let y=0; y<size; y++) {
        for(let x=2; x<size; x++) { // exclude far west columns
          if(chunk[y][x]) visited[y][x] = true;
        }
      }
    } else if(openedSide === 'S') {
      for(let y=0; y<size-2; y++) {
        for(let x=0; x<size; x++) {
          if(chunk[y][x]) visited[y][x] = true;
        }
      }
    } else if(openedSide === 'N') {
      for(let y=2; y<size; y++) {
        for(let x=0; x<size; x++) {
          if(chunk[y][x]) visited[y][x] = true;
        }
      }
    }
    // Enqueue all newly carved floor positions on the opened border as starting points
    if(openedSide === 'E') {
      const x = size-1;
      const x2 = size-2;
      for(let y=0; y<size; y++) {
        if(chunk[y][x] || chunk[y][x2]) { // any floor in the last two columns
          // If this position is floor and not visited, it's part of new opening
          if(chunk[y][x] && !visited[y][x]) {
            visited[y][x] = true;
            queue.push({x: x, y: y, fromStart: true});
          }
          if(chunk[y][x2] && !visited[y][x2]) {
            visited[y][x2] = true;
            queue.push({x: x2, y: y, fromStart: true});
          }
        }
      }
    } else if(openedSide === 'W') {
      const x = 0;
      const x2 = 1;
      for(let y=0; y<size; y++) {
        if(chunk[y][x] || chunk[y][x2]) {
          if(chunk[y][x] && !visited[y][x]) {
            visited[y][x] = true;
            queue.push({x: x, y: y, fromStart: true});
          }
          if(chunk[y][x2] && !visited[y][x2]) {
            visited[y][x2] = true;
            queue.push({x: x2, y: y, fromStart: true});
          }
        }
      }
    } else if(openedSide === 'S') {
      const y = size-1;
      const y2 = size-2;
      for(let x=0; x<size; x++) {
        if(chunk[y][x] || chunk[y2][x]) {
          if(chunk[y][x] && !visited[y][x]) {
            visited[y][x] = true;
            queue.push({x: x, y: y, fromStart: true});
          }
          if(chunk[y2][x] && !visited[y2][x]) {
            visited[y2][x] = true;
            queue.push({x: x, y: y2, fromStart: true});
          }
        }
      }
    } else if(openedSide === 'N') {
      const y = 0;
      const y2 = 1;
      for(let x=0; x<size; x++) {
        if(chunk[y][x] || chunk[y2][x]) {
          if(chunk[y][x] && !visited[y][x]) {
            visited[y][x] = true;
            queue.push({x: x, y: y, fromStart: true});
          }
          if(chunk[y2][x] && !visited[y2][x]) {
            visited[y2][x] = true;
            queue.push({x: x, y: y2, fromStart: true});
          }
        }
      }
    }
    // BFS from new openings to reach original floor area and carve path through walls if needed
    const dirs = [{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}];
    let foundConnection = false;
    while(queue.length > 0 && !foundConnection) {
      const {x, y, fromStart} = queue.shift();
      // If this tile is adjacent to an originally visited floor (target), we've connected
      // Actually if it's fromStart (meaning it's part of stub region) and now adjacent to any original floor, we carve path.
      if(fromStart) {
        for(const d of dirs) {
          const nx = x + d.dx, ny = y + d.dy;
          if(nx >= 0 && nx < size && ny >= 0 && ny < size) {
            if(visited[ny][nx] && chunk[ny][nx]) {
              // neighbor is an original floor area (visited and was floor before)
              foundConnection = true;
              break;
            }
          }
        }
      }
      if(foundConnection) break;
      // Continue BFS
      for(const d of dirs) {
        const nx = x + d.dx, ny = y + d.dy;
        if(nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
        if(!visited[ny][nx]) {
          visited[ny][nx] = true;
          // If this neighbor is originally a wall (false in chunk) but we are reaching it, carve it
          if(!chunk[ny][nx]) {
            chunk[ny][nx] = true;
            queue.push({x: nx, y: ny, fromStart: true});
          } else {
            // neighbor is floor (original labyrinth floor)
            queue.push({x: nx, y: ny, fromStart: false});
          }
        }
      }
    }
  }
}