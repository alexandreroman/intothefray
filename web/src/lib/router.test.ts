import { go, href, route } from './router.svelte';

// Lands on a URL, as a page load or back/forward does, then tells the router.
function navigate(path: string): void {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** Goes back one history entry and waits until the router has seen it. */
function back(): Promise<void> {
  return new Promise((resolve) => {
    // Added after the router's own listener, so it runs once the route is updated.
    window.addEventListener('popstate', () => resolve(), { once: true });
    window.history.back();
  });
}

function addLink(url: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = url;
  link.textContent = 'link';
  document.body.append(link);
  return link;
}

/** Clicks the element and tells whether the router intercepted the click. */
function click(target: Element, init: MouseEventInit = {}): boolean {
  let intercepted = false;
  // The window sees the click after the router's document listener. Cancelling it
  // there keeps jsdom from attempting (and logging) a real page navigation.
  window.addEventListener(
    'click',
    (event) => {
      intercepted = event.defaultPrevented;
      event.preventDefault();
    },
    { once: true },
  );
  target.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init }),
  );
  return intercepted;
}

afterEach(() => {
  document.body.replaceChildren();
  navigate('/');
});

describe('router', () => {
  it('parses /g/abc', () => {
    navigate('/g/abc');
    expect(route.current).toEqual({ name: 'game', id: 'abc' });
  });

  it('decodes the game id', () => {
    navigate('/g/a%20b');
    expect(route.current).toEqual({ name: 'game', id: 'a b' });
  });

  it('parses the home and options routes', () => {
    navigate('/options');
    expect(route.current).toEqual({ name: 'options' });
    navigate('/');
    expect(route.current).toEqual({ name: 'home' });
  });

  it('drops one trailing slash from a route', () => {
    navigate('/options/');
    expect(route.current).toEqual({ name: 'options' });
    expect(window.location.pathname).toBe('/options');

    navigate('/g/abc/');
    expect(route.current).toEqual({ name: 'game', id: 'abc' });
    expect(window.location.pathname).toBe('/g/abc');
  });

  it('falls back to home on an unknown path and replaces the URL', () => {
    navigate('/options');
    navigate('/nowhere');
    expect(route.current).toEqual({ name: 'home' });
    expect(window.location.pathname).toBe('/');
  });

  it('falls back to home on an empty game id', () => {
    navigate('/g/');
    expect(route.current).toEqual({ name: 'home' });
    expect(window.location.pathname).toBe('/');
  });

  it('falls back to home on a malformed escape', () => {
    navigate('/g/%E0%A4%A');
    expect(route.current).toEqual({ name: 'home' });
    expect(window.location.pathname).toBe('/');
  });

  it('follows the history back', async () => {
    go('/options');
    go('/g/abc');
    await back();
    expect(window.location.pathname).toBe('/options');
    expect(route.current).toEqual({ name: 'options' });
  });

  it('go pushes the path and updates the route', () => {
    const length = window.history.length;
    go('/options');
    expect(window.location.pathname).toBe('/options');
    expect(route.current).toEqual({ name: 'options' });
    expect(window.history.length).toBe(length + 1);
  });

  it('go to the current URL adds no history entry', () => {
    go('/options');
    const length = window.history.length;
    go('/options');
    expect(window.history.length).toBe(length);
  });

  it('href prefixes the base path', () => {
    expect(href('/')).toBe('/');
    expect(href('/g/abc')).toBe('/g/abc');
  });

  it('navigates in place on a click on an app link', () => {
    expect(click(addLink(href('/g/abc')))).toBe(true);
    expect(window.location.pathname).toBe('/g/abc');
    expect(route.current).toEqual({ name: 'game', id: 'abc' });
  });

  it('navigates on a click on an element inside an app link', () => {
    const icon = document.createElement('span');
    addLink(href('/options')).append(icon);
    expect(click(icon)).toBe(true);
    expect(route.current).toEqual({ name: 'options' });
  });

  it('leaves modified clicks to the browser', () => {
    expect(click(addLink(href('/options')), { metaKey: true })).toBe(false);
    expect(route.current).toEqual({ name: 'home' });
  });

  it('leaves a click already handled to its handler', () => {
    const link = addLink(href('/options'));
    link.addEventListener('click', (event) => event.preventDefault());
    click(link);
    expect(window.location.pathname).toBe('/');
    expect(route.current).toEqual({ name: 'home' });
  });

  it('leaves links to another origin, target or download to the browser', () => {
    const external = addLink('https://example.com/options');
    const newTab = addLink(href('/options'));
    newTab.target = '_blank';
    const download = addLink(href('/options'));
    download.setAttribute('download', '');

    for (const link of [external, newTab, download]) {
      expect(click(link)).toBe(false);
    }
    expect(route.current).toEqual({ name: 'home' });
  });

  it('leaves same-origin links that are no app route to the browser', () => {
    expect(click(addLink('/packs/en/index.json'))).toBe(false);
    expect(click(addLink('/api/games'))).toBe(false);
    expect(window.location.pathname).toBe('/');
  });

  it('leaves a hash-only link to the browser', () => {
    go('/options');
    expect(click(addLink('#rules'))).toBe(false);
    expect(window.location.pathname).toBe('/options');
  });

  it('leaves an SVG link to the browser', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const link = document.createElementNS('http://www.w3.org/2000/svg', 'a');
    link.setAttribute('href', href('/options'));
    svg.append(link);
    document.body.append(svg);

    expect(click(link)).toBe(false);
    expect(route.current).toEqual({ name: 'home' });
  });
});
