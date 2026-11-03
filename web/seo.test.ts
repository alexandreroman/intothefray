// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'vite';
import { renderPage } from './seo';
import { PREVIEWS } from './src/lib/pages';

const SITE = 'https://example.test';

const SOURCE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Into the Fray</title>
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>
`;

describe('the page metadata', () => {
  it('says the project is unofficial in every preview', () => {
    for (const page of Object.values(PREVIEWS)) {
      expect(page.description).toContain('An unofficial fan project.');
    }
  });
});

describe('renderPage', () => {
  it('gives the home page its title, description, canonical URL and share preview', () => {
    const html = renderPage(SOURCE, 'home', SITE);

    expect(html).toContain('<title>Into the Fray · Play Marvel Champions in your browser</title>');
    expect(html).not.toContain('<title>Into the Fray</title>');
    expect(html).toContain(`<meta name="description" content="${PREVIEWS.home.description}" />`);
    expect(html).toContain('<link rel="canonical" href="https://example.test/" />');
    expect(html).toContain('<meta property="og:type" content="website" />');
    expect(html).toContain('<meta property="og:site_name" content="Into the Fray" />');
    expect(html).toContain('<meta property="og:url" content="https://example.test/" />');
    expect(html).toContain(
      '<meta property="og:title" content="Into the Fray · Play Marvel Champions in your browser" />',
    );
    expect(html).toContain(
      `<meta property="og:description" content="${PREVIEWS.home.description}" />`,
    );
    expect(html).toContain(
      '<meta property="og:image" content="https://example.test/og/home.png" />',
    );
    expect(html).toContain('<meta property="og:image:width" content="1200" />');
    expect(html).toContain('<meta property="og:image:height" content="630" />');
    expect(html).toContain('<meta property="og:image:alt" content="');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(html).not.toContain('name="robots"');
  });

  it('describes the home page as a free web application in JSON-LD', () => {
    const html = renderPage(SOURCE, 'home', SITE);

    const json = /<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)?.[1];
    expect(json).toBeDefined();
    expect(JSON.parse(json!)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'Into the Fray',
      url: 'https://example.test/',
      description: PREVIEWS.home.description,
      applicationCategory: 'GameApplication',
      operatingSystem: 'Any',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    });
  });

  it('gives the game page the invite preview, no canonical URL and noindex', () => {
    const html = renderPage(SOURCE, 'game', SITE);

    expect(html).toContain('<title>Game · Into the Fray</title>');
    expect(html).toContain('<meta property="og:title" content="Join an Into the Fray game" />');
    expect(html).toContain(
      `<meta property="og:description" content="${PREVIEWS.game.description}" />`,
    );
    expect(html).toContain(
      '<meta property="og:image" content="https://example.test/og/invite.png" />',
    );
    expect(html).toContain('<meta name="robots" content="noindex" />');
    // Each game has its own URL: a fixed one would send previews and crawlers to /g/ alone.
    expect(html).not.toContain('rel="canonical"');
    expect(html).not.toContain('og:url');
    expect(html).not.toContain('application/ld+json');
  });

  it('gives the 404 page the home preview without a canonical URL, served at many URLs', () => {
    const html = renderPage(SOURCE, 'notFound', SITE);

    expect(html).toContain('<title>Into the Fray · Play Marvel Champions in your browser</title>');
    expect(html).toContain(
      '<meta property="og:title" content="Into the Fray · Play Marvel Champions in your browser" />',
    );
    expect(html).toContain(
      '<meta property="og:image" content="https://example.test/og/home.png" />',
    );
    // A shared /about or /options link must not turn into a link to the home page.
    expect(html).not.toContain('rel="canonical"');
    expect(html).not.toContain('og:url');
    expect(html).not.toContain('name="robots"');
    expect(html).not.toContain('application/ld+json');
  });

  it('keeps the rest of the page', () => {
    const html = renderPage(SOURCE, 'game', SITE);

    expect(html).toContain('<meta charset="UTF-8" />');
    expect(html).toContain('<div id="app"></div>');
  });

  it('escapes the values it writes', () => {
    const html = renderPage(SOURCE, 'home', 'https://example.test/a&b"c</script>');

    expect(html).toContain(
      '<link rel="canonical" href="https://example.test/a&amp;b&quot;c&lt;/script&gt;/" />',
    );
    expect(html).toContain('"url":"https://example.test/a&b\\"c\\u003c/script>/"');
    expect(html.match(/<\/script>/g)).toHaveLength(1);
  });

  it('fails on a page without a title', () => {
    expect(() => renderPage('<html><head></head></html>', 'home', SITE)).toThrow(/<title>/);
  });
});

describe('the build', () => {
  let outDir: string;

  /** The text of a built file. */
  function read(file: string): string {
    return fs.readFileSync(path.join(outDir, file), 'utf8');
  }

  beforeAll(async () => {
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'itf-seo-'));
    // A trailing slash, as a careless setting would have: the build drops it.
    vi.stubEnv('SITE_URL', 'https://example.test/');
    await build({
      root: import.meta.dirname,
      logLevel: 'silent',
      build: { outDir, emptyOutDir: true },
    });
  }, 60_000);

  afterAll(() => {
    vi.unstubAllEnvs();
    fs.rmSync(outDir, { recursive: true, force: true });
  });

  it('writes the home page with its preview, after the bundle tags', () => {
    const html = read('index.html');

    expect(html).toContain('<title>Into the Fray · Play Marvel Champions in your browser</title>');
    expect(html).toContain('<link rel="canonical" href="https://example.test/" />');
    expect(html).toContain('application/ld+json');
    expect(html).toMatch(/<script type="module" crossorigin src="\/assets\/[^"]+\.js"><\/script>/);
  });

  it('writes the game page', () => {
    const html = read('g/index.html');
    expect(html).toContain('<meta property="og:title" content="Join an Into the Fray game" />');
    expect(html).toContain('<meta name="robots" content="noindex" />');
  });

  it('writes the 404 page, the home page without its canonical URL', () => {
    const html = read('404.html');
    expect(html).toContain('<title>Into the Fray · Play Marvel Champions in your browser</title>');
    expect(html).toContain(
      '<meta property="og:image" content="https://example.test/og/home.png" />',
    );
    expect(html).not.toContain('rel="canonical"');
  });

  it('writes no page for about and options: they reach the app through 404.html', () => {
    expect(fs.existsSync(path.join(outDir, 'about.html'))).toBe(false);
    expect(fs.existsSync(path.join(outDir, 'options.html'))).toBe(false);
  });

  it('links the touch icon and tells what the app is without JavaScript on every page', () => {
    for (const file of ['index.html', 'g/index.html', '404.html']) {
      const html = read(file);
      expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />');
      const noscript = /<noscript>(.*?)<\/noscript>/s.exec(html)?.[1] ?? '';
      // Compared with its line breaks collapsed: index.html wraps the text.
      expect(noscript.replace(/\s+/g, ' ')).toContain(PREVIEWS.home.description);
    }
  });

  it('publishes the share images and the touch icon', () => {
    for (const file of ['og/home.png', 'og/invite.png', 'apple-touch-icon.png']) {
      expect(fs.existsSync(path.join(outDir, file))).toBe(true);
    }
  });

  it('writes robots.txt and a sitemap of the home page', () => {
    expect(read('robots.txt')).toBe(
      'User-agent: *\nAllow: /\n\nSitemap: https://example.test/sitemap.xml\n',
    );
    const sitemap = read('sitemap.xml');
    expect(sitemap.match(/<loc>[^<]*<\/loc>/g)).toEqual(['<loc>https://example.test/</loc>']);
  });
});
