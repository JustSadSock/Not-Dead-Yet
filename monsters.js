// monsters.js

// ====== ПАРАМЕТРЫ ======
const MONSTER_SPAWN_INTERVAL = 2000;  // каждые 2 секунды пытаемся спавнить
const ILLUSION_CHANCE        = 0.7;   // 70%—иллюзии

// ====== Список монстров ======
window.monsters = [];

/**
 * Монстр или иллюзия
 */
class Monster {
  constructor(x, y, real = true) {
    this.x            = x;      // позиция в тайлах
    this.y            = y;
    this.real         = real;   // настоящий или иллюзия
    this.timer        = 0;      // с момента спавна
    this.visibleTimer = 0;      // время в зоне видимости
    this.dead         = false;
  }

  update(dt, visibleSet) {
    const key = `${Math.floor(this.x)},${Math.floor(this.y)}`;
    const inView = visibleSet.has(key);

    // если видим, считаем, сколько секунд он в поле зрения
    this.visibleTimer = inView
      ? this.visibleTimer + dt
      : 0;

    // общий таймер
    this.timer += dt;

    // иллюзии умирают через 5 секунд после спавна
    if (!this.real && this.timer > 5) {
      this.dead = true;
    }
  }

  draw(ctx) {
    const cx = (this.x + 0.5) * TILE_SIZE;
    const cy = (this.y + 0.5) * TILE_SIZE;

    // 1) при спавне кратко показываем силуэт
    if (this.timer < 0.2) {
      ctx.save();
      ctx.globalAlpha = this.real ? 0.5 : 0.2;
      ctx.strokeStyle = 'white';
      ctx.beginPath();
      ctx.arc(cx, cy, TILE_SIZE * 0.4, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.restore();
      return;
    }

    // 2) если реальный и в поле зрения — рисуем ярко
    if (this.real && this.visibleTimer > 0) {
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.fillStyle   = 'white';
      ctx.beginPath();
      ctx.arc(cx, cy, TILE_SIZE * 0.4, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();
    }
    // ложные силуэты и невидимые реалы не рисуем
  }
}

/**
 * Пытаемся заспавнить монстра за пределами текущего FOV
 */
window.spawnMonster = function(gameMap, visibleSet) {
  let x, y, key;
  do {
    x = Math.floor(Math.random() * MAP_W);
    y = Math.floor(Math.random() * MAP_H);
    key = `${x},${y}`;
  } while (
    visibleSet.has(key) ||
    gameMap.tiles[y][x].type === 'wall'
  );

  const isReal = Math.random() > ILLUSION_CHANCE;
  window.monsters.push(new Monster(x, y, isReal));
};

// Авто-спавн
setInterval(() => {
  // gameMap и player уже объявлены глобально в game.js
  const visible = computeFOV(gameMap, {
    x: Math.floor(player.x),
    y: Math.floor(player.y),
    directionAngle: player.directionAngle
  });
  spawnMonster(gameMap, visible);
}, MONSTER_SPAWN_INTERVAL);