import { cardByCode } from '../lib/catalog';
import type { CardView, PackFace } from '../lib/types';

/** A face-down card, or one the viewer may not see (no code), shows only its back. */
export function isHidden(card: CardView): boolean {
  return !!card.faceDown || !card.code;
}

/**
 * Follows the catalog face a table card shows. It is null while the
 * catalog loads, for an unknown code, and for a hidden card, which is never
 * looked up. Call it while a component initialises.
 */
export function shownFace(card: () => CardView | undefined): { readonly current: PackFace | null } {
  let face = $state.raw<PackFace | null>(null);
  // Primitives, so a new view object for the same card does not look it up again.
  const code = $derived.by(() => {
    const c = card();
    return c && !isHidden(c) ? c.code : undefined;
  });
  const faceIndex = $derived(card()?.face ?? 0);

  $effect(() => {
    face = null;
    if (!code) {
      return;
    }
    const wanted = faceIndex;
    // A late answer for a previous card must not overwrite the current one.
    let current = true;
    cardByCode(code)
      .then((info) => {
        if (current) {
          face = info?.card.faces[wanted] ?? null;
        }
      })
      .catch(() => {}); // The packs could not be loaded: the placeholder stays.
    return () => {
      current = false;
    };
  });

  return {
    get current() {
      return face;
    },
  };
}
