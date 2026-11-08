import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import Seats from './Seats.svelte';
import { cutShort } from '../../lib/overflowTip.testing';
import { mockScreen, type TestScreen } from '../../lib/screen.testing';
import type { DeckView, PlayerView, View, YouView } from '../../lib/types';

// Whether the viewer prefers reduced motion, as each test chooses.
const motion = vi.hoisted(() => ({ reduced: false }));

vi.mock('svelte/motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('svelte/motion')>()),
  prefersReducedMotion: {
    get current() {
      return motion.reduced;
    },
  },
}));

const noDeck: DeckView = { ready: false, handCount: 0 };
const spiderMan: DeckView = {
  ready: true,
  hero: '01001a',
  heroName: 'Spider-Man',
  deckName: 'Friendly neighbourhood',
  handCount: 0,
};
const captainMarvel: DeckView = {
  ready: true,
  hero: '01010a',
  heroName: 'Captain Marvel',
  deckName: 'Higher, further, faster',
  handCount: 0,
};

const alex: PlayerView = {
  name: 'Alex',
  color: 0,
  host: true,
  ready: false,
  online: true,
  decks: [noDeck],
};
const sam: PlayerView = {
  name: 'Sam',
  color: 1,
  host: false,
  ready: true,
  online: true,
  decks: [spiderMan],
};
const jo: PlayerView = {
  name: 'Jo',
  color: 2,
  host: false,
  ready: false,
  online: false,
  decks: [noDeck],
};

const asAlex: YouView = { role: 'player', name: 'Alex', color: 0, host: true };
const asSam: YouView = { role: 'player', name: 'Sam', color: 1, host: false };
const asSpectator: YouView = { role: 'spectator', name: 'Max', color: 0, host: false };

// The lobby renders the viewer's deck slots; here each one only tells its slot.
const ownSlot = createRawSnippet((_deck: () => DeckView, slot: () => number) => ({
  render: () => `<p class="own-slot">Own slot ${slot() + 1}</p>`,
}));

function renderSeats(fields: { you?: YouView; players?: PlayerView[]; addLocked?: boolean } = {}) {
  const view: View = {
    id: 'g1',
    phase: 'lobby',
    you: fields.you ?? asAlex,
    players: fields.players ?? [alex, sam],
    spectators: 0,
    config: { scenario: '', difficulty: 'standard', standard: '', expert: '', modulars: [] },
    log: [],
  };
  const handlers = {
    onremove: vi.fn(),
    onleave: vi.fn(),
    ontakeseat: vi.fn(),
    onadddeck: vi.fn(),
  };
  render(Seats, { view, ...handlers, addLocked: fields.addLocked ?? false, ownSlot });
  return handlers;
}

/** The card of a player in the seats grid. */
function card(playerName: string): HTMLElement {
  const seat = screen.getByText(playerName, { selector: 'b' }).closest<HTMLElement>('.seat');
  if (!seat) throw new Error(`no card for ${playerName}`);
  return seat;
}

/** The grid cell of a player's card, which spans their seats. */
function cell(playerName: string): HTMLElement {
  const gridCell = card(playerName).parentElement;
  if (!gridCell) throw new Error(`no cell for ${playerName}`);
  return gridCell;
}

function freeSeats(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.free')];
}

/** The grid's items in order: a player's name, or "free" for a free seat. */
function gridOrder(): string[] {
  return [...document.querySelectorAll('.seats > .cell')].map(
    (gridCell) => gridCell.querySelector('.seat .nm b')?.textContent ?? 'free',
  );
}

// Two seats to a row, from 600px wide.
const TABLET: TestScreen = { width: 800, height: 1000 };

describe('Seats', () => {
  describe('the seat grid', () => {
    it('always shows four seats: one card per player, then free seats', () => {
      renderSeats();

      expect(document.querySelectorAll('.seat')).toHaveLength(2);
      expect(freeSeats()).toHaveLength(2);
      expect(screen.getByText('2 of 4 seats')).toBeTruthy();
    });

    it("spans a player's card over their decks, and leaves as many fewer free seats", () => {
      renderSeats({ players: [alex, { ...sam, decks: [spiderMan, captainMarvel] }] });

      expect(cell('Sam').classList.contains('wide')).toBe(true);
      expect(cell('Alex').classList.contains('wide')).toBe(false);
      expect(freeSeats()).toHaveLength(1);
      expect(screen.getByText('3 of 4 seats')).toBeTruthy();
    });

    it('spans a whole row for a player with four decks, and leaves no free seat', () => {
      renderSeats({ players: [{ ...alex, decks: [noDeck, noDeck, noDeck, noDeck] }] });

      expect(cell('Alex').classList.contains('wide')).toBe(true);
      expect(freeSeats()).toHaveLength(0);
    });

    it('gives each free seat the colour of a newcomer: the lowest one no player uses', () => {
      renderSeats({ players: [alex, jo] });

      expect(freeSeats().map((seat) => seat.style.getPropertyValue('--pc'))).toEqual([
        'var(--p2)',
        'var(--p4)',
      ]);
      expect(freeSeats()[0]?.textContent).toContain('Free seat');
      expect(freeSeats()[0]?.textContent).toContain('share the invite link');
    });

    it("lays out the viewer's card first, then the other players in seat order", () => {
      renderSeats({ you: asSam, players: [alex, sam, jo] });

      expect(gridOrder()).toEqual(['Sam', 'Alex', 'Jo', 'free']);
    });

    it('lays out the players in seat order for a spectator', () => {
      renderSeats({ you: asSpectator, players: [alex, sam, jo] });

      expect(gridOrder()).toEqual(['Alex', 'Sam', 'Jo', 'free']);
    });

    describe('two to a row', () => {
      afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
      });

      it('fills the hole before a card over two seats with a free seat', () => {
        mockScreen(TABLET);
        renderSeats({ players: [alex, { ...sam, decks: [spiderMan, captainMarvel] }] });

        expect(gridOrder()).toEqual(['Alex', 'free', 'Sam']);
      });

      it('fills the hole with a later one-deck player when no free seat is left', () => {
        mockScreen(TABLET);
        renderSeats({ players: [alex, { ...sam, decks: [spiderMan, captainMarvel] }, jo] });

        expect(gridOrder()).toEqual(['Alex', 'Jo', 'Sam']);
      });

      it("keeps the viewer's card first when another player adds a deck", async () => {
        mockScreen(TABLET);
        const view: View = {
          id: 'g1',
          phase: 'lobby',
          you: asSam,
          players: [alex, sam],
          spectators: 0,
          config: { scenario: '', difficulty: 'standard', standard: '', expert: '', modulars: [] },
          log: [],
        };
        const handlers = {
          onremove: vi.fn(),
          onleave: vi.fn(),
          ontakeseat: vi.fn(),
          onadddeck: vi.fn(),
        };
        const { rerender } = render(Seats, { view, ...handlers, ownSlot });
        expect(gridOrder()).toEqual(['Sam', 'Alex', 'free', 'free']);

        await rerender({ view: { ...view, players: [{ ...alex, decks: [noDeck, noDeck] }, sam] } });

        expect(gridOrder()).toEqual(['Sam', 'free', 'Alex']);
      });
    });

    it("tints the viewer's own card", () => {
      renderSeats();

      expect(card('Alex').classList.contains('me')).toBe(true);
      expect(card('Sam').classList.contains('me')).toBe(false);
    });
  });

  describe('a player card', () => {
    it('tells whether the player is online in a capsule, with a tooltip', () => {
      renderSeats({ players: [alex, jo] });

      const online = card('Alex').querySelector<HTMLElement>('.status')!;
      expect(online.classList.contains('off')).toBe(false);
      expect(online.textContent?.trim()).toBe('online');
      expect(online.dataset.tip).toBe('online');
      const offline = card('Jo').querySelector<HTMLElement>('.status')!;
      expect(offline.classList.contains('off')).toBe(true);
      expect(offline.textContent?.trim()).toBe('offline');
      expect(offline.dataset.tip).toBe('offline');
    });

    it('follows the name with the viewer, host and online capsules, each said once', () => {
      renderSeats({ players: [alex, sam] });

      const capsules = (name: string) =>
        [...card(name).querySelectorAll('.nm .tag')].map((tag) => tag.textContent?.trim());
      expect(capsules('Alex')).toEqual(['you', 'host', 'online']);
      expect(capsules('Sam')).toEqual(['online']);
      expect(within(card('Alex')).getAllByText('you')).toHaveLength(1);
      expect(within(card('Alex')).getAllByText('host')).toHaveLength(1);
      expect(within(card('Alex')).getAllByText('online')).toHaveLength(1);
    });

    it('shows the full name in a tooltip when it is cut short', async () => {
      renderSeats();

      const name = screen.getByText('Alex', { selector: 'b' });
      cutShort(name);
      await fireEvent.pointerOver(name);
      expect(name.dataset.tip).toBe('Alex');
    });

    it("shows another player's deck by its hero, and a missing one as awaited", () => {
      renderSeats({ players: [alex, sam, jo] });

      expect(within(card('Sam')).getByText('Spider-Man')).toBeTruthy();
      expect(within(card('Sam')).getByText('Friendly neighbourhood')).toBeTruthy();
      expect(within(card('Jo')).getByText('Waiting for a deck')).toBeTruthy();
      expect(within(card('Jo')).getByText('?')).toBeTruthy();
      expect(screen.queryByText(/^(Ready|Waiting)$/)).toBeNull();
    });

    it("renders the viewer's own decks through the lobby's slots, one per deck", () => {
      renderSeats({ players: [{ ...alex, decks: [spiderMan, noDeck] }, sam] });

      const slots = within(card('Alex')).getAllByText(/^Own slot/);
      expect(slots.map((slot) => slot.textContent)).toEqual(['Own slot 1', 'Own slot 2']);
      expect(within(card('Sam')).queryByText(/^Own slot/)).toBeNull();
    });
  });

  describe('the icon buttons', () => {
    it('let the host take another player off their seat, not themselves', async () => {
      const { onremove } = renderSeats();

      expect(within(card('Alex')).queryByRole('button', { name: /off this seat/ })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Leave your seat' })).toBeNull();
      const kick = within(card('Sam')).getByRole('button', { name: 'Take Sam off this seat' });
      expect(kick.dataset.tip).toBe('Take Sam off this seat');
      await fireEvent.click(kick);
      expect(onremove).toHaveBeenCalledExactlyOnceWith(1);
    });

    it('let a guest leave their own seat, and take no one off', async () => {
      const { onleave } = renderSeats({ you: asSam });

      expect(screen.queryAllByRole('button', { name: /off this seat/ })).toHaveLength(0);
      const leave = within(card('Sam')).getByRole('button', { name: 'Leave your seat' });
      expect(leave.dataset.tip).toBe('Leave your seat');
      await fireEvent.click(leave);
      expect(onleave).toHaveBeenCalledOnce();
    });

    it("offer Add a deck on the viewer's own card only", async () => {
      const { onadddeck } = renderSeats();

      const add = within(card('Alex')).getByRole('button', { name: 'Add a deck' });
      expect(add.dataset.tip).toBe('Add a deck');
      expect(screen.getAllByRole('button', { name: 'Add a deck' })).toHaveLength(1);
      await fireEvent.click(add);
      expect(onadddeck).toHaveBeenCalledOnce();
    });

    it('offer no Add a deck once the four seats are taken', () => {
      renderSeats({ players: [{ ...alex, decks: [noDeck, noDeck] }, sam, jo] });

      expect(screen.queryByRole('button', { name: 'Add a deck' })).toBeNull();
    });

    it('mark Add a deck disabled while it is locked', () => {
      renderSeats({ addLocked: true });

      expect(screen.getByRole('button', { name: 'Add a deck' }).getAttribute('aria-disabled')).toBe(
        'true',
      );
    });

    it('offer a spectator none of them', () => {
      renderSeats({ you: asSpectator });

      expect(document.querySelector('.tools')).toBeNull();
    });

    it('never use the cross, which closes things only', () => {
      renderSeats({ players: [{ ...alex, decks: [spiderMan, noDeck] }, sam, jo] });
      const icons = (seat: HTMLElement) =>
        [...seat.querySelectorAll('button svg')].map((svg) => svg.getAttribute('data-icon'));

      expect(icons(card('Alex'))).toEqual([]);
      expect(icons(card('Sam'))).toEqual(['user-minus']);
      expect(document.querySelectorAll('[data-icon="cross"]')).toHaveLength(0);
    });

    it('use the plus and the leave icons', () => {
      renderSeats({ you: asSam });

      const icon = (name: string) =>
        screen.getByRole('button', { name }).querySelector('svg')?.dataset.icon;
      expect(icon('Add a deck')).toBe('plus');
      expect(icon('Leave your seat')).toBe('leave');
    });
  });

  describe('a free seat', () => {
    it('is a button that takes the seat for a spectator', async () => {
      const { ontakeseat } = renderSeats({ you: asSpectator });

      const seats = screen.getAllByRole('button', { name: 'Take this seat' });
      expect(seats).toHaveLength(2);
      await fireEvent.click(seats[0]!);
      expect(ontakeseat).toHaveBeenCalledOnce();
    });

    it('is no button for a player', () => {
      renderSeats();

      expect(screen.queryByRole('button', { name: 'Take this seat' })).toBeNull();
    });
  });

  describe('the invite link', () => {
    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it('copies the link and says so for a moment', async () => {
      vi.useFakeTimers();
      const writeText = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
      renderSeats();

      await fireEvent.click(screen.getByRole('button', { name: 'Copy invite link' }));
      await vi.waitFor(() => screen.getByRole('button', { name: 'Copied' }));
      expect(writeText).toHaveBeenCalledExactlyOnceWith(`${location.origin}/g/?id=g1`);
      expect(screen.queryByRole('textbox', { name: 'Invite link' })).toBeNull();

      await vi.advanceTimersByTimeAsync(1500);
      expect(screen.getByRole('button', { name: 'Copy invite link' })).toBeTruthy();
    });

    it('shows the link selected when the clipboard is refused', async () => {
      const writeText = vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
      vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
      renderSeats();
      expect(screen.queryByRole('textbox', { name: 'Invite link' })).toBeNull();

      await fireEvent.click(screen.getByRole('button', { name: 'Copy invite link' }));
      const field = await screen.findByRole<HTMLInputElement>('textbox', { name: 'Invite link' });

      expect(field.value).toBe(`${location.origin}/g/?id=g1`);
      expect(field.readOnly).toBe(true);
      expect(document.activeElement).toBe(field);
      expect([field.selectionStart, field.selectionEnd]).toEqual([0, field.value.length]);
      expect(screen.queryByRole('button', { name: 'Copied' })).toBeNull();
    });
  });
});

describe('Seats in motion', () => {
  // jsdom has no Web Animations: each animation finishes on the next task.
  const animate = vi.fn(() => {
    const animation = { onfinish: null as (() => void) | null, cancel: () => {}, effect: null };
    setTimeout(() => animation.onfinish?.());
    return animation as unknown as Animation;
  });
  const originalAnimate = Element.prototype.animate;

  beforeEach(() => {
    Element.prototype.animate = animate;
  });

  afterEach(() => {
    Element.prototype.animate = originalAnimate;
    animate.mockClear();
    motion.reduced = false;
  });

  function viewOf(players: PlayerView[]): View {
    return {
      id: 'g1',
      phase: 'lobby',
      you: asAlex,
      players,
      spectators: 0,
      config: { scenario: '', difficulty: 'standard', standard: '', expert: '', modulars: [] },
      log: [],
    };
  }

  function renderView(players: PlayerView[]) {
    const handlers = {
      onremove: vi.fn(),
      onleave: vi.fn(),
      ontakeseat: vi.fn(),
      onadddeck: vi.fn(),
    };
    return render(Seats, { view: viewOf(players), ...handlers, ownSlot });
  }

  /** The elements that played an animation of the given length, in the order they started. */
  function animated(duration: number): Element[] {
    return animate.mock.calls.flatMap((call: unknown[], i) => {
      const options = call[1] as KeyframeAnimationOptions | undefined;
      return options?.duration === duration ? [animate.mock.contexts[i] as Element] : [];
    });
  }

  /** Lets every pending intro start, so that one that did not shows as such. */
  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
  }

  function deckCells(playerName: string): Element[] {
    return [...card(playerName).querySelectorAll('.deck-cell')];
  }

  it('plays nothing as the seats first show', async () => {
    renderView([alex, sam]);
    await settle();

    expect(animate).not.toHaveBeenCalled();
  });

  it('pops in the card of a player who arrives, and pops out the free seat they take', async () => {
    const { rerender } = renderView([alex, sam]);
    const taken = freeSeats()[0]?.parentElement;

    await rerender({ view: viewOf([alex, sam, jo]) });

    await vi.waitFor(() => expect(new Set(animated(200))).toEqual(new Set([cell('Jo'), taken])));
  });

  it("opens only the slot added to another player's card", async () => {
    const { rerender } = renderView([alex, sam]);

    await rerender({ view: viewOf([alex, { ...sam, decks: [spiderMan, noDeck] }]) });

    const [kept, added] = deckCells('Sam');
    await vi.waitFor(() => expect(animated(250)).toContain(added));
    expect(animated(250)).not.toContain(kept);
  });

  it('closes only the slot removed from a card, keeping the others', async () => {
    const { rerender } = renderView([alex, { ...sam, decks: [spiderMan, captainMarvel, noDeck] }]);
    const [first, removed, last] = deckCells('Sam');

    await rerender({ view: viewOf([alex, { ...sam, decks: [spiderMan, noDeck] }]) });

    await vi.waitFor(() => expect(animated(250)).toContain(removed));
    expect(animated(250)).not.toContain(first);
    expect(animated(250)).not.toContain(last);
    expect(deckCells('Sam')).toEqual([first, last]);
  });

  it('changes the seats at once under reduced motion', async () => {
    motion.reduced = true;
    const { rerender } = renderView([alex, sam]);

    await rerender({ view: viewOf([alex, { ...sam, decks: [spiderMan, noDeck] }, jo]) });
    await settle();

    expect(document.querySelectorAll('.seat')).toHaveLength(3);
    expect(animate).not.toHaveBeenCalled();
  });
});
