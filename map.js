// map.js
//
// Чанковая карта 32×32:
// — комнаты 4×4…8×8, разделённые стенами с GAP≥5
// — коридоры 2–3 тайла между дверями
// — двери 1–2 клетки, соединяют ровно room ↔ hall
// — валидация: door ⇒ (nDoor≤1, nRoom=1, nHall=1, 1≤nWall≤2)

class GameMap {
  constructor() {
    this.chunkSize  = 32;
    this.chunks     = new Map();
    this.generating = new Set();
  }

  ensureChunk(cx, cy) {
    const key = `${cx},${cy}`;
    if (this.chunks.has(key) || this.generating.has(key)) return;
    this.generating.add(key);

    const tiles = this._generateChunk(cx, cy);
    const meta  = Array.from({ length: this.chunkSize }, () =>
      Array.from({ length: this.chunkSize }, () => ({
        memoryAlpha: 0,
        visited:     false
      }))
    );

    this.chunks.set(key, { tiles, meta });
    this.generating.delete(key);
  }

  isFloor(gx, gy) {
    const cx = Math.floor(gx / this.chunkSize);
    const cy = Math.floor(gy / this.chunkSize);
    const chunk = this.chunks.get(`${cx},${cy}`);
    if (!chunk) return false;
    const lx = gx - cx * this.chunkSize;
    const ly = gy - cy * this.chunkSize;
    if (lx < 0||ly < 0||lx >= this.chunkSize||ly >= this.chunkSize) return false;
    const t = chunk.tiles[ly][lx];
    return t === 'room' || t === 'hall' || t === 'door';
  }

  regenerateChunksPreserveFOV(keys, computeFOV, player) {
    const vis = computeFOV(player.x, player.y, player.angle);
    for (const key of keys) {
      const [cx, cy] = key.split(',').map(Number);
      const oldC = this.chunks.get(key);
      if (!oldC) continue;

      const stash = [];
      const bx = cx * this.chunkSize, by = cy * this.chunkSize;
      for (let y = 0; y < this.chunkSize; y++) {
        for (let x = 0; x < this.chunkSize; x++) {
          const gx = bx + x, gy = by + y;
          const m  = oldC.meta[y][x];
          if (vis.has(`${gx},${gy}`) || m.memoryAlpha > 0) {
            stash.push({ x, y, tile: oldC.tiles[y][x], meta: { ...m } });
          }
        }
      }

      this.chunks.delete(key);
      this.ensureChunk(cx, cy);
      const fresh = this.chunks.get(key);
      for (const s of stash) {
        fresh.tiles[s.y][s.x] = s.tile;
        fresh.meta [s.y][s.x] = s.meta;
      }
    }
  }

  _generateChunk(cx, cy) {
    const S   = this.chunkSize;
    const GAP = 5;
    const tiles = Array.from({ length: S }, () => Array(S).fill('wall'));

    // 1) размещаем 3–8 комнат 4×4…8×8, GAP-разнос
    const rooms = [];
    const want  = 3 + Math.floor(Math.random() * 6);
    for (let tries = 0; rooms.length < want && tries < want*5; tries++) {
      const w = 4 + Math.floor(Math.random() * 5),
            h = 4 + Math.floor(Math.random() * 5),
            x = 1 + Math.floor(Math.random() * (S - w - 2)),
            y = 1 + Math.floor(Math.random() * (S - h - 2));

      let ok = true;
      for (const r of rooms) {
        if (!(x + w + GAP < r.x - 1 ||
              r.x + r.w + GAP < x - 1 ||
              y + h + GAP < r.y - 1 ||
              r.y + r.h + GAP < y - 1)) {
          ok = false; break;
        }
      }
      if (!ok) continue;

      rooms.push({ x, y, w, h });
      for (let yy = y; yy < y + h; yy++)
        for (let xx = x; xx < x + w; xx++)
          tiles[yy][xx] = 'room';
    }
    if (rooms.length < 2) return tiles;

    // 2) MST по центрам
    const centers = rooms.map(r => ({
      x: r.x + ((r.w/2)|0),
      y: r.y + ((r.h/2)|0)
    }));
    const connected = new Set([0]);
    const edges = [];
    while (connected.size < rooms.length) {
      let best = null;
      for (const i of connected) {
        for (let j = 0; j < rooms.length; j++) {
          if (connected.has(j)) continue;
          const dx = centers[i].x - centers[j].x,
                dy = centers[i].y - centers[j].y,
                d2 = dx*dx + dy*dy;
          if (!best || d2 < best.d2) best = { i, j, d2 };
        }
      }
      connected.add(best.j);
      edges.push([best.i, best.j]);
    }

    // подготовка дверных данных
    const doorSides = rooms.map(() => new Set());
    const doorPos   = rooms.map(() => ({ N:[], S:[], E:[], W:[] }));

    // вырез коридора 2–3 толщины
    const carveHall = (x1,y1,x2,y2) => {
      const W = 2 + Math.floor(Math.random()*2);
      if (Math.random()<0.5) {
        const xa = Math.min(x1,x2), xb = Math.max(x1,x2),
              y0 = y1 - ((W/2)|0);
        for (let x = xa; x <= xb; x++)
          for (let dy = 0; dy < W; dy++)
            if (tiles[y0+dy]?.[x]==='wall') tiles[y0+dy][x] = 'hall';
        const ya = Math.min(y1,y2), yb = Math.max(y1,y2),
              x0 = x2 - ((W/2)|0);
        for (let y = ya; y <= yb; y++)
          for (let dx = 0; dx < W; dx++)
            if (tiles[y]?.[x0+dx]==='wall') tiles[y][x0+dx] = 'hall';
      } else {
        const ya = Math.min(y1,y2), yb = Math.max(y1,y2),
              x0 = x1 - ((W/2)|0);
        for (let y = ya; y <= yb; y++)
          for (let dx = 0; dx < W; dx++)
            if (tiles[y]?.[x0+dx]==='wall') tiles[y][x0+dx] = 'hall';
        const xa = Math.min(x1,x2), xb = Math.max(x1,x2),
              y0 = y2 - ((W/2)|0);
        for (let x = xa; x <= xb; x++)
          for (let dy = 0; dy < W; dy++)
            if (tiles[y0+dy]?.[x]==='wall') tiles[y0+dy][x] = 'hall';
      }
    };

    // 3) ставим двери + вырезаем коридоры
    for (const [i,j] of edges) {
      const A = rooms[i], B = rooms[j],
            cA = centers[i], cB = centers[j];

      let sideA = Math.abs(cB.x-cA.x)>=Math.abs(cB.y-cA.y)
                  ? (cB.x>cA.x?'E':'W')
                  : (cB.y>cA.y?'S':'N');
      let sideB = {N:'S',S:'N',E:'W',W:'E'}[sideA];

      const cntA = 1+Math.floor(Math.random()*2),
            cntB = 1+Math.floor(Math.random()*2);

      const place = (r, side, cnt, posArr) => {
        const arr = [];
        if (side==='N'||side==='S') {
          const yy = r.y + (side==='N'?0:r.h-1),
                start = r.x,
                end   = r.x+r.w-1-(cnt-1),
                xx0   = start + Math.floor(Math.random()*(end-start+1));
          for (let k=0; k<cnt; k++){
            const x = xx0+k;
            tiles[yy][x]='door';
            arr.push([x,yy]);
          }
        } else {
          const xx = r.x + (side==='W'?0:r.w-1),
                start = r.y,
                end   = r.y+r.h-1-(cnt-1),
                yy0   = start + Math.floor(Math.random()*(end-start+1));
          for (let k=0; k<cnt; k++){
            const y = yy0+k;
            tiles[y][xx]='door';
            arr.push([xx,y]);
          }
        }
        posArr[side].push(...arr);
        doorSides[r===A?i:j].add(side);
        return arr;
      };

      const dA = place(A, sideA, cntA, doorPos[i]);
      const dB = place(B, sideB, cntB, doorPos[j]);
      carveHall(dA[0][0],dA[0][1], dB[0][0],dB[0][1]);
    }

    // 4) если 4 стороны дверей — закрываем одну
    for (let idx=0; idx<rooms.length; idx++){
      const used = Array.from(doorSides[idx]);
      if (used.length===4){
        const side = used[Math.floor(Math.random()*4)];
        for (const [x,y] of doorPos[idx][side]){
          tiles[y][x] = 'wall';
        }
      }
    }

    // 5) валидация дверей: nDoor≤1, nRoom=1, nHall=1, 1≤nWall≤2
    const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
    for (let y=0; y<S; y++){
      for (let x=0; x<S; x++){
        if (tiles[y][x] !== 'door') continue;
        let nDoor=0,nRoom=0,nHall=0,nWall=0;
        for (const [dx,dy] of dirs){
          const t = tiles[y+dy]?.[x+dx];
          if (t==='door') nDoor++;
          else if (t==='room') nRoom++;
          else if (t==='hall') nHall++;
          else nWall++;
        }
        if (!(nDoor<=1 && nRoom===1 && nHall===1 && nWall>=1 && nWall<=2)) {
          tiles[y][x] = 'wall';
        }
      }
    }

    return tiles;
  }
}

window.GameMap = GameMap;