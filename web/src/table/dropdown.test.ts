import { MENU_EDGE, MENU_GAP, placeDropdown } from './dropdown';

// A 1000 × 800 room at the top left of the screen, and a 200 × 300 dropdown.
const ROOM = { left: 0, top: 0, right: 1000, bottom: 800 };
const SIZE = { w: 200, h: 300 };

function button(
  left: number,
  top: number,
): { left: number; top: number; right: number; bottom: number } {
  return { left, top, right: left + 40, bottom: top + 30 };
}

describe('placeDropdown', () => {
  it('opens above its button, at its left edge', () => {
    expect(placeDropdown(button(400, 500), SIZE, ROOM)).toEqual({
      left: 400,
      top: 500 - MENU_GAP - 300,
      maxHeight: null,
    });
  });

  it('opens below its button when there is no room above', () => {
    expect(placeDropdown(button(400, 100), SIZE, ROOM)).toEqual({
      left: 400,
      top: 130 + MENU_GAP,
      maxHeight: null,
    });
  });

  it('moves left or right to stay inside the room', () => {
    expect(placeDropdown(button(900, 500), SIZE, ROOM).left).toBe(1000 - MENU_EDGE - 200);
    const shifted = { left: 100, top: 0, right: 1000, bottom: 800 };
    expect(placeDropdown(button(50, 500), SIZE, shifted).left).toBe(100 + MENU_EDGE);
  });

  it('is cut to the roomier side, scrolling inside, when it fits neither way', () => {
    // 400 px high: 200 px of room above the button, about 150 below.
    const low = { left: 0, top: 0, right: 1000, bottom: 400 };
    const tall = { w: 200, h: 600 };
    const above = placeDropdown(button(400, 214), tall, low);
    expect(above.maxHeight).toBe(214 - MENU_GAP - MENU_EDGE);
    expect(above.top).toBe(MENU_EDGE);
    // The button near the top: more room below.
    const below = placeDropdown(button(400, 60), tall, low);
    expect(below).toEqual({
      left: 400,
      top: 90 + MENU_GAP,
      maxHeight: 400 - MENU_EDGE - 90 - MENU_GAP,
    });
  });

  it('stays whole inside the room wherever its button is', () => {
    for (const top of [10, 200, 400, 600, 770]) {
      for (const left of [0, 300, 980]) {
        const place = placeDropdown(button(left, top), SIZE, ROOM);
        const height = place.maxHeight ?? SIZE.h;
        expect(place.left).toBeGreaterThanOrEqual(MENU_EDGE);
        expect(place.left + SIZE.w).toBeLessThanOrEqual(1000 - MENU_EDGE);
        expect(place.top).toBeGreaterThanOrEqual(MENU_EDGE);
        expect(place.top + height).toBeLessThanOrEqual(800 - MENU_EDGE);
      }
    }
  });
});
