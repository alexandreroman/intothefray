import { afterEach, describe, expect, it } from 'vitest';
import type { Action, CardView, PileView, View } from '../lib/types';
import type { Rect } from './drag';
import { interaction } from './interaction.svelte';
import { TABLE_LIMIT } from './layout';
import { cardsInBand, groupAction, groupPileTargets, groupUnits } from './selection';
import { card } from './fixtures.testing';
import { rowPitch, spreadRows } from './rows';

function rect(left: number, top: number, width: number, height: number): Rect {
  return { left, top, right: left + width, bottom: top + height };
}

function pile(id: string, extra: Partial<PileView> = {}): PileView {
  return { id, kind: 'deck', owner: -1, x: 0, y: 0, count: 10, ...extra };
}

/** Alex (p0) is the viewer; Sam sits at p1. */
function makeView(cards: CardView[], piles: PileView[]): View {
  return {
    id: 'g1',
    phase: 'playing',
    you: { role: 'player', name: 'Alex', color: 0, host: true, areas: ['p0'] },
    players: [],
    spectators: 0,
    config: { scenario: 'rhino', difficulty: 'standard', standard: '', expert: '', modulars: [] },
    table: {
      cards,
      piles,
      hands: { p0: [] },
      stages: [{ key: 'villain', label: 'Villain', current: 'v', cards: ['v'] }],
      firstPlayer: { x: 0, y: 0 },
    },
    log: [],
  };
}

describe('cardsInBand', () => {
  it('picks the cards whose box the band touches', () => {
    const boxes = new Map([
      ['a', rect(100, 100, 100, 140)],
      ['b', rect(400, 100, 100, 140)],
    ]);
    expect(cardsInBand(rect(0, 0, 150, 150), boxes)).toEqual(['a']);
  });

  it('picks a card the band only grazes', () => {
    const boxes = new Map([['a', rect(100, 100, 100, 140)]]);
    expect(cardsInBand(rect(0, 0, 100, 100), boxes)).toEqual(['a']);
    expect(cardsInBand(rect(0, 0, 99, 99), boxes)).toEqual([]);
  });
});

describe('groupUnits', () => {
  it('leaves out a card tucked under a selected card, in z order', () => {
    const cards = [card('x', { z: 3 }), card('t', { z: 1, parent: 'h' }), card('h', { z: 2 })];
    expect(groupUnits(new Set(['h', 't', 'x']), cards)).toEqual(['h', 'x']);
  });

  it('leaves out a card whose host is tucked under a selected card', () => {
    const cards = [card('h'), card('t', { parent: 'h' }), card('u', { parent: 't' })];
    expect(groupUnits(new Set(['h', 'u']), cards)).toEqual(['h']);
  });

  it('keeps a tucked card whose host is not selected: it detaches', () => {
    const cards = [card('h'), card('t', { parent: 'h' })];
    expect(groupUnits(new Set(['t']), cards)).toEqual(['t']);
  });

  it('leaves out cards off the table or lying on a pile', () => {
    const cards = [card('a'), card('b', { zone: 'hand' }), card('c', { onPile: 'deck:p0' })];
    expect(groupUnits(new Set(['a', 'b', 'c', 'gone']), cards)).toEqual(['a']);
  });
});

describe('groupAction', () => {
  const cards = [card('a', { x: 100, y: 100 }), card('b', { x: 300, y: 100 })];

  it('moves every unit by the same delta', () => {
    const single: Action = { kind: 'move', card: 'a', x: 200, y: 200 };
    expect(groupAction(['a', 'b'], 'a', single, cards)).toEqual({
      kind: 'group',
      actions: [
        { kind: 'move', card: 'a', x: 200, y: 200 },
        { kind: 'move', card: 'b', x: 400, y: 200 },
      ],
    });
  });

  it('keeps the shape the group is drawn in, across rows drawn closer than they lie', () => {
    // As close as they go: the villain's row drawn 310 high, its empty band from 260 squeezed into
    // 50; player 1's row from 310. A villain card in that band, drawn at 269.5, and a card of
    // player 1's, 30 into its row, drawn at 340.
    const rows = spreadRows(rowPitch(0), 1);
    const spread = [card('v', { x: 300, y: 300 }), card('p', { x: 100, y: 500 })];
    // Player 1's card dropped 20 lower: the villain card is drawn 20 lower too, at 289.5, which is
    // 384 on the table, not the 320 a table offset gives.
    const single: Action = { kind: 'move', card: 'p', x: 100, y: 520 };
    const action = groupAction(['v', 'p'], 'p', single, spread, rows);
    expect(action).toEqual({
      kind: 'group',
      actions: [
        { kind: 'move', card: 'v', x: 300, y: 384 },
        { kind: 'move', card: 'p', x: 100, y: 520 },
      ],
    });
    const drawn = (y: number) => rows.toDisplay(y) ?? NaN;
    expect(drawn(520) - drawn(384)).toBeCloseTo(drawn(500) - drawn(300), 1);
  });

  it('clampsDeltaInsideTable', () => {
    const near = [card('a', { x: 100, y: 100 }), card('b', { x: TABLE_LIMIT - 10, y: 100 })];
    const single: Action = { kind: 'move', card: 'a', x: 200, y: 100 };
    // b may move 10 more units only: a moves by as much, the offsets stay.
    expect(groupAction(['a', 'b'], 'a', single, near)).toEqual({
      kind: 'group',
      actions: [
        { kind: 'move', card: 'a', x: 110, y: 100 },
        { kind: 'move', card: 'b', x: TABLE_LIMIT, y: 100 },
      ],
    });
  });

  it('clamps a delta past the top and left edges too', () => {
    const single: Action = { kind: 'move', card: 'b', x: 0, y: 0 };
    expect(groupAction(['a', 'b'], 'b', single, cards)).toEqual({
      kind: 'group',
      actions: [
        { kind: 'move', card: 'a', x: 0, y: 0 },
        { kind: 'move', card: 'b', x: 200, y: 0 },
      ],
    });
  });

  it('sends nothing when the clamped delta moves nothing', () => {
    const edge = [card('a', { x: 0, y: 0 }), card('b', { x: 300, y: 0 })];
    const single: Action = { kind: 'move', card: 'b', x: 200, y: 0 };
    expect(groupAction(['a', 'b'], 'b', single, edge)).toBeNull();
  });

  it('attachBecomesMove', () => {
    const single: Action = { kind: 'attach', card: 'a', target: 'c', x: 200, y: 200, placed: true };
    expect(groupAction(['a', 'b'], 'a', single, cards)).toEqual({
      kind: 'group',
      actions: [
        { kind: 'move', card: 'a', x: 200, y: 200 },
        { kind: 'move', card: 'b', x: 400, y: 200 },
      ],
    });
    expect(groupAction(['a'], 'a', single, cards)).toEqual({
      kind: 'move',
      card: 'a',
      x: 200,
      y: 200,
    });
  });

  it('sends every unit to the same pile, deck or hand', () => {
    const singles: Action[] = [
      { kind: 'discard', card: 'a' },
      { kind: 'toPile', card: 'a', target: 'vic' },
      { kind: 'toDeck', card: 'a', where: 'top' },
      { kind: 'toHand', card: 'a' },
    ];
    for (const single of singles) {
      expect(groupAction(['a', 'b'], 'a', single, cards)).toEqual({
        kind: 'group',
        actions: [single, { ...single, card: 'b' }],
      });
    }
  });

  it('playOrDealIsNull', () => {
    const play: Action = { kind: 'play', card: 'a', x: 200, y: 200 };
    const deal: Action = { kind: 'deal', area: 'p0', x: 200, y: 200 };
    expect(groupAction(['a', 'b'], 'a', play, cards)).toBeNull();
    expect(groupAction(['a', 'b'], 'a', deal, cards)).toBeNull();
  });

  it('sends nothing for more units than the server takes in one group', () => {
    const many = Array.from({ length: 100 }, (_, i) => card(`u${i}`, { x: i, y: 100 }));
    const units = many.map((unit) => unit.id);
    const move: Action = { kind: 'move', card: 'u0', x: 0, y: 200 };
    const discard: Action = { kind: 'discard', card: 'u0' };
    expect(groupAction(units, 'u0', move, many)).toBeNull();
    expect(groupAction(units, 'u0', discard, many)).toBeNull();
    // 99 units are still one group.
    expect(groupAction(units.slice(0, 99), 'u0', discard, many)).toMatchObject({ kind: 'group' });
  });

  it('oneUnitReturnsSingle', () => {
    const move: Action = { kind: 'move', card: 'a', x: 200, y: 200 };
    const discard: Action = { kind: 'discard', card: 'a' };
    expect(groupAction(['a'], 'a', move, cards)).toEqual(move);
    expect(groupAction(['a'], 'a', discard, cards)).toEqual(discard);
  });
});

describe('groupPileTargets', () => {
  const piles = [
    pile('enc', { kind: 'encounter' }),
    pile('encd', { kind: 'encounterDiscard' }),
    pile('deck:p0', { owner: 0 }),
    pile('disc:p0', { kind: 'discard', owner: 0 }),
    pile('deck:p1', { owner: 1 }),
    pile('disc:p1', { kind: 'discard', owner: 1 }),
  ];
  const cards = [
    card('a'),
    card('b'),
    card('theirs', { owner: 1 }),
    card('minion', { owner: -1, back: 'encounter' }),
    card('hero', { identity: true }),
  ];
  const view = makeView(cards, piles);
  const of = (units: string[]) => groupPileTargets(units, view).map((t) => [t.pile, t.drop]);

  it('offers the targets every unit has', () => {
    expect(of(['a', 'b'])).toEqual([
      ['deck:p0', 'top'],
      ['disc:p0', 'discard'],
    ]);
  });

  it('pileTargetIntersection', () => {
    // An own card and an encounter card share no pile.
    expect(of(['a', 'minion'])).toEqual([]);
    // Another player's card has no deck target: their discard pile is not ours.
    expect(of(['a', 'theirs'])).toEqual([]);
  });

  it('offers nothing when a unit is no longer on the table', () => {
    expect(of(['a', 'gone'])).toEqual([]);
  });

  it('offers nothing when a unit is an identity card, which stays on the table', () => {
    expect(of(['a', 'hero'])).toEqual([]);
  });
});

describe('interaction group', () => {
  afterEach(() => {
    interaction.reset();
  });

  it('escapeClearsGroup', () => {
    interaction.setGroup(new Set(['a', 'b']));
    interaction.band = rect(0, 0, 10, 10);
    interaction.escape();
    expect(interaction.group.size).toBe(0);
    expect(interaction.band).toBeNull();
  });

  it('escape tells whether it dropped something: the group, the band, an arrow, a pin or a tap', () => {
    interaction.setGroup(new Set(['a']));
    expect(interaction.escape()).toBe(true);

    interaction.band = rect(0, 0, 10, 10);
    expect(interaction.escape()).toBe(true);

    interaction.arrowFrom = 'a';
    expect(interaction.escape()).toBe(true);
    expect(interaction.arrowFrom).toBeNull();

    interaction.counterPinned = true;
    expect(interaction.escape()).toBe(true);

    interaction.hovered = { kind: 'hand', id: 'h' };
    interaction.locked = true;
    expect(interaction.escape()).toBe(true);
    expect(interaction.hovered).toBeNull();
  });

  it('escape drops nothing from a mere hover, which it still releases', () => {
    interaction.hovered = { kind: 'card', id: 'a' };
    expect(interaction.escape()).toBe(false);
    expect(interaction.hovered).toBeNull();
    // Nothing at all.
    expect(interaction.escape()).toBe(false);
  });

  it('reset clears the group and the band', () => {
    interaction.setGroup(new Set(['a']));
    interaction.band = rect(0, 0, 10, 10);
    interaction.reset();
    expect(interaction.group.size).toBe(0);
    expect(interaction.band).toBeNull();
  });

  it('pruneDropsCardsOffTable', () => {
    interaction.setGroup(new Set(['a', 'b', 'c', 'gone']));
    interaction.pruneGroup([
      card('a'),
      card('b', { zone: 'hand' }),
      card('c', { onPile: 'deck:p0' }),
    ]);
    expect([...interaction.group]).toEqual(['a']);
  });

  it('keeps the same set when pruning changes nothing', () => {
    const group = new Set(['a', 'b']);
    interaction.setGroup(group);
    interaction.pruneGroup([card('a'), card('b'), card('c')]);
    expect(interaction.group).toBe(group);
  });

  it('clearGroup empties the selection', () => {
    interaction.setGroup(new Set(['a']));
    interaction.clearGroup();
    expect(interaction.group.size).toBe(0);
  });
});
