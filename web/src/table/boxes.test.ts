import { canShuffleIn, pileLabel, tileActions, type TileContext } from './boxes';
import type { CardView, PileView, View } from '../lib/types';

function card(id: string, owner: number): CardView {
  return { id, code: '01001', face: 0, back: 'player', owner, zone: 'pile', x: 0, y: 0, z: 1 };
}

function pile(id: string, extra: Partial<PileView>): PileView {
  return { id, kind: 'deck', owner: -1, x: 0, y: 0, count: 1, ...extra };
}

const PILES: PileView[] = [
  pile('deck:p0', { owner: 0 }),
  pile('deck:p1', { owner: 1, y: 330 }),
  pile('aside:p1', { kind: 'aside', owner: 1 }),
  pile('deck:p2', { owner: 2, y: 660 }),
  pile('aside:p2', { kind: 'aside', owner: 2 }),
];

/** Alex plays p0 and p1 (Spider-Man); Sam sits at p2. */
function makeView(): View {
  return {
    id: 'g1',
    phase: 'playing',
    you: { role: 'player', name: 'Alex', color: 0, host: true, areas: ['p0', 'p1'] },
    players: [
      {
        name: 'Alex',
        color: 0,
        host: true,
        ready: true,
        decks: [
          { area: 'p0', heroName: 'Iron Man', ready: true, handCount: 0 },
          { area: 'p1', heroName: 'Spider-Man', ready: true, handCount: 0 },
        ],
      },
      {
        name: 'Sam',
        color: 1,
        host: false,
        ready: true,
        decks: [{ area: 'p2', ready: true, handCount: 0 }],
      },
    ],
    spectators: 0,
    config: { scenario: 'rhino', difficulty: 'standard', standard: '', expert: '', modulars: [] },
    table: { cards: [], piles: PILES, stages: [], firstPlayer: { x: 0, y: 0 } },
    log: [],
  };
}

function contextOf(view: View): TileContext {
  return { view, selected: 0, sizeOf: () => 'std' };
}

function pileOf(id: string): PileView {
  const found = PILES.find((p) => p.id === id);
  if (!found) {
    throw new Error(`no pile ${id}`);
  }
  return found;
}

describe('a player with two decks', () => {
  it('own pile box for second seat', () => {
    const view = makeView();
    const tiles = tileActions(card('c', 1), pileOf('deck:p1'), contextOf(view));
    expect(tiles.map((tile) => tile.id)).toEqual(['draw', 'play', 'discard', 'bottom']);
    // Played to the row of its own deck, not the selected one's.
    expect(tiles[1]?.run()).toEqual({ kind: 'play', card: 'c', x: 760, y: 330 });

    const aside = tileActions(card('a', 1), pileOf('aside:p1'), contextOf(view));
    expect(aside.map((tile) => tile.id)).toEqual(['play', 'discard', 'bottom', 'shuffle']);
    expect(canShuffleIn(pileOf('aside:p1'), [0, 1])).toBe(true);
    expect(pileLabel(pileOf('deck:p1'), view)).toBe('Your deck');
  });

  it('plays an own card of a shared pile to the row of its own deck', () => {
    const view = makeView();
    const won = card('v', 1);
    view.table!.cards = [won];
    const victory = pile('vic', { kind: 'victory', cards: ['v'] });
    const tiles = tileActions(won, victory, contextOf(view));
    const play = tiles.find((tile) => tile.id === 'play');
    // Seat 1's row, though seat 0 is selected.
    expect(play?.run()).toEqual({ kind: 'play', card: 'v', x: 760, y: 330 });
  });

  it("keeps another player's deck and set-aside cards out", () => {
    const view = makeView();
    expect(tileActions(card('s', 2), pileOf('deck:p2'), contextOf(view))).toEqual([]);
    expect(tileActions(card('s', 2), pileOf('aside:p2'), contextOf(view))).toEqual([]);
    expect(canShuffleIn(pileOf('aside:p2'), [0, 1])).toBe(false);
    expect(pileLabel(pileOf('deck:p2'), view)).toBe("Sam's deck");
  });
});

describe('a discard pile box', () => {
  const DISCARDS: PileView[] = [
    pile('disc:p1', { kind: 'discard', owner: 1 }),
    pile('disc:p2', { kind: 'discard', owner: 2 }),
    pile('encd', { kind: 'encounterDiscard' }),
  ];

  /** The two-deck table with its discard piles, and the encounter deck unless left out. */
  function viewWithDiscards(withEncounterDeck = true): View {
    const view = makeView();
    const encounter = withEncounterDeck ? [pile('enc', { kind: 'encounter' })] : [];
    view.table!.piles = [...PILES, ...DISCARDS, ...encounter];
    return view;
  }

  function discardOf(id: string): PileView {
    const found = DISCARDS.find((p) => p.id === id);
    if (!found) {
      throw new Error(`no pile ${id}`);
    }
    return found;
  }

  it('shuffles an own card into its own deck from the second seat', () => {
    const view = viewWithDiscards();
    const tiles = tileActions(card('d', 1), discardOf('disc:p1'), contextOf(view));
    expect(tiles.map((tile) => tile.id)).toEqual(['draw', 'play', 'shuffle']);
    expect(tiles[2]?.run()).toEqual({ kind: 'toDeck', card: 'd', where: 'shuffle' });
  });

  it("does not shuffle another player's card", () => {
    const view = viewWithDiscards();
    const tiles = tileActions(card('s', 2), discardOf('disc:p2'), contextOf(view));
    expect(tiles.map((tile) => tile.id)).toEqual(['play']);
  });

  it('shuffles an encounter card into the encounter deck', () => {
    const view = viewWithDiscards();
    const tiles = tileActions(card('e', -1), discardOf('encd'), contextOf(view));
    expect(tiles.map((tile) => tile.id)).toEqual(['play', 'shuffle']);
    expect(tiles[1]?.run()).toEqual({ kind: 'toDeck', card: 'e', where: 'shuffle' });
  });

  it('does not shuffle without a home deck', () => {
    const view = viewWithDiscards(false);
    const tiles = tileActions(card('e', -1), discardOf('encd'), contextOf(view));
    expect(tiles.map((tile) => tile.id)).toEqual(['play']);
  });
});
