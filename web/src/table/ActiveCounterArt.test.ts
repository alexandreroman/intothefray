import { render, screen } from '@testing-library/svelte';
import ActiveCounterArt from './ActiveCounterArt.svelte';

beforeEach(() => {
  localStorage.clear();
});

function token(): SVGElement {
  return screen.getByRole('img', { name: 'Active counter' }) as unknown as SVGElement;
}

/** The words of the drawn roundel, written on its arcs. */
function arcWords(): string[] {
  return [...token().querySelectorAll('textPath')].map((textPath) => textPath.textContent ?? '');
}

describe('ActiveCounterArt', () => {
  it("draws the comic bubble of the stored theme's printed token by default", () => {
    render(ActiveCounterArt);
    expect(token().tagName.toLowerCase()).toBe('svg');
    expect(token().textContent).toContain('ACTIVE');
    expect(arcWords()).toEqual([]);
  });

  it('draws the comic bubble of an explicit theme over the stored one', () => {
    localStorage.setItem('itf-theme', 'minimal');
    render(ActiveCounterArt, { theme: 'felt' });
    expect(token().textContent).toContain('ACTIVE');
    expect(arcWords()).toEqual([]);
  });

  it('draws the ink roundel, ACTIVE above and VILLAIN below, on a theme without images', () => {
    render(ActiveCounterArt, { theme: 'minimal' });
    expect(token().tagName.toLowerCase()).toBe('svg');
    expect(arcWords()).toEqual(['ACTIVE', 'VILLAIN']);
  });

  it('names the defs of each token apart, so that two can show at once', () => {
    for (const theme of ['official', 'official', 'minimal', 'minimal'] as const) {
      render(ActiveCounterArt, { theme });
    }
    const ids = [...document.querySelectorAll('[id]')].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const textPath of document.querySelectorAll('textPath')) {
      expect(ids).toContain(textPath.getAttribute('href')?.slice(1));
    }
  });
});
