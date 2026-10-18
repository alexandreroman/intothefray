/** A card (on the table or in the hand) or a pile, by id. */
export interface Hovered {
  kind: 'card' | 'pile';
  id: string;
}

/**
 * What the mouse points at on the table, shared by the table, the hand and
 * the side panel. Ids rather than faces, so the preview follows the card
 * through redraws (a flip, a pile's new top card).
 */
class TableHover {
  /** The card or pile shown in the preview. */
  hovered = $state.raw<Hovered | null>(null);
  /** The cards of the hovered history line, ringed on the table. */
  highlighted = $state.raw<ReadonlySet<string>>(new Set());

  reset(): void {
    this.hovered = null;
    this.highlighted = new Set();
  }
}

export const hover = new TableHover();
