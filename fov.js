/**
 * Возвращает Set строк "x,y" всех тайлов, попадающих
 * в сектор 60° и не перекрытых стенами.
 */
function computeFOV(gameMap, player) {
  const visible = new Set();
  const maxR = 10; // радиус обзора в тайлах
  const halfFOV = Math.PI / 6; // 30° => всего 60°
  const dir = player.directionAngle; // в радианах

  for (let dy = -maxR; dy <= maxR; dy++) {
    for (let dx = -maxR; dx <= maxR; dx++) {
      const tx = player.x + dx;
      const ty = player.y + dy;
      if (tx < 0 || ty < 0 || tx >= gameMap.cols || ty >= gameMap.rows) 
        continue;
      const dist = Math.hypot(dx, dy);
      if (dist > maxR) continue;

      const theta = Math.atan2(dy, dx);
      let delta = ((theta - dir + 2*Math.PI) % (2*Math.PI));
      if (delta > Math.PI) delta -= 2*Math.PI;
      if (Math.abs(delta) > halfFOV) continue;

      // простой «raycast»: проходим по всем шагам к тайлу
      const steps = Math.ceil(dist);
      let blocked = false;
      for (let step = 1; step <= steps; step++) {
        const ix = Math.round(player.x + dx * (step/steps));
        const iy = Math.round(player.y + dy * (step/steps));
        if (gameMap.tiles[iy][ix].type === 'wall') {
          blocked = true;
          break;
        }
      }
      if (!blocked) visible.add(`${tx},${ty}`);
    }
  }
  return visible;
}
