// controls.js

// ========== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ==========
window.inputVector = { x: 0, y: 0 };

// Находим элементы joystickBase и joystickKnob
const base = document.getElementById('joystickBase');
const knob = document.getElementById('joystickKnob');

// Флаг, что мы водим пальцем по джойстику
let dragging = false;
// Точка начала касания
let origin = { x: 0, y: 0 };
// Радиус, на который можно сместить ручку (в пикселях)
const maxRadius = 40;

/**
 * pointerdown — начинаем «таскать» джойстик
 */
base.addEventListener('pointerdown', e => {
  dragging = true;
  // позиция, относительно которой будут вычисляться смещения
  origin = { x: e.clientX, y: e.clientY };
  base.setPointerCapture(e.pointerId);
});

/**
 * pointermove — если тянем, пересчитываем вектор и двигаем «ручку»
 */
base.addEventListener('pointermove', e => {
  if (!dragging) return;

  // вектор от центра до касания
  const dx = e.clientX - origin.x;
  const dy = e.clientY - origin.y;
  const dist = Math.hypot(dx, dy);

  // угол направления
  const angle = Math.atan2(dy, dx);

  // ограничиваем смещение по радиусу
  const limited = Math.min(dist, maxRadius);
  const nx = Math.cos(angle) * limited;
  const ny = Math.sin(angle) * limited;

  // двигаем ручку джойстика
  knob.style.transform = `translate(${nx}px, ${ny}px)`;

  // нормируем вектор ввода в диапазон [-1…1]
  window.inputVector.x = nx / maxRadius;
  window.inputVector.y = ny / maxRadius;

  // и сразу обновляем направление взгляда персонажа
  if (window.player) {
    window.player.directionAngle = angle;
  }
});

/**
 * pointerup/pointercancel — сбрасываем джойстик в центр
 */
function endDrag(e) {
  dragging = false;
  // возвращаем «ручку» в центр
  knob.style.transform = 'translate(0, 0)';
  // сбрасываем вектор ввода
  window.inputVector.x = 0;
  window.inputVector.y = 0;
  base.releasePointerCapture(e.pointerId);
}

base.addEventListener('pointerup',   endDrag);
base.addEventListener('pointercancel', endDrag);