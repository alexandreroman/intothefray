import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import Seats from './Seats.svelte';
import { cutShort } from '../../lib/overflowTip.testing';
import type { DeckView, PlayerView, View, YouView } from '../../lib/types';

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

function freeSeats(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.free')];
}

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

      expect(card('Sam').classList.contains('span2')).toBe(true);
      expect(card('Alex').classList.contains('span2')).toBe(false);
      expect(freeSeats()).toHaveLength(1);
      expect(screen.getByText('3 of 4 seats')).toBeTruthy();
    });

    it('spans a card over four seats for a player with four decks, and leaves no free seat', () => {
      renderSeats({ players: [{ ...alex, decks: [noDeck, noDeck, noDeck, noDeck] }] });

      expect(card('Alex').classList.contains('span4')).toBe(true);
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

    it("tints the viewer's own card", () => {
      renderSeats();

      expect(card('Alex').classList.contains('me')).toBe(true);
      expect(card('Sam').classList.contains('me')).toBe(false);
    });
  });

  describe('a player card', () => {
    it('tells whether the player is online, with their roles', () => {
      renderSeats({ players: [alex, jo] });

      const online = card('Alex').querySelector('.status')!;
      expect(online.classList.contains('off')).toBe(false);
      expect(online.textContent).toMatch(/^Online\s*· you\s*· host$/);
      const offline = card('Jo').querySelector('.status')!;
      expect(offline.classList.contains('off')).toBe(true);
      expect(offline.textContent?.trim()).toBe('Offline');
    });

    it('gives the phone dot a tooltip and a hidden text', () => {
      renderSeats({ players: [alex, jo] });

      const dot = card('Jo').querySelector<HTMLElement>('.dot')!;
      expect(dot.dataset.tip).toBe('Offline');
      expect(within(dot).getByText('Offline').classList.contains('sr-only')).toBe(true);
      expect(card('Alex').querySelector<HTMLElement>('.dot')!.dataset.tip).toBe('Online');
    });

    it('tags the viewer and the host after the name', () => {
      renderSeats();

      const tags = (name: string) =>
        [...card(name).querySelectorAll('.tag')].map((tag) => tag.textContent);
      expect(tags('Alex')).toEqual(['you', 'host']);
      expect(tags('Sam')).toEqual([]);
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
