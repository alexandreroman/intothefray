import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import Home from './Home.svelte';
import { createGame } from '../lib/api';
import { NEWS, type NewsEntry } from '../lib/news';
import { getPref, getToken } from '../lib/prefs';

vi.mock('../lib/api', () => ({ createGame: vi.fn() }));

const createGameMock = vi.mocked(createGame);

beforeEach(() => {
  window.history.pushState(null, '', '/');
});

afterEach(() => {
  createGameMock.mockReset();
});

describe('Home', () => {
  it('start creates a game with the stored name and navigates', async () => {
    localStorage.setItem('itf-name', 'Alex');
    createGameMock.mockResolvedValue({ id: 'g1', token: 'tok' });
    render(Home);

    await fireEvent.click(screen.getByRole('button', { name: 'Start a game' }));

    await waitFor(() => expect(window.location.pathname).toBe('/g/g1'));
    expect(createGameMock).toHaveBeenCalledWith('Alex');
    expect(getToken('g1')).toBe('tok');
  });

  it('starts with a generated name when none is stored, and stores it', async () => {
    createGameMock.mockResolvedValue({ id: 'g2', token: 'tok2' });
    render(Home);

    await fireEvent.click(screen.getByRole('button', { name: 'Start a game' }));

    await waitFor(() => expect(window.location.pathname).toBe('/g/g2'));
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

  // On a phone they show their icon only: their label, out of sight, still names them.
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
      expect(banner.textContent).toContain(`New: ${newest.title}`);

      await fireEvent.click(within(banner).getByRole('button', { name: 'Dismiss' }));

      expect(screen.queryByRole('complementary', { name: 'Latest news' })).toBeNull();
      expect(hasDot()).toBe(true);
      expect(screen.queryByRole('dialog')).toBeNull();
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

      await fireEvent.click(within(banner).getByRole('button', { name: "See what's new" }));

      expect(screen.getByRole('dialog', { name: "What's new" })).toBeTruthy();
      expect(hasDot()).toBe(false);
      expect(screen.queryByRole('complementary', { name: 'Latest news' })).toBeNull();
    });

    // jsdom gives no focus to a clicked button, as browsers do: the tests focus it first.
    it("gives the focus to the What's new button once closed, opened from the banner", async () => {
      withUnreadNews();
      render(Home);
      const see = screen.getByRole('button', { name: "See what's new" });
      see.focus();

      await fireEvent.click(see);
      expect(see.isConnected).toBe(false);
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
  });
});
