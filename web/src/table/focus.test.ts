import { chooseCorner, cornerRect, type CornerChoice } from './focus';

// A 1000 × 800 play area at the top left of the screen, and a 300 × 420 panel.
const AREA = { left: 0, top: 0, right: 1000, bottom: 800 };
const SIZE = { w: 300, h: 420 };

function choice(extra: Partial<CornerChoice> = {}): CornerChoice {
  return {
    current: 'top-right',
    area: AREA,
    size: SIZE,
    hovered: null,
    pointer: null,
    taken: ['bottom-right'],
    ...extra,
  };
}

describe('cornerRect', () => {
  it('keeps the panel off the edges', () => {
    expect(cornerRect('top-right', AREA, SIZE)).toEqual({
      left: 686,
      top: 12,
      right: 986,
      bottom: 432,
    });
    expect(cornerRect('bottom-left', AREA, SIZE)).toEqual({
      left: 14,
      top: 364,
      right: 314,
      bottom: 784,
    });
  });
});

describe('chooseCorner', () => {
  it('stays top right while nothing is under it', () => {
    expect(chooseCorner(choice({ pointer: { x: 100, y: 100 } }))).toBe('top-right');
  });

  it('moves away from the hovered card or the pointer, top left first', () => {
    const card = { left: 800, top: 100, right: 940, bottom: 296 };
    expect(chooseCorner(choice({ hovered: card }))).toBe('top-left');
    expect(chooseCorner(choice({ pointer: { x: 900, y: 50 } }))).toBe('top-left');
  });

  it('then bottom left, skipping the corners other controls take', () => {
    // A long card across the top of the area.
    const card = { left: 0, top: 50, right: 1000, bottom: 200 };
    expect(chooseCorner(choice({ hovered: card }))).toBe('bottom-left');
    expect(chooseCorner(choice({ hovered: card, taken: ['bottom-left', 'bottom-right'] }))).toBe(
      'top-right',
    );
    expect(chooseCorner(choice({ hovered: card, taken: [], current: 'top-left' }))).toBe(
      'bottom-left',
    );
  });

  it('goes back to top right as soon as it is clear, or when nothing is hovered', () => {
    expect(chooseCorner(choice({ current: 'top-left', pointer: { x: 500, y: 600 } }))).toBe(
      'top-right',
    );
    expect(chooseCorner(choice({ current: 'bottom-left' }))).toBe('top-right');
  });

  it('keeps the corner it fell back to while top right is still covered', () => {
    // A long card across the top: it fell back to bottom left, and the pointer moves to the left.
    const card = { left: 0, top: 50, right: 1000, bottom: 200 };
    expect(
      chooseCorner(
        choice({ current: 'bottom-left', hovered: card, taken: [], pointer: { x: 950, y: 100 } }),
      ),
    ).toBe('bottom-left');
    // Under the pointer, it leaves for the next clear one.
    expect(
      chooseCorner(
        choice({ current: 'bottom-left', hovered: card, taken: [], pointer: { x: 100, y: 700 } }),
      ),
    ).toBe('bottom-right');
  });

  it('stays where it is when no corner is clear', () => {
    const everywhere = { left: 0, top: 0, right: 1000, bottom: 800 };
    expect(chooseCorner(choice({ current: 'top-left', hovered: everywhere }))).toBe('top-left');
  });
});
