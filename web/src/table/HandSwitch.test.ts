import { fireEvent, render, screen, within } from '@testing-library/svelte';
import HandSwitch from './HandSwitch.svelte';

const DECKS = [
  { seat: 0, name: 'Spider-Man', handCount: 5 },
  { seat: 1, name: 'Ant-Man', handCount: 1 },
];

function buttons(): HTMLElement[] {
  return within(screen.getByRole('group', { name: 'Hand shown' })).getAllByRole('button');
}

describe('HandSwitch', () => {
  it('shows one swatch per deck, with its hero and hand count, the selected one pressed', () => {
    render(HandSwitch, { props: { decks: DECKS, selected: 1, color: 0, onselect: vi.fn() } });

    expect(buttons().map((button) => button.getAttribute('aria-label'))).toEqual([
      'Spider-Man: 5 cards in hand',
      'Ant-Man: 1 card in hand',
    ]);
    expect(buttons().map((button) => button.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Spider-Man 5',
      'Ant-Man 1',
    ]);
    expect(buttons().map((button) => button.getAttribute('aria-pressed'))).toEqual([
      'false',
      'true',
    ]);
  });

  it('selects the deck clicked', async () => {
    const onselect = vi.fn();
    render(HandSwitch, { props: { decks: DECKS, selected: 1, color: 0, onselect } });

    await fireEvent.click(buttons()[0]!);
    expect(onselect).toHaveBeenCalledExactlyOnceWith(0);
  });

  it("wears the player's colour", () => {
    render(HandSwitch, { props: { decks: DECKS, selected: 0, color: 2, onselect: vi.fn() } });

    const group = screen.getByRole('group', { name: 'Hand shown' });
    expect(group.style.getPropertyValue('--seat')).toBe('var(--p3)');
  });
});
