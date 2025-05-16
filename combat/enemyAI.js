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
      return {x, y};
    }
    return null;
  }

  class Enemy extends Monster {
    // остальное без изменений: hp, маршрут (BFS) и т. д.
    // ...
  }

  // патчим spawnMonster
  const origSpawn = window.spawnMonster;
  window.spawnMonster = function(gameMap, visibleSet) {
    const pos = getRandomFloorTile(gameMap, visibleSet);
    if (!pos) return; // не нашли — пропускаем
    const isReal = Math.random() > 0.7;
    const e = new Enemy(pos.x, pos.y, isReal);
    window.monsters.push(e);
  };
  // если где-то вызывается origSpawn — оставляем
  window.spawnMonster.orig = origSpawn;
})();