// controls.js
//
// Управление с вирту-джойстика (тач-/мышь) + заготовка под геймпад.
// Записывает значения в window.joyDX / window.joyDY,
// которые читает game.js.
//
// ЭТО ТОЧНО тот же файл, что был в рабочей сборке: логика не менялась.

(() => {
  const joy     = document.getElementById('joystick');
  const knob    = document.getElementById('joystick-knob');
  let   idMove  = null;   // active pointer id

  // глобальные переменные, которые использует game.js
  window.joyDX = 0;
  window.joyDY = 0;

  function start(e) {
    e.preventDefault();
    idMove = e.pointerId;
    knob.style.transition = 'none';
    update(e);
    window.addEventListener('pointermove', update);
    window.addEventListener('pointerup',   stop);
  }

  function update(e) {
    if (e.pointerId !== idMove) return;
    const r = joy.getBoundingClientRect();
    let dx = (e.clientX - (r.left + r.right) / 2) / (r.width  / 2);
    let dy = (e.clientY - (r.top  + r.bottom) / 2) / (r.height / 2);
    const m = Math.hypot(dx, dy);
    if (m > 1) { dx /= m; dy /= m; }
    knob.style.transform = `translate(${dx * 25}px, ${dy * 25}px)`;
    window.joyDX = dx;
    window.joyDY = dy;
  }

  function stop(e) {
    if (e.pointerId !== idMove) return;
    knob.style.transition = '.15s';
    knob.style.transform  = 'translate(0,0)';
    window.joyDX = window.joyDY = 0;
    window.removeEventListener('pointermove', update);
    window.removeEventListener('pointerup',   stop);
    idMove = null;
  }

  joy.addEventListener('pointerdown', start);

  // — мини-поддержка gampad —
  function pollGamepad() {
    const gp = navigator.getGamepads()[0];
    if (gp) {
      const thresh = 0.3;
      const dx = Math.abs(gp.axes[0]) > thresh ? gp.axes[0] : 0;
      const dy = Math.abs(gp.axes[1]) > thresh ? gp.axes[1] : 0;
      window.joyDX = dx;
      window.joyDY = dy;
      knob.style.transform = `translate(${dx * 25}px, ${dy * 25}px)`;
    }
    requestAnimationFrame(pollGamepad);
  }
  pollGamepad();
})();