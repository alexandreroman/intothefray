// Where dock mode draws a table card's tokens, statuses and modifiers (dockCounters.ts): three
// disjoint regions, the tokens down the right edge, the statuses along the top, the modifiers up the
// left edge, a "+N" for what does not fit. The boxes are in screen px, computed by hand with a
// measure that gives every character half its font size.
import { dockCounterLayout, type Box, type DockCounterLayout } from './dockCounters';
import type { CardView } from '../lib/types';

const halfEm = (text: string, px: number): number => (text.length * px) / 2;

function layout(
  width: number,
  height: number,
  counters: Pick<CardView, 'tokens' | 'status' | 'mods'>,
  scheme = false,
): DockCounterLayout {
  return dockCounterLayout({ width, height, scheme, counters, measure: halfEm });
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

function expectApartAndInside(result: DockCounterLayout, width: number, height: number): void {
  const boxes = boxesOf(result);
  for (const [i, a] of boxes.entries()) {
    expect(a.x).toBeGreaterThanOrEqual(0);
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
    // "−1 ATK" (11 + 14 + 4 = 29) fits the 29.5 left of the token column.
    expect(result.modifiers.items).toEqual([
      {
        name: 'atk',
        value: '−1',
        stat: 'ATK',
        spaced: true,
        box: { x: 1.5, y: 54.5, w: 29, h: 14 },
      },
    ]);
    expect([result.tokens.more, result.statuses.more, result.modifiers.more]).toEqual([
      null,
      null,
      null,
    ]);
    expectApartAndInside(result, 50, 70);
  });

  it('writes a modifier tight when its spaced form is too wide', () => {
    // 48 wide: 27.5 left of the tokens; "+1 ATK" needs 29, "+1ATK" 11 + 10.5 + 4.
    const result = layout(48, 70, { mods: { atk: 1 } });

    expect(result.modifiers.items).toEqual([
      {
        name: 'atk',
        value: '+1',
        stat: 'ATK',
        spaced: false,
        box: { x: 1.5, y: 54.5, w: 25.5, h: 14 },
      },
    ]);
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
    expect(result.modifiers.items).toEqual([
      {
        name: 'thw',
        value: '+2',
        stat: 'THW',
        spaced: true,
        box: { x: 1.5, y: 34.5, w: 29, h: 14 },
      },
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
    // From the status row (7 + 14 + 1) down to 68.5: three chips, so two modifiers and "+4".
    const result = layout(50, 70, { mods: { atk: 1, thw: 1, def: 1, sch: 1, rec: 1, hp: 1 } });

    expect(result.modifiers.items.map((item) => [item.name, item.box.y])).toEqual([
      ['atk', 54.5],
      ['thw', 39.5],
    ]);
    expect(result.modifiers.more).toEqual({ hidden: 4, box: { x: 1.5, y: 24.5, w: 15, h: 14 } });
  });

  it('shows nothing of a group whose region holds nothing, not even "+N"', () => {
    // 20 wide: the token column leaves no room on the left.
    const result = layout(20, 70, { status: { stunned: 1 }, mods: { atk: 1 } });

    expect(result.statuses).toEqual({ items: [], more: null });
    expect(result.modifiers).toEqual({ items: [], more: null });
  });

  it('leaves zero counters and modifiers out', () => {
    const result = layout(50, 70, { tokens: { dmg: 0 }, status: { tough: 0 }, mods: { atk: 0 } });

    expect(boxesOf(result)).toEqual([]);
  });
});
