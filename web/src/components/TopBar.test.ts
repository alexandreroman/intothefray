import { fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import TopBar from './TopBar.svelte';

describe('TopBar', () => {
  it('pluralises the spectator count', () => {
    render(TopBar, { title: 'T', spectators: 1 });
    expect(screen.getByText('1 spectator')).toBeTruthy();
  });

  it('renders extra buttons from the children snippet', () => {
    const children = createRawSnippet(() => ({ render: () => '<button>End game</button>' }));
    render(TopBar, { title: 'T', spectators: 0, children });
    expect(screen.getByRole('button', { name: 'End game' })).toBeTruthy();
  });

  it('requests fullscreen on the document', async () => {
    const request = vi.fn().mockResolvedValue(undefined);
    document.documentElement.requestFullscreen = request;
    render(TopBar, { title: 'T', spectators: 0 });
    await fireEvent.click(screen.getByRole('button', { name: /Fullscreen/ }));
    expect(request).toHaveBeenCalledOnce();
  });

  it('handles a refused exit from fullscreen', async () => {
    Object.defineProperty(document, 'fullscreenElement', {
      value: document.body,
      configurable: true,
    });
    // A bare promise would not prove a handler is attached, so spy on catch.
    const catchRejection = vi.fn();
    document.exitFullscreen = vi.fn(() => ({ catch: catchRejection }) as unknown as Promise<void>);
    try {
      render(TopBar, { title: 'T', spectators: 0 });
      await fireEvent.click(screen.getByRole('button', { name: /fullscreen/i }));
      expect(catchRejection).toHaveBeenCalledOnce();
    } finally {
      Reflect.deleteProperty(document, 'fullscreenElement');
    }
  });
});
