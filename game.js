// game.js

// Создаём Canvas
const canvas = document.createElement('canvas');
document.body.style.margin = '0'; canvas.style.display = 'block';
document.body.appendChild(canvas);
const ctx = canvas.getContext('2d');

// Настройки тайлов и карты
const TILE_SIZE = 32;
const map = new GameMap(50);

// Состояние игрока
let playerX = 0, playerY = 0;
let facingX = 0, facingY = -1; // направление взгляда (на старте — вверх)

// Позиция виртуального джойстика
const joystickBase = {x: 100, y: 0, r: 60};
const joystickPos  = {x: 100, y: 0};
let joystickActive = false;

// Обработчики ввода
window.addEventListener('resize', onResize);
onResize();
window.addEventListener('keydown', e => keys[e.key] = true);
window.addEventListener('keyup',   e => keys[e.key] = false);
canvas.addEventListener('touchstart', onTouchStart);
canvas.addEventListener('touchmove',  onTouchMove);
canvas.addEventListener('touchend',   onTouchEnd);

function onResize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    joystickBase.y = canvas.height - 100;
    joystickPos.x = joystickBase.x;
    joystickPos.y = joystickBase.y;
}

const keys = {};
function onTouchStart(e) {
    e.preventDefault();
    const t = e.changedTouches[0];
    const dx = t.clientX - joystickBase.x, dy = t.clientY - joystickBase.y;
    if (Math.hypot(dx,dy) <= joystickBase.r) {
        joystickActive = true;
        joystickPos.x = t.clientX; joystickPos.y = t.clientY;
    }
}
function onTouchMove(e) {
    e.preventDefault();
    if (!joystickActive) return;
    const t = e.changedTouches[0];
    let dx = t.clientX - joystickBase.x, dy = t.clientY - joystickBase.y;
    const mag = Math.hypot(dx,dy);
    if (mag > joystickBase.r) {
        dx = dx/mag * joystickBase.r;
        dy = dy/mag * joystickBase.r;
    }
    joystickPos.x = joystickBase.x + dx;
    joystickPos.y = joystickBase.y + dy;
}
function onTouchEnd(e) {
    e.preventDefault();
    joystickActive = false;
    joystickPos.x = joystickBase.x;
    joystickPos.y = joystickBase.y;
}

// Спавн игрока: в центре первой комнаты чанка (0,0)
function spawnPlayer() {
    const ch = map.getChunk(0,0);
    for (let yy = 0; yy < ch.size; yy++) {
        for (let xx = 0; xx < ch.size; xx++) {
            if (ch.tiles[yy][xx].type === "room") {
                playerX = xx; playerY = yy; return;
            }
        }
    }
    playerX = ch.size/2; playerY = ch.size/2;
}
spawnPlayer();

// Параметры поля зрения
const FOV_RADIUS = 6;
const FOV_ANGLE = Math.PI/3; // 60 градусов

let lastTime = 0;
function gameLoop(time) {
    const dt = (time - lastTime)/1000; lastTime = time;
    update(dt);
    render();
    requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);

function update(dt) {
    let dx=0, dy=0;
    // Клавиши WASD / стрелки
    if (keys['ArrowUp'] || keys['w']||keys['W'])    { dy=-1; facingX=0; facingY=-1; }
    if (keys['ArrowDown']|| keys['s']||keys['S'])  { dy=1;  facingX=0; facingY=1;  }
    if (keys['ArrowLeft']|| keys['a']||keys['A'])  { dx=-1; facingX=-1; facingY=0; }
    if (keys['ArrowRight']|| keys['d']||keys['D']) { dx=1;  facingX=1;  facingY=0; }
    // Виртуальный джойстик
    if (joystickActive) {
        const vx = joystickPos.x - joystickBase.x;
        const vy = joystickPos.y - joystickBase.y;
        const mag = Math.hypot(vx, vy);
        if (mag > 20) {
            if (Math.abs(vx) > Math.abs(vy)) {
                dx = (vx>0?1:-1); dy = 0;
            } else {
                dx = 0; dy = (vy>0?1:-1);
            }
            if (dx!==0 || dy!==0) { facingX=dx; facingY=dy; }
        }
    }
    // Перемещение игрока с проверкой стен
    if (dx!==0 && dy!==0) {
        // Диагональ
        const tileX = map.getTile(playerX+dx, playerY);
        const tileY = map.getTile(playerX, playerY+dy);
        if (tileX && tileX.type!=="wall" && tileY && tileY.type!=="wall") {
            playerX += dx; playerY += dy;
        } else {
            if (tileX && tileX.type!=="wall") playerX += dx;
            else if (tileY && tileY.type!=="wall") playerY += dy;
        }
    } else if (dx!==0 || dy!==0) {
        const tile = map.getTile(playerX+dx, playerY+dy);
        if (tile && tile.type !== "wall") {
            playerX += dx; playerY += dy;
        }
    }
    // Вычисление видимых тайлов (FOV) лучами
    const visible = new Set();
    const angle0 = Math.atan2(facingY, facingX);
    for (let i = 0; i <= 60; i++) {
        const ang = angle0 - FOV_ANGLE/2 + (i/60)*FOV_ANGLE;
        const vx = Math.cos(ang), vy = Math.sin(ang);
        for (let r = 0; r <= FOV_RADIUS; r++) {
            const tx = playerX + Math.round(vx*r);
            const ty = playerY + Math.round(vy*r);
            const tile = map.getTile(tx, ty);
            if (!tile) break;
            visible.add(tx+","+ty);
            if (tile.type === "wall") break;
        }
    }
    // Обновление memoryAlpha: видимые мгновенно 1.0, остальные затухают
    const fadeRate = 0.5;
    for (let yy = playerY - FOV_RADIUS - 2; yy <= playerY + FOV_RADIUS + 2; yy++) {
        for (let xx = playerX - FOV_RADIUS - 2; xx <= playerX + FOV_RADIUS + 2; xx++) {
            const tile = map.getTile(xx, yy);
            if (!tile) continue;
            const key = xx+","+yy;
            if (visible.has(key)) {
                tile.memoryAlpha = 1.0;
            } else {
                tile.memoryAlpha -= fadeRate * dt;
                if (tile.memoryAlpha < 0) tile.memoryAlpha = 0;
            }
        }
    }
}

function render() {
    // Очищаем экран
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Сдвиг камеры: центрируем на игроке
    const offsetX = canvas.width/2 - playerX * TILE_SIZE;
    const offsetY = canvas.height/2 - playerY * TILE_SIZE;
    // Рисуем тайлы вокруг игрока
    const cols = Math.ceil(canvas.width / TILE_SIZE);
    const rows = Math.ceil(canvas.height / TILE_SIZE);
    const startX = Math.floor(playerX - cols/2) - 1;
    const startY = Math.floor(playerY - rows/2) - 1;
    for (let yy = startY; yy < startY + rows + 2; yy++) {
        for (let xx = startX; xx < startX + cols + 2; xx++) {
            const tile = map.getTile(xx, yy);
            if (!tile) continue;
            const alpha = tile.memoryAlpha;
            if (alpha <= 0) continue;
            let color;
            switch(tile.type) {
                case "room":     color = "#3366CC"; break; // синий пол комнаты
                case "corridor": color = "#999999"; break; // светло-серый
                case "door":     color = "#CC9933"; break; // коричневатый-жёлтый
                case "wall":     color = "#444444"; break; // тёмно-серый
                default:         color = "#000000"; break;
            }
            ctx.globalAlpha = alpha;
            ctx.fillStyle = color;
            ctx.fillRect(offsetX + xx*TILE_SIZE, offsetY + yy*TILE_SIZE, TILE_SIZE, TILE_SIZE);
            ctx.globalAlpha = 1.0;
        }
    }
    // Рисуем игрока как красный квадрат
    ctx.fillStyle = "#FF0000";
    ctx.fillRect(canvas.width/2, canvas.height/2, TILE_SIZE, TILE_SIZE);
    // Рисуем виртуальный джойстик
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#555555";
    ctx.beginPath();
    ctx.arc(joystickBase.x, joystickBase.y, joystickBase.r, 0, 2*Math.PI);
    ctx.fill();
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = "#AAAAAA";
    ctx.beginPath();
    ctx.arc(joystickPos.x, joystickPos.y, 30, 0, 2*Math.PI);
    ctx.fill();
    ctx.restore();
}