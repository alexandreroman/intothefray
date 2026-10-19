import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
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

  it('shows no spectator badge without spectators', () => {
    const { container } = render(TopBar, { spectators: 0 });
    expect(screen.queryByRole('img', { name: /spectator/ })).toBeNull();
    expect(container.querySelector('.pill')).toBeNull();
  });

  it('shows the spectator count with an accessible name', () => {
    render(TopBar, { spectators: 1 });
    const badge = screen.getByRole('img', { name: '1 spectator' });
    expect(badge.textContent?.trim()).toBe('1');
    expect(badge.getAttribute('title')).toBe('1 spectator');
    // The narrow-screen media queries hide it through this class.
    expect(badge.classList).toContain('pill');
  });

  it('pluralises the spectator count', () => {
    render(TopBar, { spectators: 3 });
    const badge = screen.getByRole('img', { name: '3 spectators' });
    expect(badge.textContent?.trim()).toBe('3');
    expect(badge.getAttribute('title')).toBe('3 spectators');
  });

  it('labels its icon buttons', () => {
    render(TopBar, { spectators: 0, onend: () => {} });
    for (const name of ['Fullscreen', 'End game']) {
      const button = screen.getByRole('button', { name });
      expect(button.getAttribute('title')).toBe(name);
      expect(button.textContent?.trim()).toBe('');
    }
  });

  it('shows End game to the host only', () => {
    render(TopBar, { spectators: 0 });
    expect(screen.queryByRole('button', { name: 'End game' })).toBeNull();
  });

  it('confirms before ending the game', async () => {
    const onend = vi.fn();
    render(TopBar, { spectators: 0, onend });
    await fireEvent.click(screen.getByRole('button', { name: 'End game' }));
    expect(onend).not.toHaveBeenCalled();

    const dialog = screen.getByRole('alertdialog', { name: 'End this game for everyone?' });
    await fireEvent.click(within(dialog).getByRole('button', { name: 'End game' }));
    expect(onend).toHaveBeenCalledOnce();
  });

  it('orders the actions, the side panel toggle last', () => {
    render(TopBar, {
      spectators: 0,
      onend: () => {},
      side: { hidden: false, ontoggle: () => {} },
    });
    const names = screen
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') ?? button.textContent);
    expect(names).toEqual(['Fullscreen', 'End game', 'Preview and history']);
  });

  it('requests fullscreen on the document', async () => {
    const request = vi.fn().mockResolvedValue(undefined);
    document.documentElement.requestFullscreen = request;
    render(TopBar, { spectators: 0 });
    await fireEvent.click(screen.getByRole('button', { name: 'Fullscreen' }));
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
      await fireEvent.click(screen.getByRole('button', { name: 'Exit fullscreen' }));
      expect(catchRejection).toHaveBeenCalledOnce();
    } finally {
      Reflect.deleteProperty(document, 'fullscreenElement');
    }
  });

  it('falls back to a class without the Fullscreen API', async () => {
    render(TopBar, { spectators: 0 });

    await fireEvent.click(screen.getByRole('button', { name: 'Fullscreen' }));
    expect(document.body.classList).toContain('fs-fallback');
    const exit = screen.getByRole('button', { name: 'Exit fullscreen' });
    expect(exit.getAttribute('title')).toBe('Exit fullscreen');
    // Narrow screens hide the Fullscreen button, except while it is active.
    expect(exit.classList).toContain('active');

    await fireEvent.click(exit);
    expect(document.body.classList).not.toContain('fs-fallback');
    const enter = screen.getByRole('button', { name: 'Fullscreen' });
    expect(enter.classList).toContain('fullscreen');
    expect(enter.classList).not.toContain('active');
  });

  it('falls back to a class when fullscreen is refused', async () => {
    document.documentElement.requestFullscreen = vi.fn().mockRejectedValue(new Error('denied'));
    render(TopBar, { spectators: 0 });

    await fireEvent.click(screen.getByRole('button', { name: 'Fullscreen' }));
    await waitFor(() => {
      expect(document.body.classList).toContain('fs-fallback');
    });
    expect(screen.getByRole('button', { name: 'Exit fullscreen' })).toBeTruthy();
  });

  it('keeps the fallback from one top bar to the next', () => {
    // The lobby and the table each have their own top bar.
    document.body.classList.add('fs-fallback');
    render(TopBar, { spectators: 0 });
    expect(screen.getByRole('button', { name: 'Exit fullscreen' })).toBeTruthy();
  });
});
