import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import TopBar from './TopBar.svelte';
import barSource from './TopBar.svelte?raw';
import { route } from '../lib/router.svelte';
import { cutShort } from '../lib/overflowTip.testing';
import { setFullscreenElement } from '../lib/fullscreen.testing';
import { IPAD, resetDevice, setDevice } from '../lib/platform.testing';
import { DESKTOP, LANDSCAPE_PHONE, mockScreen, PHONE, TABLET } from '../lib/screen.testing';
import { TOUCH_MODE_QUERY } from '../lib/screen';
import { tokensCss } from '../styles/tokens.testing';

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

describe('TopBar', () => {
  it('shows the full logo', () => {
    render(TopBar);
    const logo = screen.getByRole('img', { name: 'Into the Fray' });
    expect(logo.textContent?.replace(/\s+/g, ' ').trim()).toBe('INTO THE FRAY');
  });

  it('shows no crumb by default', () => {
    const { container } = render(TopBar);
    expect(container.querySelector('.crumbs')).toBeNull();
    expect(container.querySelector('.divider')).toBeNull();
  });

  it('shows the crumbs, the first one strong and the rest dimmed', () => {
    const { container } = render(TopBar, { crumbs: ['Rhino', 'Bomb Scare', 'Masters of Evil'] });
    const crumbs = container.querySelector('.crumbs');
    expect(crumbs?.textContent?.trim()).toBe('Rhino / Bomb Scare / Masters of Evil');
    expect(crumbs?.querySelector('b')?.textContent).toBe('Rhino');
    expect([...(crumbs?.querySelectorAll('.rest') ?? [])].map((rest) => rest.textContent)).toEqual([
      ' / Bomb Scare',
      ' / Masters of Evil',
    ]);
  });

  it('shows the full crumbs in a tooltip when they are cut short', async () => {
    const { container } = render(TopBar, { crumbs: ['Rhino', 'Bomb Scare'] });
    const crumbs = container.querySelector<HTMLElement>('.crumbs')!;

    cutShort(crumbs);
    await fireEvent.pointerOver(crumbs);
    expect(crumbs.dataset.tip).toBe('Rhino / Bomb Scare');
  });

  it('offers Ready all on the table, off while there is nothing to ready', async () => {
    const { unmount } = render(TopBar);
    expect(screen.queryByRole('button', { name: 'Ready all cards' })).toBeNull();
    unmount();

    const run = vi.fn();
    const { rerender } = render(TopBar, { readyAll: { disabled: true, run } });
    const button = screen.getByRole('button', { name: 'Ready all cards' });
    expect(button.dataset).toMatchObject({ tip: 'Ready all cards', kbd: '⇧ Space' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    await fireEvent.click(button);
    expect(run).not.toHaveBeenCalled();

    await rerender({ readyAll: { disabled: false, run } });
    expect(button.getAttribute('aria-disabled')).toBe('false');
    await fireEvent.click(button);
    expect(run).toHaveBeenCalledOnce();
  });

  it('shows a back arrow before the logo, only when it can go back', async () => {
    const { unmount } = render(TopBar);
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    unmount();

    const onback = vi.fn();
    const { container } = render(TopBar, { onback });
    const back = screen.getByRole('button', { name: 'Back' });
    expect(back.dataset.tip).toBe('Back');
    expect(back.hasAttribute('title')).toBe(false);
    expect(container.querySelector('header .bar')?.firstElementChild).toBe(back);
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
    expect(badge.dataset.tip).toBe('1 spectator');
    expect(badge.hasAttribute('title')).toBe(false);
    // The narrow-screen media queries hide it through this class.
    expect(badge.classList).toContain('pill');
  });

  it('pluralises the spectator count', () => {
    render(TopBar, { spectators: 3 });
    const badge = screen.getByRole('img', { name: '3 spectators' });
    expect(badge.textContent?.trim()).toBe('3');
    expect(badge.dataset.tip).toBe('3 spectators');
  });

  it('labels its icon buttons and gives them a tooltip, no native title', () => {
    document.documentElement.requestFullscreen = vi.fn();
    render(TopBar, { spectators: 0, onend: () => {} });
    for (const name of ['Fullscreen', 'End game']) {
      const button = screen.getByRole('button', { name });
      expect(button.dataset.tip).toBe(name);
      expect(button.hasAttribute('title')).toBe(false);
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

  it('shows the end detail under the question', async () => {
    render(TopBar, {
      spectators: 0,
      onend: () => {},
      endQuestion: 'Close the lobby?',
      endDetail: 'This ends the game for everyone.',
    });
    await fireEvent.click(screen.getByRole('button', { name: 'End game' }));

    expect(
      screen.getByRole('alertdialog', {
        name: 'Close the lobby?',
        description: 'This ends the game for everyone.',
      }),
    ).toBeTruthy();
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

  it('puts the spectators first, then the view switch, Ready all, Fullscreen and End game', () => {
    document.documentElement.requestFullscreen = vi.fn();
    const { container } = render(TopBar, {
      spectators: 2,
      viewMode: 'all',
      onviewmode: () => {},
      readyAll: { disabled: false, run: () => {} },
      onend: () => {},
    });
    const names = [...container.querySelectorAll('.actions > *')].map(
      (element) => element.getAttribute('aria-label') ?? '',
    );
    expect(names).toEqual([
      '2 spectators',
      'Table view',
      'Ready all cards',
      'Fullscreen',
      'End game',
    ]);
  });

  it('puts the spectators first outside the table too', () => {
    document.documentElement.requestFullscreen = vi.fn();
    const { container } = render(TopBar, { spectators: 1, onend: () => {} });
    const badge = screen.getByRole('img', { name: '1 spectator' });
    expect(container.querySelector('.actions')?.firstElementChild).toBe(badge);
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
    expect(exit.dataset.tip).toBe('Exit fullscreen');
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

  it('keeps no focus on a button clicked with the pointer, only on one activated from the keyboard', async () => {
    document.documentElement.requestFullscreen = vi.fn().mockResolvedValue(undefined);
    render(TopBar, {
      onback: () => {},
      readyAll: { disabled: false, run: () => {} },
      viewMode: 'all',
      onviewmode: () => {},
    });

    for (const name of ['Back', 'Ready all cards', 'Fullscreen', 'Villain + player']) {
      const button = screen.getByRole('button', { name });
      // A click's detail counts the pointer's presses: none for Enter or Space.
      button.focus();
      await fireEvent.click(button, { detail: 1 });
      expect(document.activeElement, name).not.toBe(button);

      button.focus();
      await fireEvent.click(button, { detail: 0 });
      expect(document.activeElement, name).toBe(button);
    }
  });

  it('gives no focus back to End game clicked with the pointer once its dialog closes', async () => {
    render(TopBar, { onend: () => {} });
    const end = screen.getByRole('button', { name: 'End game' });

    end.focus();
    await fireEvent.click(end, { detail: 1 });
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(document.activeElement).not.toBe(end);
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

describe('TopBar view modes', () => {
  it('shows no view control outside the table', () => {
    render(TopBar, {});
    expect(screen.queryByRole('group', { name: 'Table view' })).toBeNull();
  });

  it('offers All and Villain + player, the current one pressed', async () => {
    const onviewmode = vi.fn();
    render(TopBar, { viewMode: 'all', onviewmode });

    const group = screen.getByRole('group', { name: 'Table view' });
    const buttons = within(group).getAllByRole('button');
    expect(
      buttons.map((b) => [b.getAttribute('aria-label'), b.getAttribute('aria-pressed')]),
    ).toEqual([
      ['All', 'true'],
      ['Villain + player', 'false'],
    ]);
    expect(buttons.every((b) => b.querySelector('svg') !== null)).toBe(true);

    await fireEvent.click(within(group).getByRole('button', { name: 'Villain + player' }));
    expect(onviewmode).toHaveBeenCalledExactlyOnceWith('focus');
  });

  it('slides its highlight to the chosen view, but not into its first place', async () => {
    const { rerender } = render(TopBar, { viewMode: 'all', onviewmode: () => {} });
    const group = screen.getByRole('group', { name: 'Table view' });
    const highlight = () => group.querySelector<HTMLElement>('[data-indicator]');
    expect(highlight()).not.toBeNull();
    expect(highlight()?.getAttribute('aria-hidden')).toBe('true');
    expect(highlight()?.dataset.slides).toBeUndefined();

    await rerender({ viewMode: 'focus', onviewmode: () => {} });
    await tick();
    expect(highlight()?.dataset.slides).toBe('');
  });
});

describe('TopBar logo', () => {
  it('links home, at the base path', () => {
    render(TopBar, {});

    const link = screen.getByRole('link', { name: 'Into the Fray: home' });
    expect(link.getAttribute('href')).toBe(import.meta.env.BASE_URL);
  });

  it('goes home in place on a click', async () => {
    window.history.pushState(null, '', '/options');
    render(TopBar, {});

    await fireEvent.click(screen.getByRole('link', { name: 'Into the Fray: home' }));
    expect(window.location.pathname).toBe('/');
    expect(route.current).toEqual({ name: 'home' });
  });
});

describe('TopBar Fullscreen on a phone upright', () => {
  // An iPhone 15 upright: narrower than 600px, so a mouse window there drops Fullscreen.
  const UPRIGHT_PHONE = { width: 393, height: 852 };

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('offers Fullscreen to a finger where the Fullscreen API exists', () => {
    mockScreen({ ...UPRIGHT_PHONE, touch: true });
    document.documentElement.requestFullscreen = vi.fn();
    render(TopBar, { onend: () => {} });

    expect(screen.getByRole('button', { name: 'Fullscreen' })).toBeTruthy();
  });

  it('drops Fullscreen from a mouse window as narrow', () => {
    mockScreen(UPRIGHT_PHONE);
    document.documentElement.requestFullscreen = vi.fn();
    render(TopBar, { onend: () => {} });

    expect(screen.queryByRole('button', { name: /fullscreen/i })).toBeNull();
  });

  it('keeps Exit fullscreen in a mouse window as narrow, as a way out', () => {
    mockScreen(UPRIGHT_PHONE);
    document.documentElement.requestFullscreen = vi.fn();
    setFullscreenElement('fullscreenElement', document.documentElement);
    render(TopBar, { onend: () => {} });

    expect(screen.getByRole('button', { name: 'Exit fullscreen' })).toBeTruthy();
  });

  it('offers no Fullscreen to a finger without the Fullscreen API (iPhone Safari)', () => {
    mockScreen({ ...UPRIGHT_PHONE, touch: true });
    render(TopBar, { onend: () => {} });

    expect(screen.queryByRole('button', { name: /fullscreen/i })).toBeNull();
  });
});

describe('TopBar on an iPad', () => {
  // An iPad on its side. Its browsers have the Fullscreen API, which every test installs.
  const IPAD_SCREEN = { width: 1180, height: 820, touch: true };

  beforeEach(() => {
    mockScreen(IPAD_SCREEN);
    document.documentElement.requestFullscreen = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetDevice();
  });

  function actionNames(container: HTMLElement): string[] {
    return [...container.querySelectorAll('.actions > *')].map(
      (element) => element.getAttribute('aria-label') ?? '',
    );
  }

  it('offers no Fullscreen in a browser tab, and nothing in its place', () => {
    setDevice(IPAD);
    const { container } = render(TopBar, {
      spectators: 2,
      viewMode: 'all',
      onviewmode: () => {},
      readyAll: { disabled: false, run: () => {} },
      onend: () => {},
    });

    expect(actionNames(container)).toEqual([
      '2 spectators',
      'Table view',
      'Ready all cards',
      'End game',
    ]);
  });

  it('offers no Fullscreen opened from the Home Screen either', () => {
    setDevice(IPAD, true);
    const { container } = render(TopBar, { onend: () => {} });

    expect(actionNames(container)).toEqual(['End game']);
  });

  it('keeps Fullscreen on another touch screen', () => {
    const { container } = render(TopBar, { onend: () => {} });

    expect(actionNames(container)).toEqual(['Fullscreen', 'End game']);
  });
});

describe('TopBar on scroll', () => {
  // The page is 2000 px tall: each test's screen gives the window its height.
  const PAGE_HEIGHT = 2000;
  const scrollY = Object.getOwnPropertyDescriptor(window, 'scrollY');

  beforeEach(() => {
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      value: PAGE_HEIGHT,
      configurable: true,
    });
    // jsdom does not scroll: the calls are only recorded.
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(document.documentElement, 'scrollHeight');
    if (scrollY) {
      Object.defineProperty(window, 'scrollY', scrollY);
    }
  });

  /** Scrolls the window to that vertical offset. */
  async function scrollWindowTo(offset: number): Promise<void> {
    Object.defineProperty(window, 'scrollY', { value: offset, configurable: true });
    await fireEvent.scroll(window);
  }

  function header(container: HTMLElement): HTMLElement {
    return container.querySelector('header')!;
  }

  /** Waits for the next animation frame, and for what was asked of it. */
  function nextFrame(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  /**
   * Makes every focus look like the keyboard's, as a tab gives, or a tap's or a click's: whether
   * :focus-visible matches the focused element. jsdom guesses it from the events seen before.
   */
  function focusBy(device: 'keyboard' | 'pointer'): void {
    const matches = Element.prototype.matches;
    vi.spyOn(Element.prototype, 'matches').mockImplementation(function (this: Element, selectors) {
      if (selectors === ':focus-visible') {
        return device === 'keyboard' && matches.call(this, ':focus');
      }
      return matches.call(this, selectors);
    });
  }

  it('slides out of view on a compact screen as the page scrolls down, and back as it scrolls up', async () => {
    mockScreen(PHONE);
    const { container } = render(TopBar);
    expect(header(container).classList).toContain('auto-hide');
    expect(header(container).classList).not.toContain('hidden');

    await scrollWindowTo(300);
    expect(header(container).classList).toContain('hidden');

    await scrollWindowTo(250);
    expect(header(container).classList).not.toContain('hidden');
  });

  it('slides out of view on a phone on its side, wider than a compact screen but short', async () => {
    mockScreen(LANDSCAPE_PHONE);
    const { container } = render(TopBar);
    expect(header(container).classList).toContain('auto-hide');

    await scrollWindowTo(300);
    expect(header(container).classList).toContain('hidden');

    await scrollWindowTo(250);
    expect(header(container).classList).not.toContain('hidden');
  });

  it('follows the scroller it is given rather than the window', async () => {
    mockScreen(PHONE);
    const scroller = document.createElement('div');
    Object.defineProperties(scroller, {
      scrollHeight: { value: 3000 },
      clientHeight: { value: 600 },
      scrollTop: { value: 0, writable: true },
    });
    const { container } = render(TopBar, { scroller });

    await scrollWindowTo(300);
    expect(header(container).classList).not.toContain('hidden');

    scroller.scrollTop = 400;
    await fireEvent.scroll(scroller);
    expect(header(container).classList).toContain('hidden');
  });

  it('stays in view while keyboard focus is inside it', async () => {
    mockScreen(PHONE);
    focusBy('keyboard');
    const { container } = render(TopBar);
    await scrollWindowTo(300);
    expect(header(container).classList).toContain('hidden');

    // Hidden, it stays in the accessibility tree: a tab into it brings it back.
    const home = screen.getByRole('link', { name: 'Into the Fray: home' });
    home.focus();
    await tick();
    expect(header(container).classList).not.toContain('hidden');
    await nextFrame();

    await scrollWindowTo(600);
    expect(header(container).classList).not.toContain('hidden');

    // Let go, it stays until the next scroll down.
    home.blur();
    await tick();
    expect(header(container).classList).not.toContain('hidden');
    await scrollWindowTo(700);
    expect(header(container).classList).toContain('hidden');
  });

  it('keeps the page where it was as keyboard focus brings it back', async () => {
    mockScreen(PHONE);
    focusBy('keyboard');
    render(TopBar);
    await scrollWindowTo(300);

    // The browser scrolls the page up to bring the focused control into view.
    screen.getByRole('link', { name: 'Into the Fray: home' }).focus();
    Object.defineProperty(window, 'scrollY', { value: 95, configurable: true });
    await nextFrame();
    expect(window.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 300, behavior: 'instant' });
  });

  it('does not stay for the focus a tap leaves, nor the one a closed dialog gives back', async () => {
    mockScreen(PHONE);
    focusBy('pointer');
    const { container } = render(TopBar, { onend: () => {} });
    const end = screen.getByRole('button', { name: 'End game' });

    // Tapped, the button takes the focus.
    end.focus();
    await fireEvent.click(end);
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.activeElement).toBe(end);

    await scrollWindowTo(300);
    expect(header(container).classList).toContain('hidden');
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('stays in view while its End game dialog is open', async () => {
    mockScreen(PHONE);
    const { container } = render(TopBar, { onend: () => {} });
    await fireEvent.click(screen.getByRole('button', { name: 'End game' }));

    await scrollWindowTo(300);
    expect(header(container).classList).not.toContain('hidden');
  });

  it('leaves hiding to the page when it does not hide by itself', async () => {
    mockScreen(PHONE);
    const { container, rerender } = render(TopBar, { autoHide: false, hidden: true });
    expect(header(container).classList).toContain('hidden');

    // A scroll up does not bring it back.
    await scrollWindowTo(300);
    await scrollWindowTo(100);
    expect(header(container).classList).toContain('hidden');

    // Shown by the page, a scroll down does not hide it.
    await rerender({ hidden: false });
    await scrollWindowTo(600);
    await scrollWindowTo(900);
    expect(header(container).classList).not.toContain('hidden');
  });

  it('comes back for keyboard focus when it does not hide by itself', async () => {
    mockScreen(PHONE);
    focusBy('keyboard');
    const { container } = render(TopBar, { autoHide: false, hidden: true });

    screen.getByRole('link', { name: 'Into the Fray: home' }).focus();
    await tick();

    expect(header(container).classList).not.toContain('hidden');
  });

  it.each([
    ['a tablet', TABLET],
    ['a desktop', DESKTOP],
  ])('never hides on a larger screen: %s', async (_name, size) => {
    mockScreen(size);
    const { container } = render(TopBar);

    await scrollWindowTo(300);
    await scrollWindowTo(900);
    expect(header(container).classList).not.toContain('auto-hide');
    expect(header(container).classList).not.toContain('hidden');
  });
});

describe('TopBar safe areas', () => {
  it('keeps its first and last items clear of the side safe areas of a notched phone', () => {
    // jsdom has no env(): the rule itself is checked. Each edge keeps its gutter, or the safe area
    // when it is wider, unless the screen gives its own inset (--bar-inset-left and -right).
    // Spaces, which the formatter moves, are left out.
    const bar = /\n {2}\.bar \{([^}]*)\}/.exec(barSource)?.[1] ?? '';
    const padding = (/padding-inline:([^;]*);/.exec(bar)?.[1] ?? '').replace(/\s+/g, '');
    const start = 'max(var(--content-gutter,24px),var(--bar-inset-left,env(safe-area-inset-left)))';
    const end =
      'max(var(--bar-gutter-end,var(--content-gutter,24px)),var(--bar-inset-right,env(safe-area-inset-right)))';
    expect(padding).toBe(start + end);
  });
});

describe('TopBar control size', () => {
  // jsdom applies no stylesheet: the rules themselves are checked.
  function barRule(selector: string): string {
    const escaped = selector.replace(/[.]/g, '\\.');
    return new RegExp(`\\n {2}${escaped} \\{([^}]*)\\}`).exec(barSource)?.[1] ?? '';
  }

  it('is a shared token: 38px, 44px for a finger in touch mode', () => {
    const root = /^:root \{([^}]*)\}/.exec(tokensCss)?.[1];
    expect(root).toMatch(/--top-bar-control: 38px;/);
    expect(root).toMatch(/--top-bar-gap: 8px;/);
    const touch = new RegExp(
      `@media ${TOUCH_MODE_QUERY.replace(/[()]/g, '\\$&')} \\{\\s*:root \\{([^}]*)\\}`,
    ).exec(tokensCss)?.[1];
    expect(touch).toMatch(/--top-bar-control: 44px;/);
  });

  it('sizes the icon buttons, the pill and the view switch from it', () => {
    expect(barRule('.icon-button')).toMatch(/width: var\(--top-bar-control\);/);
    expect(barRule('.icon-button')).toMatch(/height: var\(--top-bar-control\);/);
    expect(barRule('.pill')).toMatch(/height: var\(--top-bar-control\);/);
    expect(barRule('.actions')).toMatch(/--segmented-height: var\(--top-bar-control\);/);
    expect(barRule('.actions')).toMatch(/gap: var\(--top-bar-gap\);/);
    // No size of its own: the token alone grows them in touch mode.
    expect(barSource).not.toMatch(/\b(38|44)px\b/);
  });
});
