import { actionsFor, keyLabel, type ActionItem, type TableElement } from './actions';
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
  '01100': [{ name: 'Hard to Keep Down', localized: { fr: { name: 'Coriace' } } }],
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
    you: { role: 'player', name: 'Alex', color: 0, host: true, areas: ['p0'] },
    players: [
      {
        name: 'Alex',
        color: 0,
        host: true,
        ready: true,
        decks: [{ area: 'p0', ready: true, handCount: 1 }],
      },
      {
        name: 'Sam',
        color: 1,
        host: false,
        ready: true,
        decks: [{ area: 'p1', ready: true, handCount: 0 }],
      },
    ],
    spectators: 0,
    config: { scenario: 'rhino', difficulty: 'standard', standard: '', expert: '', modulars: [] },
    table: {
      cards,
      piles,
      hands: { p0: ['h'] },
      stages: [
        { key: 'villain', label: 'Villain', current: 'v', cards: ['v'] },
        { key: 'main', label: 'Main scheme', current: 's', cards: ['s'] },
      ],
      firstPlayer: { x: 860, y: 40 },
    },
    log: [],
  };
}

const ALEX: { areas: Area[]; role: Role } = { areas: ['p0'], role: 'player' };

function itemsFor(
  el: TableElement,
  view = makeView(),
  you: { areas?: readonly Area[]; role: Role } = ALEX,
): ActionItem[] {
  const result = actionsFor(el, view, you, 'en');
  if (!Array.isArray(result)) {
    throw new Error(`expected items, got the text "${result.text}"`);
  }
  return result;
}

/** The item ids, one list per group, in menu order. */
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

    expect(groups(items)).toEqual([['exhaust'], ['tokens', 'statuses'], ['discard', 'moveTo']]);
    const exhaust = item(items, 'exhaust');
    expect(exhaust).toMatchObject({ label: 'Exhaust', key: 'E' });
    // Only a disabled item says why.
    expect(items.some((it) => it.reason !== undefined)).toBe(false);
    expect(actionOf(exhaust)).toEqual({ kind: 'exhaust', card: 'mine' });
    // The arrow starts with its key (A), a Shift + drag or the context menu's own last item.
    expect(items.map((i) => i.id)).not.toContain('arrow');
    const discard = item(items, 'discard');
    expect(discard).toMatchObject({
      label: 'Discard',
      key: 'X',
      altKeys: ['Backspace'],
    });
    expect(actionOf(discard)).toEqual({ kind: 'discard', card: 'mine' });

    // A submenu for the tokens, another for the statuses.
    expect(item(items, 'tokens').label).toBe('Add a token');
    const tokens = menuOf(items, 'tokens');
    expect(tokens.map((it) => [it.id, it.label, it.key])).toEqual([
      ['dmg', 'Damage', 'D'],
      ['thr', 'Threat', 'T'],
      ['gen', 'Counter', 'N'],
    ]);
    expect(item(items, 'statuses').label).toBe('Add a status');
    const statuses = menuOf(items, 'statuses');
    expect(statuses.map((it) => [it.id, it.label, it.key])).toEqual([
      ['stunned', 'Stunned', 'S'],
      ['confused', 'Confused', 'C'],
      ['tough', 'Tough', 'G'],
      ['locked', 'Locked', 'L'],
    ]);
    expect(actionOf(item(tokens, 'thr'))).toEqual({
      kind: 'token',
      card: 'mine',
      name: 'thr',
      delta: 1,
    });
    expect(actionOf(item(statuses, 'tough'))).toEqual({
      kind: 'status',
      card: 'mine',
      name: 'tough',
      delta: 1,
    });

    const move = menuOf(items, 'moveTo');
    expect(item(items, 'moveTo').label).toBe('Move to');
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
    expect(item(move, 'deckBottom').key).toBe('B');
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

  it('an exhausted card shows ready and the counter submenus give the counts', () => {
    const view = makeView({
      cards: [card('mine', { exhausted: true, tokens: { dmg: 2 }, status: { stunned: 1 } })],
    });
    const items = itemsFor({ kind: 'card', id: 'mine' }, view);

    expect(item(items, 'exhaust')).toMatchObject({ label: 'Ready', key: 'E' });
    expect(menuOf(items, 'tokens').map((it) => it.label)).toEqual([
      'Damage (2)',
      'Threat',
      'Counter',
    ]);
    expect(menuOf(items, 'statuses').map((it) => it.label)).toEqual([
      'Stunned (1)',
      'Confused',
      'Tough',
      'Locked',
    ]);
  });

  it('an exhausted locked card cannot be readied; a ready one can still be exhausted', () => {
    const lockedCard = (exhausted: boolean) =>
      makeView({ cards: [card('mine', { exhausted, status: { locked: 1 } })] });

    expect(item(itemsFor({ kind: 'card', id: 'mine' }, lockedCard(true)), 'exhaust')).toMatchObject(
      {
        label: 'Ready',
        reason: 'Locked: this card does not ready',
        disabled: true,
      },
    );
    const exhaust = item(itemsFor({ kind: 'card', id: 'mine' }, lockedCard(false)), 'exhaust');
    expect(exhaust).toMatchObject({ label: 'Exhaust', disabled: false });
    expect(exhaust.reason).toBeUndefined();
  });

  it('a card with several faces shows flip', () => {
    const items = itemsFor({ kind: 'card', id: 'two' });

    expect(groups(items)).toEqual([
      ['exhaust', 'flip'],
      ['tokens', 'statuses'],
      ['discard', 'moveTo'],
    ]);
    const flip = item(items, 'flip');
    expect(flip).toMatchObject({ label: 'Flip', key: 'F' });
    expect(actionOf(flip)).toEqual({ kind: 'flip', card: 'two' });
  });

  it('stage top card shows choose instead of flip', () => {
    // The main scheme has two faces, yet its card choice replaces Flip.
    const items = itemsFor({ kind: 'card', id: 's' });

    expect(groups(items)).toEqual([
      ['exhaust', 'stage'],
      ['tokens', 'statuses'],
      ['discard', 'moveTo'],
    ]);
    const stage = item(items, 'stage');
    expect(stage).toMatchObject({ label: 'Change card…', key: 'V' });
    expect(stage.run?.()).toEqual({ local: 'stageBox' });
    expect(item(itemsFor({ kind: 'card', id: 'v' }), 'stage').label).toBe('Change card…');
  });

  it('a stage top card cannot leave the table', () => {
    const items = itemsFor({ kind: 'card', id: 'v' });
    const reason = 'The villain card stays on the table: choose another card to show';

    expect(item(items, 'discard')).toMatchObject({ disabled: true, reason });
    expect(item(items, 'moveTo')).toMatchObject({ disabled: true, reason });
  });

  it('an identity card cannot leave the table', () => {
    const view = makeView({ cards: [card('mine', { identity: true })] });
    const items = itemsFor({ kind: 'card', id: 'mine' }, view);
    const reason = 'The identity card stays on the table';

    expect(item(items, 'discard')).toMatchObject({ disabled: true, reason });
    expect(item(items, 'moveTo')).toMatchObject({ disabled: true, reason });
    // It is still played on the table.
    expect(item(items, 'exhaust').disabled).toBeFalsy();
  });

  it('a card holding an identity card cannot leave the table, a card tucked under one can', () => {
    const view = makeView({
      cards: [
        card('host'),
        card('mine', { identity: true, parent: 'host' }),
        card('tucked', { parent: 'mine' }),
      ],
    });
    const host = itemsFor({ kind: 'card', id: 'host' }, view);
    const tucked = itemsFor({ kind: 'card', id: 'tucked' }, view);

    expect(item(host, 'discard')).toMatchObject({
      disabled: true,
      reason: 'The identity card stays on the table',
    });
    expect(item(host, 'moveTo').disabled).toBe(true);
    expect(item(tucked, 'discard').reason).toBeUndefined();
    expect(item(tucked, 'discard').disabled).toBeFalsy();
    expect(item(tucked, 'moveTo').disabled).toBeFalsy();
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

    expect(groups(items)).toEqual([
      ['exhaust', 'flip'],
      ['tokens', 'statuses'],
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

    // The out-of-play piles open from the owner frame's chips, not from a menu.
    expect(groups(items)).toEqual([
      ['draw1', 'drawN'],
      ['lookTop', 'search'],
      ['discardTop', 'shuffle'],
    ]);
    expect(items.some((it) => it.reason !== undefined)).toBe(false);
    const draw = item(items, 'draw1');
    expect(draw).toMatchObject({ label: 'Draw 1', key: 'W' });
    expect(draw.shift).toBeUndefined();
    expect(actionOf(draw)).toEqual({ kind: 'draw', n: 1 });

    // Draw X is a button of its own, taken with Shift + W.
    const drawNItem = item(items, 'drawN');
    expect(drawNItem).toMatchObject({
      label: 'Draw X',
      key: 'W',
      shift: true,
    });
    const drawN = drawNItem.run?.();
    if (!drawN || !('ask' in drawN)) {
      throw new Error('Draw X must ask how many cards');
    }
    expect(drawN.ask).toMatchObject({
      title: 'Draw cards',
      question: 'How many cards do you draw?',
      pile: 'deck:p0',
      max: 30,
      ok: 'Draw',
    });
    expect(drawN.ask.make(3)).toEqual({ kind: 'draw', n: 3 });

    expect(item(items, 'lookTop')).toMatchObject({ label: 'Top X', key: 'L' });
    const lookTop = item(items, 'lookTop').run?.();
    if (!lookTop || !('ask' in lookTop)) {
      throw new Error('Top X must ask how many cards');
    }
    expect(lookTop.ask).toMatchObject({
      title: 'Look at the top cards',
      question: 'How many cards from the top of your deck?',
      pile: 'deck:p0',
      max: 30,
      ok: 'Look',
    });
    expect(lookTop.ask.make(4)).toEqual({ kind: 'look', pile: 'deck:p0', n: 4 });
    expect(item(items, 'search')).toMatchObject({ label: 'Search', key: 'K' });
    expect(actionOf(item(items, 'search'))).toEqual({ kind: 'search', pile: 'deck:p0' });

    // The rarer actions, in a group of their own.
    expect(item(items, 'discardTop').label).toBe('Discard X');
    expect(item(items, 'discardTop').key).toBeUndefined();
    expect(item(items, 'shuffle')).toMatchObject({ label: 'Shuffle', key: 'U' });
    const discardTop = item(items, 'discardTop').run?.();
    if (!discardTop || !('ask' in discardTop)) {
      throw new Error('Discard X must ask how many cards');
    }
    expect(discardTop.ask).toMatchObject({
      title: 'Discard from the top',
      question: 'How many cards from the top of your deck go to the discard pile?',
      pile: 'deck:p0',
      max: 30,
      ok: 'Discard',
    });
    expect(discardTop.ask.make(2)).toEqual({ kind: 'discardTop', pile: 'deck:p0', n: 2 });
    expect(actionOf(item(items, 'shuffle'))).toEqual({ kind: 'shuffle', pile: 'deck:p0' });
  });

  it('a count is never asked beyond what the server accepts', () => {
    const view = makeView({ piles: [pile('deck:p0', { owner: 0, count: 120 })] });
    const lookTop = item(itemsFor({ kind: 'pile', id: 'deck:p0' }, view), 'lookTop').run?.();

    expect(lookTop && 'ask' in lookTop && lookTop.ask.max).toBe(99);
  });

  it('encounter deck items', () => {
    const items = itemsFor({ kind: 'pile', id: 'enc' });

    expect(groups(items)).toEqual([['reveal'], ['lookTop', 'search'], ['discardTop', 'shuffle']]);
    const reveal = item(items, 'reveal');
    expect(reveal).toMatchObject({ label: 'Reveal', key: 'R' });
    expect(reveal.reason).toBeUndefined();
    expect(reveal.disabled).toBeFalsy();
    expect(actionOf(reveal)).toEqual({ kind: 'reveal' });
    const lookTop = item(items, 'lookTop').run?.();
    expect(lookTop && 'ask' in lookTop && lookTop.ask.question).toBe(
      'How many cards from the top of the encounter deck?',
    );
    expect(actionOf(item(items, 'search'))).toEqual({ kind: 'search', pile: 'enc' });
    const discardTop = item(items, 'discardTop').run?.();
    expect(discardTop && 'ask' in discardTop && discardTop.ask.question).toBe(
      'How many cards from the top of the encounter deck go to the discard pile?',
    );
    expect(actionOf(item(items, 'shuffle'))).toEqual({ kind: 'shuffle', pile: 'enc' });
  });

  it('encounter reveal disabled while revealed', () => {
    const view = makeView({
      cards: [card('r', { code: '01100', owner: -1, onPile: 'enc' })],
      piles: [pile('enc', { kind: 'encounter', count: 20 })],
    });
    const reveal = item(itemsFor({ kind: 'pile', id: 'enc' }, view), 'reveal');

    expect(reveal.disabled).toBe(true);
    expect(reveal.reason).toBe('Hard to Keep Down is already revealed on this deck: move it first');
  });

  it('names the revealed card in the viewer language', () => {
    const view = makeView({
      cards: [card('r', { code: '01100', owner: -1, onPile: 'enc' })],
      piles: [pile('enc', { kind: 'encounter', count: 20 })],
    });
    const items = actionsFor({ kind: 'pile', id: 'enc' }, view, ALEX, 'fr');
    if (!Array.isArray(items)) {
      throw new Error(`expected items, got the text "${items.text}"`);
    }

    expect(item(items, 'reveal').reason).toBe(
      'Coriace is already revealed on this deck: move it first',
    );
  });

  it('discard pile items', () => {
    const items = itemsFor({ kind: 'pile', id: 'disc:p0' });

    expect(groups(items)).toEqual([['search'], ['shuffleBack']]);
    const search = item(items, 'search');
    expect(search).toMatchObject({ label: 'Search', key: 'K' });
    expect(actionOf(search)).toEqual({ kind: 'search', pile: 'disc:p0' });
    const back = item(items, 'shuffleBack');
    expect(back.label).toBe('Shuffle into deck');
    expect(actionOf(back)).toEqual({ kind: 'shuffleBack', pile: 'disc:p0' });
    expect(groups(itemsFor({ kind: 'pile', id: 'encd' }))).toEqual([['search'], ['shuffleBack']]);
  });

  it("another player's discard pile can only be searched", () => {
    expect(groups(itemsFor({ kind: 'pile', id: 'disc:p1' }))).toEqual([['search']]);
  });

  it('out-of-play piles have no actions: they are not drawn on the table', () => {
    for (const id of ['vic', 'saside', 'aside:p0', 'aside:p1']) {
      expect(itemsFor({ kind: 'pile', id })).toEqual([]);
      const spectator: { role: Role } = { role: 'spectator' };
      expect(itemsFor({ kind: 'pile', id }, makeView(), spectator)).toEqual([]);
    }
  });

  it("other player's deck shows the belongs text, set-aside cards or not", () => {
    // The full table has Sam's set-aside cards: they do not open from his deck.
    expect(actionsFor({ kind: 'pile', id: 'deck:p1' }, makeView(), ALEX, 'en')).toEqual({
      text: 'Belongs to Sam: only they can use it.',
    });
    const view = makeView({ piles: [pile('deck:p1', { owner: 1, count: 30 })] });
    expect(actionsFor({ kind: 'pile', id: 'deck:p1' }, view, ALEX, 'en')).toEqual({
      text: 'Belongs to Sam: only they can use it.',
    });
  });

  it('an empty pile has no actions', () => {
    const view = makeView({
      piles: [pile('disc:p0', { kind: 'discard', owner: 0, count: 0 })],
    });

    expect(actionsFor({ kind: 'pile', id: 'disc:p0' }, view, ALEX, 'en')).toEqual([]);
  });

  it('an empty deck or discard pile has no actions, even with out-of-play piles', () => {
    const view = makeView({
      piles: [
        pile('deck:p0', { owner: 0, count: 0 }),
        pile('disc:p0', { kind: 'discard', owner: 0, count: 0 }),
        pile('aside:p0', { kind: 'aside', owner: 0, count: 1, cards: ['z'] }),
        pile('enc', { kind: 'encounter', count: 0 }),
        pile('vic', { kind: 'victory', count: 1, cards: ['q'] }),
      ],
    });

    for (const id of ['deck:p0', 'disc:p0', 'enc']) {
      expect(actionsFor({ kind: 'pile', id }, view, ALEX, 'en'), id).toEqual([]);
    }
    view.you = { role: 'spectator', name: 'Kim', color: -1, host: false };
    const spectator: { role: Role } = { role: 'spectator' };
    expect(itemsFor({ kind: 'pile', id: 'enc' }, view, spectator)).toEqual([]);
  });

  it('spectator only browses public piles', () => {
    const view = makeView();
    view.you = { role: 'spectator', name: 'Kim', color: -1, host: false };
    const spectator: { role: Role } = { role: 'spectator' };

    expect(actionsFor({ kind: 'card', id: 'mine' }, view, spectator, 'en')).toEqual([]);
    // Decks list no cards: nothing to browse.
    const ids = (id: string) => itemsFor({ kind: 'pile', id }, view, spectator).map((it) => it.id);
    expect(ids('deck:p0')).toEqual([]);
    expect(ids('enc')).toEqual([]);
    expect(ids('disc:p0')).toEqual(['browse']);
    expect(ids('encd')).toEqual(['browse']);
    for (const id of ['disc:p0', 'encd']) {
      const items = itemsFor({ kind: 'pile', id }, view, spectator);
      expect(items[0]?.run?.()).toEqual({ local: 'browseBox', pile: id });
      // Spectators have no game keys (P5b-R6): the menu shows none.
      expect(items[0]?.key).toBeUndefined();
    }
  });

  it('spectator gets no stage action on the villain and the main scheme', () => {
    const view = makeView();
    view.you = { role: 'spectator', name: 'Kim', color: -1, host: false };
    const spectator: { role: Role } = { role: 'spectator' };

    expect(actionsFor({ kind: 'card', id: 'v' }, view, spectator, 'en')).toEqual([]);
    expect(actionsFor({ kind: 'card', id: 's' }, view, spectator, 'en')).toEqual([]);
  });

  it('hand card gets no actions', () => {
    expect(actionsFor({ kind: 'hand', id: 'h' }, makeView(), ALEX, 'en')).toEqual([]);
  });

  it('an element that is gone gets no actions', () => {
    expect(actionsFor({ kind: 'card', id: 'gone' }, makeView(), ALEX, 'en')).toEqual([]);
    expect(actionsFor({ kind: 'pile', id: 'gone' }, makeView(), ALEX, 'en')).toEqual([]);
  });
});

describe('a player with two decks', () => {
  const TWO_DECKS: { areas: Area[]; role: Role } = { areas: ['p0', 'p1'], role: 'player' };

  /** Alex plays p0 and p1 (Spider-Man), Sam p2. */
  function twoDeckView(piles?: PileView[]): View {
    const view = makeView({
      cards: [card('second', { owner: 1 }), card('sams', { owner: 2 })],
      piles: piles ?? [
        pile('deck:p1', { owner: 1, count: 30 }),
        pile('aside:p1', { kind: 'aside', owner: 1, count: 1, cards: ['z'] }),
        pile('deck:p2', { owner: 2, count: 30 }),
      ],
    });
    view.you.areas = ['p0', 'p1'];
    view.players = [
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
    ];
    return view;
  }

  it('own deck actions for second seat', () => {
    const view = twoDeckView();
    const deck = itemsFor({ kind: 'pile', id: 'deck:p1' }, view, TWO_DECKS);
    expect(groups(deck)).toEqual([
      ['draw1', 'drawN'],
      ['lookTop', 'search'],
      ['discardTop', 'shuffle'],
    ]);

    const move = menuOf(itemsFor({ kind: 'card', id: 'second' }, view, TWO_DECKS), 'moveTo');
    expect(move.map((it) => it.id)).toEqual([
      'hand',
      'deckTop',
      'deckBottom',
      'deckShuffle',
      'sep',
      'aside',
    ]);
    expect(actionOf(item(move, 'aside'))).toEqual({
      kind: 'toPile',
      card: 'second',
      target: 'aside:p1',
    });
  });

  it("other player's deck belongs", () => {
    const view = twoDeckView([pile('deck:p2', { owner: 2, count: 30 })]);
    expect(actionsFor({ kind: 'pile', id: 'deck:p2' }, view, TWO_DECKS, 'en')).toEqual({
      text: 'Belongs to Sam: only they can use it.',
    });
    const move = menuOf(itemsFor({ kind: 'card', id: 'sams' }, view, TWO_DECKS), 'moveTo');
    expect(move.map((it) => it.id)).toEqual([]);
  });
});

describe('side decks', () => {
  // Alex (p0) has an Invocation deck with its discard pile and a Sense deck without one; Sam (p1)
  // has an Invocation deck.
  const sidePiles = [
    pile('deck:p0', { owner: 0, count: 30 }),
    pile('disc:p0', { kind: 'discard', owner: 0, count: 0, cards: [] }),
    pile('aside:p0', { kind: 'aside', owner: 0, count: 1, cards: ['z'] }),
    pile('side:p0:0', {
      kind: 'sideDeck',
      owner: 0,
      count: 4,
      label: 'Invocation',
      topFaceUp: true,
      cards: ['inv-top'],
    }),
    pile('sided:p0:0', {
      kind: 'sideDiscard',
      owner: 0,
      count: 1,
      label: 'Invocation',
      cards: ['u'],
    }),
    pile('side:p0:1', { kind: 'sideDeck', owner: 0, count: 5, label: 'Sense' }),
    pile('side:p1:0', { kind: 'sideDeck', owner: 1, count: 5, label: 'Invocation' }),
    pile('sided:p1:0', {
      kind: 'sideDiscard',
      owner: 1,
      count: 1,
      label: 'Invocation',
      cards: ['w'],
    }),
    pile('vic', { kind: 'victory', count: 0, cards: [] }),
  ];
  const sideCards = [
    card('inv', { home: 'side:p0:0' }),
    card('sense', { home: 'side:p0:1' }),
    card('inv-top', { zone: 'pile', home: 'side:p0:0' }),
  ];
  const view = () => makeView({ cards: sideCards, piles: sidePiles });
  const pileItems = (id: string) => itemsFor({ kind: 'pile', id }, view());

  it('own side deck items: Draw 1 and Draw X from it, Top X, Search, Discard X when it has a discard pile, Shuffle', () => {
    const items = pileItems('side:p0:0');
    // No out-of-play buttons: those are on the deck and the discard pile.
    expect(groups(items)).toEqual([
      ['draw1', 'drawN'],
      ['lookTop', 'search'],
      ['discardTop', 'shuffle'],
    ]);
    expect(actionOf(item(items, 'draw1'))).toEqual({ kind: 'draw', n: 1, pile: 'side:p0:0' });
    const drawN = item(items, 'drawN').run?.();
    expect(drawN && 'ask' in drawN && drawN.ask.make(2)).toEqual({
      kind: 'draw',
      n: 2,
      pile: 'side:p0:0',
    });

    const lookTop = item(items, 'lookTop').run?.();
    expect(lookTop && 'ask' in lookTop && lookTop.ask.question).toBe(
      'How many cards from the top of your Invocation deck?',
    );
    expect(actionOf(item(items, 'search'))).toEqual({
      kind: 'search',
      pile: 'side:p0:0',
    });

    const discardTop = item(items, 'discardTop').run?.();
    expect(discardTop && 'ask' in discardTop && discardTop.ask.make(1)).toEqual({
      kind: 'discardTop',
      pile: 'side:p0:0',
      n: 1,
    });
    expect(actionOf(item(items, 'shuffle'))).toEqual({ kind: 'shuffle', pile: 'side:p0:0' });
  });

  it('a side deck without a discard pile has no Discard X', () => {
    expect(groups(pileItems('side:p0:1'))).toEqual([
      ['draw1', 'drawN'],
      ['lookTop', 'search'],
      ['shuffle'],
    ]);
  });

  it("another player's side deck belongs to them", () => {
    expect(actionsFor({ kind: 'pile', id: 'side:p1:0' }, view(), ALEX, 'en')).toEqual({
      text: 'Belongs to Sam: only they can use it.',
    });
  });

  it('a side discard pile is searched by anyone, shuffled back by its owner', () => {
    expect(groups(pileItems('sided:p0:0'))).toEqual([['search'], ['shuffleBack']]);
    expect(actionOf(item(pileItems('sided:p0:0'), 'shuffleBack'))).toEqual({
      kind: 'shuffleBack',
      pile: 'sided:p0:0',
    });
    expect(groups(pileItems('sided:p1:0'))).toEqual([['search']]);
  });

  it('a spectator browses a side discard pile, never the top card a side deck shows', () => {
    const watching = view();
    watching.you = { role: 'spectator', name: 'Kim', color: -1, host: false };
    const spectator: { role: Role } = { role: 'spectator' };
    const ids = (id: string) =>
      itemsFor({ kind: 'pile', id }, watching, spectator).map((it) => it.id);
    expect(ids('side:p0:0')).toEqual([]);
    expect(ids('sided:p0:0')).toEqual(['browse']);
  });

  it('a side card goes back to its side deck, named after it', () => {
    const items = itemsFor({ kind: 'card', id: 'inv' }, view());
    const moveTo = menuOf(items, 'moveTo');
    expect(moveTo.map((it) => [it.id, it.label])).toEqual([
      ['hand', 'Hand'],
      ['deckTop', 'Top of Invocation deck'],
      ['deckBottom', 'Bottom of Invocation deck'],
      ['deckShuffle', 'Shuffle into Invocation deck'],
      ['sep', '-'],
      ['victory', 'Victory display'],
      ['aside', 'Set aside'],
    ]);
    // The server follows the card's home: the action names no pile.
    expect(actionOf(item(moveTo, 'deckBottom'))).toEqual({
      kind: 'toDeck',
      card: 'inv',
      where: 'bottom',
    });
    expect(actionOf(item(items, 'discard'))).toEqual({ kind: 'discard', card: 'inv' });
  });

  it('a card of a side deck without a discard pile cannot be discarded', () => {
    const items = itemsFor({ kind: 'card', id: 'sense' }, view());
    expect(items.map((it) => it.id)).not.toContain('discard');
    expect(item(items, 'moveTo').menu?.map((it) => it.label)).toContain('Bottom of Sense deck');
  });
});

describe('a selected group', () => {
  // Alex's three cards, listed out of their drawing order (z), an encounter
  // card, Sam's card, Alex's identity, two cards of Alex's Sense deck and one
  // tucked under c1.
  const groupCards = [
    card('c2', { z: 2 }),
    card('c3', { z: 3 }),
    card('c1', { z: 1 }),
    card('e1', { code: '01100', owner: -1, back: 'encounter', z: 4 }),
    card('t1', { owner: 1, z: 5 }),
    card('me', { identity: true, z: 6 }),
    card('s1', { home: 'side:p0:1', z: 7 }),
    card('s2', { home: 'side:p0:1', z: 8 }),
    card('under', { parent: 'c1', z: 9 }),
  ];
  const groupView = () =>
    makeView({
      cards: groupCards,
      piles: [
        ...makeView().table!.piles,
        pile('side:p0:1', { kind: 'sideDeck', owner: 0, count: 5, label: 'Sense' }),
      ],
    });

  function groupItems(el: string, group: string[]): ActionItem[] {
    const result = actionsFor({ kind: 'card', id: el }, groupView(), ALEX, 'en', new Set(group));
    if (!Array.isArray(result)) {
      throw new Error(`expected items, got the text "${result.text}"`);
    }
    return result;
  }

  const moveIds = (items: ActionItem[]) => menuOf(items, 'moveTo').map((it) => it.id);

  it('Discard reads the number of cards and discards every unit, in unit order', () => {
    const discard = item(groupItems('c1', ['c1', 'c2', 'c3']), 'discard');
    expect(discard).toMatchObject({ label: 'Discard 3 cards', key: 'X', altKeys: ['Backspace'] });
    expect(actionOf(discard)).toEqual({
      kind: 'group',
      actions: [
        { kind: 'discard', card: 'c1' },
        { kind: 'discard', card: 'c2' },
        { kind: 'discard', card: 'c3' },
      ],
    });
  });

  it('an encounter card leaves Hand out; the decks need every unit own or encounter', () => {
    expect(moveIds(groupItems('c1', ['c1', 'e1']))).toEqual([
      'deckTop',
      'deckBottom',
      'sep',
      'victory',
      'aside',
    ]);
    // Sam's card goes to no deck of the viewer's, nor to their hand.
    expect(moveIds(groupItems('c1', ['c1', 't1']))).toEqual(['victory', 'aside']);
  });

  it('a card outside the group, or a group of one unit, gets its own items', () => {
    for (const [el, group] of [
      ['c1', ['c2', 'c3']],
      ['c1', ['c1']],
      // The tucked card comes along with its host: one unit.
      ['c1', ['c1', 'under']],
    ] as const) {
      const items = groupItems(el, [...group]);
      const discard = item(items, 'discard');
      expect(discard.label).toBe('Discard');
      expect(actionOf(discard)).toEqual({ kind: 'discard', card: 'c1' });
      expect(moveIds(items)).toContain('deckShuffle');
    }
  });

  it('a unit that stays on the table disables Discard and Move to', () => {
    const items = groupItems('c1', ['c1', 'me']);
    const reason = 'The identity card stays on the table';
    expect(item(items, 'discard')).toMatchObject({ disabled: true, reason });
    expect(item(items, 'moveTo')).toMatchObject({ disabled: true, reason });
  });

  it('offers no shuffle into a deck', () => {
    expect(moveIds(groupItems('c1', ['c1', 'c2']))).toEqual([
      'hand',
      'deckTop',
      'deckBottom',
      'sep',
      'victory',
      'aside',
    ]);
  });

  it('every other item still acts on the one card', () => {
    const items = groupItems('c2', ['c1', 'c2']);
    expect(actionOf(item(items, 'exhaust'))).toEqual({ kind: 'exhaust', card: 'c2' });
    expect(actionOf(item(menuOf(items, 'tokens'), 'dmg'))).toEqual({
      kind: 'token',
      card: 'c2',
      name: 'dmg',
      delta: 1,
    });
  });

  it('Hand takes every unit into the hand', () => {
    const hand = item(menuOf(groupItems('c1', ['c1', 'c2']), 'moveTo'), 'hand');
    expect(hand).toMatchObject({ label: 'Hand', key: 'H' });
    expect(actionOf(hand)).toEqual({
      kind: 'group',
      actions: [
        { kind: 'toHand', card: 'c1' },
        { kind: 'toHand', card: 'c2' },
      ],
    });
  });

  it('group Top of deck sends toDeck where top for every unit', () => {
    const top = item(menuOf(groupItems('c1', ['c1', 'c2']), 'moveTo'), 'deckTop');
    expect(top.label).toBe('Top of deck');
    expect(actionOf(top)).toEqual({
      kind: 'group',
      actions: [
        { kind: 'toDeck', card: 'c1', where: 'top' },
        { kind: 'toDeck', card: 'c2', where: 'top' },
      ],
    });
  });

  it('group Bottom of deck uses the B key', () => {
    const bottom = item(menuOf(groupItems('c1', ['c1', 'c2']), 'moveTo'), 'deckBottom');
    expect(bottom).toMatchObject({ label: 'Bottom of deck', key: 'B' });
    expect(actionOf(bottom)).toEqual({
      kind: 'group',
      actions: [
        { kind: 'toDeck', card: 'c1', where: 'bottom' },
        { kind: 'toDeck', card: 'c2', where: 'bottom' },
      ],
    });
  });

  it('one shared side deck names it, mixed homes read decks', () => {
    const sense = groupItems('s1', ['s1', 's2']);
    // The Sense deck has no discard pile: no Discard either.
    expect(sense.map((it) => it.id)).not.toContain('discard');
    const senseLabels = menuOf(sense, 'moveTo').map((it) => it.label);
    expect(senseLabels).toContain('Top of Sense deck');
    expect(senseLabels).toContain('Bottom of Sense deck');

    const mixed = menuOf(groupItems('c1', ['c1', 's1']), 'moveTo').map((it) => it.label);
    expect(mixed).toContain('Top of decks');
    expect(mixed).toContain('Bottom of decks');
  });

  it("group Set aside sends toPile per unit to its owner's aside pile", () => {
    const aside = item(menuOf(groupItems('c1', ['c1', 't1']), 'moveTo'), 'aside');
    expect(actionOf(aside)).toEqual({
      kind: 'group',
      actions: [
        { kind: 'toPile', card: 'c1', target: 'aside:p0' },
        { kind: 'toPile', card: 't1', target: 'saside' },
      ],
    });
  });

  it('Victory display sends toPile vic per unit', () => {
    const victory = item(menuOf(groupItems('c1', ['c1', 'e1']), 'moveTo'), 'victory');
    expect(actionOf(victory)).toEqual({
      kind: 'group',
      actions: [
        { kind: 'toPile', card: 'c1', target: 'vic' },
        { kind: 'toPile', card: 'e1', target: 'vic' },
      ],
    });
  });
});

describe('keyLabel', () => {
  it('shows the main key, a Shift key after ⇧, and nothing without a key', () => {
    expect(keyLabel({ key: 'E' })).toBe('E');
    // Discard runs on Backspace too, yet shows its main key only.
    expect(keyLabel(item(itemsFor({ kind: 'card', id: 'mine' }), 'discard'))).toBe('X');
    expect(keyLabel({ key: 'W', shift: true })).toBe('⇧W');
    expect(keyLabel({})).toBeUndefined();
  });
});
