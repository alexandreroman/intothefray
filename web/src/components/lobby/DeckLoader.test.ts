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
    number: fields.slot ?? null,
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
  await loader.rerender({ loading: true, locked: true, loaded: 0 });
  return loader;
}

/** Changes the loaded deck: opens the form, then starts loading a link. */
async function startChange() {
  const loader = renderLoader(ready);
  await fireEvent.click(screen.getByRole('button', { name: 'Change deck' }));
  await fireEvent.input(screen.getByRole('textbox', { name: 'Deck link' }), {
    target: { value: 'https://example.com/deck/1' },
  });
  await loader.rerender({ loading: true, locked: true, loaded: 0 });
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

  it('loads the link from an icon button named in its tooltip, disabled while the field is empty', async () => {
    const { onload } = renderLoader(waiting);

    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Load' });
    expect(button.dataset.tip).toBe('Load');
    expect(button.textContent?.trim()).toBe('');
    expect(button.querySelector('svg')?.dataset.icon).toBe('arrow-right');
    expect(button.disabled).toBe(true);

    await fireEvent.input(screen.getByRole('textbox', { name: 'Deck link' }), {
      target: { value: ' https://example.com/deck/1 ' },
    });
    expect(button.disabled).toBe(false);
    await fireEvent.click(button);
    expect(onload).toHaveBeenCalledExactlyOnceWith('https://example.com/deck/1');
  });

  it('numbers the load button of one of several decks', () => {
    renderLoader(waiting, { slot: 2 });

    expect(screen.getByRole('button', { name: 'Load deck 2' }).dataset.tip).toBe('Load deck 2');
  });

  it('changes the deck from a pencil icon button named in its tooltip', () => {
    renderLoader(ready);

    const change = screen.getByRole('button', { name: 'Change deck' });
    expect(change.dataset.tip).toBe('Change deck');
    expect(change.textContent?.trim()).toBe('');
    expect(change.querySelector('svg')?.dataset.icon).toBe('pencil');
  });

  it('shows no Ready status beside a loaded deck: its hero tells it', () => {
    renderLoader(ready);

    expect(screen.queryByText(/Ready|Waiting/)).toBeNull();
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

  it('numbers the slot of one of several decks, in its name and its placeholder', () => {
    renderLoader(waiting, { slot: 2 });

    const field = screen.getByRole('textbox', { name: 'Deck 2 link' });
    expect(field.getAttribute('placeholder')).toBe('Paste deck 2 link…');
  });

  it('names the field for screen readers only, with no label line above the form', () => {
    for (const slot of [null, 2]) {
      const { unmount } = render(DeckLoader, {
        deck: waiting,
        number: slot,
        deckError: null,
        error: null,
        onload: vi.fn(),
        onremove: vi.fn(),
      });

      const label = document.querySelector('label');
      expect(label?.classList.contains('sr-only')).toBe(true);
      expect(label?.closest('form')).not.toBeNull();
      const pane = document.querySelector('.pane');
      expect([...(pane?.children ?? [])].map((child) => child.tagName)).toEqual(['FORM', 'P']);
      unmount();
    }
  });

  it("puts an empty slot's trash icon button on the form's line", () => {
    renderLoader(waiting, { slot: 2, onremove: vi.fn() });

    const remove = screen.getByRole('button', { name: 'Remove deck 2' });
    expect(remove.closest('form')).toBe(document.querySelector('form'));
    expect(remove.getAttribute('type')).toBe('button');
  });

  it('cancels a Change from an undo icon button on the form line, named in its tooltip', async () => {
    renderLoader(ready, { slot: 2, onremove: vi.fn() });

    await fireEvent.click(screen.getByRole('button', { name: 'Change deck 2' }));

    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(cancel.closest('form')).toBe(document.querySelector('form'));
    expect(cancel.dataset.tip).toBe('Cancel');
    expect(cancel.textContent?.trim()).toBe('');
    expect(cancel.querySelector('svg')?.dataset.icon).toBe('undo');
    expect(cancel.getAttribute('type')).toBe('button');
    // Changing a loaded deck, the slot offers Cancel rather than its trash.
    expect(screen.queryByRole('button', { name: 'Remove deck 2' })).toBeNull();
  });

  it('removes the slot from its trash icon button, named in its tooltip', async () => {
    const onremove = vi.fn();
    renderLoader(ready, { slot: 2, onremove });

    const remove = screen.getByRole('button', { name: 'Remove deck 2' });
    expect(remove.dataset.tip).toBe('Remove deck 2');
    expect(remove.querySelector('svg')?.dataset.icon).toBe('trash');
    await fireEvent.click(remove);
    expect(onremove).toHaveBeenCalledOnce();
  });

  it('removes an empty slot from its trash icon button too', async () => {
    const onremove = vi.fn();
    renderLoader(waiting, { slot: 2, onremove });

    await fireEvent.click(screen.getByRole('button', { name: 'Remove deck 2' }));
    expect(onremove).toHaveBeenCalledOnce();
  });

  it('never shows the cross, which closes things only', async () => {
    renderLoader(ready, { slot: 2, onremove: vi.fn() });
    expect(document.querySelector('[data-icon="cross"]')).toBeNull();

    await fireEvent.click(screen.getByRole('button', { name: 'Change deck 2' }));
    expect(document.querySelector('[data-icon="cross"]')).toBeNull();
  });

  it('has no remove button without onremove', () => {
    renderLoader(ready);

    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull();
  });

  describe('while its deck loads', () => {
    it('marks the form busy, but not the status line', () => {
      renderLoader(waiting, { loading: true, locked: true });

      expect(document.querySelector('form')?.getAttribute('aria-busy')).toBe('true');
      expect(screen.getByRole('status').closest('[aria-busy]')).toBeNull();
    });

    it('is not busy when idle', () => {
      renderLoader(waiting);

      expect(document.querySelector('[aria-busy]')).toBeNull();
    });

    it('shows a spinner in place of the Load icon and marks it disabled, keeping it focusable', async () => {
      await startLoading(waiting);

      const button = screen.getByRole('button', { name: 'Load' });
      expect(button.getAttribute('aria-disabled')).toBe('true');
      expect(button.hasAttribute('disabled')).toBe(false);
      expect(button.querySelector('.spinner')).not.toBeNull();
      expect(button.querySelector('svg')).toBeNull();
    });

    it('does not load again on submit', async () => {
      const { onload } = await startLoading(waiting);

      await fireEvent.click(screen.getByRole('button', { name: 'Load' }));

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

      await rerender({ loading: true, locked: true });

      expect(screen.getByRole('status')).toBe(status);
      expect(status.textContent?.trim()).toBe('Loading the deck…');
    });

    it('disables Cancel during a Change', async () => {
      const { rerender } = renderLoader(ready);
      await fireEvent.click(screen.getByRole('button', { name: 'Change deck' }));

      await rerender({ loading: true, locked: true });

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
      await rerender({ loading: true, locked: true, loaded: 3 });

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
      expect(document.querySelector('.spinner')).toBeNull();
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
      renderLoader(waiting, { slot: 2, onremove, loading: true, locked: true });

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

describe('DeckLoader in motion', () => {
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
  });

  /** The elements that played a 200 ms animation. */
  function faded(): Element[] {
    return animate.mock.calls.flatMap((call: unknown[], i) => {
      const options = call[1] as KeyframeAnimationOptions | undefined;
      return options?.duration === 200 ? [animate.mock.contexts[i] as Element] : [];
    });
  }

  it('shows its first state at once', async () => {
    renderLoader(ready);
    await new Promise((resolve) => setTimeout(resolve));

    expect(animate).not.toHaveBeenCalled();
  });

  it('cross-fades the loaded deck into the form on Change, in the same place', async () => {
    renderLoader(ready);
    const loaded = document.querySelector('.loaded');
    const slot = loaded?.parentElement;

    await fireEvent.click(screen.getByRole('button', { name: 'Change deck' }));

    const form = screen.getByRole('textbox', { name: 'Deck link' }).closest('.pane');
    await vi.waitFor(() => expect(new Set(faded())).toEqual(new Set([loaded, form])));
    expect(form?.parentElement).toBe(slot);
  });
});
