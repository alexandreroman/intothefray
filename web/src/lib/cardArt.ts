/** A card face's width over its height: portrait, 5:7. */
export const CARD_ASPECT = 5 / 7;

/*
 * The illustration of a hero or villain face, as fractions of the card's width from its left edge
 * and of its height from its top edge: right of the stat column (THW, ATK, DEF or SCH, ATK), just
 * inside the right edge, under the title bar (and a villain's "Villain" banner), above the text
 * box (and a hero's "Hero" or "Alter-Ego" tag). Read on Spider-Man (01001A), Scott Summers,
 * Rhino (01094) and Apocalypse, with a little slack on every side.
 */
export const ART_LEFT = 0.22;
export const ART_RIGHT = 0.97;
export const ART_TOP = 0.13;
export const ART_BOTTOM = 0.54;

/** Where the card image lies in its box, each value a fraction of the box's width or height. */
export interface ArtFrame {
  width: number;
  height: number;
  left: number;
  top: number;
}

/**
 * Places a card image in a box of the given aspect (width over height) so that only its
 * illustration shows: as small as it can be while the art fills the box, and centred on the
 * art. Neither the stat column, nor the title, nor the text box ever shows.
 */
export function artFrame(boxAspect: number): ArtFrame {
  const artWidth = ART_RIGHT - ART_LEFT;
  const artHeight = ART_BOTTOM - ART_TOP;
  // The card's width, in box widths: its art at least as wide as the box, and as tall.
  const width = Math.max(1 / artWidth, CARD_ASPECT / (boxAspect * artHeight));
  const height = (width * boxAspect) / CARD_ASPECT;
  return {
    width,
    height,
    left: 0.5 - ((ART_LEFT + ART_RIGHT) / 2) * width,
    top: 0.5 - ((ART_TOP + ART_BOTTOM) / 2) * height,
  };
}
