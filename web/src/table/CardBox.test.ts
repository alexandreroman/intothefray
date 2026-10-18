import { fireEvent, render, screen, within } from '@testing-library/svelte';
import Table from './Table.svelte';
import { pileLabel, tileActions, type TileAction } from './boxes';
import { interaction } from './interaction.svelte';
import { cardByCode, knownCard, loadAllCards, type CardInfo } from '../lib/catalog';
import type {
  CardView as TableCard,
  PackFace,
  PileView,
  PresenceState,
  PrivateView,
  View,
} from '../lib/types';

vi.mock('../lib/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/catalog')>()),
  cardByCode: vi.fn(),
  knownCard: vi.fn(),
  loadAllCards: vi.fn(),
}));

// The catalog of the fixture: code -> faces.
const FACES: Record<string, Partial<PackFace>[]> = {
  '01001': [{ name: 'Spider-Man' }],
  '01020': [{ name: 'Web-Shooter' }],
  '01021': [{ name: 'Swinging Web Kick' }],
  '01022': [{ name: 'Backflip' }],
  '01094': [{ name: 'Rhino', stage: 'I', type: 'villain' }],
  '01095': [{ name: 'Rhino', stage: 'II', type: 'villain' }],
  '01097': [
    { name: 'The Break-In!', stage: '1A', type: 'main_scheme', size: 'land' },
    { name: 'The Break-In!', stage: '1B', type: 'main_scheme', size: 'land' },
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
    images: [`${code}.png`],
    ...face,
  }));
  return { card: { code, faces: full, back: 'player', quantity: 1 }, face: 0, pack: 'core' };
}

function card(id: string, extra: Partial<TableCard> = {}): TableCard {
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
  return { id, kind: 'deck', owner: -1, area: 'villain', x: 0, y: 0, count: 30, ...extra };
}

/** Three cards of Alex's deck, top first: Web-Shooter, Swinging Web Kick, Backflip. */
const DECK_TOP = ['c1', 'c2', 'c3'];

function inDeck(id: string, code: string): TableCard {
  return card(id, { code, zone: 'pile', area: undefined });
}

/** Rhino with Alex (p0, the viewer) and Sam (p1). */
function makeView(extra: { private?: PrivateView; cards?: TableCard[] } = {}): View {
  const cards = extra.cards ?? [
    card('mine'),
    card('v', { code: '01094', owner: -1, back: 'villain', area: 'villain', x: 10 }),
    card('v2', { code: '01095', owner: -1, back: 'villain', zone: 'stage', area: undefined }),
    card('s', { code: '01097', owner: -1, back: 'encounter', area: 'villain', x: 130 }),
    inDeck('c1', '01020'),
    inDeck('c2', '01021'),
    inDeck('c3', '01022'),
    card('q1', { code: '01100', owner: -1, back: 'encounter', zone: 'pile', area: undefined }),
  ];
  return {
    id: 'g1',
    phase: 'playing',
    you: { role: 'player', name: 'Alex', color: 0, host: true, area: 'p0' },
    players: [
      { name: 'Alex', color: 0, host: true, area: 'p0', ready: true, handCount: 0 },
      { name: 'Sam', color: 1, host: false, area: 'p1', ready: true, handCount: 0 },
    ],
    spectators: 0,
    config: { scenario: 'rhino', difficulty: 'standard', standard: '', expert: '', modulars: [] },
    table: {
      cards,
      piles: [
        pile('deck:p0', { owner: 0, area: 'p0', x: 600 }),
        pile('enc', { kind: 'encounter', x: 500, count: 20 }),
        pile('vic', { kind: 'victory', x: 700, count: 1, cards: ['q1'] }),
      ],
      hand: [],
      stages: [
        { key: 'villain', label: 'Villain', current: 'v', cards: ['v', 'v2'] },
        { key: 'main', label: 'Main scheme', current: 's', cards: ['s'] },
      ],
      firstPlayer: { area: 'p0', x: 860, y: 40 },
      private: extra.private,
    },
    log: [],
  };
}

function asSpectator(view: View): View {
  return { ...view, you: { role: 'spectator', name: 'Kim', color: -1, host: false } };
}

function fakeSession() {
  return {
    act: vi.fn(() => 1),
    lobby: vi.fn(() => true),
    lastError: null,
    presence: new Map<number, PresenceState>(),
    sendPresence: vi.fn(),
  };
}

async function renderTable(view = makeView()) {
  const session = fakeSession();
  const result = render(Table, { session, view });
  // The catalog loads asynchronously: wait for the faces to show.
  await within(screen.getByRole('region', { name: /^Villain/ })).findByRole('img', {
    name: 'Rhino',
  });
  return {
    session,
    rerender: (next: View) => result.rerender({ session, view: next }),
  };
}

function placed(id: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`.surface [data-id="${id}"]`);
  if (!element) {
    throw new Error(`no ${id} on the table`);
  }
  return element;
}

function box(): HTMLElement {
  return screen.getByRole('dialog');
}

function tile(id: string): HTMLElement {
  const found = box().querySelector<HTMLElement>(`.tile[data-id="${id}"]`);
  if (!found) {
    throw new Error(`no tile ${id}`);
  }
  return found;
}

/** Clicks the face of a stage tile. */
async function pick(key: string) {
  await fireEvent.click(within(tile(key)).getByRole('button'));
}

/** The names of the tiles, in their order. */
function tileNames(): string[] {
  return within(box())
    .queryAllByRole('listitem')
    .map((item) => item.getAttribute('aria-label') ?? '');
}

function tileBar(): HTMLElement | null {
  return screen.queryByRole('toolbar', { name: 'Card actions' });
}

function tableBar(): HTMLElement | null {
  return screen.queryByRole('toolbar', { name: 'Actions' });
}

const SEARCH: PrivateView = { pile: 'deck:p0', mode: 'search', cards: DECK_TOP };
const LOOK: PrivateView = { pile: 'deck:p0', mode: 'top', cards: DECK_TOP };

function domRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

/** Lays the tiles out on one row, 150 apart: the n-th tile of the grid spans 150 n to 150 n + 132. */
function layOutTiles(): void {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const tileOf = this.closest('.tile');
    if (tileOf && this.classList.contains('img')) {
      const index = [...document.querySelectorAll('.mgrid .tile')].indexOf(tileOf);
      return domRect(index * 150, 100, 132, 185);
    }
    return domRect(0, 0, 0, 0);
  });
}

beforeEach(() => {
  vi.mocked(loadAllCards).mockResolvedValue();
  vi.mocked(knownCard).mockImplementation(infoOf);
  vi.mocked(cardByCode).mockImplementation((code) => Promise.resolve(infoOf(code)));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.mocked(loadAllCards).mockReset();
  vi.mocked(knownCard).mockReset();
  vi.mocked(cardByCode).mockReset();
  interaction.reset();
});

describe('CardBox', () => {
  it('search box lists private cards top first with count title', async () => {
    await renderTable(makeView({ private: SEARCH }));

    const dialog = box();
    expect(screen.getByRole('dialog', { name: 'Search Your deck (3 cards)' })).toBe(dialog);
    // The count is dimmed.
    expect(dialog.querySelector('.aside')?.textContent).toBe('(3 cards)');
    expect(tileNames()).toEqual(['Web-Shooter', 'Swinging Web Kick', 'Backflip']);
    expect(tile('c1').textContent).toContain('#1');
    expect(tile('c3').textContent).toContain('#3');

    // The filter goes by name; nothing left shows the message.
    const filter = within(dialog).getByRole('textbox', { name: 'Filter by name' });
    await fireEvent.input(filter, { target: { value: 'web' } });
    expect(tileNames()).toEqual(['Web-Shooter', 'Swinging Web Kick']);
    await fireEvent.input(filter, { target: { value: 'zzz' } });
    expect(tileNames()).toEqual([]);
    expect(within(dialog).getByText('No card matches.')).toBeTruthy();

    expect(within(dialog).getByRole('button', { name: 'Close without shuffling' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Shuffle & close' })).toBeTruthy();
  });

  it('look box titles the top count and closes with Close', async () => {
    const { session } = await renderTable(makeView({ private: LOOK }));

    expect(screen.getByRole('dialog', { name: 'Top 3 of Your deck' })).toBeTruthy();
    await fireEvent.click(within(box()).getByRole('button', { name: 'Close' }));
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'closeView' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('look box reorder sends reorderTop', async () => {
    const { session } = await renderTable(makeView({ private: LOOK }));
    layOutTiles();

    const image = tile('c1').querySelector<HTMLElement>('.img') as HTMLElement;
    await fireEvent.pointerDown(image, { clientX: 60, clientY: 150, button: 0 });
    await fireEvent.pointerMove(window, { clientX: 400, clientY: 150, buttons: 1 });

    // A live preview: the card follows the pointer, its slot already where it would go.
    expect(document.querySelector('.tile-ghost')).not.toBeNull();
    expect(tileNames()).toEqual(['Swinging Web Kick', 'Backflip', 'Web-Shooter']);
    expect(tile('c1').classList.contains('lifting')).toBe(true);

    await fireEvent.pointerUp(window, { clientX: 400, clientY: 150 });
    expect(session.act).toHaveBeenCalledExactlyOnceWith({
      kind: 'reorderTop',
      pile: 'deck:p0',
      cards: ['c2', 'c3', 'c1'],
    });
    expect(document.querySelector('.tile-ghost')).toBeNull();
    // The new order stays while the server answers.
    expect(tileNames()).toEqual(['Swinging Web Kick', 'Backflip', 'Web-Shooter']);
  });

  it('a card that leaves during a reorder is not sent', async () => {
    const { session, rerender } = await renderTable(makeView({ private: LOOK }));
    layOutTiles();

    const image = tile('c1').querySelector<HTMLElement>('.img') as HTMLElement;
    await fireEvent.pointerDown(image, { clientX: 60, clientY: 150, button: 0 });
    await fireEvent.pointerMove(window, { clientX: 400, clientY: 150, buttons: 1 });
    // Another player takes Backflip meanwhile.
    await rerender(makeView({ private: { ...LOOK, cards: ['c1', 'c2'] } }));
    await fireEvent.pointerUp(window, { clientX: 400, clientY: 150 });

    expect(session.act).toHaveBeenCalledExactlyOnceWith({
      kind: 'reorderTop',
      pile: 'deck:p0',
      cards: ['c2', 'c1'],
    });
  });

  it('search tiles cannot be reordered', async () => {
    const { session } = await renderTable(makeView({ private: SEARCH }));
    layOutTiles();

    const image = tile('c1').querySelector<HTMLElement>('.img') as HTMLElement;
    await fireEvent.pointerDown(image, { clientX: 60, clientY: 150, button: 0 });
    await fireEvent.pointerMove(window, { clientX: 400, clientY: 150, buttons: 1 });
    await fireEvent.pointerUp(window, { clientX: 400, clientY: 150 });

    expect(document.querySelector('.tile-ghost')).toBeNull();
    expect(session.act).not.toHaveBeenCalled();
  });

  it('shuffle & close sends closeView shuffle', async () => {
    const { session, rerender } = await renderTable(makeView({ private: SEARCH }));

    await fireEvent.click(within(box()).getByRole('button', { name: 'Shuffle & close' }));
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'closeView', where: 'shuffle' });
    expect(screen.queryByRole('dialog')).toBeNull();

    // The server closes the view; a new search opens a new box.
    await rerender(makeView());
    await rerender(makeView({ private: SEARCH }));
    session.act.mockClear();
    expect(box()).toBeTruthy();
    await fireEvent.click(within(box()).getByRole('button', { name: 'Close without shuffling' }));
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'closeView' });
  });

  it('escape closes a search like Close', async () => {
    const { session } = await renderTable(makeView({ private: SEARCH }));

    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(session.act).toHaveBeenCalledExactlyOnceWith({ kind: 'closeView' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('stage box marks the face on the table and sends chooseStage', async () => {
    const { session } = await renderTable();
    await fireEvent.pointerEnter(placed('v'));
    await fireEvent.click(screen.getByRole('button', { name: 'Choose the villain card to show' }));

    expect(screen.getByRole('dialog', { name: 'Villain — choose the card to show' })).toBeTruthy();
    // Opening a box lets go of the table: its bar goes.
    expect(tableBar()).toBeNull();
    expect(interaction.hovered).toBeNull();
    expect(tileNames()).toEqual(['Rhino (stage I)', 'Rhino (stage II)']);
    const shown = tile('v:0');
    expect(shown.classList.contains('shown')).toBe(true);
    expect(shown.textContent).toContain('On the table');
    expect(tile('v2:0').textContent).not.toContain('On the table');

    // The face on the table is not a choice.
    await pick('v:0');
    expect(session.act).not.toHaveBeenCalled();

    await pick('v2:0');
    expect(session.act).toHaveBeenCalledExactlyOnceWith({
      kind: 'chooseStage',
      stage: 'villain',
      card: 'v2',
      face: 0,
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('stage box lists every face of the main scheme', async () => {
    const { session } = await renderTable();
    await fireEvent.pointerEnter(placed('s'));
    await fireEvent.click(
      screen.getByRole('button', { name: 'Choose the main scheme card to show' }),
    );

    expect(tileNames()).toEqual(['The Break-In! (1A)', 'The Break-In! (1B)']);
    await pick('s:1');
    expect(session.act).toHaveBeenCalledExactlyOnceWith({
      kind: 'chooseStage',
      stage: 'main',
      card: 's',
      face: 1,
    });
  });

  it('box updates when a card leaves', async () => {
    const { rerender } = await renderTable(makeView({ private: SEARCH }));
    await fireEvent.pointerEnter(tile('c2'));
    expect(tileBar()).not.toBeNull();

    // Another action takes the hovered card away: its tile and its bar go.
    const cards = makeView().table?.cards ?? [];
    const drawn = cards.map((c) => (c.id === 'c2' ? { ...c, zone: 'hand' as const } : c));
    await rerender(makeView({ cards: drawn, private: { ...SEARCH, cards: ['c1', 'c3'] } }));
    expect(tileNames()).toEqual(['Web-Shooter', 'Backflip']);
    expect(screen.getByRole('dialog', { name: 'Search Your deck (2 cards)' })).toBeTruthy();
    expect(tileBar()).toBeNull();

    await rerender(makeView({ private: { ...SEARCH, cards: [] } }));
    expect(within(box()).getByText('Nothing left here.')).toBeTruthy();
  });

  it('a tile sliding under a resting pointer gets no bar', async () => {
    const { rerender } = await renderTable(makeView({ private: SEARCH }));
    await fireEvent.pointerMove(window, { clientX: 100, clientY: 100 });
    await fireEvent.pointerEnter(tile('c2'), { clientX: 100, clientY: 100 });
    expect(tileBar()).not.toBeNull();

    // Another player draws it: the next card takes its place under the pointer.
    await rerender(makeView({ private: { ...SEARCH, cards: ['c1', 'c3'] } }));
    await fireEvent.pointerEnter(tile('c3'), { clientX: 100, clientY: 100 });
    expect(tileBar()).toBeNull();

    // A real move hovers it.
    await fireEvent.pointerMove(window, { clientX: 101, clientY: 100 });
    await fireEvent.pointerEnter(tile('c3'), { clientX: 101, clientY: 100 });
    expect(tileBar()).not.toBeNull();
  });

  it('tile bar plays a card to the first free slot', async () => {
    const { session } = await renderTable(makeView({ private: SEARCH }));
    await fireEvent.pointerEnter(tile('c1'));

    const bar = tileBar() as HTMLElement;
    const names = within(bar)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') ?? button.textContent);
    expect(names).toEqual(['Draw', 'Play', 'Discard', 'Put at the bottom of the deck']);

    await fireEvent.click(within(bar).getByRole('button', { name: 'Play' }));
    expect(session.act).toHaveBeenCalledExactlyOnceWith({
      kind: 'play',
      card: 'c1',
      area: 'p0',
      x: 280,
      y: 0,
    });
    expect(tileBar()).toBeNull();
  });

  it('browse lists a public pile without the server', async () => {
    const { session } = await renderTable();
    await fireEvent.pointerEnter(placed('vic'));
    await fireEvent.click(screen.getByRole('button', { name: 'Browse…' }));

    expect(screen.getByRole('dialog', { name: 'Victory display' })).toBeTruthy();
    expect(tileNames()).toEqual(['Hard to Keep Down']);
    await fireEvent.click(within(box()).getByRole('button', { name: 'Close' }));
    expect(session.act).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('spectator cannot open look', async () => {
    const { session } = await renderTable(asSpectator(makeView()));

    await fireEvent.pointerEnter(placed('deck:p0'));
    expect(tableBar()).toBeNull();
    await fireEvent.keyDown(window, { key: 'l' });
    await fireEvent.keyDown(window, { key: 'k' });
    expect(screen.queryByRole('dialog')).toBeNull();

    // Browse… only, read-only: no tile actions.
    await fireEvent.pointerEnter(placed('vic'));
    const bar = tableBar() as HTMLElement;
    expect(
      within(bar)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Browse…']);
    await fireEvent.click(within(bar).getByRole('button', { name: 'Browse…' }));
    await fireEvent.pointerEnter(tile('q1'));
    expect(tileBar()).toBeNull();
    await fireEvent.click(within(box()).getByRole('button', { name: 'Close' }));

    // The stage choice is shown, but choosing does nothing.
    await fireEvent.pointerEnter(placed('v'));
    await fireEvent.click(screen.getByRole('button', { name: 'Choose the villain card to show' }));
    await pick('v2:0');
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(session.act).not.toHaveBeenCalled();
  });
});

describe('tileActions', () => {
  function actionsOf(id: string, pileId: string, view = makeView()): TileAction[] {
    const table = view.table;
    const found = table?.cards.find((c) => c.id === id);
    const from = table?.piles.find((p) => p.id === pileId);
    if (!found || !from) {
      throw new Error(`no ${id} in ${pileId}`);
    }
    return tileActions(found, from, { view, seat: 0, sizeOf: () => 'std' });
  }

  it('an out-of-play encounter card goes back to the encounter deck', () => {
    const actions = actionsOf('q1', 'vic');
    expect(actions.map((a) => a.id)).toEqual(['play', 'discard', 'bottom', 'shuffle']);
    expect(actions.find((a) => a.id === 'bottom')?.run()).toEqual({
      kind: 'toDeck',
      card: 'q1',
      where: 'bottom',
    });
    expect(actions.find((a) => a.id === 'shuffle')?.run()).toEqual({
      kind: 'toDeck',
      card: 'q1',
      where: 'shuffle',
    });
  });

  it('a card of the own deck can be drawn', () => {
    const actions = actionsOf('c1', 'deck:p0');
    expect(actions.map((a) => a.id)).toEqual(['draw', 'play', 'discard', 'bottom']);
    expect(actions[0]?.run()).toEqual({ kind: 'toHand', card: 'c1' });
    expect(actions.find((a) => a.id === 'discard')?.run()).toEqual({ kind: 'discard', card: 'c1' });
  });

  it('a discard pile offers Draw to its owner only', () => {
    const view = makeView();
    view.table?.piles.push(
      pile('disc:p0', { kind: 'discard', owner: 0, area: 'p0', count: 1, cards: ['c1'] }),
      pile('disc:p1', { kind: 'discard', owner: 1, area: 'p1', count: 1, cards: ['c1'] }),
    );
    expect(actionsOf('c1', 'disc:p0', view).map((a) => a.id)).toEqual(['draw', 'play']);
    expect(actionsOf('c1', 'disc:p1', view).map((a) => a.id)).toEqual(['play']);
  });

  it("another player's set-aside cards cannot be touched", () => {
    const view = makeView();
    view.table?.piles.push(
      pile('aside:p1', { kind: 'aside', owner: 1, area: 'p1', count: 1, cards: ['c1'] }),
    );
    expect(actionsOf('c1', 'aside:p1', view)).toEqual([]);
  });
});

describe('pileLabel', () => {
  it('names piles from the viewer side', () => {
    const view = makeView();
    const label = (p: PileView) => pileLabel(p, view);
    expect(label(pile('deck:p0', { owner: 0 }))).toBe('Your deck');
    expect(label(pile('disc:p1', { kind: 'discard', owner: 1 }))).toBe("Sam's discard");
    expect(label(pile('aside:p0', { kind: 'aside', owner: 0 }))).toBe('Your set-aside cards');
    expect(label(pile('saside', { kind: 'aside' }))).toBe('Set-aside cards');
    expect(label(pile('enc', { kind: 'encounter' }))).toBe('Encounter deck');
    expect(label(pile('encd', { kind: 'encounterDiscard' }))).toBe('Encounter discard');
    expect(label(pile('vic', { kind: 'victory' }))).toBe('Victory display');
  });
});
