// map.js
class GameMap {
  constructor() {
    this.chunkSize = 33;
    this.chunks    = new Map();
    this.generating = new Set();
  }

  ensureChunk(cx, cy) {
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

  isFloor(gx, gy) {
    const cx = Math.floor(gx/this.chunkSize),
          cy = Math.floor(gy/this.chunkSize);
    const chunk = this.chunks.get(`${cx},${cy}`);
    if (!chunk) return false;
    const lx = gx - cx*this.chunkSize,
          ly = gy - cy*this.chunkSize;
    if (lx<0||ly<0||lx>=this.chunkSize||ly>=this.chunkSize) return false;
    return chunk.tiles[ly][lx] !== 'wall';
  }

  regenerateChunksPreserveFOV(keys, fov, p) {
    const vis = fov(p.x, p.y, p.angle);
    for (const key of keys) {
      const old = this.chunks.get(key); if (!old) continue;
      const [cx,cy] = key.split(',').map(Number);
      const stash=[];
      const bx=cx*this.chunkSize, by=cy*this.chunkSize;
      for(let y=0;y<this.chunkSize;y++){
        for(let x=0;x<this.chunkSize;x++){
          const gx=bx+x, gy=by+y, m=old.meta[y][x];
          if(vis.has(`${gx},${gy}`)||m.memoryAlpha>0){
            stash.push({x,y,tile:old.tiles[y][x],meta:{...m}});
          }
        }
      }
      this.chunks.delete(key);
      this.ensureChunk(cx,cy);
      const fresh=this.chunks.get(key);
      for(const s of stash){
        fresh.tiles[s.y][s.x]=s.tile;
        fresh.meta [s.y][s.x]=s.meta;
      }
    }
  }

  /* ──────────────────────────────────────────
     процедурная генерация (комнаты+коридоры)
     ────────────────────────────────────────── */
  _generateChunk(){
    const Nrooms = 3+Math.floor(Math.random()*6);   // 3-8
    const S=this.chunkSize;
    const tiles = Array.from({length:S}, ()=>Array(S).fill('wall'));

    /* размещаем комнаты */
    const rooms=[];
    for(let i=0;i<Nrooms&&rooms.length<8;i++){
      const w = 4+Math.floor(Math.random()*5); // 4-8
      const h = 4+Math.floor(Math.random()*5);
      const x = 1+Math.floor(Math.random()*(S-w-2));
      const y = 1+Math.floor(Math.random()*(S-h-2));
      let overlap=false;
      for(const r of rooms){
        if(!(x+w<r.x-1||r.x+r.w<x-1||y+h<r.y-1||r.y+r.h<y-1)){overlap=true;break;}
      }
      if(overlap) {i--;continue;}
      rooms.push({x,y,w,h});
      for(let yy=y;yy<y+h;yy++)
        for(let xx=x;xx<x+w;xx++) tiles[yy][xx]='room';
    }
    if(rooms.length<2) return tiles;

    /* коридоры — остовное дерево */
    const centers=rooms.map(r=>({x:r.x+(r.w>>1),y:r.y+(r.h>>1)}));
    const connected=new Set([0]), edges=[];
    while(connected.size<rooms.length){
      let best=null;
      for(const i of connected){
        for(let j=0;j<rooms.length;j++){
          if(connected.has(j)) continue;
          const dx=centers[i].x-centers[j].x, dy=centers[i].y-centers[j].y;
          const d=dx*dx+dy*dy;
          if(!best||d<best.d) best={i,j,d};
        }
      }
      connected.add(best.j); edges.push(best);
    }

    /* функция прорубает коридор толщиной 2-3 */
    const carveHall=(x0,y0,x1,y1)=>{
      const W=2+Math.floor(Math.random()*2);
      if(x0===x1){ // вертикальный
        const cols=[];
        if(W===2) cols.push(x0,x0+1);
        else cols.push(x0-1,x0,x0+1);
        const [ya,yb]=y0<y1?[y0,y1]:[y1,y0];
        for(const xx of cols)
          for(let yy=ya;yy<=yb;yy++)
            if(tiles[yy]&&tiles[yy][xx]!=='room') tiles[yy][xx]='hall';
      }else{       // горизонтальный
        const rows=[];
        if(W===2) rows.push(y0,y0+1);
        else rows.push(y0-1,y0,y0+1);
        const [xa,xb]=x0<x1?[x0,x1]:[x1,x0];
        for(const yy of rows)
          for(let xx=xa;xx<=xb;xx++)
            if(tiles[yy]&&tiles[yy][xx]!=='room') tiles[yy][xx]='hall';
      }
    };

    /* соединяем комнаты */
    for(const e of edges){
      const a=rooms[e.i], b=rooms[e.j];
      const ax=a.x+(a.w>>1), ay=a.y+(a.h>>1);
      const bx=b.x+(b.w>>1), by=b.y+(b.h>>1);
      if(Math.random()<0.5){
        carveHall(ax,ay,bx,ay);
        carveHall(bx,ay,bx,by);
      }else{
        carveHall(ax,ay,ax,by);
        carveHall(ax,by,bx,by);
      }
      // двери - 1-2 клетки вдоль границы
      const placeDoor=(rx,ry,w,h,dir)=>{
        const cnt=1+Math.floor(Math.random()*2);
        for(let k=0;k<cnt;k++){
          if(dir==='E'||dir==='W'){
            const yy=ry+Math.floor(Math.random()*h);
            const xx=dir==='E'?rx+w-1:rx;
            tiles[yy][xx]='door';
          }else{
            const xx=rx+Math.floor(Math.random()*w);
            const yy=dir==='S'?ry+h-1:ry;
            tiles[yy][xx]='door';
          }
        }
      };
      if(ax<bx){ placeDoor(a.x,a.y,a.w,a.h,'E'); placeDoor(b.x,b.y,b.w,b.h,'W');}
      else if(ax>bx){ placeDoor(a.x,a.y,a.w,a.h,'W'); placeDoor(b.x,b.y,b.w,b.h,'E');}
      else if(ay<by){ placeDoor(a.x,a.y,a.w,a.h,'S'); placeDoor(b.x,b.y,b.w,b.h,'N');}
      else {         placeDoor(a.x,a.y,a.w,a.h,'N'); placeDoor(b.x,b.y,b.w,b.h,'S');}
    }

    return tiles;
  }
}

window.GameMap = GameMap;