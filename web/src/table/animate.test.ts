import type { Area, CardView, LogView, PileView, Point, PrivateView, View } from '../lib/types';
import { type Anim, diffViews, MAX_APART_MS, mergedLines, type OwnDrop } from './animate';

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
    active?: Point;
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
        online: true,
        decks: [{ area: 'p0', ready: true, handCount: alexHand }],
      },
      {
        name: 'Sam',
        color: 1,
        host: false,
        ready: true,
        online: true,
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
      ...(extra.active && { active: extra.active }),
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

  it('a card taken face down off the table into the hand turns face up there', () => {
    const prev = view({ cards: [card('d', { faceDown: true, x: 100 })] });
    const next = view({
      cards: [card('d', { code: '01002', zone: 'hand' })],
      log: [OLD_LINE, line('took a card into hand')],
    });

    expect(diffViews(prev, next)).toEqual([
      {
        kind: 'move',
        id: 'd',
        from: { zone: 'table', x: 100, y: 0 },
        to: { zone: 'hand', x: 0, y: 0 },
      },
      { kind: 'flip', id: 'd' },
    ]);
  });

  it('a card played from the hand does not turn over in the hand it left', () => {
    const prev = view({ cards: [card('h', { code: '01002', zone: 'hand' })] });
    const next = view({ cards: [card('h', { code: '01002', x: 100 })] });

    expect(diffViews(prev, next)).not.toContainEqual({ kind: 'flip', id: 'h' });
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

  it('a modifier change glows too', () => {
    const prev = view({ cards: [card('a', { mods: { def: 1 } })] });
    const next = view({
      cards: [card('a', { mods: { def: -1 } })],
      log: [OLD_LINE, line('gave Spider-Man −2 DEF')],
    });

    expect(diffViews(prev, next)).toEqual([{ kind: 'glow', id: 'a', color: 1 }]);
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

    // Each also enters from its pile.
    const flipsOf = (anims: Anim[]) => anims.filter((anim) => anim.kind === 'flip');
    expect(flipsOf(diffViews(prev, played))).toEqual([{ kind: 'flip', id: 'fromDeck' }]);
    // The viewer's own play from the deck turns over too, as it lands.
    expect(
      diffViews(prev, played, {
        element: { kind: 'pile', id: 'deck:p0' },
        card: 'fromDeck',
        lifted: [],
      }),
    ).toEqual([{ kind: 'flip', id: 'fromDeck' }]);
    expect(flipsOf(diffViews(view({ piles: [encounter(20)] }), revealed))).toEqual([
      { kind: 'flip', id: 'fromEncounter' },
    ]);
    expect(flipsOf(diffViews(view({ piles: [encounter(20)] }), dealt))).toEqual([]);
  });

  it("turns a card revealed from a player's deck face up on it, for its owner and for others", () => {
    for (const owner of [0, 1]) {
      const deckId = `deck:p${owner}`;
      const prev = view({ piles: [pile(deckId, { owner, count: 10 })] });
      const next = view({
        cards: [card('rev', { code: '01001', owner, x: 600, onPile: deckId })],
        piles: [pile(deckId, { owner, count: 9 })],
      });

      expect(diffViews(prev, next)).toEqual([
        { kind: 'enter', id: 'rev', fromPile: deckId },
        { kind: 'flip', id: 'rev' },
      ]);
    }
  });

  it('a card revealed on a deck and drawn goes into the hand: the own one, or the unseen one', () => {
    const revealed = (owner: number) =>
      card('rev', { code: '01001', owner, x: 600, onPile: `deck:p${owner}` });
    const own = diffViews(
      view({ cards: [revealed(0)], piles: [pile('deck:p0', { count: 9 })] }),
      view({
        cards: [card('rev', { code: '01001', zone: 'hand' })],
        piles: [pile('deck:p0', { count: 9 })],
        hands: { p0: ['rev'] },
        handCounts: [1, 0],
      }),
    );
    expect(own).toEqual([
      {
        kind: 'move',
        id: 'rev',
        from: { zone: 'table', x: 600, y: 0 },
        to: { zone: 'hand', x: 0, y: 0 },
      },
    ]);

    const theirs = diffViews(
      view({ cards: [revealed(1)], piles: [pile('deck:p1', { owner: 1, count: 9 })] }),
      view({ piles: [pile('deck:p1', { owner: 1, count: 9 })], handCounts: [0, 1] }),
    );
    expect(theirs).toEqual([{ kind: 'away', id: 'rev' }]);
  });

  it('a card revealed on a deck that goes back into it turns face down on the way, for anyone', () => {
    for (const owner of [0, 1]) {
      const deckId = `deck:p${owner}`;
      const prev = view({
        cards: [card('rev', { code: '01001', owner, x: 600, onPile: deckId })],
        piles: [pile(deckId, { owner, count: 9 })],
      });
      const next = view({ piles: [pile(deckId, { owner, count: 10 })] });

      expect(diffViews(prev, next)).toEqual([
        { kind: 'fly', id: 'rev', toPile: deckId, turns: 'down' },
      ]);
    }
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
          online: true,
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
          online: true,
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

  describe('the top card of a side deck that shows it', () => {
    const invocation = (top: string, count = 4): PileView =>
      pile('side:p0:0', {
        kind: 'sideDeck',
        x: 360,
        count,
        label: 'Invocation',
        topFaceUp: true,
        cards: [top],
      });
    const onPile = (id: string) => card(id, { code: '09032', zone: 'pile', home: 'side:p0:0' });
    const withTop = (top: string, cards: CardView[], count?: number) =>
      view({ cards, piles: [pile('deck:p0'), invocation(top, count)] });

    it('turns face up when the previous top leaves', () => {
      const prev = withTop('i1', [onPile('i1')]);
      const next = withTop(
        'i2',
        [card('i1', { code: '09032', x: 500, home: 'side:p0:0' }), onPile('i2')],
        3,
      );

      expect(diffViews(prev, next)).toContainEqual({ kind: 'reveal', pile: 'side:p0:0' });
      // Even when the viewer played it there themselves.
      expect(diffViews(prev, next, droppedCard('i1'))).toContainEqual({
        kind: 'reveal',
        pile: 'side:p0:0',
      });
    });

    it('turns face up after the deck is shuffled', () => {
      const prev = withTop('i1', [onPile('i1')]);
      const next = view({
        cards: [onPile('i7')],
        piles: [pile('deck:p0'), invocation('i7')],
        log: [OLD_LINE, line('shuffled their Invocation deck', { who: 'Alex', color: 0 })],
      });

      expect(diffViews(prev, next)).toEqual([
        { kind: 'shuffle', pile: 'side:p0:0' },
        { kind: 'reveal', pile: 'side:p0:0' },
      ]);
    });

    it('does not turn when the same card stays on top', () => {
      const prev = withTop('i1', [onPile('i1'), card('a')]);
      const next = withTop('i1', [onPile('i1'), card('a', { x: 300 })]);

      expect(diffViews(prev, next).filter((anim) => anim.kind === 'reveal')).toEqual([]);
    });

    it('does not turn a card put back on top: it flies there, over the top it covers', () => {
      const prev = withTop('i1', [
        onPile('i1'),
        card('back', { code: '09033', x: 500, home: 'side:p0:0' }),
      ]);
      // The covered top is no longer listed: it leaves the view, but stays in the deck.
      const next = withTop('back', [onPile('back')], 5);
      const flight = { kind: 'fly', id: 'back', toPile: 'side:p0:0' };

      expect(diffViews(prev, next)).toEqual([flight]);
      // The viewer's own drop too, from where it was let go.
      expect(diffViews(prev, next, droppedCard('back'))).toEqual([{ ...flight, dropped: true }]);
    });

    it('does not turn on a view that comes too long after the last', () => {
      const prev = withTop('i1', [onPile('i1')]);
      const next = withTop('i2', [onPile('i2')], 3);

      expect(diffViews(prev, next, undefined, MAX_APART_MS + 1)).toEqual([]);
    });
  });

  describe('a card put at the bottom of a deck', () => {
    const alex = { who: 'Alex', color: 0 };
    const sense = (count: number): PileView =>
      pile('side:p0:1', {
        kind: 'sideDeck',
        x: 520,
        count,
        label: 'Sense',
        topFaceUp: true,
        cards: ['s1'],
      });
    const top = card('s1', { code: '60002', zone: 'pile', home: 'side:p0:1' });
    const radar = card('radar', { code: '60003', x: 800, home: 'side:p0:1' });
    const bottomOf = (count: number, text: string, cards: CardView[] = [top]) =>
      view({ cards, piles: [pile('deck:p0'), sense(count)], log: [OLD_LINE, line(text, alex)] });
    const prev = view({ cards: [top, radar], piles: [pile('deck:p0'), sense(4)] });

    it('slips under a side deck showing its top card, which does not turn', () => {
      const next = bottomOf(5, 'put Radar Sense at the bottom of their Sense deck');

      expect(diffViews(prev, next)).toEqual([{ kind: 'under', id: 'radar', toPile: 'side:p0:1' }]);
    });

    it("slips under the viewer's own drop too, from where it was dropped", () => {
      const next = bottomOf(5, 'put Radar Sense at the bottom of their Sense deck');

      expect(diffViews(prev, next, droppedCard('radar'))).toEqual([
        { kind: 'under', id: 'radar', toPile: 'side:p0:1' },
      ]);
    });

    it('slips under a deck, from the table or the hand, alone or in a group', () => {
      const mine = card('m', { code: '01001', x: 300 });
      const held = card('h', { code: '01002', zone: 'hand' });
      const before = view({ cards: [mine, held], piles: [pile('deck:p0', { count: 10 })] });
      const after = view({
        piles: [pile('deck:p0', { count: 12 })],
        log: [OLD_LINE, line('put 2 cards at the bottom of their deck', alex)],
      });

      expect(diffViews(before, after)).toEqual([
        { kind: 'under', id: 'm', toPile: 'deck:p0' },
        { kind: 'under', id: 'h', toPile: 'deck:p0' },
      ]);
    });

    it('does not slip under for a card put on top, nor for an undone line', () => {
      // Put on top, it flies there instead, turning face down.
      expect(diffViews(prev, bottomOf(5, 'put Radar Sense on top of their Sense deck'))).toEqual([
        { kind: 'fly', id: 'radar', toPile: 'side:p0:1', turns: 'down' },
      ]);
      const undone = view({
        cards: [top],
        piles: [pile('deck:p0'), sense(5)],
        log: [
          OLD_LINE,
          line('put Radar Sense at the bottom of their Sense deck', { ...alex, undone: true }),
        ],
      });
      expect(diffViews(prev, undone).filter((anim) => anim.kind === 'under')).toEqual([]);
    });

    describe('a side card tucked under a card that leaves the table', () => {
      const invocation = (count: number): PileView =>
        pile('side:p0:0', { kind: 'sideDeck', x: 360, count, label: 'Invocation' });
      const used = (cards: string[]): PileView =>
        pile('sided:p0:0', {
          kind: 'sideDiscard',
          x: 440,
          count: cards.length,
          label: 'Invocation',
          cards,
        });
      const encd = (cards: string[]): PileView =>
        pile('encd', { kind: 'encounterDiscard', owner: -1, count: cards.length, cards });
      const enemy = card('e', { code: '01100', owner: -1, back: 'encounter', x: 800 });
      const thug = card('t', { code: '01101', owner: -1, back: 'encounter', x: 1000 });
      const tucked = (id: string, home: string, parent = 'e') =>
        card(id, { code: '60004', x: 810, y: 10, parent, home });
      const piles = (senseCount: number, discarded: string[], invocationCount = 5) => [
        pile('deck:p0'),
        sense(senseCount),
        invocation(invocationCount),
        used([]),
        encd(discarded),
      ];
      const discardedLine = (text: string) => [OLD_LINE, line(text, alex)];

      it('slips under its side deck without a discard pile, the line naming only the host', () => {
        const before = view({ cards: [top, enemy, tucked('k', 'side:p0:1')], piles: piles(4, []) });
        const after = view({
          cards: [top, { ...enemy, zone: 'pile', x: 0, y: 0 }],
          piles: piles(5, ['e']),
          log: discardedLine('discarded Hydra Mercenary'),
        });

        expect(diffViews(before, after).filter((anim) => anim.kind === 'under')).toEqual([
          { kind: 'under', id: 'k', toPile: 'side:p0:1' },
        ]);
      });

      it('slips under for a host discarded with others, in a group', () => {
        const before = view({
          cards: [top, enemy, thug, tucked('k', 'side:p0:1'), tucked('j', 'side:p0:1', 't')],
          piles: piles(4, []),
        });
        const after = view({
          cards: [top, { ...enemy, zone: 'pile' }, { ...thug, zone: 'pile' }],
          piles: piles(6, ['e', 't']),
          log: discardedLine('discarded 2 cards (Hydra Mercenary, Hydra Mercenary)'),
        });

        expect(diffViews(before, after).filter((anim) => anim.kind === 'under')).toEqual([
          { kind: 'under', id: 'k', toPile: 'side:p0:1' },
          { kind: 'under', id: 'j', toPile: 'side:p0:1' },
        ]);
      });

      it('leaves a card of a side deck with a discard pile to fly there', () => {
        const before = view({ cards: [top, enemy, tucked('i', 'side:p0:0')], piles: piles(4, []) });
        const after = view({
          cards: [top, { ...enemy, zone: 'pile' }, { ...tucked('i', 'side:p0:0'), zone: 'pile' }],
          piles: [pile('deck:p0'), sense(4), invocation(5), used(['i']), encd(['e'])],
          log: discardedLine('discarded Hydra Mercenary'),
        });

        const anims = diffViews(before, after);
        expect(anims.filter((anim) => anim.kind === 'under')).toEqual([]);
        expect(anims).toContainEqual({ kind: 'fly', id: 'i', toPile: 'sided:p0:0' });
      });

      it('does not slip under on an undo', () => {
        const before = view({ cards: [top, enemy, tucked('k', 'side:p0:1')], piles: piles(4, []) });
        const after = view({
          cards: [top],
          piles: piles(5, []),
          log: [
            OLD_LINE,
            line('attached Radar Sense', { ...alex, undone: true }),
            line('undid “attached Radar Sense”', alex),
          ],
        });

        expect(diffViews(before, after).filter((anim) => anim.kind === 'under')).toEqual([]);
      });
    });

    it('does not slip under on a view that comes too long after the last', () => {
      const next = bottomOf(5, 'put Radar Sense at the bottom of their Sense deck');

      expect(diffViews(prev, next, undefined, MAX_APART_MS + 1)).toEqual([]);
    });
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

  it('own drop onto a pile flies there from where it was let go', () => {
    const prev = view({ cards: [card('a', { x: 40 })] });
    const next = view({
      cards: [card('a', { zone: 'pile' })],
      piles: [pile('disc:p0', { kind: 'discard', x: 720, count: 1, cards: ['a'] })],
      log: [OLD_LINE, line('discarded Spider-Man', { who: 'Alex', color: 0 })],
    });

    expect(diffViews(prev, next, droppedCard('a'))).toEqual([
      { kind: 'fly', id: 'a', toPile: 'disc:p0', dropped: true },
    ]);
  });

  it("another player's move of the first player token yields its move", () => {
    const prev = view({ firstPlayer: { x: 520, y: 500 } });
    const next = view({ firstPlayer: { x: 160, y: 900 } });

    expect(diffViews(prev, next)).toEqual([
      { kind: 'marker', name: 'firstPlayer', from: { x: 520, y: 500 }, to: { x: 160, y: 900 } },
    ]);
  });

  it('yields one move per marker that moved, and none for an absent counter', () => {
    const prev = view({ firstPlayer: { x: 520, y: 500 }, active: { x: 400, y: 100 } });
    const next = view({ firstPlayer: { x: 160, y: 900 }, active: { x: 450, y: 100 } });

    expect(diffViews(prev, next)).toEqual([
      { kind: 'marker', name: 'firstPlayer', from: { x: 520, y: 500 }, to: { x: 160, y: 900 } },
      { kind: 'marker', name: 'active', from: { x: 400, y: 100 }, to: { x: 450, y: 100 } },
    ]);
    expect(diffViews(view(), view())).toEqual([]);
  });

  it("the viewer's own drop of the first player token is not animated", () => {
    const prev = view({ firstPlayer: { x: 520, y: 500 } });
    const next = view({ firstPlayer: { x: 160, y: 900 } });

    expect(
      diffViews(prev, next, {
        element: { kind: 'marker', name: 'firstPlayer' },
        card: null,
        lifted: [],
      }),
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

  describe('changes of place', () => {
    const alex = { who: 'Alex', color: 0 };
    const deck = (count: number) => pile('deck:p0', { count });
    const samDeck = (count: number) => pile('deck:p1', { owner: 1, count });
    const encounter = (count: number) => pile('enc', { kind: 'encounter', owner: -1, count });
    const discard = (cards: string[]) =>
      pile('disc:p0', { kind: 'discard', x: 720, count: cards.length, cards });
    const samDiscard = (cards: string[]) =>
      pile('disc:p1', { kind: 'discard', owner: 1, x: 720, count: cards.length, cards });
    const victory = (cards: string[]) =>
      pile('vic', { kind: 'victory', owner: -1, x: 900, count: cards.length, cards });
    const onPile = (id: string, extra: Partial<CardView> = {}) =>
      card(id, { code: '01001', zone: 'pile', ...extra });

    /** The same view seen by Sam (seat 1): Alex's hand is one the viewer does not see. */
    function seenBySam(seen: View): View {
      return {
        ...seen,
        you: { role: 'player', name: 'Sam', color: 1, host: false, areas: ['p1'] },
      };
    }

    // The server gives a card a new id when it goes into a hand or a deck out of a hand or face down
    // off the table, so that the other players cannot follow it (freshID in internal/game/ids.go).
    describe('a card that gets a new id on its way', () => {
      it('taken face down into the hand moves there under its new id and turns face up', () => {
        const prev = view({ cards: [card('d', { faceDown: true, x: 100 })], hands: { p0: [] } });
        const next = view({
          cards: [card('n', { code: '01002', zone: 'hand' })],
          hands: { p0: ['n'] },
          log: [OLD_LINE, line('took a card into hand', alex)],
        });

        expect(diffViews(prev, next)).toEqual([
          {
            kind: 'move',
            id: 'n',
            from: { zone: 'table', x: 100, y: 0 },
            to: { zone: 'hand', x: 0, y: 0 },
            was: 'd',
          },
          { kind: 'flip', id: 'n' },
        ]);
        // The viewer's own drop already lies in the hand.
        expect(diffViews(prev, next, droppedCard('d'))).toEqual([]);
      });

      it('put back face down on the table by an undo moves there under its new id', () => {
        const prev = view({
          cards: [card('n', { code: '01002', zone: 'hand' })],
          hands: { p0: ['n'] },
        });
        const next = view({
          cards: [card('d', { faceDown: true, x: 100 })],
          hands: { p0: [] },
          log: [OLD_LINE, line('undid “took a card into hand”', alex)],
        });

        expect(diffViews(prev, next)).toEqual([
          {
            kind: 'move',
            id: 'd',
            from: { zone: 'hand', x: 0, y: 0 },
            to: { zone: 'table', x: 100, y: 0 },
            was: 'n',
          },
        ]);
      });

      it('a card played face down from the deck is not a hand card renamed', () => {
        const prev = view({
          cards: [card('h', { code: '01002', zone: 'hand' })],
          piles: [deck(10)],
        });
        const next = view({
          cards: [card('played', { faceDown: true, x: 300 })],
          piles: [deck(9)],
        });

        expect(diffViews(prev, next)).not.toContainEqual(expect.objectContaining({ kind: 'move' }));
      });

      it("the viewer's hand card put on top of their deck flies there, turning face down", () => {
        const prev = view({
          cards: [card('h', { code: '01001', zone: 'hand' })],
          piles: [deck(10)],
          hands: { p0: ['h'] },
        });
        const next = view({
          piles: [deck(11)],
          hands: { p0: [] },
          log: [OLD_LINE, line('put a card on top of their deck', alex)],
        });

        expect(diffViews(prev, next)).toEqual([
          { kind: 'fly', id: 'h', toPile: 'deck:p0', turns: 'down' },
        ]);
      });

      it('a face-up card put on the deck out of a discard pile flies there, turning face down', () => {
        const prev = view({ cards: [onPile('c9')], piles: [deck(10), discard(['c9'])] });
        const next = view({
          piles: [deck(11), discard([])],
          log: [OLD_LINE, line('put Web-Shooter on top of their deck', alex)],
        });

        expect(diffViews(prev, next)).toEqual([
          { kind: 'fly', id: 'c9', toPile: 'deck:p0', fromPile: 'disc:p0', turns: 'down' },
        ]);
      });

      it('a revealed card turned face down flies back onto its deck, turning face down', () => {
        const prev = view({
          cards: [card('r', { code: '01001', onPile: 'deck:p0', x: 600 })],
          piles: [deck(9)],
        });
        const next = view({
          piles: [deck(10)],
          log: [OLD_LINE, line('put Web-Shooter back on top of their deck', alex)],
        });

        expect(diffViews(prev, next)).toEqual([
          { kind: 'fly', id: 'r', toPile: 'deck:p0', turns: 'down' },
        ]);
      });

      it("a face-down card taken into another player's hand goes away", () => {
        const prev = seenBySam(
          view({ cards: [card('d', { faceDown: true })], handCounts: [5, 0] }),
        );
        const next = seenBySam(view({ handCounts: [6, 0] }));

        expect(diffViews(prev, next)).toEqual([{ kind: 'away', id: 'd' }]);
      });
    });

    it('the top card of a discard pile played on the table enters from it', () => {
      const prev = view({ cards: [onPile('c9')], piles: [deck(10), discard(['c9'])] });
      const next = view({
        cards: [card('c9', { code: '01001', x: 300 })],
        piles: [deck(10), discard([])],
      });

      expect(diffViews(prev, next)).toEqual([{ kind: 'enter', id: 'c9', fromPile: 'disc:p0' }]);
    });

    it('the top of a deck that shows it, dragged by the viewer onto the table, does not enter', () => {
      const shown = (cards: string[], count: number) => pile('deck:p0', { count, cards });
      const prev = view({ cards: [onPile('c1')], piles: [shown(['c1'], 10), discard([])] });
      const next = view({
        cards: [card('c1', { code: '01001', x: 300 })],
        piles: [shown([], 9), discard([])],
      });
      const drag: OwnDrop = { element: { kind: 'pile', id: 'deck:p0' }, card: null, lifted: [] };

      expect(diffViews(prev, next, drag)).toEqual([]);
      expect(diffViews(prev, next)).toEqual([{ kind: 'enter', id: 'c1', fromPile: 'deck:p0' }]);
    });

    it('a group of three table cards put on top of a deck flies there, once each', () => {
      const prev = view({
        cards: [card('c1'), card('c2'), card('c3')],
        piles: [deck(7), discard([])],
      });
      const next = view({ piles: [deck(10), discard([])] });

      expect(diffViews(prev, next)).toEqual([
        { kind: 'fly', id: 'c1', toPile: 'deck:p0' },
        { kind: 'fly', id: 'c2', toPile: 'deck:p0' },
        { kind: 'fly', id: 'c3', toPile: 'deck:p0' },
      ]);
    });

    it("another player's drop of a discard card enters from the pile", () => {
      const prev = view({ cards: [onPile('c9')], piles: [deck(10), discard(['c9'])] });
      const next = view({
        cards: [card('c9', { code: '01001', x: 300 })],
        piles: [deck(10), discard([])],
        log: [OLD_LINE, line('played Web-Shooter')],
      });

      expect(diffViews(prev, next)).toEqual([{ kind: 'enter', id: 'c9', fromPile: 'disc:p0' }]);
    });

    it('cards discarded from a deck fly to the discard pile on their back, top first', () => {
      const prev = view({ piles: [samDeck(30), samDiscard([])] });
      const next = view({
        cards: [onPile('c7', { owner: 1 }), onPile('c8', { owner: 1 })],
        piles: [samDeck(28), samDiscard(['c7', 'c8'])],
      });

      expect(diffViews(prev, next)).toEqual([
        { kind: 'fly', id: 'c8', toPile: 'disc:p1', fromPile: 'deck:p1', turns: 'up' },
        { kind: 'fly', id: 'c7', toPile: 'disc:p1', fromPile: 'deck:p1', turns: 'up' },
      ]);
    });

    it("the viewer's own drop of their deck's top on its discard pile flies there, turning face up", () => {
      const prev = view({ piles: [deck(10), discard([])] });
      const next = view({ cards: [onPile('c7')], piles: [deck(9), discard(['c7'])] });
      const drag: OwnDrop = { element: { kind: 'pile', id: 'deck:p0' }, card: null, lifted: [] };
      const flight = { kind: 'fly', id: 'c7', toPile: 'disc:p0', fromPile: 'deck:p0', turns: 'up' };

      // From where the viewer let it go.
      expect(diffViews(prev, next, drag)).toEqual([{ ...flight, dropped: true }]);
      // Seen by anyone else, it flies there from the deck.
      expect(diffViews(prev, next)).toEqual([flight]);
    });

    it("the viewer's own drop of the encounter deck's top on its discard pile flies there, turning face up", () => {
      const encd = (cards: string[]) =>
        pile('encd', { kind: 'encounterDiscard', owner: -1, count: cards.length, cards });
      const prev = view({ piles: [deck(10), encounter(20), encd([])] });
      const next = view({
        cards: [onPile('e1', { back: 'encounter', owner: -1 })],
        piles: [deck(10), encounter(19), encd(['e1'])],
      });
      const drag: OwnDrop = { element: { kind: 'pile', id: 'enc' }, card: null, lifted: [] };

      expect(diffViews(prev, next, drag)).toEqual([
        { kind: 'fly', id: 'e1', toPile: 'encd', fromPile: 'enc', turns: 'up', dropped: true },
      ]);
    });

    it('a card another player plays face up from their hand turns over', () => {
      const prev = seenBySam(view({ handCounts: [5, 0] }));
      const next = seenBySam(
        view({ cards: [card('c5', { code: '01001', x: 300 })], handCounts: [4, 0] }),
      );

      expect(diffViews(prev, next)).toEqual([{ kind: 'flip', id: 'c5' }]);
    });

    it('a card another player discards from their hand rises into the discard pile', () => {
      const prev = seenBySam(view({ piles: [deck(10), discard([])], handCounts: [5, 0] }));
      const next = seenBySam(
        view({ cards: [onPile('c5')], piles: [deck(10), discard(['c5'])], handCounts: [4, 0] }),
      );

      expect(diffViews(prev, next)).toEqual([{ kind: 'arrive', pile: 'disc:p0', card: 'c5' }]);
    });

    it('a card another player puts from their hand on their deck rises into it', () => {
      const prev = seenBySam(view({ piles: [deck(30)], handCounts: [5, 0] }));
      const next = seenBySam(view({ piles: [deck(31)], handCounts: [4, 0] }));

      expect(diffViews(prev, next)).toEqual([{ kind: 'arrive', pile: 'deck:p0' }]);
    });

    it("a table card taken into another player's hand goes away", () => {
      const prev = seenBySam(view({ cards: [card('c2', { code: '01001' })], handCounts: [5, 0] }));
      const next = seenBySam(view({ handCounts: [6, 0] }));

      // The hand's rise is the card's: no draw out of a pile.
      expect(diffViews(prev, next)).toEqual([{ kind: 'away', id: 'c2' }]);
    });

    it("the viewer's own deal does not enter again", () => {
      const prev = view({ piles: [deck(10), encounter(20)] });
      const next = view({
        cards: [card('dealt', { faceDown: true, back: 'encounter', owner: -1 })],
        piles: [deck(10), encounter(19)],
      });
      const ownDeal: OwnDrop = { element: { kind: 'pile', id: 'enc' }, card: 'dealt', lifted: [] };

      expect(diffViews(prev, next, ownDeal)).toEqual([]);
    });

    it('an encounter card dealt by another player enters from the encounter deck', () => {
      const prev = view({ piles: [deck(10), encounter(20)] });
      const next = view({
        cards: [card('dealt', { faceDown: true, back: 'encounter', owner: -1 })],
        piles: [deck(10), encounter(19)],
      });

      // Face down: it does not turn over.
      expect(diffViews(prev, next)).toEqual([{ kind: 'enter', id: 'dealt', fromPile: 'enc' }]);
    });

    it('a card played from the deck enters face down: it does not turn over', () => {
      const prev = view({ piles: [pile('deck:p0', { count: 10 })] });
      const next = view({
        cards: [card('played', { faceDown: true, x: 300 })],
        piles: [pile('deck:p0', { count: 9 })],
      });

      expect(diffViews(prev, next)).toEqual([{ kind: 'enter', id: 'played', fromPile: 'deck:p0' }]);
    });

    it('a revealed encounter card still turns over', () => {
      const prev = view({ piles: [deck(10), encounter(20)] });
      const next = view({
        cards: [card('rev', { code: '01097', back: 'encounter', owner: -1 })],
        piles: [deck(10), encounter(19)],
      });

      expect(diffViews(prev, next)).toContainEqual({ kind: 'flip', id: 'rev' });
    });

    it('no more cards fly into a deck than it grew by', () => {
      const prev = view({
        cards: [card('a', { x: 100 }), card('b', { x: 300 })],
        piles: [deck(10)],
      });
      const next = view({ piles: [deck(11)] });

      expect(diffViews(prev, next)).toEqual([{ kind: 'fly', id: 'a', toPile: 'deck:p0' }]);
    });

    it('at most 5 cards fly between two piles, the top ones', () => {
      const ids = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8'];
      const prev = view({ cards: ids.map((id) => onPile(id)), piles: [deck(10), discard(ids)] });
      const next = view({
        piles: [deck(18), discard([])],
        log: [OLD_LINE, line('shuffled their discard pile into their deck', alex)],
      });

      expect(diffViews(prev, next)).toEqual([
        ...['d8', 'd7', 'd6', 'd5', 'd4'].map((id) => ({
          kind: 'fly',
          id,
          toPile: 'deck:p0',
          fromPile: 'disc:p0',
          turns: 'down',
        })),
        { kind: 'shuffle', pile: 'deck:p0' },
      ]);
    });

    it('a private view that closes moves nothing', () => {
      const ids = ['l1', 'l2', 'l3'];
      const prev = view({
        cards: ids.map((id) => onPile(id)),
        piles: [deck(10)],
        look: { pile: 'deck:p0', mode: 'top', cards: ids },
      });
      const next = view({ piles: [deck(10)] });

      expect(diffViews(prev, next)).toEqual([]);
    });

    it('an undone draw flies back to the deck', () => {
      const prev = view({
        cards: [card('c3', { code: '01001', zone: 'hand' })],
        piles: [deck(9)],
        hands: { p0: ['c3'] },
      });
      const next = view({
        piles: [deck(10)],
        hands: { p0: [] },
        log: [
          OLD_LINE,
          line('drew 1 card', { ...alex, undone: true }),
          line('undid “drew 1 card”', alex),
        ],
      });

      expect(diffViews(prev, next)).toEqual([
        { kind: 'fly', id: 'c3', toPile: 'deck:p0', turns: 'down' },
      ]);
    });

    it('a face-up table card put on top of its deck flies there, turning face down', () => {
      const prev = view({
        cards: [card('c4', { code: '01001', owner: 1 })],
        piles: [deck(10), samDeck(10)],
      });
      const next = view({ piles: [deck(10), samDeck(11)] });
      const flight = { kind: 'fly', id: 'c4', toPile: 'deck:p1', turns: 'down' };

      expect(diffViews(prev, next)).toEqual([flight]);
      // The viewer's own drop too, from where it was let go.
      expect(diffViews(prev, next, droppedCard('c4'))).toEqual([{ ...flight, dropped: true }]);
    });

    it('a face-down table card put on top of its deck flies there on its back', () => {
      const prev = view({ cards: [card('c4', { faceDown: true })], piles: [deck(10)] });
      const next = view({ piles: [deck(11)] });

      expect(diffViews(prev, next)).toEqual([{ kind: 'fly', id: 'c4', toPile: 'deck:p0' }]);
    });

    it('a face-down table card discarded flies there, turning face up', () => {
      const prev = view({
        cards: [card('c4', { code: '01001', faceDown: true })],
        piles: [deck(10), discard([])],
      });
      const next = view({ cards: [onPile('c4')], piles: [deck(10), discard(['c4'])] });
      const flight = { kind: 'fly', id: 'c4', toPile: 'disc:p0', turns: 'up' };

      expect(diffViews(prev, next)).toEqual([flight]);
      expect(diffViews(prev, next, droppedCard('c4'))).toEqual([{ ...flight, dropped: true }]);
    });

    it('a face-up table card discarded flies there as its face', () => {
      const prev = view({
        cards: [card('c4', { code: '01001' })],
        piles: [deck(10), discard([])],
      });
      const next = view({ cards: [onPile('c4')], piles: [deck(10), discard(['c4'])] });

      expect(diffViews(prev, next, droppedCard('c4'))).toEqual([
        { kind: 'fly', id: 'c4', toPile: 'disc:p0', dropped: true },
      ]);
    });

    it("the viewer's own hand card put on top of their deck flies there, turning face down", () => {
      const prev = view({
        cards: [card('h', { code: '01001', zone: 'hand' })],
        piles: [deck(10)],
        hands: { p0: ['h'] },
      });
      const next = view({ piles: [deck(11)], hands: { p0: [] } });
      const handDrop: OwnDrop = { element: { kind: 'hand', id: 'h' }, card: 'h', lifted: ['h'] };

      expect(diffViews(prev, next, handDrop)).toEqual([
        { kind: 'fly', id: 'h', toPile: 'deck:p0', turns: 'down', dropped: true },
      ]);
    });

    it("the viewer's own drop of a discard pile's top on the deck flies there, turning face down", () => {
      const prev = view({ cards: [onPile('c9')], piles: [deck(10), discard(['c9'])] });
      const next = view({ piles: [deck(11), discard([])] });
      const drag: OwnDrop = { element: { kind: 'pile', id: 'disc:p0' }, card: 'c9', lifted: [] };

      expect(diffViews(prev, next, drag)).toEqual([
        {
          kind: 'fly',
          id: 'c9',
          toPile: 'deck:p0',
          fromPile: 'disc:p0',
          turns: 'down',
          dropped: true,
        },
      ]);
    });

    it("the viewer's own drop of a stack on a pile flies each of its cards there", () => {
      const prev = view({
        cards: [card('t', { code: '01001' }), card('u', { code: '01002', parent: 't' })],
        piles: [deck(10), discard([])],
      });
      const next = view({
        cards: [onPile('t'), onPile('u')],
        piles: [deck(10), discard(['u', 't'])],
      });

      // The card tucked under it is lifted with it.
      const stackDrop: OwnDrop = {
        element: { kind: 'card', id: 't' },
        card: 't',
        lifted: ['t', 'u'],
      };

      expect(diffViews(prev, next, stackDrop)).toEqual([
        { kind: 'fly', id: 't', toPile: 'disc:p0', dropped: true },
        { kind: 'fly', id: 'u', toPile: 'disc:p0', dropped: true },
      ]);
    });

    it("the viewer's own group drop on a deck flies each of its cards there", () => {
      const prev = view({
        cards: [card('a', { code: '01001' }), card('b', { code: '01002', x: 200 })],
        piles: [deck(10)],
      });
      const next = view({ piles: [deck(12)] });
      const groupDrop: OwnDrop = {
        element: { kind: 'card', id: 'a' },
        card: 'a',
        lifted: ['a', 'b'],
      };

      expect(diffViews(prev, next, groupDrop)).toEqual([
        { kind: 'fly', id: 'a', toPile: 'deck:p0', turns: 'down', dropped: true },
        { kind: 'fly', id: 'b', toPile: 'deck:p0', turns: 'down', dropped: true },
      ]);
    });

    it("the viewer's own drop on the table or in the hand still yields nothing", () => {
      const prev = view({
        cards: [card('c9', { code: '01001', zone: 'hand' })],
        hands: { p0: ['c9'] },
      });
      const next = view({ cards: [card('c9', { code: '01001', x: 300 })], hands: { p0: [] } });
      const handDrop: OwnDrop = { element: { kind: 'hand', id: 'c9' }, card: 'c9', lifted: ['c9'] };

      expect(diffViews(prev, next, handDrop)).toEqual([]);
      expect(diffViews(next, prev, droppedCard('c9'))).toEqual([]);
    });

    it('a card put at the bottom of its deck still slips under, and only that', () => {
      const prev = view({ cards: [card('m', { code: '01001', x: 300 })], piles: [deck(10)] });
      const next = view({
        piles: [deck(11)],
        log: [OLD_LINE, line('put Web-Shooter at the bottom of their deck', alex)],
      });

      expect(diffViews(prev, next)).toEqual([{ kind: 'under', id: 'm', toPile: 'deck:p0' }]);
    });

    it('a card shuffled into its deck flies there and the deck riffles', () => {
      const prev = view({ cards: [card('m', { code: '01001', x: 300 })], piles: [deck(10)] });
      const next = view({
        piles: [deck(11)],
        log: [OLD_LINE, line('shuffled Web-Shooter into their deck', alex)],
      });

      expect(diffViews(prev, next)).toEqual([
        { kind: 'fly', id: 'm', toPile: 'deck:p0', turns: 'down' },
        { kind: 'shuffle', pile: 'deck:p0' },
      ]);
    });

    it('an encounter card shuffled into the encounter deck flies there and the deck riffles', () => {
      const soldier = card('e', { code: '01097', back: 'encounter', owner: -1, x: 300 });
      const prev = view({ cards: [soldier], piles: [deck(10), encounter(20)] });
      const next = view({
        piles: [deck(10), encounter(21)],
        log: [OLD_LINE, line('shuffled Hydra Soldier into the encounter deck', alex)],
      });

      expect(diffViews(prev, next)).toEqual([
        { kind: 'fly', id: 'e', toPile: 'enc', turns: 'down' },
        { kind: 'shuffle', pile: 'enc' },
      ]);
    });

    it('a side card shuffled into its side deck flies there and the side deck riffles', () => {
      const invocation = (count: number) =>
        pile('side:p0:0', { kind: 'sideDeck', x: 360, count, label: 'Invocation' });
      const side = card('s', { code: '01001', home: 'side:p0:0', x: 300 });
      const prev = view({ cards: [side], piles: [deck(10), invocation(4)] });
      const next = view({
        piles: [deck(10), invocation(5)],
        log: [OLD_LINE, line('shuffled Hex into their Invocation deck', alex)],
      });

      expect(diffViews(prev, next)).toEqual([
        { kind: 'fly', id: 's', toPile: 'side:p0:0', turns: 'down' },
        { kind: 'shuffle', pile: 'side:p0:0' },
      ]);
    });

    it('an undone shuffle into the deck does not riffle the deck', () => {
      const prev = view({ piles: [deck(11)] });
      const next = view({
        cards: [card('m', { code: '01001', x: 300 })],
        piles: [deck(10)],
        log: [
          OLD_LINE,
          line('shuffled Web-Shooter into their deck', { ...alex, undone: true }),
          line('undid “shuffled Web-Shooter into their deck”', alex),
        ],
      });

      expect(diffViews(prev, next)).not.toContainEqual({ kind: 'shuffle', pile: 'deck:p0' });
    });

    it('a table card sent to the victory display flies there', () => {
      const prev = view({
        cards: [card('c', { code: '01001', x: 300 })],
        piles: [deck(10), victory([])],
      });
      const next = view({ cards: [onPile('c')], piles: [deck(10), victory(['c'])] });

      expect(diffViews(prev, next)).toEqual([{ kind: 'fly', id: 'c', toPile: 'vic' }]);
    });

    it('a card from a public pile to another flies pile to pile', () => {
      const prev = view({ cards: [onPile('c9')], piles: [deck(10), discard(['c9']), victory([])] });
      const next = view({ cards: [onPile('c9')], piles: [deck(10), discard([]), victory(['c9'])] });

      expect(diffViews(prev, next)).toEqual([
        { kind: 'fly', id: 'c9', toPile: 'vic', fromPile: 'disc:p0' },
      ]);
    });

    it("a card from the viewer's look at the top to the discard pile turns", () => {
      const prev = view({
        cards: [onPile('l1'), onPile('l2')],
        piles: [deck(10), discard([])],
        look: { pile: 'deck:p0', mode: 'top', cards: ['l1', 'l2'] },
      });
      const next = view({
        cards: [onPile('l1'), onPile('l2')],
        piles: [deck(9), discard(['l1'])],
        look: { pile: 'deck:p0', mode: 'top', cards: ['l2'] },
      });

      expect(diffViews(prev, next)).toEqual([
        { kind: 'fly', id: 'l1', toPile: 'disc:p0', fromPile: 'deck:p0', turns: 'up' },
      ]);
    });

    it('a card from a deck the viewer searched onto the table enters and turns over', () => {
      const prev = view({
        cards: [onPile('s')],
        piles: [deck(10)],
        look: { pile: 'deck:p0', mode: 'search', cards: ['s'] },
      });
      const next = view({ cards: [card('s', { code: '01001', x: 300 })], piles: [deck(9)] });

      expect(diffViews(prev, next)).toEqual([
        { kind: 'flip', id: 's' },
        { kind: 'enter', id: 's', fromPile: 'deck:p0' },
      ]);
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
