// The filters of the app (the lobby's scenarios and sets, a card box's cards) match a name whatever its case
// and accents, so that "ecraser" finds "Écraser" on a keyboard without accents.

/** Text as a filter compares it: without accents, case or surrounding spaces. */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

/**
 * Whether one of the names holds the query, both folded: the name shown and the English one, so that a
 * player finds a localized card or set by the name they know. A blank query matches every name.
 */
export function matchesQuery(query: string, names: readonly string[]): boolean {
  const wanted = fold(query);
  return wanted === '' || names.some((name) => fold(name).includes(wanted));
}
