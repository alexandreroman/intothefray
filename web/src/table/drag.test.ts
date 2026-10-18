import { describe, expect, it } from 'vitest';
import type { CardView, PileView, View } from '../lib/types';
import {
  dropAction,
  dropTarget,
  goesToHand,
  handBand,
  insertIndex,
  pileTargets,
  snap,
  sourceOf,
  stackOf,
  type DragSource,
  type DropRect,
  type Rect,
} from './drag';

function rect(left: number, top: number, width: number, height: number): Rect {
  return { left, top, right: left + width, bottom: top + height };
}

function card(id: string, extra: Partial<CardView> = {}): CardView {
  return {
    id,
    code: '01001',
    face: 0,
    back: 'player',
    owner: 0,
    zone: 'table',
    area: 'p0',
    x: 0,
    y: 0,
    z: 1,
    ...extra,
  };
}

function pile(id: string, extra: Partial<PileView> = {}): PileView {
  return { id, kind: 'deck', owner: -1, area: 'villain', x: 0, y: 0, count: 10, ...extra };
}

/** Alex (p0) is the viewer; Sam sits at p1. */
function makeView(
  extra: { cards?: CardView[]; piles?: PileView[]; spectator?: boolean } = {},
): View {
  return {
    id: 'g1',
    phase: 'playing',
    you: extra.spectator
      ? { role: 'spectator', color: -1, host: false }
      : { role: 'player', name: 'Alex', color: 0, host: true, area: 'p0' },
    players: [],
    spectators: 0,
    config: { scenario: 'rhino', difficulty: 'standard', standard: '', expert: '', modulars: [] },
    table: {
      cards: extra.cards ?? [],
      piles: extra.piles ?? [],
      hand: ['h1', 'h2', 'h3'],
      stages: [{ key: 'villain', label: 'Villain', current: 'v', cards: ['v'] }],
      firstPlayer: { area: 'p0', x: 0, y: 0 },
    },
    log: [],
  };
}

const ZONE: DropRect = { kind: 'zone', area: 'p0', rect: rect(0, 300, 1000, 300) };

const TABLE_CARD: DragSource = { kind: 'card', card: 'c', area: 'p0', x: 100, y: 40 };

describe('snap', () => {
  it('rounds to the 10-unit grid', () => {
    expect(snap(123)).toBe(120);
    expect(snap(125)).toBe(130);
    expect(snap(-4)).toBe(-0);
  });
});

describe('dropTarget', () => {
  const pileRect: DropRect = {
    kind: 'pile',
    pile: 'disc:p0',
    area: 'p0',
    drop: 'discard',
    label: 'Discard',
    rect: rect(120, 300, 100, 140),
  };
  const low: DropRect = {
    kind: 'card',
    card: 'low',
    area: 'p0',
    z: 1,
    rect: rect(100, 300, 300, 200),
  };
  const high: DropRect = {
    kind: 'card',
    card: 'high',
    area: 'p0',
    z: 5,
    rect: rect(250, 300, 100, 140),
  };

  it('dropTarget prefers piles', () => {
    const targets = [ZONE, low, high, pileRect];
    // On the pile and on a card: the pile wins.
    expect(dropTarget({ x: 150, y: 350 }, targets)).toBe(pileRect);
    // 20 px around the pile count as on it.
    expect(dropTarget({ x: 239, y: 350 }, targets)).toBe(pileRect);
    // Past the margin: the topmost card under the point.
    expect(dropTarget({ x: 300, y: 350 }, targets)).toBe(high);
    expect(dropTarget({ x: 380, y: 480 }, targets)).toBe(low);
    // Nothing else there: the zone itself.
    expect(dropTarget({ x: 700, y: 550 }, targets)).toBe(ZONE);
  });

  it('finds nothing outside every zone, and ignores what lies outside the zone under the point', () => {
    const scrolledOut: DropRect = { ...high, rect: rect(250, 0, 100, 140) };
    expect(dropTarget({ x: 300, y: 50 }, [ZONE, scrolledOut])).toBeNull();
    expect(dropTarget({ x: 300, y: 50 }, [scrolledOut])).toBeNull();
  });

  it('puts the hand before everything else', () => {
    const hand: DropRect = { kind: 'hand', index: 2, rect: rect(0, 500, 1000, 300) };
    expect(dropTarget({ x: 150, y: 520 }, [ZONE, low, hand])).toBe(hand);
    const toHand: DropRect = { kind: 'toHand', rect: rect(0, 500, 1000, 300) };
    expect(dropTarget({ x: 150, y: 520 }, [ZONE, low, toHand])).toBe(toHand);
  });
});

describe('dropAction', () => {
  it('dropAction move snaps', () => {
    expect(dropAction(TABLE_CARD, ZONE, { area: 'p1', x: 123, y: 47 })).toEqual({
      kind: 'move',
      card: 'c',
      area: 'p1',
      x: 120,
      y: 50,
    });
    // Never off the top or left edge.
    expect(dropAction(TABLE_CARD, ZONE, { area: 'p0', x: -12, y: -30 })).toMatchObject({
      x: 0,
      y: 0,
    });
  });

  it('drop on card attaches', () => {
    const target: DropRect = {
      kind: 'card',
      card: 'hero',
      area: 'p0',
      z: 3,
      rect: rect(0, 0, 1, 1),
    };
    expect(dropAction(TABLE_CARD, target, { area: 'p0', x: 0, y: 0 })).toEqual({
      kind: 'attach',
      card: 'c',
      target: 'hero',
    });
  });

  it('drop on own deck pile puts on top', () => {
    const deck: DropRect = {
      kind: 'pile',
      pile: 'deck:p0',
      area: 'p0',
      drop: 'top',
      label: 'Top of deck',
      rect: rect(0, 0, 1, 1),
    };
    expect(dropAction(TABLE_CARD, deck, { area: 'p0', x: 0, y: 0 })).toEqual({
      kind: 'toDeck',
      card: 'c',
      where: 'top',
    });
    const hand: DragSource = { kind: 'hand', card: 'h1', hand: ['h1'], area: 'p0' };
    expect(dropAction(hand, deck, { area: 'p0', x: 0, y: 0 })).toEqual({
      kind: 'toDeck',
      card: 'h1',
      where: 'top',
    });
  });

  it('sends discard and toPile for the other piles', () => {
    const on = (pileId: string, drop: 'discard' | 'pile'): DropRect => ({
      kind: 'pile',
      pile: pileId,
      area: 'villain',
      drop,
      label: '',
      rect: rect(0, 0, 1, 1),
    });
    const at = { area: 'p0' as const, x: 0, y: 0 };
    expect(dropAction(TABLE_CARD, on('disc:p0', 'discard'), at)).toEqual({
      kind: 'discard',
      card: 'c',
    });
    expect(dropAction(TABLE_CARD, on('vic', 'pile'), at)).toEqual({
      kind: 'toPile',
      card: 'c',
      target: 'vic',
    });
    const fromPile: DragSource = { kind: 'pile', pile: 'disc:p0', card: 'top' };
    expect(dropAction(fromPile, on('aside:p0', 'pile'), at)).toEqual({
      kind: 'toPile',
      card: 'top',
      target: 'aside:p0',
    });
  });

  it('encounter deck drag deals face down', () => {
    const encounter: DragSource = { kind: 'encounter', pile: 'enc' };
    expect(dropAction(encounter, ZONE, { area: 'p1', x: 204, y: 96 })).toEqual({
      kind: 'deal',
      area: 'p1',
      x: 200,
      y: 100,
    });
    // On a card it is still dealt where it lands; on the encounter discard, its top is discarded.
    const onCard: DropRect = { kind: 'card', card: 'x', area: 'p1', z: 1, rect: rect(0, 0, 1, 1) };
    expect(dropAction(encounter, onCard, { area: 'p1', x: 0, y: 0 })).toMatchObject({
      kind: 'deal',
    });
    const discard: DropRect = {
      kind: 'pile',
      pile: 'encd',
      area: 'villain',
      drop: 'discard',
      label: 'Discard',
      rect: rect(0, 0, 1, 1),
    };
    expect(dropAction(encounter, discard, { area: 'villain', x: 0, y: 0 })).toEqual({
      kind: 'discardTop',
      pile: 'enc',
      n: 1,
    });
  });

  it('plays a hand card or the top card of a pile where it lands', () => {
    const hand: DragSource = { kind: 'hand', card: 'h2', hand: ['h1', 'h2'], area: 'p0' };
    expect(dropAction(hand, ZONE, { area: 'villain', x: 311, y: 9 })).toEqual({
      kind: 'play',
      card: 'h2',
      area: 'villain',
      x: 310,
      y: 10,
    });
    const fromPile: DragSource = { kind: 'pile', pile: 'encd', card: 'top' };
    expect(dropAction(fromPile, ZONE, { area: 'p0', x: 40, y: 60 })).toEqual({
      kind: 'play',
      card: 'top',
      area: 'p0',
      x: 40,
      y: 60,
    });
  });

  it('plays a hand card or the top card of a pile under the card it is dropped on', () => {
    const onCard: DropRect = {
      kind: 'card',
      card: 'hero',
      area: 'p0',
      z: 3,
      rect: rect(0, 0, 1, 1),
    };
    const at = { area: 'p0' as const, x: 300, y: 300 };
    const hand: DragSource = { kind: 'hand', card: 'h2', hand: ['h1', 'h2'], area: 'p0' };
    expect(dropAction(hand, onCard, at)).toEqual({ kind: 'play', card: 'h2', target: 'hero' });
    const fromPile: DragSource = { kind: 'pile', pile: 'encd', card: 'top' };
    expect(dropAction(fromPile, onCard, at)).toEqual({ kind: 'play', card: 'top', target: 'hero' });
  });

  it('reorders the hand, the dragged card slotting in among the others', () => {
    const hand: DragSource = { kind: 'hand', card: 'h1', hand: ['h1', 'h2', 'h3'], area: 'p0' };
    const slot = (index: number): DropRect => ({ kind: 'hand', index, rect: rect(0, 0, 1, 1) });
    expect(dropAction(hand, slot(2), { area: 'p0', x: 0, y: 0 })).toEqual({
      kind: 'handOrder',
      area: 'p0',
      cards: ['h2', 'h3', 'h1'],
    });
    expect(dropAction(hand, slot(1), { area: 'p0', x: 0, y: 0 })).toEqual({
      kind: 'handOrder',
      area: 'p0',
      cards: ['h2', 'h1', 'h3'],
    });
    // A table card is not slotted in among the hand cards.
    expect(dropAction(TABLE_CARD, slot(0), { area: 'p0', x: 0, y: 0 })).toBeNull();
  });

  it('takes a table card back to the hand', () => {
    const toHand: DropRect = { kind: 'toHand', rect: rect(0, 0, 1, 1) };
    expect(dropAction(TABLE_CARD, toHand, { area: 'p0', x: 0, y: 0 })).toEqual({
      kind: 'toHand',
      card: 'c',
    });
  });

  it('drop at origin sends nothing', () => {
    // Where it lay.
    expect(dropAction(TABLE_CARD, ZONE, { area: 'p0', x: 102, y: 38 })).toBeNull();
    // Nowhere.
    expect(dropAction(TABLE_CARD, null, { area: 'p0', x: 300, y: 300 })).toBeNull();
    // Back in its place in the hand.
    const hand: DragSource = { kind: 'hand', card: 'h2', hand: ['h1', 'h2', 'h3'], area: 'p0' };
    expect(
      dropAction(hand, { kind: 'hand', index: 1, rect: rect(0, 0, 1, 1) }, ZONE_AT),
    ).toBeNull();
    // Back on the pile it was taken from.
    const discard: DropRect = {
      kind: 'pile',
      pile: 'encd',
      area: 'villain',
      drop: 'discard',
      label: 'Discard',
      rect: rect(0, 0, 1, 1),
    };
    expect(dropAction({ kind: 'pile', pile: 'encd', card: 'top' }, discard, ZONE_AT)).toBeNull();
    // A revealed card put back on the deck it was revealed from.
    const revealed: DragSource = { ...TABLE_CARD, onPile: 'enc' };
    const encounter: DropRect = { ...discard, pile: 'enc', drop: 'top', label: 'Top of deck' };
    expect(dropAction(revealed, encounter, ZONE_AT)).toBeNull();
  });

  it('moves a revealed card off its pile', () => {
    const revealed: DragSource = { ...TABLE_CARD, onPile: 'enc' };
    expect(dropAction(revealed, ZONE, { area: 'villain', x: 300, y: 0 })).toEqual({
      kind: 'move',
      card: 'c',
      area: 'villain',
      x: 300,
      y: 0,
    });
  });
});

const ZONE_AT = { area: 'p0' as const, x: 0, y: 0 };

describe('sourceOf', () => {
  const view = makeView({
    cards: [
      card('c', { x: 30, y: 40, onPile: 'enc' }),
      card('h1', { zone: 'hand', area: undefined }),
      card('top', { zone: 'pile' }),
    ],
    piles: [
      pile('enc', { kind: 'encounter', count: 12 }),
      pile('encd', { kind: 'encounterDiscard', count: 1, cards: ['top'] }),
      pile('deck:p0', { owner: 0, area: 'p0' }),
      pile('aside:p1', { kind: 'aside', owner: 1, area: 'p1', count: 1, cards: ['top'] }),
      pile('vic', { kind: 'victory', count: 0, cards: [] }),
    ],
  });

  it('takes a table card, a hand card, the top of an open pile and the encounter deck', () => {
    expect(sourceOf({ kind: 'card', id: 'c' }, view)).toEqual({
      kind: 'card',
      card: 'c',
      area: 'p0',
      x: 30,
      y: 40,
      onPile: 'enc',
    });
    expect(sourceOf({ kind: 'hand', id: 'h1' }, view)).toEqual({
      kind: 'hand',
      card: 'h1',
      hand: ['h1', 'h2', 'h3'],
      area: 'p0',
    });
    expect(sourceOf({ kind: 'pile', id: 'encd' }, view)).toEqual({
      kind: 'pile',
      pile: 'encd',
      card: 'top',
    });
    expect(sourceOf({ kind: 'pile', id: 'enc' }, view)).toEqual({ kind: 'encounter', pile: 'enc' });
  });

  it('follows the card taken from a pile while it is still in it', () => {
    const grown = makeView({
      cards: [card('top', { zone: 'pile' }), card('new', { zone: 'pile' })],
      piles: [pile('encd', { kind: 'encounterDiscard', count: 2, cards: ['top', 'new'] })],
    });
    expect(sourceOf({ kind: 'pile', id: 'encd' }, grown, 'top')).toEqual({
      kind: 'pile',
      pile: 'encd',
      card: 'top',
    });
    expect(sourceOf({ kind: 'pile', id: 'encd' }, grown, 'gone')).toBeNull();
  });

  it("leaves decks, empty piles and other players' set-aside cards where they are", () => {
    expect(sourceOf({ kind: 'pile', id: 'deck:p0' }, view)).toBeNull();
    expect(sourceOf({ kind: 'pile', id: 'vic' }, view)).toBeNull();
    expect(sourceOf({ kind: 'pile', id: 'aside:p1' }, view)).toBeNull();
  });

  it('gives nothing for a card that is gone, or to a spectator', () => {
    expect(sourceOf({ kind: 'card', id: 'gone' }, view)).toBeNull();
    expect(sourceOf({ kind: 'hand', id: 'c' }, view)).toBeNull();
    const watching = makeView({ cards: [card('c')], spectator: true });
    expect(sourceOf({ kind: 'card', id: 'c' }, watching)).toBeNull();
  });
});

describe('pileTargets', () => {
  const piles = [
    pile('enc', { kind: 'encounter' }),
    pile('encd', { kind: 'encounterDiscard' }),
    pile('deck:p0', { owner: 0, area: 'p0' }),
    pile('disc:p0', { kind: 'discard', owner: 0, area: 'p0' }),
    pile('deck:p1', { owner: 1, area: 'p1' }),
    pile('disc:p1', { kind: 'discard', owner: 1, area: 'p1' }),
    pile('vic', { kind: 'victory' }),
    pile('saside', { kind: 'aside' }),
    pile('aside:p0', { kind: 'aside', owner: 0, area: 'p0' }),
  ];
  const cards = [
    card('mine'),
    card('theirs', { owner: 1, area: 'p1' }),
    card('minion', { owner: -1, back: 'encounter', area: 'villain' }),
    card('v', { owner: -1, back: 'villain', area: 'villain', parent: 'over' }),
    card('over', { owner: -1, area: 'villain' }),
    card('under', { owner: -1, back: 'encounter', area: 'villain', parent: 'v' }),
  ];
  const view = makeView({ cards, piles });
  const of = (id: string) =>
    pileTargets({ kind: 'card', card: id, area: 'p0', x: 0, y: 0 }, view).map((t) => [
      t.pile,
      t.drop,
      t.label,
    ]);

  it("offers a card its owner's deck and discard pile, the victory display and a set-aside pile", () => {
    expect(of('mine')).toEqual([
      ['deck:p0', 'top', 'Top of deck'],
      ['disc:p0', 'discard', 'Discard'],
      ['vic', 'pile', 'Victory display'],
      ['aside:p0', 'pile', 'Set aside'],
    ]);
    expect(of('minion')).toEqual([
      ['enc', 'top', 'Top of deck'],
      ['encd', 'discard', 'Discard'],
      ['vic', 'pile', 'Victory display'],
      ['saside', 'pile', 'Set aside'],
    ]);
  });

  it("keeps another player's deck out, as the menus do", () => {
    expect(of('theirs')).toEqual([
      ['disc:p1', 'discard', 'Discard'],
      ['vic', 'pile', 'Victory display'],
      ['saside', 'pile', 'Set aside'],
    ]);
  });

  it('offers nothing for the card a stage shows, or a card it is tucked under', () => {
    expect(of('v')).toEqual([]);
    expect(of('over')).toEqual([]);
    // What is tucked under it can go.
    expect(of('under')).toHaveLength(4);
  });

  it('offers the encounter deck its discard pile only', () => {
    const targets = pileTargets({ kind: 'encounter', pile: 'enc' }, view);
    expect(targets.map((t) => t.pile)).toEqual(['encd']);
  });
});

describe('goesToHand', () => {
  const view = makeView({
    cards: [
      card('mine'),
      card('theirs', { owner: 1 }),
      card('enc', { owner: -1, back: 'encounter' }),
      card('h1', { zone: 'hand', area: undefined }),
    ],
    piles: [pile('disc:p0', { kind: 'discard', owner: 0, area: 'p0', cards: ['d1'], count: 1 })],
  });

  it("takes the viewer's own table cards only, as Move to ▾ Hand", () => {
    const tableCard = (id: string): DragSource => ({
      kind: 'card',
      card: id,
      area: 'p0',
      x: 0,
      y: 0,
    });
    expect(goesToHand(tableCard('mine'), view)).toBe(true);
    expect(goesToHand(tableCard('theirs'), view)).toBe(false);
    expect(goesToHand(tableCard('enc'), view)).toBe(false);
  });

  it('takes nothing from the hand or a pile, nor from a spectator', () => {
    const fromHand: DragSource = { kind: 'hand', card: 'h1', hand: ['h1'], area: 'p0' };
    expect(goesToHand(fromHand, view)).toBe(false);
    expect(goesToHand({ kind: 'pile', pile: 'disc:p0', card: 'd1' }, view)).toBe(false);
    expect(goesToHand({ kind: 'encounter', pile: 'encd' }, view)).toBe(false);
    const spectating = makeView({ cards: [card('mine')], spectator: true });
    expect(goesToHand(TABLE_CARD, spectating)).toBe(false);
  });
});

describe('stackOf', () => {
  it('is the card and every card tucked under it, directly or not', () => {
    const cards = [
      card('a'),
      card('b', { parent: 'a' }),
      card('c', { parent: 'b' }),
      card('d', { parent: 'x' }),
      card('e', { parent: 'a', zone: 'pile' }),
    ];
    expect(stackOf('a', cards)).toEqual(['a', 'b', 'c']);
    expect(stackOf('b', cards)).toEqual(['b', 'c']);
  });
});

describe('the hand', () => {
  it('takes drops around its cards, a card wide on each side, down to the bottom of the window', () => {
    const band = handBand(
      [rect(300, 600, 132, 185), rect(400, 590, 132, 185)],
      rect(0, 50, 1000, 750),
      800,
    );
    expect(band).toEqual({ left: 160, top: 570, right: 672, bottom: 800 });
  });

  it('takes drops at the middle of the bottom edge when empty', () => {
    expect(handBand([], rect(0, 50, 1000, 750), 800)).toEqual({
      left: 360,
      top: 660,
      right: 640,
      bottom: 800,
    });
  });

  it('slots a card in after the cards whose middle is left of the pointer', () => {
    expect(insertIndex([100, 200, 300], 50)).toBe(0);
    expect(insertIndex([100, 200, 300], 250)).toBe(2);
    expect(insertIndex([100, 200, 300], 900)).toBe(3);
  });
});

describe('the first player token', () => {
  const token: DragSource = { kind: 'firstPlayer', area: 'p0', x: 860, y: 40 };
  const card: DropRect = { kind: 'card', card: 'c', area: 'p1', z: 1, rect: rect(0, 0, 1, 1) };
  const discard: DropRect = {
    kind: 'pile',
    pile: 'disc:p1',
    area: 'p1',
    drop: 'discard',
    label: 'Discard',
    rect: rect(0, 0, 1, 1),
  };

  it('is taken by a player from where it lies, never by a spectator', () => {
    expect(sourceOf({ kind: 'firstPlayer' }, makeView())).toEqual({
      kind: 'firstPlayer',
      area: 'p0',
      x: 0,
      y: 0,
    });
    expect(sourceOf({ kind: 'firstPlayer' }, makeView({ spectator: true }))).toBeNull();
  });

  it('goes where it lands, snapped, even over a card or a pile', () => {
    const at = { area: 'p1' as const, x: 164, y: 43 };
    const moved = { kind: 'firstPlayer', area: 'p1', x: 160, y: 40 };

    expect(dropAction(token, { kind: 'zone', area: 'p1', rect: rect(0, 0, 1, 1) }, at)).toEqual(
      moved,
    );
    expect(dropAction(token, card, at)).toEqual(moved);
    expect(dropAction(token, discard, at)).toEqual(moved);
  });

  it('sends nothing when put back where it was, and goes to no pile or hand', () => {
    const zone: DropRect = { kind: 'zone', area: 'p0', rect: rect(0, 0, 1, 1) };
    expect(dropAction(token, zone, { area: 'p0', x: 858, y: 42 })).toBeNull();
    expect(pileTargets(token, makeView())).toEqual([]);
    expect(goesToHand(token, makeView())).toBe(false);
  });
});
