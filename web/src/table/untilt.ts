// Where a box drawn in a tilted layer lies in the layer's own, untilted frame. The screen reports
// only the axis-aligned bounds of a turned box (getBoundingClientRect), wider than the box and
// shifted with the turn: the inspector's − / + pill (CardCounters.svelte), drawn in the layer of a
// tilted card, is placed by its token's place in that layer's frame. Pure.

/** A box on the screen or in a layer: its top-left corner and its size, in px. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The size of a box in its own frame, in px. */
export interface Size {
  width: number;
  height: number;
}

/** How many degrees each unit of a CSS angle is. */
const DEGREES_PER_UNIT: Record<string, number> = {
  deg: 1,
  grad: 0.9,
  rad: 180 / Math.PI,
  turn: 360,
};

/**
 * The box, in the layer's own frame, whose bounds on the screen are `bounds`, once the layer and
 * the box in it are turned clockwise by `degrees` about the layer's centre: `layerBounds` are the
 * layer's bounds on the screen, `layerSize` its own size. A turn leaves a box's centre at the
 * centre of its bounds: the box's centre turns back about the layer's, and its size is the one
 * whose turned bounds are as large as `bounds`. For a turn of less than 45° either way.
 */
export function untiltedBox(bounds: Box, layerBounds: Box, layerSize: Size, degrees: number): Box {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  // From the layer's centre to the box's on the screen, turned back by the layer's turn (the
  // screen's y axis points down, so a clockwise turn has a positive angle).
  const dx = bounds.left + bounds.width / 2 - (layerBounds.left + layerBounds.width / 2);
  const dy = bounds.top + bounds.height / 2 - (layerBounds.top + layerBounds.height / 2);
  const centreX = layerSize.width / 2 + dx * cos + dy * sin;
  const centreY = layerSize.height / 2 - dx * sin + dy * cos;

  // Turned, a w × h box has bounds of w·|cos| + h·|sin| by w·|sin| + h·|cos|: solved for w and h.
  const c = Math.abs(cos);
  const s = Math.abs(sin);
  const determinant = c * c - s * s;
  const width = (bounds.width * c - bounds.height * s) / determinant;
  const height = (bounds.height * c - bounds.width * s) / determinant;

  return { left: centreX - width / 2, top: centreY - height / 2, width, height };
}

/** The axes a `rotate` value may name for a turn in the screen's plane. */
const SCREEN_AXES = ['', 'z', '0 0 1'];

/**
 * The angle of a computed `rotate` value in the screen's plane, in degrees: "15deg", or with its
 * axis, "z 15deg" or "0 0 1 15deg". None for "none", no value, or a turn about another axis.
 */
export function rotateDegrees(rotate: string): number {
  const parts = rotate.trim().split(/\s+/);
  const angle = parts.pop() ?? '';
  if (!SCREEN_AXES.includes(parts.join(' '))) {
    return 0;
  }
  const match = /^(-?[\d.]+(?:e[-+]?\d+)?)(deg|grad|rad|turn)$/.exec(angle);
  if (match === null) {
    return 0;
  }
  return Number(match[1]) * DEGREES_PER_UNIT[match[2]!]!;
}
