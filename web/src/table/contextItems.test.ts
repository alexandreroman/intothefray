import { actionsFor, keyLabel, type ActionItem, type TableElement } from './actions';
import type { TileAction } from './boxes';
import {
  cardHeader,
  contextItems,
  pileHeader,
  tileEntries,
  type ContextEntry,
} from './contextItems';
import { knownCard, type CardInfo } from '../lib/catalog';
import type { Area, CardView, PackFace, PileView, Role, View } from '../lib/types';

vi.mock('../lib/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/catalog')>()),
  knownCard: vi.fn(),
}));

// The catalog of the fixture: code -> faces.
const FACES: Record<string, Partial<PackFace>[]> = {
  '01001': [{ name: 'Spider-Man' }],
  '01094': [{ name: 'Rhino', type: 'villain', stage: 'I' }],
  '01096': [{ name: 'Defensive Network', type: 'player_side_scheme' }],
  '01098': [{ name: 'Peter Parker', type: 'alter_ego' }],
  '01099': [{ name: 'Black Cat', type: 'ally' }],
  '01097': [{ name: 'The Break-In!', type: 'main_scheme', stage: '1A', size: 'land' }],
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

/** Rhino with Alex (p0, the viewer) and Sam (p1). */
function makeView(): View {
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
        decks: [{ area: 'p0', ready: true, handCount: 0 }],
      },
      {
        name: 'Sam',
        color: 1,
        host: false,
        ready: true,
        online: true,
        decks: [{ area: 'p1', ready: true, handCount: 0 }],
      },
    ],
    spectators: 0,
    config: { scenario: 'rhino', difficulty: 'standard', standard: '', expert: '', modulars: [] },
    table: {
      cards: [
        card('mine', { tokens: { dmg: 6 }, status: { stunned: 1 } }),
        card('me', { identity: true }),
        card('v', { code: '01094', owner: -1, back: 'villain' }),
        card('s', { code: '01097', owner: -1, back: 'encounter' }),
        card('down', { code: undefined, faceDown: true }),
        card('inv', { home: 'side:p0:0' }),
        card('sense', { home: 'side:p0:1' }),
      ],
      piles: [
        pile('deck:p0', { owner: 0, count: 34 }),
        pile('disc:p0', { kind: 'discard', owner: 0, count: 2, cards: ['x', 'y'] }),
        pile('aside:p0', { kind: 'aside', owner: 0, count: 0, cards: [] }),
        pile('deck:p1', { owner: 1, count: 30 }),
        pile('disc:p1', { kind: 'discard', owner: 1, count: 3, cards: ['a', 'b', 'c'] }),
        pile('enc', { kind: 'encounter', count: 29 }),
        pile('encd', { kind: 'encounterDiscard', count: 1, cards: ['t'] }),
        pile('vic', { kind: 'victory', count: 0, cards: [] }),
        // Alex's Invocation deck has a discard pile of its own, the Sense deck none.
        pile('side:p0:0', { kind: 'sideDeck', owner: 0, count: 4, label: 'Invocation' }),
        pile('sided:p0:0', {
          kind: 'sideDiscard',
          owner: 0,
          count: 1,
          label: 'Invocation',
          cards: ['u'],
        }),
        pile('side:p0:1', { kind: 'sideDeck', owner: 0, count: 5, label: 'Sense' }),
        pile('side:p1:0', { kind: 'sideDeck', owner: 1, count: 5, label: 'Invocation' }),
      ],
      hands: {},
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
const SPECTATOR: { role: Role } = { role: 'spectator' };

function entriesFor(
  element: TableElement,
  you: { areas?: Area[]; role: Role } = ALEX,
): ContextEntry[] {
  return contextItems(element, actionsFor(element, makeView(), you, 'en'));
}

/**
 * The entries as text: "---" for a separator, a submenu's label with "▸", an
 * item's label with its key in brackets; "*" marks the default action, "(off)"
 * a disabled entry.
 */
function texts(entries: readonly ContextEntry[]): string[] {
  return entries.map((entry) => {
    switch (entry.kind) {
      case 'separator':
        return '---';
      case 'submenu':
        return `${entry.label} ▸${entry.disabled ? ' (off)' : ''}`;
      case 'action':
        return textOf(entry.item);
    }
  });
}

function textOf(item: ActionItem): string {
  const key = keyLabel(item);
  const parts = [item.default ? `*${item.label}` : item.label];
  if (key !== undefined) {
    parts.push(`[${key}]`);
  }
  if (item.disabled) {
    parts.push('(off)');
  }
  return parts.join(' ');
}

function submenu(entries: readonly ContextEntry[], label: string) {
  const found = entries.find((entry) => entry.kind === 'submenu' && entry.label === label);
  if (found?.kind !== 'submenu') {
    throw new Error(`no submenu ${label}`);
  }
  return found;
}

function itemOf(entries: readonly ContextEntry[], label: string): ActionItem {
  const found = entries.find((entry) => entry.kind === 'action' && entry.item.label === label);
  if (found?.kind !== 'action') {
    throw new Error(`no item ${label}`);
  }
  return found.item;
}

beforeEach(() => {
  vi.mocked(knownCard).mockImplementation(infoOf);
});

describe('contextItems', () => {
  it('lists a card in play in its order, with its submenus and the arrow', () => {
    const entries = entriesFor({ kind: 'card', id: 'mine' });

    expect(texts(entries)).toEqual([
      '*Exhaust [E]',
      'Flip [F]',
      '---',
      'Add a token ▸',
      'Add a status ▸',
      'Add a modifier ▸',
      '---',
      'Discard [X]',
      'Move to ▸',
      '---',
      'Draw an arrow [A]',
    ]);
    // One submenu for the tokens, one for the statuses, with the current counts.
    expect(texts(submenu(entries, 'Add a token').entries)).toEqual([
      'Damage (6) [D]',
      'Threat [T]',
      'Counter [N]',
    ]);
    expect(texts(submenu(entries, 'Add a status').entries)).toEqual([
      'Stunned (1) [S]',
      'Confused [C]',
      'Tough [G]',
      'Retaliate [R]',
      'Locked [L]',
    ]);
    // The modifiers have no keys: +1 to each stat, then −1 past a separator.
    expect(texts(submenu(entries, 'Add a modifier').entries)).toEqual([
      '+1 ATK',
      '+1 THW',
      '+1 DEF',
      '+1 SCH',
      '+1 REC',
      '+1 HP',
      '---',
      '−1 ATK',
      '−1 THW',
      '−1 DEF',
      '−1 SCH',
      '−1 REC',
      '−1 HP',
    ]);
    expect(itemOf(submenu(entries, 'Add a modifier').entries, '−1 SCH').run?.()).toEqual({
      kind: 'modifier',
      card: 'mine',
      name: 'sch',
      delta: -1,
    });
    expect(texts(submenu(entries, 'Move to').entries)).toEqual([
      'Hand [H]',
      'Top of deck',
      'Bottom of deck [B]',
      'Shuffle into deck',
      '---',
      'Victory display',
      'Set aside',
    ]);
    // The items are actionsFor's, which the keys run too: they run the same actions.
    expect(itemOf(submenu(entries, 'Add a token').entries, 'Damage (6)').run?.()).toEqual({
      kind: 'token',
      card: 'mine',
      name: 'dmg',
      delta: 1,
    });
    // Draw an arrow starts the arrow mode, as the A key does.
    expect(itemOf(entries, 'Draw an arrow').run?.()).toEqual({ local: 'arrow', card: 'mine' });
  });

  it('greys out Discard and Move to on the villain, with their reason', () => {
    const entries = entriesFor({ kind: 'card', id: 'v' });
    const reason = 'The villain card stays on the table: choose another card to show';

    expect(texts(entries)).toEqual([
      '*Exhaust [E]',
      'Change card… [V]',
      '---',
      'Add a token ▸',
      'Add a status ▸',
      'Add a modifier ▸',
      '---',
      'Discard [X] (off)',
      'Move to ▸ (off)',
      '---',
      'Draw an arrow [A]',
    ]);
    expect(itemOf(entries, 'Discard').reason).toBe(reason);
    expect(submenu(entries, 'Move to').reason).toBe(reason);
  });

  it('greys out Discard and Move to on the identity card', () => {
    const entries = entriesFor({ kind: 'card', id: 'me' });
    const reason = 'The identity card stays on the table';

    expect(itemOf(entries, 'Discard')).toMatchObject({ disabled: true, reason });
    expect(submenu(entries, 'Move to')).toMatchObject({ disabled: true, reason });
  });

  it('shows the own deck flat, its rarer actions as their own group', () => {
    expect(texts(entriesFor({ kind: 'pile', id: 'deck:p0' }))).toEqual([
      '*Draw 1 [W]',
      'Draw X [⇧W]',
      '---',
      'Top X [L]',
      'Search [K]',
      '---',
      'Discard 1 [X]',
      'Discard X [⇧X]',
      'Shuffle [U]',
    ]);
  });

  it('starts the encounter deck with Reveal', () => {
    expect(texts(entriesFor({ kind: 'pile', id: 'enc' }))).toEqual([
      '*Reveal [R]',
      '---',
      'Top X [L]',
      'Search [K]',
      '---',
      'Discard 1 [X]',
      'Discard X [⇧X]',
      'Shuffle [U]',
    ]);
  });

  it('starts a discard pile with Search', () => {
    expect(texts(entriesFor({ kind: 'pile', id: 'disc:p0' }))).toEqual([
      '*Search [K]',
      '---',
      'Shuffle into deck',
    ]);
    // Another player's discard pile: Search only.
    expect(texts(entriesFor({ kind: 'pile', id: 'disc:p1' }))).toEqual(['*Search [K]']);
  });

  it('shows an own side deck flat, with Discard 1 and Discard X only when it has a discard pile', () => {
    expect(texts(entriesFor({ kind: 'pile', id: 'side:p0:0' }))).toEqual([
      '*Draw 1 [W]',
      'Draw X [⇧W]',
      '---',
      'Top X [L]',
      'Search [K]',
      '---',
      'Discard 1 [X]',
      'Discard X [⇧X]',
      'Shuffle [U]',
    ]);
    expect(texts(entriesFor({ kind: 'pile', id: 'side:p0:1' }))).toEqual([
      '*Draw 1 [W]',
      'Draw X [⇧W]',
      '---',
      'Top X [L]',
      'Search [K]',
      '---',
      'Shuffle [U]',
    ]);
    expect(texts(entriesFor({ kind: 'pile', id: 'sided:p0:0' }))).toEqual([
      '*Search [K]',
      '---',
      'Shuffle into deck',
    ]);
  });

  it('sends a side card to its side deck, and discards it only with a side discard pile', () => {
    const invocation = entriesFor({ kind: 'card', id: 'inv' });
    expect(texts(submenu(invocation, 'Move to').entries)).toEqual([
      'Hand [H]',
      'Top of Invocation deck',
      'Bottom of Invocation deck [B]',
      'Shuffle into Invocation deck',
      '---',
      'Victory display',
      'Set aside',
    ]);
    expect(texts(invocation)).toContain('Discard [X]');

    expect(texts(entriesFor({ kind: 'card', id: 'sense' }))).toEqual([
      '*Exhaust [E]',
      'Flip [F]',
      '---',
      'Add a token ▸',
      'Add a status ▸',
      'Add a modifier ▸',
      '---',
      'Move to ▸',
      '---',
      'Draw an arrow [A]',
    ]);
  });

  it('offers a spectator Browse… only, and no card actions', () => {
    expect(texts(entriesFor({ kind: 'pile', id: 'disc:p0' }, SPECTATOR))).toEqual(['*Browse…']);
    expect(entriesFor({ kind: 'card', id: 'mine' }, SPECTATOR)).toEqual([]);
  });

  it("has nothing for another player's deck, an empty pile or a hand card", () => {
    expect(entriesFor({ kind: 'pile', id: 'deck:p1' })).toEqual([]);
    expect(entriesFor({ kind: 'pile', id: 'side:p1:0' })).toEqual([]);
    expect(entriesFor({ kind: 'pile', id: 'aside:p0' })).toEqual([]);
    expect(entriesFor({ kind: 'hand', id: 'h' })).toEqual([]);
  });
});

describe('tileEntries', () => {
  function tileAction(id: string, label: string): TileAction {
    return { id, label, run: () => ({ kind: 'discard', card: id }) };
  }

  it('lists what takes the card, then what sends it away, with Play as the default', () => {
    const entries = tileEntries([
      tileAction('draw', 'Draw'),
      tileAction('play', 'Play'),
      tileAction('discard', 'Discard'),
      tileAction('bottom', 'Put at the bottom of the deck'),
      tileAction('shuffle', 'Shuffle into deck'),
    ]);

    expect(
      entries.map((entry) =>
        entry.kind === 'action' ? [entry.item.id, entry.item.default ?? false] : entry.kind,
      ),
    ).toEqual([
      ['draw', false],
      ['play', true],
      'separator',
      ['discard', false],
      ['bottom', false],
      ['shuffle', false],
    ]);
  });

  it('runs what the tile action runs', () => {
    const [entry] = tileEntries([tileAction('discard', 'Discard')]);
    expect(entry?.kind === 'action' && entry.item.run?.()).toEqual({
      kind: 'discard',
      card: 'discard',
    });
  });

  it('has no separator when every action sends the card away', () => {
    const entries = tileEntries([tileAction('discard', 'Discard'), tileAction('bottom', 'Bottom')]);
    expect(entries.map((entry) => entry.kind)).toEqual(['action', 'action']);
  });
});

describe('cardHeader and pileHeader', () => {
  /** The header of a card, with the face the table would show for it. */
  function headerOf(found: CardView, view = makeView()) {
    const face = found.code ? (infoOf(found.code)?.card.faces[found.face] ?? null) : null;
    return cardHeader(found, face, view);
  }

  it("gives a villain card its type and stage, in the villain's colour", () => {
    expect(headerOf(card('v', { code: '01094', owner: -1, back: 'villain' }))).toEqual({
      eyebrow: 'Villain · Stage I',
      name: 'Rhino',
      color: 'var(--villain)',
      label: 'Rhino, Villain, stage I',
    });
  });

  it("names a main scheme's stage by its number", () => {
    const header = headerOf(card('s', { code: '01097', owner: -1, back: 'encounter' }));
    expect(header.eyebrow).toBe('Main scheme · 1A');
    expect(header.name).toBe('The Break-In!');
    expect(header.label).toBe('The Break-In!, Main scheme, 1A');
  });

  it("gives a player's card its type, in its owner's seat colour", () => {
    // Sam sits at p1 with colour 1, Alex at p0 with colour 0.
    expect(headerOf(card('cat', { code: '01099', owner: 1 }))).toEqual({
      eyebrow: 'Ally',
      name: 'Black Cat',
      color: 'var(--p2)',
      label: 'Black Cat, Ally',
    });
    const identity = headerOf(card('me', { code: '01098', owner: 0, identity: true }));
    expect(identity.eyebrow).toBe('Alter ego');
    expect(identity.color).toBe('var(--p1)');
  });

  it('spells an unknown type from its code', () => {
    expect(headerOf(card('p', { code: '01096' })).eyebrow).toBe('Player side scheme');
  });

  it('names a face-down card, in its owner colour', () => {
    expect(headerOf(card('down', { code: undefined, faceDown: true }))).toEqual({
      eyebrow: 'Face down',
      name: 'Face-down card',
      color: 'var(--p1)',
      label: 'Face-down card',
    });
  });

  it("names a pile by its owner and its kind, with its count, in the owner's colour", () => {
    const view = makeView();
    const headerOfPile = (id: string) =>
      pileHeader(
        view.table!.piles.find((p) => p.id === id)!,
        view,
      );

    expect(headerOfPile('deck:p0')).toEqual({
      eyebrow: 'Alex',
      name: 'Deck',
      count: 34,
      color: 'var(--p1)',
      label: 'Your deck, 34 cards',
    });
    expect(headerOfPile('enc')).toEqual({
      eyebrow: 'Villain',
      name: 'Encounter deck',
      count: 29,
      color: 'var(--villain)',
      label: 'Encounter deck, 29 cards',
    });
    expect(headerOfPile('disc:p1')).toMatchObject({
      eyebrow: 'Sam',
      name: 'Discard',
      color: 'var(--p2)',
    });
    expect(headerOfPile('encd').label).toBe('Encounter discard, 1 card');
    expect(headerOfPile('side:p0:0')).toMatchObject({
      eyebrow: 'Alex',
      name: 'Invocation deck',
      label: 'Your Invocation deck, 4 cards',
    });
    expect(headerOfPile('sided:p0:0').name).toBe('Invocation discard');
  });
});
