// map.js
// ------------------------------------------------------------
// Чанковая карта (32 × 32 тайла на чанк) c «забыванием» тайлов.
// Типы тайлов:
//   false          — стена
//   'corridor'     — коридор 2 клетки шириной
//   'room'         — пол комнаты (4×4 … 8×8)
//   'door'         — дверной проём (1-2 клетки)
// ------------------------------------------------------------
class GameMap {
  constructor(chunkSize = 32) {
    this.chunkSize = chunkSize;
    this.chunks    = new Map();   // Map<"cx,cy", {tiles, meta}>
    this.inProcess = new Set();   // чтобы не генерировать дубли
  }

  /* ---------- публичные методы --------------------------- */

  /** гарантируем, что чанк (cx,cy) существует */
  ensureChunk(cx, cy) {
    const key = `${cx},${cy}`;
    if (this.chunks.has(key) || this.inProcess.has(key)) return;

    this.inProcess.add(key);
    const tiles = this._generateChunk();           // Boolean | 'corridor' | 'room' | 'door'

    const meta = Array.from({length:this.chunkSize}, () =>
      Array.from({length:this.chunkSize}, () => ({memoryAlpha:0, visited:false}))
    );

    this.chunks.set(key, {tiles, meta});
    this.inProcess.delete(key);
  }

  /** true, если в глобальных координатах (gx,gy) можно ходить */
  isFloor(gx, gy) {
    const cx=Math.floor(gx/this.chunkSize),
          cy=Math.floor(gy/this.chunkSize);
    const ch=this.chunks.get(`${cx},${cy}`); if(!ch) return false;
    const lx=gx-cx*this.chunkSize, ly=gy-cy*this.chunkSize;
    if (lx<0||ly<0||lx>=this.chunkSize||ly>=this.chunkSize) return false;
    const t = ch.tiles[ly][lx];
    return t==='corridor'||t==='room'||t==='door';
  }

  /**
   * Перегенерация чанков (ключи в keys) с сохранением FOV и затухающей памяти.
   */
  regenerateChunksPreserveFOV(keys, computeFOV, player){
    const vis = computeFOV(player.x, player.y, player.angle);

    for(const key of keys){
      const old = this.chunks.get(key); if(!old) continue;

      // --- сохраняем «видимые» или не погасшие
      const stash=[];
      const [cx,cy] = key.split(',').map(Number);
      const bx=cx*this.chunkSize, by=cy*this.chunkSize;

      for(let ly=0;ly<this.chunkSize;ly++){
        for(let lx=0;lx<this.chunkSize;lx++){
          const gx=bx+lx, gy=by+ly, m=old.meta[ly][lx];
          if (vis.has(`${gx},${gy}`) || m.memoryAlpha>0){
            stash.push({lx,ly, tile:old.tiles[ly][lx], meta:{...m}});
          }
        }
      }

      // --- генерим заново и возвращаем stash
      this.chunks.delete(key);
      this.ensureChunk(cx,cy);
      const fresh=this.chunks.get(key);
      for(const s of stash){
        fresh.tiles[s.ly][s.lx]=s.tile;
        fresh.meta [s.ly][s.lx]=s.meta;
      }
    }
  }

  /* ========================================================
                 ВНУТРЕННЯЯ   ГЕНЕРАЦИЯ   ЧАНКА
     ======================================================== */
  _generateChunk(){
    const S = this.chunkSize;                       // 32
    const g = Array.from({length:S},()=>Array(S).fill(false));

    /* ===== 1. лабиринт-скелет (11×11, spanning-tree) ===== */
    const N=11;
    const conn = Array.from({length:N},()=>Array.from({length:N},()=>
      ({N:0,S:0,E:0,W:0}))
    );
    const vis  = Array.from({length:N},()=>Array(N).fill(false));
    const stack=[{x:N>>1, y:N>>1}];
    vis[stack[0].y][stack[0].x]=true;

    while(stack.length){
      const {x,y}=stack.at(-1);
      const nb=[];
      if(y>0   && !vis[y-1][x]) nb.push('N');
      if(y<N-1 && !vis[y+1][x]) nb.push('S');
      if(x>0   && !vis[y][x-1]) nb.push('W');
      if(x<N-1 && !vis[y][x+1]) nb.push('E');

      if(nb.length){
        const d=nb[Math.random()*nb.length|0];
        let nx=x,ny=y;
        if(d==='N') ny--; if(d==='S') ny++;
        if(d==='W') nx--; if(d==='E') nx++;
        conn[y][x][d]=1;
        conn[ny][nx][{N:'S',S:'N',E:'W',W:'E'}[d]]=1;
        vis[ny][nx]=true;
        stack.push({x:nx,y:ny});
      }else stack.pop();
    }

    /* helper безопасной записи ---------------------------------- */
    const set=(x,y,val)=>{
      if(x<0||y<0||x>=S||y>=S) return;
      g[y][x]=val;
    };

    /* ===== 2. комнаты ========================================= */
    const MIN=4, MAX=8;
    const want = 3 + (Math.random()*5|0);   // 3–7
    let made=0, tries=0;
    while(made<want && tries<120){
      tries++;
      const w = MIN + (Math.random()*(MAX-MIN)|0);
      const h = MIN + (Math.random()*(MAX-MIN)|0);
      const gx0 = 1 + (Math.random()*(S-w-2)|0);
      const gy0 = 1 + (Math.random()*(S-h-2)|0);

      // запрет перекрытия
      let ok=true;
      for(let y=gy0-1;y<=gy0+h;y++)
        for(let x=gx0-1;x<=gx0+w;x++)
          if(g[y][x]) ok=false;
      if(!ok) continue;

      // заполнение room
      for(let y=gy0;y<gy0+h;y++)
        for(let x=gx0;x<gx0+w;x++) set(x,y,'room');

      // двери
      const area=w*h, mindoor=area>16?2:1;
      const doors=mindoor+(Math.random()*2|0);         // 1–3 двери
      for(let d=0;d<doors;d++){
        const side=Math.random()*4|0;
        const len = 1 + (Math.random()>0.6?1:0);       // 1-2 тайла
        let ox,oy,dx=0,dy=0;
        if(side===0){ ox=gx0+(Math.random()*w|0); oy=gy0-1; dy=-1; }
        if(side===1){ ox=gx0+(Math.random()*w|0); oy=gy0+h; dy= 1; }
        if(side===2){ ox=gx0-1; oy=gy0+(Math.random()*h|0); dx=-1; }
        if(side===3){ ox=gx0+w; oy=gy0+(Math.random()*h|0); dx= 1; }
        for(let k=0;k<len;k++) set(ox+dx*k, oy+dy*k, 'door');
      }
      made++;
    }

    /* ===== 3. переносим лабиринт-коридор (ширина 2) =========== */
    for(let j=0;j<N;j++){
      for(let i=0;i<N;i++){
        const bx=i*3, by=j*3;
        // центр клетки лабиринта → 2×2 коридор
        for(let dy=0;dy<2;dy++)
          for(let dx=0;dx<2;dx++)
            if(!g[by+dy][bx+dx]) g[by+dy][bx+dx]='corridor';

        const c=conn[j][i];
        if(c.E){ set(bx+2,by,'corridor'); set(bx+2,by+1,'corridor'); }
        if(c.S){ set(bx,by+2,'corridor'); set(bx+1,by+2,'corridor'); }
      }
    }

    return g;
  }
}

/* делаем класс доступным для game.js */
window.GameMap = GameMap;