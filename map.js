/* =======================================================================
   GameMap — чанковая карта: комнаты (1), коридоры (2), двери (3), стены (0)
   ======================================================================= */
class GameMap {
  constructor (chunkSize = 32) {
    this.chunkSize  = chunkSize;          // 32×32 тайла = 1 чанк
    this.chunks     = new Map();          // Map<"cx,cy",{tiles,meta}>
    this.generating = new Set();          // блокировка параллельной генерации
  }

  /* ----------  публичные методы  ------------------------------------ */

  ensureChunk (cx, cy) {
    const key = `${cx},${cy}`;
    if (this.chunks.has(key) || this.generating.has(key)) return;
    this.generating.add(key);

    const tiles = this._generateChunk();          // bool / int сетка
    const meta  = Array.from({length:this.chunkSize}, () =>
      Array.from({length:this.chunkSize}, () => ({ memoryAlpha:0, visited:false }))
    );
    this.chunks.set(key, { tiles, meta });
    this.generating.delete(key);
  }

  /** true, если (gx,gy) — пол (комната / коридор / дверь) */
  isFloor (gx, gy) {
    const cx = Math.floor(gx/this.chunkSize),
          cy = Math.floor(gy/this.chunkSize);
    const lx = gx - cx*this.chunkSize,
          ly = gy - cy*this.chunkSize;
    const c  = this.chunks.get(`${cx},${cy}`);
    if (!c) return false;
    const t = c.tiles[ly]?.[lx];
    return t !== 0 && t !== undefined;
  }

  /** пакетная «забывшаяся» перегенерация (FOV & memoryAlpha сохраняются) */
  regenerateChunksPreserveFOV (keys, fovFn, player) {
    const vis = fovFn(player.x,player.y,player.angle);

    for (const key of keys) {
      const old = this.chunks.get(key); if (!old) continue;
      const [cx,cy] = key.split(',').map(Number);

      /* --- stash видимых / не потухших -------------------------------- */
      const stash = [];
      const bx=cx*this.chunkSize, by=cy*this.chunkSize;
      for (let ly=0; ly<this.chunkSize; ly++)
        for (let lx=0; lx<this.chunkSize; lx++) {
          const gx=bx+lx, gy=by+ly;
          const m = old.meta[ly][lx];
          if (vis.has(`${gx},${gy}`) || m.memoryAlpha>0)
            stash.push({lx,ly,tile:old.tiles[ly][lx], meta:{...m}});
        }

      /* --- генерим заново --------------------------------------------- */
      this.chunks.delete(key);
      this.ensureChunk(cx,cy);

      /* --- возвращаем stash ------------------------------------------- */
      const fresh=this.chunks.get(key);
      for (const s of stash) {
        fresh.tiles[s.ly][s.lx]=s.tile;
        fresh.meta [s.ly][s.lx]=s.meta;
      }
    }
  }

  /* ----------  ГЕНЕРАЦИЯ ОДНОГО ЧАНКА  ------------------------------- */

  /**
   * 0  – стена,   1 – пол комнаты,  2 – пол коридора,  3 – дверь
   * Комнаты 4-7 шт (5×5…8×8) без пересечений (буфер = 1).
   * Коридоры шириной 2, сегменты ≤ 25, L-образные (без диагоналей).
   * У каждой комнаты 1–3 дверных выходов  (проёмы 1–2 клетки).
   * Минимум два коридорных выхода к границам чанка (N/S/E/W).
   */
  _generateChunk () {
    const S = this.chunkSize;
    const g = Array.from({length:S},()=>Array(S).fill(0));   // 0 = wall

    /* --- 1. Разместить комнаты -------------------------------------- */
    const rooms=[];
    const RC = 4 + Math.floor(Math.random()*4);              // 4…7
    for(let i=0;i<RC;i++){
      for(let tries=0; tries<100; tries++){
        const size = () => 5 + Math.floor(((Math.random()+Math.random())/2)*4); // 5-8
        let w=size(), h=size();
        if(Math.abs(w-h)>4) h=w;

        const x0=1+Math.floor(Math.random()*(S-w-2));
        const y0=1+Math.floor(Math.random()*(S-h-2));

        let ok=true;
        for(const [rx,ry,rw,rh] of rooms){
          if(!(x0>rx+rw+1||x0+w+1<rx||y0>ry+rh+1||y0+h+1<ry)){ ok=false; break; }
        }
        if(!ok) continue;

        for(let y=y0+1;y<y0+h-1;y++)
          for(let x=x0+1;x<x0+w-1;x++)
            g[y][x]=1;                                       // пол комнаты
        rooms.push([x0,y0,w,h]);
        break;
      }
    }

    /* --- 2. Построить MST по центрам комнат ------------------------- */
    const C=rooms.map(([x,y,w,h])=>({x:x+~~(w/2),y:y+~~(h/2)}));
    const N=C.length, used=new Set([0]), edges=[];
    const d2=Array.from({length:N},()=>Array(N).fill(Infinity));
    for(let i=0;i<N;i++)for(let j=i+1;j<N;j++){
      const dx=C[i].x-C[j].x, dy=C[i].y-C[j].y;
      d2[i][j]=d2[j][i]=dx*dx+dy*dy;
    }
    while(used.size<N){
      let best={i:-1,j:-1,d:Infinity};
      for(const i of used){
        for(let j=0;j<N;j++) if(!used.has(j)&&d2[i][j]<best.d){
          best={i,j,d:d2[i][j]};
        }
      }
      edges.push(best); used.add(best.j);
    }

    /* --- 3. Коридоры L-образно, ширина 2 ---------------------------- */
    const carve=(x,y)=>{ if(g[y]?.[x]!==undefined) g[y][x]=2; }; // 2 = corridor
    const carveL=(x1,y1,x2,y2)=>{
      const dx=Math.sign(x2-x1), dy=Math.sign(y2-y1);
      let lenX=Math.abs(x2-x1), lenY=Math.abs(y2-y1);

      const goX=(sx,sy,len)=>{
        const seg=Math.min(len,25);
        for(let i=0;i<=seg;i++){ carve(sx+dx*i,sy); carve(sx+dx*i,sy+1); }
        return len-seg;
      };
      const goY=(sx,sy,len)=>{
        const seg=Math.min(len,25);
        for(let i=0;i<=seg;i++){ carve(sx,sy+dy*i); carve(sx+1,sy+dy*i); }
        return len-seg;
      };
      while(lenX>0){ lenX=goX(x1,y1,lenX); x1+=dx*25; }     // по X
      while(lenY>0){ lenY=goY(x2,y1,lenY); y1+=dy*25; }     // по Y
    };
    for(const e of edges){ carveL(C[e.i].x,C[e.i].y, C[e.j].x,C[e.j].y); }

    /* --- 4. Двери и дополнительные выходы --------------------------- */
    const markDoor=(x,y)=>{ if(g[y]?.[x]===0) g[y][x]=3; };   // 3 = door
    // а) двери комната↔коридор
    for(let y=1;y<S-1;y++)for(let x=1;x<S-1;x++){
      if(g[y][x]!==0) continue;              // только стены
      const horiz = (g[y][x-1]===1&&g[y][x+1]===2)||(g[y][x-1]===2&&g[y][x+1]===1);
      const vert  = (g[y-1][x]===1&&g[y+1][x]===2)||(g[y-1][x]===2&&g[y+1][x]===1);
      if(horiz||vert) markDoor(x,y);
    }
    // б) гарантируем минимум два выхода к границе чанка
    const exits=[];
    for(let x=1;x<S-1;x++){
      if(g[1][x]===2) exits.push([x,0]);             // верх
      if(g[S-2][x]===2) exits.push([x,S-1]);         // низ
    }
    for(let y=1;y<S-1;y++){
      if(g[y][1]===2) exits.push([0,y]);             // левый
      if(g[y][S-2]===2) exits.push([S-1,y]);         // правый
    }
    while(exits.length<2){
      // выбираем случайный горизонтальный / вертикальный коридор и продлеваем
      const dirs=[[0,-1],[0,1],[-1,0],[1,0]];
      let x,y,dir;
      do{
        y = 1+Math.floor(Math.random()*(S-2));
        x = 1+Math.floor(Math.random()*(S-2));
        dir = dirs[Math.floor(Math.random()*4)];
      }while(g[y][x]!==2);
      while(x>0&&x<S-1&&y>0&&y<S-1){
        if(g[y][x]===0) carve(x,y);
        x+=dir[0]; y+=dir[1];
      }
      exits.push([x,y]);
    }

    return g;
  }
}

/* экспорт */
window.GameMap = GameMap;