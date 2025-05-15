// Input state object to track direction (-1 to 1 for each axis)
window.Input = {
  dx: 0,
  dy: 0
};

(function(){
  const keysPressed = { w:false, a:false, s:false, d:false };
  // Update Input from key state
  function updateKeyInput() {
    let x = 0, y = 0;
    if(keysPressed.a) x -= 1;
    if(keysPressed.d) x += 1;
    if(keysPressed.w) y -= 1;
    if(keysPressed.s) y += 1;
    // Normalize diagonal to length 1
    if(x !== 0 && y !== 0) {
      const invLen = 1/Math.sqrt(2);
      x *= invLen;
      y *= invLen;
    }
    // Only override joystick input if no active touch
    if(!joystickActive) {
      Input.dx = x;
      Input.dy = y;
    }
  }

  // Key press handlers (WASD)
  document.addEventListener('keydown', function(e){
    const key = e.key.toLowerCase();
    if(key === 'w' || key === 'arrowup') { keysPressed.w = true; }
    if(key === 'a' || key === 'arrowleft') { keysPressed.a = true; }
    if(key === 's' || key === 'arrowdown') { keysPressed.s = true; }
    if(key === 'd' || key === 'arrowright') { keysPressed.d = true; }
    updateKeyInput();
  });
  document.addEventListener('keyup', function(e){
    const key = e.key.toLowerCase();
    if(key === 'w' || key === 'arrowup') { keysPressed.w = false; }
    if(key === 'a' || key === 'arrowleft') { keysPressed.a = false; }
    if(key === 's' || key === 'arrowdown') { keysPressed.s = false; }
    if(key === 'd' || key === 'arrowright') { keysPressed.d = false; }
    updateKeyInput();
  });

  // Joystick control
  const joystick = document.getElementById('joystick');
  const knob = document.getElementById('joystick-knob');
  let joystickActive = false;
  let joyCenterX, joyCenterY, joyRadius;
  // Initialize joystick center and radius
  function initJoystick() {
    const rect = joystick.getBoundingClientRect();
    joyCenterX = rect.left + rect.width/2;
    joyCenterY = rect.top + rect.height/2;
    joyRadius = rect.width/2;
  }
  // Compute joystick movement vector
  function updateJoystick(x, y) {
    const dx = x - joyCenterX;
    const dy = y - joyCenterY;
    const dist = Math.sqrt(dx*dx + dy*dy);
    let normX = 0, normY = 0;
    if(dist > 0) {
      // clamp to radius
      const clampedDist = Math.min(dist, joyRadius);
      normX = dx / joyRadius;
      normY = dy / joyRadius;
      if(dist > joyRadius) {
        // if finger outside base, move knob to edge
        const ratio = joyRadius / dist;
        x = joyCenterX + dx * ratio;
        y = joyCenterY + dy * ratio;
      }
    }
    // Position knob
    knob.style.transform = `translate(${x - joyCenterX - knob.offsetWidth/2}px, ${y - joyCenterY - knob.offsetHeight/2}px)`;
    // Update input
    Input.dx = normX;
    Input.dy = normY;
  }
  // Touch events
  joystick.addEventListener('touchstart', function(e){
    e.preventDefault();
    joystickActive = true;
    initJoystick();
    const touch = e.touches[0];
    updateJoystick(touch.clientX, touch.clientY);
  });
  joystick.addEventListener('touchmove', function(e){
    e.preventDefault();
    if(!joystickActive) return;
    const touch = e.touches[0];
    updateJoystick(touch.clientX, touch.clientY);
  });
  joystick.addEventListener('touchend', function(e){
    e.preventDefault();
    joystickActive = false;
    // Reset knob to center
    knob.style.transform = 'translate(-50%, -50%)';
    // If no keys pressed, reset input
    if(!(keysPressed.w || keysPressed.a || keysPressed.s || keysPressed.d)) {
      Input.dx = 0;
      Input.dy = 0;
    } else {
      // Otherwise, fall back to key input
      updateKeyInput();
    }
  });
  joystick.addEventListener('touchcancel', function(e){
    // Treat same as touchend
    joystick.dispatchEvent(new Event('touchend'));
  });

  // Also allow mouse dragging on joystick for desktop testing
  let mouseId = null;
  joystick.addEventListener('mousedown', function(e){
    e.preventDefault();
    joystickActive = true;
    initJoystick();
    mouseId = true;
    updateJoystick(e.clientX, e.clientY);
  });
  window.addEventListener('mousemove', function(e){
    if(!mouseId) return;
    updateJoystick(e.clientX, e.clientY);
  });
  window.addEventListener('mouseup', function(e){
    if(mouseId) {
      joystickActive = false;
      mouseId = null;
      knob.style.transform = 'translate(-50%, -50%)';
      if(!(keysPressed.w || keysPressed.a || keysPressed.s || keysPressed.d)) {
        Input.dx = 0;
        Input.dy = 0;
      } else {
        updateKeyInput();
      }
    }
  });
})();