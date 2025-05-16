/* ============================================================
   GameMap  –  комнаты (2), коридоры (1), двери (3), стены (0)
   ============================================================ */
class GameMap {
  constructor (chunkSize = 32) {
    this.chunkSize  = chunkSize;       // 32×32 клеток
    this.chunks     = new Map();       // Map<"cx,cy",{tiles,meta}>
    this.generating = new Set();       // key'ы, которые сейчас строятся
  }

  /* ------------  публичное API  ------------ */

  ensureChunk (cx, cy) {
    const key = `${cx},${cy}`;
    if (this.chunks.has(key) || this.generating.has(key)) return;
    this.generating.add(key);

    const tiles = this._generateChunk();                // int[][] карта
    const meta  = Array.from({length:this.chunkSize},() =>
      Array.from({length:this.chunkSize},() => ({memoryAlpha:0, visited:false}))
    );

    this.chunks.set(key, { tiles, meta });
    this.generating.delete(key);
  }

  /** true, если (gx,gy) – пол/дверь, false – стена или пустота */
  isFloor (gx, gy) {
    const cx = Math.floor(gx/this.chunkSize),
          cy = Math.floor(gy/this.chunkSize);
    const lx = gx - cx*this.chunkSize,
          ly = gy - cy*this.chunkSize;
    const ch = this.chunks.get(`${cx},${cy}`);
    if (!ch) return false;
    const t = ch.tiles[ly]?.[lx];
    return t !== 0 && t !== undefined;
  }

  /** перегенерация «забытых» чанков — FOV / memoryAlpha сохраняются */
  regenerateChunksPreserveFOV (keys, fovFn, player) {
    const vis = fovFn(player.x,player.y,player.angle);

    for (const key of keys) {
      const old = this.chunks.get(key); if (!old) continue;
      const [cx,cy] = key.split(',').map(Number);

      /* — stash всех видимых / не потухших ------------------------ */
      const stash=[];
      const bx=cx*this.chunkSize, by=cy*this.chunkSize;
      for (let ly=0;ly<this.chunkSize;ly++)
        for (let lx=0;lx<this.chunkSize;lx++){
          const gx=bx+lx, gy=by+ly;
          const m=old.meta[ly][lx];
          if (vis.has(`${gx},${gy}`) || m.memoryAlpha>0)
            stash.push({lx,ly,tile:old.tiles[ly][lx],meta:{...m}});
        }

      /* — перегенерируем заново ---------------------------------- */
      this.chunks.delete(key);
      this.ensureChunk(cx,cy);

      /* — возвращаем stash --------------------------------------- */
      const fresh=this.chunks.get(key);
      for(const s of stash){
        fresh.tiles[s.ly][s.lx]=s.tile;
        fresh.meta [s.ly][s.lx]=s.meta;
      }
    }
  }

  /* ------------  генерация одного чанка  ------------ */

  _generateChunk () {
    const S = this.chunkSize;
    const g = Array.from({length:S},()=>Array(S).fill(0));   // 0 = wall

    /* === 1. Лабиринт-коридор (основа) =========================== */
    {
      const N=11;                                            // 11×11 ячеек
      const conn = Array.from({length:N},()=>Array.from({length:N},()=>({N:0,S:0,E:0,W:0})));
      const vis  = Array.from({length:N},()=>Array(N).fill(false));
      const st   = [{x:~~(N/2),y:~~(N/2)}]; vis[st[0].y][st[0].x]=true;
      while(st.length){
        const top=st.at(-1);
        const neigh=[];
        if(top.y>0   &&!vis[top.y-1][top.x]) neigh.push('N');
        if(top.y<N-1&&!vis[top.y+1][top.x]) neigh.push('S');
        if(top.x>0   &&!vis[top.y][top.x-1]) neigh.push('W');
        if(top.x<N-1&&!vis[top.y][top.x+1]) neigh.push('E');
        if(neigh.length){
          const d=neigh[Math.random()*neigh.length|0];
          let nx=top.x, ny=top.y;
          if(d==='N') ny--; else if(d==='S') ny++;
          else if(d==='W') nx--; else nx++;
          conn[top.y][top.x][d]=1;
          conn[ny][nx][{N:'S',S:'N',E:'W',W:'E'}[d]]=1;
          vis[ny][nx]=true; st.push({x:nx,y:ny});
        }else st.pop();
      }
      /* масштабируем в сетку S×S. Пол коридора → 1  */
      for(let j=0;j<N;j++)for(let i=0;i<N;i++){
        const bx=i*3, by=j*3;
        g[by][bx]=g[by][bx+1]=g[by+1][bx]=g[by+1][bx+1]=1; // ядро 2×2
        if(conn[j][i].E) g[by][bx+2]=g[by+1][bx+2]=1;      // коридор-«труба» 2 тайла
        if(conn[j][i].S) g[by+2][bx]=g[by+2][bx+1]=1;
      }
    }

    /* === 2. Комнаты-пристройки ================================= */
    const tryRoom = (doorX,doorY,dir) => {
      const door = 1 + (Math.random()<0.5 ? 0 : 1);   // 1-2 клетки проём
      const w = 5+Math.random()*4|0, h = 5+Math.random()*4|0; // ≤8
      let rx,ry;
      if(dir==='N'){ rx=doorX-~~(w/2); ry=doorY-h; }
      if(dir==='S'){ rx=doorX-~~(w/2); ry=doorY+door; }
      if(dir==='W'){ rx=doorX-w;       ry=doorY-~~(h/2); }
      if(dir==='E'){ rx=doorX+door;    ry=doorY-~~(h/2); }
      // в границах и буфер 1
      if(rx<1||ry<1||rx+w+1>=S||ry+h+1>=S) return false;
      for(let y=ry-1;y<ry+h+1;y++)
        for(let x=rx-1;x<rx+w+1;x++)
          if(g[y][x]!==0) return false;                    // пересекается
      // carve
      for(let y=ry+1;y<ry+h-1;y++)
        for(let x=rx+1;x<rx+w-1;x++)
          g[y][x]=2;                                      // 2 = room
      // стенка остаётся по периметру, но пробиваем дверь
      for(let d=0; d<door; d++){
        const x = dir==='N'||dir==='S' ? doorX+d : dir==='W'?doorX-1:doorX;
        const y = dir==='W'||dir==='E' ? doorY+d : dir==='N'?doorY-1:doorY;
        g[y][x]=3;                                       // 3 = door
      }
      return true;
    };

    for(let y=1;y<S-1;y++)for(let x=1;x<S-1;x++){
      if(g[y][x]!==1) continue;                        // коридорный тайл
      // случай 15 % пробуем пристроить комнату
      if(Math.random()<0.15){
        const dirs=[];
        if(g[y-1][x]===0) dirs.push('N');
        if(g[y+1][x]===0) dirs.push('S');
        if(g[y][x-1]===0) dirs.push('W');
        if(g[y][x+1]===0) dirs.push('E');
        if(dirs.length){
          const dir=dirs[Math.random()*dirs.length|0];
          tryRoom(x,y,dir);
        }
      }
    }

    /* === 3. Минимум два выхода к границе чанка =================== */
    const exits=[];
    for(let x=1;x<S-1;x++){
      if(g[1][x]   ===1) exits.push([x,0]);
      if(g[S-2][x]===1) exits.push([x,S-1]);
    }
    for(let y=1;y<S-1;y++){
      if(g[y][1]   ===1) exits.push([0,y]);
      if(g[y][S-2]===1) exits.push([S-1,y]);
    }
    while(exits.length<2){
      // найдём случайный коридор и прорежем к стене
      let x,y,dir;
      do{
        x=1+Math.random()*(S-2)|0;
        y=1+Math.random()*(S-2)|0;
      }while(g[y][x]!==1);
      dir = [[0,-1],[0,1],[-1,0],[1,0]][Math.random()*4|0];
      while(x>0&&x<S-1&&y>0&&y<S-1){
        if(g[y][x]===0) g[y][x]=1;
        x+=dir[0]; y+=dir[1];
      }
      exits.push([x,y]);
    }

    return g;
  }
}

window.GameMap = GameMap;