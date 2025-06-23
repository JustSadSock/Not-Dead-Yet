// fov.js

/**
 * Возвращает Set строк "x,y" всех тайлов, попадающих
 * в сектор поля зрения методом ray-casting.
 */
function computeFOV(gameMap, player) {
  const visible = new Set();
  const maxR      = 10;             // радиус обзора в тайлах
  const fullFOV   = Math.PI / 3;    // 60° = π/3
  const halfFOV   = fullFOV / 2;
  const dir       = player.directionAngle; // направление взгляда

  const rayCount  = 64;  // число лучей; можно варьировать для производительности

  for (let i = 0; i <= rayCount; i++) {
    // угол текущего луча
    const angle = dir - halfFOV + (i / rayCount) * fullFOV;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    // шаг луча
    let dist = 0;
    while (dist <= maxR) {
      const fx = player.x + dx * dist;
      const fy = player.y + dy * dist;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);

      // выход за границы
      if (ix < 0 || iy < 0 || ix >= gameMap.cols || iy >= gameMap.rows) {
        break;
      }

      const key = `${ix},${iy}`;
      visible.add(key);

      // если встретили стену — дальше по этому лучу не идём
      if (gameMap.tiles[iy][ix].type === 'wall') {
        break;
      }

      dist += 0.2; // можно увеличить, чтобы сделать FOV более «гранёным»
    }
  }

  return visible;
}