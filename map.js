// map.js

import { generateChunk } from './generators/communal.js';

const CHUNK_SIZE = 50;

export class GameMap {
    constructor(chunkSize = CHUNK_SIZE) {
        this.chunkSize  = chunkSize;
        this.chunks     = new Map();      // key "cx,cy" -> {tiles, meta}
        this.generating = new Set();      // защита от двойного вызова
        this.visible = new Set();         // клетки в текущем поле зрения
        this.seen    = new Set();         // клетки, которые когда-либо видели
    }

    _chunkKey(cx, cy) {
        return `${cx},${cy}`;
    }

    ensureChunk(cx, cy) {
        const key = this._chunkKey(cx, cy);
        if (this.chunks.has(key) || this.generating.has(key)) return;
        this.generating.add(key);

        const tiles = generateChunk(cx, cy);
        const S = this.chunkSize;
        const meta = Array.from({ length: S }, () =>
            Array.from({ length: S }, () => ({ memoryAlpha: 0 }))
        );

        this.chunks.set(key, { tiles, meta });
        this.generating.delete(key);
    }

    getChunk(cx, cy) {
        const key = this._chunkKey(cx, cy);
        if (!this.chunks.has(key)) this.ensureChunk(cx, cy);
        return this.chunks.get(key);
    }

    getTile(x, y) {
        const cx = Math.floor(x / this.chunkSize);
        const cy = Math.floor(y / this.chunkSize);
        const chunk = this.getChunk(cx, cy);
        const localX = x - cx * this.chunkSize;
        const localY = y - cy * this.chunkSize;
        if (localX < 0 || localX >= this.chunkSize || localY < 0 || localY >= this.chunkSize) {
            return 2;
        }
        return chunk.tiles[localY][localX];
    }

    isFloor(x, y) {
        return this.getTile(x, y) === 1;
    }
    // Алгоритм Брезенхэма для получения промежуточных точек между (x0,y0) и (x1,y1).
    line(x0, y0, x1, y1) {
        const points = [];
        let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
        let sx = (x0 < x1) ? 1 : -1;
        let sy = (y0 < y1) ? 1 : -1;
        let err = dx - dy;
        let x = x0, y = y0;
        while (true) {
            points.push([x, y]);
            if (x === x1 && y === y1) break;
            let e2 = err * 2;
            if (e2 > -dy) { err -= dy; x += sx; }
            if (e2 < dx) { err += dx; y += sy; }
        }
        return points;
    }
    computeFOV(px, py, radius = 10) {
        // Пересчитываем поле зрения (сброс видимых)
        this.visible.clear();
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                if (dx*dx + dy*dy > radius*radius) continue;
                const tx = px + dx, ty = py + dy;
                const linePoints = this.line(px, py, tx, ty);
                let blocked = false;
                for (let i = 1; i < linePoints.length; i++) {
                    const [lx, ly] = linePoints[i];
                    const [plx, ply] = linePoints[i-1];
                    // Проверка диагонального заслона: если оба смежных тайла по горизонтали и вертикали - стены
                    if (lx !== plx && ly !== ply) {
                        if (this.getTile(plx + (lx - plx), ply) === 2 &&
                            this.getTile(plx, ply + (ly - ply)) === 2) {
                            blocked = true;
                        }
                    }
                    const tile = this.getTile(lx, ly);
                    if (tile === 2) {
                        blocked = true;
                    }
                    if (blocked) break;
                    this.visible.add(`${lx},${ly}`);
                    this.seen.add(`${lx},${ly}`);
                }
                if (!blocked) {
                    // сам игрок всегда видит свою клетку
                    this.visible.add(`${px},${py}`);
                    this.seen.add(`${px},${py}`);
                }
            }
        }
    }
    cleanup(px, py, range = 2) {
        // Удаляем чанки, удалённые дальше, чем range чанков
        const pcx = Math.floor(px / CHUNK_SIZE);
        const pcy = Math.floor(py / CHUNK_SIZE);
        for (const key of Array.from(this.chunks.keys())) {
            const [cx, cy] = key.split(',').map(Number);
            if (Math.abs(cx - pcx) > range || Math.abs(cy - pcy) > range) {
                this.chunks.delete(key);
            }
        }
    }

    regenerateChunksPreserveFOV(keys, computeFOV, player) {
        const vis = computeFOV(player.x, player.y);

        for (const key of keys) {
            const [cx, cy] = key.split(',').map(Number);
            const oldC = this.chunks.get(key);
            if (!oldC) continue;

            const stash = [];
            const baseX = cx * this.chunkSize,
                  baseY = cy * this.chunkSize;
            for (let y = 0; y < this.chunkSize; y++) {
                for (let x = 0; x < this.chunkSize; x++) {
                    const coord = `${baseX + x},${baseY + y}`;
                    const m = oldC.meta[y][x];
                    if (vis.has(coord) || m.memoryAlpha > 0) {
                        stash.push({ x, y, t: oldC.tiles[y][x], m: { ...m } });
                    }
                }
            }

            this.chunks.delete(key);
            this.ensureChunk(cx, cy);
            const fresh = this.chunks.get(key);
            for (const s of stash) {
                fresh.tiles[s.y][s.x] = s.t;
                fresh.meta[s.y][s.x]  = s.m;
            }
        }
    }
}

