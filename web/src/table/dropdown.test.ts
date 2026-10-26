import { MENU_EDGE, MENU_INSET, placeAtPoint, placeSubmenu, placeUnder } from './dropdown';

// A 1000 × 800 room at the top left of the screen, and a 200 × 300 menu.
const ROOM = { left: 0, top: 0, right: 1000, bottom: 800 };
const SIZE = { w: 200, h: 300 };

describe('placeAtPoint', () => {
  it('opens with its top left corner at the pointer', () => {
    expect(placeAtPoint({ x: 400, y: 200 }, SIZE, ROOM)).toEqual({
      left: 400,
      top: 200,
      maxHeight: null,
    });
  });

  it('flips left and up near the right and bottom edges', () => {
    expect(placeAtPoint({ x: 900, y: 700 }, SIZE, ROOM)).toEqual({
      left: 900 - 200,
      top: 700 - 300,
      maxHeight: null,
    });
  });

  it('is cut to the roomier side when it fits neither way', () => {
    const tall = { w: 200, h: 700 };
    expect(placeAtPoint({ x: 400, y: 300 }, tall, ROOM)).toEqual({
      left: 400,
      top: 300,
      maxHeight: 800 - MENU_EDGE - 300,
    });
    expect(placeAtPoint({ x: 400, y: 500 }, tall, ROOM)).toEqual({
      left: 400,
      top: MENU_EDGE,
      maxHeight: 500 - MENU_EDGE,
    });
  });

  it('keeps off the left edge when the pointer is right by it', () => {
    expect(placeAtPoint({ x: 3, y: 200 }, SIZE, ROOM).left).toBe(MENU_EDGE);
    const inset = { left: 100, top: 0, right: 1000, bottom: 800 };
    expect(placeAtPoint({ x: 104, y: 200 }, SIZE, inset).left).toBe(100 + MENU_EDGE);
    // Past the edge, it opens at the pointer.
    expect(placeAtPoint({ x: MENU_EDGE + 1, y: 200 }, SIZE, ROOM).left).toBe(MENU_EDGE + 1);
  });

  it('stays inside the room when it fits on neither side of the pointer', () => {
    const narrow = { left: 0, top: 0, right: 300, bottom: 800 };
    expect(placeAtPoint({ x: 150, y: 100 }, SIZE, narrow).left).toBe(300 - MENU_EDGE - 200);
  });
});

describe('placeSubmenu', () => {
  const menu = { left: 300, top: 100, right: 500, bottom: 400 };
  const row = { left: 305, top: 200, right: 495, bottom: 234 };

  it('opens right of its menu, its first item level with its row', () => {
    expect(placeSubmenu(menu, row, SIZE, ROOM)).toEqual({
      left: 500,
      top: 200 - MENU_INSET,
      maxHeight: null,
    });
  });

  it('opens left of its menu when there is no room on the right', () => {
    const right = { left: 700, top: 100, right: 900, bottom: 400 };
    expect(placeSubmenu(right, row, SIZE, ROOM).left).toBe(700 - 200);
  });

  it('moves up to stay inside the room, and is cut when taller than it', () => {
    const low = { left: 305, top: 700, right: 495, bottom: 734 };
    expect(placeSubmenu(menu, low, SIZE, ROOM).top).toBe(800 - MENU_EDGE - 300);
    expect(placeSubmenu(menu, low, { w: 200, h: 900 }, ROOM)).toEqual({
      left: 500,
      top: MENU_EDGE,
      maxHeight: 800 - 2 * MENU_EDGE,
    });
  });
});

describe('placeUnder', () => {
  // A 100 × 30 button, and the gap between it and its menu.
  const GAP = 4;
  function button(left: number, top: number) {
    return { left, top, right: left + 100, bottom: top + 30 };
  }

  it('opens under its button, their left edges lined up', () => {
    expect(placeUnder(button(400, 200), SIZE, ROOM, GAP)).toEqual({
      left: 400,
      top: 200 + 30 + GAP,
      maxHeight: null,
    });
  });

  it('opens above its button when there is no room below', () => {
    expect(placeUnder(button(400, 600), SIZE, ROOM, GAP)).toEqual({
      left: 400,
      top: 600 - GAP - 300,
      maxHeight: null,
    });
  });

  it('is cut to the roomier side when it fits neither way', () => {
    const tall = { w: 200, h: 700 };
    expect(placeUnder(button(400, 300), tall, ROOM, GAP)).toEqual({
      left: 400,
      top: 300 + 30 + GAP,
      maxHeight: 800 - MENU_EDGE - (300 + 30 + GAP),
    });
    expect(placeUnder(button(400, 500), tall, ROOM, GAP)).toEqual({
      left: 400,
      top: MENU_EDGE,
      maxHeight: 500 - GAP - MENU_EDGE,
    });
  });

  it('lines up with the right edge of its button near the right edge of the room', () => {
    expect(placeUnder(button(850, 200), SIZE, ROOM, GAP).left).toBe(850 + 100 - 200);
  });

  it('stays inside the room when it fits on neither side of its button', () => {
    const narrow = { left: 0, top: 0, right: 300, bottom: 800 };
    expect(placeUnder(button(100, 200), SIZE, narrow, GAP).left).toBe(300 - MENU_EDGE - 200);
    // Wider than the room, it keeps its left side in.
    const wide = { w: 400, h: 300 };
    expect(placeUnder(button(100, 200), wide, narrow, GAP).left).toBe(MENU_EDGE);
  });
});
