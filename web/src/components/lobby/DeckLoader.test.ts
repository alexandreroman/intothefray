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
  fields: { slot?: number | null; onremove?: () => void; loading?: boolean; locked?: boolean } = {},
) {
  const onload = vi.fn();
  const { rerender } = render(DeckLoader, {
    deck,
    slot: fields.slot ?? null,
    deckError: null,
    error: null,
    onload,
    onremove: fields.onremove,
    loading: fields.loading ?? false,
    locked: fields.locked ?? false,
  });
  return { onload, rerender };
}

/**
 * Types a link, then starts its load the way the lobby does: the slot turns to loading, with no
 * load confirmed yet.
 */
async function startLoading(deck: DeckView) {
  const loader = renderLoader(deck);
  await fireEvent.input(screen.getByRole('textbox', { name: 'Deck link' }), {
    target: { value: 'https://example.com/deck/1' },
  });
  await loader.rerender({ loading: true, loaded: 0 });
  return loader;
}

/** Changes the loaded deck: opens the form, then starts loading a link. */
async function startChange() {
  const loader = renderLoader(ready);
  await fireEvent.click(screen.getByRole('button', { name: 'Change deck' }));
  await fireEvent.input(screen.getByRole('textbox', { name: 'Deck link' }), {
    target: { value: 'https://example.com/deck/1' },
  });
  await loader.rerender({ loading: true, loaded: 0 });
  return loader;
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

  describe('while its deck loads', () => {
    it('marks the form busy, but not the status line', () => {
      renderLoader(waiting, { loading: true });

      expect(document.querySelector('form')?.getAttribute('aria-busy')).toBe('true');
      expect(screen.getByRole('status').closest('[aria-busy]')).toBeNull();
    });

    it('is not busy when idle', () => {
      renderLoader(waiting);

      expect(document.querySelector('[aria-busy]')).toBeNull();
    });

    it('names the load button Loading and marks it disabled, keeping it focusable', async () => {
      await startLoading(waiting);

      const button = screen.getByRole('button', { name: 'Loading' });
      expect(button.getAttribute('aria-disabled')).toBe('true');
      expect(button.hasAttribute('disabled')).toBe(false);
      expect(screen.queryByRole('button', { name: 'Load' })).toBeNull();
    });

    it('does not load again on submit', async () => {
      const { onload } = await startLoading(waiting);

      await fireEvent.click(screen.getByRole('button', { name: 'Loading' }));

      expect(onload).not.toHaveBeenCalled();
    });

    it('makes the field read-only', async () => {
      await startLoading(waiting);

      expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Deck link' }).readOnly).toBe(
        true,
      );
    });

    it('announces that the deck is loading, in a hidden status that is there before', async () => {
      const { rerender } = renderLoader(waiting);
      const status = screen.getByRole('status');
      expect(status.classList.contains('sr-only')).toBe(true);
      expect(status.textContent?.trim()).toBe('');

      await rerender({ loading: true });

      expect(screen.getByRole('status')).toBe(status);
      expect(status.textContent?.trim()).toBe('Loading the deck…');
    });

    it('disables Cancel during a Change', async () => {
      const { rerender } = renderLoader(ready);
      await fireEvent.click(screen.getByRole('button', { name: 'Change deck' }));

      await rerender({ loading: true });

      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Cancel' }).disabled).toBe(true);
    });

    it('closes a Change once its load is confirmed, even on the same deck', async () => {
      const { rerender } = await startChange();

      await rerender({ loading: false, loaded: 1 });

      expect(screen.queryByRole('textbox', { name: 'Deck link' })).toBeNull();
      expect(screen.getByText('Spider-Man')).toBeTruthy();
    });

    it('clears the field once its load is confirmed', async () => {
      const { rerender } = await startLoading(waiting);

      await rerender({ loading: false, loaded: 1 });

      expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Deck link' }).value).toBe('');
    });

    it('keeps a Change open, with its link, when the load ends unconfirmed', async () => {
      const { rerender } = await startChange();

      // The connection dropped: the load ends, and no confirmation came.
      await rerender({ loading: false });

      const field = screen.getByRole<HTMLInputElement>('textbox', { name: 'Deck link' });
      expect(field.value).toBe('https://example.com/deck/1');
      expect(field.readOnly).toBe(false);
    });

    it('keeps a Change open, with its link, when the load ends with an error', async () => {
      const { rerender } = await startChange();

      await rerender({ loading: false, error: 'This deck is not valid.' });

      const field = screen.getByRole<HTMLInputElement>('textbox', { name: 'Deck link' });
      expect(field.value).toBe('https://example.com/deck/1');
      expect(screen.getByRole('alert').textContent).toBe('This deck is not valid.');
    });

    it('keeps a Change open when the load ends with unsupported cards', async () => {
      const { rerender } = await startChange();

      await rerender({
        loading: false,
        deckError: [{ code: '01001', name: 'Spider-Man', pack: 'core', qty: 1 }],
      });

      expect(screen.getByRole('textbox', { name: 'Deck link' })).toBeTruthy();
    });

    it('takes no load confirmed before it became the loading slot for its own', async () => {
      const { rerender } = renderLoader(ready);
      await fireEvent.click(screen.getByRole('button', { name: 'Change deck' }));

      // Another slot loaded 3 decks; this one now starts loading.
      await rerender({ loading: true, loaded: 3 });

      expect(screen.getByRole('textbox', { name: 'Deck link' })).toBeTruthy();
    });
  });

  describe('while any deck loads', () => {
    it('cannot start a load, and keeps its field and button as they are', async () => {
      const { onload, rerender } = renderLoader(waiting);
      await fireEvent.input(screen.getByRole('textbox', { name: 'Deck link' }), {
        target: { value: 'https://example.com/deck/1' },
      });

      await rerender({ locked: true });
      const button = screen.getByRole('button', { name: 'Load' });
      await fireEvent.click(button);

      expect(button.getAttribute('aria-disabled')).toBe('true');
      expect(onload).not.toHaveBeenCalled();
      expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Deck link' }).readOnly).toBe(
        false,
      );
    });

    it('shows no load in flight', () => {
      renderLoader(waiting, { locked: true });

      expect(document.querySelector('[aria-busy]')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Loading' })).toBeNull();
      expect(screen.getByRole('status').textContent?.trim()).toBe('');
    });

    it('cannot be removed', async () => {
      const onremove = vi.fn();
      renderLoader(ready, { slot: 2, onremove, locked: true });

      const remove = screen.getByRole('button', { name: 'Remove deck 2' });
      await fireEvent.click(remove);

      expect(remove.getAttribute('aria-disabled')).toBe('true');
      expect(onremove).not.toHaveBeenCalled();
    });

    it('cannot be removed while its own deck loads', async () => {
      const onremove = vi.fn();
      renderLoader(waiting, { slot: 2, onremove, loading: true });

      await fireEvent.click(screen.getByRole('button', { name: 'Remove deck 2' }));

      expect(onremove).not.toHaveBeenCalled();
    });

    it('can load again once the other load ends', async () => {
      const { onload, rerender } = renderLoader(waiting, { locked: true });
      await fireEvent.input(screen.getByRole('textbox', { name: 'Deck link' }), {
        target: { value: 'https://example.com/deck/1' },
      });

      await rerender({ locked: false });
      await fireEvent.click(screen.getByRole('button', { name: 'Load' }));

      expect(onload).toHaveBeenCalledWith('https://example.com/deck/1');
    });
  });
});
