// The "What's new" entries the home screen shows: what changed for the players, newest first.

// Each entry's thumbnail, imported so that the build fingerprints it: a 224×168 capture of the app
// (twice the 112×84 it is shown at), cropped on one telling detail.
import frenchCards from '../assets/news/2026-10-20-french-cards.webp';
import severalDecks from '../assets/news/2026-10-29-several-decks.webp';
import redSkull from '../assets/news/2026-11-01-red-skull.webp';
import shareLink from '../assets/news/2026-11-03-share-link.webp';
import galaxysMostWanted from '../assets/news/2026-11-05-galaxys-most-wanted.webp';

/** One piece of news: a feature the players can use. */
export interface NewsEntry {
  /**
   * The day it came out, as YYYY-MM-DD, and a slug, as "2026-11-01-red-skull": ids sort as their
   * dates do, so an entry is unread when its id comes after the last one seen, whatever was
   * removed or added.
   */
  id: string;
  title: string;
  /** A sentence or two, for the players. */
  text: string;
  /** A small 4:3 illustration, shown beside the text. */
  image: { src: string; alt: string };
}

/** Every entry, newest first (news.test.ts checks it). */
export const NEWS: NewsEntry[] = [
  {
    id: '2026-11-05-galaxys-most-wanted',
    title: "The Galaxy's Most Wanted scenarios",
    text:
      'The Guardians are wanted across the galaxy: fight the Brotherhood of Badoon, break into and out of the ' +
      "Collector's museum, then stop Nebula and Ronan the Accuser.",
    image: { src: galaxysMostWanted, alt: 'The Collector villain card on the table' },
  },
  {
    id: '2026-11-03-share-link',
    title: 'Share a game by link',
    text:
      'Invite friends by sending them the game link: click Copy in the lobby and paste it in a chat or a post, ' +
      'where it now shows a preview inviting them to join.',
    image: { src: shareLink, alt: "The lobby's invite link with its Copy button" },
  },
  {
    id: '2026-11-01-red-skull',
    title: 'Rise of the Red Skull scenarios',
    text:
      'Take on Crossbones, Absorbing Man, Taskmaster, Zola and Red Skull, in Standard or Expert. ' +
      'Crossbones brings his Experimental Weapons, and Red Skull his own deck of side schemes.',
    image: { src: redSkull, alt: 'The Red Skull villain card on the table' },
  },
  {
    id: '2026-10-29-several-decks',
    title: 'Up to four heroes for one player',
    text:
      'Load several decks and play up to four heroes on your own, or share the table with friends. ' +
      'The hero selector, bottom left, switches between your heroes and their hands.',
    image: {
      src: severalDecks,
      alt: 'The hero selector with three hero avatars, She-Hulk selected',
    },
  },
  {
    id: '2026-10-20-french-cards',
    title: 'French cards',
    text: 'Prefer your cards in French? Choose French in Options to see French card names and images.',
    image: { src: frenchCards, alt: "The Absorbing Man villain card in French: L'Homme Absorbant" },
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
