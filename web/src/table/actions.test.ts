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
  return { card: { code, faces: full, back: 'player', quantity: 1 }, face: 0, pack: 'core' };
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

function pile(id: string, extra: Partial<PileView>): PileView {
  return { id, kind: 'deck', owner: -1, area: 'villain', x: 0, y: 0, count: 5, ...extra };
}

/** Rhino with two players, Alex (p0) and Sam (p1), and every pile of a real table. */
function makeView(extra: { cards?: CardView[]; piles?: PileView[] } = {}): View {
  const cards = extra.cards ?? [
    card('mine'),
    card('two', { code: '01002' }),
    card('down', { code: undefined, faceDown: true }),
    card('theirs', { owner: 1, area: 'p1' }),
    card('enemy', { code: '01100', owner: -1, back: 'encounter', area: 'p0' }),
    card('v', { code: '01094', owner: -1, back: 'villain', area: 'villain', stage: 'villain' }),
    card('s', { code: '01097', owner: -1, back: 'encounter', area: 'villain', stage: 'main' }),
    card('h', { zone: 'hand', area: undefined }),
  ];
  const piles = extra.piles ?? [
    pile('deck:p0', { owner: 0, area: 'p0', count: 30 }),
    pile('disc:p0', { kind: 'discard', owner: 0, area: 'p0', count: 2, cards: ['x', 'y'] }),
    pile('aside:p0', { kind: 'aside', owner: 0, area: 'p0', count: 1, cards: ['z'] }),
    pile('deck:p1', { owner: 1, area: 'p1', count: 30 }),
    pile('disc:p1', { kind: 'discard', owner: 1, area: 'p1', count: 1, cards: ['w'] }),
    pile('aside:p1', { kind: 'aside', owner: 1, area: 'p1', count: 1, cards: ['u'] }),
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
      firstPlayer: { area: 'p0', x: 860, y: 40 },
    },
    log: [],
  };
}

const ALEX: { area: Area; role: Role } = { area: 'p0', role: 'player' };

function itemsFor(el: TableElement, view = makeView(), you = ALEX): ActionItem[] {
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

    expect(groups(items)).toEqual([
      ['exhaust'],
      ['arrow', 'token', 'status'],
      ['discard', 'moveTo'],
    ]);
    const exhaust = item(items, 'exhaust');
    expect(exhaust).toMatchObject({ label: 'Exhaust', icon: 'exhaust', key: 'E', tip: 'Exhaust' });
    expect(actionOf(exhaust)).toEqual({ kind: 'exhaust', card: 'mine' });
    expect(item(items, 'arrow')).toMatchObject({
      label: 'Arrow',
      icon: 'arrow',
      key: 'A',
      tip: 'Arrow',
    });
    expect(item(items, 'arrow').run?.()).toEqual({ local: 'arrow' });
    const discard = item(items, 'discard');
    expect(discard).toMatchObject({ label: 'Discard', icon: 'discard', key: 'X', tip: 'Discard' });
    expect(actionOf(discard)).toEqual({ kind: 'discard', card: 'mine' });

    expect(item(items, 'token')).toMatchObject({ label: '+ Token', tip: 'Add a token' });
    expect(menuOf(items, 'token').map((it) => [it.id, it.label, it.key])).toEqual([
      ['dmg', 'Damage', 'D'],
      ['thr', 'Threat', 'T'],
      ['gen', 'Counter', 'N'],
    ]);
    expect(actionOf(item(menuOf(items, 'token'), 'thr'))).toEqual({
      kind: 'token',
      card: 'mine',
      name: 'thr',
      delta: 1,
    });
    expect(item(items, 'status')).toMatchObject({ label: '+ Status', tip: 'Add a status' });
    expect(menuOf(items, 'status').map((it) => [it.id, it.label, it.key])).toEqual([
      ['stunned', 'Stunned', 'S'],
      ['confused', 'Confused', 'C'],
      ['tough', 'Tough', 'G'],
    ]);
    expect(actionOf(item(menuOf(items, 'status'), 'tough'))).toEqual({
      kind: 'status',
      card: 'mine',
      name: 'tough',
      delta: 1,
    });

    const move = menuOf(items, 'moveTo');
    expect(item(items, 'moveTo')).toMatchObject({ label: 'Move to', tip: 'Move to' });
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

  it('an exhausted card shows ready and the token menus give the counts', () => {
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
    expect(menuOf(items, 'token').map((it) => it.label)).toEqual([
      'Damage (2)',
      'Threat',
      'Counter',
    ]);
    expect(menuOf(items, 'status').map((it) => it.label)).toEqual([
      'Stunned (1)',
      'Confused',
      'Tough',
    ]);
  });

  it('a card with several faces shows flip', () => {
    const items = itemsFor({ kind: 'card', id: 'two' });

    expect(groups(items)).toEqual([
      ['exhaust'],
      ['flip'],
      ['arrow', 'token', 'status'],
      ['discard', 'moveTo'],
    ]);
    const flip = item(items, 'flip');
    expect(flip).toMatchObject({ label: 'Flip', icon: 'flip', key: 'F', tip: 'Flip' });
    expect(actionOf(flip)).toEqual({ kind: 'flip', card: 'two' });
  });

  it('stage top card shows choose instead of flip', () => {
    // The main scheme has two faces, yet its card choice replaces Flip.
    const items = itemsFor({ kind: 'card', id: 's' });

    expect(groups(items)).toEqual([
      ['exhaust'],
      ['stage'],
      ['arrow', 'token', 'status'],
      ['discard', 'moveTo'],
    ]);
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
        card('v', { code: '01094', owner: -1, area: 'villain', stage: 'villain', parent: 'mine' }),
      ],
    });
    const items = itemsFor({ kind: 'card', id: 'mine' }, view);

    expect(item(items, 'discard').disabled).toBe(true);
    expect(item(items, 'moveTo').disabled).toBe(true);
  });

  it('face-down card shows flip', () => {
    const items = itemsFor({ kind: 'card', id: 'down' });

    expect(groups(items)).toEqual([
      ['exhaust'],
      ['flip'],
      ['arrow', 'token', 'status'],
      ['discard', 'moveTo'],
    ]);
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

    expect(groups(items)).toEqual([['draw1', 'look', 'deck']]);
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
    const view = makeView({ piles: [pile('deck:p0', { owner: 0, area: 'p0', count: 120 })] });
    const lookTop = item(
      menuOf(itemsFor({ kind: 'pile', id: 'deck:p0' }, view), 'look'),
      'lookTop',
    ).run?.();

    expect(lookTop && 'ask' in lookTop && lookTop.ask.max).toBe(99);
  });

  it('encounter deck items', () => {
    const items = itemsFor({ kind: 'pile', id: 'enc' });

    expect(groups(items)).toEqual([['reveal', 'look', 'deck']]);
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
      cards: [card('r', { code: '01100', owner: -1, area: 'villain', onPile: 'enc' })],
      piles: [pile('enc', { kind: 'encounter', count: 20 })],
    });
    const reveal = item(itemsFor({ kind: 'pile', id: 'enc' }, view), 'reveal');

    expect(reveal.disabled).toBe(true);
    expect(reveal.tip).toBe('Hard to Keep Down is already revealed on this deck — move it first');
  });

  it('discard pile items', () => {
    const items = itemsFor({ kind: 'pile', id: 'disc:p0' });

    expect(groups(items)).toEqual([['search', 'shuffleBack']]);
    const search = item(items, 'search');
    expect(search).toMatchObject({ label: 'Search…', key: 'K', tip: 'Search…' });
    expect(actionOf(search)).toEqual({ kind: 'search', pile: 'disc:p0' });
    const back = item(items, 'shuffleBack');
    expect(back).toMatchObject({
      label: 'Shuffle back',
      tip: 'Shuffle this discard pile back into its deck',
    });
    expect(actionOf(back)).toEqual({ kind: 'shuffleBack', pile: 'disc:p0' });
    expect(groups(itemsFor({ kind: 'pile', id: 'encd' }))).toEqual([['search', 'shuffleBack']]);
  });

  it("another player's discard pile can only be searched", () => {
    expect(groups(itemsFor({ kind: 'pile', id: 'disc:p1' }))).toEqual([['search']]);
  });

  it('victory display can be browsed', () => {
    const items = itemsFor({ kind: 'pile', id: 'vic' });

    expect(groups(items)).toEqual([['browse']]);
    expect(item(items, 'browse')).toMatchObject({ label: 'Browse…', key: 'K', tip: 'Browse…' });
    expect(item(items, 'browse').run?.()).toEqual({ local: 'browseBox' });
  });

  it('aside pile has shuffle in', () => {
    const items = itemsFor({ kind: 'pile', id: 'saside' });

    expect(groups(items)).toEqual([['browse', 'shuffleIn']]);
    const shuffleIn = item(items, 'shuffleIn');
    expect(shuffleIn).toMatchObject({
      label: 'Shuffle in',
      tip: 'Shuffle all these cards into the encounter deck',
    });
    expect(actionOf(shuffleIn)).toEqual({ kind: 'shuffleIn', pile: 'saside' });
    expect(groups(itemsFor({ kind: 'pile', id: 'aside:p0' }))).toEqual([['browse', 'shuffleIn']]);
    expect(groups(itemsFor({ kind: 'pile', id: 'aside:p1' }))).toEqual([['browse']]);
  });

  it("other player's deck shows the belongs text", () => {
    expect(actionsFor({ kind: 'pile', id: 'deck:p1' }, makeView(), ALEX)).toEqual({
      text: 'Belongs to Sam — only they can use it.',
    });
  });

  it('an empty pile has no actions', () => {
    const view = makeView({
      piles: [pile('disc:p0', { kind: 'discard', owner: 0, area: 'p0', count: 0 })],
    });

    expect(actionsFor({ kind: 'pile', id: 'disc:p0' }, view, ALEX)).toEqual([]);
  });

  it('spectator gets nothing', () => {
    const view = makeView();
    view.you = { role: 'spectator', name: 'Kim', color: -1, host: false };
    const spectator: { area: Area; role: Role } = { area: 'villain', role: 'spectator' };

    expect(actionsFor({ kind: 'card', id: 'mine' }, view, spectator)).toEqual([]);
    expect(actionsFor({ kind: 'pile', id: 'deck:p0' }, view, spectator)).toEqual([]);
  });

  it('hand card gets no bar', () => {
    expect(actionsFor({ kind: 'hand', id: 'h' }, makeView(), ALEX)).toEqual([]);
  });

  it('an element that is gone gets no bar', () => {
    expect(actionsFor({ kind: 'card', id: 'gone' }, makeView(), ALEX)).toEqual([]);
    expect(actionsFor({ kind: 'pile', id: 'gone' }, makeView(), ALEX)).toEqual([]);
  });
});
