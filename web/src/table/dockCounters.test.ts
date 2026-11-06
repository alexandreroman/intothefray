// Where dock mode draws a table card's tokens, statuses and modifiers (dockCounters.ts): three
// disjoint regions, the tokens down the right edge, the statuses along the top, the modifiers up the
// left edge (out of it when they need the room), a "+N" for what does not fit. The boxes are in
// screen px, computed by hand with a measure that gives every character half its font size.
import { dockCounterLayout, type Box, type DockCounterLayout } from './dockCounters';
import type { CardView } from '../lib/types';

const halfEm = (text: string, px: number): number => (text.length * px) / 2;

/** The room left of a card up to its neighbour's slot, on a phone: 40 table units at 60 %, 75 %. */
const PHONE_LEFT_ROOM = 18;

function layout(
  width: number,
  height: number,
  counters: Pick<CardView, 'tokens' | 'status' | 'mods'>,
  scheme = false,
  leftRoom = PHONE_LEFT_ROOM,
): DockCounterLayout {
  return dockCounterLayout({ width, height, leftRoom, scheme, counters, measure: halfEm });
}

function boxesOf(result: DockCounterLayout): Box[] {
  const groups = [result.tokens, result.statuses, result.modifiers];
  return groups.flatMap((group) => [
    ...group.items.map((item) => item.box),
    ...(group.more ? [group.more.box] : []),
  ]);
}

/** Whether two boxes share some area: touching edges do not count. */
function intersect(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** The text a modifier badge shows, whole: "+1 DEF". */
function modifierText(item: { value: string; stat: string }): string {
  return `${item.value} ${item.stat}`;
}

/** Every modifier badge is as wide as its whole text at 11 px, its padding and border included. */
function expectWholeModifiers(result: DockCounterLayout): void {
  for (const item of result.modifiers.items) {
    expect(item.box.w, modifierText(item)).toBeGreaterThanOrEqual(
      halfEm(modifierText(item), 11) + 4,
    );
  }
}

/** Inside the card, but for the modifiers, which may stand out of its left edge up to leftRoom. */
function expectApartAndInside(
  result: DockCounterLayout,
  width: number,
  height: number,
  leftRoom = PHONE_LEFT_ROOM,
): void {
  const boxes = boxesOf(result);
  for (const [i, a] of boxes.entries()) {
    expect(a.x).toBeGreaterThanOrEqual(-leftRoom);
    expect(a.y).toBeGreaterThanOrEqual(0);
    expect(a.x + a.w).toBeLessThanOrEqual(width);
    expect(a.y + a.h).toBeLessThanOrEqual(height);
    for (const b of boxes.slice(i + 1)) {
      expect(intersect(a, b), `${JSON.stringify(a)} and ${JSON.stringify(b)}`).toBe(false);
    }
  }
}

describe('dockCounterLayout', () => {
  it('lays out 2 tokens, 2 statuses and a modifier on a portrait card, no two boxes meeting', () => {
    const result = layout(50, 70, {
      tokens: { gen: 1, dmg: 3 },
      status: { tough: 1, stunned: 1 },
      mods: { atk: -1 },
    });

    // The column 1.5 in from the right edge, discs of 16.5 touching, damage in the corner.
    expect(result.tokens.items).toEqual([
      { name: 'dmg', count: 3, box: { x: 32, y: 52, w: 16.5, h: 16.5 } },
      { name: 'gen', count: 1, box: { x: 32, y: 35.5, w: 16.5, h: 16.5 } },
    ]);
    // Under a title band of 10 % of the height, in status order, 1 apart: 2 + 5.5 + 2 wide.
    expect(result.statuses.items).toEqual([
      { name: 'stunned', text: 'S', box: { x: 1.5, y: 7, w: 9.5, h: 14 } },
      { name: 'tough', text: 'T', box: { x: 12, y: 7, w: 9.5, h: 14 } },
    ]);
    // "−1 ATK" (33 + 4 = 37) is wider than the 29.5 left of the token column: it stands out of the
    // left edge, its right edge 1 short of the token column.
    expect(result.modifiers.items).toEqual([
      { name: 'atk', value: '−1', stat: 'ATK', box: { x: -6, y: 54.5, w: 37, h: 14 } },
    ]);
    expect([result.tokens.more, result.statuses.more, result.modifiers.more]).toEqual([
      null,
      null,
      null,
    ]);
    expectApartAndInside(result, 50, 70);
  });

  it('sizes a "+1 DEF" badge to its whole text at 11 px, never cut to the card', () => {
    // A phone's portrait card, 50 wide: 29.5 left of the tokens, "+1 DEF" needs 33 + 4.
    const result = layout(50, 70, { tokens: { dmg: 1 }, mods: { def: 1 } });

    const [badge] = result.modifiers.items;
    expect(badge?.box.w).toBeGreaterThanOrEqual(halfEm('+1 DEF', 11) + 4);
    expect(badge).toEqual({
      name: 'def',
      value: '+1',
      stat: 'DEF',
      box: { x: -6, y: 54.5, w: 37, h: 14 },
    });
    expectApartAndInside(result, 50, 70);
  });

  it('keeps a badge inside the card when it fits there', () => {
    // 70 wide: 49.5 left of the tokens for the 31.5 of "+2 HP".
    const result = layout(70, 98, { mods: { hp: 2 } });

    expect(result.modifiers.items.map((item) => item.box.x)).toEqual([1.5]);
  });

  it('lines the column up on its widest badge, every badge whole', () => {
    const result = layout(50, 70, { tokens: { dmg: 1 }, mods: { atk: -99, hp: 2 } });

    // "−99 ATK" is 38.5 + 4 wide: the column starts 42.5 left of 31.
    expect(result.modifiers.items).toEqual([
      { name: 'atk', value: '−99', stat: 'ATK', box: { x: -11.5, y: 54.5, w: 42.5, h: 14 } },
      { name: 'hp', value: '+2', stat: 'HP', box: { x: -11.5, y: 39.5, w: 31.5, h: 14 } },
    ]);
    expectWholeModifiers(result);
    expectApartAndInside(result, 50, 70);
  });

  it('counts a badge too wide for the room in the "+N", never cuts it', () => {
    // No room left of the card: 29.5 holds neither "+1 DEF" (37) nor "−99 ATK" (42.5), only "+2".
    const narrow = layout(50, 70, { mods: { atk: -99, def: 1 } }, false, 0);

    expect(narrow.modifiers.items).toEqual([]);
    expect(narrow.modifiers.more).toEqual({ hidden: 2, box: { x: 1.5, y: 54.5, w: 15, h: 14 } });
    expectApartAndInside(narrow, 50, 70, 0);

    // 10 px left of the card: 39.5 from the neighbour's slot (1.5 clear of it) to the tokens holds
    // "+1 DEF" (37), not "−99 THW" (42.5).
    const some = layout(50, 70, { mods: { thw: -99, def: 1 } }, false, 10);
    expect(some.modifiers.items.map(modifierText)).toEqual(['+1 DEF']);
    expect(some.modifiers.more?.hidden).toBe(1);
    expectWholeModifiers(some);
    expectApartAndInside(some, 50, 70, 10);
  });

  it('never gives a modifier badge less than its whole text', () => {
    const cases: Array<[number, number, Record<string, number>]> = [
      [50, 70, { def: 1 }],
      [50, 70, { atk: -1, hp: 2 }],
      [50, 70, { atk: 1, thw: -2, def: 3, sch: -4, rec: 5, hp: 99 }],
      [70, 50, { thw: -99, rec: 12 }],
      [48, 70, { sch: -9 }],
    ];
    for (const [width, height, mods] of cases) {
      const result = layout(width, height, { tokens: { dmg: 1, thr: 1 }, mods });
      expectWholeModifiers(result);
      expectApartAndInside(result, width, height);
    }
  });

  it('shows Retaliate with its value and a repeated status with its count', () => {
    const result = layout(50, 70, { status: { retaliate: 2 } });
    expect(result.statuses.items.map((item) => item.text)).toEqual(['R2']);

    const many = layout(80, 110, { status: { retaliate: 1, tough: 2, stunned: 1 } });
    expect(many.statuses.items.map((item) => item.text)).toEqual(['S', 'T×2', 'R1']);
  });

  it("puts a scheme's threat in the top right corner, the column going down from it", () => {
    const result = layout(50, 70, { tokens: { dmg: 1, acc: 1, thr: 5 } }, true);

    expect(result.tokens.items).toEqual([
      { name: 'thr', count: 5, box: { x: 32, y: 1.5, w: 16.5, h: 16.5 } },
      { name: 'acc', count: 1, box: { x: 32, y: 18, w: 16.5, h: 16.5 } },
      { name: 'dmg', count: 1, box: { x: 32, y: 34.5, w: 16.5, h: 16.5 } },
    ]);
  });

  it('lays out a landscape card the same way, apart', () => {
    const result = layout(70, 50, {
      tokens: { dmg: 2 },
      status: { confused: 1 },
      mods: { thw: 2 },
    });

    expect(result.tokens.items).toEqual([
      { name: 'dmg', count: 2, box: { x: 52, y: 32, w: 16.5, h: 16.5 } },
    ]);
    expect(result.statuses.items).toEqual([
      { name: 'confused', text: 'C', box: { x: 1.5, y: 5, w: 9.5, h: 14 } },
    ]);
    // 49.5 left of the tokens: "+2 THW" (37) stays inside the card.
    expect(result.modifiers.items).toEqual([
      { name: 'thw', value: '+2', stat: 'THW', box: { x: 1.5, y: 34.5, w: 37, h: 14 } },
    ]);
    expectApartAndInside(result, 70, 50);
  });

  it('shows as many tokens as fit but one, then a "+N" disc', () => {
    // 47 high: room for two discs; four tokens show one and "+3".
    const result = layout(70, 50, { tokens: { dmg: 1, thr: 2, acc: 1, gen: 4 } });

    expect(result.tokens.items).toEqual([
      { name: 'dmg', count: 1, box: { x: 52, y: 32, w: 16.5, h: 16.5 } },
    ]);
    expect(result.tokens.more).toEqual({ hidden: 3, box: { x: 52, y: 15.5, w: 16.5, h: 16.5 } });
  });

  it('ends a status row too long for the card with a "+N" chip', () => {
    // 29.5 wide: "S" and "+4" (9.5 + 1 + 15) fit, "S", "C" and "+3" do not.
    const result = layout(50, 70, {
      status: { stunned: 1, confused: 1, tough: 1, retaliate: 1, locked: 1 },
    });

    expect(result.statuses.items.map((item) => item.name)).toEqual(['stunned']);
    expect(result.statuses.more).toEqual({ hidden: 4, box: { x: 12, y: 7, w: 15, h: 14 } });
    expectApartAndInside(result, 50, 70);
  });

  it('ends a modifier column too high for the card with a "+N" chip', () => {
    // From the status row (7 + 14 + 1) down to 68.5: three chips, so two modifiers and "+4", in a
    // column lined up on "+1 ATK" (37), out of the left edge.
    const result = layout(50, 70, { mods: { atk: 1, thw: 1, def: 1, sch: 1, rec: 1, hp: 1 } });

    expect(result.modifiers.items.map((item) => [item.name, item.box.y])).toEqual([
      ['atk', 54.5],
      ['thw', 39.5],
    ]);
    expect(result.modifiers.more).toEqual({ hidden: 4, box: { x: -6, y: 24.5, w: 15, h: 14 } });
    expectWholeModifiers(result);
    expectApartAndInside(result, 50, 70);
  });

  it('shows nothing of a group whose region holds nothing, not even "+N"', () => {
    // 20 wide, no room left of it: the token column leaves no room on the left.
    const result = layout(20, 70, { status: { stunned: 1 }, mods: { atk: 1 } }, false, 0);

    expect(result.statuses).toEqual({ items: [], more: null });
    expect(result.modifiers).toEqual({ items: [], more: null });
  });

  it('leaves zero counters and modifiers out', () => {
    const result = layout(50, 70, { tokens: { dmg: 0 }, status: { tough: 0 }, mods: { atk: 0 } });

    expect(boxesOf(result)).toEqual([]);
  });
});
