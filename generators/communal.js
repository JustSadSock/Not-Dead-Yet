// generators/communal.js

function R(min, max) { return Math.floor(Math.random()*(max-min+1))+min; }
function overlap(x,y,w,h,r){
  return !(r.minX>x+w-1 || r.maxX<x || r.minY>y+h-1 || r.maxY<y);
}

function carveRooms(tiles){
  const S = tiles.length, rooms=[], CNT=R(4,8);
  for(let i=0;i<CNT;i++){
    const w=R(4,8), h=R(4,8), x=R(1,S-w-2), y=R(1,S-h-2);
    if(rooms.some(r=>overlap(x-1,y-1,w+2,h+2,r))){ i--; continue; }
    for(let yy=y;yy<y+h;yy++) for(let xx=x;xx<x+w;xx++) tiles[yy][xx]='room';
    rooms.push({minX:x,minY:y,maxX:x+w-1,maxY:y+h-1,cx:x+Math.floor(w/2),cy:y+Math.floor(h/2)});
  }
  return rooms;
}

function corridorsAndDoors(tiles,rooms){
  rooms.sort((a,b)=>a.cx-b.cx);
  for(let i=1;i<rooms.length;i++){
    const A=rooms[i-1],B=rooms[i];
    let x=A.cx, y=A.cy;

    while(x!==B.cx){
      x+=Math.sign(B.cx-x);
      if(tiles[y][x]==='room') tiles[y][x]='door';
      else if(tiles[y][x]==='wall'){
        tiles[y][x]='hall'; if(y+1<tiles.length&&tiles[y+1][x]==='wall') tiles[y+1][x]='hall';
      }
    }
    while(y!==B.cy){
      y+=Math.sign(B.cy-y);
      if(tiles[y][x]==='room') tiles[y][x]='door';
      else if(tiles[y][x]==='wall'){
        tiles[y][x]='hall'; if(x+1<tiles[y].length&&tiles[y][x+1]==='wall') tiles[y][x+1]='hall';
      }
    }
  }
}

/**
 * Главная функция, которую вызывает map.js
 * @param {string[][]} tiles — изначально вся сетка 'wall'
 */
export function generateTiles(tiles){
  const rooms = carveRooms(tiles);
  corridorsAndDoors(tiles, rooms);
}