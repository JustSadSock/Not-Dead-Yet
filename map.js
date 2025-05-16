// map.js  —  комнаты (room), коридоры (corridor), двери (door), стены (0)
class GameMap {
  constructor (chunkSize = 32) {
    this.chunkSize  = chunkSize;       // 32×32 клеток
    this.chunks     = new Map();       // Map<"cx,cy",{tiles,meta}>
    this.generating = new Set();
  }

  /* ----------  публичное API  ---------- */

  ensureChunk (cx,cy){
    const key=`${cx},${cy}`;
    if(this.chunks.has(key)||this.generating.has(key)) return;
    this.generating.add(key);

    const tiles=this._generateChunk();               // int | string
    const meta = Array.from({length:this.chunkSize},() =>
      Array.from({length:this.chunkSize},()=>({memoryAlpha:0,visited:false})));
    this.chunks.set(key,{tiles,meta});
    this.generating.delete(key);
  }

  isFloor (gx,gy){
    const cx=Math.floor(gx/this.chunkSize),
          cy=Math.floor(gy/this.chunkSize);
    const lx=gx-cx*this.chunkSize,
          ly=gy-cy*this.chunkSize;
    const c=this.chunks.get(`${cx},${cy}`);
    if(!c) return false;
    const t=c.tiles[ly]?.[lx];
    return t!==0 && t!==undefined;     // всё, кроме стены
  }

  regenerateChunksPreserveFOV(keys,fovFn,player){
    const vis=fovFn(player.x,player.y,player.angle);
    for(const key of keys){
      const old=this.chunks.get(key); if(!old) continue;
      const [cx,cy]=key.split(',').map(Number);
      const bx=cx*this.chunkSize, by=cy*this.chunkSize;
      const stash=[];
      for(let ly=0;ly<this.chunkSize;ly++)
        for(let lx=0;lx<this.chunkSize;lx++){
          const gx=bx+lx, gy=by+ly, m=old.meta[ly][lx];
          if(vis.has(`${gx},${gy}`)||m.memoryAlpha>0)
            stash.push({lx,ly,tile:old.tiles[ly][lx],meta:{...m}});
        }
      this.chunks.delete(key); this.ensureChunk(cx,cy);
      const fresh=this.chunks.get(key);
      for(const s of stash){ fresh.tiles[s.ly][s.lx]=s.tile; fresh.meta[s.ly][s.lx]=s.meta; }
    }
  }

  /* ----------  генерация одного чанка  ---------- */

  _generateChunk(){
    const S=this.chunkSize;
    const g=Array.from({length:S},()=>Array(S).fill(0));    // 0 = wall

    /* === 1. Лабиринт  (spanning-tree на сетке N×N) = коридор  ===== */
    const N=9;                        // 9*3 = 27  (оставляет рамку)
    const conn=Array.from({length:N},()=>Array.from({length:N},()=>({N:0,S:0,E:0,W:0})));
    const vis =Array.from({length:N},()=>Array(N).fill(false));
    const st=[{x:~~(N/2),y:~~(N/2)}]; vis[st[0].y][st[0].x]=true;
    while(st.length){
      const {x,y}=st.at(-1);
      const nbr=[];
      if(y>0   &&!vis[y-1][x]) nbr.push('N');
      if(y<N-1&&!vis[y+1][x]) nbr.push('S');
      if(x>0   &&!vis[y][x-1]) nbr.push('W');
      if(x<N-1&&!vis[y][x+1]) nbr.push('E');
      if(nbr.length){
        const d=nbr[Math.random()*nbr.length|0];
        let nx=x,ny=y;
        if(d==='N') ny--; if(d==='S') ny++;
        if(d==='W') nx--; if(d==='E') nx++;
        conn[y][x][d]=1; conn[ny][nx][{N:'S',S:'N',W:'E',E:'W'}[d]]=1;
        vis[ny][nx]=true; st.push({x:nx,y:ny});
      }else st.pop();
    }
    // Коридорные 2×2 блоки (+ «трубы» 2 ширины)
    for(let j=0;j<N;j++)for(let i=0;i<N;i++){
      const bx=i*3, by=j*3;
      g[by][bx]=g[by][bx+1]=g[by+1][bx]=g[by+1][bx+1]='corridor';
      if(conn[j][i].E){ g[by][bx+2]=g[by+1][bx+2]='corridor'; }
      if(conn[j][i].S){ g[by+2][bx]=g[by+2][bx+1]='corridor'; }
    }

    /* === 2. Размещаем 3-8 комнат (4×4…8×8) ====================== */
    const rooms=[], wantRooms=3+Math.random()*6|0;          // 3-8
    const weighted = ()=>{ const a=[4,5,6,7,8], w=[1,2,4,2,1], s=w.reduce((p,c)=>p+c,0);
      let r=Math.random()*s; for(let i=0;i<a.length;i++){ if((r-=w[i])<=0) return a[i]; }};
    for(let k=0;k<wantRooms;k++){
      for(let t=0;t<80;t++){
        const w=weighted(), h=weighted();
        const x0=1+Math.random()*(S-w-2)|0,
              y0=1+Math.random()*(S-h-2)|0;
        let ok=true;
        // буфер=1
        rooms Loop:for(const [rx,ry,rw,rh] of rooms){
          if(!(x0>rx+rw+1||x0+w+1<rx||y0>ry+rh+1||y0+h+1<ry)){ ok=false; break rooms Loop;}
        }
        if(!ok) continue;
        rooms.push([x0,y0,w,h]); break;
      }
    }
    // Заполняем комнатами
    rooms.forEach(([x0,y0,w,h])=>{
      for(let y=y0;y<y0+h;y++)
        for(let x=x0;x<x0+w;x++)
          g[y][x]='room';
    });

    /* === 3. Двери (1–3, для больших ≥2) ========================= */
    const delta=[[0,-1],[0,1],[-1,0],[1,0]];
    const isCorr=(x,y)=>g[y]?.[x]==='corridor';
    rooms.forEach(([x0,y0,w,h])=>{
      const perim=[];
      // верх & низ
      for(let x=x0;x<x0+w;x++){
        perim.push([x,y0-1,'S']);              // сверху стена комнаты
        perim.push([x,y0+h,'N']);              // снизу
      }
      // лево & право
      for(let y=y0;y<y0+h;y++){
        perim.push([x0-1,y,'E']);
        perim.push([x0+w,y,'W']);
      }
      // фильтруем по наличию коридора за стеной
      const doors = perim.filter(([x,y,dir])=>{
        const [dx,dy]=dir==='N'?[0,-1]:dir==='S'?[0,1]:dir==='W'?[ -1,0 ]:[1,0];
        return isCorr(x+dx,y+dy); });
      if(!doors.length) return;

      const need = (w*h>16)?2:1;
      const count = Math.min(3, doors.length);
      const picks = new Set();
      while(picks.size < Math.max(need,Math.random()*count|0||1))
        picks.add( doors[Math.random()*doors.length|0] );

      picks.forEach(([x,y])=>{
        g[y][x]='door';
      });
    });

    /* === 4. Обеспечиваем ≥2 выхода коридоров на границу чанка ==== */
    const exits=[];
    for(let x=1;x<S-1;x++){
      if(g[1][x]==='corridor') exits.push([x,0]);
      if(g[S-2][x]==='corridor') exits.push([x,S-1]);
    }
    for(let y=1;y<S-1;y++){
      if(g[y][1]==='corridor') exits.push([0,y]);
      if(g[y][S-2]==='corridor') exits.push([S-1,y]);
    }
    while(exits.length<2){
      let x,y,dir;
      do{ x=1+Math.random()*(S-2)|0; y=1+Math.random()*(S-2)|0; }
      while(g[y][x]!=='corridor');
      dir=[[0,-1],[0,1],[-1,0],[1,0]][Math.random()*4|0];
      while(x>0&&x<S-1&&y>0&&y<S-1){
        if(g[y][x]===0) g[y][x]='corridor';
        x+=dir[0]; y+=dir[1];
      }
      exits.push([x,y]);
    }

    return g;
  }
}

window.GameMap = GameMap;