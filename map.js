// map.js

class Tile {
    constructor(type) {
        this.type = type;       // "room", "corridor", "door", "wall"
        this.memoryAlpha = 0.0; // для памяти/затухания видимости
    }
}

class Chunk {
    constructor(cx, cy, size) {
        this.cx = cx; this.cy = cy; this.size = size;
        this.tiles = [];
        // Инициализировать чанк стенами
        for (let y = 0; y < size; y++) {
            this.tiles[y] = [];
            for (let x = 0; x < size; x++) {
                this.tiles[y][x] = new Tile("wall");
            }
        }
        this.generate();
    }
    generate() {
        // Генерируем случайное количество комнат в чанке
        const roomCount = randInt(3, 8);
        const rooms = [];
        let attempts = 0;
        while (rooms.length < roomCount && attempts < roomCount*5) {
            attempts++;
            const w = randInt(4, 8);
            const h = randInt(4, 8);
            // Сдвигаем так, чтобы был 1-пиксельный бортик для стен
            const x = randInt(1, this.size - w - 1);
            const y = randInt(1, this.size - h - 1);
            // Проверка на пересечение с уже помещёнными комнатами
            let overlap = false;
            for (const other of rooms) {
                if (x < other.x + other.w &&
                    x + w > other.x &&
                    y < other.y + other.h &&
                    y + h > other.y) {
                    overlap = true; break;
                }
            }
            if (overlap) continue;
            // Резервируем место под комнату, вырезая внутреннюю область
            for (let yy = y+1; yy < y + h - 1; yy++) {
                for (let xx = x+1; xx < x + w - 1; xx++) {
                    this.tiles[yy][xx].type = "room";
                }
            }
            rooms.push({x: x, y: y, w: w, h: h, doors: []});
        }
        // Добавляем двери в комнаты (по 1-3 выхода)
        for (const room of rooms) {
            const exits = randInt(1, 3);
            const wall = randInt(0, 3); // 0=левая,1=правая,2=верх,3=низ
            if (wall == 0 || wall == 1) {
                // Вертикальная стена (левая/правая): варьируем y
                const minY = room.y + 1;
                const maxY = room.y + room.h - 2;
                if (minY <= maxY) {
                    const startY = randInt(minY, maxY);
                    for (let i = 0; i < exits; i++) {
                        let doorY = startY + i;
                        if (doorY > maxY) doorY = maxY;
                        if (i>0 && doorY - startY > 2) break;
                        let doorX = (wall==0 ? room.x : room.x + room.w - 1);
                        room.doors.push({x: doorX, y: doorY});
                    }
                }
            } else {
                // Горизонтальная стена (верх/низ): варьируем x
                const minX = room.x + 1;
                const maxX = room.x + room.w - 2;
                if (minX <= maxX) {
                    const startX = randInt(minX, maxX);
                    for (let i = 0; i < exits; i++) {
                        let doorX = startX + i;
                        if (doorX > maxX) doorX = maxX;
                        if (i>0 && doorX - startX > 2) break;
                        let doorY = (wall==2 ? room.y : room.y + room.h - 1);
                        room.doors.push({x: doorX, y: doorY});
                    }
                }
            }
        }
        // Прокладываем коридоры из каждой двери
        for (const room of rooms) {
            for (const door of room.doors) {
                // Определяем направление коридора по положению двери
                let dir;
                if (door.x == room.x) dir = 'left';
                else if (door.x == room.x + room.w - 1) dir = 'right';
                else if (door.y == room.y) dir = 'up';
                else dir = 'down';
                // Параметры коридора
                const cwidth = randInt(2, 3);
                const length = randInt(3, 25);
                // Начальная точка коридора (первый тайл после двери)
                let cx = door.x, cy = door.y;
                if (dir == 'left')  cx = door.x - 1;
                if (dir == 'right') cx = door.x + 1;
                if (dir == 'up')    cy = door.y - 1;
                if (dir == 'down')  cy = door.y + 1;
                // Копируем коридор до заданной длины или пока не выходит за чанк
                for (let t = 0; t < length; t++) {
                    if (cx < 0 || cx >= this.size || cy < 0 || cy >= this.size) break;
                    if (dir == 'left' || dir == 'right') {
                        // Горизонтальный коридор, меняются x
                        for (let wy = 0; wy < cwidth; wy++) {
                            let ty = cy + wy - Math.floor(cwidth/2);
                            if (ty >= 0 && ty < this.size) {
                                this.tiles[ty][cx].type = "corridor";
                            }
                        }
                        cx += (dir=='right' ? 1 : -1);
                    } else {
                        // Вертикальный коридор, меняются y
                        for (let wx = 0; wx < cwidth; wx++) {
                            let tx = cx + wx - Math.floor(cwidth/2);
                            if (tx >= 0 && tx < this.size) {
                                this.tiles[cy][tx].type = "corridor";
                            }
                        }
                        cy += (dir=='down' ? 1 : -1);
                    }
                }
                // Помечаем саму дверь в стене как проход
                if (door.x >= 0 && door.x < this.size && door.y >= 0 && door.y < this.size) {
                    this.tiles[door.y][door.x].type = "door";
                }
            }
        }
    }
    // Получить плитку по локальным координатам чанка
    getTile(lx, ly) {
        if (lx < 0 || lx >= this.size || ly < 0 || ly >= this.size) return null;
        return this.tiles[ly][lx];
    }
}

class GameMap {
    constructor(chunkSize=50) {
        this.chunkSize = chunkSize;
        this.chunks = {}; // словарь чанков по ключу "cx_cy"
    }
    // Получаем или генерируем чанк по его координате
    getChunk(cx, cy) {
        const key = cx + "_" + cy;
        if (!this.chunks[key]) {
            this.chunks[key] = new Chunk(cx, cy, this.chunkSize);
        }
        return this.chunks[key];
    }
    // Получить плитку по мировым координатам
    getTile(x, y) {
        const cx = Math.floor(x / this.chunkSize);
        const cy = Math.floor(y / this.chunkSize);
        const chunk = this.getChunk(cx, cy);
        const lx = x - cx * this.chunkSize;
        const ly = y - cy * this.chunkSize;
        return chunk.getTile(lx, ly);
    }
}

// Вспомогательная функция случайного целого
function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}