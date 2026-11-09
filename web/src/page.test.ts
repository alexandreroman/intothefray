// The page around the app on a touch screen: its viewport, the web app manifest that lets a game added to
// the home screen run full screen, no pinch zoom on the table, and card boxes that keep the keyboard down.

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
  it('pans but never pinch-zooms: the table has its own zoom', () => {
    // tokens.css has several touch blocks: the one of the table page is among them.
    const touchBlocks = tokensCss.matchAll(
      /@media \(hover: none\) and \(pointer: coarse\) \{([\s\S]*?)\n\}/g,
    );
    const touchRules = [...touchBlocks].map((block) => block[1]).join('');
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
