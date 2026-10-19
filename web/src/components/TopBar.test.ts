import { fireEvent, render, screen, within } from '@testing-library/svelte';
import TopBar from './TopBar.svelte';

// jsdom has no Fullscreen API: each test installs the one it needs, as own
// properties that shadow nothing and are simply deleted afterwards.
afterEach(() => {
  for (const name of ['requestFullscreen', 'webkitRequestFullscreen']) {
    Reflect.deleteProperty(document.documentElement, name);
  }
  for (const name of [
    'fullscreenElement',
    'webkitFullscreenElement',
    'exitFullscreen',
    'webkitExitFullscreen',
  ]) {
    Reflect.deleteProperty(document, name);
  }
});

/**
 * A refused fullscreen request. A bare rejection would not prove a handler is
 * attached, so its catch is spied on.
 */
function refused(): { promise: Promise<void>; caught: ReturnType<typeof vi.fn> } {
  const promise = Promise.reject(new Error('denied'));
  const caught = vi.spyOn(promise, 'catch');
  return { promise, caught };
}

/** Sets what the document reports as its fullscreen element, under the standard or the WebKit name. */
function setFullscreenElement(
  name: 'fullscreenElement' | 'webkitFullscreenElement',
  value: Element | null,
): void {
  Object.defineProperty(document, name, { value, configurable: true });
}

describe('TopBar', () => {
  it('shows the full logo', () => {
    render(TopBar);
    const logo = screen.getByRole('img', { name: 'Into The Fray' });
    expect(logo.textContent?.replace(/\s+/g, ' ').trim()).toBe('INTO THE FRAY');
  });

  it('shows no crumb by default', () => {
    const { container } = render(TopBar);
    expect(container.querySelector('.crumbs')).toBeNull();
    expect(container.querySelector('.divider')).toBeNull();
  });

  it('shows the crumbs, the first one strong and the rest dimmed', () => {
    const { container } = render(TopBar, { crumbs: ['Rhino', 'Standard', 'Bomb Scare'] });
    const crumbs = container.querySelector('.crumbs');
    expect(crumbs?.textContent?.trim()).toBe('Rhino / Standard / Bomb Scare');
    expect(crumbs?.querySelector('b')?.textContent).toBe('Rhino');
    expect([...(crumbs?.querySelectorAll('.rest') ?? [])].map((rest) => rest.textContent)).toEqual([
      ' / Standard',
      ' / Bomb Scare',
    ]);
  });

  it('shows a back arrow before the logo, only when it can go back', async () => {
    const { unmount } = render(TopBar);
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    unmount();

    const onback = vi.fn();
    const { container } = render(TopBar, { onback });
    const back = screen.getByRole('button', { name: 'Back' });
    expect(back.getAttribute('title')).toBe('Back');
    expect(container.querySelector('header')?.firstElementChild).toBe(back);
    await fireEvent.click(back);
    expect(onback).toHaveBeenCalledOnce();
  });

  it('shows no spectator badge without spectators', () => {
    const { container } = render(TopBar);
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
    document.documentElement.requestFullscreen = vi.fn();
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

  it('orders the actions, End game last, with a cross', () => {
    document.documentElement.requestFullscreen = vi.fn();
    render(TopBar, { spectators: 0, onend: () => {} });
    const names = screen
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') ?? button.textContent);
    expect(names).toEqual(['Fullscreen', 'End game']);
    const cross = screen.getByRole('button', { name: 'End game' }).querySelector('path');
    expect(cross?.getAttribute('d')).toBe('M6 6l12 12M18 6L6 18');
  });

  it('offers no Fullscreen button without the Fullscreen API', () => {
    render(TopBar, { spectators: 0 });
    expect(screen.queryByRole('button', { name: /fullscreen/i })).toBeNull();
  });

  it('enters and leaves fullscreen with the standard API', async () => {
    const request = vi.fn().mockResolvedValue(undefined);
    document.documentElement.requestFullscreen = request;
    render(TopBar, { spectators: 0 });

    await fireEvent.click(screen.getByRole('button', { name: 'Fullscreen' }));
    expect(request).toHaveBeenCalledOnce();

    setFullscreenElement('fullscreenElement', document.documentElement);
    await fireEvent(document, new Event('fullscreenchange'));
    const exit = screen.getByRole('button', { name: 'Exit fullscreen' });
    expect(exit.getAttribute('title')).toBe('Exit fullscreen');
    // Narrow screens hide the Fullscreen button, except while it is active.
    expect(exit.classList).toContain('fullscreen');
    expect(exit.classList).toContain('active');

    const exitFullscreen = vi.fn().mockResolvedValue(undefined);
    document.exitFullscreen = exitFullscreen;
    await fireEvent.click(exit);
    expect(exitFullscreen).toHaveBeenCalledOnce();

    setFullscreenElement('fullscreenElement', null);
    await fireEvent(document, new Event('fullscreenchange'));
    expect(screen.getByRole('button', { name: 'Fullscreen' }).classList).not.toContain('active');
  });

  it('enters and leaves fullscreen with the WebKit-prefixed API only', async () => {
    // Older Safari returns nothing rather than a promise.
    const request = vi.fn(() => undefined);
    Object.assign(document.documentElement, { webkitRequestFullscreen: request });
    render(TopBar, { spectators: 0 });

    await fireEvent.click(screen.getByRole('button', { name: 'Fullscreen' }));
    expect(request).toHaveBeenCalledOnce();

    setFullscreenElement('webkitFullscreenElement', document.documentElement);
    await fireEvent(document, new Event('webkitfullscreenchange'));
    const exit = screen.getByRole('button', { name: 'Exit fullscreen' });

    const exitFullscreen = vi.fn(() => undefined);
    Object.assign(document, { webkitExitFullscreen: exitFullscreen });
    await fireEvent.click(exit);
    expect(exitFullscreen).toHaveBeenCalledOnce();

    setFullscreenElement('webkitFullscreenElement', null);
    await fireEvent(document, new Event('webkitfullscreenchange'));
    expect(screen.getByRole('button', { name: 'Fullscreen' })).toBeTruthy();
  });

  it('ignores a refused request', async () => {
    const refusal = refused();
    document.documentElement.requestFullscreen = vi.fn(() => refusal.promise);
    render(TopBar, { spectators: 0 });

    await fireEvent.click(screen.getByRole('button', { name: 'Fullscreen' }));
    expect(refusal.caught).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Fullscreen' })).toBeTruthy();
  });

  it('ignores a refused exit', async () => {
    document.documentElement.requestFullscreen = vi.fn();
    setFullscreenElement('fullscreenElement', document.documentElement);
    const refusal = refused();
    document.exitFullscreen = vi.fn(() => refusal.promise);
    render(TopBar, { spectators: 0 });

    await fireEvent.click(screen.getByRole('button', { name: 'Exit fullscreen' }));
    expect(refusal.caught).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Exit fullscreen' })).toBeTruthy();
  });
});
