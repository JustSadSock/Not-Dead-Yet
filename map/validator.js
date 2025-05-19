// map/validator.js
import { floodFillCheck } from './validator/cleanup.js';
import { postValidate }   from './validator/postValidate.js';

/**
 * 1) Удаляем не-достижимые полу-тайлы (cleanup)
 * 2) Делаем дополнительные проверки (postValidate)
 */
export function applyRules(tiles) {
  floodFillCheck(tiles);
  postValidate(tiles);
}