import type { Action, CardView, PileView, View } from '../lib/types';
import { interaction } from './interaction.svelte';
import { TABLE_LIMIT } from './layout';
import { cardsInBand, groupAction, groupPileTargets, groupUnits } from './selection';
import { card, pile, playingView, rect } from './fixtures.testing';
import { dockLayout } from './dockLayout';
import { rowPitch, spreadRows, tableMapOf } from './rows';

/** Alex (p0) is the viewer; Sam sits at p1. */
function makeView(cards: CardView[], piles: PileView[]): View {
  return playingView({
    players: [],
    table: {
      cards,
      piles,
      hands: { p0: [] },
      stages: [{ key: 'villain', label: 'Villain', current: 'v', cards: ['v'] }],
      firstPlayer: { x: 0, y: 0 },
    },
  });
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
  it('leaves out a card tucked under a selected main card, in z order', () => {
    const cards = [card('x', { z: 3 }), card('t', { z: 1, parent: 'h' }), card('h', { z: 2 })];
    expect(groupUnits(new Set(['h', 't', 'x']), cards)).toEqual(['h', 'x']);
  });

  it('leaves out any card of the chain of a selected main card', () => {
    const cards = [card('h'), card('t', { parent: 'h' }), card('u', { parent: 't' })];
    expect(groupUnits(new Set(['h', 'u']), cards)).toEqual(['h']);
    expect(groupUnits(new Set(['h', 't', 'u']), cards)).toEqual(['h']);
  });

  it('keeps a tucked card whose main card is not selected: it moves alone', () => {
    const cards = [card('h'), card('t', { parent: 'h' })];
    expect(groupUnits(new Set(['t']), cards)).toEqual(['t']);
  });

  it('keeps two tucked cards of one chain apart: a tucked card carries nothing', () => {
    const cards = [
      card('h', { z: 3 }),
      card('t', { z: 2, parent: 'h' }),
      card('u', { z: 1, parent: 't' }),
    ];
    expect(groupUnits(new Set(['t', 'u']), cards)).toEqual(['u', 't']);
  });

  it('keeps a tucked card whose selected main card lies on a pile, out of the group', () => {
    const cards = [card('h', { onPile: 'deck:p0' }), card('t', { parent: 'h' })];
    expect(groupUnits(new Set(['h', 't']), cards)).toEqual(['t']);
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
    // As close as they go: the villain's row drawn 270 high, its empty band from 210 squeezed into
    // 60; player 1's row from 270. A villain card in that band, drawn at 240, and a card of
    // player 1's, 30 into its row, drawn at 300.
    const rows = spreadRows(rowPitch(0, 1), 1);
    const spread = [card('v', { x: 300, y: 295 }), card('p', { x: 100, y: 410 })];
    // Player 1's card dropped 20 lower: the villain card is drawn 20 lower too, at 260, which is
    // 352 on the table, not the 315 a table offset gives.
    const single: Action = { kind: 'move', card: 'p', x: 100, y: 430 };
    const action = groupAction(['v', 'p'], 'p', single, spread, tableMapOf(rows));
    expect(action).toEqual({
      kind: 'group',
      actions: [
        { kind: 'move', card: 'v', x: 300, y: 352 },
        { kind: 'move', card: 'p', x: 100, y: 430 },
      ],
    });
    const drawn = (y: number) => rows.toDisplay(y) ?? NaN;
    expect(drawn(430) - drawn(352)).toBeCloseTo(drawn(410) - drawn(295), 0);
  });

  it('keeps the shape the group is drawn in on a wrapped line of dock mode', () => {
    // Player 1's row at 0.6, wrapped at 400 (the lines 152.8 wide past the 180 indent): c2 and c3
    // lie on the second line. c2 dropped 16 units right is drawn 9.6 right: c3 goes as far as drawn.
    const row = [300, 452, 604, 756].map((x, i) => card(`c${i}`, { x, y: 410 }));
    const map = dockLayout({
      items: row.map((c) => ({ id: c.id, x: c.x, y: c.y, w: 112, h: 157, kind: 'card' as const })),
      rows: [1],
      wrapWidth: 400,
    });
    const single: Action = { kind: 'move', card: 'c2', x: 620, y: 410 };

    expect(groupAction(['c2', 'c3'], 'c2', single, row, map)).toEqual({
      kind: 'group',
      actions: [
        { kind: 'move', card: 'c2', x: 620, y: 410 },
        { kind: 'move', card: 'c3', x: 772, y: 410 },
      ],
    });
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

  it('tucks nothing: an attach sends nothing for a group', () => {
    const single: Action = { kind: 'attach', card: 'a', target: 'c' };
    expect(groupAction(['a', 'b'], 'a', single, cards)).toBeNull();
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

describe('a group dropped on a deck of its owner', () => {
  // Red Skull's Side-scheme deck belongs to nobody; Alex (p0) has a Sense deck, Sam (p1) one too.
  const piles = [
    pile('enc', { kind: 'encounter' }),
    pile('encd', { kind: 'encounterDiscard' }),
    pile('sdeck:schemes', { kind: 'scenarioDeck', label: 'Side-scheme' }),
    pile('deck:p0', { owner: 0 }),
    pile('disc:p0', { kind: 'discard', owner: 0 }),
    pile('side:p0:0', { kind: 'sideDeck', owner: 0, label: 'Sense' }),
    pile('side:p1:0', { kind: 'sideDeck', owner: 1, label: 'Sense' }),
  ];
  const cards = [
    card('patrol', { owner: -1, back: 'encounter' }),
    card('minion', { owner: -1, back: 'encounter' }),
    card('a'),
    card('sense', { home: 'side:p0:0' }),
  ];
  const view = makeView(cards, piles);
  const of = (units: string[]) => groupPileTargets(units, view).map((t) => [t.pile, t.drop]);

  it('offers encounter cards every deck of nobody', () => {
    expect(of(['patrol', 'minion'])).toEqual([
      ['enc', 'top'],
      ['sdeck:schemes', 'top'],
      ['encd', 'discard'],
    ]);
  });

  it("offers the viewer's cards each of their decks, whatever their homes", () => {
    expect(of(['a', 'sense'])).toEqual([
      ['deck:p0', 'top'],
      ['side:p0:0', 'top'],
    ]);
  });

  it('takes a drop near a deck only when it is the home of every unit', () => {
    const exact = (units: string[]) => groupPileTargets(units, view).map((t) => [t.pile, t.exact]);
    expect(exact(['patrol', 'minion'])).toEqual([
      ['enc', undefined],
      ['sdeck:schemes', true],
      ['encd', undefined],
    ]);
    // The Sense card's home is the Sense deck, the other card's Alex's deck: neither is home to both.
    expect(exact(['a', 'sense'])).toEqual([
      ['deck:p0', true],
      ['side:p0:0', true],
    ]);
  });

  it('puts every unit on top of the deck the group is dropped on', () => {
    const single: Action = { kind: 'toDeck', card: 'patrol', where: 'top', pile: 'sdeck:schemes' };
    expect(groupAction(['patrol', 'minion'], 'patrol', single, cards)).toEqual({
      kind: 'group',
      actions: [
        { kind: 'toDeck', card: 'patrol', where: 'top', pile: 'sdeck:schemes' },
        { kind: 'toDeck', card: 'minion', where: 'top', pile: 'sdeck:schemes' },
      ],
    });
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
