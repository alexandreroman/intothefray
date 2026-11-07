import { boxGrid, canShuffleIn, pileLabel, tileActions, type TileContext } from './boxes';
import type { CardView, PileView, View } from '../lib/types';
import { card, pile, playingView, seated } from './fixtures.testing';
import boxSource from './CardBox.svelte?raw';
import dialogSource from '../components/Dialog.svelte?raw';

/** A card of that seat's, in one of the piles. */
function pileCard(id: string, owner: number): CardView {
  return card(id, { owner, zone: 'pile' });
}

const PILES: PileView[] = [
  pile('deck:p0', { owner: 0 }),
  pile('deck:p1', { owner: 1, y: 330 }),
  pile('aside:p1', { kind: 'aside', owner: 1 }),
  pile('deck:p2', { owner: 2, y: 660 }),
  pile('aside:p2', { kind: 'aside', owner: 2 }),
];

const WITH_ENC: PileView[] = [...PILES, pile('enc', { kind: 'encounter' })];

/** Alex plays p0 and p1 (Spider-Man); Sam sits at p2. */
function makeView(): View {
  return playingView({
    you: { role: 'player', name: 'Alex', color: 0, host: true, areas: ['p0', 'p1'] },
    players: [
      seated(
        'Alex',
        0,
        [
          { area: 'p0', heroName: 'Iron Man' },
          { area: 'p1', heroName: 'Spider-Man' },
        ],
        true,
      ),
      seated('Sam', 1, [{ area: 'p2' }]),
    ],
    table: { piles: PILES, firstPlayer: { x: 0, y: 0 } },
  });
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
    const tiles = tileActions(pileCard('c', 1), pileOf('deck:p1'), contextOf(view));
    expect(tiles.map((tile) => tile.id)).toEqual(['draw', 'play', 'discard', 'bottom']);
    // Played to the row of its own deck, not the selected one's, face up though its deck hides it.
    // 40 past p1's deck at 0–112, in its row.
    expect(tiles[1]?.run()).toEqual({ kind: 'play', card: 'c', x: 160, y: 330, faceUp: true });

    const aside = tileActions(pileCard('a', 1), pileOf('aside:p1'), contextOf(view));
    expect(aside.map((tile) => tile.id)).toEqual(['play', 'discard', 'bottom', 'shuffle']);
    expect(canShuffleIn(pileOf('aside:p1'), [0, 1], WITH_ENC)).toBe(true);
    // Without an encounter deck on the table there is nothing to shuffle into.
    expect(canShuffleIn(pileOf('aside:p1'), [0, 1], PILES)).toBe(false);
    expect(pileLabel(pileOf('deck:p1'), view)).toBe('Your deck');
  });

  it('plays an own card of a shared pile to the row of its own deck', () => {
    const view = makeView();
    const won = pileCard('v', 1);
    view.table!.cards = [won];
    const victory = pile('vic', { kind: 'victory', cards: ['v'] });
    const tiles = tileActions(won, victory, contextOf(view));
    const play = tiles.find((tile) => tile.id === 'play');
    // Seat 1's row, though seat 0 is selected.
    expect(play?.run()).toEqual({ kind: 'play', card: 'v', x: 160, y: 330, faceUp: true });
  });

  it("keeps another player's deck and set-aside cards out", () => {
    const view = makeView();
    expect(tileActions(pileCard('s', 2), pileOf('deck:p2'), contextOf(view))).toEqual([]);
    expect(tileActions(pileCard('s', 2), pileOf('aside:p2'), contextOf(view))).toEqual([]);
    expect(canShuffleIn(pileOf('aside:p2'), [0, 1], WITH_ENC)).toBe(false);
    expect(pileLabel(pileOf('deck:p2'), view)).toBe("Sam's deck");
  });
});

describe('a scenario area box', () => {
  const area = pile('area:collection', {
    kind: 'scenarioArea',
    label: 'The Collection',
    cards: ['mine', 'sams', 'enemy'],
  });

  /** The two-deck table with The Collection, the discard piles and the encounter piles. */
  function viewWithArea(): View {
    const view = makeView();
    view.table!.cards = [
      pileCard('mine', 1),
      pileCard('sams', 2),
      card('enemy', { owner: -1, zone: 'pile', back: 'encounter' }),
    ];
    view.table!.piles = [
      ...WITH_ENC,
      pile('disc:p1', { kind: 'discard', owner: 1 }),
      pile('disc:p2', { kind: 'discard', owner: 2 }),
      pile('encd', { kind: 'encounterDiscard' }),
      area,
    ];
    return view;
  }

  it("acts as the victory display does: Discard sends a card to its owner's discard pile", () => {
    const view = viewWithArea();
    const own = tileActions(view.table!.cards[0]!, area, contextOf(view));
    expect(own.map((tile) => tile.id)).toEqual(['play', 'discard', 'bottom', 'shuffle']);
    expect(own.find((tile) => tile.id === 'discard')?.run()).toEqual({
      kind: 'discard',
      card: 'mine',
    });
    // Sam's card is shared too: played or discarded, not put into Sam's deck.
    const sams = tileActions(view.table!.cards[1]!, area, contextOf(view));
    expect(sams.map((tile) => tile.id)).toEqual(['play', 'discard']);
    const enemy = tileActions(view.table!.cards[2]!, area, contextOf(view));
    expect(enemy.map((tile) => tile.id)).toEqual(['play', 'discard', 'bottom', 'shuffle']);
    expect(pileLabel(area, view)).toBe('The Collection');
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
    const tiles = tileActions(pileCard('d', 1), discardOf('disc:p1'), contextOf(view));
    expect(tiles.map((tile) => tile.id)).toEqual(['draw', 'play', 'shuffle']);
    expect(tiles[2]?.run()).toEqual({ kind: 'toDeck', card: 'd', where: 'shuffle' });
  });

  it("does not shuffle another player's card", () => {
    const view = viewWithDiscards();
    const tiles = tileActions(pileCard('s', 2), discardOf('disc:p2'), contextOf(view));
    expect(tiles.map((tile) => tile.id)).toEqual(['play']);
  });

  it('shuffles an encounter card into the encounter deck', () => {
    const view = viewWithDiscards();
    const tiles = tileActions(pileCard('e', -1), discardOf('encd'), contextOf(view));
    expect(tiles.map((tile) => tile.id)).toEqual(['play', 'shuffle']);
    expect(tiles[1]?.run()).toEqual({ kind: 'toDeck', card: 'e', where: 'shuffle' });
  });

  it('does not shuffle without a home deck', () => {
    const view = viewWithDiscards(false);
    const tiles = tileActions(pileCard('e', -1), discardOf('encd'), contextOf(view));
    expect(tiles.map((tile) => tile.id)).toEqual(['play']);
  });
});

describe('side decks', () => {
  // Alex's Iron Man (p0) has an Invocation deck with its discard pile and a Sense deck without
  // one; Sam (p2) has an Invocation deck and its discard pile.
  const SIDE_PILES: PileView[] = [
    pile('side:p0:0', {
      kind: 'sideDeck',
      owner: 0,
      label: 'Invocation',
      topFaceUp: true,
      discard: 'sided:p0:0',
    }),
    pile('sided:p0:0', { kind: 'sideDiscard', owner: 0, label: 'Invocation' }),
    pile('side:p0:1', { kind: 'sideDeck', owner: 0, label: 'Sense' }),
    pile('side:p2:0', { kind: 'sideDeck', owner: 2, label: 'Invocation', discard: 'sided:p2:0' }),
    pile('sided:p2:0', { kind: 'sideDiscard', owner: 2, label: 'Invocation' }),
  ];

  function viewWithSideDecks(): View {
    const view = makeView();
    view.table!.piles = [...PILES, ...SIDE_PILES];
    return view;
  }

  function sideOf(id: string): PileView {
    const found = SIDE_PILES.find((p) => p.id === id);
    if (!found) {
      throw new Error(`no pile ${id}`);
    }
    return found;
  }

  function sideCard(id: string, owner: number, home: string): CardView {
    return { ...pileCard(id, owner), home };
  }

  it('names the side decks and their discard piles after their label', () => {
    const view = viewWithSideDecks();
    expect(pileLabel(sideOf('side:p0:0'), view)).toBe('Your Invocation deck');
    expect(pileLabel(sideOf('side:p2:0'), view)).toBe("Sam's Invocation deck");
    expect(pileLabel(sideOf('sided:p0:0'), view)).toBe('Your Invocation discard');
    expect(pileLabel(sideOf('sided:p2:0'), view)).toBe("Sam's Invocation discard");
  });

  it('draws, plays, discards and puts under its side deck a card of an own side deck', () => {
    const view = viewWithSideDecks();
    const invocation = sideCard('i', 0, 'side:p0:0');
    const tiles = tileActions(invocation, sideOf('side:p0:0'), contextOf(view));
    expect(tiles.map((tile) => tile.id)).toEqual(['draw', 'play', 'discard', 'bottom']);
    expect(tiles[3]?.run()).toEqual({ kind: 'toDeck', card: 'i', where: 'bottom' });
  });

  it('does not discard a card of a side deck without a discard pile', () => {
    const view = viewWithSideDecks();
    const sense = sideCard('s', 0, 'side:p0:1');
    const tiles = tileActions(sense, sideOf('side:p0:1'), contextOf(view));
    expect(tiles.map((tile) => tile.id)).toEqual(['draw', 'play', 'bottom']);
  });

  it('shuffles a side discard card back into its side deck', () => {
    const view = viewWithSideDecks();
    const used = sideCard('u', 0, 'side:p0:0');
    const tiles = tileActions(used, sideOf('sided:p0:0'), contextOf(view));
    expect(tiles.map((tile) => tile.id)).toEqual(['draw', 'play', 'shuffle']);
    expect(tiles[2]?.run()).toEqual({ kind: 'toDeck', card: 'u', where: 'shuffle' });
  });

  it("keeps another player's side deck out", () => {
    const view = viewWithSideDecks();
    const theirs = sideCard('t', 2, 'side:p2:0');
    expect(tileActions(theirs, sideOf('side:p2:0'), contextOf(view))).toEqual([]);
  });
});

describe('boxGrid', () => {
  // A box's width past its columns: the grid's 16 px padding on each side and the box's 1 px border.
  const FRAME = 2 * 16 + 2 * 1;

  it('fits as many tiles of the raised card as the box has room for', () => {
    // A small window's raised card, under 220 px: 2 × 184 and a 14 px gap in the 494 px inside.
    expect(boxGrid(184, 560, 0)).toEqual({ columns: 2, tile: 184, width: 2 * 184 + 14 + FRAME });
  });

  it('keeps its tiles at 220 px at most on a large screen', () => {
    // 1200 px at most: 5 × 220 and four 14 px gaps fill 1156 px of the 1166 px inside.
    expect(boxGrid(286, 1440, 0)).toEqual({
      columns: 5,
      tile: 220,
      width: 5 * 220 + 4 * 14 + FRAME,
    });
  });

  it('never grows past 1200 px', () => {
    expect(boxGrid(286, 1920, 0)).toEqual(boxGrid(286, 1440, 0));
  });

  it('keeps the backdrop padding off a smaller window', () => {
    // 1000 px less the backdrop's 16 px on each side: 934 px inside.
    expect(boxGrid(227, 1000, 0)).toEqual({
      columns: 4,
      tile: 220,
      width: 4 * 220 + 3 * 14 + FRAME,
    });
    // A tablet's raised card, 233 px wide, at 1180 px; 226 px upright, at 820 px.
    expect(boxGrid(233, 1180, 0)).toEqual({
      columns: 4,
      tile: 220,
      width: 4 * 220 + 3 * 14 + FRAME,
    });
    expect(boxGrid(226, 820, 0)).toEqual({
      columns: 3,
      tile: 220,
      width: 3 * 220 + 2 * 14 + FRAME,
    });
  });

  it('counts the scrollbar gutter, which the box widens by', () => {
    expect(boxGrid(220, 1000, 0).columns).toBe(4);
    // 15 px less room inside: one column fewer.
    expect(boxGrid(220, 1000, 15)).toEqual({
      columns: 3,
      tile: 220,
      width: 3 * 220 + 2 * 14 + FRAME + 15,
    });
  });

  it('shrinks one tile to the room of a very narrow window', () => {
    // 200 px less the backdrop's padding, less the grid's padding and the border: 134 px.
    expect(boxGrid(184, 200, 0)).toEqual({ columns: 1, tile: 134, width: 168 });
    expect(boxGrid(184, 200, 10)).toEqual({ columns: 1, tile: 124, width: 168 });
  });

  it('mirrors the sizes of the stylesheets it computes with', () => {
    // BACKDROP_PADDING and BOX_BORDER (Dialog.svelte), GRID_PADDING_X and GRID_GAP (CardBox.svelte).
    expect(ruleOf(dialogSource, '.backdrop')).toContain('padding: 16px;');
    expect(ruleOf(dialogSource, '.box')).toContain('border: 1px solid');
    const grid = ruleOf(boxSource, '.mgrid');
    expect(grid).toContain('gap: 14px;');
    expect(grid).toContain('padding: 14px 16px;');
  });

  it('never gives a tile a negative width', () => {
    expect(boxGrid(185, 20, 0)).toEqual({ columns: 1, tile: 0, width: FRAME });
  });
});

/** The declarations of a top-level rule of a component's stylesheet. */
function ruleOf(source: string, selector: string): string {
  const escaped = selector.replace(/[.()]/g, (c) => `\\${c}`);
  const pattern = new RegExp(`\\n {2}${escaped} \\{([^}]*)\\}`);
  return pattern.exec(source)?.[1] ?? '';
}
