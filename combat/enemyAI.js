// combat/enemyAI.js
;(function(){
  // helper для спауна в загруженных чанках
  function getRandomFloorTile(gameMap, visibleSet, maxTries = 50) {
    const keys = Array.from(gameMap.chunks.keys());
    if (!keys.length) return null;
    for (let i = 0; i < maxTries; i++) {
      const [cx, cy] = keys[Math.floor(Math.random() * keys.length)]
                             .split(",").map(Number);
      const localX = Math.floor(Math.random() * gameMap.chunkSize);
      const localY = Math.floor(Math.random() * gameMap.chunkSize);
      const x = cx * gameMap.chunkSize + localX;
      const y = cy * gameMap.chunkSize + localY;
      const key = `${x},${y}`;
      if (visibleSet.has(key)) continue;
      if (!gameMap.isFloor(x, y)) continue;
      return { x, y };
    }
    return null;
  }

  // простой BFS для поиска пути
  function findPath(start, goal, maxNodes = 10000) {
    const key = p => `${p.x},${p.y}`;
    const queue = [ start ];
    const cameFrom = { [key(start)]: null };
    let nodes = 0;

    while (queue.length && nodes < maxNodes) {
      const current = queue.shift();
      nodes++;
      if (current.x === goal.x && current.y === goal.y) break;

      for (let [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = current.x + dx, ny = current.y + dy, nk = `${nx},${ny}`;
        if (cameFrom[nk]) continue;
        if (!gameMap.isFloor(nx, ny)) continue;
        cameFrom[nk] = current;
        queue.push({ x: nx, y: ny });
      }
    }

    const path = [];
    let curKey = `${goal.x},${goal.y}`;
    if (!cameFrom[curKey]) return [];
    let cur = goal;
    while (cur) {
      path.push(cur);
      cur = cameFrom[key(cur)];
    }
    return path.reverse();
  }

  // класс врага
  class Enemy extends Monster {
    constructor(x, y, real) {
      super(x, y, real);
      this.hp   = real ? 3 : Infinity;
      this.path = [];
    }

    update(dt, visibleSet) {
      super.update(dt, visibleSet);
      if (this.dead) return;

      const sx = Math.floor(this.x),
            sy = Math.floor(this.y),
            tx = Math.floor(player.x),
            ty = Math.floor(player.y);

      // перестраиваем путь, если цель изменилась или путь пуст
      if (!this.path.length ||
          this.path[this.path.length-1].x !== tx ||
          this.path[this.path.length-1].y !== ty) {
        this.path = findPath({ x: sx, y: sy }, { x: tx, y: ty });
      }

      // шагаем по пути
      if (this.path.length > 1) {
        const next = this.path[1];
        this.x = next.x + 0.5;
        this.y = next.y + 0.5;
        this.path.shift();

        // метим тайл, чтобы он не перегенерировался
        const cx = Math.floor(next.x / gameMap.chunkSize),
              cy = Math.floor(next.y / gameMap.chunkSize),
              key = `${cx},${cy}`,
              chunk = gameMap.chunks.get(key);
        if (chunk) {
          const lx = next.x - cx * gameMap.chunkSize,
                ly = next.y - cy * gameMap.chunkSize;
          chunk.meta[ly][lx].memoryAlpha = 1;
          chunk.meta[ly][lx].visited     = true;
        }
      }
    }
  }

  // патчим окно спавна, чтобы использовать Enemy вместо Monster
  const origSpawn = window.spawnMonster;
  window.spawnMonster = function(gameMap, visibleSet) {
    const pos = getRandomFloorTile(gameMap, visibleSet);
    if (!pos) return; // нет подходящего тайла
    const isReal = Math.random() > 0.7;
    const e = new Enemy(pos.x, pos.y, isReal);
    window.monsters.push(e);
  };
  window.spawnMonster.orig = origSpawn;
})();