import { rotateDegrees, untiltedBox, type Box } from './untilt';

/** The bounds on the screen of a box of that size, centred there, turned clockwise by `degrees`. */
function boundsOf(centreX: number, centreY: number, w: number, h: number, degrees: number): Box {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const width = w * cos + h * sin;
  const height = w * sin + h * cos;
  return { left: centreX - width / 2, top: centreY - height / 2, width, height };
}

/**
 * The bounds on the screen of a box of a layer, once the layer, 100 × 140 px with its top-left
 * corner at (200, 300), is turned clockwise by `degrees` about its centre: the box's corner
 * at (x, y) in the layer, its size w × h.
 */
function turned(
  x: number,
  y: number,
  w: number,
  h: number,
  degrees: number,
): { layer: Box; box: Box } {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const centre = { x: 200 + 50, y: 300 + 70 };
  // From the layer's centre to the box's, turned with the layer (the screen's y axis points down).
  const dx = x + w / 2 - 50;
  const dy = y + h / 2 - 70;
  const boxX = centre.x + dx * cos - dy * sin;
  const boxY = centre.y + dx * sin + dy * cos;
  return {
    layer: boundsOf(centre.x, centre.y, 100, 140, degrees),
    box: boundsOf(boxX, boxY, w, h, degrees),
  };
}

function expectBox(actual: Box, expected: Box): void {
  expect(actual.left).toBeCloseTo(expected.left);
  expect(actual.top).toBeCloseTo(expected.top);
  expect(actual.width).toBeCloseTo(expected.width);
  expect(actual.height).toBeCloseTo(expected.height);
}

const LAYER = { width: 100, height: 140 };

describe('untiltedBox', () => {
  it('gives the box where it lies in an upright layer', () => {
    const { layer, box } = turned(60, 100, 30, 20, 0);

    expectBox(untiltedBox(box, layer, LAYER, 0), { left: 60, top: 100, width: 30, height: 20 });
  });

  it("finds a box of a layer turned clockwise where it lies in the layer's own frame", () => {
    const { layer, box } = turned(60, 100, 30, 20, 15);

    expectBox(untiltedBox(box, layer, LAYER, 15), { left: 60, top: 100, width: 30, height: 20 });
  });

  it('finds it in a layer turned the other way, and along its top edge', () => {
    const { layer, box } = turned(10, -8, 40, 16, -15);

    expectBox(untiltedBox(box, layer, LAYER, -15), { left: 10, top: -8, width: 40, height: 16 });
  });
});

describe('rotateDegrees', () => {
  it('reads the angle of a computed rotate about the z axis, in degrees', () => {
    expect(rotateDegrees('15deg')).toBe(15);
    expect(rotateDegrees('-7.5deg')).toBe(-7.5);
    expect(rotateDegrees('0 0 1 15deg')).toBe(15);
    expect(rotateDegrees('0.25turn')).toBe(90);
    expect(rotateDegrees(`${Math.PI}rad`)).toBeCloseTo(180);
  });

  it('reads no rotate, or a turn out of the screen, as no turn', () => {
    expect(rotateDegrees('none')).toBe(0);
    expect(rotateDegrees('')).toBe(0);
    expect(rotateDegrees('z 15deg')).toBe(15);
    expect(rotateDegrees('1 0 0 15deg')).toBe(0);
    expect(rotateDegrees('y 15deg')).toBe(0);
  });
});
