import type { Back, CardView, PileView } from '../lib/types';
import { sideLabel } from './actions';

/** A face-down card, or one the viewer may not see (no code), shows only its back. */
export function isHidden(card: CardView): boolean {
  return !!card.faceDown || !card.code;
}

/** The back a pile shows when its top card is not known: a side deck may have its own. */
export function pileBack(pile: PileView): Back {
  if (pile.kind === 'sideDeck' && pile.back) {
    return pile.back;
  }
  return pile.kind === 'encounter' || pile.kind === 'encounterDiscard' ? 'encounter' : 'player';
}

/** The caption of a side deck's own back: its label ("Labor"); none for any other pile. */
export function pileCaption(pile: PileView): string | undefined {
  return pile.kind === 'sideDeck' && pile.back ? sideLabel(pile) : undefined;
}

/**
 * The caption a card's back shows: the label of its side deck (`home`) when
 * that deck has its own back, else none.
 */
export function backCaption(card: CardView, piles: readonly PileView[]): string | undefined {
  const home = piles.find((pile) => pile.id === card.home);
  return home ? pileCaption(home) : undefined;
}
