// controls.js

// ===================
// GLOBAL INPUT STATE
// ===================
window.inputVector = { x: 0, y: 0 };  // from touch joystick
window.keyVector   = { x: 0, y: 0 };  // from keyboard WASD/arrows

// ===================
// KEYBOARD HANDLING
// ===================
window.addEventListener('keydown', e => {
  switch (e.key) {
    case 'ArrowUp':    case 'w': window.keyVector.y = -1; break;
    case 'ArrowDown':  case 's': window.keyVector.y = +1; break;
    case 'ArrowLeft':  case 'a': window.keyVector.x = -1; break;
    case 'ArrowRight': case 'd': window.keyVector.x = +1; break;
  }
});
window.addEventListener('keyup', e => {
  switch (e.key) {
    case 'ArrowUp':    case 'w': window.keyVector.y = 0; break;
    case 'ArrowDown':  case 's': window.keyVector.y = 0; break;
    case 'ArrowLeft':  case 'a': window.keyVector.x = 0; break;
    case 'ArrowRight': case 'd': window.keyVector.x = 0; break;
  }
});

// ===================
// TOUCH JOYSTICK
// ===================
const base = document.getElementById('joystickBase');
const knob = document.getElementById('joystickKnob');
let dragging = false;
let origin   = { x: 0, y: 0 };
const maxRadius = 40;  // in pixels

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

  const limited = Math.min(dist, maxRadius);
  const nx = Math.cos(angle) * limited;
  const ny = Math.sin(angle) * limited;

  // move knob
  knob.style.transform = `translate(${nx}px, ${ny}px)`;

  // update inputVector in [-1..1]
  window.inputVector.x = nx / maxRadius;
  window.inputVector.y = ny / maxRadius;

  // also rotate player immediately if exists
  if (window.player) {
    window.player.directionAngle = angle;
  }
});

function endDrag(e) {
  dragging = false;
  knob.style.transform = 'translate(0, 0)';
  window.inputVector.x = 0;
  window.inputVector.y = 0;
  base.releasePointerCapture(e.pointerId);
}

base.addEventListener('pointerup',     endDrag);
base.addEventListener('pointercancel', endDrag);