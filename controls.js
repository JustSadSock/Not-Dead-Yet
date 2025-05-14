// Здесь можно подключить ваш сенсорный джойстик и обновлять
// player.x, player.y, player.directionAngle.
// Пока оставим простое управление стрелками для теста:

window.addEventListener('keydown', e => {
  if (e.key === 'ArrowUp')    player.y--;
  if (e.key === 'ArrowDown')  player.y++;
  if (e.key === 'ArrowLeft')  player.x--;
  if (e.key === 'ArrowRight') player.x++;
  // и, например, менять направление:
  if (e.key === 'a') player.directionAngle -= 0.2;
  if (e.key === 'd') player.directionAngle += 0.2;
});
