// Test fixtures of the table: cards, piles, a session and the card catalog, as most tests build
// them, and lookups on the drawn table.

import type { CardInfo } from '../lib/catalog';
import type {
  Action,
  CardView,
  PackFace,
  PileView,
  PresenceState,
  SessionError,
} from '../lib/types';

/** A face-up Spider-Man of seat 0's, on the table at its origin. */
export function card(id: string, extra: Partial<CardView> = {}): CardView {
  return {
    id,
    code: '01001',
    face: 0,
    back: 'player',
    owner: 0,
    zone: 'table',
    x: 0,
    y: 0,
    z: 1,
    ...extra,
  };
}

/** A deck of 30 cards nobody owns, at the table's origin. */
export function pile(id: string, extra: Partial<PileView> = {}): PileView {
  return { id, kind: 'deck', owner: -1, x: 0, y: 0, count: 30, ...extra };
}

/** A session whose actions all go out, as action 1; nothing answers them. */
export function fakeSession() {
  return {
    act: vi.fn((_action: Action): number | null => 1),
    lobby: vi.fn(() => true),
    lastError: null as SessionError | null,
    presence: new Map<number, PresenceState>(),
    sendPresence: vi.fn(),
    viewGap: 0,
  };
}

/**
 * A stand-in for the catalog's knownCard: the cards of those codes, with those faces, and no
 * other. A face gives only what a test needs; the rest is a blank standard card with an image.
 */
export function infoFrom(
  faces: Record<string, Partial<PackFace>[]>,
): (code: string) => CardInfo | null {
  return (code) => {
    const given = faces[code];
    if (!given) {
      return null;
    }
    const full = given.map((face): PackFace => ({
      name: '',
      type: '',
      size: 'std',
      images: [`${code}.png`],
      ...face,
    }));
    return { card: { code, faces: full, back: 'player', quantity: 1 }, face: 0 };
  };
}

/** The element drawing that card or pile on the table; `selector` narrows it, as '.card'. */
export function placed(id: string, selector = ''): HTMLElement {
  const element = document.querySelector<HTMLElement>(`.surface ${selector}[data-id="${id}"]`);
  if (!element) {
    throw new Error(`no ${id} on the table`);
  }
  return element;
}

/** A measured box, as getBoundingClientRect gives, with its sides as plain fields. */
export function domRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

/**
 * Shows the table on a screen tall enough to draw its rows as far apart as they go (rowPitch, a
 * pitch of 380): only the villain's row and player 1's row's cards are then drawn at their table
 * heights, so that a test of what happens over them keeps the heights of the table. The 30 units
 * under player 1's cards are drawn stretched, and every row after it lower than it lies. jsdom
 * measures every element 0 high otherwise, which draws the rows as close as they go, the villain's
 * row's empty band squeezed. Restored with the other mocks.
 */
export function tallTable(): void {
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(function (this: Element) {
    return this.classList.contains('tablewrap') ? 2000 : 0;
  });
}
