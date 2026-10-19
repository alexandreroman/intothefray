import {
  bottomRoom,
  chooseCorner,
  cornerRect,
  HOME,
  TABLE_EDGE,
  type Corner,
  type CornerChoice,
} from './focus';

// A 1000 × 800 play area at the top left of the screen, a 300 × 420 panel, and a 40 px zoom control.
const AREA = { left: 0, top: 0, right: 1000, bottom: 800 };
const SIZE = { w: 300, h: 420 };
const CONTROLS = 40;

function choice(extra: Partial<CornerChoice> = {}): CornerChoice {
  return {
    current: HOME,
    area: AREA,
    size: SIZE,
    hovered: null,
    pointer: null,
    controls: CONTROLS,
    taken: [],
    ...extra,
  };
}

describe('cornerRect', () => {
  it('keeps the panel off the edges', () => {
    expect(cornerRect('top-right', AREA, SIZE)).toEqual({
      left: 684,
      top: 12,
      right: 1000 - TABLE_EDGE,
      bottom: 432,
    });
    expect(cornerRect('bottom-left', AREA, SIZE, CONTROLS)).toEqual({
      left: TABLE_EDGE,
      top: 364,
      right: 316,
      bottom: 800 - TABLE_EDGE,
    });
  });

  it('sits right above the controls at home, never over them', () => {
    // 16 px off the bottom, the 40 px control, then 8 px between the control and the panel.
    // Its right edge on the controls' right edge.
    expect(cornerRect(HOME, AREA, SIZE, CONTROLS)).toEqual({
      left: 684,
      top: 316,
      right: 1000 - TABLE_EDGE,
      bottom: 736,
    });
    expect(bottomRoom(HOME, CONTROLS)).toBe(64);
    expect(bottomRoom(HOME, 0)).toBe(16);
    expect(bottomRoom('top-left', CONTROLS)).toBe(0);
  });
});

describe('chooseCorner', () => {
  it('stays bottom right while nothing is under it', () => {
    expect(HOME).toBe('bottom-right');
    expect(chooseCorner(choice({ pointer: { x: 100, y: 100 } }))).toBe(HOME);
  });

  it('moves to the facing corner on the same edge, bottom left, when home is covered', () => {
    const card = { left: 800, top: 500, right: 940, bottom: 696 };
    expect(chooseCorner(choice({ hovered: card }))).toBe('bottom-left');
    expect(chooseCorner(choice({ pointer: { x: 900, y: 600 } }))).toBe('bottom-left');
  });

  it('then top left, then top right, skipping the corners other controls take', () => {
    // A long card across the bottom, then the pointer in the top left corner as well.
    const bottom = { left: 0, top: 600, right: 1000, bottom: 750 };
    expect(chooseCorner(choice({ hovered: bottom }))).toBe('top-left');
    expect(chooseCorner(choice({ hovered: bottom, pointer: { x: 100, y: 100 } }))).toBe(
      'top-right',
    );
    // A long card down the right side, the player selector at the bottom left.
    const right = { left: 700, top: 0, right: 1000, bottom: 800 };
    expect(chooseCorner(choice({ hovered: right, taken: ['bottom-left'] }))).toBe('top-left');
    // No clear corner: it stays where it is.
    const top = { left: 0, top: 50, right: 1000, bottom: 200 };
    expect(
      chooseCorner(
        choice({
          current: 'top-right',
          hovered: top,
          pointer: { x: 900, y: 600 },
          taken: ['bottom-left'],
        }),
      ),
    ).toBe('top-right');
  });

  it('goes back home as soon as it is clear, or when nothing is hovered', () => {
    expect(chooseCorner(choice({ current: 'top-left', pointer: { x: 500, y: 100 } }))).toBe(HOME);
    expect(chooseCorner(choice({ current: 'bottom-left' }))).toBe(HOME);
  });

  it('always takes the first clear corner in that order, wherever it is', () => {
    // A long card across the bottom: from the top right, it goes to the top left.
    const card = { left: 0, top: 600, right: 1000, bottom: 750 };
    expect(
      chooseCorner(choice({ current: 'top-right', hovered: card, pointer: { x: 500, y: 650 } })),
    ).toBe('top-left');
  });

  it('stays where it is when no corner is clear', () => {
    const everywhere = { left: 0, top: 0, right: 1000, bottom: 800 };
    expect(chooseCorner(choice({ current: 'top-left', hovered: everywhere }))).toBe('top-left');
  });

  it('goes home when no corner is clear and a control took the one it is in', () => {
    // In the bottom left corner when the player selector shows up there, over a card that covers everything.
    const everywhere = { left: 0, top: 0, right: 1000, bottom: 800 };
    const taken: Corner[] = ['bottom-left'];
    expect(chooseCorner(choice({ current: 'bottom-left', hovered: everywhere, taken }))).toBe(HOME);
  });

  it('leaves a corner a control took for a clear one', () => {
    // A long card down the right side: bottom left was clear, until the player selector took it.
    const card = { left: 700, top: 0, right: 1000, bottom: 800 };
    expect(
      chooseCorner(choice({ current: 'bottom-left', hovered: card, taken: ['bottom-left'] })),
    ).toBe('top-left');
  });
});
