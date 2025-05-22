// generators/communal.js

class RNG {
    constructor(seed) {
        this.seed = seed >>> 0;
    }
    next() {
        // Простая функция Mulberry32 для генерации случайных чисел [0,1)
        this.seed = (this.seed + 0x6D2B79F5) | 0;
        var t = this.seed;
        t = (t ^ (t >>> 15)) * (1 | t);
        t = t ^ (t + ((t ^ (t >>> 7)) * (61 | t)));
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    nextInt(min, max) {
        // Случайное целое между min и max включительно
        return Math.floor(this.next() * (max - min + 1)) + min;
    }
}

// Функция генерации одного чанка в стиле "советская коммуналка"
export function generateChunk(chunkX, chunkY) {
    const CHUNK_SIZE = 50;
    // Сидируем RNG на основе координат чанка (повторяемость генерации [oai_citation:3‡gamedev.stackexchange.com](https://gamedev.stackexchange.com/questions/67933/in-a-semi-infinite-procedural-chunk-based-map-how-do-you-handle-objects-large#:~:text=It%27s%20very%20common%20for%20one%2C,same%20for%20the%20same%20seed))
    const baseSeed = 123456;
    let rng = new RNG(baseSeed + chunkX * 10007 + chunkY * 10009);

    while (true) {
        let valid = true;
        // Шаг 1: случайно выбираем количество комнат (4-8)
        const roomCount = rng.nextInt(4, 8);
        const rooms = [];
        // Пытаемся разместить каждую комнату
        for (let i = 0; i < roomCount; i++) {
            let placed = false;
            for (let attempt = 0; attempt < 100; attempt++) {
                const w = rng.nextInt(4, 8);
                const h = rng.nextInt(4, 8);
                const x = rng.nextInt(1, CHUNK_SIZE - w - 2);
                const y = rng.nextInt(1, CHUNK_SIZE - h - 2);
                // Проверяем перекрытие (с запасом 1 клетка вокруг)
                let overlap = false;
                for (const [rx, ry, rw, rh] of rooms) {
                    if (x < rx + rw + 1 && x + w + 1 > rx &&
                        y < ry + rh + 1 && y + h + 1 > ry) {
                        overlap = true;
                        break;
                    }
                }
                if (!overlap) {
                    rooms.push([x, y, w, h]);
                    placed = true;
                    break;
                }
            }
            if (!placed) { valid = false; break; }
        }
        if (!valid) continue;

        // Шаг 2: соединяем комнаты коридорами. Сначала создаём остовное дерево, затем добавляем ребра
        const n = rooms.length;
        const edges = [];
        const degree = Array(n).fill(0);
        // Минимальное остовное дерево (спanning tree): связать i-й с случайным j < i
        for (let i = 1; i < n; i++) {
            const j = rng.nextInt(0, i - 1);
            edges.push([j, i]);
            degree[j]++; degree[i]++;
        }
        // Добавляем ребра, чтобы степень каждой комнаты (количество дверей) была хотя бы 2 (и максимум 3)
        for (let i = 0; i < n; i++) {
            while (degree[i] < 2) {
                // ищем кандидатов для соединения с i
                const candidates = [];
                for (let j = 0; j < n; j++) {
                    if (j !== i && degree[j] < 3 &&
                        !edges.some(e => (e[0] === i && e[1] === j) || (e[0] === j && e[1] === i))) {
                        candidates.push(j);
                    }
                }
                if (candidates.length === 0) break;
                const j = candidates[rng.nextInt(0, candidates.length - 1)];
                edges.push([i, j]);
                degree[i]++; degree[j]++;
            }
            if (degree[i] > 3) { valid = false; break; }
        }
        if (!valid) continue;

        // Шаг 3: создаём сетку чанка, заполняем стены (2) по умолчанию
        const grid = Array.from({ length: CHUNK_SIZE }, () => Array(CHUNK_SIZE).fill(2));
        const isRoomFloor = Array.from({ length: CHUNK_SIZE }, () => Array(CHUNK_SIZE).fill(false));
        // Прорезаем пол внутри каждой комнаты (кроме стен)
        for (const [rx, ry, rw, rh] of rooms) {
            for (let i = 1; i < rw - 1; i++) {
                for (let j = 1; j < rh - 1; j++) {
                    grid[ry + j][rx + i] = 1;  // 1 = пол
                    isRoomFloor[ry + j][rx + i] = true;
                }
            }
        }

        // Шаг 4: для каждого ребра строим дверь в комнате и коридор
        const sideCount = Array.from({ length: n }, () => [0,0,0,0]); // счетчик дверей по сторонам: [N, S, W, E]
        const doors = [];
        for (const [a, b] of edges) {
            const [ax, ay, aw, ah] = rooms[a];
            const [bx, by, bw, bh] = rooms[b];
            // Выбираем стороны для дверей по направлению друг к другу
            const acx = ax + aw/2, acy = ay + ah/2;
            const bcx = bx + bw/2, bcy = by + bh/2;
            const dx = bcx - acx, dy = bcy - acy;
            let sideA, sideB;
            if (Math.abs(dx) > Math.abs(dy)) {
                if (dx > 0) { sideA = 3; sideB = 2; } else { sideA = 2; sideB = 3; }
            } else {
                if (dy > 0) { sideA = 1; sideB = 0; } else { sideA = 0; sideB = 1; }
            }
            // Проверяем, не превышает ли уже 2 двери на каждую сторону
            if (sideCount[a][sideA] >= 2 || sideCount[b][sideB] >= 2) { valid = false; break; }
            sideCount[a][sideA]++; sideCount[b][sideB]++;
            // Генерация координат самой двери (2 соседние клетки) по выбранной стороне
            const pickDoor = (rx, ry, rw, rh, side) => {
                if (side === 0) { // North side
                    const x1 = rng.nextInt(rx, rx + rw - 2);
                    return [[x1, ry], [x1 + 1, ry]];
                } else if (side === 1) { // South
                    const x1 = rng.nextInt(rx, rx + rw - 2);
                    return [[x1, ry + rh - 1], [x1 + 1, ry + rh - 1]];
                } else if (side === 2) { // West
                    const y1 = rng.nextInt(ry, ry + rh - 2);
                    return [[rx, y1], [rx, y1 + 1]];
                } else if (side === 3) { // East
                    const y1 = rng.nextInt(ry, ry + rh - 2);
                    return [[rx + rw - 1, y1], [rx + rw - 1, y1 + 1]];
                }
            };
            const doorA = pickDoor(ax, ay, aw, ah, sideA);
            const doorB = pickDoor(bx, by, bw, bh, sideB);
            doors.push({doorA, doorB});
        }
        if (!valid) continue;
        // Прорезаем двери в стенах комнат (делаем эти клетки полом)
        for (const {doorA, doorB} of doors) {
            for (const [dx, dy] of doorA) grid[dy][dx] = 1;
            for (const [dx, dy] of doorB) grid[dy][dx] = 1;
        }

        // Шаг 5: прокладываем коридоры L-образно (горизонтально, затем вертикально)
        for (const {doorA, doorB} of doors) {
            const [sx, sy] = doorA[0];
            const [ex, ey] = doorB[0];
            const corridorCells = [];
            // Горизонтальный сегмент
            const stepX = (ex > sx) ? 1 : -1;
            for (let x = sx; x !== ex + stepX; x += stepX) {
                grid[sy][x] = 1;
                grid[sy + 1][x] = 1;  // ширина коридора = 2 по вертикали
                corridorCells.push([x, sy], [x, sy + 1]);
            }
            // Вертикальный сегмент
            const stepY = (ey > sy) ? 1 : -1;
            for (let y = sy; y !== ey + stepY; y += stepY) {
                grid[y][ex] = 1;
                grid[y][ex + 1] = 1;  // ширина коридора = 2 по горизонтали
                corridorCells.push([ex, y], [ex + 1, y]);
            }
            // Проверяем правило: коридор не касается стен комнат, кроме входов
            for (const [cx, cy] of corridorCells) {
                const isDoorCell =
                    doorA.some(([dx, dy]) => dx === cx && dy === cy) ||
                    doorB.some(([dx, dy]) => dx === cx && dy === cy);
                if (isDoorCell) continue;
                // Любая соседняя (4-направленная) клетка не должна быть полом комнаты
                const neighbors = [[cx-1, cy], [cx+1, cy], [cx, cy-1], [cx, cy+1]];
                for (const [nx, ny] of neighbors) {
                    if (nx >= 0 && nx < CHUNK_SIZE && ny >= 0 && ny < CHUNK_SIZE) {
                        if (isRoomFloor[ny][nx]) { valid = false; break; }
                    }
                }
                if (!valid) break;
            }
            if (!valid) break;
        }
        if (!valid) continue;

        // Если все проверки пройдены, возвращаем сгенерированный чанк (2D-массив)
        // 1 = пол, 2 = стена.
        return grid;
    }
}