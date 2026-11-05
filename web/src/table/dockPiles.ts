// Small cards and small piles in dock mode (spec 3.6): every table card is drawn scaled about its
// own top-left corner; each owner frame and the piles inside it are drawn scaled about the frame's
// top-left corner, so that the frame wraps the small piles and the gaps between them shrink alike.
// Only the drawing changes: the positions the server holds stay as they are.

import type { PileView } from '../lib/types';
import { frameLabel, type OwnerFrame } from './layout';

/** How much smaller dock mode draws the table cards, the owner frames and their piles. */
export const DOCK_SCALE = 0.6;

/** A box on the table, in table units. */
export interface Placement {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A table card's box as dock mode draws it, about its own top-left corner: its size scaled. */
export function dockCardBox<T extends { w: number; h: number }>(box: T, scale = DOCK_SCALE): T {
  return { ...box, w: box.w * scale, h: box.h * scale };
}

/** The frame as dock mode draws it: same top-left corner, its size scaled. */
export function dockFrameBox(frame: Placement, scale = DOCK_SCALE): Placement {
  return { x: frame.x, y: frame.y, w: frame.w * scale, h: frame.h * scale };
}

/** A pile's slot as dock mode draws it: scaled about the top-left corner of its frame. */
export function dockPileBox(slot: Placement, frame: Placement, scale = DOCK_SCALE): Placement {
  return {
    x: frame.x + (slot.x - frame.x) * scale,
    y: frame.y + (slot.y - frame.y) * scale,
    w: slot.w * scale,
    h: slot.h * scale,
  };
}

/** The frame ownerFrames draws around a pile, if any: the one of its owner and its label. */
export function pileFrame(pile: PileView, frames: readonly OwnerFrame[]): OwnerFrame | undefined {
  const label = frameLabel(pile);
  return frames.find((frame) => frame.owner === pile.owner && frame.label === label);
}
