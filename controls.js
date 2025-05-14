// controls.js

// Вектор ввода: по умолчанию 0
window.inputVector = { x: 0, y: 0 };

const base = document.getElementById('joystickBase');
const knob = document.getElementById('joystickKnob');

let dragging = false;
let origin = { x: 0, y: 0 };
const maxRadius = 40; // в px, радиус движения ручки

base.addEventListener('pointerdown', e => {
  dragging = true;
  origin = { x: e.clientX, y: e.clientY };
  base.setPointerCapture(e.pointerId);
});

base.addEventListener('pointermove', e => {
  if (!dragging) return;

  const dx = e.clientX - origin.x;
  const dy = e.clientY - origin.y;
  const dist = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);

  // Ограничиваем до радиуса
  const limited = Math.min(dist, maxRadius);
  const nx = Math.cos(angle) * limited;
  const ny = Math.sin(angle) * limited;

  // Сдвигаем ручку визуально
  knob.style.transform = `translate(${nx}px, ${ny}px)`;

  // Нормируем вектор ввода в [-1…1]
  window.inputVector.x = nx / maxRadius;
  window.inputVector.y = ny / maxRadius;

  // Можно здесь же вращать взгляд героя:
  window.player.directionAngle = angle;
});

base.addEventListener('pointerup', e => {
  dragging = false;
  // Сбрасываем ручку в центр
  knob.style.transform = `translate(0, 0)`;
  window.inputVector.x = 0;
  window.inputVector.y = 0;
  base.releasePointerCapture(e.pointerId);
});