// map.js

import { generateChunk } from './generators/communal.js';

const CHUNK_SIZE = 50;

export class GameMap {
    constructor() {
        this.chunks = new Map();      // словарь чанков: ключ "cx,cy" -> 2D-массив тайлов
        this.visible = new Set();     // множество видимых клеток "x,y" (сейчас в поле зрения)
        this.seen = new Set();        // множество когда-либо виденных клеток "x,y"
    }
    _chunkKey(cx, cy) {
        return `${cx},${cy}`;
    }
    getChunk(cx, cy) {
        // Возвращает чанк по координатам (сгенерировав его, если нужно)
        const key = this._chunkKey(cx, cy);
        if (!this.chunks.has(key)) {
            this.chunks.set(key, generateChunk(cx, cy));
        }
        return this.chunks.get(key);
    }
    getTile(x, y) {
        // Глобальные координаты -> локальные в чанке
        const cx = Math.floor(x / CHUNK_SIZE);
        const cy = Math.floor(y / CHUNK_SIZE);
        const chunk = this.getChunk(cx, cy);
        const localX = x - cx * CHUNK_SIZE;
        const localY = y - cy * CHUNK_SIZE;
        // Если вышли за пределы (маловероятно), считаем стеной
        if (localX < 0 || localX >= CHUNK_SIZE || localY < 0 || localY >= CHUNK_SIZE) {
            return 2;
        }
        return chunk[localY][localX];
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
}