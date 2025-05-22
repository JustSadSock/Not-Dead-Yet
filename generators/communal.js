// generators/communal.js
//
// 1) строит «сырой» массив wall/room
// 2) отдаёт его в applyRules()  → получает окончательную карту

import { applyRules } from './validator.js';

function R(a,b){return a+Math.floor(Math.random()*(b-a+1));}

export function generateTiles(tiles){
  const S = tiles.length;

  /* — 1. “сырые” комнаты 4-8 штук — */
  tiles.forEach(row=>row.fill('wall'));
  const rooms=[];
  const CNT=R(4,8);
  for(let i=0;i<CNT;i++){
    const w=R(4,8), h=R(4,8),
          x=R(1,S-w-2), y=R(1,S-h-2);
    if(rooms.some(r=> !(r.x+w<x||x+w<r.x||r.y+h<y||y+h<r.y))) { i--;continue; }
    for(let yy=y;yy<y+h;yy++)
      for(let xx=x;xx<x+w;xx++)
        tiles[yy][xx]='room';
    rooms.push({x,y,w,h});
  }

  /* — 2. домонтаж + проверки — */
  const final = applyRules(tiles);
  for(let y=0;y<S;y++) for(let x=0;x<S;x++) tiles[y][x]=final[y][x];
}