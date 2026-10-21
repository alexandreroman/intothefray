// Every dialog over the table (Dialog.svelte) freezes it the same way: no
// hover, no press, no context menu and no table key while it is open; a click
// on its backdrop closes it and does nothing else; the table works again once
// it is closed.

import { fireEvent, render, screen, within } from '@testing-library/svelte';
import Table from './Table.svelte';
import { interaction } from './interaction.svelte';
import { knownCard, loadGameCards, type CardInfo } from '../lib/catalog';
import type {
  Action,
  CardView as TableCard,
  PackFace,
  PileView,
  PresenceState,
  View,
} from '../lib/types';

vi.mock('../lib/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/catalog')>()),
  knownCard: vi.fn(),
  loadGameCards: vi.fn(),
}));

const NAMES: Record<string, string> = { '01001': 'Spider-Man', '01094': 'Rhino' };

function infoOf(code: string): CardInfo | null {
  const name = NAMES[code];
  if (!name) {
    return null;
  }
  const face: PackFace = { name, type: '', size: 'std', images: [`${code}.png`] };
  return { card: { code, faces: [face], back: 'player', quantity: 1 }, face: 0 };
}

function card(id: string, extra: Partial<TableCard> = {}): TableCard {
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
  return { id, kind: 'deck', owner: -1, x: 0, y: 0, count: 30, ...extra };
}

/** Rhino with Alex (p0, the viewer and host) alone: a card, the villain, a deck and a discard pile. */
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
    ],
    spectators: 0,
    config: { scenario: 'rhino', difficulty: 'standard', standard: '', expert: '', modulars: [] },
    table: {
      cards: [
        card('mine', { x: 0 }),
        card('v', { code: '01094', owner: -1, back: 'villain', x: 300 }),
        card('gone', { zone: 'pile' }),
      ],
      piles: [
        pile('deck:p0', { owner: 0, x: 600 }),
        pile('disc:p0', { kind: 'discard', owner: 0, x: 720, count: 1, cards: ['gone'] }),
      ],
      stages: [{ key: 'villain', label: 'Villain', current: 'v', cards: ['v'] }],
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

function placed(id: string): HTMLElement {
  return document.querySelector<HTMLElement>(`.surface [data-id="${id}"]`)!;
}

function contextMenu(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.table-menu.context');
}

function press(key: string) {
  return fireEvent.keyDown(window, { key });
}

/** The open dialog, whatever its kind. */
function dialog(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[aria-modal="true"]');
}

// A new spot for each pointer event: the table ignores an event at the spot it was redrawn under.
let spot = 10;
function hover(element: HTMLElement) {
  spot += 1;
  return fireEvent.pointerEnter(element, { clientX: spot, clientY: spot });
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(loadGameCards).mockResolvedValue();
  vi.mocked(knownCard).mockImplementation(infoOf);
});

afterEach(() => {
  vi.restoreAllMocks();
  interaction.reset();
  document.body.replaceChildren();
});

type Rerender = (props: { view: View }) => Promise<void>;

/** A kind of dialog: how it opens, and what its closing sends, if anything. */
interface Kind {
  name: string;
  open: (rerender: Rerender) => Promise<unknown>;
  /** The name of its button that closes it without doing anything. */
  close: string;
  closing?: Action;
}

const KINDS: Kind[] = [
  { name: 'the keyboard shortcuts sheet', open: () => press('?'), close: 'Close' },
  {
    name: 'a card box (Search)',
    open: async (rerender) => {
      // The server's private view of the discard pile opens its box.
      const view = makeView();
      view.table = {
        ...view.table!,
        private: { pile: 'disc:p0', mode: 'search', cards: ['gone'] },
      };
      await rerender({ view });
    },
    close: 'Close',
    // Closing the server's view is the box's own way to close.
    closing: { kind: 'closeView' },
  },
  {
    name: 'the stage choice box',
    open: async () => {
      await hover(placed('v'));
      await fireEvent.click(placed('v'));
      // The item's name ends with its key, V.
      await fireEvent.click(
        within(contextMenu()!).getByRole('menuitem', { name: /^Change card…/ }),
      );
    },
    close: 'Close',
  },
  {
    name: 'the count question',
    open: async () => {
      await hover(placed('deck:p0'));
      await press('l');
    },
    close: 'Cancel',
  },
  {
    name: 'a confirmation',
    open: () => fireEvent.click(screen.getByRole('button', { name: 'End game' })),
    close: 'Cancel',
  },
];

describe.each(KINDS)('while $name is open', ({ open, close, closing }) => {
  async function openOverTable() {
    const session = fakeSession();
    const { rerender } = render(Table, { session, view: makeView() });
    await screen.findByRole('img', { name: 'Rhino' });
    await open(rerender);
    expect(dialog()).not.toBeNull();
    return session;
  }

  /** What the session was sent: only what closing the dialog sends, if anything. */
  function sentOnClose(session: ReturnType<typeof fakeSession>): void {
    if (closing) {
      expect(session.act).toHaveBeenCalledExactlyOnceWith(closing, 0);
    } else {
      expect(session.act).not.toHaveBeenCalled();
    }
  }

  it('the table is frozen, and the focus is in the dialog', async () => {
    const session = await openOverTable();
    expect(dialog()!.contains(document.activeElement)).toBe(true);
    // What was hovered to open it is let go: no menu, no preview.
    expect(interaction.hovered).toBeNull();
    expect(contextMenu()).toBeNull();

    await hover(placed('mine'));
    await fireEvent.pointerDown(placed('mine'), { button: 0 });
    await fireEvent.click(placed('mine'));
    await press('e');
    await press('+');
    expect(interaction.hovered).toBeNull();
    expect(interaction.held).toBeNull();
    expect(contextMenu()).toBeNull();
    expect(session.act).not.toHaveBeenCalled();
  });

  it("the viewer's cursor is hidden from the others", async () => {
    const session = await openOverTable();
    expect(session.sendPresence).toHaveBeenCalledWith({ cursor: null });
  });

  it('a click on the backdrop closes it, and does nothing else', async () => {
    const session = await openOverTable();
    const backdrop = dialog()!.parentElement!;

    await fireEvent.pointerDown(backdrop, { button: 0 });
    await fireEvent.click(backdrop);
    expect(dialog()).toBeNull();
    sentOnClose(session);
    expect(session.lobby).not.toHaveBeenCalled();
  });

  it('its close button closes it', async () => {
    const session = await openOverTable();

    await fireEvent.click(within(dialog()!).getByRole('button', { name: close }));
    expect(dialog()).toBeNull();
    sentOnClose(session);
  });

  it('Escape closes it; the table works again', async () => {
    const session = await openOverTable();

    await press('Escape');
    expect(dialog()).toBeNull();
    sentOnClose(session);
    await hover(placed('mine'));
    expect(interaction.hovered).toEqual({ kind: 'card', id: 'mine' });
    await press('e');
    expect(session.act).toHaveBeenLastCalledWith({ kind: 'exhaust', card: 'mine' }, 0);
  });
});
