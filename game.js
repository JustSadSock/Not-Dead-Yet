// game.js

import { GameMap } from './map.js';

const TILE_SIZE = 16;     // размер клетки в пикселях
const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 480;

class Game {
    constructor() {
        // Инициализируем canvas
        this.canvas = document.createElement('canvas');
        this.canvas.width = CANVAS_WIDTH;
        this.canvas.height = CANVAS_HEIGHT;
        document.body.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');

        this.map = new GameMap();
        this.player = { x: 0, y: 0 };  // начальная позиция игрока

        this.bindKeys();
        window.addEventListener("gamepadconnected", (e) => {
            console.log("Gamepad connected:", e.gamepad);
        });

        // Запускаем главный цикл
        this.loop = this.loop.bind(this);
        requestAnimationFrame(this.loop);
    }

    bindKeys() {
        window.addEventListener('keydown', (e) => {
            let dx = 0, dy = 0;
            if (e.key === 'ArrowUp' || e.key === 'w')    dy = -1;
            if (e.key === 'ArrowDown' || e.key === 's')  dy =  1;
            if (e.key === 'ArrowLeft' || e.key === 'a')  dx = -1;
            if (e.key === 'ArrowRight' || e.key === 'd') dx =  1;
            if (dx !== 0 || dy !== 0) {
                const newX = this.player.x + dx;
                const newY = this.player.y + dy;
                // Проверяем столкновение со стеной
                if (this.map.getTile(newX, newY) !== 2) {
                    this.player.x = newX;
                    this.player.y = newY;
                }
            }
        });
    }

    handleGamepad() {
        const gamepads = navigator.getGamepads();
        if (!gamepads) return;
        const gp = gamepads[0];
        if (gp) {
            const ax = gp.axes[0], ay = gp.axes[1];
            if (ax < -0.5) this.tryMove(-1, 0);
            if (ax >  0.5) this.tryMove(1, 0);
            if (ay < -0.5) this.tryMove(0, -1);
            if (ay >  0.5) this.tryMove(0, 1);
        }
    }
    tryMove(dx, dy) {
        const newX = this.player.x + dx;
        const newY = this.player.y + dy;
        if (this.map.getTile(newX, newY) !== 2) {
            this.player.x = newX;
            this.player.y = newY;
        }
    }

    loop() {
        this.handleGamepad();
        // Обновляем поле зрения и удаляем дальние чанки
        this.map.computeFOV(this.player.x, this.player.y);
        this.map.cleanup(this.player.x, this.player.y);
        this.draw();
        requestAnimationFrame(this.loop);
    }

    draw() {
        // Очищаем экран
        this.ctx.fillStyle = 'black';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Вычисляем видимую область вокруг игрока
        const halfW = Math.floor(this.canvas.width / 2 / TILE_SIZE);
        const halfH = Math.floor(this.canvas.height / 2 / TILE_SIZE);
        const startX = this.player.x - halfW;
        const startY = this.player.y - halfH;
        const cols = Math.ceil(this.canvas.width / TILE_SIZE);
        const rows = Math.ceil(this.canvas.height / TILE_SIZE);

        for (let ix = 0; ix <= cols; ix++) {
            for (let iy = 0; iy <= rows; iy++) {
                const wx = startX + ix;
                const wy = startY + iy;
                const tile = this.map.getTile(wx, wy);
                let color = 'black';
                const key = `${wx},${wy}`;
                const isVisible = this.map.visible.has(key);
                const isSeen    = this.map.seen.has(key);

                if (tile === 1) {  // пол
                    if (isVisible) color = '#b8b8b8';   // светлый (видимый)
                    else if (isSeen) color = '#808080'; // тёмный (когда-то виденный)
                } else if (tile === 2) {  // стена
                    if (isVisible) color = '#444444';   // видимая стена
                    else if (isSeen) color = '#222222';  // память о стене
                }
                this.ctx.fillStyle = color;
                this.ctx.fillRect(ix * TILE_SIZE, iy * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            }
        }
        // Рисуем игрока красным квадратом в центре экрана
        this.ctx.fillStyle = 'red';
        this.ctx.fillRect(halfW * TILE_SIZE, halfH * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
}

window.onload = () => new Game();