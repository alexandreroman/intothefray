// Once its card pool is loaded, the table fetches every card image of its game at low priority, and
// cancels what is still loading when it goes away.

import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import Table from './Table.svelte';
import { gameCards, loadGameCards, loadIndex } from '../lib/catalog';
import type { PackCard, PackFace, PresenceState, View } from '../lib/types';

vi.mock('../lib/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/catalog')>()),
  gameCards: vi.fn(),
  loadGameCards: vi.fn(),
  loadIndex: vi.fn(),
}));

// Stands in for the browser's Image: records each one made.
class RecordedImage {
  static made: RecordedImage[] = [];
  fetchPriority = '';
  src = '';

  constructor() {
    RecordedImage.made.push(this);
  }
}

function face(name: string, images: string[]): PackFace {
  return { name, type: '', size: 'std', images };
}

const POOL: PackCard[] = [
  {
    code: '01001',
    faces: [
      face('Spider-Man', ['01001a.jpg', 'cdb-01001a.jpg']),
      face('Peter Parker', ['01001b.jpg']),
    ],
    back: 'player',
    quantity: 1,
  },
  {
    code: '01094',
    faces: [face('Rhino', ['01094.jpg']), face('No scan', [])],
    back: 'villain',
    quantity: 1,
  },
];

function fakeSession() {
  return {
    act: vi.fn(() => 1),
    lobby: vi.fn(() => true),
    lastError: null,
    presence: new Map<number, PresenceState>(),
    sendPresence: vi.fn(),
    viewGap: 0,
  };
}

function makeView(): View {
  return {
    id: 'g1',
    phase: 'playing',
    you: { role: 'spectator', color: -1, host: false },
    players: [],
    spectators: 1,
    config: { scenario: 'rhino', difficulty: 'standard', standard: '', expert: '', modulars: [] },
    table: { cards: [], piles: [], stages: [], firstPlayer: { x: 0, y: 0 } },
    log: [],
  };
}

/** Lets the pool's promise settle and the table react to it. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await tick();
}

function sources(): string[] {
  return RecordedImage.made.map((img) => img.src);
}

beforeEach(() => {
  RecordedImage.made = [];
  vi.stubGlobal('Image', RecordedImage);
  vi.mocked(gameCards).mockReturnValue(POOL);
  vi.mocked(loadGameCards).mockResolvedValue();
  vi.mocked(loadIndex).mockReturnValue(new Promise(() => {}));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  document.body.replaceChildren();
});

describe('Table preload', () => {
  it('fetches the first image of every face at low priority once the pool is loaded', async () => {
    render(Table, { session: fakeSession(), view: makeView() });
    expect(RecordedImage.made).toEqual([]);

    await settle();

    expect(sources()).toEqual(['01001a.jpg', '01001b.jpg', '01094.jpg']);
    expect(RecordedImage.made.every((img) => img.fetchPriority === 'low')).toBe(true);
  });

  it('fetches nothing when the browser asks to save data', async () => {
    vi.stubGlobal('navigator', { ...navigator, connection: { saveData: true } });
    render(Table, { session: fakeSession(), view: makeView() });
    await settle();
    expect(RecordedImage.made).toEqual([]);
  });

  it('cancels the fetches when the table goes away', async () => {
    const { unmount } = render(Table, { session: fakeSession(), view: makeView() });
    await settle();

    unmount();

    expect(sources()).toEqual(['', '', '']);
  });

  it('fetches nothing for a table left before the pool is loaded', async () => {
    let loaded = () => {};
    vi.mocked(loadGameCards).mockReturnValue(new Promise<void>((resolve) => (loaded = resolve)));
    const { unmount } = render(Table, { session: fakeSession(), view: makeView() });

    unmount();
    loaded();
    await settle();

    expect(RecordedImage.made).toEqual([]);
  });

  it('does not fetch again on a new view', async () => {
    const { rerender } = render(Table, { session: fakeSession(), view: makeView() });
    await settle();

    await rerender({ view: makeView() });
    await settle();

    expect(sources()).toEqual(['01001a.jpg', '01001b.jpg', '01094.jpg']);
  });
});
