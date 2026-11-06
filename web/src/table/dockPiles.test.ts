import { DOCK_SCALE, dockCardBox } from './dockPiles';

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
    expect(dockCardBox({ w: 112, h: 157, rotated: true })).toEqual({
      w: 112 * 0.6,
      h: 157 * 0.6,
      rotated: true,
    });
  });
});
