import { actionsFor, type ActionItem, type TableElement } from './actions';
import { knownCard, type CardInfo } from '../lib/catalog';
import type { Action, Area, CardView, PackFace, PileView, Role, View } from '../lib/types';

vi.mock('../lib/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/catalog')>()),
  knownCard: vi.fn(),
}));

// The catalog of the fixture: code -> faces.
const FACES: Record<string, Partial<PackFace>[]> = {
  '01001': [{ name: 'Spider-Man' }],
  '01002': [{ name: 'Peter Parker' }, { name: 'Spider-Man' }],
  '01094': [{ name: 'Rhino', stage: 'I' }],
  '01097': [
    { name: 'The Break-In!', size: 'land' },
    { name: 'The Break-In!', size: 'land' },
  ],
  '01100': [{ name: 'Hard to Keep Down' }],
};

function infoOf(code: string): CardInfo | null {
  const faces = FACES[code];
  if (!faces) {
    return null;
  }
  const full = faces.map((face): PackFace => ({
    name: '',
    type: '',
    size: 'std',
    images: [],
    ...face,
  }));
  return { card: { code, faces: full, back: 'player', quantity: 1 }, face: 0 };
}

function card(id: string, extra: Partial<CardView> = {}): CardView {
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

function pile(id: string, extra: Partial<PileView>): PileView {
  return { id, kind: 'deck', owner: -1, x: 0, y: 0, count: 5, ...extra };
}

/** Rhino with two players, Alex (p0) and Sam (p1), and every pile of a real table. */
function makeView(extra: { cards?: CardView[]; piles?: PileView[] } = {}): View {
  const cards = extra.cards ?? [
    card('mine'),
    card('two', { code: '01002' }),
    card('down', { code: undefined, faceDown: true }),
    card('theirs', { owner: 1 }),
    card('enemy', { code: '01100', owner: -1, back: 'encounter' }),
    card('v', { code: '01094', owner: -1, back: 'villain', stage: 'villain' }),
    card('s', { code: '01097', owner: -1, back: 'encounter', stage: 'main' }),
    card('h', { zone: 'hand' }),
  ];
  const piles = extra.piles ?? [
    pile('deck:p0', { owner: 0, count: 30 }),
    pile('disc:p0', { kind: 'discard', owner: 0, count: 2, cards: ['x', 'y'] }),
    pile('aside:p0', { kind: 'aside', owner: 0, count: 1, cards: ['z'] }),
    pile('deck:p1', { owner: 1, count: 30 }),
    pile('disc:p1', { kind: 'discard', owner: 1, count: 1, cards: ['w'] }),
    pile('aside:p1', { kind: 'aside', owner: 1, count: 1, cards: ['u'] }),
    pile('enc', { kind: 'encounter', count: 20 }),
    pile('encd', { kind: 'encounterDiscard', count: 1, cards: ['t'] }),
    pile('vic', { kind: 'victory', count: 1, cards: ['q'] }),
    pile('saside', { kind: 'aside', count: 3, cards: ['r', 'o', 'p'] }),
  ];
  return {
    id: 'g1',
    phase: 'playing',
    you: { role: 'player', name: 'Alex', color: 0, host: true, area: 'p0' },
    players: [
      { name: 'Alex', color: 0, host: true, area: 'p0', ready: true, handCount: 1 },
      { name: 'Sam', color: 1, host: false, area: 'p1', ready: true, handCount: 0 },
    ],
    spectators: 0,
    config: { scenario: 'rhino', difficulty: 'standard', standard: '', expert: '', modulars: [] },
    table: {
      cards,
      piles,
      hand: ['h'],
      stages: [
        { key: 'villain', label: 'Villain', current: 'v', cards: ['v'] },
        { key: 'main', label: 'Main scheme', current: 's', cards: ['s'] },
      ],
      firstPlayer: { x: 860, y: 40 },
    },
    log: [],
  };
}

const ALEX: { area: Area; role: Role } = { area: 'p0', role: 'player' };

function itemsFor(
  el: TableElement,
  view = makeView(),
  you: { area?: Area; role: Role } = ALEX,
): ActionItem[] {
  const result = actionsFor(el, view, you);
  if (!Array.isArray(result)) {
    throw new Error(`expected items, got the text "${result.text}"`);
  }
  return result;
}

/** The item ids, one list per group, in bar order. */
function groups(items: ActionItem[]): string[][] {
  const out: string[][] = [];
  let last: number | null = null;
  for (const item of items) {
    if (item.group !== last) {
      out.push([]);
      last = item.group;
    }
    out[out.length - 1]?.push(item.id);
  }
  return out;
}

function item(items: ActionItem[], id: string): ActionItem {
  const found = items.find((it) => it.id === id);
  if (!found) {
    throw new Error(`no item ${id} in ${items.map((it) => it.id).join(', ')}`);
  }
  return found;
}

function menuOf(items: ActionItem[], id: string): ActionItem[] {
  return item(items, id).menu ?? [];
}

/** What running the item gives, which must be an action. */
function actionOf(it: ActionItem): Action {
  const result = it.run?.();
  if (!result || 'ask' in result || 'local' in result) {
    throw new Error(`${it.id} does not send an action`);
  }
  return result;
}

beforeEach(() => {
  vi.mocked(knownCard).mockImplementation(infoOf);
});

describe('actionsFor', () => {
  it('card in play groups and order', () => {
    const items = itemsFor({ kind: 'card', id: 'mine' });

    expect(groups(items)).toEqual([['exhaust'], ['counters'], ['discard', 'moveTo']]);
    const exhaust = item(items, 'exhaust');
    expect(exhaust).toMatchObject({ label: 'Exhaust', icon: 'exhaust', key: 'E', tip: 'Exhaust' });
    expect(actionOf(exhaust)).toEqual({ kind: 'exhaust', card: 'mine' });
    // The arrow starts with its key (A) or a Shift + drag: the bar has no button for it.
    expect(items.map((i) => i.id)).not.toContain('arrow');
    const discard = item(items, 'discard');
    expect(discard).toMatchObject({
      label: 'Discard',
      icon: 'discard',
      key: 'Backspace',
      tip: 'Discard',
    });
    expect(actionOf(discard)).toEqual({ kind: 'discard', card: 'mine' });

    // One "+" dropdown for both: the tokens, then the statuses, each in its section.
    expect(item(items, 'counters')).toMatchObject({
      label: 'Add a token or status',
      tip: 'Add a token or status',
      icon: 'token',
    });
    const counters = menuOf(items, 'counters');
    expect(counters.map((it) => [it.section, it.id, it.label, it.key])).toEqual([
      ['Tokens', 'dmg', 'Damage', 'D'],
      ['Tokens', 'thr', 'Threat', 'T'],
      ['Tokens', 'gen', 'Counter', 'N'],
      ['Status', 'stunned', 'Stunned', 'S'],
      ['Status', 'confused', 'Confused', 'C'],
      ['Status', 'tough', 'Tough', 'G'],
    ]);
    expect(actionOf(item(counters, 'thr'))).toEqual({
      kind: 'token',
      card: 'mine',
      name: 'thr',
      delta: 1,
    });
    expect(actionOf(item(counters, 'tough'))).toEqual({
      kind: 'status',
      card: 'mine',
      name: 'tough',
      delta: 1,
    });

    // Move to is an icon: its name stays in the label and the tip.
    const move = menuOf(items, 'moveTo');
    expect(item(items, 'moveTo')).toMatchObject({ label: 'Move to', icon: 'move', tip: 'Move to' });
    expect(move.every((it) => it.section === undefined)).toBe(true);
    expect(move.map((it) => it.id)).toEqual([
      'hand',
      'deckTop',
      'deckBottom',
      'deckShuffle',
      'sep',
      'victory',
      'aside',
    ]);
    expect(move.map((it) => it.label)).toEqual([
      'Hand',
      'Top of deck',
      'Bottom of deck',
      'Shuffle into deck',
      '-',
      'Victory display',
      'Set aside',
    ]);
    expect(item(move, 'hand').key).toBe('H');
    expect(actionOf(item(move, 'hand'))).toEqual({ kind: 'toHand', card: 'mine' });
    expect(actionOf(item(move, 'deckTop'))).toEqual({ kind: 'toDeck', card: 'mine', where: 'top' });
    expect(actionOf(item(move, 'deckBottom'))).toEqual({
      kind: 'toDeck',
      card: 'mine',
      where: 'bottom',
    });
    expect(actionOf(item(move, 'deckShuffle'))).toEqual({
      kind: 'toDeck',
      card: 'mine',
      where: 'shuffle',
    });
    expect(actionOf(item(move, 'victory'))).toEqual({
      kind: 'toPile',
      card: 'mine',
      target: 'vic',
    });
    expect(actionOf(item(move, 'aside'))).toEqual({
      kind: 'toPile',
      card: 'mine',
      target: 'aside:p0',
    });
  });

  it('an exhausted card shows ready and the counter menu gives the counts', () => {
    const view = makeView({
      cards: [card('mine', { exhausted: true, tokens: { dmg: 2 }, status: { stunned: 1 } })],
    });
    const items = itemsFor({ kind: 'card', id: 'mine' }, view);

    expect(item(items, 'exhaust')).toMatchObject({
      label: 'Ready',
      tip: 'Ready',
      key: 'E',
      pressed: true,
    });
    expect(menuOf(items, 'counters').map((it) => it.label)).toEqual([
      'Damage (2)',
      'Threat',
      'Counter',
      'Stunned (1)',
      'Confused',
      'Tough',
    ]);
  });

  it('a card with several faces shows flip', () => {
    const items = itemsFor({ kind: 'card', id: 'two' });

    expect(groups(items)).toEqual([['exhaust', 'flip'], ['counters'], ['discard', 'moveTo']]);
    const flip = item(items, 'flip');
    expect(flip).toMatchObject({ label: 'Flip', icon: 'flip', key: 'F', tip: 'Flip' });
    expect(actionOf(flip)).toEqual({ kind: 'flip', card: 'two' });
  });

  it('stage top card shows choose instead of flip', () => {
    // The main scheme has two faces, yet its card choice replaces Flip.
    const items = itemsFor({ kind: 'card', id: 's' });

    expect(groups(items)).toEqual([['exhaust', 'stage'], ['counters'], ['discard', 'moveTo']]);
    const stage = item(items, 'stage');
    expect(stage).toMatchObject({
      label: 'Choose the main scheme card to show',
      tip: 'Choose the main scheme card to show',
      icon: 'stage-pick',
    });
    expect(stage.key).toBeUndefined();
    expect(stage.run?.()).toEqual({ local: 'stageBox' });
    expect(item(itemsFor({ kind: 'card', id: 'v' }), 'stage').label).toBe(
      'Choose the villain card to show',
    );
  });

  it('a stage top card cannot leave the table', () => {
    const items = itemsFor({ kind: 'card', id: 'v' });
    const tip = 'The villain card stays on the table — choose another card to show';

    expect(item(items, 'discard')).toMatchObject({ disabled: true, tip });
    expect(item(items, 'moveTo')).toMatchObject({ disabled: true, tip });
  });

  it('a card holding a stage top card cannot leave the table either', () => {
    const view = makeView({
      cards: [
        card('mine'),
        card('v', { code: '01094', owner: -1, stage: 'villain', parent: 'mine' }),
      ],
    });
    const items = itemsFor({ kind: 'card', id: 'mine' }, view);

    expect(item(items, 'discard').disabled).toBe(true);
    expect(item(items, 'moveTo').disabled).toBe(true);
  });

  it('face-down card shows flip', () => {
    const items = itemsFor({ kind: 'card', id: 'down' });

    expect(groups(items)).toEqual([['exhaust', 'flip'], ['counters'], ['discard', 'moveTo']]);
    expect(actionOf(item(items, 'flip'))).toEqual({ kind: 'flip', card: 'down' });
  });

  it("another player's card cannot go to a hand or a deck", () => {
    const move = menuOf(itemsFor({ kind: 'card', id: 'theirs' }), 'moveTo');

    expect(move.map((it) => it.id)).toEqual(['victory', 'aside']);
    expect(actionOf(item(move, 'aside'))).toEqual({
      kind: 'toPile',
      card: 'theirs',
      target: 'saside',
    });
  });

  it('an encounter card goes back into the encounter deck', () => {
    const move = menuOf(itemsFor({ kind: 'card', id: 'enemy' }), 'moveTo');

    expect(move.map((it) => [it.id, it.label])).toEqual([
      ['deckTop', 'Top of deck'],
      ['deckBottom', 'Bottom of deck'],
      ['deckShuffle', 'Shuffle into encounter deck'],
      ['sep', '-'],
      ['victory', 'Victory display'],
      ['aside', 'Set aside'],
    ]);
    expect(actionOf(item(move, 'aside'))).toEqual({
      kind: 'toPile',
      card: 'enemy',
      target: 'saside',
    });
  });

  it('own deck items', () => {
    const items = itemsFor({ kind: 'pile', id: 'deck:p0' });

    expect(groups(items)).toEqual([['draw1', 'look', 'deck'], ['aside']]);
    const draw = item(items, 'draw1');
    expect(draw).toMatchObject({ label: 'Draw 1', key: 'W', tip: 'Draw 1' });
    expect(actionOf(draw)).toEqual({ kind: 'draw', n: 1 });

    const look = menuOf(items, 'look');
    expect(look.map((it) => [it.id, it.label, it.key])).toEqual([
      ['lookTop', 'Look at top…', 'L'],
      ['search', 'Search…', 'K'],
    ]);
    const lookTop = item(look, 'lookTop').run?.();
    if (!lookTop || !('ask' in lookTop)) {
      throw new Error('Look at top… must ask how many cards');
    }
    expect(lookTop.ask).toMatchObject({
      title: 'Look at the top cards',
      question: 'How many cards from the top of your deck?',
      pile: 'deck:p0',
      max: 30,
      ok: 'Look',
    });
    expect(lookTop.ask.make(4)).toEqual({ kind: 'look', pile: 'deck:p0', n: 4 });
    expect(actionOf(item(look, 'search'))).toEqual({ kind: 'search', pile: 'deck:p0' });

    const deck = menuOf(items, 'deck');
    expect(deck.map((it) => [it.id, it.label, it.key])).toEqual([
      ['drawN', 'Draw…', undefined],
      ['discardTop', 'Discard top…', undefined],
      ['sep', '-', undefined],
      ['shuffle', 'Shuffle', 'U'],
    ]);
    const drawN = item(deck, 'drawN').run?.();
    if (!drawN || !('ask' in drawN)) {
      throw new Error('Draw… must ask how many cards');
    }
    expect(drawN.ask).toMatchObject({
      title: 'Draw cards',
      question: 'How many cards do you draw?',
      pile: 'deck:p0',
      max: 30,
      ok: 'Draw',
    });
    expect(drawN.ask.make(3)).toEqual({ kind: 'draw', n: 3 });
    const discardTop = item(deck, 'discardTop').run?.();
    if (!discardTop || !('ask' in discardTop)) {
      throw new Error('Discard top… must ask how many cards');
    }
    expect(discardTop.ask).toMatchObject({
      title: 'Discard from the top',
      question: 'How many cards from the top of your deck go to the discard pile?',
      pile: 'deck:p0',
      max: 30,
      ok: 'Discard',
    });
    expect(discardTop.ask.make(2)).toEqual({ kind: 'discardTop', pile: 'deck:p0', n: 2 });
    expect(actionOf(item(deck, 'shuffle'))).toEqual({ kind: 'shuffle', pile: 'deck:p0' });
  });

  it('a count is never asked beyond what the server accepts', () => {
    const view = makeView({ piles: [pile('deck:p0', { owner: 0, count: 120 })] });
    const lookTop = item(
      menuOf(itemsFor({ kind: 'pile', id: 'deck:p0' }, view), 'look'),
      'lookTop',
    ).run?.();

    expect(lookTop && 'ask' in lookTop && lookTop.ask.max).toBe(99);
  });

  it('encounter deck items', () => {
    const items = itemsFor({ kind: 'pile', id: 'enc' });

    expect(groups(items)).toEqual([
      ['reveal', 'look', 'deck'],
      ['victory', 'aside'],
    ]);
    const reveal = item(items, 'reveal');
    expect(reveal).toMatchObject({ label: 'Reveal', key: 'R', tip: 'Reveal' });
    expect(reveal.disabled).toBeFalsy();
    expect(actionOf(reveal)).toEqual({ kind: 'reveal' });
    expect(menuOf(items, 'look').map((it) => it.id)).toEqual(['lookTop', 'search']);
    const lookTop = item(menuOf(items, 'look'), 'lookTop').run?.();
    expect(lookTop && 'ask' in lookTop && lookTop.ask.question).toBe(
      'How many cards from the top of the encounter deck?',
    );
    const deck = menuOf(items, 'deck');
    expect(deck.map((it) => it.id)).toEqual(['discardTop', 'sep', 'shuffle']);
    const discardTop = item(deck, 'discardTop').run?.();
    expect(discardTop && 'ask' in discardTop && discardTop.ask.question).toBe(
      'How many cards from the top of the encounter deck go to the discard pile?',
    );
    expect(actionOf(item(deck, 'shuffle'))).toEqual({ kind: 'shuffle', pile: 'enc' });
  });

  it('encounter reveal disabled while revealed', () => {
    const view = makeView({
      cards: [card('r', { code: '01100', owner: -1, onPile: 'enc' })],
      piles: [pile('enc', { kind: 'encounter', count: 20 })],
    });
    const reveal = item(itemsFor({ kind: 'pile', id: 'enc' }, view), 'reveal');

    expect(reveal.disabled).toBe(true);
    expect(reveal.tip).toBe('Hard to Keep Down is already revealed on this deck — move it first');
  });

  it('discard pile items', () => {
    const items = itemsFor({ kind: 'pile', id: 'disc:p0' });

    expect(groups(items)).toEqual([['search', 'shuffleBack'], ['aside']]);
    const search = item(items, 'search');
    expect(search).toMatchObject({ label: 'Search…', key: 'K', tip: 'Search…' });
    expect(actionOf(search)).toEqual({ kind: 'search', pile: 'disc:p0' });
    const back = item(items, 'shuffleBack');
    expect(back).toMatchObject({
      label: 'Shuffle back',
      tip: 'Shuffle this discard pile back into its deck',
    });
    expect(actionOf(back)).toEqual({ kind: 'shuffleBack', pile: 'disc:p0' });
    expect(groups(itemsFor({ kind: 'pile', id: 'encd' }))).toEqual([
      ['search', 'shuffleBack'],
      ['victory', 'aside'],
    ]);
  });

  it("another player's discard pile can only be searched", () => {
    expect(groups(itemsFor({ kind: 'pile', id: 'disc:p1' }))).toEqual([['search'], ['aside']]);
  });

  it('out-of-play piles have no bar: they are not drawn on the table', () => {
    for (const id of ['vic', 'saside', 'aside:p0', 'aside:p1']) {
      expect(itemsFor({ kind: 'pile', id })).toEqual([]);
      const spectator: { role: Role } = { role: 'spectator' };
      expect(itemsFor({ kind: 'pile', id }, makeView(), spectator)).toEqual([]);
    }
  });

  it("other player's deck only opens their set-aside cards", () => {
    expect(groups(itemsFor({ kind: 'pile', id: 'deck:p1' }))).toEqual([['aside']]);
  });

  it("other player's deck shows the belongs text without set-aside cards", () => {
    const view = makeView({ piles: [pile('deck:p1', { owner: 1, count: 30 })] });
    expect(actionsFor({ kind: 'pile', id: 'deck:p1' }, view, ALEX)).toEqual({
      text: 'Belongs to Sam — only they can use it.',
    });
  });

  it("deck and discard piles open their owner's out-of-play piles, with their counts", () => {
    const own = item(itemsFor({ kind: 'pile', id: 'deck:p0' }), 'aside');
    expect(own).toMatchObject({
      label: 'Set-aside cards (1)',
      icon: 'hourglass',
      tip: 'Set-aside cards (1)',
    });
    expect(own.disabled).toBeFalsy();
    expect(own.run?.()).toEqual({ local: 'browseBox', pile: 'aside:p0' });
    expect(item(itemsFor({ kind: 'pile', id: 'disc:p1' }), 'aside').run?.()).toEqual({
      local: 'browseBox',
      pile: 'aside:p1',
    });

    const encounter = itemsFor({ kind: 'pile', id: 'enc' });
    expect(item(encounter, 'victory')).toMatchObject({
      label: 'Victory display (1)',
      icon: 'trophy',
    });
    expect(item(encounter, 'victory').run?.()).toEqual({ local: 'browseBox', pile: 'vic' });
    expect(item(encounter, 'aside')).toMatchObject({ label: 'Set-aside cards (3)' });
    expect(item(encounter, 'aside').run?.()).toEqual({ local: 'browseBox', pile: 'saside' });
  });

  it('an empty out-of-play pile shows disabled, its count 0', () => {
    const view = makeView({
      piles: [
        pile('enc', { kind: 'encounter', count: 20 }),
        pile('vic', { kind: 'victory', count: 0, cards: [] }),
      ],
    });
    const items = itemsFor({ kind: 'pile', id: 'enc' }, view);

    expect(groups(items)).toEqual([['reveal', 'look', 'deck'], ['victory']]);
    expect(item(items, 'victory')).toMatchObject({
      label: 'Victory display (0)',
      tip: 'Victory display (0): empty',
      disabled: true,
    });
  });

  it('an empty pile has no actions', () => {
    const view = makeView({
      piles: [pile('disc:p0', { kind: 'discard', owner: 0, count: 0 })],
    });

    expect(actionsFor({ kind: 'pile', id: 'disc:p0' }, view, ALEX)).toEqual([]);
  });

  it("an empty deck or discard pile still opens its owner's out-of-play piles", () => {
    const view = makeView({
      piles: [
        pile('disc:p0', { kind: 'discard', owner: 0, count: 0 }),
        pile('aside:p0', { kind: 'aside', owner: 0, count: 0, cards: [] }),
        pile('enc', { kind: 'encounter', count: 0 }),
        pile('vic', { kind: 'victory', count: 1, cards: ['q'] }),
      ],
    });

    expect(groups(itemsFor({ kind: 'pile', id: 'disc:p0' }, view))).toEqual([['aside']]);
    expect(groups(itemsFor({ kind: 'pile', id: 'enc' }, view))).toEqual([['victory']]);
    const spectator: { role: Role } = { role: 'spectator' };
    view.you = { role: 'spectator', name: 'Kim', color: -1, host: false };
    expect(itemsFor({ kind: 'pile', id: 'enc' }, view, spectator).map((it) => it.id)).toEqual([
      'victory',
    ]);
  });

  it('spectator only browses public piles, opens out-of-play piles and sees the stage choice', () => {
    const view = makeView();
    view.you = { role: 'spectator', name: 'Kim', color: -1, host: false };
    const spectator: { role: Role } = { role: 'spectator' };

    expect(actionsFor({ kind: 'card', id: 'mine' }, view, spectator)).toEqual([]);
    // Decks only open their owner's out-of-play piles.
    const ids = (id: string) => itemsFor({ kind: 'pile', id }, view, spectator).map((it) => it.id);
    expect(ids('deck:p0')).toEqual(['aside']);
    expect(ids('enc')).toEqual(['victory', 'aside']);
    expect(ids('disc:p0')).toEqual(['browse', 'aside']);
    expect(ids('encd')).toEqual(['browse', 'victory', 'aside']);
    for (const id of ['disc:p0', 'encd']) {
      const items = itemsFor({ kind: 'pile', id }, view, spectator);
      expect(items[0]?.id).toBe('browse');
      expect(items[0]?.run?.()).toEqual({ local: 'browseBox', pile: id });
      // Spectators have no game keys (P5b-R6): the tooltip shows none.
      expect(items[0]?.key).toBeUndefined();
    }
    const stage = itemsFor({ kind: 'card', id: 'v' }, view, spectator);
    expect(stage.map((it) => it.id)).toEqual(['stage']);
    expect(stage[0]?.run?.()).toEqual({ local: 'stageBox' });
  });

  it('hand card gets no bar', () => {
    expect(actionsFor({ kind: 'hand', id: 'h' }, makeView(), ALEX)).toEqual([]);
  });

  it('an element that is gone gets no bar', () => {
    expect(actionsFor({ kind: 'card', id: 'gone' }, makeView(), ALEX)).toEqual([]);
    expect(actionsFor({ kind: 'pile', id: 'gone' }, makeView(), ALEX)).toEqual([]);
  });
});
