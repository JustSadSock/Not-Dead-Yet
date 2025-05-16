// combat/enemyAI.js
(function(){
  // простейший BFS для поиска кратчайшего пути по тайлам
  function findPath(start, goal, maxNodes = 10000) {
    const key = (p) => `${p.x},${p.y}`;
    const queue = [ start ];
    const cameFrom = { [key(start)]: null };
    let nodes = 0;

    while(queue.length && nodes < maxNodes) {
      const current = queue.shift();
      nodes++;
      if (current.x === goal.x && current.y === goal.y) break;

      for (let [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = current.x + dx, ny = current.y + dy;
        const nk = `${nx},${ny}`;
        if (cameFrom[nk]) continue;
        if (!gameMap.isFloor(nx, ny)) continue;
        cameFrom[nk] = current;
        queue.push({x:nx,y:ny});
      }
    }

    // восстанавливаем путь
    const path = [];
    let curKey = `${goal.x},${goal.y}`;
    if (!cameFrom[curKey]) return [];
    let cur = goal;
    while(cur) {
      path.push(cur);
      cur = cameFrom[key(cur)];
    }
    return path.reverse();
  }

  class Enemy extends Monster {
    constructor(x, y, real) {
      super(x, y, real);
      this.hp = real ? 3 : Infinity;
      this.path = [];
    }

    update(dt, visibleSet) {
      super.update(dt, visibleSet);
      if (this.dead) return;

      // --- 1) Перестройка пути, если он пуст или достигнут игрока ---
      const sx = Math.floor(this.x), sy = Math.floor(this.y);
      const tx = Math.floor(player.x), ty = Math.floor(player.y);
      if (!this.path.length || (this.path[this.path.length-1].x !== tx || this.path[this.path.length-1].y !== ty)) {
        this.path = findPath({x:sx,y:sy}, {x:tx,y:ty});
      }

      // --- 2) Шагаем по пути (по 1 клетке за апдейт) ---
      if (this.path.length > 1) {
        // следующий шаг
        const next = this.path[1];
        this.x = next.x + 0.5;
        this.y = next.y + 0.5;
        this.path.shift();

        // маркируем тайл, чтобы он не регенерировался
        const cx = Math.floor(next.x / gameMap.chunkSize),
              cy = Math.floor(next.y / gameMap.chunkSize),
              key = `${cx},${cy}`,
              chunk = gameMap.chunks.get(key);
        if (chunk) {
          const lx = next.x - cx*gameMap.chunkSize,
                ly = next.y - cy*gameMap.chunkSize;
          chunk.meta[ly][lx].memoryAlpha = 1;
          chunk.meta[ly][lx].visited = true;
        }
      }

      // --- 3) Бой — если в зоне видимости, принимаем урон от игрока ---
      const mk = `${Math.floor(this.x)},${Math.floor(this.y)}`;
      if (visibleSet.has(mk)) {
        // здесь мы НЕ тормозим частоту апдейта —
        // стрельба будет обрабатываться централизовано в combatUI
      }
    }
  }

  // переопределяем спавн, чтобы создавать не Monster, а Enemy
  const origSpawn = window.spawnMonster;
  window.spawnMonster = function(gameMap, visibleSet) {
    let x,y,k;
    do {
      x = Math.floor(Math.random()*MAP_W);
      y = Math.floor(Math.random()*MAP_H);
      k = `${x},${y}`;
    } while (
      visibleSet.has(k) ||
      gameMap.tiles[y][x].type === 'wall'
    );
    const isReal = Math.random() > 0.7;
    const e = new Enemy(x, y, isReal);
    window.monsters.push(e);
  };

  // делаем класс доступным, если нужно
  window.Enemy = Enemy;
})();
