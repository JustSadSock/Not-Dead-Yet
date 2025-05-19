// map/validator/utils.js
/** включите тут любые утилиты для ваших правил */
export function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}