import type { Back, CardView, PileView } from '../lib/types';
import { sideLabel } from './actions';

/** A face-down card, or one the viewer may not see (no code), shows only its back. */
export function isHidden(card: CardView): boolean {
  return !!card.faceDown || !card.code;
}

/** The back a pile shows when its top card is not known: a side deck may have its own. */
export function pileBack(pile: PileView): Back {
  if (pile.kind === 'sideDeck' && pile.ownBack) {
    return 'side';
  }
  return pile.kind === 'encounter' || pile.kind === 'encounterDiscard' ? 'encounter' : 'player';
}

/**
 * The name a card's own side back shows: the label of its side deck (`home`),
 * undefined for any other back or while that deck is not on the table.
 */
export function sideBackName(card: CardView, piles: readonly PileView[]): string | undefined {
  if (card.back !== 'side') {
    return undefined;
  }
  const home = piles.find((pile) => pile.id === card.home);
  return home ? sideLabel(home) : undefined;
}
