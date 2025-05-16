// map.js
// ------------------------------------------------------------
//   Чанковая карта с регенерацией «забытых» тайлов.
//   Тип тайла:
//     false         — стена
//     'corridor'    — коридор (>= 2 тайла шириной,  ≤ 25 тайлов длиной)
//     'room'        — комнатный пол (комнаты 4×4 … 8×8)
//     'door'        — дверной проём (1-2 тайла шириной)
// ------------------------------------------------------------
class GameMap {
  constructor(chunkSize = 32) {
    this.chunkSize  = chunkSize;
    this.chunks     = new Map();  // Map<"cx,cy", {tiles,meta}>
    this.inProcess  = new Set();  // чтобы не удвоить генерацию
  }

  /* ---------------- ensureChunk --------------------------- */
  ensureChunk(cx, cy) {
    const key = `${cx},${cy}`;
    if (this.chunks.has(key) || this.inProcess.has(key)) return;

    this.inProcess.add(key);
    const tiles = this._generateChunk(cx, cy);

    // meta по умолчанию
    const meta = Array.from({length:this.chunkSize}, () =>
      Array.from({length:this.chunkSize}, () => ({memoryAlpha:0, visited:false}))
    );

    this.chunks.set(key, { tiles, meta });
    this.inProcess.delete(key);
  }

  /* ---------------- isFloor ------------------------------- */
  isFloor(gx, gy) {
    const cx = Math.floor(gx / this.chunkSize);
    const cy = Math.floor(gy / this.chunkSize);
    const ch = this.chunks.get(`${cx},${cy}`);
    if (!ch) return false;
    const lx = gx - cx*this.chunkSize,
          ly = gy - cy*this.chunkSize;
    if (lx<0||ly<0||lx>=this.chunkSize||ly>=this.chunkSize) return false;
    const t  = ch.tiles[ly][lx];
    return t === 'corridor' || t === 'room' || t === 'door';
  }

  /* ---------------- regenerateChunksPreserveFOV ----------- */
  regenerateChunksPreserveFOV(keys, computeFOV, player) {
    const vis = computeFOV(player.x, player.y, player.angle);

    for (const key of keys) {
      const old = this.chunks.get(key); if (!old) continue;

      // stash: сохраняем всё, что видно или не погасло
      const stash = [];
      const [cx,cy] = key.split(',').map(Number);
      const bx=cx*this.chunkSize, by=cy*this.chunkSize;

      for (let ly=0; ly<this.chunkSize; ly++){
        for (let lx=0; lx<this.chunkSize; lx++){
          const gx=bx+lx, gy=by+ly, m=old.meta[ly][lx];
          if (vis.has(`${gx},${gy}`) || m.memoryAlpha>0){
            stash.push({lx,ly, tile:old.tiles[ly][lx], meta:{...m}});
          }
        }
      }

      this.chunks.delete(key);
      this.ensureChunk(cx,cy);
      const fresh = this.chunks.get(key);
      for (const s of stash){
        fresh.tiles[s.ly][s.lx] = s.tile;
        fresh.meta [s.ly][s.lx] = s.meta;
      }
    }
  }

  /* ========================================================
        ВНУТРЕННЯЯ   ПРОЦЕДУРНА   ГЕНЕРАЦИЯ   ЧАНКА
     ======================================================== */
  _generateChunk(cx,cy){
    const S = this.chunkSize;                // 32
    const g = Array.from({length:S},()=>Array(S).fill(false));

    /* ---- 1. лабиринт 11×11  (скорректирован под комнаты) */
    const N = 11;
    const cell = Array.from({length:N},()=>Array.from({length:N},()=>({
      conn:{N:0,S:0,E:0,W:0}, type:'unused'
    })));
    const vis = Array.from({length:N},()=>Array(N).fill(false));
    const stack=[{x:Math.floor(N/2),y:Math.floor(N/2)}];
    vis[stack[0].y][stack[0].x]=true;
    while(stack.length){
      const {x,y}=stack[stack.length-1];
      const nbr=[];
      if(y>0   && !vis[y-1][x]) nbr.push('N');
      if(y<N-1 && !vis[y+1][x]) nbr.push('S');
      if(x>0   && !vis[y][x-1]) nbr.push('W');
      if(x<N-1 && !vis[y][x+1]) nbr.push('E');

      if(nbr.length){
        const d=nbr[Math.random()*nbr.length|0];
        let nx=x, ny=y;
        if(d==='N') ny--; if(d==='S') ny++;
        if(d==='W') nx--; if(d==='E') nx++;
        cell[y][x].conn[d]=1;
        cell[ny][nx].conn[{N:'S',S:'N',E:'W',W:'E'}[d]]=1;
        vis[ny][nx]=true;
        stack.push({x:nx,y:ny});
      }else stack.pop();
    }

    /* ---- 2. размечаем комнаты --------------------------- */
    const MIN=4, MAX=8;          // размеры комнаты
    const wantRooms = 3 + (Math.random()*5|0);  // 3…7
    let created=0, attempts=0;
    while(created<wantRooms && attempts<100){
      attempts++;
      const w = MIN + (Math.random()*(MAX-MIN)|0);
      const h = MIN + (Math.random()*(MAX-MIN)|0);
      const cx0 = Math.random()*(N-1)|0, cy0=Math.random()*(N-1)|0;
      const gx0 = cx0*3, gy0=cy0*3;
      if(gx0+w>=S-1||gy0+h>=S-1) continue;   // не влезает

      // проверяем, чтобы не перекрывалось с уже помеченными
      let ok=true;
      for(let y=gy0-1; y<=gy0+h; y++)
        for(let x=gx0-1; x<=gx0+w; x++)
          if(g[y][x]) ok=false;
      if(!ok) continue;

      // заливаем room
      for(let y=gy0; y<gy0+h; y++)
        for(let x=gx0; x<gx0+w; x++) g[y][x]='room';

      // ставим 1–3 дверей (проход 1-2 тайла) на стене
      const doors = 1 + (Math.random()*3|0);
      for(let d=0; d<doors; d++){
        const side=Math.random()*4|0; // 0N1S2W3E
        let dx=0,dy=0, len=1+(Math.random()>0.6); // 1 или 2 тайла
        if     (side===0){dy=-1; var ox=gx0+(Math.random()*w|0), oy=gy0-1;}
        else if(side===1){dy= 1; var ox=gx0+(Math.random()*w|0), oy=gy0+h;}
        else if(side===2){dx=-1; var ox=gx0-1, oy=gy0+(Math.random()*h|0);}
        else             {dx= 1; var ox=gx0+w, oy=gy0+(Math.random()*h|0);}
        for(let k=0;k<len;k++){
          const tx=ox+dx*k, ty=oy+dy*k;
          if(tx>=0&&ty>=0&&tx<S&&ty<S) g[ty][tx]='door';
        }
      }
      created++;
    }

    /* ---- 3. переносим лабиринт-коридоры в сетку --------- */
    for(let j=0;j<N;j++){
      for(let i=0;i<N;i++){
        const bx=i*3, by=j*3;
        // сами ячейки лабиринта → коридор 2×2
        for(let dy=0;dy<2;dy++)
          for(let dx=0;dx<2;dx++)
            if(!g[by+dy][bx+dx]) g[by+dy][bx+dx]='corridor';
        const c=cell[j][i].conn;
        if(c.E){ g[by][bx+2]='corridor'; g[by+1][bx+2]='corridor'; }
        if(c.S){ g[by+2][bx]='corridor'; g[by+2][bx+1]='corridor'; }
      }
    }

    /* ---- 4. превращаем false → стены, true не используем */
    return g;
  }
}

// экспорт в глобальную область
window.GameMap = GameMap;