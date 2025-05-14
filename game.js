/**
 * game.js – Основная логика игры: управление игроком, загрузка/выгрузка чанков, рендеринг.
 */

// Глобальные параметры
const CHUNK_SIZE = 64;  // размер чанка должен совпадать с WIDTH, HEIGHT из map.js
const renderDistance = 1;  // радиус чанков вокруг игрока, которые держим загруженными

// Координаты игрока и текущий чанк
let player = { x: 0, y: 0, chunkX: 0, chunkY: 0 };

// Инициализация начального чанка
ensureChunkLoaded(0, 0);
player.chunkX = 0;
player.chunkY = 0;
player.x = Math.floor(CHUNK_SIZE/2);
player.y = Math.floor(CHUNK_SIZE/2);
// Помещаем игрока в центр стартового чанка (можно добавить проверку, что там FLOOR)

// Функция загрузки чанка (вызывает generateChunk из map.js и соединяет с соседями)
function ensureChunkLoaded(cx, cy) {
    const key = `${cx},${cy}`;
    if (!worldChunks.has(key)) {
        const chunkData = generateChunk(cx, cy);
        worldChunks.set(key, chunkData);
        // Соединяем с уже загруженными соседями:
        connectNeighborChunks(cx, cy);
    }
}

// Соединяет границы чанка (cx,cy) с соседними чанками, если они существуют
function connectNeighborChunks(cx, cy) {
    const chunk = worldChunks.get(`${cx},${cy}`);
    // Сосед слева
    if (worldChunks.has(`${cx-1},${cy}`)) {
        const leftChunk = worldChunks.get(`${cx-1},${cy}`);
        for (let y = 1; y < CHUNK_SIZE-1; y++) {
            // Если в левом чанке на правой границе есть проход, открыть левую границу текущего
            if (leftChunk[y][CHUNK_SIZE-1] === FLOOR) {
                chunk[y][0] = FLOOR;
            }
            // Если в текущем есть проход на левой границе, открыть правую границу левого
            if (chunk[y][0] === FLOOR) {
                leftChunk[y][CHUNK_SIZE-1] = FLOOR;
            }
        }
    }
    // Сосед справа
    if (worldChunks.has(`${cx+1},${cy}`)) {
        const rightChunk = worldChunks.get(`${cx+1},${cy}`);
        for (let y = 1; y < CHUNK_SIZE-1; y++) {
            if (rightChunk[y][0] === FLOOR) {
                chunk[y][CHUNK_SIZE-1] = FLOOR;
            }
            if (chunk[y][CHUNK_SIZE-1] === FLOOR) {
                rightChunk[y][0] = FLOOR;
            }
        }
    }
    // Сосед сверху
    if (worldChunks.has(`${cx},${cy-1}`)) {
        const topChunk = worldChunks.get(`${cx},${cy-1}`);
        for (let x = 1; x < CHUNK_SIZE-1; x++) {
            if (topChunk[CHUNK_SIZE-1][x] === FLOOR) {
                chunk[0][x] = FLOOR;
            }
            if (chunk[0][x] === FLOOR) {
                topChunk[CHUNK_SIZE-1][x] = FLOOR;
            }
        }
    }
    // Сосед снизу
    if (worldChunks.has(`${cx},${cy+1}`)) {
        const bottomChunk = worldChunks.get(`${cx},${cy+1}`);
        for (let x = 1; x < CHUNK_SIZE-1; x++) {
            if (bottomChunk[0][x] === FLOOR) {
                chunk[CHUNK_SIZE-1][x] = FLOOR;
            }
            if (chunk[CHUNK_SIZE-1][x] === FLOOR) {
                bottomChunk[0][x] = FLOOR;
            }
        }
    }
}

// Обновление позиции игрока (вызывается при вводе или физическом перемещении)
function movePlayer(dx, dy) {
    const newX = player.x + dx;
    const newY = player.y + dy;
    // Проверка границ текущего чанка: позволяем выйти, если там есть проход в соседний
    if (newX < 0) {
        // переход в левый чанк
        player.chunkX -= 1;
        player.x = CHUNK_SIZE - 1;  // появляемся на правой стороне соседнего чанка
    } else if (newX >= CHUNK_SIZE) {
        // переход в правый чанк
        player.chunkX += 1;
        player.x = 0;
    } else {
        player.x = newX;
    }
    if (newY < 0) {
        // переход в верхний чанк
        player.chunkY -= 1;
        player.y = CHUNK_SIZE - 1;
    } else if (newY >= CHUNK_SIZE) {
        // переход в нижний чанк
        player.chunkY += 1;
        player.y = 0;
    } else {
        player.y = newY;
    }

    // Загружаем текущий чанк (вдруг новый)
    ensureChunkLoaded(player.chunkX, player.chunkY);

    // Проверяем соседние чанки в радиусе renderDistance и загружаем их
    for (let cx = player.chunkX - renderDistance; cx <= player.chunkX + renderDistance; cx++) {
        for (let cy = player.chunkY - renderDistance; cy <= player.chunkY + renderDistance; cy++) {
            ensureChunkLoaded(cx, cy);
        }
    }

    // Забываем чанки, которые вне радиуса renderDistance
    forgetDistantChunks(player.chunkX, player.chunkY);

    // После этого можно обновить отображение: отрисовать текущий видимый участок.
    renderVisibleArea();
}

// Функция забывания (выгрузки) далёких чанков, чтобы освободить память
function forgetDistantChunks(centerCx, centerCy) {
    for (let key of worldChunks.keys()) {
        const [cx, cy] = key.split(',').map(Number);
        if (Math.abs(cx - centerCx) > renderDistance || Math.abs(cy - centerCy) > renderDistance) {
            // Удаляем данные чанка
            worldChunks.delete(key);
            // Дополнительно можно удалить связанные объекты, врагов, или сохранить прогресс вpersistent-хранилище если нужно
        }
    }
}

// Рендеринг видимой области (с учётом поля зрения игрока)
function renderVisibleArea() {
    // Размер поля зрения (например, радиус 10 клеток)
    const FOV = 10;
    const visibleTiles = [];
    // Собираем тайлы из ближайших чанков вокруг игрока в радиусе FOV
    for (let dy = -FOV; dy <= FOV; dy++) {
        for (let dx = -FOV; dx <= FOV; dx++) {
            const tx = player.x + dx;
            const ty = player.y + dy;
            const chunkX = player.chunkX + Math.floor(tx / CHUNK_SIZE);
            const chunkY = player.chunkY + Math.floor(ty / CHUNK_SIZE);
            const localX = (tx % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
            const localY = (ty % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
            ensureChunkLoaded(chunkX, chunkY);
            const tile = worldChunks.get(`${chunkX},${chunkY}`)[localY][localX];
            if (tile === FLOOR) {
                visibleTiles.push({x: player.chunkX*CHUNK_SIZE+tx, y: player.chunkY*CHUNK_SIZE+ty});
            }
        }
    }
    // ... код отрисовки visibleTiles на экран ...
}