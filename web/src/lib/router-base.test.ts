import { navigate } from './router.testing';

// The router under a sub-path, as on GitHub Pages. A file of its own: the
// router reads the base once, when the module loads.
vi.stubEnv('BASE_URL', '/intothefray/');
window.history.replaceState(null, '', '/intothefray/nowhere');
const { gamePath, go, href, route } = await import('./router.svelte');

afterAll(() => {
  vi.unstubAllEnvs();
});

describe('router under a base path', () => {
  it('replaces an unknown URL with the base at startup', () => {
    expect(route.current).toEqual({ name: 'home' });
    expect(window.location.pathname).toBe('/intothefray/');
  });

  it('prefixes app paths with the base', () => {
    expect(href('/')).toBe('/intothefray/');
    expect(href(gamePath('abc'))).toBe('/intothefray/g/?id=abc');
  });

  it('parses paths under the base', () => {
    go(gamePath('abc'));
    expect(window.location.pathname + window.location.search).toBe('/intothefray/g/?id=abc');
    expect(route.current).toEqual({ name: 'game', id: 'abc' });
  });

  it('sends a game id in the path home', () => {
    navigate('/intothefray/g/abc');
    expect(route.current).toEqual({ name: 'home' });
    expect(window.location.pathname).toBe('/intothefray/');
  });

  it('sends a game URL without an id home', () => {
    navigate('/intothefray/g/?id=');
    expect(route.current).toEqual({ name: 'home' });
    expect(window.location.pathname + window.location.search).toBe('/intothefray/');
  });

  it('sends the base without its trailing slash home', () => {
    navigate('/intothefray');
    expect(route.current).toEqual({ name: 'home' });
    expect(window.location.pathname).toBe('/intothefray/');
  });

  it('falls back to home outside the base', () => {
    navigate('/options');
    expect(route.current).toEqual({ name: 'home' });
    expect(window.location.pathname).toBe('/intothefray/');
  });

  it('leaves a same-origin link outside the base to the browser', () => {
    const link = document.createElement('a');
    link.href = '/options';
    document.body.append(link);
    let intercepted = false;
    // Seen after the router's listener; cancelling it keeps jsdom from navigating.
    window.addEventListener(
      'click',
      (event) => {
        intercepted = event.defaultPrevented;
        event.preventDefault();
      },
      { once: true },
    );

    link.click();

    expect(intercepted).toBe(false);
    expect(window.location.pathname).toBe('/intothefray/');
  });
});
