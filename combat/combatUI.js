// combat/combatUI.js
;(function(){
  const ctx2 = ctx;     // глобальный контекст из game.js
  let timer  = 0;
  const bullets    = [];
  const bulletSpeed = 10 * TILE_SIZE; // пикселей в секунду

  function update(dt) {
    timer += dt;
    const interval = 1 / baseWeapon.fireRate;

    if (timer >= interval) {
      timer -= interval;
      // 1) выстрел: бьем по всем врагам в FOV
      const vis = computeFOV(gameMap, player); // теперь правильно – FOV игрока
      window.monsters.forEach(m => {
        if (m.dead) return;
        const mk = `${Math.floor(m.x)},${Math.floor(m.y)}`;
        if (!vis.has(mk)) return;
        // урон
        if (!m.real) {
          m.dead = true;
        } else {
          m.hp -= baseWeapon.damage;
          if (m.hp <= 0) m.dead = true;
        }
        // спавним «пулю» к этому монстру
        const cx = C_W / 2, cy = C_H / 2;
        const tx = m.x * TILE_SIZE - player.x * TILE_SIZE + cx;
        const ty = m.y * TILE_SIZE - player.y * TILE_SIZE + cy;
        const dx = tx - cx, dy = ty - cy;
        const dist = Math.hypot(dx, dy);
        bullets.push({ cx, cy, dx, dy, dist, traveled: 0 });
      });
    }

    // 2) анимируем пули
    bullets.forEach(b => b.traveled += bulletSpeed * dt);
    // убираем долетевшие
    for (let i = bullets.length - 1; i >= 0; i--) {
      if (bullets[i].traveled >= bullets[i].dist) bullets.splice(i,1);
    }
  }

  function draw() {
    const W = C_W, H = C_H, cx = W/2, cy = H/2;
    const progress = timer * baseWeapon.fireRate; // от 0 до 1
    const halfLen  = (W/2) * progress;

    // a) две красные линии, сходящиеся к центру
    ctx2.save();
    ctx2.strokeStyle = 'rgba(255,0,0,0.8)';
    ctx2.lineWidth = 4;
    ctx2.beginPath();
    ctx2.moveTo(cx - halfLen, cy);
    ctx2.lineTo(cx, cy);
    ctx2.moveTo(cx + halfLen, cy);
    ctx2.lineTo(cx, cy);
    ctx2.stroke();
    ctx2.restore();

    // b) пунктирная полупрозрачная вертикаль в центре
    ctx2.save();
    ctx2.strokeStyle = 'rgba(255,0,0,0.5)';
    ctx2.lineWidth = 2;
    ctx2.setLineDash([5,5]);
    ctx2.beginPath();
    ctx2.moveTo(cx, cy - 15);
    ctx2.lineTo(cx, cy + 15);
    ctx2.stroke();
    ctx2.restore();

    // c) рисуем пули
    ctx2.save();
    ctx2.fillStyle = 'rgba(255,200,0,1)';
    bullets.forEach(b => {
      const t = b.traveled / b.dist;
      const x = b.cx + b.dx * t;
      const y = b.cy + b.dy * t;
      ctx2.beginPath();
      ctx2.arc(x, y, 4, 0, 2*Math.PI);
      ctx2.fill();
    });
    ctx2.restore();
  }

  // «монки-патчим» loop из game.js
  (function(){
    const oldLoop = window.loop;
    let last = performance.now();
    window.loop = function(now) {
      const dt = (now - last) / 1000;
      last = now;

      update(dt);     // 1) обновляем таймер и пули
      oldLoop(now);   // 2) оригинальный игровой цикл: игрок, FOV, карта

      // 3) после рендера карты – рисуем врагов
      ctx2.save();
      ctx2.translate(
        C_W/2 - player.x * TILE_SIZE,
        C_H/2 - player.y * TILE_SIZE
      );
      window.monsters.forEach(m => m.draw(ctx2));
      ctx2.restore();

      // 4) поверх – UI линий и пуль
      draw();
    };
  })();
})();