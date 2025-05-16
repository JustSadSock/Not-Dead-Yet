// map.js

/**
 * GameMap — чанковая карта с комнатами и коридорами.
 */
class GameMap {
  constructor() {
    // Размер одного чанка (в тайлах)
    this.chunkSize   = 33;

    // Храним чанки: Map<"cx,cy", {tiles: string[][], meta: {memoryAlpha, visited}[][]}>
    this.chunks      = new Map();

    // Чтобы не генерировать один и тот же чанк дважды параллельно
    this.generating  = new Set();
  }

  /**
   * Убедиться, что чанк (cx,cy) есть в this.chunks.
   * Если нет — сгенерировать сразу tiles и meta.
   */
  ensureChunk(cx, cy) {
    const key = `${cx},${cy}`;
    if (this.chunks.has(key) || this.generating.has(key)) return;
    this.generating.add(key);

    // 1) Генерируем сетку тайлов (типы "room", "hall", "door", "wall")
    const tiles = this._generateChunk(cx, cy);

    // 2) Создаём meta-массив с memoryAlpha=0, visited=false
    const meta = Array.from({ length: this.chunkSize }, () =>
      Array.from({ length: this.chunkSize }, () => ({
        memoryAlpha: 0,
        visited:     false
      }))
    );

    // 3) Сохраняем чанк
    this.chunks.set(key, { tiles, meta });
    this.generating.delete(key);
  }

  /**
   * Проверка, можно ли ходить по глобальным координатам (gx,gy).
   * Возвращает true, если внутри чанка и тип тайла != 'wall'.
   */
  isFloor(gx, gy) {
    const cx = Math.floor(gx / this.chunkSize);
    const cy = Math.floor(gy / this.chunkSize);
    const key = `${cx},${cy}`;
    const chunk = this.chunks.get(key);
    if (!chunk) return false;
    const lx = gx - cx * this.chunkSize;
    const ly = gy - cy * this.chunkSize;
    if (lx < 0 || ly < 0 || lx >= this.chunkSize || ly >= this.chunkSize) return false;
    return chunk.tiles[ly][lx] !== 'wall';
  }

  /**
   * Пакетная перегенерация чанков (сохраняем видимое+непотухшее, генерируем заново, заливаем).
   */
  regenerateChunksPreserveFOV(keys, computeFOV, player) {
    // Сначала FOV текущей позиции
    const vis = computeFOV(player.x, player.y, player.angle);

    for (let key of keys) {
      const [cx, cy] = key.split(',').map(Number);
      const oldChunk = this.chunks.get(key);
      if (!oldChunk) continue;

      // 1) Стэшим все "видимые" или ещё не потухшие тайлы
      const stash = [];
      const baseX = cx * this.chunkSize;
      const baseY = cy * this.chunkSize;
      for (let ly = 0; ly < this.chunkSize; ly++) {
        for (let lx = 0; lx < this.chunkSize; lx++) {
          const gx = baseX + lx, gy = baseY + ly;
          const m   = oldChunk.meta[ly][lx];
          const coord = `${gx},${gy}`;
          if (vis.has(coord) || m.memoryAlpha > 0) {
            stash.push({
              lx, ly,
              tile: oldChunk.tiles[ly][lx],
              meta: { memoryAlpha: m.memoryAlpha, visited: m.visited }
            });
          }
        }
      }

      // 2) Удаляем старый чанк
      this.chunks.delete(key);

      // 3) Генерируем заново
      this.ensureChunk(cx, cy);

      // 4) Возвращаем сохранённые квадратики
      const fresh = this.chunks.get(key);
      for (let s of stash) {
        fresh.tiles[s.ly][s.lx] = s.tile;
        fresh.meta [s.ly][s.lx] = s.meta;
      }
    }
  }

  // ——————————
  // Процедурная генерация чанка
  // ——————————
  /**
   * Процедурная генерация чанка (cx,cy):
   * - размещаем 3–8 комнат (размером 4×4…8×8, окружены стенами),
   * - соединяем их коридорами (ширина 2–3, без диагоналей),
   * - создаём типы тайлов: 'room','door','hall','wall'.
   */
  _generateChunk(cx, cy) {
    const S = this.chunkSize;
    // Начнём с пустого массива стен
    const tiles = Array.from({ length: S }, () =>
      Array.from({ length: S }, () => 'wall')
    );
    // 1) Разместить случайные комнаты
    const numRooms = 3 + Math.floor(Math.random() * 6); // от 3 до 8
    const rooms = [];
    for (let i = 0; i < numRooms; i++) {
      const w = 4 + Math.floor(Math.random() * 5); // 4..8
      const h = 4 + Math.floor(Math.random() * 5);
      // Случайная позиция с запасом 1 тайла по краям
      const x = 1 + Math.floor(Math.random() * (S - w - 2));
      const y = 1 + Math.floor(Math.random() * (S - h - 2));
      // Проверяем наложение с существующими комнатами (с 1-тайловым зазором)
      let overlap = false;
      for (let r of rooms) {
        if (!(x + w < r.x - 1 || r.x + r.w < x - 1 ||
              y + h < r.y - 1 || r.y + r.h < y - 1)) {
          overlap = true;
          break;
        }
      }
      if (overlap) continue;
      // Добавляем комнату и заливаем пол прямоугольной области
      rooms.push({x, y, w, h});
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
          tiles[yy][xx] = 'room';
        }
      }
    }

    // 2) Соединить комнаты коридорами (минимальное остовное дерево)
    if (rooms.length > 1) {
      // Центры комнат
      const centers = rooms.map(r => ({
        cx: r.x + Math.floor(r.w / 2),
        cy: r.y + Math.floor(r.h / 2)
      }));
      // Построим MST (Прима)
      const connected = new Set([0]);
      const edges = [];
      while (connected.size < rooms.length) {
        let best = null;
        for (let i of connected) {
          for (let j = 0; j < rooms.length; j++) {
            if (connected.has(j)) continue;
            const dx = centers[i].cx - centers[j].cx;
            const dy = centers[i].cy - centers[j].cy;
            const dist = dx*dx + dy*dy;
            if (best === null || dist < best.dist) {
              best = {dist, i, j};
            }
          }
        }
        connected.add(best.j);
        edges.push([best.i, best.j]);
      }
      // Прорубаем коридоры для каждого ребра остовного дерева
      for (let [i, j] of edges) {
        const r1 = rooms[i], r2 = rooms[j];
        // Ширина коридора и количество дверей
        const W = 2 + Math.floor(Math.random() * 2); // 2 или 3
        const doorA = 1 + Math.floor(Math.random() * 2); // 1 или 2 двери
        const doorB = 1 + Math.floor(Math.random() * 2);
        // Центры комнат
        const cx1 = r1.x + Math.floor(r1.w/2), cy1 = r1.y + Math.floor(r1.h/2);
        const cx2 = r2.x + Math.floor(r2.w/2), cy2 = r2.y + Math.floor(r2.h/2);
        // Определяем, сначала пойдём горизонтально или вертикально
        const horiz = Math.abs(cx2 - cx1) > Math.abs(cy2 - cy1);
        let doorsA = [], doorsB = [];

        if (horiz) {
          // Горизонтальное соединение
          if (cx2 > cx1) {
            // Коридор идёт вправо: правая стена r1 к левой стене r2
            if (doorA === 1) {
              const yA = r1.y + Math.floor(Math.random() * r1.h);
              doorsA = [[r1.x + r1.w - 1, yA]];
            } else {
              const yA = r1.y + Math.floor(Math.random() * (r1.h - 1));
              doorsA = [[r1.x + r1.w - 1, yA], [r1.x + r1.w - 1, yA + 1]];
            }
            if (doorB === 1) {
              const yB = r2.y + Math.floor(Math.random() * r2.h);
              doorsB = [[r2.x, yB]];
            } else {
              const yB = r2.y + Math.floor(Math.random() * (r2.h - 1));
              doorsB = [[r2.x, yB], [r2.x, yB + 1]];
            }
            // Определяем ряды коридора
            const baseYA = doorsA[0][1];
            let rows = [];
            if (doorA === W) {
              rows = doorsA.map(d => d[1]);
            } else {
              if (W === 2) {
                rows = (baseYA >= S-1 ? [baseYA-1, baseYA] : [baseYA, baseYA+1]);
              } else { // W === 3
                if (baseYA <= 0) rows = [baseYA, baseYA+1, baseYA+2];
                else if (baseYA >= S-1) rows = [baseYA-2, baseYA-1, baseYA];
                else rows = [baseYA, baseYA+1, baseYA+2];
              }
            }
            // Горизонтальный коридор между комнатами
            let xStart = r1.x + r1.w - 1, xEnd = r2.x;
            if (xStart > xEnd) [xStart, xEnd] = [xEnd, xStart];
            for (let yy of rows) {
              if (yy < 0 || yy >= S) continue;
              for (let xx = xStart; xx <= xEnd; xx++) {
                if (xx < 0 || xx >= S) continue;
                if (tiles[yy][xx] !== 'room') tiles[yy][xx] = 'hall';
              }
            }
            // Вертикальные столбцы коридора
            const baseXB = doorsB[0][0];
            let cols = [];
            if (doorB === W) {
              cols = doorsB.map(d => d[0]);
            } else {
              if (W === 2) {
                cols = (baseXB >= S-1 ? [baseXB-1, baseXB] : [baseXB, baseXB+1]);
              } else {
                if (baseXB <= 0) cols = [baseXB, baseXB+1, baseXB+2];
                else if (baseXB >= S-1) cols = [baseXB-2, baseXB-1, baseXB];
                else cols = [baseXB-1, baseXB, baseXB+1];
              }
            }
            // Вертикальный коридор до двери r2
            let y0 = Math.min(rows[0], doorsB[0][1]);
            let y1 = Math.max(rows[0], doorsB[0][1]);
            for (let xx of cols) {
              if (xx < 0 || xx >= S) continue;
              for (let yy = y0; yy <= y1; yy++) {
                if (yy < 0 || yy >= S) continue;
                if (tiles[yy][xx] !== 'room') tiles[yy][xx] = 'hall';
              }
            }
          } else {
            // Коридор идёт влево: левая стена r1 к правой стене r2
            if (doorA === 1) {
              const yA = r1.y + Math.floor(Math.random() * r1.h);
              doorsA = [[r1.x, yA]];
            } else {
              const yA = r1.y + Math.floor(Math.random() * (r1.h - 1));
              doorsA = [[r1.x, yA], [r1.x, yA + 1]];
            }
            if (doorB === 1) {
              const yB = r2.y + Math.floor(Math.random() * r2.h);
              doorsB = [[r2.x + r2.w - 1, yB]];
            } else {
              const yB = r2.y + Math.floor(Math.random() * (r2.h - 1));
              doorsB = [[r2.x + r2.w - 1, yB], [r2.x + r2.w - 1, yB + 1]];
            }
            const baseYA = doorsA[0][1];
            let rows = [];
            if (doorA === W) {
              rows = doorsA.map(d => d[1]);
            } else {
              if (W === 2) {
                rows = (baseYA >= S-1 ? [baseYA-1, baseYA] : [baseYA, baseYA+1]);
              } else {
                if (baseYA <= 0) rows = [baseYA, baseYA+1, baseYA+2];
                else if (baseYA >= S-1) rows = [baseYA-2, baseYA-1, baseYA];
                else rows = [baseYA, baseYA+1, baseYA+2];
              }
            }
            let xStart = r1.x, xEnd = r2.x + r2.w - 1;
            if (xStart > xEnd) [xStart, xEnd] = [xEnd, xStart];
            for (let yy of rows) {
              if (yy < 0 || yy >= S) continue;
              for (let xx = xStart; xx <= xEnd; xx++) {
                if (xx < 0 || xx >= S) continue;
                if (tiles[yy][xx] !== 'room') tiles[yy][xx] = 'hall';
              }
            }
            const baseXB = doorsB[0][0];
            let cols = [];
            if (doorB === W) {
              cols = doorsB.map(d => d[0]);
            } else {
              if (W === 2) {
                cols = (baseXB <= 0 ? [baseXB, baseXB+1] : [baseXB-1, baseXB]);
              } else {
                if (baseXB <= 0) cols = [baseXB, baseXB+1, baseXB+2];
                else if (baseXB >= S-1) cols = [baseXB-2, baseXB-1, baseXB];
                else cols = [baseXB-1, baseXB, baseXB+1];
              }
            }
            let y0 = Math.min(rows[0], doorsB[0][1]);
            let y1 = Math.max(rows[0], doorsB[0][1]);
            for (let xx of cols) {
              if (xx < 0 || xx >= S) continue;
              for (let yy = y0; yy <= y1; yy++) {
                if (yy < 0 || yy >= S) continue;
                if (tiles[yy][xx] !== 'room') tiles[yy][xx] = 'hall';
              }
            }
          }
          // Установим двери
          for (let d of doorsA) {
            const [dx, dy] = d;
            if (dx >= 0 && dx < S && dy >= 0 && dy < S) tiles[dy][dx] = 'door';
          }
          for (let d of doorsB) {
            const [dx, dy] = d;
            if (dx >= 0 && dx < S && dy >= 0 && dy < S) tiles[dy][dx] = 'door';
          }
        }
      } else {
        // Вертикальное соединение (сначала вверх/вниз)
        if (cy2 > cy1) {
          // Вниз: нижняя грань r1 к верхней грань r2
          if (doorA === 1) {
            const xA = r1.x + Math.floor(Math.random() * r1.w);
            doorsA = [[xA, r1.y + r1.h - 1]];
          } else {
            const xA = r1.x + Math.floor(Math.random() * (r1.w - 1));
            doorsA = [[xA, r1.y + r1.h - 1], [xA + 1, r1.y + r1.h - 1]];
          }
          if (doorB === 1) {
            const xB = r2.x + Math.floor(Math.random() * r2.w);
            doorsB = [[xB, r2.y]];
          } else {
            const xB = r2.x + Math.floor(Math.random() * (r2.w - 1));
            doorsB = [[xB, r2.y], [xB + 1, r2.y]];
          }
          const baseXA = doorsA[0][0];
          let cols = [];
          if (doorA === W) {
            cols = doorsA.map(d => d[0]);
          } else {
            if (W === 2) {
              cols = (baseXA <= 0 ? [baseXA, baseXA+1] : [baseXA-1, baseXA]);
            } else {
              if (baseXA <= 0) cols = [baseXA, baseXA+1, baseXA+2];
              else if (baseXA >= S-1) cols = [baseXA-2, baseXA-1, baseXA];
              else cols = [baseXA, baseXA+1, baseXA+2];
            }
          }
          // Вертикальный коридор вниз от r1 до r2
          let yStart = r1.y + r1.h - 1;
          let yEnd = r2.y;
          if (yStart > yEnd) [yStart, yEnd] = [yEnd, yStart];
          for (let xx of cols) {
            if (xx < 0 || xx >= S) continue;
            for (let yy = yStart; yy <= yEnd; yy++) {
              if (yy < 0 || yy >= S) continue;
              if (tiles[yy][xx] !== 'room') tiles[yy][xx] = 'hall';
            }
          }
          const baseYB = doorsB[0][1];
          let rows = [];
          if (doorB === W) {
            rows = doorsB.map(d => d[1]);
          } else {
            if (W === 2) {
              rows = (baseYB >= S-1 ? [baseYB-1, baseYB] : [baseYB, baseYB+1]);
            } else {
              if (baseYB <= 0) rows = [baseYB, baseYB+1, baseYB+2];
              else if (baseYB >= S-1) rows = [baseYB-2, baseYB-1, baseYB];
              else rows = [baseYB, baseYB+1, baseYB+2];
            }
          }
          // Горизонтальный коридор к двери r1
          let x0 = Math.min(doorsA[0][0], doorsB[0][0]);
          let x1 = Math.max(doorsA[0][0], doorsB[0][0]);
          for (let yy of rows) {
            if (yy < 0 || yy >= S) continue;
            for (let xx = x0; xx <= x1; xx++) {
              if (xx < 0 || xx >= S) continue;
              if (tiles[yy][xx] !== 'room') tiles[yy][xx] = 'hall';
            }
          }
        } else {
          // Вверх: верхняя грань r1 к нижней грань r2
          if (doorA === 1) {
            const xA = r1.x + Math.floor(Math.random() * r1.w);
            doorsA = [[xA, r1.y]];
          } else {
            const xA = r1.x + Math.floor(Math.random() * (r1.w - 1));
            doorsA = [[xA, r1.y], [xA + 1, r1.y]];
          }
          if (doorB === 1) {
            const xB = r2.x + Math.floor(Math.random() * r2.w);
            doorsB = [[xB, r2.y + r2.h - 1]];
          } else {
            const xB = r2.x + Math.floor(Math.random() * (r2.w - 1));
            doorsB = [[xB, r2.y + r2.h - 1], [xB + 1, r2.y + r2.h - 1]];
          }
          const baseXA = doorsA[0][0];
          let cols = [];
          if (doorA === W) {
            cols = doorsA.map(d => d[0]);
          } else {
            if (W === 2) {
              cols = (baseXA <= 0 ? [baseXA, baseXA+1] : [baseXA-1, baseXA]);
            } else {
              if (baseXA <= 0) cols = [baseXA, baseXA+1, baseXA+2];
              else if (baseXA >= S-1) cols = [baseXA-2, baseXA-1, baseXA];
              else cols = [baseXA, baseXA+1, baseXA+2];
            }
          }
          let yStart = r1.y;
          let yEnd = r2.y + r2.h - 1;
          if (yStart > yEnd) [yStart, yEnd] = [yEnd, yStart];
          for (let xx of cols) {
            if (xx < 0 || xx >= S) continue;
            for (let yy = yStart; yy <= yEnd; yy++) {
              if (yy < 0 || yy >= S) continue;
              if (tiles[yy][xx] !== 'room') tiles[yy][xx] = 'hall';
            }
          }
          const baseYB = doorsB[0][1];
          let rows = [];
          if (doorB === W) {
            rows = doorsB.map(d => d[1]);
          } else {
            if (W === 2) {
              rows = (baseYB >= S-1 ? [baseYB-1, baseYB] : [baseYB, baseYB+1]);
            } else {
              if (baseYB <= 0) rows = [baseYB, baseYB+1, baseYB+2];
              else if (baseYB >= S-1) rows = [baseYB-2, baseYB-1, baseYB];
              else rows = [baseYB, baseYB+1, baseYB+2];
            }
          }
          let x0 = Math.min(doorsA[0][0], doorsB[0][0]);
          let x1 = Math.max(doorsA[0][0], doorsB[0][0]);
          for (let yy of rows) {
            if (yy < 0 || yy >= S) continue;
            for (let xx = x0; xx <= x1; xx++) {
              if (xx < 0 || xx >= S) continue;
              if (tiles[yy][xx] !== 'room') tiles[yy][xx] = 'hall';
            }
          }
        }
        // Установим двери
        for (let d of doorsA) {
          const [dx, dy] = d;
          if (dx >= 0 && dx < S && dy >= 0 && dy < S) tiles[dy][dx] = 'door';
        }
        for (let d of doorsB) {
          const [dx, dy] = d;
          if (dx >= 0 && dx < S && dy >= 0 && dy < S) tiles[dy][dx] = 'door';
        }
      }
    }
    return tiles;
  }
}

window.GameMap = GameMap;