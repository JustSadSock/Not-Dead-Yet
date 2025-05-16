// combat/combatUI.js
(function(){
  const ctx2 = ctx;        // глобальный 2D контекст из game.js
  let timer = 0;

  function update(dt) {
    timer += dt;
    const interval = 1 / baseWeapon.fireRate;
    if (timer >= interval) {
      timer -= interval;
      // выстрел! пробегаем по всем монстрам в зоне видимости
      const vis = computeFOV(player.x, player.y, player.angle);
      window.monsters.forEach(m => {
        if (m.dead) return;
        const key = `${Math.floor(m.x)},${Math.floor(m.y)}`;
        if (!vis.has(key)) return;
        if (!m.real) {
          m.dead = true;  // иллюзии умирают с одного выстрела
        } else {
          m.hp -= baseWeapon.damage;
          if (m.hp <= 0) m.dead = true;
        }
      });
    }
  }

  function draw() {
    const W = C_W, H = C_H, cx = W/2, cy = H/2;
    const half = W/2 * (timer * baseWeapon.fireRate);
    ctx2.save();
    ctx2.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx2.lineWidth = 4;
    ctx2.beginPath();
    // левая линия
    ctx2.moveTo(cx - half, cy);
    ctx2.lineTo(cx, cy);
    // правая линия
    ctx2.moveTo(cx + half, cy);
    ctx2.lineTo(cx, cy);
    ctx2.stroke();
    ctx2.restore();
  }

  // «монки-патчим» главный loop из game.js
  (function(){
    const oldLoop = window.loop;
    let prevT = performance.now();
    window.loop = function(now) {
      const dt = (now - prevT) / 1000;
      prevT = now;

      update(dt);          // 1) обновляем UI/стрельбу
      oldLoop(now);        // 2) движок двигает игрока, реген и отрисовывает карту/игрока

      // 3) После рендера карты рисуем монстров и UI-наложение
      ctx2.save();
      ctx2.translate(C_W/2 - player.x*TILE_SIZE,
                     C_H/2 - player.y*TILE_SIZE);
      window.monsters.forEach(m => m.draw(ctx2));
      ctx2.restore();

      draw();  // полоски стрельбы поверх всего
    };
  })();
})();
