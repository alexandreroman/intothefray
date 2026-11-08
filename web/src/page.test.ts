// The page around the app on a touch screen: its viewport, the web app manifest that lets a game added to
// the home screen run full screen, no pinch zoom on the table, and card boxes that keep the keyboard down.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen, within } from '@testing-library/svelte';
import indexHtml from '../index.html?raw';
import manifestSource from '../public/manifest.webmanifest?raw';
import { renderPage } from '../seo';
import { DESKTOP, mockScreen, PHONE } from './lib/screen.testing';
import CardBox from './table/CardBox.svelte';
import { card, pile, playingView } from './table/fixtures.testing';

describe('the page', () => {
  it('draws under the notch and the home indicator: the app keeps to the safe areas itself', () => {
    const viewport = /<meta name="viewport" content="([^"]*)"/.exec(indexHtml)?.[1];
    expect(viewport?.split(',').map((part) => part.trim())).toContain('viewport-fit=cover');
  });

  it('links the web app manifest under the base path and runs full screen from the home screen', () => {
    expect(indexHtml).toContain('<link rel="manifest" href="%BASE_URL%manifest.webmanifest" />');
    expect(indexHtml).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />');
    expect(indexHtml).toContain('<meta name="mobile-web-app-capable" content="yes" />');
    expect(indexHtml).toContain(
      '<meta name="apple-mobile-web-app-status-bar-style" content="black" />',
    );
  });

  it('keeps the manifest link and the home screen tags on every page the build writes', () => {
    for (const name of ['home', 'game', 'notFound'] as const) {
      const html = renderPage(indexHtml, name, 'https://example.test');
      expect(html).toContain('<link rel="manifest" href="%BASE_URL%manifest.webmanifest" />');
      expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />');
      expect(html).toContain('viewport-fit=cover');
    }
  });
});

describe('the web app manifest', () => {
  const manifest = JSON.parse(manifestSource);

  it('names the app and opens it standalone, in the ink colour', () => {
    expect(manifest.name).toBe('Into the Fray');
    expect(manifest.short_name).toBe('Into the Fray');
    expect(manifest.display).toBe('standalone');
    expect(manifest.background_color).toBe('#0d111b');
    expect(manifest.theme_color).toBe('#0d111b');
  });

  it('opens Home from the home screen and keeps to the base path', () => {
    // The home-screen icon opens Home under the base path, not the page added: a game expires.
    expect(manifest.start_url).toBe('./');
    expect(manifest.scope).toBe('./');
  });

  it('offers the logo at 192 and 512 px, uncropped: it has no room for a maskable safe zone', () => {
    expect(manifest.icons).toEqual([
      { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ]);
  });
});

describe('the table page on a touch screen', () => {
  // Read from the disk: Vitest hands a stylesheet over empty, even raw.
  const tokensCss = readFileSync(path.join(import.meta.dirname, 'styles/tokens.css'), 'utf8');

  it('pans but never pinch-zooms: the table has its own zoom', () => {
    const touchRules = /@media \(hover: none\) and \(pointer: coarse\) \{([\s\S]*?)\n\}/.exec(
      tokensCss,
    )?.[1];
    expect(touchRules).toMatch(/html\.fixed-screen \{\s*touch-action: pan-x pan-y;\s*\}/);
  });

  it('leaves no hover look on the button tapped last, which a touch screen keeps hovered', () => {
    expect(tokensCss).toMatch(/@media \(hover: hover\) \{\s*button:hover/);
    expect(tokensCss).toMatch(/@media \(hover: hover\) \{\s*\.btn-ghost:hover/);
    expect(tokensCss).toMatch(/@media \(hover: hover\) \{\s*\.btn-primary:hover/);
    // A rule outside any media query starts its line.
    expect(tokensCss).not.toMatch(/^\S*:hover/m);
  });
});

describe('a card box', () => {
  function renderBox() {
    const view = playingView({
      table: {
        cards: [card('c1', { zone: 'pile' }), card('c2', { zone: 'pile' })],
        piles: [pile('deck:p0', { owner: 0, x: 600 })],
        hands: { p0: [] },
        stages: [],
      },
    });
    const [deck] = view.table?.piles ?? [];
    if (!deck) {
      throw new Error('no deck');
    }
    render(CardBox, {
      box: { kind: 'pile', pile: deck, mode: 'search', cards: ['c1', 'c2'] },
      view,
      facesOf: () => [],
      englishName: () => undefined,
      sizeOf: () => 'std',
      readOnly: false,
      selected: null,
      act: () => null,
      lastError: null,
      onclose: () => {},
      tileWidth: 185,
    });
    return within(screen.getByRole('dialog')).getByRole('textbox', { name: 'Filter by name' });
  }

  it('opens with the focus in its filter for a mouse', () => {
    mockScreen(DESKTOP);
    const filter = renderBox();
    expect(document.activeElement).toBe(filter);
  });

  it('keeps the focus out of its filter in touch mode, so no keyboard pops up over the cards', () => {
    mockScreen(PHONE);
    const filter = renderBox();
    expect(document.activeElement).not.toBe(filter);
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });
});
