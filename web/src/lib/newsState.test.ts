import type { NewsEntry } from './news';
import { NewsState } from './newsState.svelte';
import { getPref, setPref } from './prefs';

function entry(id: string): NewsEntry {
  return {
    id,
    title: `Title ${id}`,
    text: `Text ${id}`,
    image: { src: `${id}.webp`, alt: `Image ${id}` },
  };
}

const NEWEST = entry('2026-11-01-newest');
const OLDER = entry('2026-10-29-older');
const OLDEST = entry('2026-10-20-oldest');
const ENTRIES = [NEWEST, OLDER, OLDEST];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('NewsState', () => {
  it('sees every entry on a first visit', () => {
    const news = new NewsState(ENTRIES);

    expect(news.unread).toEqual([]);
    expect(news.bannerEntry).toBeUndefined();
    expect(getPref('itf-news-seen')).toBe(NEWEST.id);
  });

  it('counts the entries newer than the last one seen as unread', () => {
    setPref('itf-news-seen', OLDEST.id);
    const news = new NewsState(ENTRIES);

    expect(news.unread).toEqual([NEWEST, OLDER]);
    expect(news.bannerEntry).toBe(NEWEST);
  });

  it('keeps counting by date once the entry seen is gone from the list', () => {
    setPref('itf-news-seen', '2026-10-25-removed');
    const news = new NewsState(ENTRIES);

    expect(news.unread).toEqual([NEWEST, OLDER]);
  });

  it('has nothing unread once marked seen, and remembers it', () => {
    setPref('itf-news-seen', OLDEST.id);
    const news = new NewsState(ENTRIES);

    news.markSeen();

    expect(news.unread).toEqual([]);
    expect(news.bannerEntry).toBeUndefined();
    expect(new NewsState(ENTRIES).unread).toEqual([]);
  });

  it('hides the banner once dismissed, the entries staying unread', () => {
    setPref('itf-news-seen', OLDEST.id);
    const news = new NewsState(ENTRIES);

    news.dismissBanner();

    expect(news.bannerEntry).toBeUndefined();
    expect(news.unread).toEqual([NEWEST, OLDER]);
    expect(new NewsState(ENTRIES).bannerEntry).toBeUndefined();
  });

  it('shows the banner again for an entry newer than the dismissed one', () => {
    setPref('itf-news-seen', OLDEST.id);
    setPref('itf-news-banner', OLDER.id);

    expect(new NewsState(ENTRIES).bannerEntry).toBe(NEWEST);
  });

  it('shows nothing unread, and does not fail, when the storage throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    vi.stubGlobal('localStorage', broken);

    const news = new NewsState(ENTRIES);

    expect(news.unread).toEqual([]);
    expect(news.bannerEntry).toBeUndefined();
    expect(() => news.markSeen()).not.toThrow();
    expect(() => news.dismissBanner()).not.toThrow();
  });

  it('has nothing to show without entries', () => {
    const news = new NewsState([]);

    expect(news.unread).toEqual([]);
    expect(news.bannerEntry).toBeUndefined();
    expect(getPref('itf-news-seen')).toBeNull();
  });
});
