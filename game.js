// Настройки размера карты
const CHUNK_SIZE = 16;    // количество тайлов в одном чанке по каждой стороне
const TILE_SIZE  = 10;    // размер тайла в пикселях (для отрисовки)

// Глобальные переменные игры
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

// Объект игрока и начальная позиция
const player = {
    x: 0,   // глобальные координаты игрока по тайлам
    y: 0,
    chunkX: 0,  // координаты текущего чанка (изначально 0,0)
    chunkY: 0
};

// Обработчик ввода (стрелки) для перемещения игрока
window.addEventListener('keydown', (e) => {
    let newX = player.x;
    let newY = player.y;
    if (e.key === 'ArrowUp')    newY = player.y - 1;
    if (e.key === 'ArrowDown')  newY = player.y + 1;
    if (e.key === 'ArrowLeft')  newX = player.x - 1;
    if (e.key === 'ArrowRight') newX = player.x + 1;
    // Проверяем границы перемещения (например, не уходим за допустимые значения, если есть)
    // В данной игре мир генерируется бесконечно, поэтому специальных границ нет.
    // Проверяем проходимость тайла: не стена ли?
    const targetTile = map.getTile(newX, newY);
    if (targetTile.type !== 'wall') {
        // Двигаем игрока на новый тайл
        player.x = newX;
        player.y = newY;
        // Обновляем текущий чанк игрока и генерируем новые чанки при необходимости
        updateChunks();
    }
});

// Функция обновления видимых/загруженных чанков при смене чанка игроком
function updateChunks() {
    // Вычисляем текущие координаты чанка, в котором находится игрок, с учетом отрицательных координат
    const newChunkX = Math.floor(player.x / CHUNK_SIZE);
    const newChunkY = Math.floor(player.y / CHUNK_SIZE);
    if (newChunkX === player.chunkX && newChunkY === player.chunkY) {
        return; // игрок остался в том же чанке, новых генераций не требуется
    }
    // Сохранить старые координаты (не обязательно использовать, но может пригодиться для логов)
    const oldChunkX = player.chunkX;
    const oldChunkY = player.chunkY;
    // Обновить текущий чанк игрока
    player.chunkX = newChunkX;
    player.chunkY = newChunkY;

    // Радиус генерации чанков вокруг игрока (по манхэттеновскому расстоянию от текущего)
    const R = 2;  // например, генерируем 5x5 чанков вокруг (радиус 2)
    
    // Список новых чанков, которые нужно сгенерировать
    const toGenerate = [];
    for (let cx = player.chunkX - R; cx <= player.chunkX + R; cx++) {
        for (let cy = player.chunkY - R; cy <= player.chunkY + R; cy++) {
            const key = `${cx},${cy}`;
            if (!map.chunks[key]) {
                toGenerate.push([cx, cy]);
            }
        }
    }
    // Логируем пакет генерации (для отладки)
    if (toGenerate.length > 0) {
        console.log(`>>> Пакет перегенерации: ${JSON.stringify(toGenerate.map(coord => coord.join(',')))}`);
    }
    // Генерируем все необходимые новые чанки
    toGenerate.forEach(([cx, cy]) => {
        map.generateChunk(cx, cy);
    });

    // Удаляем чанки, которые вышли за пределы радиуса R (чтобы не накапливать лишние данные)
    for (const key in map.chunks) {
        const [cx, cy] = key.split(',').map(Number);
        if (Math.abs(cx - player.chunkX) > R || Math.abs(cy - player.chunkY) > R) {
            map.forgetChunk(cx, cy);
        }
    }

    // Логируем результат после генерации/удаления (для отладки)
    const currentKeys = Object.keys(map.chunks);
    console.log(`>>> После regen, ключи чанков: (${currentKeys.length}) ${JSON.stringify(currentKeys)}`);
}

// Инициализация начальной области вокруг игрока
(function initWorld() {
    const R = 2;
    const initialChunks = [];
    for (let cx = player.chunkX - R; cx <= player.chunkX + R; cx++) {
        for (let cy = player.chunkY - R; cy <= player.chunkY + R; cy++) {
            initialChunks.push(`${cx},${cy}`);
            map.generateChunk(cx, cy);
        }
    }
    console.log(`>>> Пакет перегенерации: ${JSON.stringify(initialChunks)}`);
    const loadedKeys = Object.keys(map.chunks);
    console.log(`>>> После regen, ключи чанков: (${loadedKeys.length}) ${JSON.stringify(loadedKeys)}`);
})();

// Основной игровой цикл (обновление и отрисовка)
function loop() {
    // (Можно добавить обновление состояния монстров, расчёт FOV и др. механики здесь)
    // Очищаем холст
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Отрисовка загруженных чанков (тайлы)
    for (const key in map.chunks) {
        const [cx, cy] = key.split(',').map(Number);
        const chunk = map.chunks[key];
        // Вычисляем смещение чанка на экране относительно игрока
        // Центрируем камеру на игроке (игрок в центре экрана)
        const offsetX = (cx * CHUNK_SIZE - player.x + 0.5) * TILE_SIZE + canvas.width / 2;
        const offsetY = (cy * CHUNK_SIZE - player.y + 0.5) * TILE_SIZE + canvas.height / 2;
        // Рисуем тайлы чанка
        for (let ty = 0; ty < CHUNK_SIZE; ty++) {
            for (let tx = 0; tx < CHUNK_SIZE; tx++) {
                const tile = chunk.tiles[ty][tx];
                // Определяем цвет тайла: пол (floor) – светлый, стена – тёмно-серый
                if (tile.type === 'wall') {
                    ctx.fillStyle = '#555555';
                } else {
                    ctx.fillStyle = '#CCCCCC';
                }
                // Координаты тайла на экране
                const drawX = offsetX + tx * TILE_SIZE - (CHUNK_SIZE * TILE_SIZE) / 2;
                const drawY = offsetY + ty * TILE_SIZE - (CHUNK_SIZE * TILE_SIZE) / 2;
                ctx.fillRect(drawX, drawY, TILE_SIZE, TILE_SIZE);
            }
        }
    }

    // Отрисовка игрока (красный кружок)
    ctx.fillStyle = '#FF0000';
    // Игрок находится в центре своего текущего чанка при расчёте offset выше (0.5 добавлено для центрирования)
    const playerScreenX = canvas.width / 2;
    const playerScreenY = canvas.height / 2;
    ctx.beginPath();
    ctx.arc(playerScreenX, playerScreenY, TILE_SIZE / 2, 0, 2 * Math.PI);
    ctx.fill();

    // Отображение названия текущего региона (чанка) на экране
    const playerChunkKey = `${player.chunkX},${player.chunkY}`;
    if (map.chunks[playerChunkKey] && map.chunks[playerChunkKey].meta.name) {
        const regionName = map.chunks[playerChunkKey].meta.name;
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '16px sans-serif';
        ctx.fillText(regionName, 10, canvas.height - 10);
    }

    requestAnimationFrame(loop);
}

// Запуск игрового цикла
requestAnimationFrame(loop);