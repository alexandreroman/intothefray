import type { Back, CardView, PileKind } from '../lib/types';

/** A face-down card, or one the viewer may not see (no code), shows only its back. */
export function isHidden(card: CardView): boolean {
  return !!card.faceDown || !card.code;
}

/** The back a pile shows when its top card is not known. */
export function pileBack(kind: PileKind): Back {
  return kind === 'encounter' || kind === 'encounterDiscard' ? 'encounter' : 'player';
}
