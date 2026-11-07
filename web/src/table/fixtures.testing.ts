// Test fixtures of the table: cards, piles, a game in play, a session, the card catalog and
// measured boxes, as most tests build them, and lookups on the drawn table.

import type { CardInfo } from '../lib/catalog';
import type { Rect } from '../lib/rect';
import type {
  Action,
  Area,
  CardView,
  DeckView,
  PackFace,
  PileView,
  PlayerView,
  PresenceState,
  SessionError,
  Stage,
  TableView,
  View,
  YouView,
} from '../lib/types';

/** The villain's stage, its one card `v` showing. */
export const VILLAIN_STAGE: Stage = {
  key: 'villain',
  label: 'Villain',
  current: 'v',
  cards: ['v'],
};

/**
 * A spectator's view of themselves, as the server sends it: a spectator holds no seat, so no colour of
 * their own, which leaves the field at 0 (YouView, internal/game/view.go).
 */
export function spectatorYou(name = 'Kim'): YouView {
  return { role: 'spectator', name, color: 0, host: false };
}

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

/**
 * A player at the table, ready and online, with a ready deck in each area of `decks`; a deck
 * holds no card in hand unless it says otherwise.
 */
export function seated(
  name: string,
  color: number,
  decks: (Partial<DeckView> & { area: Area })[],
  host = false,
): PlayerView {
  return {
    name,
    color,
    host,
    ready: true,
    online: true,
    decks: decks.map((deck) => ({ ready: true, handCount: 0, ...deck })),
  };
}

/** The fields of a view a test gives: `table` holds only the table's fields it changes. */
type ViewFields = Partial<Omit<View, 'table'>> & { table?: Partial<TableView> };

/**
 * Rhino in play, seen by Alex (colour 0, the host, p0) with Sam (colour 1, p1) at the table, their
 * hands empty, on an empty table. `extra` replaces the view's fields, and `extra.table` the
 * table's.
 */
export function playingView(extra: ViewFields = {}): View {
  const { table, ...fields } = extra;
  return {
    id: 'g1',
    phase: 'playing',
    you: { role: 'player', name: 'Alex', color: 0, host: true, areas: ['p0'] },
    players: [seated('Alex', 0, [{ area: 'p0' }], true), seated('Sam', 1, [{ area: 'p1' }])],
    spectators: 0,
    config: { scenario: 'rhino', difficulty: 'standard', standard: '', expert: '', modulars: [] },
    table: { cards: [], piles: [], stages: [], firstPlayer: { x: 860, y: 40 }, ...table },
    log: [],
    ...fields,
  };
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

/**
 * Where a drag ghost's top-left corner lies in its layer, as its translate places it (CardView): a
 * ghost stays at the layer's corner and moves on translate alone. A translate of one length moves
 * along x only, as the browser writes one with no y.
 */
export function ghostCorner(ghost: HTMLElement): [number, number] {
  expect(ghost.style.left).toBe('');
  expect(ghost.style.top).toBe('');
  const [x = '0', y = '0'] = ghost.style.translate.split(' ');
  return [Number.parseFloat(x), Number.parseFloat(y)];
}

/**
 * A measured box, as getBoundingClientRect gives: a real DOMRect, whose sides are getters on its
 * prototype, which a spread of the rect loses.
 */
export function domRect(left: number, top: number, width: number, height: number): DOMRect {
  return new DOMRect(left, top, width, height);
}

/** A box on the screen by its sides, as the drag code measures one. */
export function rect(left: number, top: number, width: number, height: number): Rect {
  return { left, top, right: left + width, bottom: top + height };
}

/**
 * Shows the table on a screen tall enough to draw its rows as far apart as they go (rowPitch, a
 * pitch of 440): only the villain's row and player 1's row's cards are then drawn at their table
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
