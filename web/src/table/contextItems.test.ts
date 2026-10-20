import { actionsFor, keyLabel, type ActionItem, type TableElement } from './actions';
import { cardTitle, contextItems, pileTitle, type ContextEntry } from './contextItems';
import { knownCard, type CardInfo } from '../lib/catalog';
import type { Area, CardView, PackFace, PileView, Role, View } from '../lib/types';

vi.mock('../lib/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/catalog')>()),
  knownCard: vi.fn(),
}));

// The catalog of the fixture: code -> faces.
const FACES: Record<string, Partial<PackFace>[]> = {
  '01001': [{ name: 'Spider-Man' }],
  '01094': [{ name: 'Rhino', stage: 'I' }],
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
        decks: [{ area: 'p0', ready: true, handCount: 0 }],
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
      cards: [
        card('mine', { tokens: { dmg: 6 }, status: { stunned: 1 } }),
        card('me', { identity: true }),
        card('v', { code: '01094', owner: -1, back: 'villain' }),
        card('s', { code: '01097', owner: -1, back: 'encounter' }),
        card('down', { code: undefined, faceDown: true }),
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
  it('lists a card in play in bar order, with its submenus and the arrow', () => {
    const entries = entriesFor({ kind: 'card', id: 'mine' });

    expect(texts(entries)).toEqual([
      '*Exhaust [E]',
      '---',
      'Add a token ▸',
      'Add a status ▸',
      '---',
      'Discard [⌫]',
      'Move to ▸',
      '---',
      'Draw an arrow [A]',
    ]);
    // The token menu splits in two, with the current counts.
    expect(texts(submenu(entries, 'Add a token').entries)).toEqual([
      'Damage (6) [D]',
      'Threat [T]',
      'Counter [N]',
    ]);
    expect(texts(submenu(entries, 'Add a status').entries)).toEqual([
      'Stunned (1) [S]',
      'Confused [C]',
      'Tough [G]',
      'Locked [L]',
    ]);
    expect(texts(submenu(entries, 'Move to').entries)).toEqual([
      'Hand [H]',
      'Top of deck',
      'Bottom of deck',
      'Shuffle into deck',
      '---',
      'Victory display',
      'Set aside',
    ]);
    // The items are the bar's: they run the same actions.
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
      'Choose the villain card to show',
      '---',
      'Add a token ▸',
      'Add a status ▸',
      '---',
      'Discard [⌫] (off)',
      'Move to ▸ (off)',
      '---',
      'Draw an arrow [A]',
    ]);
    expect(itemOf(entries, 'Discard').tip).toBe(reason);
    expect(submenu(entries, 'Move to').tip).toBe(reason);
  });

  it('greys out Discard and Move to on the identity card', () => {
    const entries = entriesFor({ kind: 'card', id: 'me' });
    const reason = 'The identity card stays on the table';

    expect(itemOf(entries, 'Discard')).toMatchObject({ disabled: true, tip: reason });
    expect(submenu(entries, 'Move to')).toMatchObject({ disabled: true, tip: reason });
  });

  it('shows the own deck flat, More actions inline', () => {
    expect(texts(entriesFor({ kind: 'pile', id: 'deck:p0' }))).toEqual([
      '*Draw 1 [W]',
      'Draw X [⇧W]',
      '---',
      'Top X [L]',
      'Search [K]',
      '---',
      'Discard X',
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
      'Discard X',
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

  it('offers a spectator Browse… only, and no card actions', () => {
    expect(texts(entriesFor({ kind: 'pile', id: 'disc:p0' }, SPECTATOR))).toEqual(['*Browse…']);
    expect(entriesFor({ kind: 'card', id: 'mine' }, SPECTATOR)).toEqual([]);
  });

  it("has nothing for another player's deck, an empty pile or a hand card", () => {
    expect(entriesFor({ kind: 'pile', id: 'deck:p1' })).toEqual([]);
    expect(entriesFor({ kind: 'pile', id: 'aside:p0' })).toEqual([]);
    expect(entriesFor({ kind: 'hand', id: 'h' })).toEqual([]);
  });
});

describe('cardTitle and pileTitle', () => {
  it('names a card as the table shows it, a stage card with its stage', () => {
    const view = makeView();
    const named = (id: string) => {
      const found = view.table!.cards.find((c) => c.id === id)!;
      const face = knownCard(found.code ?? '')?.card.faces[found.face] ?? null;
      return cardTitle(found, face);
    };

    expect(named('mine')).toBe('Spider-Man');
    expect(named('v')).toBe('Rhino (stage I)');
    expect(named('s')).toBe('The Break-In! (1A)');
    expect(named('down')).toBe('Face-down card');
  });

  it('names a pile from the viewer side, with its count', () => {
    const view = makeView();
    const titled = (id: string) =>
      pileTitle(
        view.table!.piles.find((p) => p.id === id)!,
        view,
      );

    expect(titled('deck:p0')).toBe('Your deck (34)');
    expect(titled('enc')).toBe('Encounter deck (29)');
    expect(titled('disc:p1')).toBe("Sam's discard (3)");
  });
});
