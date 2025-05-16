// map/validator/postValidate.js
// Гарантируем: каждая door имеет хотя бы 1 сосед hall

export function enforcePostValidate(tiles, S) {
  for (let y=0;y<S;y++) for (let x=0;x<S;x++){
    if (tiles[y][x]!=='door') continue;
    const neigh = [[1,0],[-1,0],[0,1],[0,-1]];
    const nHall = neigh.filter(([dx,dy])=>
      tiles[y+dy]?.[x+dx]==='hall'
    ).length;
    if (nHall===0) {
      const dir = neigh.find(([dx,dy])=>
        tiles[y+dy]?.[x+dx]==='room'
      );
      if (dir) {
        const [dx,dy] = dir, hx=x-dx, hy=y-dy;
        if (tiles[hy]?.[hx]==='wall') tiles[hy][hx]='hall';
      }
    }
  }
}
