// combat/weapons.js
class Weapon {
  /**
   * @param {number} fireRate — выстрелов в секунду
   * @param {number} damage   — урон за выстрел
   */
  constructor(fireRate, damage) {
    this.fireRate = fireRate;
    this.damage   = damage;
  }
}

// базовое оружие: 1 выстрел/сек, урон 1
window.baseWeapon = new Weapon(1, 1);
