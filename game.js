// game.js

// ========== КОНСТАНТЫ ==========
const RENDER_W   = 30   // тайлов по горизонтали
const RENDER_H   = 30   // тайлов по вертикали
const TILE_SIZE  = 100  // пикселей на один тайл
const SPEED      = 3    // тайлов в секунду
const FOG_FADE   = 0.5  // единиц alpha в секунду

// ========== CANVAS ==========
const canvas = document.getElementById('gameCanvas')
const ctx    = canvas.getContext('2d')
canvas.width  = RENDER_W * TILE_SIZE
canvas.height = RENDER_H * TILE_SIZE

// ========== FOV (ray‐casting) ==========
function computeFOV(map, player) {
  const visible = new Set()
  const maxR    = 10
  const fullFOV = Math.PI/3     // 60°
  const halfFOV = fullFOV/2
  const rays    = 64

  for (let i = 0; i <= rays; i++) {
    const angle = player.directionAngle - halfFOV + (i/rays)*fullFOV
    const dx    = Math.cos(angle)
    const dy    = Math.sin(angle)
    let dist    = 0

    while (dist < maxR) {
      const fx = player.x + dx*dist
      const fy = player.y + dy*dist
      const ix = Math.floor(fx)
      const iy = Math.floor(fy)

      // гарантируем, что чанк с (ix,iy) существует
      map.ensureChunk(
        Math.floor(ix/RENDER_W),
        Math.floor(iy/RENDER_H)
      )

      if (ix < 0 || iy < 0 || ix >= map.cols || iy >= map.rows) break
      visible.add(`${ix},${iy}`)
      if (map.tiles[iy][ix].type === 'wall') break
      dist += 0.2
    }
  }

  return visible
}

// ========== MONSTER ==========
class Monster {
  constructor(x, y, real) {
    this.x = x
    this.y = y
    this.real = real
    this.timer = 0
    this.visibleTimer = 0
    this.dead = false
  }

  update(dt, visible) {
    const key = `${Math.floor(this.x)},${Math.floor(this.y)}`
    const inView = visible.has(key)
    this.timer += dt
    this.visibleTimer = inView ? this.visibleTimer + dt : 0
    if (!this.real && this.timer > 5) this.dead = true
  }

  draw(ctx) {
    const px = (this.x + 0.5) * TILE_SIZE
    const py = (this.y + 0.5) * TILE_SIZE

    // кратковременный силуэт при спавне
    if (this.timer < 0.2) {
      ctx.save()
      ctx.globalAlpha = this.real ? 0.5 : 0.2
      ctx.strokeStyle = 'white'
      ctx.beginPath()
      ctx.arc(px, py, TILE_SIZE*0.4, 0, Math.PI*2)
      ctx.stroke()
      ctx.restore()
    }
    // настоящий монстр, когда долго в поле зрения
    else if (this.real && this.visibleTimer > 0) {
      ctx.save()
      ctx.globalAlpha = 1
      ctx.fillStyle = 'white'
      ctx.beginPath()
      ctx.arc(px, py, TILE_SIZE*0.4, 0, Math.PI*2)
      ctx.fill()
      ctx.restore()
    }
  }
}

// ========== КАРТА И МОНСТРЫ ==========
window.gameMap  = new GameMap(300, 300, RENDER_W, RENDER_H, TILE_SIZE)
const gameMap    = window.gameMap
window.monsters = []
const monsters   = window.monsters

// спавним монстров каждые 2 секунды
setInterval(() => {
  const vis = computeFOV(gameMap, player)
  let x,y,key
  do {
    x = Math.floor(Math.random() * gameMap.cols)
    y = Math.floor(Math.random() * gameMap.rows)
    key = `${x},${y}`
  } while (vis.has(key) || gameMap.tiles[y][x].type === 'wall')
  monsters.push(new Monster(x, y, Math.random() < 0.3))
}, 2000)

// ========== ИГРОК ==========
window.player = {
  x: RENDER_W/2 + 0.5,
  y: RENDER_H/2 + 0.5,
  directionAngle: 0
}
const player = window.player

// ========== ДЕЛТА-ВРЕМЯ ==========
let lastTime = performance.now()

// ========== ЦИКЛ ==========
function gameLoop(now = performance.now()) {
  const dt = (now - lastTime) / 1000
  lastTime = now

  // 1) ввод + поворот
  const iv = window.inputVector || { x:0,y:0 }
  if (iv.x || iv.y) {
    player.directionAngle = Math.atan2(iv.y, iv.x)
  }

  // 2) плавное движение + жёсткая коллизия
  const nx = player.x + iv.x * SPEED * dt
  const ny = player.y + iv.y * SPEED * dt
  if (!gameMap.isWall(Math.floor(nx), Math.floor(ny))) {
    player.x = nx
    player.y = ny
  }

  // 3) считаем поле зрения
  const visible = computeFOV(gameMap, player)

  // 4) обновляем память и реген тайлов только в загруженных чанках
  for (let key of gameMap.generatedChunks) {
    const [cx,cy] = key.split(',').map(Number)
    const x0 = cx * RENDER_W
    const y0 = cy * RENDER_H
    for (let y = y0; y < y0 + RENDER_H; y++) {
      for (let x = x0; x < x0 + RENDER_W; x++) {
        if (x<0||y<0||x>=gameMap.cols||y>=gameMap.rows) continue
        const tile = gameMap.tiles[y][x]
        const k    = `${x},${y}`
        if (visible.has(k)) {
          tile.memoryAlpha = 1
        } else if (tile.memoryAlpha > 0) {
          tile.memoryAlpha = Math.max(0, tile.memoryAlpha - FOG_FADE * dt)
          if (tile.memoryAlpha === 0) {
            gameMap.regenerateTile(x, y)
          }
        }
      }
    }
  }

  // 5) обновляем монстров
  monsters.forEach(m => m.update(dt, visible))
  window.monsters = monsters.filter(m => !m.dead)

  // 6) отрисовка
  const camX = player.x - RENDER_W/2
  const camY = player.y - RENDER_H/2
  const startX = Math.floor(camX)
  const startY = Math.floor(camY)
  const endX   = Math.ceil(camX + RENDER_W)
  const endY   = Math.ceil(camY + RENDER_H)

  // убедимся, что чанки в этой области есть
  for (let cy = Math.floor(startY/RENDER_H); cy <= Math.floor((endY-1)/RENDER_H); cy++) {
    for (let cx = Math.floor(startX/RENDER_W); cx <= Math.floor((endX-1)/RENDER_W); cx++) {
      gameMap.ensureChunk(cx, cy)
    }
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.save()
  ctx.translate(-camX * TILE_SIZE, -camY * TILE_SIZE)

  // тайлы
  for (let y = startY; y < endY; y++) {
    if (y<0 || y>=gameMap.rows) continue
    for (let x = startX; x < endX; x++) {
      if (x<0 || x>=gameMap.cols) continue
      const tile = gameMap.tiles[y][x]
      ctx.globalAlpha = tile.memoryAlpha
      ctx.fillStyle   = tile.type==='wall' ? '#444' : '#888'
      ctx.fillRect(x*TILE_SIZE, y*TILE_SIZE, TILE_SIZE, TILE_SIZE)
    }
  }
  ctx.globalAlpha = 1

  // монстры
  monsters.forEach(m => m.draw(ctx))

  // игрок
  const px = (player.x + 0.5) * TILE_SIZE
  const py = (player.y + 0.5) * TILE_SIZE
  ctx.fillStyle = 'red'
  ctx.beginPath()
  ctx.arc(px, py, TILE_SIZE*0.4, 0, Math.PI*2)
  ctx.fill()

  ctx.restore()
  requestAnimationFrame(gameLoop)
}

// стартуем
gameLoop()