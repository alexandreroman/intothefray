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
  // Home lies at 684–984 × 316–736; the bottom left corner at 16–316 × 364–784.
  const UNDER_HOME = { left: 800, top: 500, right: 940, bottom: 696 };

  it('stays bottom right while nothing is hovered', () => {
    expect(HOME).toBe('bottom-right');
    expect(chooseCorner(choice())).toBe(HOME);
  });

  it('stays home when it hides only part of the hovered card', () => {
    // Half of the card sticks out of the panel, to its left.
    const partly = { left: 600, top: 500, right: 740, bottom: 696 };
    expect(chooseCorner(choice({ hovered: partly }))).toBe(HOME);
  });

  it('moves to the facing corner, bottom left, when it would hide the whole hovered card', () => {
    expect(chooseCorner(choice({ hovered: UNDER_HOME }))).toBe('bottom-left');
  });

  it('counts only what shows of the card in the play area', () => {
    // Entirely out of the play area: nothing of it shows, nothing to hide.
    const outside = { left: 1100, top: 500, right: 1240, bottom: 696 };
    expect(chooseCorner(choice({ hovered: outside }))).toBe(HOME);
  });

  it('then top left, then top right, skipping the corners other controls take', () => {
    // The hero selector takes the bottom left: the next is the top left.
    expect(chooseCorner(choice({ hovered: UNDER_HOME, taken: ['bottom-left'] }))).toBe('top-left');
    // A small card in the overlap of home and the top right panel (684–984 × 12–432):
    // the bottom left is taken, the top left is clear.
    const small = { left: 700, top: 330, right: 760, bottom: 400 };
    expect(chooseCorner(choice({ hovered: small, taken: ['bottom-left'] }))).toBe('top-left');
  });

  it('goes back home as soon as it is clear', () => {
    expect(chooseCorner(choice({ current: 'top-left' }))).toBe(HOME);
    const partly = { left: 600, top: 500, right: 740, bottom: 696 };
    expect(chooseCorner(choice({ current: 'bottom-left', hovered: partly }))).toBe(HOME);
  });

  it('stays where it is when no corner is clear', () => {
    // A panel as large as the play area hides the card from every corner.
    const huge = { w: 1000, h: 800 };
    const card = { left: 400, top: 300, right: 540, bottom: 496 };
    expect(chooseCorner(choice({ current: 'top-left', size: huge, hovered: card }))).toBe(
      'top-left',
    );
  });

  it('goes home when no corner is clear and a control took the one it is in', () => {
    const huge = { w: 1000, h: 800 };
    const card = { left: 400, top: 300, right: 540, bottom: 496 };
    const taken: Corner[] = ['bottom-left'];
    expect(chooseCorner(choice({ current: 'bottom-left', size: huge, hovered: card, taken }))).toBe(
      HOME,
    );
  });
});
