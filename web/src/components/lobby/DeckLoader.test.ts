import { fireEvent, render, screen } from '@testing-library/svelte';
import DeckLoader from './DeckLoader.svelte';
import type { DeckView } from '../../lib/types';

const waiting: DeckView = { ready: false, handCount: 0 };
const ready: DeckView = {
  ready: true,
  hero: '01001a',
  heroName: 'Spider-Man',
  deckName: 'Friendly neighbourhood',
  handCount: 0,
};

function renderLoader(
  deck: DeckView,
  fields: { slot?: number | null; onremove?: () => void } = {},
) {
  const onload = vi.fn();
  render(DeckLoader, {
    deck,
    slot: fields.slot ?? null,
    deckError: null,
    error: null,
    onload,
    onremove: fields.onremove,
  });
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

  it('numbers the slot of one of several decks', () => {
    renderLoader(waiting, { slot: 2 });

    expect(screen.getByRole('textbox', { name: 'Deck 2 link' })).toBeTruthy();
  });

  it('removes the slot from its remove button', async () => {
    const onremove = vi.fn();
    renderLoader(ready, { slot: 2, onremove });

    await fireEvent.click(screen.getByRole('button', { name: 'Remove deck 2' }));
    expect(onremove).toHaveBeenCalledOnce();
  });

  it('has no remove button without onremove', () => {
    renderLoader(ready);

    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull();
  });
});
