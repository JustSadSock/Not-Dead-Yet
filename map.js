// map.js
/**
 * GameMap — чанковая карта с регенерацией забытых тайлов,
 *             комнатами и коридорами шириной 2.
 */
class GameMap {
  constructor () {
    this.chunkSize   = 32;           // должно совпадать с game.js
    this.chunks      = new Map();    // Map<"cx,cy", {tiles, meta}>
    this.generating  = new Set();    // уже генерируем
  }

  /* ——— публичные ——— */

  ensureChunk (cx, cy) {
    const key = `${cx},${cy}`;
    if (this.chunks.has(key) || this.generating.has(key)) return;
    this.generating.add(key);

    const tiles = this._generateChunk(cx, cy);

    const meta  = Array.from({length:this.chunkSize}, () =>
      Array.from({length:this.chunkSize}, () => ({memoryAlpha:0, visited:false}))
    );

    this.chunks.set(key, {tiles, meta});
    this.generating.delete(key);
  }

  isFloor (gx, gy) {
    const cx = Math.floor(gx / this.chunkSize);
    const cy = Math.floor(gy / this.chunkSize);
    const lx = gx - cx * this.chunkSize;
    const ly = gy - cy * this.chunkSize;
    const c  = this.chunks.get(`${cx},${cy}`);
    if (!c) return false;
    if (lx<0||ly<0||lx>=this.chunkSize||ly>=this.chunkSize) return false;
    return !!c.tiles[ly][lx];
  }

  regenerateChunksPreserveFOV (keys, computeFOV, player) {
    const vis = computeFOV(player.x, player.y, player.angle);

    for (const key of keys) {
      const [cx,cy] = key.split(',').map(Number);
      const old = this.chunks.get(key);
      if (!old) continue;

      const stash = [];
      const baseX = cx*this.chunkSize, baseY = cy*this.chunkSize;
      for (let ly=0; ly<this.chunkSize; ly++)
        for (let lx=0; lx<this.chunkSize; lx++) {
          const gx=baseX+lx, gy=baseY+ly;
          const m = old.meta[ly][lx];
          if (vis.has(`${gx},${gy}`) || m.memoryAlpha>0)
            stash.push({lx,ly,tile:old.tiles[ly][lx],meta:{...m}});
        }

      this.chunks.delete(key);
      this.ensureChunk(cx,cy);

      const fresh = this.chunks.get(key);
      for (const s of stash) {
        fresh.tiles[s.ly][s.lx] = s.tile;
        fresh.meta [s.ly][s.lx] = s.meta;
      }
    }
  }

  /* ——— helpers ——— */

  _generateChunk (cx,cy) {
    const S     = this.chunkSize;
    const grid  = Array.from({length:S},()=>Array(S).fill(false));

    /* 1. Лабиринт-MST базой (точно как раньше) */ {
      const N    = 11;
      const conn = Array.from({length:N},()=>Array.from({length:N},()=>({N:0,S:0,E:0,W:0})));
      const vis  = Array.from({length:N},()=>Array(N).fill(false));
      const st   = [{x:Math.floor(N/2), y:Math.floor(N/2)}];
      vis[st[0].y][st[0].x]=true;
      while (st.length) {
        const t=st[st.length-1];
        const n=[];
        if(t.y>0   &&!vis[t.y-1][t.x]) n.push('N');
        if(t.y<N-1&&!vis[t.y+1][t.x]) n.push('S');
        if(t.x>0   &&!vis[t.y][t.x-1]) n.push('W');
        if(t.x<N-1&&!vis[t.y][t.x+1]) n.push('E');
        if(n.length){
          const d=n[Math.floor(Math.random()*n.length)];
          let nx=t.x,ny=t.y;
          if(d==='N')ny--; if(d==='S')ny++; if(d==='W')nx--; if(d==='E')nx++;
          conn[t.y][t.x][d]=1;
          conn[ny][nx][{N:'S',S:'N',E:'W',W:'E'}[d]]=1;
          vis[ny][nx]=true; st.push({x:nx,y:ny});
        }else st.pop();
      }
      /* масштабируем N×N→grid 3×3 + коридоры шириной 2 */
      for(let j=0;j<N;j++)for(let i=0;i<N;i++){
        const bx=i*3,by=j*3;
        grid[by][bx]=grid[by][bx+1]=grid[by+1][bx]=grid[by+1][bx+1]=true;
        if(conn[j][i].E){ grid[by][bx+2]=grid[by+1][bx+2]=true; }
        if(conn[j][i].S){ grid[by+2][bx]=grid[by+2][bx+1]=true; }
      }
    }

    /* 2. Пристройки-комнаты к коридорам */
    const tryAttachRoom = (x,y,dir)=>{
      const doorLen = 1 + (Math.random()<0.5?0:1);   // 1–2
      const w = 5+Math.floor(Math.random()*4);        // 5…8
      const h = 5+Math.floor(Math.random()*4);
      let rx,ry;
      if(dir==='N'){ rx=x-1; ry=y-h; }
      if(dir==='S'){ rx=x-1; ry=y+doorLen; }
      if(dir==='W'){ rx=x-w; ry=y-1; }
      if(dir==='E'){ rx=x+doorLen; ry=y-1; }

      // буфер-1 + в границах
      if(rx<1||ry<1||rx+w+1>=S||ry+h+1>=S) return;
      for(let yy=ry-1;yy<ry+h+1;yy++)
        for(let xx=rx-1;xx<rx+w+1;xx++)
          if(grid[yy]?.[xx]) return; // пересечение

      // carve room
      for(let yy=ry;yy<ry+h;yy++)
        for(let xx=rx;xx<rx+w;xx++)
          grid[yy][xx]=true;

      // дверной проём
      if(dir==='N'||dir==='S'){
        for(let i=0;i<doorLen;i++)
          grid[y+i* (dir==='N'? -1:1)][x] = true;
      }else{
        for(let i=0;i<doorLen;i++)
          grid[y][x+i*(dir==='W'? -1:1)] = true;
      }
    };

    // обходим каждый коридорный тайл, случайно пробуем сделать двери
    for(let y=1;y<S-1;y++){
      for(let x=1;x<S-1;x++){
        if(!grid[y][x]) continue;
        const isVerticalWall = !grid[y-1][x] || !grid[y+1][x];
        const isHorizontal   = !grid[y][x-1] || !grid[y][x+1];
        if(!(isVerticalWall||isHorizontal)) continue;

        // шанс 15 % попробовать комнату
        if(Math.random()<0.15){
          const dirs=[];
          if(!grid[y-1][x]) dirs.push('N');
          if(!grid[y+1][x]) dirs.push('S');
          if(!grid[y][x-1]) dirs.push('W');
          if(!grid[y][x+1]) dirs.push('E');
          if(dirs.length){
            const d=dirs[Math.floor(Math.random()*dirs.length)];
            tryAttachRoom(x,y,d);
          }
        }
      }
    }

    return grid;
  }
}

window.GameMap = GameMap;