import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import TopBar from './TopBar.svelte';

afterEach(() => {
  Reflect.deleteProperty(document.documentElement, 'requestFullscreen');
  document.body.classList.remove('fs-fallback');
});

describe('TopBar', () => {
  it('shows the logo, THE in the accent colour', () => {
    const { container } = render(TopBar, { spectators: 0 });
    const logo = container.querySelector('.logo');
    expect(logo?.textContent).toBe('INTO THE FRAY');
    expect(logo?.querySelector('span')?.textContent).toBe('THE');
  });

  it('pluralises the spectator count', () => {
    render(TopBar, { spectators: 1 });
    expect(screen.getByText('1 spectator')).toBeTruthy();
  });

  it('renders extra buttons from the children snippet', () => {
    const children = createRawSnippet(() => ({ render: () => '<button>End game</button>' }));
    render(TopBar, { spectators: 0, children });
    expect(screen.getByRole('button', { name: 'End game' })).toBeTruthy();
  });

  it('requests fullscreen on the document', async () => {
    const request = vi.fn().mockResolvedValue(undefined);
    document.documentElement.requestFullscreen = request;
    render(TopBar, { spectators: 0 });
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
      render(TopBar, { spectators: 0 });
      await fireEvent.click(screen.getByRole('button', { name: /fullscreen/i }));
      expect(catchRejection).toHaveBeenCalledOnce();
    } finally {
      Reflect.deleteProperty(document, 'fullscreenElement');
    }
  });

  it('falls back to a class without the Fullscreen API', async () => {
    render(TopBar, { spectators: 0 });

    await fireEvent.click(screen.getByRole('button', { name: '⛶ Fullscreen' }));
    expect(document.body.classList).toContain('fs-fallback');

    await fireEvent.click(screen.getByRole('button', { name: '⛶ Exit fullscreen' }));
    expect(document.body.classList).not.toContain('fs-fallback');
    expect(screen.getByRole('button', { name: '⛶ Fullscreen' })).toBeTruthy();
  });

  it('falls back to a class when fullscreen is refused', async () => {
    document.documentElement.requestFullscreen = vi.fn().mockRejectedValue(new Error('denied'));
    render(TopBar, { spectators: 0 });

    await fireEvent.click(screen.getByRole('button', { name: '⛶ Fullscreen' }));
    await waitFor(() => {
      expect(document.body.classList).toContain('fs-fallback');
    });
    expect(screen.getByRole('button', { name: '⛶ Exit fullscreen' })).toBeTruthy();
  });

  it('keeps the fallback from one top bar to the next', () => {
    // The lobby and the table each have their own top bar.
    document.body.classList.add('fs-fallback');
    render(TopBar, { spectators: 0 });
    expect(screen.getByRole('button', { name: '⛶ Exit fullscreen' })).toBeTruthy();
  });
});
