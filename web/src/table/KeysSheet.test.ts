import { fireEvent, render, screen, within } from '@testing-library/svelte';
import KeysSheet from './KeysSheet.svelte';
import Table from './Table.svelte';
import { interaction } from './interaction.svelte';
import { knownCard, loadGameCards, type CardInfo } from '../lib/catalog';
import type { CardView as TableCard, PresenceState, View } from '../lib/types';

vi.mock('../lib/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/catalog')>()),
  knownCard: vi.fn(),
  loadGameCards: vi.fn(),
}));

function infoOf(code: string): CardInfo {
  const face = { name: 'Spider-Man', type: 'hero', size: 'std' as const, images: [`${code}.png`] };
  return { card: { code, faces: [face], back: 'player', quantity: 1 }, face: 0 };
}

const MINE: TableCard = {
  id: 'mine',
  code: '01001',
  face: 0,
  back: 'player',
  owner: 0,
  zone: 'table',
  x: 280,
  y: 0,
  z: 1,
};

/** Alex (p0, the viewer) alone, with one card on the table. */
function makeView(): View {
  return {
    id: 'g1',
    phase: 'playing',
    you: { role: 'player', name: 'Alex', color: 0, host: true, area: 'p0' },
    players: [{ name: 'Alex', color: 0, host: true, area: 'p0', ready: true, handCount: 0 }],
    spectators: 0,
    config: { scenario: 'rhino', difficulty: 'standard', standard: '', expert: '', modulars: [] },
    table: {
      cards: [MINE],
      piles: [],
      stages: [],
      firstPlayer: { x: 860, y: 40 },
    },
    log: [],
  };
}

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

function sheet(): HTMLElement | null {
  return screen.queryByRole('dialog', { name: 'Keyboard shortcuts' });
}

function press(key: string) {
  return fireEvent.keyDown(window, { key });
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(loadGameCards).mockResolvedValue();
  vi.mocked(knownCard).mockImplementation(infoOf);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  interaction.reset();
  document.body.replaceChildren();
});

/** The sheet's rows, group by group: the group title, then "what: keys" for each row. */
function groupsOf(element: HTMLElement): [string, string[]][] {
  return [...element.querySelectorAll('section')].map((section) => [
    section.querySelector('h4')?.textContent?.trim() ?? '',
    [...section.querySelectorAll('.row')].map((row) => {
      const [what, keys] = [...row.children].map((cell) => cell.textContent?.trim() ?? '');
      return `${what ?? ''}: ${(keys ?? '').replace(/\s+/g, ' ')}`;
    }),
  ]);
}

describe('KeysSheet', () => {
  it('sheet lists the groups of spec 5.10', () => {
    vi.stubGlobal('navigator', { ...navigator, userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' });
    const anchor = document.body.appendChild(document.createElement('button'));
    render(KeysSheet, { props: { anchor, onclose: vi.fn() } });

    expect(groupsOf(sheet()!)).toEqual([
      [
        'Card under the mouse',
        [
          'Exhaust / ready: E',
          'Flip: F',
          'Draw an arrow to another card: A',
          'Discard: ⌫',
          'Back to hand: H',
        ],
      ],
      [
        'Tokens (Shift removes)',
        ['Damage: D', 'Threat: T', 'Counter: N', 'Stunned: S', 'Confused: C', 'Tough: G'],
      ],
      ['Card in your hand', ['Play: P', 'Discard: ⌫']],
      [
        'Deck under the mouse',
        [
          'Draw 1: W',
          'Reveal (encounter deck): R',
          'Look at the top cards: L',
          'Search: K',
          'Shuffle: U',
        ],
      ],
      [
        'Table',
        [
          'Undo your last action: Z',
          'Zoom in / out: +−',
          'Zoom back to 100%: 0',
          'Zoom around the mouse: Ctrl + wheel',
          'Let go of the selection: Esc',
          'This sheet: ?',
        ],
      ],
      ['Mouse', ['Ping a spot: Alt + click', 'Arrow from a card to another: Shift + drag']],
    ]);
    // Each key is a kbd.
    expect(within(sheet()!).getAllByText('E')[0]?.tagName).toBe('KBD');
  });

  it('shows ⌘ for the modifier on macOS', () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    });
    const anchor = document.body.appendChild(document.createElement('button'));
    render(KeysSheet, { props: { anchor, onclose: vi.fn() } });

    const table = groupsOf(sheet()!).find(([title]) => title === 'Table');
    expect(table?.[1]).toContain('Zoom around the mouse: ⌘ + wheel');
  });

  it('opens upward from its button, its right edge on the button', () => {
    const anchor = document.body.appendChild(document.createElement('button'));
    vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(900, 700, 30, 26), // left 900, top 700, right 930
    );
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(640);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(400);
    render(KeysSheet, { props: { anchor, onclose: vi.fn() } });

    // 14 px above the button, as in the prototype.
    expect(sheet()!.style.top).toBe('286px');
    expect(sheet()!.style.left).toBe('290px');
  });

  it("lines its right edge up on the controls' around its button", () => {
    const anchor = document.body.appendChild(document.createElement('button'));
    const controls = document.body.appendChild(document.createElement('div'));
    vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue(new DOMRect(900, 700, 30, 26));
    // The zoom control around the button: 5 px of padding and border on its right.
    vi.spyOn(controls, 'getBoundingClientRect').mockReturnValue(new DOMRect(700, 695, 235, 36));
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(640);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(400);
    render(KeysSheet, { props: { anchor, alignTo: controls, onclose: vi.fn() } });

    expect(sheet()!.style.top).toBe('286px');
    expect(sheet()!.style.left).toBe(`${935 - 640}px`);
  });

  it('the × button, ?, Escape and a click on the backdrop close it; a click inside does not', async () => {
    const anchor = document.body.appendChild(document.createElement('button'));
    const onclose = vi.fn();
    render(KeysSheet, { props: { anchor, onclose } });
    // A dialog like the others: modal, the focus moved into it.
    expect(sheet()!.getAttribute('aria-modal')).toBe('true');
    const close = screen.getByRole('button', { name: 'Close' });
    expect(document.activeElement).toBe(close);

    const inside = sheet()!.querySelector('h4')!;
    await fireEvent.pointerDown(inside);
    await fireEvent.click(inside);
    expect(onclose).not.toHaveBeenCalled();

    await fireEvent.click(close);
    await fireEvent.keyDown(close, { key: '?' });
    await fireEvent.keyDown(window, { key: 'Escape' });
    const backdrop = screen.getByRole('presentation');
    await fireEvent.pointerDown(backdrop);
    await fireEvent.click(backdrop);
    expect(onclose).toHaveBeenCalledTimes(4);
  });
});

describe('the sheet on the table', () => {
  async function renderTable() {
    const session = fakeSession();
    render(Table, { session, view: makeView() });
    await screen.findByRole('img', { name: 'Spider-Man' });
    return session;
  }

  function mine(): HTMLElement {
    return document.querySelector<HTMLElement>('.surface [data-id="mine"]')!;
  }

  it('? or the keyboard button opens it; ? closes it again', async () => {
    await renderTable();
    expect(sheet()).toBeNull();

    await press('?');
    expect(sheet()).not.toBeNull();
    await fireEvent.keyDown(document.activeElement!, { key: '?' });
    expect(sheet()).toBeNull();

    const button = screen.getByRole('button', { name: 'Keyboard shortcuts' });
    // Its tooltip names its key, as the prototype's does.
    expect(button.dataset).toMatchObject({ tip: 'Keyboard shortcuts', kbd: '?' });
    await fireEvent.click(button);
    expect(sheet()).not.toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('true');
  });

  it('freezes the table while it is open; Escape gives it back', async () => {
    const session = await renderTable();
    await fireEvent.pointerEnter(mine());
    await press('?');
    // Opening it lets go of the hovered card.
    expect(interaction.hovered).toBeNull();

    await fireEvent.pointerEnter(mine());
    await press('e');
    expect(interaction.hovered).toBeNull();
    expect(session.act).not.toHaveBeenCalled();

    await press('Escape');
    expect(sheet()).toBeNull();
    await fireEvent.pointerEnter(mine(), { clientX: 1 });
    await press('e');
    expect(session.act).toHaveBeenCalledWith({ kind: 'exhaust', card: 'mine' });
  });
});
