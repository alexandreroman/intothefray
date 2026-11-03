// What this browser has read of the news (lib/news.ts), kept in two preferences: the id of the
// newest entry seen, and that of the newest entry whose banner was dismissed. Ids sort as their
// dates do, so an entry is unread when its id comes after the one seen.

import { getPref, setPref } from './prefs';
import { NEWS, type NewsEntry } from './news';

const SEEN_KEY = 'itf-news-seen';
const BANNER_KEY = 'itf-news-banner';

/**
 * The unread news and the home screen's banner, reactively. A first visit has nothing unread: it
 * starts from the newest entry, as seen. Without storage, every page load is a first visit.
 */
export class NewsState {
  readonly entries: readonly NewsEntry[];
  #seen = $state('');
  #bannerDismissed = $state('');

  /** `entries` are newest first; a test gives its own. */
  constructor(entries: readonly NewsEntry[] = NEWS) {
    this.entries = entries;
    const seen = getPref(SEEN_KEY);
    if (seen === null) {
      this.markSeen();
    } else {
      this.#seen = seen;
    }
    this.#bannerDismissed = getPref(BANNER_KEY) ?? '';
  }

  /** The entries not seen yet, newest first. */
  get unread(): NewsEntry[] {
    return this.entries.filter((entry) => entry.id > this.#seen);
  }

  /** The newest unread entry, unless its banner was dismissed. */
  get bannerEntry(): NewsEntry | undefined {
    const newest = this.unread[0];
    if (newest === undefined || newest.id <= this.#bannerDismissed) {
      return undefined;
    }
    return newest;
  }

  /** Every entry is seen: nothing is unread, and no banner shows. */
  markSeen(): void {
    const newest = this.entries[0];
    if (newest === undefined) {
      return;
    }
    this.#seen = newest.id;
    setPref(SEEN_KEY, newest.id);
  }

  /** The banner goes for the newest unread entry; the entries stay unread. */
  dismissBanner(): void {
    const newest = this.unread[0];
    if (newest === undefined) {
      return;
    }
    this.#bannerDismissed = newest.id;
    setPref(BANNER_KEY, newest.id);
  }
}
