// The metadata of the app's pages, shared by the app (the tab title) and the build (web/seo.ts),
// which writes the share previews into the static HTML. Plain data: the build imports it in Node.

/** The name of the app, as titles and share previews show it. */
export const APP_NAME = 'Into the Fray';

/** A page of the app: one per route. */
export type PageName = 'home' | 'about' | 'options' | 'game';

/** The tab title of each page. */
export const TITLES: Record<PageName, string> = {
  home: `${APP_NAME} · Play Marvel Champions in your browser`,
  about: `About · ${APP_NAME}`,
  options: `Options · ${APP_NAME}`,
  game: `Game · ${APP_NAME}`,
};

/**
 * A page built as a file of its own, whose static HTML tells link previews and search engines
 * about it: home (index.html), game (g/index.html) and notFound (404.html). GitHub Pages answers
 * any other URL, about and options included, with 404.html, which starts the app all the same.
 */
export type PreviewPageName = 'home' | 'game' | 'notFound';

/** What a link preview and a search engine see of a page. */
export interface Preview {
  /** The title of the static HTML, before the app sets the tab title. */
  title: string;
  /** The title of the link preview. */
  ogTitle: string;
  description: string;
  /**
   * The canonical app path, or null for a file served at many URLs: g/index.html at every game's,
   * 404.html at every other. Link previews follow the canonical URL, which would lose the one shared.
   */
  path: string | null;
  /** The share image (1200×630), relative to the site URL. */
  image: string;
  imageAlt: string;
  /** Whether search engines may index the page. */
  indexed: boolean;
}

// The descriptions never imply an endorsement: the project is an unofficial fan project.
const HOME: Preview = {
  title: TITLES.home,
  ogTitle: TITLES.home,
  description:
    'Play Marvel Champions in your browser, solo or with up to three friends. ' +
    'A free sandbox card table: no account, nothing to install. An unofficial fan project.',
  path: '/',
  image: 'og/home.png',
  imageAlt: `${APP_NAME}: play Marvel Champions in your browser.`,
  indexed: true,
};

export const PREVIEWS: Record<PreviewPageName, Preview> = {
  home: HOME,
  game: {
    title: TITLES.game,
    ogTitle: `Join an ${APP_NAME} game`,
    description:
      `You're invited to a game of Marvel Champions on ${APP_NAME}. ` +
      'Open the link, take a seat, deal the cards.',
    path: null,
    image: 'og/invite.png',
    imageAlt: `${APP_NAME}: you're invited to a game of Marvel Champions.`,
    indexed: false,
  },
  // The home page's preview. A 404 response is never indexed, so it needs no noindex.
  notFound: { ...HOME, path: null },
};
