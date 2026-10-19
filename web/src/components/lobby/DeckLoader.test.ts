import { fireEvent, render, screen } from '@testing-library/svelte';
import DeckLoader from './DeckLoader.svelte';
import type { PlayerView } from '../../lib/types';

const waiting: PlayerView = { name: 'Jo', color: 2, host: false, ready: false, handCount: 0 };
const ready: PlayerView = {
  ...waiting,
  ready: true,
  hero: '01001a',
  heroName: 'Spider-Man',
  deckName: 'Friendly neighbourhood',
};

function renderLoader(me: PlayerView) {
  const onload = vi.fn();
  render(DeckLoader, { me, deckError: null, error: null, onload });
  return onload;
}

describe('DeckLoader', () => {
  it('asks for a deck link without naming a provider', () => {
    renderLoader(waiting);

    const field = screen.getByRole('textbox', { name: 'Deck link' });
    expect(field.getAttribute('placeholder')).toBe('Paste a deck link…');
    expect(document.body.innerHTML).not.toMatch(/marvelcdb/i);
  });

  it('shows the loaded deck by hero and deck name only', () => {
    renderLoader(ready);

    expect(screen.getByText('Spider-Man')).toBeTruthy();
    expect(screen.getByText('Friendly neighbourhood')).toBeTruthy();
    expect(document.body.innerHTML).not.toMatch(/marvelcdb/i);
  });

  it('shows the form again on Change, until Cancel', async () => {
    renderLoader(ready);

    await fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(screen.getByRole('textbox', { name: 'Deck link' })).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('textbox', { name: 'Deck link' })).toBeNull();
  });
});
