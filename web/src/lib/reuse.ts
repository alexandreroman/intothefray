import type { View } from './types';

/**
 * The next view, with each table card and pile that did not change since the
 * previous view replaced by the previous object: same id, same data. Every
 * server message parses into new objects; keeping the unchanged ones lets the
 * table redraw only what changed. The previous view is never modified, and the
 * view returned is always a new object when there is a previous table.
 */
export function reuseUnchanged(prev: View | null, next: View): View {
  if (!prev?.table || !next.table) {
    return next;
  }
  return {
    ...next,
    table: {
      ...next.table,
      cards: reuseItems(prev.table.cards, next.table.cards),
      piles: reuseItems(prev.table.piles, next.table.piles),
    },
  };
}

/** The next items, each equal to the previous item of its id replaced by that previous item. */
function reuseItems<T extends { id: string }>(prev: readonly T[], next: T[]): T[] {
  const prevById = new Map(prev.map((item) => [item.id, item]));
  return next.map((item) => {
    const old = prevById.get(item.id);
    return old !== undefined && isSameData(old, item) ? old : item;
  });
}

/**
 * Whether two JSON-like values (objects, arrays, primitives) hold the same
 * data, compared deeply. Key order does not matter, and a key whose value is
 * undefined counts as absent, as it does in JSON.
 */
export function isSameData(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && isSameArray(a, b);
  }
  return isSameObject(a as Record<string, unknown>, b as Record<string, unknown>);
}

function isSameArray(a: unknown[], b: unknown[]): boolean {
  return a.length === b.length && a.every((value, i) => isSameData(value, b[i]));
}

function isSameObject(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const aKeys = definedKeys(a);
  if (aKeys.length !== definedKeys(b).length) {
    return false;
  }
  return aKeys.every((key) => isSameData(a[key], b[key]));
}

function definedKeys(object: Record<string, unknown>): string[] {
  return Object.keys(object).filter((key) => object[key] !== undefined);
}
