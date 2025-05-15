// Game configuration
const TILE_SIZE = 32;             // fixed pixel size of each tile
const FOV_ANGLE = Math.PI / 3;    // 60 degrees field-of-view
const FOV_HALF = FOV_ANGLE / 2;
const FOV_DISTANCE = 6;          // 6 tiles forward visible
const MOVE_SPEED = 3;            // player movement speed in tiles per second

// Game state
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let canvasWidth, canvasHeight;
let playerX = 0, playerY = 0;    // player position in tile coordinates
let playerAngle = 0;            // orientation (radians)
let lastTime = null;
let gameMap;

// Resize canvas to window at fixed tile scale
function resizeCanvas() {
  canvasWidth = window.innerWidth;
  canvasHeight = window.innerHeight;
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
}
window.addEventListener('resize', resizeCanvas);

// Initialize game
function initGame() {
  resizeCanvas();
  // Center player in initial chunk (0,0) at roughly middle of chunk
  playerX = 0;
  playerY = 0;
  // Create map and initial chunk
  gameMap = new GameMap();
  gameMap.ensureChunk(0, 0); // generate starting chunk
  // Place player at the center of chunk (for safety in open space)
  const center = gameMap.chunkSize/2;
  playerX = center;
  playerY = center;
  playerAngle = 0;
  // Start game loop
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

// Game loop
function gameLoop(timestamp) {
  const dt = (timestamp - lastTime) / 1000;
  lastTime = timestamp;
  update(dt);
  render();
  requestAnimationFrame(gameLoop);
}

// Update game state (player movement, chunk generation)
function update(dt) {
  // Update player position by input
  const dx = Input.dx;
  const dy = Input.dy;
  if(dx !== 0 || dy !== 0) {
    // Update orientation toward movement direction
    playerAngle = Math.atan2(dy, dx);
    // Calculate movement vector normalized
    let mvx = dx, mvy = dy;
    const mag = Math.hypot(mvx, mvy);
    if(mag > 0) {
      mvx /= mag;
      mvy /= mag;
    }
    const step = MOVE_SPEED * dt;
    const newX = playerX + mvx * step;
    const newY = playerY + mvy * step;
    // Collision detection against walls
    const curTileX = Math.floor(playerX);
    const curTileY = Math.floor(playerY);
    const newTileX = Math.floor(newX);
    const newTileY = Math.floor(newY);
    // Check tile collisions
    let moveX = false, moveY = false;
    if(gameMap.isFloor(newTileX, curTileY)) { // horizontal movement OK
      moveX = true;
    }
    if(gameMap.isFloor(curTileX, newTileY)) { // vertical movement OK
      moveY = true;
    }
    if(moveX && moveY) {
      // If diagonal move, ensure target tile is not a blocking corner
      if(gameMap.isFloor(newTileX, newTileY)) {
        playerX = newX;
        playerY = newY;
      } else {
        // corner blocked: move only in allowed axis
        playerX = moveX ? newX : playerX;
        playerY = moveY ? newY : playerY;
      }
    } else {
      // move only in allowed axis
      if(moveX) playerX = newX;
      if(moveY) playerY = newY;
    }
  }
  // Determine current chunk coordinates
  const cx = Math.floor(playerX / gameMap.chunkSize);
  const cy = Math.floor(playerY / gameMap.chunkSize);
  // Generate neighboring chunks when near borders
  const localX = playerX - cx * gameMap.chunkSize;
  const localY = playerY - cy * gameMap.chunkSize;
  const thresh = 3;
  if(localX < thresh) gameMap.ensureChunk(cx - 1, cy);
  if(localX > gameMap.chunkSize - thresh) gameMap.ensureChunk(cx + 1, cy);
  if(localY < thresh) gameMap.ensureChunk(cx, cy - 1);
  if(localY > gameMap.chunkSize - thresh) gameMap.ensureChunk(cx, cy + 1);
  // If player changed chunk, remove far chunks (forgetting)
  if(gameMap.currentChunkX !== cx || gameMap.currentChunkY !== cy) {
    gameMap.currentChunkX = cx;
    gameMap.currentChunkY = cy;
    gameMap.forgetDistantChunks(cx, cy);
  }
}

// Render visible game area
function render() {
  // Clear screen to black
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  // Determine drawing range in world coordinates (tile indices)
  const halfScreenTilesX = Math.ceil(canvasWidth / TILE_SIZE / 2) + 1;
  const halfScreenTilesY = Math.ceil(canvasHeight / TILE_SIZE / 2) + 1;
  const minTileX = Math.floor(playerX) - halfScreenTilesX;
  const maxTileX = Math.floor(playerX) + halfScreenTilesX;
  const minTileY = Math.floor(playerY) - halfScreenTilesY;
  const maxTileY = Math.floor(playerY) + halfScreenTilesY;
  // Draw floor tiles within view range
  for(let ty = minTileY; ty <= maxTileY; ty++) {
    for(let tx = minTileX; tx <= maxTileX; tx++) {
      if(!gameMap.isFloor(tx, ty)) continue; // skip walls
      // Compute distance and angle from player to tile center
      const dx = (tx + 0.5) - playerX;
      const dy = (ty + 0.5) - playerY;
      const dist = Math.hypot(dx, dy);
      if(dist > FOV_DISTANCE + 0.5) continue; // beyond visible range
      // Check if within FOV angle
      let angleToTile = Math.atan2(dy, dx);
      // Normalize angle difference
      let diff = angleToTile - playerAngle;
      while(diff > Math.PI) diff -= 2*Math.PI;
      while(diff < -Math.PI) diff += 2*Math.PI;
      if(Math.abs(diff) > FOV_HALF) continue; // outside view cone
      // Calculate brightness (linear fade with distance)
      let brightness = 1 - (dist / FOV_DISTANCE);
      if(brightness < 0) brightness = 0;
      // Base grey level (max brightness ~ 160 out of 255)
      const shade = Math.floor(160 * brightness);
      ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
      // Compute screen position
      const screenX = (tx * TILE_SIZE - playerX * TILE_SIZE) + canvasWidth/2;
      const screenY = (ty * TILE_SIZE - playerY * TILE_SIZE) + canvasHeight/2;
      ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
    }
  }
  // Draw player as a red circle
  const playerScreenX = canvasWidth/2;
  const playerScreenY = canvasHeight/2;
  ctx.fillStyle = "#f00";
  const radius = TILE_SIZE * 0.3;
  ctx.beginPath();
  ctx.arc(playerScreenX, playerScreenY, radius, 0, 2*Math.PI);
  ctx.fill();
}

// Start the game when page is loaded
window.addEventListener('load', initGame);