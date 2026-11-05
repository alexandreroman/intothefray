import { pile } from './fixtures.testing';
import { ownerFrames } from './layout';
import {
  DOCK_SCALE,
  dockCardBox,
  dockFrameBox,
  dockPileBox,
  pileFrame,
  type Placement,
} from './dockPiles';

function expectBox(actual: Placement, expected: Placement): void {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
  expect(actual.w).toBeCloseTo(expected.w, 6);
  expect(actual.h).toBeCloseTo(expected.h, 6);
}

describe('dockPileBox', () => {
  it('scales a pile slot by 0.6 about its frame top-left corner', () => {
    const slot = { x: 130, y: 70, w: 112, h: 157 };
    const frame = { x: -10, y: 58, w: 262, h: 182 };

    expectBox(dockPileBox(slot, frame), { x: 74, y: 65.2, w: 67.2, h: 94.2 });
  });

  it('keeps the relative layout of the piles of one frame, closer together', () => {
    const frame = { x: -10, y: 20, w: 262, h: 177 };
    const deck = dockPileBox({ x: 0, y: 30, w: 112, h: 157 }, frame);
    const discard = dockPileBox({ x: 130, y: 30, w: 112, h: 157 }, frame);

    expect(discard.y).toBeCloseTo(deck.y, 6);
    // 130 units apart at full size, 78 drawn: the gap shrinks with the piles.
    expect(discard.x - deck.x).toBeCloseTo(78, 6);
    // The frame's 10-unit padding becomes 6.
    expect(deck.x - frame.x).toBeCloseTo(6, 6);
  });

  it('takes another scale', () => {
    const frame = { x: 0, y: 0, w: 100, h: 100 };

    expectBox(dockPileBox({ x: 10, y: 20, w: 40, h: 60 }, frame, 0.5), {
      x: 5,
      y: 10,
      w: 20,
      h: 30,
    });
  });
});

describe('dockCardBox', () => {
  it('draws a card at 0.6 of its footprint, the scale the frames and piles take', () => {
    expect(DOCK_SCALE).toBe(0.6);
    expect(dockCardBox({ w: 112, h: 157, rotated: false })).toEqual({
      w: 112 * 0.6,
      h: 157 * 0.6,
      rotated: false,
    });
  });

  it('keeps what else the box tells, a landscape card turned on its pile', () => {
    expect(dockCardBox({ w: 112, h: 157, rotated: true }, 0.5)).toEqual({
      w: 56,
      h: 78.5,
      rotated: true,
    });
  });
});

describe('dockFrameBox', () => {
  it('keeps the frame top-left corner and scales its size by 0.6', () => {
    expectBox(dockFrameBox({ x: -10, y: 58, w: 262, h: 182 }), {
      x: -10,
      y: 58,
      w: 157.2,
      h: 109.2,
    });
  });
});

describe('pileFrame', () => {
  it('finds the frame ownerFrames draws around a pile', () => {
    const piles = [
      pile('encounter', { kind: 'encounter', owner: -1, x: 0, y: 30 }),
      pile('encounterDiscard', { kind: 'encounterDiscard', owner: -1, x: 130, y: 30 }),
      pile('scenario:a', { kind: 'scenarioDeck', owner: -1, x: 300, y: 30, label: 'Weapons' }),
      pile('deck:p0', { kind: 'deck', owner: 0, x: 0, y: 410 }),
      pile('side:p0:0', { kind: 'sideDeck', owner: 0, x: 260, y: 410, label: 'Gift' }),
    ];
    const frames = ownerFrames(piles);
    const [villain, weapons, player] = frames;

    expect(pileFrame(piles[1]!, frames)).toBe(villain);
    expect(pileFrame(piles[2]!, frames)).toBe(weapons);
    expect(pileFrame(piles[4]!, frames)).toBe(player);
  });

  it('finds no frame for a pile of an owner without one', () => {
    const frames = ownerFrames([pile('deck:p0', { kind: 'deck', owner: 0 })]);

    expect(pileFrame(pile('deck:p1', { kind: 'deck', owner: 1 }), frames)).toBeUndefined();
  });
});
