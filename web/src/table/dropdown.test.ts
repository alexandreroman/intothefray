import { MENU_EDGE, MENU_INSET, placeAtPoint, placeSubmenu } from './dropdown';

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
