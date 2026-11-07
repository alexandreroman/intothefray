type Route =
  { name: 'home' } | { name: 'options' } | { name: 'about' } | { name: 'game'; id: string };

/** An app path, relative to the base: '/', '/options', '/about', '/g/?id=<id>'. */
type AppPath = `/${string}`;

// Where the app is served, always ending with a slash: '/' by default, the
// repository sub-path on GitHub Pages.
const BASE = import.meta.env.BASE_URL;

// A game lives at '/g/?id=<id>': the query keeps a single page, g/index.html, which static hosting
// serves with a 200 and its own share preview.
/** The app path of a game: '/g/?id=<id>'. */
export function gamePath(id: string): AppPath {
  return `/g/?id=${encodeURIComponent(id)}`;
}

/** The base-prefixed URL of an app path, for links and the History API. */
export function href(path: AppPath): string {
  return BASE + path.slice(1);
}

/** The route of a pathname and its query, or null when no route matches. */
function parse(pathname: string, search: string): Route | null {
  if (!pathname.startsWith(BASE)) {
    return null;
  }
  let path = pathname.slice(BASE.length);
  // One trailing slash is tolerated: '/options/' is '/options'.
  if (path.endsWith('/')) {
    path = path.slice(0, -1);
  }
  if (path === '') {
    return { name: 'home' };
  }
  if (path === 'options') {
    return { name: 'options' };
  }
  if (path === 'about') {
    return { name: 'about' };
  }
  if (path === 'g') {
    const id = new URLSearchParams(search).get('id');
    return id ? { name: 'game', id } : null;
  }
  return null;
}

/**
 * The canonical URL of a route, hash aside: a game at '/g/?id=<id>', any other route without a
 * trailing slash and with its query.
 */
function canonicalUrl(route: Route, pathname: string, search: string): string {
  if (route.name === 'game') {
    return href(gamePath(route.id));
  }
  if (pathname !== BASE && pathname.endsWith('/')) {
    return pathname.slice(0, -1) + search;
  }
  return pathname + search;
}

/**
 * The route of the current URL. The address bar is set to the canonical form:
 * home for an unknown URL, otherwise the route's canonical URL with the hash kept.
 */
function currentRoute(): Route {
  const { pathname, search, hash } = window.location;
  const parsed = parse(pathname, search);
  if (!parsed) {
    window.history.replaceState(null, '', BASE);
    return { name: 'home' };
  }
  const canonical = canonicalUrl(parsed, pathname, search) + hash;
  if (canonical !== pathname + search + hash) {
    window.history.replaceState(window.history.state, '', canonical);
  }
  return parsed;
}

export const route = $state({ current: currentRoute() });

/** Shows a URL, adding a history entry unless it is the current one. */
function visit(url: string): void {
  if (new URL(url, window.location.href).href === window.location.href) {
    window.history.replaceState(null, '', url);
  } else {
    window.history.pushState(null, '', url);
  }
  route.current = currentRoute();
}

/** Navigates to an app path. */
export function go(path: AppPath): void {
  visit(href(path));
}

window.addEventListener('popstate', () => {
  route.current = currentRoute();
});

/** Whether a click on a link should be left to the browser (new tab, download, and so on). */
function isBrowserClick(event: MouseEvent, link: HTMLAnchorElement): boolean {
  const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
  const otherTarget = link.target !== '' && link.target !== '_self';
  return (
    event.defaultPrevented ||
    event.button !== 0 ||
    modified ||
    otherTarget ||
    link.hasAttribute('download')
  );
}

/** Whether the URL only differs from the current one by its hash: the browser scrolls to the anchor. */
function isHashOnly(url: URL): boolean {
  return (
    url.hash !== '' &&
    url.pathname === window.location.pathname &&
    url.search === window.location.search
  );
}

// Links to an app route navigate in place instead of reloading the page. Any
// other link (a file, the API, another site) is left to the browser.
document.addEventListener('click', (event) => {
  const link = event.target instanceof Element ? event.target.closest('a') : null;
  if (!(link instanceof HTMLAnchorElement) || link.href === '' || isBrowserClick(event, link)) {
    return;
  }
  const url = new URL(link.href);
  if (
    url.origin !== window.location.origin ||
    parse(url.pathname, url.search) === null ||
    isHashOnly(url)
  ) {
    return;
  }
  event.preventDefault();
  visit(url.href);
});
