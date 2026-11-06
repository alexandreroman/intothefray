import { fireEvent, render, screen } from '@testing-library/svelte';
import Dock from './Dock.svelte';
import { NOTHING_TO_UNDO, UNDO_TIP } from './SidePanel.svelte';

const CARD = 'https://img.intothefray.xyz/cards/en/';

function props(overrides: Record<string, unknown> = {}) {
  return {
    handCount: 5,
    minis: [
      [CARD + 'a.avif'],
      [CARD + 'b.avif'],
      [CARD + 'c.avif'],
      [CARD + 'd.avif'],
      [CARD + 'e.avif'],
    ],
    avatar: [CARD + 'hero.avif'],
    heroName: 'Rocket Raccoon',
    color: 'var(--p1)',
    canUndo: true,
    unread: 0,
    dropActive: false,
    landscape: false,
    showHand: true,
    onhand: vi.fn(),
    onundo: vi.fn(),
    onhistory: vi.fn(),
    ...overrides,
  };
}

function handButton(): HTMLElement {
  return screen.getByRole('button', { name: /hand/i });
}

describe('Dock', () => {
  it('calls back from each of its buttons', async () => {
    const p = props();
    render(Dock, p);
    await fireEvent.click(handButton());
    await fireEvent.click(screen.getByRole('button', { name: UNDO_TIP }));
    await fireEvent.click(screen.getByRole('button', { name: 'History' }));
    expect(p.onhand).toHaveBeenCalledOnce();
    expect(p.onundo).toHaveBeenCalledOnce();
    expect(p.onhistory).toHaveBeenCalledOnce();
  });

  it('holds the hand button, Undo and History, and no menu button (F-U1)', () => {
    render(Dock, props());
    const names = screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'));
    expect(names).toEqual(['Hand · 5, Rocket Raccoon', UNDO_TIP, 'History']);
  });

  it('labels the hand button with the hand size and the hero name, and shows four mini cards', () => {
    render(Dock, props());
    const hand = handButton();
    // The size in the piles' capsule, right after the word, no middle dot between them.
    expect(hand.querySelector('.lbl b')?.textContent).toBe('Hand5');
    expect(hand.querySelector('.lbl b .count')?.classList.contains('count-pill')).toBe(true);
    expect(hand.querySelector('.lbl b .count')?.textContent).toBe('5');
    expect(hand.querySelector('.lbl small')?.textContent).toBe('Rocket Raccoon');
    expect(hand.querySelectorAll('.minis img')).toHaveLength(4);
  });

  it('rings the avatar with the seat colour', () => {
    render(Dock, props({ color: 'var(--p3)' }));
    const avatar = handButton().querySelector<HTMLElement>('.avatar');
    expect(avatar?.style.getPropertyValue('--seat')).toBe('var(--p3)');
    expect(avatar?.querySelector('img')?.getAttribute('src')).toBe(CARD + 'hero.avif');
  });

  it('draws a plain disc without a hero', () => {
    render(Dock, props({ avatar: null }));
    const avatar = handButton().querySelector('.avatar');
    expect(avatar?.classList.contains('empty')).toBe(true);
    expect(avatar?.querySelector('img')).toBeNull();
  });

  it('caps the unread badge at 9+', () => {
    render(Dock, props({ unread: 12 }));
    const history = screen.getByRole('button', { name: /History/ });
    expect(history.querySelector('.badge')?.textContent).toBe('9+');
    expect(history.getAttribute('aria-label')).toBe('History, 9+ new');
  });

  it('shows the unread count up to 9', () => {
    render(Dock, props({ unread: 3 }));
    expect(
      screen.getByRole('button', { name: /History/ }).querySelector('.badge')?.textContent,
    ).toBe('3');
  });

  it('shows no badge without unread lines', () => {
    render(Dock, props({ unread: 0 }));
    expect(screen.getByRole('button', { name: 'History' }).querySelector('.badge')).toBeNull();
  });

  it('turns the hand button into a drop target during a drag', () => {
    render(Dock, props({ dropActive: true }));
    const hand = screen.getByRole('button', { name: 'Drop here: back to hand' });
    expect(hand.classList.contains('drop')).toBe(true);
    expect(hand.textContent?.trim()).toBe('Drop here: back to hand');
    expect(hand.querySelector('.minis')).toBeNull();
  });

  it('disables Undo with nothing to undo, its tooltip saying why', async () => {
    const p = props({ canUndo: false });
    render(Dock, p);
    const undo = screen.getByRole('button', { name: UNDO_TIP });
    expect(undo.getAttribute('aria-disabled')).toBe('true');
    expect(undo.dataset.tip).toBe(NOTHING_TO_UNDO);
    await fireEvent.click(undo);
    expect(p.onundo).not.toHaveBeenCalled();
  });

  it('tips Undo with its action when there is something to undo', () => {
    render(Dock, props());
    const undo = screen.getByRole('button', { name: UNDO_TIP });
    expect(undo.getAttribute('aria-disabled')).toBe('false');
    expect(undo.dataset.tip).toBe(UNDO_TIP);
  });

  it('stands as a rail in landscape, its hand button the avatar and the count only', () => {
    const { container } = render(Dock, props({ landscape: true }));
    expect(container.querySelector('.dock')?.classList.contains('rail')).toBe(true);
    const hand = handButton();
    expect(hand.querySelector('.avatar')).not.toBeNull();
    expect(hand.querySelector('.count')?.textContent).toBe('5');
    expect(hand.querySelector('.count')?.classList.contains('count-pill')).toBe(true);
    expect(hand.querySelector('.lbl')).toBeNull();
    expect(hand.querySelector('.minis')).toBeNull();
    expect(hand.getAttribute('aria-label')).toBe('Hand · 5, Rocket Raccoon');
  });

  it('has no hand button without a hand to show, as for a spectator (spectator_no_hand_button)', () => {
    render(Dock, props({ showHand: false, handCount: 0, minis: [], avatar: null, heroName: '' }));
    expect(screen.queryByRole('button', { name: /hand/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Menu' })).toBeNull();
    expect(screen.getByRole('button', { name: UNDO_TIP })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'History' })).toBeTruthy();
  });

  it('lays out as a bar in portrait', () => {
    const { container } = render(Dock, props());
    expect(container.querySelector('.dock')?.classList.contains('rail')).toBe(false);
    // The size is in the label, not on the avatar.
    expect(handButton().querySelector(':scope > .count')).toBeNull();
  });
});
