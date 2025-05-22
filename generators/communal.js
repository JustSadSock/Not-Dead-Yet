// generators/communal.js
//
// ФИНАЛЬНАЯ версия генератора «коммуналки»
//  – 4-8 комнат (4×4…8×8)
//  – коридоры шириной 2 тайла
//  – дверь (door) появляется ТОЛЬКО в точке стыка hall↔room
//  – коридоры НЕ «липнут» боком к room без двери
//  – никаких наложений тайлов: проверка overlap()

function R(min, max) { return min + Math.floor(Math.random()*(max-min+1)); }
function overlap(x,y,w,h,r){
  return !(
    r.minX > x+w-1 ||
    r.maxX < x ||
    r.minY > y+h-1 ||
    r.maxY < y
  );
}

/* ───────── 1. Комнаты ───────── */
function carveRooms(tiles){
  const S = tiles.length, rooms = [];
  const CNT = R(4,8);                       // 4-8 комнат
  for(let i=0;i<CNT;i++){
    const w=R(4,8), h=R(4,8);
    const x=R(1,S-w-2), y=R(1,S-h-2);
    if(rooms.some(r=>overlap(x-1,y-1,w+2,h+2,r))){ i--; continue; }
    for(let yy=y;yy<y+h;yy++)
      for(let xx=x;xx<w+x;xx++)
        tiles[yy][xx]='room';
    rooms.push({minX:x,minY:y,maxX:x+w-1,maxY:y+h-1,cx:x+Math.floor(w/2),cy:y+Math.floor(h/2)});
  }
  return rooms;
}

/* ───────── 2. Коридоры + двери ───────── */
function carveTile(tiles,x,y){
  const H = tiles.length, W = tiles[0].length;

  // A) если это комната — ставим дверь только там, где hall примыкает
  if(tiles[y][x]==='room'){
    const nearHall =
      (tiles[y-1]?.[x] === 'hall') ||
      (tiles[y+1]?.[x] === 'hall') ||
      (tiles[y]?.[x-1] === 'hall') ||
      (tiles[y]?.[x+1] === 'hall');
    if(nearHall) tiles[y][x]='door';
    return;
  }

  // B) если стена — превращаем в коридор, но не прилипая к room
  if(tiles[y][x]==='wall'){
    const touchRoom =
      (tiles[y-1]?.[x] === 'room') ||
      (tiles[y+1]?.[x] === 'room') ||
      (tiles[y]?.[x-1] === 'room') ||
      (tiles[y]?.[x+1] === 'room');
    if(touchRoom) return;                 // оставляем стену между hall и room
    tiles[y][x]='hall';
    // расширяем до 2-тайлов по вертикали и горизонтали
    if(y+1<H && tiles[y+1][x]==='wall') tiles[y+1][x]='hall';
    if(x+1<W && tiles[y][x+1]==='wall') tiles[y][x+1]='hall';
  }
}

function carveCorridors(tiles,rooms){
  rooms.sort((a,b)=>a.cx-b.cx);           // связываем по X

  for(let i=1;i<rooms.length;i++){
    const A=rooms[i-1], B=rooms[i];
    let x=A.cx, y=A.cy;

    while(x!==B.cx){ x+=Math.sign(B.cx-x); carveTile(tiles,x,y); }
    while(y!==B.cy){ y+=Math.sign(B.cy-y); carveTile(tiles,x,y); }
  }
}

/* ───────── 3. Точка входа для map.js ───────── */
export function generateTiles(tiles){
  const rooms = carveRooms(tiles);
  carveCorridors(tiles, rooms);
}