import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import Home from './Home.svelte';
import { createGame } from '../lib/api';
import { NEWS, type NewsEntry } from '../lib/news';
import { IPAD, resetDevice, setDevice, setInstalledApp } from '../lib/platform.testing';
import { getPref, getToken } from '../lib/prefs';
import { fetchGamesInProgress } from '../lib/stats';

vi.mock('../lib/api', () => ({ createGame: vi.fn() }));
vi.mock('../lib/stats', () => ({ fetchGamesInProgress: vi.fn() }));

// Whether the viewer prefers reduced motion: by default, so that the banner leaves at once (jsdom
// has no Web Animations); the tests of its motion turn it off.
const motion = vi.hoisted(() => ({ reduced: true }));

vi.mock('svelte/motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('svelte/motion')>()),
  prefersReducedMotion: {
    get current() {
      return motion.reduced;
    },
  },
}));

const createGameMock = vi.mocked(createGame);
const gamesInProgressMock = vi.mocked(fetchGamesInProgress);

beforeEach(() => {
  window.history.pushState(null, '', '/');
  motion.reduced = true;
  // The count stays loading unless a test says otherwise.
  gamesInProgressMock.mockReturnValue(new Promise(() => {}));
});

afterEach(() => {
  createGameMock.mockReset();
  gamesInProgressMock.mockReset();
});

describe('Home', () => {
  it('start creates a game with the stored name and navigates', async () => {
    localStorage.setItem('itf-name', 'Alex');
    createGameMock.mockResolvedValue({ id: 'g1', token: 'tok' });
    render(Home);

    await fireEvent.click(screen.getByRole('button', { name: 'Start a game' }));

    await waitFor(() =>
      expect(window.location.pathname + window.location.search).toBe('/g/?id=g1'),
    );
    expect(createGameMock).toHaveBeenCalledWith('Alex');
    expect(getToken('g1')).toBe('tok');
  });

  it('starts with a generated name when none is stored, and stores it', async () => {
    createGameMock.mockResolvedValue({ id: 'g2', token: 'tok2' });
    render(Home);

    await fireEvent.click(screen.getByRole('button', { name: 'Start a game' }));

    await waitFor(() =>
      expect(window.location.pathname + window.location.search).toBe('/g/?id=g2'),
    );
    const name = getPref('itf-name');
    expect(name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    expect(createGameMock).toHaveBeenCalledWith(name);
  });

  it('shows an error when the game cannot be created', async () => {
    localStorage.setItem('itf-name', 'Alex');
    createGameMock.mockRejectedValue(new Error('boom'));
    render(Home);

    await fireEvent.click(screen.getByRole('button', { name: 'Start a game' }));

    expect((await screen.findByRole('alert')).textContent).toContain('boom');
    expect(window.location.pathname).toBe('/');
  });

  it('shows the logo, the pitch and the disclaimer', () => {
    render(Home);

    expect(screen.getByRole('heading', { level: 1, name: 'Into the Fray' })).toBeTruthy();
    expect(screen.getByText('Play Marvel Champions in your browser.')).toBeTruthy();
    for (const feature of ['A true sandbox', 'Up to 4 heroes', 'Bring your own deck']) {
      expect(screen.getByText(feature)).toBeTruthy();
    }
    expect(
      screen.getByText(
        'Fan-made and unofficial. Not affiliated with Marvel or Fantasy Flight Games.',
      ),
    ).toBeTruthy();
  });

  it('disables the start button while the game is being created', async () => {
    localStorage.setItem('itf-name', 'Alex');
    createGameMock.mockReturnValue(new Promise(() => {}));
    render(Home);
    const start = screen.getByRole('button', { name: 'Start a game' });

    await fireEvent.click(start);

    expect((start as HTMLButtonElement).disabled).toBe(true);
  });

  it('goes to the options screen', async () => {
    render(Home);
    await fireEvent.click(screen.getByRole('button', { name: 'Options' }));
    expect(window.location.pathname).toBe('/options');
  });

  // Short of room, they show their icon only: their label, out of sight, still names them.
  it('names the Options and About buttons by their label, with a tooltip each', () => {
    render(Home);

    for (const name of ['Options', 'About']) {
      const button = screen.getByRole('button', { name });
      expect(button.textContent?.trim()).toBe(name);
      expect(button.hasAttribute('aria-label')).toBe(false);
      expect(button.dataset.tip).toBe(name);
    }
  });

  it('goes to the about screen', async () => {
    render(Home);
    await fireEvent.click(screen.getByRole('button', { name: 'About' }));
    expect(window.location.pathname).toBe('/about');
  });

  describe('games in progress', () => {
    // Anchored: the feature list also speaks of "any game in progress".
    const COUNT_LINE = /^\d+ games? in progress$/;

    it.each([
      [12, '12 games in progress'],
      [1, '1 game in progress'],
    ])('shows %i as "%s"', async (games, text) => {
      gamesInProgressMock.mockResolvedValue(games);
      render(Home);

      expect(await screen.findByText(text)).toBeTruthy();
      expect(gamesInProgressMock).toHaveBeenCalledOnce();
    });

    it('shows nothing when no game is in progress', async () => {
      gamesInProgressMock.mockResolvedValue(0);
      render(Home);

      // Lets the request settle.
      await new Promise((resolve) => setTimeout(resolve));
      expect(screen.queryByText(COUNT_LINE)).toBeNull();
    });

    it('shows nothing while the count loads', () => {
      render(Home);

      expect(gamesInProgressMock).toHaveBeenCalledOnce();
      expect(screen.queryByText(COUNT_LINE)).toBeNull();
    });

    it('shows nothing when the count cannot be read', async () => {
      gamesInProgressMock.mockRejectedValue(new Error('boom'));
      render(Home);

      // Lets the failed request settle.
      await new Promise((resolve) => setTimeout(resolve));
      expect(screen.queryByText(COUNT_LINE)).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  describe("what's new", () => {
    const newest = NEWS[0] as NewsEntry;

    /** A visitor who last saw the news before every entry: all of them are unread. */
    function withUnreadNews(): void {
      localStorage.setItem('itf-news-seen', '2000-01-01-old');
    }

    function newsButton(): HTMLElement {
      return screen.getByRole('button', { name: /^What's new/ });
    }

    function hasDot(): boolean {
      return newsButton().querySelector('.dot') !== null;
    }

    it('shows an icon button named by its label and its tooltip', () => {
      render(Home);
      const button = screen.getByRole('button', { name: "What's new" });

      expect(button.textContent?.trim()).toBe('');
      expect(button.dataset.tip).toBe("What's new");
      expect(button.hasAttribute('title')).toBe(false);
    });

    it('shows no dot and no banner on a first visit', () => {
      render(Home);

      expect(screen.getByRole('button', { name: "What's new" })).toBe(newsButton());
      expect(hasDot()).toBe(false);
      expect(screen.queryByRole('complementary', { name: 'Latest news' })).toBeNull();
    });

    it('marks the button with a dot while news is unread, without a count', () => {
      withUnreadNews();
      render(Home);

      expect(screen.getByRole('button', { name: "What's new, unread news" })).toBe(newsButton());
      expect(hasDot()).toBe(true);
      expect(newsButton().getAttribute('aria-label')).not.toMatch(/\d/);
      expect(newsButton().textContent).not.toMatch(/\d/);
    });

    it('shows the newest unread entry in a banner, which can be dismissed', async () => {
      withUnreadNews();
      render(Home);
      const banner = screen.getByRole('complementary', { name: 'Latest news' });
      // The news, which opens the dialog, and its dismissal: nothing else.
      const buttons = within(banner).getAllByRole('button');
      expect(
        buttons.map((button) => button.textContent?.trim() || button.getAttribute('aria-label')),
      ).toEqual([`New: ${newest.title}`, 'Dismiss']);

      await fireEvent.click(within(banner).getByRole('button', { name: 'Dismiss' }));

      expect(screen.queryByRole('complementary', { name: 'Latest news' })).toBeNull();
      expect(hasDot()).toBe(true);
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it("gives the focus to the What's new button once the banner is dismissed from the keyboard", async () => {
      withUnreadNews();
      render(Home);
      const dismiss = screen.getByRole('button', { name: 'Dismiss' });
      const focus = vi.spyOn(newsButton(), 'focus');
      dismiss.focus();

      await fireEvent.keyDown(dismiss, { key: 'Enter' });
      await fireEvent.click(dismiss);

      expect(dismiss.isConnected).toBe(false);
      expect(document.activeElement).toBe(newsButton());
      // From the keyboard, the browser shows the focus ring.
      expect(focus).toHaveBeenCalledExactlyOnceWith();
    });

    it("gives the focus to the What's new button without a ring once the banner is dismissed by a click", async () => {
      withUnreadNews();
      render(Home);
      const dismiss = screen.getByRole('button', { name: 'Dismiss' });
      const focus = vi.spyOn(newsButton(), 'focus');

      await fireEvent.pointerDown(dismiss);
      await fireEvent.click(dismiss);

      expect(document.activeElement).toBe(newsButton());
      expect(focus).toHaveBeenCalledExactlyOnceWith({ focusVisible: false });
    });

    it('opens the news from the button, which clears the dot and the banner', async () => {
      withUnreadNews();
      render(Home);

      await fireEvent.click(newsButton());

      const dialog = screen.getByRole('dialog', { name: "What's new" });
      expect(within(dialog).getAllByText('New')).toHaveLength(NEWS.length);
      expect(hasDot()).toBe(false);
      expect(screen.queryByRole('complementary', { name: 'Latest news' })).toBeNull();

      await fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(hasDot()).toBe(false);
    });

    it('opens the news from the banner, which clears the dot and the banner', async () => {
      withUnreadNews();
      render(Home);
      const banner = screen.getByRole('complementary', { name: 'Latest news' });

      await fireEvent.click(within(banner).getByRole('button', { name: `New: ${newest.title}` }));

      expect(screen.getByRole('dialog', { name: "What's new" })).toBeTruthy();
      expect(hasDot()).toBe(false);
      expect(screen.queryByRole('complementary', { name: 'Latest news' })).toBeNull();
    });

    // jsdom gives no focus to a clicked button, as browsers do: the tests focus it first.
    it("gives the focus to the What's new button once closed, opened from the banner", async () => {
      withUnreadNews();
      render(Home);
      const opener = screen.getByRole('button', { name: `New: ${newest.title}` });
      opener.focus();

      await fireEvent.click(opener);
      expect(opener.isConnected).toBe(false);
      await fireEvent.click(screen.getByRole('button', { name: 'Close' }));

      await waitFor(() => expect(document.activeElement).toBe(newsButton()));
    });

    it("gives the focus back to the What's new button once closed, opened from it", async () => {
      withUnreadNews();
      render(Home);
      newsButton().focus();

      await fireEvent.click(newsButton());
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
      await fireEvent.click(screen.getByRole('button', { name: 'Close' }));

      await waitFor(() => expect(document.activeElement).toBe(newsButton()));
    });

    it('tags nothing as new once the news has been seen', async () => {
      withUnreadNews();
      const { unmount } = render(Home);
      await fireEvent.click(newsButton());
      unmount();

      render(Home);
      await fireEvent.click(newsButton());

      const dialog = screen.getByRole('dialog', { name: "What's new" });
      expect(within(dialog).getAllByRole('listitem')).toHaveLength(NEWS.length);
      expect(within(dialog).queryByText('New')).toBeNull();
    });

    describe('banner motion', () => {
      // Animations that run until a test finishes them, as the banner's transition plays them.
      type FakeAnimation = { onfinish: (() => void) | null; cancel: () => void; effect: null };
      let running: FakeAnimation[] = [];
      const animate = vi.fn(() => {
        const animation: FakeAnimation = { onfinish: null, cancel: () => {}, effect: null };
        running.push(animation);
        return animation;
      });
      const originalAnimate = Element.prototype.animate;

      /** Plays every animation to its end, and those they start in turn. */
      async function finishAnimations(): Promise<void> {
        while (running.length > 0) {
          running.shift()?.onfinish?.();
          await tick();
        }
      }

      function banner(): HTMLElement | null {
        return screen.queryByRole('complementary', { name: 'Latest news' });
      }

      beforeEach(() => {
        Element.prototype.animate = animate as unknown as typeof Element.prototype.animate;
        motion.reduced = false;
        withUnreadNews();
      });

      afterEach(async () => {
        await finishAnimations();
        Element.prototype.animate = originalAnimate;
        animate.mockClear();
        running = [];
        resetDevice();
      });

      it('folds the banner away once dismissed, then removes it', async () => {
        render(Home);

        await fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
        expect(banner()).not.toBeNull();
        expect(hasDot()).toBe(true);

        await finishAnimations();
        expect(banner()).toBeNull();
        expect(animate).toHaveBeenCalledWith(
          expect.any(Array),
          expect.objectContaining({ duration: 220 }),
        );
      });

      it('lets the Home Screen banner come only once the news banner has left', async () => {
        setDevice(IPAD);
        render(Home);

        await fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
        expect(screen.queryByRole('complementary', { name: 'Home Screen tip' })).toBeNull();

        await finishAnimations();
        expect(banner()).toBeNull();
        expect(screen.getByRole('complementary', { name: 'Home Screen tip' })).toBeTruthy();
      });

      it('removes the banner at once under reduced motion', async () => {
        motion.reduced = true;
        render(Home);

        await fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

        expect(banner()).toBeNull();
        expect(animate).not.toHaveBeenCalled();
      });

      it("gives the focus to the What's new button when the news closes while the banner leaves", async () => {
        render(Home);
        const opener = screen.getByRole('button', { name: `New: ${newest.title}` });
        opener.focus();

        await fireEvent.click(opener);
        await fireEvent.click(screen.getByRole('button', { name: 'Close' }));

        // Still on its way out: the button that opened the news is still in the page.
        expect(opener.isConnected).toBe(true);
        await waitFor(() => expect(document.activeElement).toBe(newsButton()));
      });
    });
  });
  describe('Home Screen banner', () => {
    const TEXT = 'Play full screen: add Into the Fray to your Home Screen.';

    function banner(): HTMLElement | null {
      return screen.queryByRole('complementary', { name: 'Home Screen tip' });
    }

    function newsButton(): HTMLElement {
      return screen.getByRole('button', { name: /^What's new/ });
    }

    afterEach(resetDevice);

    it('shows on an iPad in a browser tab, its text the button that explains', async () => {
      setDevice(IPAD);
      render(Home);
      const buttons = within(banner()!).getAllByRole('button');
      expect(
        buttons.map(
          (button) =>
            button.textContent?.replace(/\s+/g, ' ').trim() || button.getAttribute('aria-label'),
        ),
      ).toEqual([TEXT, 'Dismiss']);

      await fireEvent.click(within(banner()!).getByRole('button', { name: TEXT }));
      const dialog = screen.getByRole('dialog', { name: 'Play full screen' });

      // Got it closes the explanation only: the banner stays, to come back to.
      await fireEvent.click(within(dialog).getByRole('button', { name: 'Got it' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(banner()).not.toBeNull();
      expect(getPref('itf-home-screen-banner')).toBeNull();
    });

    it("goes for good once dismissed, the focus on the What's new button", async () => {
      setDevice(IPAD);
      const { unmount } = render(Home);
      const dismiss = within(banner()!).getByRole('button', { name: 'Dismiss' });
      dismiss.focus();

      await fireEvent.click(dismiss);
      expect(banner()).toBeNull();
      expect(document.activeElement).toBe(newsButton());
      unmount();

      render(Home);
      expect(banner()).toBeNull();
    });

    it('waits while the news banner shows, and comes once it is dismissed', async () => {
      setDevice(IPAD);
      localStorage.setItem('itf-news-seen', '2000-01-01-old');
      render(Home);
      expect(screen.getByRole('complementary', { name: 'Latest news' })).toBeTruthy();
      expect(banner()).toBeNull();

      const news = screen.getByRole('complementary', { name: 'Latest news' });
      await fireEvent.click(within(news).getByRole('button', { name: 'Dismiss' }));

      expect(screen.queryByRole('complementary', { name: 'Latest news' })).toBeNull();
      expect(banner()).not.toBeNull();
    });

    it('comes once the news open from their banner', async () => {
      setDevice(IPAD);
      localStorage.setItem('itf-news-seen', '2000-01-01-old');
      render(Home);

      await fireEvent.click(screen.getByRole('button', { name: /^New: / }));
      await fireEvent.click(screen.getByRole('button', { name: 'Close' }));

      expect(banner()).not.toBeNull();
    });

    it('does not show on an iPad opened from the Home Screen', () => {
      setDevice(IPAD, true);
      render(Home);
      expect(banner()).toBeNull();
    });

    it('does not show on an iPad in the fullscreen installed app either', () => {
      setDevice(IPAD);
      setInstalledApp('fullscreen');
      render(Home);
      expect(banner()).toBeNull();
    });

    it('does not show on another device', () => {
      render(Home);
      expect(banner()).toBeNull();
    });
  });
});
