// game.js
//
// Игровой цикл + отрисовка.
// Сейчас фиксируем спавн: игрок появляется на первой клетке пола
// в чанке (0,0), так что карта видна сразу (не чёрный экран).

import { GameMap } from './map.js';

const TILE_SIZE      = 16;       // px
const CANVAS_WIDTH   = 640;
const CANVAS_HEIGHT  = 480;

class Game {
  constructor() {
    /* — canvas — */
    this.canvas = document.getElementById('gameCanvas');
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      document.body.appendChild(this.canvas);
    }
    this.canvas.width  = CANVAS_WIDTH;
    this.canvas.height = CANVAS_HEIGHT;
    this.ctx = this.canvas.getContext('2d');

    /* — карта — */
    this.map = new GameMap();

    /* — спавн: ищем первую свободную клетку пола в чанке (0,0) — */
    const firstChunk = this.map.getChunk(0, 0).tiles;
    let sx = 0, sy = 0;
    outer: for (let y = 0; y < firstChunk.length; y++) {
      for (let x = 0; x < firstChunk.length; x++) {
        if (firstChunk[y][x] === 1) {      // 1 = пол
          sx = x; sy = y;
          break outer;
        }
      }
    }
    this.player = { x: sx, y: sy };

    /* — ввод — */
    this.bindKeys();
    window.addEventListener('gamepadconnected', (e) =>
      console.log('Gamepad connected:', e.gamepad.id)
    );

    /* — запуск цикла — */
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  bindKeys() {
    window.addEventListener('keydown', (e) => {
      let dx = 0, dy = 0;
      if (e.key === 'ArrowUp'    || e.key === 'w') dy = -1;
      if (e.key === 'ArrowDown'  || e.key === 's') dy =  1;
      if (e.key === 'ArrowLeft'  || e.key === 'a') dx = -1;
      if (e.key === 'ArrowRight' || e.key === 'd') dx =  1;
      if (dx || dy) this.tryMove(dx, dy);
    });
  }

  handleGamepad() {
    const gp = navigator.getGamepads()[0];
    if (!gp) return;
    const thresh = 0.5;
    const ax = gp.axes[0], ay = gp.axes[1];
    if (ax < -thresh) this.tryMove(-1, 0);
    if (ax >  thresh) this.tryMove( 1, 0);
    if (ay < -thresh) this.tryMove(0, -1);
    if (ay >  thresh) this.tryMove(0,  1);
  }

  tryMove(dx, dy) {
    const nx = this.player.x + dx,
          ny = this.player.y + dy;
    if (this.map.getTile(nx, ny) !== 2) {  // 2 = стена
      this.player.x = nx;
      this.player.y = ny;
    }
  }

  loop() {
    this.handleGamepad();

    /* — FOV и очистка — */
    this.map.computeFOV(this.player.x, this.player.y);
    this.map.cleanup(this.player.x, this.player.y);

    this.draw();
    requestAnimationFrame(this.loop);
  }

  draw() {
    const ctx = this.ctx;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const halfW = Math.floor(CANVAS_WIDTH  / 2 / TILE_SIZE);
    const halfH = Math.floor(CANVAS_HEIGHT / 2 / TILE_SIZE);
    const startX = this.player.x - halfW;
    const startY = this.player.y - halfH;
    const cols = Math.ceil(CANVAS_WIDTH  / TILE_SIZE);
    const rows = Math.ceil(CANVAS_HEIGHT / TILE_SIZE);

    for (let ix = 0; ix <= cols; ix++) {
      for (let iy = 0; iy <= rows; iy++) {
        const wx = startX + ix,
              wy = startY + iy,
              key = `${wx},${wy}`;

        const tile = this.map.getTile(wx, wy);
        const vis  = this.map.visible.has(key);
        const seen = this.map.seen.has(key);

        let color = '#000';
        if (tile === 1) {          // пол
          color = vis ? '#b8b8b8' : (seen ? '#666' : '#000');
        } else if (tile === 2) {   // стена
          color = vis ? '#444' : (seen ? '#222' : '#000');
        }
        ctx.fillStyle = color;
        ctx.fillRect(ix * TILE_SIZE, iy * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
    /* игрок */
    ctx.fillStyle = '#f00';
    ctx.fillRect(halfW * TILE_SIZE, halfH * TILE_SIZE, TILE_SIZE, TILE_SIZE);
  }
}

window.onload = () => {
  window.game = new Game();
};

