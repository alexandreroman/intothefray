export type Route = { name: 'home' } | { name: 'options' } | { name: 'game'; id: string };

const GAME_HASH = /^#\/g\/([^/]+)$/;

function parse(hash: string): Route {
  if (hash === '#/options') {
    return { name: 'options' };
  }
  const game = GAME_HASH.exec(hash);
  if (game?.[1]) {
    return { name: 'game', id: decodeURIComponent(game[1]) };
  }
  return { name: 'home' };
}

export const route = $state({ current: parse(window.location.hash) });

window.addEventListener('hashchange', () => {
  route.current = parse(window.location.hash);
});

export function go(hash: string): void {
  window.location.hash = hash;
}
