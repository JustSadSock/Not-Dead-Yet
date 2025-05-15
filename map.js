// Объект для работы с картой и генерацией чанков
const map = {
    chunks: {},  // хранение сгенерированных чанков: ключи в формате "x,y"

    // Генерация чанка по координатам (cx, cy)
    generateChunk(cx, cy) {
        const key = `${cx},${cy}`;
        // Если чанк уже сгенерирован и сохранён, возвращаем его (не генерируем повторно)
        if (this.chunks[key]) {
            return this.chunks[key];
        }
        // Инициализируем структуру нового чанка
        const newChunk = {
            meta: {},   // метаданные чанка (например, название региона)
            tiles: []   // двумерный массив тайлов [CHUNK_SIZE x CHUNK_SIZE]
        };

        // Простейшая процедура для получения псевдослучайного но детерминированного числа из координат чанка
        function pseudoRand(x, y) {
            // Линейная конгруэнция на основе координат (для постоянства генерации при одних и тех же координатах)
            return Math.abs((x * 16807 + y * 9301) % 2147483647);
        }

        // Задаём имя региона (для демонстрации, на основе координат)
        const terrainNames = [
            'Морское побережье', 'Дремучий лес', 'Заброшенные шахты',
            'Тёмная пещера', 'Горное плато', 'Туманное болото',
            'Руины крепости', 'Затопленные земли', 'Холмистая равнина'
        ];
        const nameIndex = pseudoRand(cx, cy) % terrainNames.length;
        newChunk.meta.name = terrainNames[nameIndex];

        // Генерация тайлов чанка
        for (let ty = 0; ty < CHUNK_SIZE; ty++) {
            newChunk.tiles[ty] = [];
            for (let tx = 0; tx < CHUNK_SIZE; tx++) {
                let tileType = 'floor';  // тип тайла по умолчанию – пол
                // Логика размещения стен:
                //   - Границы чанка оставляем открытыми (без стен) для соединения с соседними областями
                //   - Внутри чанка случайным образом размещаем несколько стен, ограничивая их плотность
                if (
                    tx !== 0 && ty !== 0 && tx !== CHUNK_SIZE - 1 && ty !== CHUNK_SIZE - 1
                    // ^ исключаем клетки на границе чанка
                ) {
                    // Плотность стен: например, ~15% вероятности на каждый внутренний тайл
                    const wallChance = 0.15;
                    // Используем детерминированный рандом, чтобы при повторной генерации чанка результат был тот же
                    const randVal = pseudoRand(cx * CHUNK_SIZE + tx, cy * CHUNK_SIZE + ty) % 1000 / 1000;
                    if (randVal < wallChance) {
                        tileType = 'wall';
                    }
                }
                newChunk.tiles[ty][tx] = { type: tileType, meta: {} };
            }
        }

        // Сохраняем сгенерированный чанк
        this.chunks[key] = newChunk;
        return newChunk;
    },

    // Функция удаления (забывания) чанка из памяти
    forgetChunk(cx, cy) {
        const key = `${cx},${cy}`;
        // Можно дополнительно сохранять изменения или состояние чанка перед удалением, если требуется
        delete this.chunks[key];
    },

    // Получение тайла по глобальным координатам (с автоматической генерацией чанка при необходимости)
    getTile(globalX, globalY) {
        const cx = Math.floor(globalX / CHUNK_SIZE);
        const cy = Math.floor(globalY / CHUNK_SIZE);
        const chunkKey = `${cx},${cy}`;
        // Если нужный чанк не сгенерирован – генерируем его на лету
        if (!this.chunks[chunkKey]) {
            this.generateChunk(cx, cy);
        }
        const chunk = this.chunks[chunkKey];
        // Рассчитываем локальные координаты тайла внутри чанка
        // Используем математические операции, корректно работающие с отрицательными числами
        const localX = ((globalX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const localY = ((globalY % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        return chunk.tiles[localY][localX];
    }
};