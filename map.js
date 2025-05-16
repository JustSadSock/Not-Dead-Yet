/* ----------  GameMap: комнаты + коридоры + двери  ---------- */
class GameMap {
  constructor (chunkSize = 32) {
    this.chunkSize  = chunkSize;
    this.chunks     = new Map();      // Map<"cx,cy",{tiles,meta}>
    this.generating = new Set();
  }

  /* public -------------------------------------------------- */

  ensureChunk (cx, cy) {
    const key = `${cx},${cy}`;
    if (this.chunks.has(key) || this.generating.has(key)) return;
    this.generating.add(key);

    const tiles = this._genChunk(cx, cy);
    const meta  = Array.from({length:this.chunkSize}, () =>
      Array.from({length:this.chunkSize}, () => ({memoryAlpha:0, visited:false}))
    );

    this.chunks.set(key, {tiles, meta});
    this.generating.delete(key);
  }

  isFloor (gx, gy) {
    const cx = Math.floor(gx/this.chunkSize);
    const cy = Math.floor(gy/this.chunkSize);
    const lx = gx - cx*this.chunkSize;
    const ly = gy - cy*this.chunkSize;
    const c  = this.chunks.get(`${cx},${cy}`);
    if(!c) return false;
    const t = c.tiles[ly]?.[lx];
    return t!==0 && t!==undefined;            // 0 — стена
  }

  regenerateChunksPreserveFOV (keys, fovFn, player) {
    const vis = fovFn(player.x,player.y,player.angle);

    for(const key of keys){
      const [cx,cy]=key.split(',').map(Number);
      const old=this.chunks.get(key); if(!old) continue;

      const stash=[];
      const bx=cx*this.chunkSize, by=cy*this.chunkSize;
      for(let ly=0;ly<this.chunkSize;ly++)
        for(let lx=0;lx<this.chunkSize;lx++){
          const gx=bx+lx, gy=by+ly;
          const m=old.meta[ly][lx];
          if(vis.has(`${gx},${gy}`)||m.memoryAlpha>0){
            stash.push({lx,ly,tile:old.tiles[ly][lx],meta:{...m}});
          }
        }

      this.chunks.delete(key);              // заново
      this.ensureChunk(cx,cy);
      const fresh=this.chunks.get(key);
      for(const s of stash){
        fresh.tiles[s.ly][s.lx]=s.tile;
        fresh.meta [s.ly][s.lx]=s.meta;
      }
    }
  }

  /* ----------------  генерация одного чанка ---------------- */

  _genChunk () {
    const S = this.chunkSize;
    const g = Array.from({length:S},()=>Array(S).fill(0)); // 0 — стена

    /* 1. комнаты ------------------------------------------------ */
    const rooms=[];
    const rc = 4+Math.floor(Math.random()*4);            // 4-7
    for(let i=0;i<rc;i++){
      let attempt=0;
      while(attempt++<100){
        const w = 5+Math.floor(Math.random()*4);         // 5-8
        const h = 5+Math.floor(Math.random()*4);
        if(Math.abs(w-h)>4) continue;                    // не «коридор»

        const x0 = 1+Math.floor(Math.random()*(S-w-2));
        const y0 = 1+Math.floor(Math.random()*(S-h-2));

        // проверка пересечений (+буфер 1)
        let ok=true;
        for(const [rx,ry,rw,rh] of rooms){
          if(!(x0>rx+rw+1||x0+w+1<rx||y0>ry+rh+1||y0+h+1<ry)){ ok=false; break;}
        }
        if(!ok) continue;

        // carve interior (1 = пол-комнаты)
        for(let y=y0+1;y<y0+h-1;y++)
          for(let x=x0+1;x<x0+w-1;x++)
            g[y][x]=1;

        rooms.push([x0,y0,w,h]);
        break;
      }
    }

    /* 2. MST по центрам --------------------------------------- */
    const C=rooms.map(([x,y,w,h])=>({x:x+~~(w/2), y:y+~~(h/2)}));
    const N=C.length;
    const used=new Set([0]), edges=[];
    const d2 = Array.from({length:N},()=>Array(N).fill(Infinity));
    for(let i=0;i<N;i++)for(let j=i+1;j<N;j++){
      const dx=C[i].x-C[j].x, dy=C[i].y-C[j].y;
      d2[i][j]=d2[j][i]=dx*dx+dy*dy;
    }
    while(used.size<N){
      let best={i:-1,j:-1,d:Infinity};
      for(const i of used){
        for(let j=0;j<N;j++)if(!used.has(j)&&d2[i][j]<best.d){
          best={i,j,d:d2[i][j]};
        }
      }
      edges.push(best); used.add(best.j);
    }

    /* 3. коридоры шириной 2 ----------------------------------- */
    const carve = (x,y)=>{ if(g[y]?.[x]!==undefined) g[y][x]=2; }; // 2 — коридор
    const carveLCorridor=(x1,y1,x2,y2)=>{
      const dx=Math.sign(x2-x1), dy=Math.sign(y2-y1);
      let lenX=Math.abs(x2-x1), lenY=Math.abs(y2-y1);

      const goX=(sx,sy,len)=>{
        const seg=len>25?25:len;
        for(let i=0;i<=seg;i++){
          carve(sx+dx*i, sy); carve(sx+dx*i, sy+1);
        }
        return len-seg;
      };
      const goY=(sx,sy,len)=>{
        const seg=len>25?25:len;
        for(let i=0;i<=seg;i++){
          carve(sx, sy+dy*i); carve(sx+1, sy+dy*i);
        }
        return len-seg;
      };

      let sx=x1, sy=y1;
      while(lenX>0){ lenX = goX(sx, sy, lenX); sx += dx*Math.min(25,lenX+1); }
      while(lenY>0){ lenY = goY(sx, sy, lenY); sy += dy*Math.min(25,lenY+1); }
    };

    for(const e of edges){
      const a=C[e.i], b=C[e.j];
      carveLCorridor(a.x,a.y,b.x,b.y);
    }

    /* 4. двери (3) между room-wall и corridor-floor ----------- */
    const markDoor=(x,y)=>{
      if(g[y]?.[x]===0) g[y][x]=3;   // 3 — дверь/проём
    };

    for(let y=1;y<S-1;y++)for(let x=1;x<S-1;x++){
      if(g[y][x]!==0) continue;                   // только стены
      // коридор по одну сторону + комната по другую => дверь
      if((g[y][x-1]===2&&g[y][x+1]===1)||(g[y][x-1]===1&&g[y][x+1]===2))
        markDoor(x,y);
      if((g[y-1]?.[x]===2&&g[y+1]?.[x]===1)||(g[y-1]?.[x]===1&&g[y+1]?.[x]===2))
        markDoor(x,y);
    }

    return g;
  }
}

window.GameMap = GameMap;