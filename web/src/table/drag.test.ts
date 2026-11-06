import type { CardView, PileView, TableView, View } from '../lib/types';
import {
  dealRecipient,
  DROP_DWELL_MS,
  DROP_MARGIN,
  dropAction,
  dropKey,
  dropTarget,
  goesToHand,
  handAreaOf,
  handBand,
  insertIndex,
  isDownward,
  mainCardOf,
  pileTargets,
  sourceOf,
  stackOf,
  SteadyDrop,
  takesHandDrop,
  tucks,
  unshifted,
  type DragSource,
  type DropRect,
} from './drag';
import { dockLayout, type DockItem } from './dockLayout';
import { TABLET_GRID } from './grid';
import { ALL_TABLE, spreadRows, tableMapOf } from './rows';
import { card, pile, playingView, rect } from './fixtures.testing';

/** Alex (p0) is the viewer; Sam sits at p1. */
function makeView(
  extra: {
    cards?: CardView[];
    piles?: PileView[];
    hands?: TableView['hands'];
    spectator?: boolean;
  } = {},
): View {
  return playingView({
    you: extra.spectator
      ? { role: 'spectator', color: -1, host: false }
      : { role: 'player', name: 'Alex', color: 0, host: true, areas: ['p0'] },
    players: [],
    table: {
      cards: extra.cards ?? [],
      piles: extra.piles ?? [],
      hands: extra.hands ?? { p0: ['h1', 'h2', 'h3'] },
      stages: [{ key: 'villain', label: 'Villain', current: 'v', cards: ['v'] }],
      firstPlayer: { x: 0, y: 0 },
    },
  });
}

const TABLE: DropRect = { kind: 'table', rect: rect(0, 300, 1000, 300) };

// Who an encounter card dealt goes to: dealRecipient picks the player.
const DEAL_TO = 'p1';

const TABLE_CARD: DragSource = { kind: 'card', card: 'c', x: 100, y: 40 };

describe('dropTarget', () => {
  const pileRect: DropRect = {
    kind: 'pile',
    pile: 'disc:p0',
    drop: 'discard',
    label: 'Discard',
    rect: rect(120, 300, 100, 140),
  };
  const low: DropRect = {
    kind: 'card',
    card: 'low',
    z: 1,
    rect: rect(100, 300, 300, 200),
  };
  const high: DropRect = {
    kind: 'card',
    card: 'high',
    z: 5,
    rect: rect(250, 300, 100, 140),
  };

  it('dropTarget prefers piles', () => {
    const targets = [TABLE, low, high, pileRect];
    // On the pile and on a card: the pile wins.
    expect(dropTarget({ x: 150, y: 350 }, targets)).toBe(pileRect);
    // 20 px around the pile count as on it.
    expect(dropTarget({ x: 239, y: 350 }, targets)).toBe(pileRect);
    // Past the margin: the topmost card under the point.
    expect(dropTarget({ x: 300, y: 350 }, targets)).toBe(high);
    expect(dropTarget({ x: 380, y: 480 }, targets)).toBe(low);
    // Nothing else there: the table itself.
    expect(dropTarget({ x: 700, y: 550 }, targets)).toBe(TABLE);
  });

  describe("a deck that is not the dragged card's home", () => {
    const sideDeck: DropRect = {
      kind: 'pile',
      pile: 'side:p0:0',
      drop: 'top',
      label: 'Top of Labor deck',
      rect: rect(600, 300, 100, 140),
      exact: true,
    };
    // A card revealed on the side deck lies over it.
    const revealed: DropRect = {
      kind: 'card',
      card: 'revealed',
      z: 3,
      rect: rect(600, 300, 100, 140),
    };
    const homeDeck: DropRect = { ...pileRect, pile: 'deck:p0', drop: 'top', label: 'Top of deck' };

    it('takes a drop right over it', () => {
      expect(dropTarget({ x: 650, y: 350 }, [TABLE, sideDeck])).toBe(sideDeck);
    });

    it('takes no drop near it: the card is placed on the table', () => {
      expect(dropTarget({ x: 710, y: 350 }, [TABLE, sideDeck])).toBe(TABLE);
      expect(dropTarget({ x: 650, y: 450 }, [TABLE, sideDeck])).toBe(TABLE);
    });

    it('gives way to a card lying over it, which takes the tuck', () => {
      expect(dropTarget({ x: 650, y: 350 }, [TABLE, sideDeck, revealed])).toBe(revealed);
    });

    it("wins over the home deck's margin when the point is right over it", () => {
      const nextToHome = { ...sideDeck, rect: rect(230, 300, 100, 140) };
      expect(dropTarget({ x: 235, y: 350 }, [TABLE, homeDeck, nextToHome])).toBe(nextToHome);
    });

    it('leaves the home deck its margin, over a card too', () => {
      const nextToHome = { ...sideDeck, rect: rect(230, 300, 100, 140) };
      const targets = [TABLE, low, homeDeck, nextToHome];
      expect(dropTarget({ x: 235, y: 350 }, targets)).toBe(homeDeck);
      expect(dropTarget({ x: 239, y: 350 }, [TABLE, low, homeDeck, sideDeck])).toBe(homeDeck);
    });
  });

  it('finds nothing outside the table, whatever lies there', () => {
    const scrolledOut: DropRect = { ...high, rect: rect(250, 0, 100, 140) };
    expect(dropTarget({ x: 300, y: 50 }, [TABLE, scrolledOut])).toBeNull();
    expect(dropTarget({ x: 300, y: 50 }, [scrolledOut])).toBeNull();
  });

  it('puts the hand before everything else', () => {
    const hand: DropRect = { kind: 'hand', index: 2, rect: rect(0, 500, 1000, 300) };
    expect(dropTarget({ x: 150, y: 520 }, [TABLE, low, hand])).toBe(hand);
    const toHand: DropRect = { kind: 'toHand', rect: rect(0, 500, 1000, 300) };
    expect(dropTarget({ x: 150, y: 520 }, [TABLE, low, toHand])).toBe(toHand);
  });
});

describe('dropAction', () => {
  it('dropAction move snaps', () => {
    expect(dropAction(TABLE_CARD, TABLE, { x: 123, y: 47 }, DEAL_TO)).toEqual({
      kind: 'move',
      card: 'c',
      x: 120,
      y: 50,
    });
    // Never off the top or left edge, nor past the server's bound.
    expect(dropAction(TABLE_CARD, TABLE, { x: -12, y: -30 }, DEAL_TO)).toMatchObject({
      x: 0,
      y: 0,
    });
    expect(dropAction(TABLE_CARD, TABLE, { x: 25_000, y: 20_004 }, DEAL_TO)).toMatchObject({
      x: 20_000,
      y: 20_000,
    });
  });

  it("dropAction snaps to a tablet's coarser grid: across on 20s, down on 10 past them", () => {
    const at = (x: number, y: number) =>
      dropAction(TABLE_CARD, TABLE, { x, y }, DEAL_TO, ALL_TABLE, undefined, TABLET_GRID);
    // The nearest lines: beside player 1's cards (470), after the identity (300).
    expect(at(311, 476)).toEqual({ kind: 'move', card: 'c', x: 320, y: 470 });
    expect(at(289, 481)).toEqual({ kind: 'move', card: 'c', x: 280, y: 490 });
    expect(at(300, 470)).toMatchObject({ x: 300, y: 470 });
    // A marker too.
    const token: DragSource = { kind: 'marker', name: 'firstPlayer', x: 860, y: 40 };
    expect(
      dropAction(token, TABLE, { x: 509, y: 503 }, DEAL_TO, ALL_TABLE, undefined, TABLET_GRID),
    ).toEqual({
      kind: 'marker',
      name: 'firstPlayer',
      x: 500,
      y: 510,
    });
    // Never off the top or left edge.
    expect(at(-12, -30)).toMatchObject({ x: 0, y: 0 });
  });

  it("dropAction keeps a tablet's drop at the bottom of a shown row in that row", () => {
    // "Villain + player" on a tablet with the second of three players: the villain's row drawn
    // 440 high, then row 2 (660 to 880) drawn from 440, 220 high.
    const rows = tableMapOf(spreadRows(220, 3, 2, 440));
    const yAt = (y: number) =>
      dropAction(TABLE_CARD, TABLE, { x: 0, y }, DEAL_TO, rows, undefined, TABLET_GRID)?.y;
    // Row 2's cards, 30 under its top, drawn at 470.
    expect(yAt(476)).toBe(690);
    // At the bottom of the shown row, or below it: on its last grid line, never in the hidden row 3.
    expect(yAt(658)).toBe(870);
    expect(yAt(2000)).toBe(870);
  });

  it('dropAction snaps where the card is drawn, then maps it to the shown row', () => {
    // "Villain + player" with the second of three players, rows as close as they go: the villain's
    // row drawn 270 high, its empty band from 210 squeezed into 60, then row 2 (660 to 880).
    const rows = tableMapOf(spreadRows(220, 3, 2));
    const yAt = (y: number) => dropAction(TABLE_CARD, TABLE, { x: 0, y }, DEAL_TO, rows)?.y;
    // At the bottom of the villain's row: snapped onto the top of the shown row, not into row 1.
    expect(yAt(267)).toBe(660);
    expect(yAt(204)).toBe(200);
    // In the villain's squeezed band, where it is drawn: 240 is 30 into it, 115 on the table, 325
    // taken down to the grid.
    expect(yAt(244)).toBe(320);
    expect(yAt(443)).toBe(830);
    // At the bottom of the shown row, or below it: on its last grid line, never in the hidden row 3.
    expect(yAt(486)).toBe(870);
    expect(yAt(2000)).toBe(870);
  });

  // Player 1's owner frame, around piles at 0 and 130: the grid of dock mode starts at its left.
  const FRAME: DockItem = { id: 'frame', x: -10, y: 460, w: 262, h: 177, kind: 'frame' };

  it('dropAction in dock mode inserts a card among the units of the row it is dropped on', () => {
    // Player 1's row (top 440) at 0.6, wrapped at 400, on columns from its frame's left (−6), 91.2
    // apart: c0 (the indent, 176.4) and c1 on the first line, its top 12, the cards 18 lower; c2
    // and c3 on the second, from the first column, its top 12 + 118.2 (the frame) + 16 = 146.2,
    // their slots' middles at 27.6 and 118.8. The drop spot is the card's drawn middle.
    const cards: DockItem[] = [300, 452, 604, 756].map((x, i) => ({
      id: `c${i}`,
      x,
      y: 470,
      w: 112,
      h: 157,
      kind: 'card',
    }));
    const items = [FRAME, ...cards];
    const map = dockLayout({ items, rows: [1], wrapWidth: 400 });
    const spot = (corner: { x: number; y: number }) =>
      map.insertAt({ x: corner.x + 33.6, y: corner.y + 47.1 }, 112);
    const at = (x: number, y: number) =>
      dropAction(TABLE_CARD, TABLE, { x, y }, DEAL_TO, map, spot);

    // Before c3, its middle at 83.6: between c2 (604..716) and c3 (756..868), 736 − 56.
    expect(at(50, 150)).toEqual({ kind: 'move', card: 'c', x: 680, y: 470 });
    // Under the frame, left of c2's middle: before c2, (564 + 604) / 2 − 56 = 528, to 530.
    expect(at(-30, 150)).toEqual({ kind: 'move', card: 'c', x: 530, y: 470 });
    // Past c3: 40 past its right edge, 908, up to the grid.
    expect(at(150, 150)).toEqual({ kind: 'move', card: 'c', x: 910, y: 470 });
  });

  it('dropAction in dock mode lays a marker where it is drawn, with the unit it lies past', () => {
    const items: DockItem[] = [FRAME, { id: 'c0', x: 300, y: 470, w: 112, h: 157, kind: 'card' }];
    const map = dockLayout({ items, rows: [1], wrapWidth: 400 });
    const token: DragSource = { kind: 'marker', name: 'firstPlayer', x: 860, y: 40 };
    const spot = () => ({ x: 0, y: 0 });

    // With c0 (300, drawn 176.4, 30 under its row's 12 of name room): 300 + 73.6 / 0.6 = 422.7
    // across, 470 + 20 / 0.6 = 503.3 down, on the grid.
    expect(dropAction(token, TABLE, { x: 250, y: 50 }, DEAL_TO, map, spot)).toEqual({
      kind: 'marker',
      name: 'firstPlayer',
      x: 420,
      y: 500,
    });
  });

  it('drop on card attaches', () => {
    const target: DropRect = {
      kind: 'card',
      card: 'hero',
      z: 3,
      rect: rect(0, 0, 1, 1),
    };
    // The server lays the stack out: the drop point is not sent.
    const action = dropAction(TABLE_CARD, target, { x: 123, y: 456 }, DEAL_TO);
    expect(action).toEqual({ kind: 'attach', card: 'c', target: 'hero' });
    expect(action).not.toHaveProperty('placed');
  });

  it('drop on own deck pile puts on top', () => {
    const deck: DropRect = {
      kind: 'pile',
      pile: 'deck:p0',
      drop: 'top',
      label: 'Top of deck',
      rect: rect(0, 0, 1, 1),
    };
    expect(dropAction(TABLE_CARD, deck, { x: 0, y: 0 }, DEAL_TO)).toEqual({
      kind: 'toDeck',
      card: 'c',
      where: 'top',
      pile: 'deck:p0',
    });
    const hand: DragSource = { kind: 'hand', card: 'h1', hand: ['h1'], area: 'p0' };
    expect(dropAction(hand, deck, { x: 0, y: 0 }, DEAL_TO)).toEqual({
      kind: 'toDeck',
      card: 'h1',
      where: 'top',
      pile: 'deck:p0',
    });
  });

  it('sends discard and toPile for the other piles', () => {
    const on = (pileId: string, drop: 'discard' | 'pile'): DropRect => ({
      kind: 'pile',
      pile: pileId,
      drop,
      label: '',
      rect: rect(0, 0, 1, 1),
    });
    const at = { x: 0, y: 0 };
    expect(dropAction(TABLE_CARD, on('disc:p0', 'discard'), at, DEAL_TO)).toEqual({
      kind: 'discard',
      card: 'c',
    });
    expect(dropAction(TABLE_CARD, on('vic', 'pile'), at, DEAL_TO)).toEqual({
      kind: 'toPile',
      card: 'c',
      target: 'vic',
    });
    const fromPile: DragSource = { kind: 'pile', pile: 'disc:p0', card: 'top' };
    expect(dropAction(fromPile, on('aside:p0', 'pile'), at, DEAL_TO)).toEqual({
      kind: 'toPile',
      card: 'top',
      target: 'aside:p0',
    });
  });

  it('encounter deck drag deals face down', () => {
    const encounter: DragSource = { kind: 'encounter', pile: 'enc' };
    expect(dropAction(encounter, TABLE, { x: 204, y: 96 }, DEAL_TO)).toEqual({
      kind: 'deal',
      area: 'p1',
      x: 200,
      y: 100,
    });
    // On a card it is dealt under it, to the end of its stack, which the server lays out: the drop
    // point is not sent. On the encounter discard, its top is discarded.
    const onCard: DropRect = { kind: 'card', card: 'x', z: 1, rect: rect(0, 0, 1, 1) };
    expect(dropAction(encounter, onCard, { x: 300, y: 300 }, DEAL_TO)).toEqual({
      kind: 'deal',
      area: 'p1',
      target: 'x',
    });
    const discard: DropRect = {
      kind: 'pile',
      pile: 'encd',
      drop: 'discard',
      label: 'Discard',
      rect: rect(0, 0, 1, 1),
    };
    expect(dropAction(encounter, discard, { x: 0, y: 0 }, DEAL_TO)).toEqual({
      kind: 'discardTop',
      pile: 'enc',
      n: 1,
    });
  });

  it('deals the top card of a scenario encounter deck from that deck, under a card or where it lands', () => {
    const encounter: DragSource = { kind: 'encounter', pile: 'enc:w' };
    const onCard: DropRect = { kind: 'card', card: 'x', z: 1, rect: rect(0, 0, 1, 1) };
    expect(dropAction(encounter, onCard, { x: 300, y: 300 }, DEAL_TO)).toEqual({
      kind: 'deal',
      pile: 'enc:w',
      area: 'p1',
      target: 'x',
    });
    expect(dropAction(encounter, TABLE, { x: 204, y: 96 }, DEAL_TO)).toEqual({
      kind: 'deal',
      pile: 'enc:w',
      area: 'p1',
      x: 200,
      y: 100,
    });
  });

  it('plays a hand card or the top card of a pile where it lands', () => {
    const hand: DragSource = { kind: 'hand', card: 'h2', hand: ['h1', 'h2'], area: 'p0' };
    expect(dropAction(hand, TABLE, { x: 311, y: 9 }, DEAL_TO)).toEqual({
      kind: 'play',
      card: 'h2',
      x: 310,
      y: 10,
    });
    const fromPile: DragSource = { kind: 'pile', pile: 'encd', card: 'top' };
    expect(dropAction(fromPile, TABLE, { x: 40, y: 60 }, DEAL_TO)).toEqual({
      kind: 'play',
      card: 'top',
      x: 40,
      y: 60,
    });
  });

  it('plays a hand card or the top card of a pile under the card it is dropped on', () => {
    const onCard: DropRect = {
      kind: 'card',
      card: 'hero',
      z: 3,
      rect: rect(0, 0, 1, 1),
    };
    const at = { x: 300, y: 300 };
    const hand: DragSource = { kind: 'hand', card: 'h2', hand: ['h1', 'h2'], area: 'p0' };
    expect(dropAction(hand, onCard, at, DEAL_TO)).toEqual({
      kind: 'play',
      card: 'h2',
      target: 'hero',
    });
    const fromPile: DragSource = { kind: 'pile', pile: 'encd', card: 'top' };
    expect(dropAction(fromPile, onCard, at, DEAL_TO)).toEqual({
      kind: 'play',
      card: 'top',
      target: 'hero',
    });
  });

  it('reorders the hand, the dragged card slotting in among the others', () => {
    const hand: DragSource = { kind: 'hand', card: 'h1', hand: ['h1', 'h2', 'h3'], area: 'p0' };
    const slot = (index: number): DropRect => ({ kind: 'hand', index, rect: rect(0, 0, 1, 1) });
    expect(dropAction(hand, slot(2), { x: 0, y: 0 }, DEAL_TO)).toEqual({
      kind: 'handOrder',
      area: 'p0',
      cards: ['h2', 'h3', 'h1'],
    });
    expect(dropAction(hand, slot(1), { x: 0, y: 0 }, DEAL_TO)).toEqual({
      kind: 'handOrder',
      area: 'p0',
      cards: ['h2', 'h1', 'h3'],
    });
    // A table card is not slotted in among the hand cards.
    expect(dropAction(TABLE_CARD, slot(0), { x: 0, y: 0 }, DEAL_TO)).toBeNull();
  });

  it('takes a table card back to the hand', () => {
    const toHand: DropRect = { kind: 'toHand', rect: rect(0, 0, 1, 1) };
    expect(dropAction(TABLE_CARD, toHand, { x: 0, y: 0 }, DEAL_TO)).toEqual({
      kind: 'toHand',
      card: 'c',
    });
  });

  it('drop at origin sends nothing', () => {
    // Where it lay.
    expect(dropAction(TABLE_CARD, TABLE, { x: 102, y: 38 }, DEAL_TO)).toBeNull();
    // Nowhere.
    expect(dropAction(TABLE_CARD, null, { x: 300, y: 300 }, DEAL_TO)).toBeNull();
    // Back in its place in the hand.
    const hand: DragSource = { kind: 'hand', card: 'h2', hand: ['h1', 'h2', 'h3'], area: 'p0' };
    expect(
      dropAction(hand, { kind: 'hand', index: 1, rect: rect(0, 0, 1, 1) }, AT_ORIGIN, DEAL_TO),
    ).toBeNull();
    // Back on the pile it was taken from.
    const discard: DropRect = {
      kind: 'pile',
      pile: 'encd',
      drop: 'discard',
      label: 'Discard',
      rect: rect(0, 0, 1, 1),
    };
    expect(
      dropAction({ kind: 'pile', pile: 'encd', card: 'top' }, discard, AT_ORIGIN, DEAL_TO),
    ).toBeNull();
  });
});

const AT_ORIGIN = { x: 0, y: 0 };

describe('tucks', () => {
  it('is true for an attach, and for a play or a deal under a card', () => {
    expect(tucks({ kind: 'attach', card: 'c', target: 'x' })).toBe(true);
    expect(tucks({ kind: 'play', pile: 'deck:p0', target: 'x' })).toBe(true);
    expect(tucks({ kind: 'deal', area: 'p1', target: 'x' })).toBe(true);
    expect(tucks({ kind: 'deal', pile: 'enc:w', area: 'p1', target: 'x' })).toBe(true);
  });

  it('is false for a play or a deal where the card lands', () => {
    expect(tucks({ kind: 'play', pile: 'deck:p0', x: 40, y: 60 })).toBe(false);
    expect(tucks({ kind: 'deal', area: 'p1', x: 40, y: 60 })).toBe(false);
    expect(tucks({ kind: 'move', card: 'c', x: 40, y: 60 })).toBe(false);
  });
});

describe('isDownward', () => {
  it('is true within 45 degrees of straight down only', () => {
    const from = { x: 100, y: 100 };
    expect(isDownward(from, { x: 100, y: 104 })).toBe(true);
    expect(isDownward(from, { x: 97, y: 104 })).toBe(true);
    // Sideways (a reorder), up (to the table), or right on the diagonal.
    expect(isDownward(from, { x: 104, y: 101 })).toBe(false);
    expect(isDownward(from, { x: 100, y: 96 })).toBe(false);
    expect(isDownward(from, { x: 103, y: 103 })).toBe(false);
  });
});

describe('dealRecipient', () => {
  // The setup's rows: the villain's from 0, then one per seat every 270, the deck 30 below its top.
  const piles = [
    pile('enc', { kind: 'encounter', y: 30 }),
    pile('deck:p0', { owner: 0, y: 360 }),
    pile('disc:p0', { kind: 'discard', owner: 0, x: 160, y: 360 }),
    pile('deck:p1', { owner: 1, y: 630 }),
  ];

  it('deals to the player whose row the spot is in', () => {
    expect(dealRecipient(piles, 330, 'p1')).toBe('p0');
    expect(dealRecipient(piles, 599, 'p1')).toBe('p0');
    expect(dealRecipient(piles, 600, 'p0')).toBe('p1');
    expect(dealRecipient(piles, 5000, 'p0')).toBe('p1');
  });

  it("deals to the viewer above every player's row, or without any deck", () => {
    expect(dealRecipient(piles, 100, 'p1')).toBe('p1');
    expect(dealRecipient([], 500, 'p0')).toBe('p0');
  });
});

describe('sourceOf', () => {
  const view = makeView({
    cards: [
      card('c', { x: 30, y: 40, onPile: 'enc' }),
      card('h1', { zone: 'hand' }),
      card('top', { zone: 'pile' }),
    ],
    piles: [
      pile('enc', { kind: 'encounter', count: 12 }),
      pile('encd', { kind: 'encounterDiscard', count: 1, cards: ['top'] }),
      pile('deck:p0', { owner: 0 }),
      pile('aside:p1', { kind: 'aside', owner: 1, count: 1, cards: ['top'] }),
      pile('vic', { kind: 'victory', count: 0, cards: [] }),
    ],
  });

  it('takes a table card, a hand card, the top of an open pile and the encounter deck', () => {
    expect(sourceOf({ kind: 'card', id: 'c' }, view)).toEqual({
      kind: 'card',
      card: 'c',
      x: 30,
      y: 40,
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

  it("leaves other players' decks, empty piles and the out-of-play piles where they are", () => {
    const withSam = makeView({ piles: [pile('deck:p1', { owner: 1 })] });
    expect(sourceOf({ kind: 'pile', id: 'deck:p1' }, withSam)).toBeNull();
    expect(sourceOf({ kind: 'pile', id: 'vic' }, view)).toBeNull();
    expect(sourceOf({ kind: 'pile', id: 'aside:p1' }, view)).toBeNull();
  });

  it("takes the unknown top card of the viewer's own deck, never a spectator", () => {
    expect(sourceOf({ kind: 'pile', id: 'deck:p0' }, view)).toEqual({
      kind: 'deck',
      pile: 'deck:p0',
    });
    const spectating = makeView({ piles: [pile('deck:p0', { owner: 0 })], spectator: true });
    expect(sourceOf({ kind: 'pile', id: 'deck:p0' }, spectating)).toBeNull();
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
    pile('deck:p0', { owner: 0 }),
    pile('disc:p0', { kind: 'discard', owner: 0 }),
    pile('deck:p1', { owner: 1 }),
    pile('disc:p1', { kind: 'discard', owner: 1 }),
    pile('vic', { kind: 'victory' }),
    pile('saside', { kind: 'aside' }),
    pile('aside:p0', { kind: 'aside', owner: 0 }),
  ];
  const cards = [
    card('mine'),
    card('theirs', { owner: 1 }),
    card('minion', { owner: -1, back: 'encounter' }),
    card('v', { owner: -1, back: 'villain', parent: 'over' }),
    card('over', { owner: -1 }),
    card('under', { owner: -1, back: 'encounter', parent: 'v' }),
  ];
  const view = makeView({ cards, piles });
  const of = (id: string) =>
    pileTargets({ kind: 'card', card: id, x: 0, y: 0 }, view).map((t) => [t.pile, t.drop, t.label]);

  it("offers a card its owner's deck and discard pile, not the out-of-play piles", () => {
    // Those are not drawn on the table: Move to ▾ sends a card there.
    expect(of('mine')).toEqual([
      ['deck:p0', 'top', 'Top of deck'],
      ['disc:p0', 'discard', 'Discard'],
    ]);
    expect(of('minion')).toEqual([
      ['enc', 'top', 'Top of deck'],
      ['encd', 'discard', 'Discard'],
    ]);
  });

  it("keeps another player's deck out, as the menus do", () => {
    expect(of('theirs')).toEqual([['disc:p1', 'discard', 'Discard']]);
  });

  it('offers nothing for the card a stage shows, or a card it is tucked under', () => {
    expect(of('v')).toEqual([]);
    expect(of('over')).toEqual([]);
    // What is tucked under it can go: on top of the deck, or to the discard pile.
    expect(of('under')).toHaveLength(2);
  });

  it('offers nothing for an identity card, or a card it is tucked under', () => {
    const withIdentity = makeView({
      cards: [
        card('host'),
        card('hero', { identity: true, parent: 'host' }),
        card('up', { parent: 'hero' }),
      ],
      piles,
    });
    const targetsOf = (id: string) =>
      pileTargets({ kind: 'card', card: id, x: 0, y: 0 }, withIdentity);
    expect(targetsOf('hero')).toEqual([]);
    expect(targetsOf('host')).toEqual([]);
    // What is tucked under it can go: the top of its deck, or its discard pile.
    expect(targetsOf('up').map((t) => t.drop)).toEqual(['top', 'discard']);
  });

  it('offers the encounter deck its discard pile, and itself, where a drop sends nothing', () => {
    const encounter: DragSource = { kind: 'encounter', pile: 'enc' };
    expect(pileTargets(encounter, view).map((t) => [t.pile, t.drop, t.label])).toEqual([
      ['encd', 'discard', 'Discard'],
      ['enc', 'return', 'Top of deck'],
    ]);
    const own: DropRect = {
      kind: 'pile',
      pile: 'enc',
      drop: 'return',
      label: 'Top of deck',
      rect: rect(0, 0, 1, 1),
    };
    expect(dropAction(encounter, own, AT_ORIGIN, DEAL_TO)).toBeNull();
  });

  it('puts an encounter card from the table on top of the encounter deck, its home', () => {
    const home: DropRect = {
      kind: 'pile',
      pile: 'enc',
      drop: 'top',
      label: 'Top of deck',
      rect: rect(0, 0, 1, 1),
    };
    const minion: DragSource = { kind: 'card', card: 'minion', x: 0, y: 0 };
    expect(dropAction(minion, home, AT_ORIGIN, DEAL_TO)).toEqual({
      kind: 'toDeck',
      card: 'minion',
      where: 'top',
      pile: 'enc',
    });
  });
});

describe('handAreaOf', () => {
  const view = makeView({
    cards: [
      card('mine'),
      card('theirs', { owner: 1 }),
      card('enc', { owner: -1, back: 'encounter' }),
      card('h1', { zone: 'hand' }),
    ],
    piles: [pile('disc:p0', { kind: 'discard', owner: 0, cards: ['d1'], count: 1 })],
  });

  it("takes the viewer's own table cards only, as Move to ▾ Hand", () => {
    const tableCard = (id: string): DragSource => ({
      kind: 'card',
      card: id,
      x: 0,
      y: 0,
    });
    expect(handAreaOf(tableCard('mine'), view)).toBe('p0');
    expect(handAreaOf(tableCard('theirs'), view)).toBeNull();
    expect(handAreaOf(tableCard('enc'), view)).toBeNull();
  });

  it('takes no identity card, nor a card it is tucked under', () => {
    const withIdentity = makeView({
      cards: [
        card('host'),
        card('hero', { identity: true, parent: 'host' }),
        card('up', { parent: 'hero' }),
      ],
    });
    const tableCard = (id: string): DragSource => ({ kind: 'card', card: id, x: 0, y: 0 });
    expect(handAreaOf(tableCard('hero'), withIdentity)).toBeNull();
    expect(handAreaOf(tableCard('host'), withIdentity)).toBeNull();
    expect(handAreaOf(tableCard('up'), withIdentity)).toBe('p0');
  });

  it('takes nothing from the hand or a pile, nor from a spectator', () => {
    const fromHand: DragSource = { kind: 'hand', card: 'h1', hand: ['h1'], area: 'p0' };
    expect(handAreaOf(fromHand, view)).toBeNull();
    expect(handAreaOf({ kind: 'pile', pile: 'disc:p0', card: 'd1' }, view)).toBeNull();
    expect(handAreaOf({ kind: 'encounter', pile: 'encd' }, view)).toBeNull();
    const spectating = makeView({ cards: [card('mine')], spectator: true });
    expect(handAreaOf(TABLE_CARD, spectating)).toBeNull();
  });
});

describe('goesToHand', () => {
  const view = makeView({
    cards: [card('mine'), card('also'), card('theirs', { owner: 1 }), card('h1', { zone: 'hand' })],
  });
  const tableCard = (id: string): DragSource => ({ kind: 'card', card: id, x: 0, y: 0 });

  it('takes a card a hand takes, as handAreaOf has it, when no group is dragged', () => {
    expect(goesToHand(tableCard('mine'), [], view)).toBe(true);
    expect(goesToHand(tableCard('theirs'), [], view)).toBe(false);
    expect(goesToHand({ kind: 'hand', card: 'h1', hand: ['h1'], area: 'p0' }, [], view)).toBe(
      false,
    );
  });

  it('takes a group only when every unit goes to a hand', () => {
    expect(goesToHand(tableCard('mine'), ['mine', 'also'], view)).toBe(true);
    expect(goesToHand(tableCard('mine'), ['mine', 'theirs'], view)).toBe(false);
  });
});

describe('takesHandDrop', () => {
  const view = makeView({
    cards: [card('mine'), card('also'), card('theirs', { owner: 1 }), card('h1', { zone: 'hand' })],
  });
  const tableCard = (id: string): DragSource => ({ kind: 'card', card: id, x: 0, y: 0 });

  it('takes a hand card back, which goesToHand alone does not', () => {
    const handCard: DragSource = { kind: 'hand', card: 'h1', hand: ['h1'], area: 'p0' };
    expect(takesHandDrop(handCard, [], view)).toBe(true);
    expect(goesToHand(handCard, [], view)).toBe(false);
  });

  it('takes what goes to a hand, one card or a whole group', () => {
    expect(takesHandDrop(tableCard('mine'), [], view)).toBe(true);
    expect(takesHandDrop(tableCard('theirs'), [], view)).toBe(false);
    expect(takesHandDrop(tableCard('mine'), ['mine', 'also'], view)).toBe(true);
    expect(takesHandDrop(tableCard('mine'), ['mine', 'theirs'], view)).toBe(false);
  });

  it('takes nothing from a pile or the encounter deck', () => {
    expect(takesHandDrop({ kind: 'encounter', pile: 'encd' }, [], view)).toBe(false);
  });
});

describe('stackOf', () => {
  // A chain: r, then c1 tucked under it, c2 under c1, c3 under c2; a card in a pile is left out.
  const chain = [
    card('c2', { parent: 'c1' }),
    card('r'),
    card('c3', { parent: 'c2' }),
    card('c1', { parent: 'r' }),
    card('other', { parent: 'x' }),
    card('gone', { parent: 'c3', zone: 'pile' }),
  ];

  it('is the whole chain of a main card, in order', () => {
    expect(stackOf('r', chain)).toEqual(['r', 'c1', 'c2', 'c3']);
  });

  it('is a tucked card alone, in the middle of the chain or at its end', () => {
    expect(stackOf('c1', chain)).toEqual(['c1']);
    expect(stackOf('c2', chain)).toEqual(['c2']);
    expect(stackOf('c3', chain)).toEqual(['c3']);
  });

  it('is a card tucked under none alone when nothing is tucked under it', () => {
    expect(stackOf('solo', [card('solo')])).toEqual(['solo']);
  });
});

describe('mainCardOf', () => {
  // r, then c1 tucked under it, c2 under c1.
  const chain = [card('c1', { parent: 'r' }), card('r'), card('c2', { parent: 'c1' })];
  const mainOf = (id: string) => {
    const start = chain.find((c) => c.id === id)!;
    return mainCardOf(start, chain).id;
  };

  it('is the card on top of the stack, whatever card of the chain it starts from', () => {
    for (const id of ['r', 'c1', 'c2']) {
      expect(mainOf(id), id).toBe('r');
    }
  });

  it('is the card itself when it is tucked under none', () => {
    const solo = card('solo');
    expect(mainCardOf(solo, [solo]).id).toBe('solo');
  });

  it('stops at the last card found up a chain whose host is missing', () => {
    const orphan = card('orphan', { parent: 'gone' });
    expect(mainCardOf(orphan, [orphan]).id).toBe('orphan');
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

describe("the top card of the viewer's deck", () => {
  const deck: DragSource = { kind: 'deck', pile: 'deck:p0' };
  const view = makeView({
    piles: [
      pile('deck:p0', { owner: 0 }),
      pile('disc:p0', { kind: 'discard', owner: 0, count: 0, cards: [] }),
      pile('disc:p1', { kind: 'discard', owner: 1, count: 0, cards: [] }),
    ],
  });

  it('is drawn when dropped on the hand', () => {
    expect(handAreaOf(deck, view)).toBe('p0');
    const hand: DropRect = { kind: 'toHand', rect: rect(0, 0, 1, 1) };
    expect(dropAction(deck, hand, AT_ORIGIN, DEAL_TO)).toEqual({ kind: 'draw', n: 1 });
  });

  it('sends nothing when dropped back on its deck', () => {
    const own: DropRect = {
      kind: 'pile',
      pile: 'deck:p0',
      drop: 'return',
      label: 'Top of deck',
      rect: rect(0, 0, 1, 1),
    };
    expect(dropAction(deck, own, AT_ORIGIN, DEAL_TO)).toBeNull();
  });

  it('is discarded on its own discard pile, and takes its own deck back', () => {
    expect(pileTargets(deck, view)).toEqual([
      { pile: 'disc:p0', drop: 'discard', label: 'Discard' },
      { pile: 'deck:p0', drop: 'return', label: 'Top of deck' },
    ]);
    const discard: DropRect = {
      kind: 'pile',
      pile: 'disc:p0',
      drop: 'discard',
      label: 'Discard',
      rect: rect(0, 0, 1, 1),
    };
    expect(dropAction(deck, discard, AT_ORIGIN, DEAL_TO)).toEqual({
      kind: 'discardTop',
      pile: 'deck:p0',
      n: 1,
    });
  });

  it('is played where it lands on the table, face down: a drop is no explicit Play', () => {
    const onTable = dropAction(deck, TABLE, { x: 304, y: 296 }, DEAL_TO);
    expect(onTable).toEqual({
      kind: 'play',
      pile: 'deck:p0',
      x: 300,
      y: 300,
    });
    expect(onTable).not.toHaveProperty('faceUp');
  });

  it('is played under the card it is dropped on, in one action, face down as the server plays it', () => {
    const onCard: DropRect = { kind: 'card', card: 'x', z: 1, rect: rect(0, 0, 1, 1) };
    const underCard = dropAction(deck, onCard, { x: 40, y: 60 }, DEAL_TO);
    expect(underCard).toEqual({
      kind: 'play',
      pile: 'deck:p0',
      target: 'x',
    });
    expect(underCard).not.toHaveProperty('faceUp');
  });
});

describe('the first player token', () => {
  const token: DragSource = { kind: 'marker', name: 'firstPlayer', x: 860, y: 40 };
  const card: DropRect = { kind: 'card', card: 'c', z: 1, rect: rect(0, 0, 1, 1) };
  const discard: DropRect = {
    kind: 'pile',
    pile: 'disc:p1',
    drop: 'discard',
    label: 'Discard',
    rect: rect(0, 0, 1, 1),
  };

  it('is taken by a player from where it lies, never by a spectator', () => {
    expect(sourceOf({ kind: 'marker', name: 'firstPlayer' }, makeView())).toEqual({
      kind: 'marker',
      name: 'firstPlayer',
      x: 0,
      y: 0,
    });
    expect(
      sourceOf({ kind: 'marker', name: 'firstPlayer' }, makeView({ spectator: true })),
    ).toBeNull();
  });

  it('goes where it lands, snapped, even over a card or a pile', () => {
    const at = { x: 164, y: 43 };
    const moved = { kind: 'marker', name: 'firstPlayer', x: 160, y: 40 };

    expect(dropAction(token, { kind: 'table', rect: rect(0, 0, 1, 1) }, at, DEAL_TO)).toEqual(
      moved,
    );
    expect(dropAction(token, card, at, DEAL_TO)).toEqual(moved);
    expect(dropAction(token, discard, at, DEAL_TO)).toEqual(moved);
  });

  it('sends nothing when put back where it was, and goes to no pile or hand', () => {
    const table: DropRect = { kind: 'table', rect: rect(0, 0, 1, 1) };
    expect(dropAction(token, table, { x: 858, y: 42 }, DEAL_TO)).toBeNull();
    expect(pileTargets(token, makeView())).toEqual([]);
    expect(handAreaOf(token, makeView())).toBeNull();
  });
});

describe('a player with two decks', () => {
  /** Alex plays p0 and p1; Sam sits at p2. */
  function twoDeckView(): View {
    const view = makeView({
      cards: [
        card('second', { owner: 1 }),
        card('sams', { owner: 2 }),
        card('h4', { zone: 'hand', owner: 1 }),
      ],
      piles: [
        pile('deck:p1', { owner: 1 }),
        pile('disc:p1', { kind: 'discard', owner: 1, count: 0, cards: [] }),
        pile('deck:p2', { owner: 2 }),
        pile('disc:p2', { kind: 'discard', owner: 2, count: 0, cards: [] }),
      ],
      hands: { p0: ['h1', 'h2', 'h3'], p1: ['h4'] },
    });
    view.you.areas = ['p0', 'p1'];
    return view;
  }

  it('drag to hand target for own second seat', () => {
    const view = twoDeckView();
    const tableCard = (id: string): DragSource => ({ kind: 'card', card: id, x: 0, y: 0 });
    expect(handAreaOf(tableCard('second'), view)).toBe('p1');
    expect(handAreaOf(tableCard('sams'), view)).toBeNull();
    expect(handAreaOf({ kind: 'deck', pile: 'deck:p1' }, view)).toBe('p1');
  });

  it("drags from the second deck and its hand, never from another player's deck", () => {
    const view = twoDeckView();
    expect(sourceOf({ kind: 'pile', id: 'deck:p1' }, view)).toEqual({
      kind: 'deck',
      pile: 'deck:p1',
    });
    expect(sourceOf({ kind: 'pile', id: 'deck:p2' }, view)).toBeNull();
    expect(sourceOf({ kind: 'hand', id: 'h4' }, view)).toEqual({
      kind: 'hand',
      card: 'h4',
      hand: ['h4'],
      area: 'p1',
    });
  });

  it("offers the second deck's own piles", () => {
    const view = twoDeckView();
    const targets = (drag: DragSource) => pileTargets(drag, view).map((t) => t.pile);
    expect(targets({ kind: 'card', card: 'second', x: 0, y: 0 })).toEqual(['deck:p1', 'disc:p1']);
    expect(targets({ kind: 'card', card: 'sams', x: 0, y: 0 })).toEqual(['disc:p2']);
    expect(targets({ kind: 'deck', pile: 'deck:p1' })).toEqual(['disc:p1', 'deck:p1']);
  });
});

describe('dropping a card on its deck', () => {
  const deckRect = rect(100, 350, 140, 200);
  const top: DropRect = {
    kind: 'pile',
    pile: 'deck:p0',
    drop: 'top',
    label: 'Top of deck',
    rect: deckRect,
  };

  it('puts a table card or a hand card on top of its deck', () => {
    expect(dropAction(TABLE_CARD, top, AT_ORIGIN, DEAL_TO)).toEqual({
      kind: 'toDeck',
      card: 'c',
      where: 'top',
      pile: 'deck:p0',
    });
    const hand: DragSource = { kind: 'hand', card: 'h1', hand: ['h1'], area: 'p0' };
    expect(dropAction(hand, top, AT_ORIGIN, DEAL_TO)).toEqual({
      kind: 'toDeck',
      card: 'h1',
      where: 'top',
      pile: 'deck:p0',
    });
  });

  it('puts a card revealed on its deck back on top of it', () => {
    const view = makeView({
      cards: [card('r', { onPile: 'deck:p0' })],
      piles: [pile('deck:p0', { owner: 0 })],
    });
    const revealed = sourceOf({ kind: 'card', id: 'r' }, view);
    if (revealed === null) {
      throw new Error('the revealed card cannot be dragged');
    }
    expect(pileTargets(revealed, view)).toEqual([
      { pile: 'deck:p0', drop: 'top', label: 'Top of deck' },
    ]);
    expect(dropAction(revealed, top, AT_ORIGIN, DEAL_TO)).toEqual({
      kind: 'toDeck',
      card: 'r',
      where: 'top',
      pile: 'deck:p0',
    });
  });
});

describe('side decks', () => {
  // Alex (p0) plays Doctor Strange (Invocation, with a discard pile) and Daredevil's Sense deck
  // (none); Sam (p1) has an Invocation deck too.
  const piles = [
    pile('deck:p0', { owner: 0 }),
    pile('disc:p0', { kind: 'discard', owner: 0, count: 0, cards: [] }),
    pile('side:p0:0', {
      kind: 'sideDeck',
      owner: 0,
      count: 4,
      label: 'Invocation',
      topFaceUp: true,
      cards: ['inv-top'],
      discard: 'sided:p0:0',
    }),
    pile('sided:p0:0', {
      kind: 'sideDiscard',
      owner: 0,
      count: 1,
      label: 'Invocation',
      cards: ['inv-used'],
    }),
    pile('side:p0:1', { kind: 'sideDeck', owner: 0, count: 5, label: 'Sense' }),
    pile('side:p1:0', { kind: 'sideDeck', owner: 1, count: 5, label: 'Invocation' }),
  ];
  const cards = [
    card('inv', { home: 'side:p0:0' }),
    card('sense', { home: 'side:p0:1' }),
    card('inv-top', { zone: 'pile', home: 'side:p0:0' }),
    card('inv-used', { zone: 'pile', home: 'side:p0:0' }),
  ];
  const view = makeView({ cards, piles });
  const of = (drag: DragSource) => pileTargets(drag, view).map((t) => [t.pile, t.drop, t.label]);

  it('offers a side card the top of its side deck first, and its discard pile when it has one', () => {
    expect(of({ kind: 'card', card: 'inv', x: 0, y: 0 })).toEqual([
      ['side:p0:0', 'top', 'Top of Invocation deck'],
      ['deck:p0', 'top', 'Top of deck'],
      ['side:p0:1', 'top', 'Top of Sense deck'],
      ['sided:p0:0', 'discard', 'Discard'],
    ]);
    // The Sense deck has no discard pile: no drop discards a Sense card.
    expect(of({ kind: 'card', card: 'sense', x: 0, y: 0 })).toEqual([
      ['side:p0:1', 'top', 'Top of Sense deck'],
      ['deck:p0', 'top', 'Top of deck'],
      ['side:p0:0', 'top', 'Top of Invocation deck'],
    ]);
  });

  it("drags the top of the viewer's own side decks, never another player's", () => {
    expect(sourceOf({ kind: 'pile', id: 'side:p0:0' }, view)).toEqual({
      kind: 'deck',
      pile: 'side:p0:0',
    });
    expect(sourceOf({ kind: 'pile', id: 'side:p1:0' }, view)).toBeNull();
    expect(sourceOf({ kind: 'pile', id: 'sided:p0:0' }, view)).toEqual({
      kind: 'pile',
      pile: 'sided:p0:0',
      card: 'inv-used',
    });
  });

  it('plays the top card of a side deck face up, draws it, or discards it to its own discard pile', () => {
    const side: DragSource = { kind: 'deck', pile: 'side:p0:0' };
    expect(dropAction(side, TABLE, { x: 304, y: 296 }, DEAL_TO)).toEqual({
      kind: 'play',
      pile: 'side:p0:0',
      x: 300,
      y: 300,
    });
    const hand: DropRect = { kind: 'toHand', rect: rect(0, 0, 1, 1) };
    expect(handAreaOf(side, view)).toBe('p0');
    expect(dropAction(side, hand, AT_ORIGIN, DEAL_TO)).toEqual({
      kind: 'draw',
      n: 1,
      pile: 'side:p0:0',
    });
    expect(of(side)).toEqual([
      ['sided:p0:0', 'discard', 'Discard'],
      ['side:p0:0', 'return', 'Top of Invocation deck'],
    ]);
    expect(of({ kind: 'deck', pile: 'side:p0:1' })).toEqual([
      ['side:p0:1', 'return', 'Top of Sense deck'],
    ]);
    const own: DropRect = {
      kind: 'pile',
      pile: 'side:p0:1',
      drop: 'return',
      label: 'Top of Sense deck',
      rect: rect(0, 0, 1, 1),
    };
    expect(dropAction({ kind: 'deck', pile: 'side:p0:1' }, own, AT_ORIGIN, DEAL_TO)).toBeNull();
  });

  it('plays the top card of a side deck tucked under the card it is dropped on, in one action', () => {
    const onCard: DropRect = { kind: 'card', card: 'x', z: 1, rect: rect(0, 0, 1, 1) };
    for (const deck of ['side:p0:0', 'side:p0:1']) {
      expect(dropAction({ kind: 'deck', pile: deck }, onCard, { x: 44, y: 62 }, DEAL_TO)).toEqual({
        kind: 'play',
        pile: deck,
        target: 'x',
      });
    }
  });

  it("returns a side discard pile's top card to its side deck", () => {
    expect(of({ kind: 'pile', pile: 'sided:p0:0', card: 'inv-used' })).toEqual([
      ['side:p0:0', 'top', 'Top of Invocation deck'],
      ['deck:p0', 'top', 'Top of deck'],
      ['side:p0:1', 'top', 'Top of Sense deck'],
      ['sided:p0:0', 'discard', 'Discard'],
    ]);
    const top: DropRect = {
      kind: 'pile',
      pile: 'side:p0:0',
      drop: 'top',
      label: 'Top of Invocation deck',
      rect: rect(0, 0, 1, 1),
    };
    const fromDiscard: DragSource = { kind: 'pile', pile: 'sided:p0:0', card: 'inv-used' };
    expect(dropAction(fromDiscard, top, AT_ORIGIN, DEAL_TO)).toEqual({
      kind: 'toDeck',
      card: 'inv-used',
      where: 'top',
      pile: 'side:p0:0',
    });
  });
});

describe('a scenario deck', () => {
  // A scenario deck with its own discard pile, as Red Skull's side-scheme deck has, belongs to
  // nobody; so does the Wrecker's encounter deck, dealt from.
  const piles = [
    pile('deck:p0', { owner: 0 }),
    pile('sdeck:weapons', {
      kind: 'scenarioDeck',
      count: 4,
      label: 'Experimental Weapons',
      discard: 'sdisc:weapons',
    }),
    pile('sdisc:weapons', {
      kind: 'scenarioDiscard',
      count: 0,
      label: 'Experimental Weapons',
      cards: [],
    }),
    pile('sdeck:schemes', { kind: 'scenarioDeck', count: 0, label: 'Side-scheme' }),
  ];
  const view = makeView({ piles });
  const weapons: DragSource = { kind: 'deck', pile: 'sdeck:weapons' };

  it('is dragged by any player, never by a spectator, nor when it is empty', () => {
    expect(sourceOf({ kind: 'pile', id: 'sdeck:weapons' }, view)).toEqual(weapons);
    expect(sourceOf({ kind: 'pile', id: 'sdeck:schemes' }, view)).toBeNull();
    const spectating = makeView({ piles, spectator: true });
    expect(sourceOf({ kind: 'pile', id: 'sdeck:weapons' }, spectating)).toBeNull();
  });

  it('plays its top card where it lands on the table, face up as the server plays it', () => {
    expect(dropAction(weapons, TABLE, { x: 304, y: 296 }, DEAL_TO)).toEqual({
      kind: 'play',
      pile: 'sdeck:weapons',
      x: 300,
      y: 300,
    });
  });

  it('plays its top card tucked under the card it is dropped on, in one action', () => {
    const onCard: DropRect = { kind: 'card', card: 'x', z: 1, rect: rect(0, 0, 1, 1) };
    expect(dropAction(weapons, onCard, { x: 44, y: 62 }, DEAL_TO)).toEqual({
      kind: 'play',
      pile: 'sdeck:weapons',
      target: 'x',
    });
  });

  it('takes its own deck, where a drop leaves it, and discards to its own discard pile', () => {
    expect(pileTargets(weapons, view).map((t) => [t.pile, t.drop])).toEqual([
      ['sdisc:weapons', 'discard'],
      ['sdeck:weapons', 'return'],
    ]);
    const own: DropRect = {
      kind: 'pile',
      pile: 'sdeck:weapons',
      drop: 'return',
      label: 'Top of deck',
      rect: rect(0, 0, 1, 1),
    };
    expect(dropAction(weapons, own, AT_ORIGIN, DEAL_TO)).toBeNull();
    const discard: DropRect = {
      kind: 'pile',
      pile: 'sdisc:weapons',
      drop: 'discard',
      label: 'Discard',
      rect: rect(0, 0, 1, 1),
    };
    expect(dropAction(weapons, discard, AT_ORIGIN, DEAL_TO)).toEqual({
      kind: 'discardTop',
      pile: 'sdeck:weapons',
      n: 1,
    });
  });

  it('goes to no hand', () => {
    expect(handAreaOf(weapons, view)).toBeNull();
    const hand: DropRect = { kind: 'toHand', rect: rect(0, 0, 1, 1) };
    expect(dropAction(weapons, hand, AT_ORIGIN, DEAL_TO)).toBeNull();
  });
});

describe('a scenario deck without a discard pile of its own', () => {
  // Crossbones' Experimental Weapons: a weapon is discarded to the encounter discard pile.
  const piles = [
    pile('enc', { kind: 'encounter' }),
    pile('encd', { kind: 'encounterDiscard', count: 0, cards: [] }),
    pile('sdeck:weapons', {
      kind: 'scenarioDeck',
      count: 3,
      label: 'Experimental Weapons',
      discard: 'encd',
    }),
  ];
  const cards = [card('weapon', { owner: -1, back: 'encounter', home: 'sdeck:weapons' })];
  const view = makeView({ cards, piles });
  const weapons: DragSource = { kind: 'deck', pile: 'sdeck:weapons' };
  const of = (drag: DragSource) => pileTargets(drag, view).map((t) => [t.pile, t.drop]);

  it('discards its top card to the encounter discard pile, and takes its own deck', () => {
    expect(of(weapons)).toEqual([
      ['encd', 'discard'],
      ['sdeck:weapons', 'return'],
    ]);
    const discard: DropRect = {
      kind: 'pile',
      pile: 'encd',
      drop: 'discard',
      label: 'Discard',
      rect: rect(0, 0, 1, 1),
    };
    expect(dropAction(weapons, discard, AT_ORIGIN, DEAL_TO)).toEqual({
      kind: 'discardTop',
      pile: 'sdeck:weapons',
      n: 1,
    });
  });

  it('offers a played weapon the top of its deck, of the encounter deck, and the encounter discard pile', () => {
    expect(of({ kind: 'card', card: 'weapon', x: 0, y: 0 })).toEqual([
      ['sdeck:weapons', 'top'],
      ['enc', 'top'],
      ['encd', 'discard'],
    ]);
  });

  it('offers no discard when the deck never discards its cards', () => {
    const none = makeView({
      cards,
      piles: [
        ...piles.filter((p) => p.id !== 'sdeck:weapons'),
        pile('sdeck:weapons', { kind: 'scenarioDeck', count: 3, label: 'Experimental Weapons' }),
      ],
    });
    expect(pileTargets(weapons, none).map((t) => t.pile)).toEqual(['sdeck:weapons']);
    expect(
      pileTargets({ kind: 'card', card: 'weapon', x: 0, y: 0 }, none).map((t) => t.pile),
    ).toEqual(['sdeck:weapons', 'enc']);
  });
});

describe('a deck takes any card of its owner', () => {
  // Red Skull's Side-scheme deck belongs to nobody, as the encounter deck does; Alex (p0) plays
  // Daredevil and his Sense deck, Sam (p1) Doctor Strange and his Invocation deck.
  const piles = [
    pile('enc', { kind: 'encounter' }),
    pile('encd', { kind: 'encounterDiscard', count: 0, cards: [] }),
    pile('sdeck:schemes', {
      kind: 'scenarioDeck',
      count: 4,
      label: 'Side-scheme',
      discard: 'sdisc:schemes',
    }),
    pile('sdisc:schemes', { kind: 'scenarioDiscard', count: 0, label: 'Side-scheme', cards: [] }),
    pile('deck:p0', { owner: 0 }),
    pile('disc:p0', { kind: 'discard', owner: 0, count: 0, cards: [] }),
    pile('side:p0:0', { kind: 'sideDeck', owner: 0, count: 5, label: 'Sense' }),
    pile('deck:p1', { owner: 1 }),
    pile('disc:p1', { kind: 'discard', owner: 1, count: 0, cards: [] }),
    pile('side:p1:0', { kind: 'sideDeck', owner: 1, count: 5, label: 'Invocation' }),
  ];
  const cards = [
    // Hydra Patrol, a modular side scheme: its home is the encounter deck.
    card('patrol', { owner: -1, back: 'encounter' }),
    card('mine'),
    card('sense', { home: 'side:p0:0' }),
    card('theirs', { owner: 1 }),
    card('h1', { zone: 'hand' }),
  ];
  const view = makeView({ cards, piles });
  const of = (id: string) =>
    pileTargets({ kind: 'card', card: id, x: 0, y: 0 }, view).map((t) => [t.pile, t.drop, t.label]);

  it('offers an encounter card the top of every deck of nobody, its home first', () => {
    expect(of('patrol')).toEqual([
      ['enc', 'top', 'Top of deck'],
      ['sdeck:schemes', 'top', 'Top of Side-scheme deck'],
      ['encd', 'discard', 'Discard'],
    ]);
  });

  it("offers the viewer's card the top of each of their decks, side decks included", () => {
    expect(of('mine')).toEqual([
      ['deck:p0', 'top', 'Top of deck'],
      ['side:p0:0', 'top', 'Top of Sense deck'],
      ['disc:p0', 'discard', 'Discard'],
    ]);
    expect(of('sense')).toEqual([
      ['side:p0:0', 'top', 'Top of Sense deck'],
      ['deck:p0', 'top', 'Top of deck'],
    ]);
    const hand = pileTargets({ kind: 'hand', card: 'h1', hand: ['h1'], area: 'p0' }, view);
    expect(hand.map((t) => t.pile)).toEqual(['deck:p0', 'side:p0:0', 'disc:p0']);
  });

  it('takes a drop near the home deck, and only right over another deck', () => {
    const exact = (id: string) =>
      pileTargets({ kind: 'card', card: id, x: 0, y: 0 }, view).map((t) => [t.pile, t.exact]);
    expect(exact('patrol')).toEqual([
      ['enc', undefined],
      ['sdeck:schemes', true],
      ['encd', undefined],
    ]);
    expect(exact('sense')).toEqual([
      ['side:p0:0', undefined],
      ['deck:p0', true],
    ]);
  });

  it("never offers another player's deck or side deck", () => {
    expect(of('theirs')).toEqual([['disc:p1', 'discard', 'Discard']]);
  });

  it('puts the card on top of the deck it is dropped on, naming that deck', () => {
    const schemes: DropRect = {
      kind: 'pile',
      pile: 'sdeck:schemes',
      drop: 'top',
      label: 'Top of Side-scheme deck',
      rect: rect(0, 0, 1, 1),
    };
    const patrol: DragSource = { kind: 'card', card: 'patrol', x: 0, y: 0 };
    expect(dropAction(patrol, schemes, AT_ORIGIN, DEAL_TO)).toEqual({
      kind: 'toDeck',
      card: 'patrol',
      where: 'top',
      pile: 'sdeck:schemes',
    });
    const sense: DropRect = { ...schemes, pile: 'side:p0:0', label: 'Top of Sense deck' };
    const mine: DragSource = { kind: 'card', card: 'mine', x: 0, y: 0 };
    expect(dropAction(mine, sense, AT_ORIGIN, DEAL_TO)).toEqual({
      kind: 'toDeck',
      card: 'mine',
      where: 'top',
      pile: 'side:p0:0',
    });
  });
});

describe('the drop the rows show in dock mode', () => {
  // Player 1's row of four cards, drawn at 0.6 and wrapped at 400 (see dropAction in dock mode).
  const FRAME: DockItem = { id: 'frame', x: -10, y: 460, w: 262, h: 157 + 20, kind: 'frame' };
  const items: DockItem[] = [
    FRAME,
    ...[300, 452, 604, 756].map((x, i): DockItem => ({
      id: `c${i}`,
      x,
      y: 470,
      w: 112,
      h: 157,
      kind: 'card',
    })),
  ];
  const map = dockLayout({ items, rows: [1], wrapWidth: 400 });
  /** A card's slot for its middle drawn at x, on the row's second line. */
  const slotAt = (at: { x: number; y: number }) => map.insertAt({ x: at.x, y: at.y }, 112);
  const keyOf = (spot: { x: number; y: number }) => `${spot.x},${spot.y}`;
  const Y = 190;

  /** The first drawn x, going right by a pixel, whose slot differs from the one at `from`. */
  function boundaryFrom(from: number): number {
    const first = keyOf(slotAt({ x: from, y: Y }));
    for (let x = from; x < from + 400; x++) {
      if (keyOf(slotAt({ x, y: Y })) !== first) {
        return x;
      }
    }
    throw new Error('no boundary');
  }

  it('keeps one slot while the pointer jitters by a pixel on the boundary between two', () => {
    const boundary = boundaryFrom(0);
    const jitter = [boundary - 1, boundary, boundary - 1, boundary + 1, boundary, boundary - 1];
    // Under the pointer alone, the slot flips with each pixel.
    expect(new Set(jitter.map((x) => keyOf(slotAt({ x, y: Y })))).size).toBe(2);

    const steady = new SteadyDrop(keyOf);
    const shown = jitter.map((x, frame) =>
      keyOf(steady.settle({ x, y: Y }, DROP_MARGIN, frame * 16, slotAt)),
    );
    expect(new Set(shown)).toEqual(new Set([keyOf(slotAt({ x: boundary - 1, y: Y }))]));
  });

  it('shows the next slot once the pointer is a margin past the boundary', () => {
    const boundary = boundaryFrom(0);
    const steady = new SteadyDrop(keyOf);
    steady.settle({ x: boundary - 1, y: Y }, DROP_MARGIN, 0, slotAt);

    const within = steady.settle({ x: boundary + DROP_MARGIN - 2, y: Y }, DROP_MARGIN, 16, slotAt);
    expect(keyOf(within)).toBe(keyOf(slotAt({ x: boundary - 1, y: Y })));
    const past = steady.settle({ x: boundary + DROP_MARGIN, y: Y }, DROP_MARGIN, 32, slotAt);
    expect(past).toEqual(slotAt({ x: boundary + DROP_MARGIN, y: Y }));
    // Back to the boundary, then a pixel over it: the new slot holds in turn.
    for (let x = boundary + DROP_MARGIN - 1; x >= boundary; x--) {
      steady.settle({ x, y: Y }, DROP_MARGIN, 48, slotAt);
    }
    expect(steady.settle({ x: boundary - 1, y: Y }, DROP_MARGIN, 64, slotAt)).toEqual(past);
  });

  it('shows the slot under the pointer once it stays past the boundary 80 ms', () => {
    const boundary = boundaryFrom(0);
    const steady = new SteadyDrop(keyOf);
    const before = steady.settle({ x: boundary - 1, y: Y }, DROP_MARGIN, 0, slotAt);
    const over = { x: boundary + 1, y: Y };

    expect(steady.settle(over, DROP_MARGIN, 100, slotAt)).toEqual(before);
    expect(steady.waiting).toBe(true);
    expect(steady.settle(over, DROP_MARGIN, 100 + DROP_DWELL_MS - 1, slotAt)).toEqual(before);
    expect(steady.settle(over, DROP_MARGIN, 100 + DROP_DWELL_MS, slotAt)).toEqual(slotAt(over));
    expect(steady.waiting).toBe(false);
  });

  it('drops in the slot shown, not the one under a pointer let go a pixel past it', () => {
    const boundary = boundaryFrom(0);
    // The drop a card dragged with its middle at a point sends, as DragLayer locates it.
    const spot = (corner: { x: number; y: number }) =>
      slotAt({ x: corner.x + 33.6, y: corner.y + 47.1 });
    const dropAt = (middle: { x: number; y: number }) =>
      dropAction(TABLE_CARD, TABLE, { x: middle.x - 33.6, y: middle.y - 47.1 }, DEAL_TO, map, spot);
    const steady = new SteadyDrop((action: ReturnType<typeof dropAt>) => JSON.stringify(action));
    const shown = steady.settle({ x: boundary - 1, y: Y }, DROP_MARGIN, 0, dropAt);

    const letGo = { x: boundary + 1, y: Y };
    expect(dropAt(letGo)).not.toEqual(shown);
    expect(steady.settle(letGo, DROP_MARGIN, 16, dropAt)).toEqual(shown);
  });

  it('reads the cards where they lie, not where they make way for the drag', () => {
    // A card drawn 91.2 right of where it lies at zoom 2, mid-way through its glide: at 45.6.
    const drawn = rect(300, 100, 100, 140);
    expect(unshifted(drawn, '45.6px 0px', 2)).toEqual(rect(208.8, 100, 100, 140));
    expect(unshifted(drawn, '-10px 6px', 1)).toEqual(rect(310, 94, 100, 140));
    expect(unshifted(drawn, '12px', 1)).toEqual(rect(288, 100, 100, 140));
    expect(unshifted(drawn, 'none', 2)).toEqual(drawn);

    // The pointer over the gap the card left as it made way drops on the table, not on that card.
    const table: DropRect = { kind: 'table', rect: rect(0, 0, 1000, 800) };
    const pushed: DropRect = { kind: 'card', card: 'other', z: 1, rect: drawn };
    const lies: DropRect = { ...pushed, rect: unshifted(drawn, '91.2px 0px', 1) };
    const pointer = { x: 380, y: 150 };
    expect(dropTarget(pointer, [table, pushed])?.kind).toBe('card');
    expect(dropTarget(pointer, [table, lies])?.kind).toBe('table');
  });

  it('keys a drop by what it lands on and what it sends, not by where it was measured', () => {
    const onTable: DropRect = { kind: 'table', rect: rect(0, 0, 10, 10) };
    const move = { kind: 'move', card: 'c', x: 40, y: 410 } as const;
    expect(dropKey(onTable, move)).toBe(dropKey({ ...onTable, rect: rect(5, 5, 10, 10) }, move));
    expect(dropKey(onTable, move)).not.toBe(dropKey(onTable, { ...move, x: 80 }));
    const onCard: DropRect = { kind: 'card', card: 'other', z: 1, rect: rect(0, 0, 10, 10) };
    const attach = { kind: 'attach', card: 'c', target: 'other' } as const;
    expect(dropKey(onCard, attach)).not.toBe(dropKey(onTable, attach));
    expect(dropKey(onTable, null)).not.toBe(dropKey(null, null));
  });
});
