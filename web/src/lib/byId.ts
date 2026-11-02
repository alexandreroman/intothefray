const maps = new WeakMap<readonly { id: string }[], ReadonlyMap<string, { id: string }>>();

/**
 * The items of a list by id, built once per list and then looked up in
 * constant time. The map is cached by the list's identity, which is sound only
 * because the lists given are never changed in place: the cards and piles of a
 * view, which is only ever replaced (lib/session.svelte.ts).
 */
export function byId<T extends { id: string }>(list: readonly T[]): ReadonlyMap<string, T> {
  let map = maps.get(list) as ReadonlyMap<string, T> | undefined;
  if (map === undefined) {
    map = new Map(list.map((item) => [item.id, item]));
    maps.set(list, map);
  }
  return map;
}
