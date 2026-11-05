// The owner frames and their piles in dock mode (spec 3.6): drawn at 60 %, about the frame's
// top-left corner, while the name line and the chips stay where they are.
import { render } from '@testing-library/svelte';
import type { PileView as TablePile } from '../lib/types';
import { DOCK_MODE_KEY } from './dockMode';
import { pile } from './fixtures.testing';
import { ownerFrames } from './layout';
import Surface, { type OwnerBox } from './Surface.svelte';
import surfaceSource from './Surface.svelte?raw';

const PILES: TablePile[] = [
  pile('encounter', { kind: 'encounter', owner: -1, x: 0, y: 70, count: 20 }),
  pile('encounterDiscard', { kind: 'encounterDiscard', owner: -1, x: 130, y: 70, count: 2 }),
  pile('elsewhere', { kind: 'deck', owner: 3, x: 500, y: 700, count: 5 }),
];

// The villain's frame is { x: -10, y: 60, w: 262, h: 177 }; the deck of owner 3 has none here.
const OWNERS: OwnerBox[] = [
  {
    frame: ownerFrames(PILES)[0]!,
    name: 'Villain',
    color: 'var(--villain)',
    outOfPlay: [{ kind: 'victory', pile: 'victory', label: 'Victory display', count: 1 }],
  },
];

function renderSurface(dock: boolean) {
  return render(Surface, {
    props: {
      cards: [],
      piles: PILES,
      owners: OWNERS,
      topOf: () => undefined,
      faceOf: () => null,
      captionOf: () => undefined,
      onbrowse: () => {},
      width: 1000,
      height: 1000,
      markers: {},
    },
    context: new Map([[DOCK_MODE_KEY, { current: dock }]]),
  });
}

function element(container: HTMLElement, selector: string): HTMLElement {
  const found = container.querySelector<HTMLElement>(selector);
  if (!found) {
    throw new Error(`no ${selector}`);
  }
  return found;
}

/** The left, top, width and height an element is drawn at, in table units. */
function placed(el: HTMLElement): number[] {
  return [el.style.left, el.style.top, el.style.width, el.style.height].map(Number.parseFloat);
}

function expectPlaced(el: HTMLElement, expected: number[]): void {
  const actual = placed(el);
  expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, 6));
}

describe('Surface in dock mode', () => {
  it('draws each owner frame at 60 % from its top-left corner', () => {
    const { container } = renderSurface(true);

    expectPlaced(element(container, '.ownerbox'), [-10, 60, 157.2, 106.2]);
  });

  it('draws the piles of a frame at 60 %, about its top-left corner, as their hit areas', () => {
    const { container } = renderSurface(true);

    // Deck: -10 + 10 × 0.6, 60 + 10 × 0.6; discard: -10 + 140 × 0.6.
    expectPlaced(element(container, '.pile[data-id="encounter"]'), [-4, 66, 67.2, 94.2]);
    expectPlaced(element(container, '.pile[data-id="encounterDiscard"]'), [74, 66, 67.2, 94.2]);
  });

  it('draws a pile outside any frame where it lies, full size', () => {
    const { container } = renderSurface(true);

    expectPlaced(element(container, '.pile[data-id="elsewhere"]'), [500, 700, 112, 157]);
  });

  it('keeps the chips where they are, over the frame width as it would be at full size', () => {
    const { container } = renderSurface(true);

    const chips = element(container, '.chips');
    expect(chips.style.left).toBe('-10px');
    expect(chips.style.top).toBe('60px');
    expect(chips.style.getPropertyValue('--frame-w')).toBe('262px');
  });

  it('lets the owner name use up to the full-size frame width', () => {
    const { container } = renderSurface(true);

    const box = element(container, '.ownerbox');
    expect(box.style.getPropertyValue('--name-room')).toBe('262px');
    const owner = /\n {2}\.owner \{([^}]*)\}/.exec(surfaceSource)?.[1];
    expect(owner).toMatch(/max-width: max\(\s*calc\(var\(--name-room, 100%\) - /);
  });
});

describe('Surface out of dock mode', () => {
  it('draws the frames and their piles full size', () => {
    const { container } = renderSurface(false);

    const box = element(container, '.ownerbox');
    expectPlaced(box, [-10, 60, 262, 177]);
    expect(box.style.getPropertyValue('--name-room')).toBe('');
    expectPlaced(element(container, '.pile[data-id="encounter"]'), [0, 70, 112, 157]);
    expectPlaced(element(container, '.pile[data-id="encounterDiscard"]'), [130, 70, 112, 157]);
    expect(element(container, '.chips').style.getPropertyValue('--frame-w')).toBe('262px');
  });
});
