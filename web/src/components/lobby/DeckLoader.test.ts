import { fireEvent, render, screen } from '@testing-library/svelte';
import DeckLoader from './DeckLoader.svelte';
import type { DeckView } from '../../lib/types';
import { cutShort } from '../../lib/overflowTip.testing';

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

  it('shows the full hero and deck names in a tooltip when they are cut short', async () => {
    renderLoader(ready);

    for (const name of ['Spider-Man', 'Friendly neighbourhood']) {
      const line = screen.getByText(name);
      cutShort(line);
      await fireEvent.pointerOver(line);
      expect(line.dataset.tip).toBe(name);
    }
  });

  it('changes the deck from an icon button named in its tooltip', () => {
    renderLoader(ready);

    const change = screen.getByRole('button', { name: 'Change deck' });
    expect(change.dataset.tip).toBe('Change deck');
    expect(change.textContent?.trim()).toBe('');
    expect(change.querySelector('svg')).toBeTruthy();
  });

  it('numbers the change button of one of several decks', () => {
    renderLoader(ready, { slot: 2 });

    expect(screen.getByRole('button', { name: 'Change deck 2' }).dataset.tip).toBe('Change deck 2');
  });

  it('shows the form again on Change, until Cancel', async () => {
    renderLoader(ready);

    await fireEvent.click(screen.getByRole('button', { name: 'Change deck' }));
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
