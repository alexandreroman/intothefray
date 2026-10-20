import type { Area, CardView, LogView, PileView, Point, PrivateView, View } from '../lib/types';
import { diffViews, mergedLines, type OwnDrop } from './animate';

function card(id: string, extra: Partial<CardView> = {}): CardView {
  return {
    id,
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

function pile(id: string, extra: Partial<PileView> = {}): PileView {
  return { id, kind: 'deck', owner: 0, x: 600, y: 0, count: 10, ...extra };
}

function line(text: string, extra: Partial<LogView> = {}): LogView {
  return { who: 'Sam', color: 1, text, at: '2026-10-19T14:05:00Z', ...extra };
}

/** The viewer's drop of a table card, waiting for the view that shows it. */
function droppedCard(id: string): OwnDrop {
  return { element: { kind: 'card', id }, card: id, lifted: [id] };
}

const OLD_LINE = line('started the game', { who: 'Alex', color: 0, at: '2026-10-19T14:00:00Z' });

/** Alex (colour 0) in seat 0 and Sam (colour 1) in seat 1; the viewer is Alex. */
function view(
  extra: {
    cards?: CardView[];
    piles?: PileView[];
    log?: LogView[];
    current?: string;
    firstPlayer?: Point;
    hands?: Partial<Record<Area, string[]>>;
    /** How many cards Alex and Sam hold. */
    handCounts?: [number, number];
    look?: PrivateView;
  } = {},
): View {
  const cards = extra.cards ?? [];
  const [alexHand, samHand] = extra.handCounts ?? [0, 0];
  return {
    id: 'g1',
    phase: 'playing',
    you: { role: 'player', name: 'Alex', color: 0, host: true, areas: ['p0'] },
    players: [
      {
        name: 'Alex',
        color: 0,
        host: true,
        ready: true,
        decks: [{ area: 'p0', ready: true, handCount: alexHand }],
      },
      {
        name: 'Sam',
        color: 1,
        host: false,
        ready: true,
        decks: [{ area: 'p1', ready: true, handCount: samHand }],
      },
    ],
    spectators: 0,
    config: { scenario: 'rhino', difficulty: 'standard', standard: '', expert: '', modulars: [] },
    table: {
      cards,
      piles: extra.piles ?? [
        pile('deck:p0'),
        pile('disc:p0', { kind: 'discard', x: 720, count: 0, cards: [] }),
        pile('deck:p1', { owner: 1 }),
        pile('enc', { kind: 'encounter', owner: -1 }),
      ],
      stages: [
        { key: 'villain', label: 'Villain', current: extra.current ?? 'v1', cards: ['v1', 'v2'] },
      ],
      firstPlayer: extra.firstPlayer ?? { x: 0, y: 0 },
      ...(extra.hands && { hands: extra.hands }),
      ...(extra.look && { private: extra.look }),
    },
    log: extra.log ?? [OLD_LINE],
  };
}

describe('diffViews', () => {
  it('moved card yields move', () => {
    const prev = view({ cards: [card('a', { x: 0, y: 0 }), card('b', { x: 200 })] });
    const next = view({ cards: [card('a', { x: 300, y: 40 }), card('b', { x: 200 })] });

    expect(diffViews(prev, next)).toEqual([
      {
        kind: 'move',
        id: 'a',
        from: { zone: 'table', x: 0, y: 0 },
        to: { zone: 'table', x: 300, y: 40 },
      },
    ]);
  });

  it('a card played from the hand moves to the table', () => {
    const prev = view({ cards: [card('h', { zone: 'hand' })] });
    const next = view({
      cards: [card('h', { x: 100 })],
      log: [OLD_LINE, line('played Spider-Man')],
    });

    expect(diffViews(prev, next)).toEqual([
      {
        kind: 'move',
        id: 'h',
        from: { zone: 'hand', x: 0, y: 0 },
        to: { zone: 'table', x: 100, y: 0 },
      },
    ]);
  });

  it('token change yields glow in the actor colour', () => {
    const prev = view({ cards: [card('a')] });
    const next = view({
      cards: [card('a', { tokens: { dmg: 1 } })],
      log: [OLD_LINE, line('added 1 damage to Spider-Man')],
    });

    expect(diffViews(prev, next)).toEqual([{ kind: 'glow', id: 'a', color: 1 }]);
  });

  it('a merged history line gives its colour to the glow', () => {
    const merged = line('added 1 damage to Spider-Man');
    const prev = view({ cards: [card('a', { tokens: { dmg: 1 } })], log: [OLD_LINE, merged] });
    const next = view({
      cards: [card('a', { tokens: { dmg: 2 } })],
      log: [
        OLD_LINE,
        { ...merged, text: 'set damage on Spider-Man to 2', at: '2026-10-19T14:05:03Z' },
      ],
    });

    expect(diffViews(prev, next)).toEqual([{ kind: 'glow', id: 'a', color: 1 }]);
  });

  it('exhausting, flipping and statuses glow too', () => {
    const prev = view({ cards: [card('a'), card('b', { faceDown: true }), card('c')] });
    const next = view({
      cards: [
        card('a', { exhausted: true }),
        card('b', { code: '01001' }),
        card('c', { status: { tough: 1 } }),
      ],
      log: [OLD_LINE, line('exhausted Spider-Man')],
    });

    expect(diffViews(prev, next)).toEqual([
      { kind: 'glow', id: 'a', color: 1 },
      // Turned face up: it also turns over.
      { kind: 'flip', id: 'b' },
      { kind: 'glow', id: 'b', color: 1 },
      { kind: 'glow', id: 'c', color: 1 },
    ]);
  });

  it('turns over a card flipped, or shown on another face', () => {
    const known = (id: string, extra: Partial<CardView> = {}) =>
      card(id, { code: '01001', ...extra });
    const discard = (cards: string[]) =>
      pile('disc:p0', { kind: 'discard', x: 720, count: cards.length, cards });
    const prev = view({
      cards: [
        known('down'),
        known('faces'),
        known('fromDiscard', { zone: 'pile' }),
        known('toDeck'),
        known('inHand', { zone: 'hand' }),
      ],
      piles: [pile('deck:p0'), discard(['fromDiscard'])],
    });
    const next = view({
      cards: [
        card('down', { faceDown: true }),
        known('faces', { face: 1 }),
        known('fromDiscard', { x: 500 }),
        known('inHand', { zone: 'hand', face: 1 }),
      ],
      // Put back on the deck, the card is no longer listed.
      piles: [pile('deck:p0', { count: 11 }), discard([])],
    });

    const flips = diffViews(prev, next).filter((anim) => anim.kind === 'flip');
    expect(flips).toEqual([
      { kind: 'flip', id: 'down' },
      { kind: 'flip', id: 'faces' },
    ]);
  });

  it('turns over a card played face up from a deck, or revealed from the encounter deck', () => {
    // The server never lists the cards of a deck: they show up on the table as the deck shrinks.
    const prev = view({ piles: [pile('deck:p0', { count: 10 })] });
    const played = view({
      cards: [card('fromDeck', { code: '01001', x: 300 })],
      piles: [pile('deck:p0', { count: 9 })],
    });
    const encounter = (count: number) => pile('enc', { kind: 'encounter', owner: -1, count });
    const revealed = view({
      cards: [card('fromEncounter', { code: '01097', back: 'encounter', owner: -1 })],
      piles: [encounter(19)],
    });
    // Dealt face down, it shows its back and does not turn over.
    const dealt = view({
      cards: [card('dealt', { faceDown: true, back: 'encounter', owner: -1 })],
      piles: [encounter(19)],
    });

    expect(diffViews(prev, played)).toEqual([{ kind: 'flip', id: 'fromDeck' }]);
    // The viewer's own play from the deck turns over too, as it lands.
    expect(
      diffViews(prev, played, {
        element: { kind: 'pile', id: 'deck:p0' },
        card: 'fromDeck',
        lifted: [],
      }),
    ).toEqual([{ kind: 'flip', id: 'fromDeck' }]);
    expect(diffViews(view({ piles: [encounter(20)] }), revealed)).toEqual([
      { kind: 'flip', id: 'fromEncounter' },
    ]);
    expect(diffViews(view({ piles: [encounter(20)] }), dealt)).toEqual([]);
  });

  it('turns over a card played from a deck the viewer looks through', () => {
    // An open view of the deck lists its cards, though the deck shows none.
    const prev = view({
      cards: [card('seen', { code: '01001', zone: 'pile' })],
      piles: [pile('deck:p0', { count: 10 })],
    });
    const next = view({
      cards: [card('seen', { code: '01001', x: 300 })],
      piles: [pile('deck:p0', { count: 9 })],
    });

    expect(diffViews(prev, next).filter((anim) => anim.kind === 'flip')).toEqual([
      { kind: 'flip', id: 'seen' },
    ]);
  });

  it("does not turn over a card played from another player's hand", () => {
    // Another player's hand is not listed either, but no deck shrinks.
    const prev = view();
    const next = view({ cards: [card('fromHand', { code: '01001', owner: 1, x: 300 })] });

    expect(diffViews(prev, next)).toEqual([]);
  });

  it('a change with no new history line, or by the system, does not glow', () => {
    const prev = view({ cards: [card('a')] });
    const quiet = view({ cards: [card('a', { tokens: { dmg: 1 } })] });
    const bySystem = view({
      cards: [card('a', { tokens: { dmg: 1 } })],
      log: [OLD_LINE, line('set up the table', { who: 'Table', color: -1 })],
    });

    expect(diffViews(prev, quiet)).toEqual([]);
    expect(diffViews(prev, bySystem)).toEqual([]);
  });

  it('stage swap yields turnIn', () => {
    const prev = view({
      cards: [card('v1', { owner: -1 }), card('v2', { owner: -1, zone: 'stage' })],
    });
    const next = view({
      cards: [card('v1', { owner: -1, zone: 'stage' }), card('v2', { owner: -1 })],
      current: 'v2',
      log: [OLD_LINE, line('replaced the villain Rhino (stage I) with Rhino (stage II)')],
    });

    expect(diffViews(prev, next)).toEqual([
      { kind: 'turnIn', id: 'v2' },
      { kind: 'glow', id: 'v2', color: 1 },
    ]);
  });

  it('turning the stage card to its other face turns it in', () => {
    const prev = view({ cards: [card('v1', { owner: -1 })] });
    const next = view({
      cards: [card('v1', { owner: -1, face: 1 })],
      log: [OLD_LINE, line('turned the main scheme to The Break-In! (1B)')],
    });

    expect(diffViews(prev, next)).toEqual([
      { kind: 'turnIn', id: 'v1' },
      { kind: 'glow', id: 'v1', color: 1 },
    ]);
  });

  it('shuffle detected from a log line "shuffled"', () => {
    const prev = view();
    const own = view({ log: [OLD_LINE, line('shuffled their deck')] });
    const encounter = view({ log: [OLD_LINE, line('shuffled the encounter deck')] });
    const back = view({
      log: [
        OLD_LINE,
        line("shuffled Alex's discard pile into Alex's deck", { who: 'Sam', color: 1 }),
      ],
    });

    expect(diffViews(prev, own)).toEqual([{ kind: 'shuffle', pile: 'deck:p1' }]);
    expect(diffViews(prev, encounter)).toEqual([{ kind: 'shuffle', pile: 'enc' }]);
    expect(diffViews(prev, back)).toEqual([{ kind: 'shuffle', pile: 'deck:p0' }]);
  });

  it('shuffle of a player with two decks names the seats of each player', () => {
    // Alex (colour 0) plays Spider-Man (p0) and Iron Man (p1); Sam (colour 1) plays p2.
    function twoDecks(log: LogView[]): View {
      const base = view({
        log,
        piles: [
          pile('deck:p0'),
          pile('deck:p1', { owner: 1 }),
          pile('disc:p1', { kind: 'discard', owner: 1, count: 0, cards: [] }),
          pile('deck:p2', { owner: 2 }),
        ],
      });
      base.you = { ...base.you, areas: ['p0', 'p1'] };
      base.players = [
        {
          name: 'Alex',
          color: 0,
          host: true,
          ready: true,
          decks: [
            { area: 'p0', heroName: 'Spider-Man', ready: true, handCount: 0 },
            { area: 'p1', heroName: 'Iron Man', ready: true, handCount: 0 },
          ],
        },
        {
          name: 'Sam',
          color: 1,
          host: false,
          ready: true,
          decks: [{ area: 'p2', heroName: 'She-Hulk', ready: true, handCount: 0 }],
        },
      ];
      return base;
    }
    const alex = { who: 'Alex', color: 0 };
    const prev = twoDecks([OLD_LINE]);

    expect(diffViews(prev, twoDecks([OLD_LINE, line('shuffled their deck')]))).toEqual([
      { kind: 'shuffle', pile: 'deck:p2' },
    ]);
    expect(
      diffViews(prev, twoDecks([OLD_LINE, line('shuffled their Iron Man deck', alex)])),
    ).toEqual([{ kind: 'shuffle', pile: 'deck:p1' }]);
    expect(diffViews(prev, twoDecks([OLD_LINE, line("shuffled Alex's Spider-Man deck")]))).toEqual([
      { kind: 'shuffle', pile: 'deck:p0' },
    ]);
    expect(diffViews(prev, twoDecks([OLD_LINE, line("shuffled Sam's deck", alex)]))).toEqual([
      { kind: 'shuffle', pile: 'deck:p2' },
    ]);
    expect(
      diffViews(
        prev,
        twoDecks([
          OLD_LINE,
          line('shuffled their Iron Man discard pile into their Iron Man deck', alex),
        ]),
      ),
    ).toEqual([{ kind: 'shuffle', pile: 'deck:p1' }]);
  });

  it('shuffle of a side deck or its discard pile names the pile after its label', () => {
    const piles = [
      pile('deck:p0'),
      pile('side:p0:0', { kind: 'sideDeck', x: 360, count: 4, label: 'Invocation' }),
      pile('sided:p0:0', { kind: 'sideDiscard', x: 520, count: 1, label: 'Invocation' }),
      pile('side:p1:0', { kind: 'sideDeck', owner: 1, x: 360, count: 5, label: 'Invocation' }),
    ];
    const alex = { who: 'Alex', color: 0 };
    const prev = view({ piles });
    const shuffled = (text: string, extra: Partial<LogView> = {}) =>
      diffViews(prev, view({ piles, log: [OLD_LINE, line(text, extra)] }));

    expect(shuffled('shuffled their Invocation deck', alex)).toEqual([
      { kind: 'shuffle', pile: 'side:p0:0' },
    ]);
    expect(shuffled("shuffled Alex's Invocation deck")).toEqual([
      { kind: 'shuffle', pile: 'side:p0:0' },
    ]);
    expect(shuffled('shuffled their Invocation deck')).toEqual([
      { kind: 'shuffle', pile: 'side:p1:0' },
    ]);
    expect(
      shuffled('shuffled their Invocation discard pile into their Invocation deck', alex),
    ).toEqual([{ kind: 'shuffle', pile: 'side:p0:0' }]);
  });

  it('an undone shuffle does not shuffle again', () => {
    const prev = view({ log: [OLD_LINE, line('shuffled their deck')] });
    const next = view({
      log: [
        OLD_LINE,
        line('shuffled their deck', { undone: true }),
        line('undid “shuffled their deck”'),
      ],
    });

    expect(diffViews(prev, next)).toEqual([]);
  });

  it('a discarded card flies to its pile', () => {
    const prev = view({ cards: [card('a', { x: 40 })] });
    const next = view({
      cards: [card('a', { zone: 'pile' })],
      piles: [
        pile('deck:p0'),
        pile('disc:p0', { kind: 'discard', x: 720, count: 1, cards: ['a'] }),
      ],
      log: [OLD_LINE, line('discarded Spider-Man')],
    });

    expect(diffViews(prev, next)).toEqual([{ kind: 'fly', id: 'a', toPile: 'disc:p0' }]);
  });

  it('own drop is not animated', () => {
    const prev = view({ cards: [card('a', { x: 0 }), card('u', { x: 0, y: 20, parent: 'a' })] });
    const next = view({
      cards: [card('a', { x: 300 }), card('u', { x: 300, y: 20, parent: 'a' })],
    });

    expect(diffViews(prev, next, droppedCard('a'))).toEqual([]);
  });

  it('own group drop is not animated, while a card moved by another player still travels', () => {
    const prev = view({
      cards: [card('a', { x: 0 }), card('b', { x: 100 }), card('c', { x: 500 })],
    });
    const next = view({
      cards: [card('a', { x: 300 }), card('b', { x: 400 }), card('c', { x: 700 })],
    });
    const groupDrop: OwnDrop = {
      element: { kind: 'card', id: 'a' },
      card: 'a',
      lifted: ['a', 'b'],
    };

    expect(diffViews(prev, next, groupDrop)).toEqual([
      {
        kind: 'move',
        id: 'c',
        from: { zone: 'table', x: 500, y: 0 },
        to: { zone: 'table', x: 700, y: 0 },
      },
    ]);
  });

  it('own drop onto a pile does not fly', () => {
    const prev = view({ cards: [card('a', { x: 40 })] });
    const next = view({
      cards: [card('a', { zone: 'pile' })],
      piles: [pile('disc:p0', { kind: 'discard', x: 720, count: 1, cards: ['a'] })],
      log: [OLD_LINE, line('discarded Spider-Man', { who: 'Alex', color: 0 })],
    });

    expect(diffViews(prev, next, droppedCard('a'))).toEqual([]);
  });

  it("another player's move of the first player token yields its move", () => {
    const prev = view({ firstPlayer: { x: 520, y: 500 } });
    const next = view({ firstPlayer: { x: 160, y: 900 } });

    expect(diffViews(prev, next)).toEqual([
      { kind: 'firstPlayer', from: { x: 520, y: 500 }, to: { x: 160, y: 900 } },
    ]);
  });

  it("the viewer's own drop of the first player token is not animated", () => {
    const prev = view({ firstPlayer: { x: 520, y: 500 } });
    const next = view({ firstPlayer: { x: 160, y: 900 } });

    expect(
      diffViews(prev, next, { element: { kind: 'firstPlayer' }, card: null, lifted: [] }),
    ).toEqual([]);
  });

  describe('draws', () => {
    const deck = (count: number) => pile('deck:p0', { count });
    const discard = (cards: string[]) =>
      pile('disc:p0', { kind: 'discard', x: 720, count: cards.length, cards });
    const inHand = (id: string, extra: Partial<CardView> = {}) =>
      card(id, { code: '01001', zone: 'hand', ...extra });

    it('a card drawn from the deck comes out of it on its back', () => {
      const prev = view({ piles: [deck(10)], hands: { p0: [] } });
      const next = view({ cards: [inHand('d')], piles: [deck(9)], hands: { p0: ['d'] } });

      expect(diffViews(prev, next)).toEqual([
        { kind: 'draw', id: 'd', fromPile: 'deck:p0', faceUp: false },
      ]);
    });

    it('several cards drawn at once come in hand order', () => {
      const prev = view({ cards: [inHand('h')], piles: [deck(10)], hands: { p0: ['h'] } });
      const next = view({
        cards: [inHand('b'), inHand('h'), inHand('a')],
        piles: [deck(8)],
        hands: { p0: ['h', 'a', 'b'] },
      });

      expect(diffViews(prev, next)).toEqual([
        { kind: 'draw', id: 'a', fromPile: 'deck:p0', faceUp: false },
        { kind: 'draw', id: 'b', fromPile: 'deck:p0', faceUp: false },
      ]);
    });

    it("a card drawn by one of the viewer's two decks comes out of that deck", () => {
      const twoDecks = (count: number, cards: CardView[], hand: string[]): View => {
        const base = view({
          cards,
          piles: [deck(10), pile('deck:p1', { owner: 1, count })],
          hands: { p0: [], p1: hand },
        });
        base.you = { ...base.you, areas: ['p0', 'p1'] };
        return base;
      };
      const prev = twoDecks(10, [], []);
      const next = twoDecks(9, [inHand('d', { owner: 1 })], ['d']);

      expect(diffViews(prev, next)).toEqual([
        { kind: 'draw', id: 'd', fromPile: 'deck:p1', faceUp: false },
      ]);
    });

    it('a card taken from a discard pile shows its face all along', () => {
      const prev = view({
        cards: [card('t', { code: '01001', zone: 'pile' })],
        piles: [deck(10), discard(['t'])],
        hands: { p0: [] },
      });
      const next = view({
        cards: [inHand('t')],
        piles: [deck(10), discard([])],
        hands: { p0: ['t'] },
      });

      expect(diffViews(prev, next)).toEqual([
        { kind: 'draw', id: 't', fromPile: 'disc:p0', faceUp: true },
      ]);
    });

    it('a card taken from the deck the viewer looks through comes out of it on its back', () => {
      const prev = view({
        cards: [card('s', { code: '01001', zone: 'pile' })],
        piles: [deck(10)],
        hands: { p0: [] },
        look: { pile: 'deck:p0', mode: 'search', cards: ['s'] },
      });
      const next = view({ cards: [inHand('s')], piles: [deck(9)], hands: { p0: ['s'] } });

      expect(diffViews(prev, next)).toEqual([
        { kind: 'draw', id: 's', fromPile: 'deck:p0', faceUp: false },
      ]);
    });

    it('a card passed from another hand comes out of no pile', () => {
      const prev = view({ piles: [deck(10)], hands: { p0: [] } });
      const next = view({ cards: [inHand('p')], piles: [deck(10)], hands: { p0: ['p'] } });

      expect(diffViews(prev, next)).toEqual([]);
    });

    it("a card passed in while another player draws does not come out of that player's deck", () => {
      const samDeck = (count: number) => pile('deck:p1', { owner: 1, count });
      const prev = view({ piles: [deck(10), samDeck(10)], hands: { p0: [] }, handCounts: [0, 5] });
      // Sam passes one of each to Alex, and draws two: one more in his hand.
      const next = view({
        cards: [inHand('fromSam', { owner: 1 }), inHand('alexs')],
        piles: [deck(10), samDeck(8)],
        hands: { p0: ['fromSam', 'alexs'] },
        handCounts: [2, 6],
      });

      expect(diffViews(prev, next)).toEqual([{ kind: 'drawAway', pile: 'deck:p1' }]);
    });

    it('an encounter card drawn into the hand comes out of the encounter deck', () => {
      const encounter = (count: number) => pile('enc', { kind: 'encounter', owner: -1, count });
      const prev = view({ piles: [deck(10), encounter(20)], hands: { p0: [] } });
      const next = view({
        cards: [inHand('e', { owner: -1, back: 'encounter' })],
        piles: [deck(10), encounter(19)],
        hands: { p0: ['e'] },
      });

      expect(diffViews(prev, next)).toEqual([
        { kind: 'draw', id: 'e', fromPile: 'enc', faceUp: false },
      ]);
    });

    it("the viewer's own deck dragged onto the hand does not draw again", () => {
      const prev = view({ piles: [deck(10)], hands: { p0: [] } });
      const next = view({ cards: [inHand('d')], piles: [deck(9)], hands: { p0: ['d'] } });
      const ownDraw: OwnDrop = { element: { kind: 'pile', id: 'deck:p0' }, card: null, lifted: [] };

      expect(diffViews(prev, next, ownDraw)).toEqual([]);
    });

    it('a table card back in the hand still moves there', () => {
      const prev = view({ cards: [card('t', { x: 100 })], piles: [deck(10)], hands: { p0: [] } });
      const next = view({ cards: [inHand('t')], piles: [deck(10)], hands: { p0: ['t'] } });

      expect(diffViews(prev, next)).toEqual([
        {
          kind: 'move',
          id: 't',
          from: { zone: 'table', x: 100, y: 0 },
          to: { zone: 'hand', x: 0, y: 0 },
        },
      ]);
    });

    it("another player's draw from their deck leaves it unseen", () => {
      const samDeck = (count: number) => pile('deck:p1', { owner: 1, count });
      const prev = view({ piles: [deck(10), samDeck(10)], handCounts: [0, 5] });
      const next = view({ piles: [deck(10), samDeck(8)], handCounts: [0, 7] });

      expect(diffViews(prev, next)).toEqual([
        { kind: 'drawAway', pile: 'deck:p1' },
        { kind: 'drawAway', pile: 'deck:p1' },
      ]);
    });

    it("another player's draw from their discard pile names the card", () => {
      const samDiscard = (cards: string[]) =>
        pile('disc:p1', { kind: 'discard', owner: 1, count: cards.length, cards });
      const prev = view({
        cards: [card('x', { code: '01001', owner: 1, zone: 'pile' })],
        piles: [pile('deck:p1', { owner: 1 }), samDiscard(['x'])],
        handCounts: [0, 5],
      });
      const next = view({
        piles: [pile('deck:p1', { owner: 1 }), samDiscard([])],
        handCounts: [0, 6],
      });

      expect(diffViews(prev, next)).toEqual([{ kind: 'drawAway', pile: 'disc:p1', card: 'x' }]);
    });

    it("a spectator sees every player's draw leave", () => {
      const spectating = (counts: [number, number], decks: [number, number]): View => {
        const base = view({
          piles: [deck(decks[0]), pile('deck:p1', { owner: 1, count: decks[1] })],
          handCounts: counts,
        });
        base.you = { role: 'spectator', color: -1, host: false };
        return base;
      };

      expect(diffViews(spectating([5, 5], [10, 10]), spectating([6, 6], [9, 9]))).toEqual([
        { kind: 'drawAway', pile: 'deck:p0' },
        { kind: 'drawAway', pile: 'deck:p1' },
      ]);
    });

    it('draws more than 2 s apart yield nothing', () => {
      const prev = view({ piles: [deck(10)], hands: { p0: [] }, handCounts: [0, 5] });
      const next = view({
        cards: [inHand('d')],
        piles: [deck(9)],
        hands: { p0: ['d'] },
        handCounts: [1, 6],
      });

      expect(diffViews(prev, next, undefined, 2001)).toEqual([]);
    });
  });

  it('views more than 2 s apart yield nothing', () => {
    const prev = view({ cards: [card('a', { x: 0 })] });
    const next = view({
      cards: [card('a', { x: 300, tokens: { dmg: 1 } })],
      log: [OLD_LINE, line('added 1 damage to Spider-Man'), line('shuffled their deck')],
    });

    expect(diffViews(prev, next, undefined, 2001)).toEqual([]);
    expect(diffViews(prev, next, undefined, 1999)).toHaveLength(3);
  });
});

describe('mergedLines', () => {
  it('lists the lines already shown whose text or time changed', () => {
    const prev = [OLD_LINE, line('added 1 damage to Spider-Man')];
    const next = [
      OLD_LINE,
      line('set damage on Spider-Man to 2', { at: '2026-10-19T14:05:04Z' }),
      line('drew 1 card'),
    ];

    expect(mergedLines(prev, next)).toEqual([1]);
    expect(mergedLines(next, next)).toEqual([]);
  });
});
