/**
 * map.js – Логика генерации карты и вспомогательных функций для тайлов.
 */

// Константы типов тайлов
const WALL = 0;
const FLOOR = 1;

// Размеры чанка (ширина и высота в клетках)
const WIDTH = 64;
const HEIGHT = 64;

// Карта мира, хранящая загруженные чанки (ключ – "cx,cy", значение – 2D массив тайлов)
const worldChunks = new Map();

// Функция генерации пустого чанка, заполненного стенами
function createEmptyChunk(width, height, value=WALL) {
    const chunk = [];
    for (let y = 0; y < height; y++) {
        chunk[y] = new Array(width).fill(value);
    }
    return chunk;
}

// Основная функция генерации чанка по координатам (cx, cy)
function generateChunk(cx, cy) {
    // Инициализируем детерминированный ГСЧ для этого чанка (требуется библиотека seedrandom)
    if (Math.seedrandom) {
        Math.seedrandom(`worldSeed_${cx}_${cy}`);
    }
    const chunk = createEmptyChunk(WIDTH, HEIGHT, WALL);

    // 1. Проходимся случайным образом и выкапываем коридоры (алгоритм "пещеры" или "лабиринта")
    carveCaves(chunk);

    // 2. Пост-обработка: убираем диагональные проходы и расширяем узкие коридоры
    fixDiagonalAndCorridors(chunk);

    // 3. Пост-обработка: убираем тупики (соединяем их с остальным лабиринтом)
    removeDeadEnds(chunk, cx, cy);

    return chunk;
}

// Пример алгоритма создания пещер/лабиринта (случайное блуждание либо DFS)
function carveCaves(chunk) {
    // Для простоты: начнём от центра и будем случайно рыть туннели
    let x = Math.floor(WIDTH/2), y = Math.floor(HEIGHT/2);
    chunk[y][x] = FLOOR;
    for (let i = 0; i < 1000; i++) {  // 1000 шагов случайного блуждания
        const dir = Math.floor(Math.random() * 4);
        let nx = x, ny = y;
        if (dir === 0) nx++;
        if (dir === 1) nx--;
        if (dir === 2) ny++;
        if (dir === 3) ny--;
        // Проверяем границы
        if (nx <= 0 || nx >= WIDTH-1 || ny <= 0 || ny >= HEIGHT-1) {
            // Дошли до границы – не выходим за край, но можно оставить как тупик или пробить выход позже
            x = nx; y = ny;
            continue;
        }
        // Пробиваем стену, если еще не пробито
        if (chunk[ny][nx] === WALL) {
            chunk[ny][nx] = FLOOR;
        }
        // Передвигаемся
        x = nx; y = ny;
    }
}

// Устранение диагональных проходов и расширение узких коридоров
function fixDiagonalAndCorridors(chunk) {
    for (let y = 1; y < HEIGHT; y++) {
        for (let x = 1; x < WIDTH; x++) {
            if (chunk[y][x] === FLOOR) {
                // Если нашли диагональное соприкосновение: сверху слева
                if (chunk[y-1][x-1] === FLOOR && chunk[y-1][x] === WALL && chunk[y][x-1] === WALL) {
                    // Открываем одну из стен (например, сверху)
                    chunk[y-1][x] = FLOOR;
                }
                // Диагональ: сверху справа
                if (chunk[y-1][x+1] !== undefined && chunk[y-1][x+1] === FLOOR && chunk[y-1][x] === WALL && chunk[y][x+1] === WALL) {
                    chunk[y-1][x] = FLOOR;
                }
                // Диагональ: снизу слева
                if (chunk[y+1] !== undefined && chunk[y+1][x-1] === FLOOR && chunk[y][x-1] === WALL && chunk[y+1][x] === WALL) {
                    chunk[y][x-1] = FLOOR;
                }
                // Диагональ: снизу справа
                if (chunk[y+1] !== undefined && chunk[y+1][x+1] === FLOOR && chunk[y][x+1] === WALL && chunk[y+1][x] === WALL) {
                    chunk[y][x+1] = FLOOR;
                }

                // Расширение узких вертикальных коридоров (стены слева и справа)
                if (chunk[y][x-1] === WALL && chunk[y][x+1] === WALL) {
                    // Определяем, является ли (x,y) частью вертикального коридора (сверху или снизу тоже FLOOR)
                    const upFloor = (chunk[y-1] && chunk[y-1][x] === FLOOR);
                    const downFloor = (chunk[y+1] && chunk[y+1][x] === FLOOR);
                    if (upFloor || downFloor) {
                        // Расширяем вправо (убираем правую стену)
                        chunk[y][x+1] = FLOOR;
                    }
                }
                // Расширение узких горизонтальных коридоров (стены сверху и снизу)
                if (chunk[y-1][x] === WALL && chunk[y+1][x] === WALL) {
                    const leftFloor = (chunk[y][x-1] === FLOOR);
                    const rightFloor = (chunk[y][x+1] === FLOOR);
                    if (leftFloor || rightFloor) {
                        // Расширяем вниз
                        chunk[y+1][x] = FLOOR;
                    }
                }
            }
        }
    }
}

// Удаление тупиков путём прорубания выхода к границе
function removeDeadEnds(chunk, cx, cy) {
    for (let y = 1; y < HEIGHT-1; y++) {
        for (let x = 1; x < WIDTH-1; x++) {
            if (chunk[y][x] === FLOOR) {
                let wallCount = 0;
                if (chunk[y-1][x] === WALL) wallCount++;
                if (chunk[y+1][x] === WALL) wallCount++;
                if (chunk[y][x-1] === WALL) wallCount++;
                if (chunk[y][x+1] === WALL) wallCount++;
                if (wallCount >= 3) {
                    // Тупик обнаружен
                    carveExitToBorder(chunk, x, y);
                }
            }
        }
    }
    // После этого в чанке нет тупиков. Можно также пробить крайние стены,
    // если хотим гарантированно иметь выходы наружу, но функция carveExitToBorder уже это делает.
}

// Прокладывает прямой туннель из данной точки (x,y) до границы чанка
function carveExitToBorder(chunk, x, y) {
    // Определяем ближайший край (сверху/снизу или слева/справа)
    const distLeft = x;
    const distRight = WIDTH - 1 - x;
    const distTop = y;
    const distBottom = HEIGHT - 1 - y;
    // Находим минимальное расстояние до края
    const minDist = Math.min(distLeft, distRight, distTop, distBottom);
    if (minDist === Infinity) return;  // если вдруг точка вне диапазона
    // Выбираем направление в сторону ближайшего края и роем туннель
    if (minDist === distLeft) {
        // роем до левого края
        for (let nx = x; nx >= 0; nx--) {
            chunk[y][nx] = FLOOR;
        }
    } else if (minDist === distRight) {
        for (let nx = x; nx < WIDTH; nx++) {
            chunk[y][nx] = FLOOR;
        }
    } else if (minDist === distTop) {
        for (let ny = y; ny >= 0; ny--) {
            chunk[ny][x] = FLOOR;
        }
    } else if (minDist === distBottom) {
        for (let ny = y; ny < HEIGHT; ny++) {
            chunk[ny][x] = FLOOR;
        }
    }
}