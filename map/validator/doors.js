// map/validator/doors.js
import { shuffle } from './utils.js';

const sideOffsets = { N:[0,-1], S:[0,1], W:[-1,0], E:[1,0] };

/**
 * Расставляет по 1–3 двери на каждую комнату,
 * делает первичную валидацию (≤1 сосед door, =1 room, =1 hall, 1–2 wall).
 * @returns {Array<{ x,y,side,room }>} doors — список всех дверей
 */
export function placeAndValidateDoors(tiles, rooms, S) {
  const roomDoors = rooms.map(()=>[]);
  const allDoors  = [];

  // 1) расстановка
  for (let i=0;i<rooms.length;i++){
    const {minX,maxX,minY,maxY, cells} = rooms[i];
    const area = (maxX-minX+1)*(maxY-minY+1);
    const cnt  = area < 16 ? 1 : 1 + Math.floor(Math.random()*2);
    const cand=[];
    for (let x=minX; x<=maxX; x++){
      cand.push({x,y:minY-1,side:'N'});
      cand.push({x,y:maxY+1,side:'S'});
    }
    for (let y=minY; y<=maxY; y++){
      cand.push({x:minX-1,y,side:'W'});
      cand.push({x:maxX+1,y,side:'E'});
    }
    const valid = cand.filter(c=>
      c.x>=0&&c.y>=0&&c.x<S&&c.y<S&&tiles[c.y][c.x]==='wall'
    );
    shuffle(valid);
    const pick = valid.slice(0,cnt);
    for (const {x,y,side} of pick) {
      tiles[y][x] = 'door';
      roomDoors[i].push({x,y,side,room:i});
    }
  }

  // 2) первичная валидация: у каждой door
  for (const doors of roomDoors) for (const d of doors) {
    const {x,y} = d;
    let nDoor=0,nRoom=0,nHall=0,nWall=0;
    for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const t = tiles[y+dy]?.[x+dx];
      if      (t==='door') nDoor++;
      else if (t==='room') nRoom++;
      else if (t==='hall') nHall++;
      else                 nWall++;
    }
    if (!(nDoor<=1 && nRoom===1 && nHall===1 && (nWall===1||nWall===2))) {
      tiles[y][x] = 'wall';
    }
  }

  // собираем полный список
  roomDoors.forEach(arr=> arr.forEach(d=> allDoors.push(d)));
  return allDoors;
}
