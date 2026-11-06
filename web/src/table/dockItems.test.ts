import { dockItems, dockRows, frameItemId, markerItemId, type DockTable } from './dockItems';
import { card, pile } from './fixtures.testing';
import { ownerFrames } from './layout';

// Player 1's row (table top 380): the deck and discard in their frame, the identity at 300, the
// first player token 40 past it, a played card 40 past the token with an upgrade tucked under it.
function table(extra: Partial<DockTable> = {}): DockTable {
  const piles = [
    pile('deck:p0', { owner: 0, x: 0, y: 410 }),
    pile('discard:p0', { kind: 'discard', owner: 0, x: 130, y: 410 }),
  ];
  return {
    cards: [
      card('identity', { x: 300, y: 410 }),
      card('ally', { x: 576, y: 410 }),
      card('upgrade', { x: 586, y: 430, parent: 'ally' }),
      card('revealed', { x: 0, y: 410, onPile: 'deck:p0' }),
    ],
    piles,
    frames: ownerFrames(piles),
    markers: { firstPlayer: { x: 452, y: 450 } },
    sizeOf: () => 'std',
    ...extra,
  };
}

describe('dockItems', () => {
  it('lays out the cards at their table size, a tucked card with its main card, a revealed one with its pile', () => {
    const items = dockItems(table());
    const byId = new Map(items.map((item) => [item.id, item]));

    expect(byId.get('identity')).toEqual({
      id: 'identity',
      x: 300,
      y: 410,
      w: 112,
      h: 157,
      kind: 'card',
      anchor: undefined,
    });
    expect(byId.get('upgrade')?.anchor).toBe('ally');
    expect(byId.get('revealed')?.anchor).toBe('deck:p0');
  });

  it('tells an exhausted card, whose slot is as wide as its tilt', () => {
    const t = table();
    const items = dockItems({
      ...t,
      cards: t.cards.map((c) => (c.id === 'ally' ? { ...c, exhausted: true } : c)),
    });
    const byId = new Map(items.map((item) => [item.id, item]));

    expect(byId.get('ally')?.exhausted).toBe(true);
    expect(byId.get('identity')?.exhausted).toBeFalsy();
  });

  it('lays out each pile with its owner frame, the frame at its own box', () => {
    const t = table();
    const items = dockItems(t);
    const frame = t.frames[0]!;
    const byId = new Map(items.map((item) => [item.id, item]));

    expect(byId.get(frameItemId(frame))).toMatchObject({
      kind: 'frame',
      x: frame.x,
      y: frame.y,
      w: frame.w,
      h: frame.h,
    });
    expect(byId.get('deck:p0')).toMatchObject({ kind: 'pile', anchor: frameItemId(frame) });
    expect(byId.get('discard:p0')?.anchor).toBe(frameItemId(frame));
  });

  it('lays out a marker with the card it lies by, the leftmost of two as close', () => {
    // The token (452..536) lies 40 right of the identity (..412) and 40 left of the ally (576..).
    const items = dockItems(table());
    const token = items.find((item) => item.id === markerItemId('firstPlayer'));

    expect(token).toMatchObject({ kind: 'marker', w: 84, h: 70, anchor: 'identity' });
  });

  it('lays out a marker far from every card alone', () => {
    const items = dockItems(table({ markers: { active: { x: 2000, y: 210 } } }));
    const counter = items.find((item) => item.id === markerItemId('active'));

    expect(counter).toMatchObject({ w: 70, h: 70, anchor: undefined });
  });
});

describe('dockRows', () => {
  it("shows the villain's row and every row an item lies in, with its main item", () => {
    const items = dockItems(
      table({
        cards: [
          card('villain', { x: 300, y: 30 }),
          card('far', { x: 300, y: 1300 }),
          // Tucked far down, but drawn with its main card in the villain's row.
          card('tucked', { x: 310, y: 900, parent: 'villain' }),
        ],
      }),
    );

    expect(dockRows(items)).toEqual([0, 1, 5]);
  });

  it('shows the villain row and the shown row in "Villain + player"', () => {
    expect(dockRows(dockItems(table()), 3)).toEqual([0, 3]);
  });
});
