// The "What's new" entries the home screen shows: what changed for the players, newest first.

/** One piece of news: a feature the players can use. */
export interface NewsEntry {
  /**
   * The entry's date and a slug, as "2026-11-01-red-skull": ids sort as their dates do, so an
   * entry is unread when its id comes after the last one seen, whatever was removed or added.
   */
  id: string;
  /** The day it came out, as YYYY-MM-DD. */
  date: string;
  title: string;
  /** A sentence or two, for the players. */
  text: string;
  image?: { src: string; alt: string };
}

/** Every entry, newest first (news.test.ts checks it). */
export const NEWS: NewsEntry[] = [
  {
    id: '2026-11-01-red-skull',
    date: '2026-11-01',
    title: 'Rise of the Red Skull scenarios',
    text:
      'Take on Crossbones, Absorbing Man, Taskmaster, Zola and Red Skull, in Standard or Expert. ' +
      'Crossbones brings his Experimental Weapons, and Red Skull his own deck of side schemes.',
  },
  {
    id: '2026-10-29-several-decks',
    date: '2026-10-29',
    title: 'Up to four heroes for one player',
    text:
      'Load several decks and play up to four heroes on your own, or share the table with friends. ' +
      'The hero selector, bottom left, switches between your heroes and their hands.',
  },
  {
    id: '2026-10-20-french-cards',
    date: '2026-10-20',
    title: 'French cards',
    text: 'Prefer your cards in French? Choose French in Options to see French card names and images.',
  },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A YYYY-MM-DD date as "1 Nov 2026". Spelled out by hand rather than with Intl, whose month
 * abbreviations vary between browsers and locales: every player reads the same date.
 */
export function formatNewsDate(date: string): string {
  const [year = '', month = '', day = ''] = date.split('-');
  return `${Number(day)} ${MONTHS[Number(month) - 1] ?? ''} ${year}`;
}
