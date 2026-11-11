// The page around the app on a touch screen: its viewport, the web app manifest that lets a game added to
// the home screen run full screen, a table page that pinch-zooms on a phone only, and card boxes that keep
// the keyboard down.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen, within } from '@testing-library/svelte';
import indexHtml from '../index.html?raw';
import manifestSource from '../public/manifest.webmanifest?raw';
import { renderPage } from '../seo';
import { DESKTOP, mockScreen, PHONE } from './lib/screen.testing';
import { declarations, hasNoTapHighlight, tokensCss, tokensRule } from './styles/tokens.testing';
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
  });

  it('runs the page under the status bar, which reports the room it takes as the top safe area', () => {
    // With "black", iPadOS 27 draws the status bar over the page and reports no top safe area.
    expect(indexHtml).toContain(
      '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
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

describe('the room at the top of the screen', () => {
  it('is the top safe area, one token for every top inset', () => {
    const root = /^:root \{([^}]*)\}/.exec(tokensCss)?.[1];
    expect(root).toMatch(/--status-room: env\(safe-area-inset-top\);/);
  });

  it("keeps clear of the installed app's status bar blur, 24px past its safe area, where it has one", () => {
    // Marked at launch (main.ts), in either display mode: a browser tab in fullscreen matches
    // (display-mode: fullscreen) too. Apple's status bar alone blurs: an Android camera cutout
    // gets the plain safe area.
    expect(declarations(tokensRule(':root[data-installed][data-status-blur]'))).toEqual([
      '--status-room: calc(env(safe-area-inset-top) + min(24px, env(safe-area-inset-top) * 100))',
    ]);
    // Never a live display-mode query, which a browser tab in fullscreen would match.
    expect(tokensCss).not.toMatch(/@media[^{]*display-mode/);
  });

  it('is read through the token alone, never from env() itself', () => {
    // Test files are left out: they name the env() they check against.
    const root = path.join(import.meta.dirname);
    const offenders = readdirSync(root, { recursive: true, encoding: 'utf8' })
      .filter((file) => /\.(svelte|ts|css)$/.test(file) && !/\.(test|testing)\.ts$/.test(file))
      .filter((file) =>
        readFileSync(path.join(root, file), 'utf8').includes('safe-area-inset-top'),
      );
    expect(offenders).toEqual([path.join('styles', 'tokens.css')]);
  });

  it('keeps the installed app full height, its document at least as tall as the screen', () => {
    // iPadOS shortens the window of a document shorter than the screen by the status bar's height.
    expect(declarations(tokensRule(':root[data-installed]'))).toEqual(['min-height: 100lvh']);
    // Nowhere else: in a browser tab, lvh can be taller than what shows.
    expect(tokensCss.match(/: 100lvh;/g)).toHaveLength(1);
  });
});

describe('the web app manifest', () => {
  const manifest = JSON.parse(manifestSource);

  it('names the app and opens it full screen, in the ink colour', () => {
    expect(manifest.name).toBe('Into the Fray');
    expect(manifest.short_name).toBe('Into the Fray');
    expect(manifest.display).toBe('fullscreen');
    expect(manifest.background_color).toBe('#0d111b');
    expect(manifest.theme_color).toBe('#0d111b');
  });

  it('opens Home from the home screen and keeps to the base path', () => {
    // The home-screen icon opens Home under the base path, not the page added: a game expires.
    expect(manifest.start_url).toBe('./');
    expect(manifest.scope).toBe('./');
  });

  it('offers the logo at 192 and 512 px, once to show whole and once to mask, in separate files', () => {
    // Android crops a maskable icon to the launcher's shape, so its mark keeps to the safe zone;
    // the `any` icons keep the mark at full size. One file per purpose, never "any maskable".
    expect(manifest.icons).toEqual([
      { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ]);
  });
});

describe('the table page on a touch screen', () => {
  it('pans only on a tablet, whose table has its own zoom, and pinch-zooms on a phone (dock mode)', () => {
    // tokens.css has several touch blocks: the one of the table page is among them.
    const touchBlocks = tokensCss.matchAll(
      /@media \(hover: none\) and \(pointer: coarse\) \{([\s\S]*?)\n\}/g,
    );
    const touchRules = [...touchBlocks].map((block) => block[1]).join('');
    expect(touchRules).toMatch(/html\.fixed-screen \{\s*touch-action: pan-x pan-y;\s*\}/);
    expect(touchRules).toMatch(
      /html\.fixed-screen\.dock-screen \{\s*touch-action: manipulation;\s*\}/,
    );
  });

  it('leaves no hover look on the button tapped last, which a touch screen keeps hovered', () => {
    expect(tokensCss).toMatch(/@media \(hover: hover\) \{\s*button:hover/);
    expect(tokensCss).toMatch(/@media \(hover: hover\) \{\s*\.btn-ghost:hover/);
    expect(tokensCss).toMatch(/@media \(hover: hover\) \{\s*\.btn-icon\.accent:hover/);
    expect(tokensCss).toMatch(/@media \(hover: hover\) \{\s*\.btn-primary:hover/);
    // A rule outside any media query starts its line.
    expect(tokensCss).not.toMatch(/^\S*:hover/m);
  });

  it("scales text with the table's CSS zoom: iOS Safari adjusts no text size", () => {
    expect(declarations(tokensRule('html'))).toEqual(
      expect.arrayContaining(['-webkit-text-size-adjust: none', 'text-size-adjust: none']),
    );
  });
});

describe('a press on a touch screen', () => {
  const ENABLED = ":not(:disabled, [aria-disabled='true'], :where([data-indicator] ~ button))";

  it("lays no tap highlight anywhere: the browser's is a square, whatever the rounded corners", () => {
    expect(hasNoTapHighlight()).toBe(true);
  });

  it("gives a pressed button its hover's look, outside any media query, so under a finger too", () => {
    const hover = /button:hover:not\(:disabled, \[aria-disabled='true'\]\) \{([^}]*)\}/.exec(
      tokensCss,
    )?.[1];
    const press = tokensRule(`button:active${ENABLED}`);

    expect(declarations(press)).toEqual([
      'background-color: var(--hover)',
      'border-color: var(--muted)',
    ]);
    expect(declarations(press)).toEqual(declarations(hover));
  });

  it("gives a pressed ghost button its hover's wash", () => {
    const hover = /\.btn-ghost:hover:not\(:disabled, \[aria-disabled='true'\]\) \{([^}]*)\}/.exec(
      tokensCss,
    )?.[1];
    const press = tokensRule(`.btn-ghost:active${ENABLED}`);

    expect(declarations(press)).toEqual([
      'background-color: var(--hover-wash)',
      'border-color: transparent',
      'color: var(--text)',
    ]);
    expect(declarations(press)).toEqual(declarations(hover));
  });

  it("gives a pressed accent icon button its hover's lit edge, over the ghost's", () => {
    const enabled = ":not(:disabled, [aria-disabled='true'])";
    const hover =
      /\.btn-icon\.accent:hover:not\(:disabled, \[aria-disabled='true'\]\) \{([^}]*)\}/.exec(
        tokensCss,
      )?.[1];
    const press = tokensRule(`.btn-icon.accent:active${enabled}`);

    expect(declarations(press)).toEqual(['border-color: var(--sel)', 'color: var(--sel)']);
    expect(declarations(press)).toEqual(declarations(hover));
  });

  it('keeps a pressed primary button transparent: no rectangle shows around its slanted panel', () => {
    expect(tokensRule(".btn-primary:active:not(:disabled, [aria-disabled='true'])")).toContain(
      'background: transparent;',
    );
    // Its own press, the deep red, is on the panel.
    expect(
      tokensRule(".btn-primary:active:not(:disabled, [aria-disabled='true'])::before"),
    ).toContain('background: var(--accent-deep);');
  });

  it('shades no switch option: the sliding indicator is the feedback', () => {
    // Both presses, the standard and the ghost one, leave out the options of a switch, with no
    // weight of their own (:where).
    const presses = tokensCss.match(/^(button|\.btn-ghost):active.*\{$/gm) ?? [];
    expect(presses).toHaveLength(2);
    for (const selector of presses) {
      expect(selector).toContain(':where([data-indicator] ~ button)');
    }
    expect(tokensRule('[data-indicator] ~ button')).not.toMatch(/(background|border-color):/);
    expect(tokensCss).not.toMatch(/\[data-indicator\] ~ button:active/);
  });

  it('brightens a pressed text link, as under the pointer', () => {
    expect(tokensRule('.text-link:active')).toContain('color: var(--text);');
    expect(tokensRule('.text-link:active')).toContain('text-decoration-color: currentColor;');
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
