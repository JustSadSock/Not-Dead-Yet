// generators/validator.js
// — домонтаж + валидация “коммуналки” —
//   вход  tiles[S][S]  ('wall' / 'room')
//   выход tiles[S][S]  ('wall' / 'room' / 'hall' / 'door')

export function applyRules(rawTiles) {
  const S = rawTiles.length;
  const tiles = rawTiles.map(r => r.slice());   // работаем с копией

  /* ======= вспомогательные ======= */
  const inR = (x,y)=>x>=0&&y>=0&&x<S&&y<S;
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}};

  /* ---- flood комнат ---- */
  const rooms = [];
  const seen = Array.from({length:S},()=>Array(S).fill(false));
  for(let y=0;y<S;y++)for(let x=0;x<S;x++){
    if(tiles[y][x]!=='room'||seen[y][x])continue;
    const st=[[x,y]], cells=[];
    seen[y][x]=true;
    while(st.length){
      const [cx,cy]=st.pop(); cells.push([cx,cy]);
      for(const[dx,dy] of dirs){
        const nx=cx+dx,ny=cy+dy;
        if(inR(nx,ny)&&tiles[ny][nx]==='room'&&!seen[ny][nx]){
          seen[ny][nx]=true; st.push([nx,ny]);
        }
      }
    }
    let minX=S,maxX=0,minY=S,maxY=0;
    cells.forEach(([cx,cy])=>{
      if(cx<minX)minX=cx;if(cx>maxX)maxX=cx;
      if(cy<minY)minY=cy;if(cy>maxY)maxY=cy;
    });
    rooms.push({cells,minX,maxX,minY,maxY});
  }

  /* ---- коридор-холл помощник ---- */
  function setHall(x,y){ if(inR(x,y)&&tiles[y][x]==='wall') tiles[y][x]='hall'; }
  function carveHall(x,y,dx,dy){          // 2-тайловый до ближайшего hall/door
    while(inR(x,y)&&tiles[y][x]==='wall'){
      setHall(x,y);
      if(dx) { setHall(x,y-1); setHall(x,y+1); }
      if(dy) { setHall(x-1,y); setHall(x+1,y); }
      x+=dx; y+=dy;
    }
  }

  /* ---- ставим двери (1-3) и коридор-“stub” наружу ---- */
  const allDoors=[];
  rooms.forEach((R,ri)=>{
    const area=(R.maxX-R.minX+1)*(R.maxY-R.minY+1);
    const need = area<16?1:1+Math.floor(Math.random()*2);   // 1–3
    const cands=[];
    for(let x=R.minX+1;x<R.maxX;x++){
      cands.push({x,y:R.minY-1, side:'N'});
      cands.push({x,y:R.maxY+1, side:'S'});
    }
    for(let y=R.minY+1;y<R.maxY;y++){
      cands.push({x:R.minX-1,y, side:'W'});
      cands.push({x:R.maxX+1,y, side:'E'});
    }
    shuffle(cands);
    let placed=0;
    for(const c of cands){
      if(placed>=need) break;
      if(!inR(c.x,c.y)||tiles[c.y][c.x]!=='wall') continue;
      tiles[c.y][c.x]='door';
      const [dx,dy]=c.side==='N'? [0,-1] : c.side==='S'? [0,1] : c.side==='W'? [-1,0] : [1,0];
      carveHall(c.x+dx,c.y+dy,dx,dy);
      allDoors.push({x:c.x,y:c.y});
      placed++;
    }
  });

  /* ---- соединяем двери L-коридорами ---- */
  shuffle(allDoors);
  for(let i=1;i<allDoors.length;i++){
    const A=allDoors[i-1], B=allDoors[i];
    let x=A.x, y=A.y;
    const dx=Math.sign(B.x-x), dy=Math.sign(B.y-y);
    while(x!==B.x){ x+=dx; carveHall(x,y,dx,0); }
    while(y!==B.y){ y+=dy; carveHall(x,y,0,dy); }
  }

  /* ---- вычистим одиночные hall ---- */
  for(let y=0;y<S;y++)for(let x=0;x<S;x++)if(tiles[y][x]==='hall'){
    const ok=dirs.some(([dx,dy])=> tiles[y+dy]?.[x+dx]==='room');
    if(!ok) tiles[y][x]='wall';
  }

  /* ---- финальная зачистка дверей без hall ---- */
  for(let y=0;y<S;y++)for(let x=0;x<S;x++)if(tiles[y][x]==='door'){
    const nHall=dirs.filter(([dx,dy])=>tiles[y+dy]?.[x+dx]==='hall').length;
    const nRoom=dirs.filter(([dx,dy])=>tiles[y+dy]?.[x+dx]==='room').length;
    if(nHall!==1||nRoom!==1) tiles[y][x]='wall';
  }

  return tiles;
}
export { applyRules as chunkIsValid };
