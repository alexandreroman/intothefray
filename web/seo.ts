import type { Plugin } from 'vite';
import { APP_NAME, PREVIEWS, type PreviewPageName } from './src/lib/pages';

/** The site URL of the production build, used when SITE_URL is unset. */
export const DEFAULT_SITE_URL = 'https://intothefray.xyz';

// The size of the share images in public/og.
const IMAGE_WIDTH = 1200;
const IMAGE_HEIGHT = 630;

/** Escapes text for an HTML (or XML) attribute value or element content. */
function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function metaName(name: string, content: string): string {
  return `<meta name="${name}" content="${escapeHtml(content)}" />`;
}

function metaProperty(property: string, content: string): string {
  return `<meta property="${property}" content="${escapeHtml(content)}" />`;
}

/** The JSON-LD of the home page: a free web application, for search engines. */
function webApplicationJsonLd(siteUrl: string): string {
  const json = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: APP_NAME,
    url: `${siteUrl}/`,
    description: PREVIEWS.home.description,
    applicationCategory: 'GameApplication',
    operatingSystem: 'Any',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  });
  // A "</script>" inside the JSON would end the script element early.
  return `<script type="application/ld+json">${json.replaceAll('<', '\\u003c')}</script>`;
}

/**
 * Renders the static HTML of a page from the built index.html: its title, then the tags read by
 * search engines and link previews, which do not run the app. siteUrl is absolute, with the base
 * path and no trailing slash.
 */
export function renderPage(html: string, name: PreviewPageName, siteUrl: string): string {
  const page = PREVIEWS[name];
  const tags = [`<title>${escapeHtml(page.title)}</title>`];
  tags.push(metaName('description', page.description));
  // No canonical URL for a file served at many URLs: link previews must keep the one shared.
  if (page.path !== null) {
    const url = siteUrl + page.path;
    tags.push(`<link rel="canonical" href="${escapeHtml(url)}" />`);
    tags.push(metaProperty('og:url', url));
  }
  tags.push(
    metaProperty('og:type', 'website'),
    metaProperty('og:site_name', APP_NAME),
    metaProperty('og:title', page.ogTitle),
    metaProperty('og:description', page.description),
    metaProperty('og:image', `${siteUrl}/${page.image}`),
    metaProperty('og:image:width', String(IMAGE_WIDTH)),
    metaProperty('og:image:height', String(IMAGE_HEIGHT)),
    metaProperty('og:image:alt', page.imageAlt),
    metaName('twitter:card', 'summary_large_image'),
  );
  if (!page.indexed) {
    tags.push(metaName('robots', 'noindex'));
  }
  if (name === 'home') {
    tags.push(webApplicationJsonLd(siteUrl));
  }

  const title = /<title>[^<]*<\/title>/;
  if (!title.test(html)) {
    throw new Error('index.html has no <title> element');
  }
  // A function replacement: a string one would read "$" in the values as a pattern.
  return html.replace(title, () => tags.join('\n    '));
}

function robotsTxt(siteUrl: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`;
}

/** The sitemap: the indexed pages that have a URL of their own. */
function sitemapXml(siteUrl: string): string {
  const urls = Object.values(PREVIEWS)
    .filter((page) => page.indexed && page.path !== null)
    .map((page) => `  <url><loc>${escapeHtml(siteUrl + page.path)}</loc></url>`);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

/**
 * Writes the pages that link previews and search engines read, from the final index.html: the home
 * page, the game page (g/index.html), 404.html (the home page without its canonical URL: GitHub
 * Pages serves it for any other URL, so the app still starts there), robots.txt and sitemap.xml.
 * siteUrl is the absolute URL of the site, base path included.
 */
export function seo(siteUrl: string): Plugin {
  const site = siteUrl.replace(/\/+$/, '');
  if (!URL.canParse(site)) {
    throw new Error(`SITE_URL is not an absolute URL: "${siteUrl}"`);
  }
  return {
    name: 'seo',
    apply: 'build',
    // After Vite's own HTML plugin, so index.html carries its bundle tags.
    enforce: 'post',
    generateBundle(_options, bundle) {
      const index = bundle['index.html'];
      if (index?.type !== 'asset' || typeof index.source !== 'string') {
        this.error('index.html is missing from the bundle');
      }
      const source = index.source;
      index.source = renderPage(source, 'home', site);
      this.emitFile({
        type: 'asset',
        fileName: 'g/index.html',
        source: renderPage(source, 'game', site),
      });
      this.emitFile({
        type: 'asset',
        fileName: '404.html',
        source: renderPage(source, 'notFound', site),
      });
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robotsTxt(site) });
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemapXml(site) });
    },
  };
}
