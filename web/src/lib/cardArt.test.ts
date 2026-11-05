import {
  ART_BOTTOM,
  ART_LEFT,
  ART_RIGHT,
  ART_TOP,
  artFrame,
  artWindowFor,
  CARD_ASPECT,
  CHARACTER_ART,
  type ArtWindow,
} from './cardArt';

type Frame = ReturnType<typeof artFrame>;

/** The part of the card a box shows: its edges as fractions of the card's width and height. */
function shown(frame: Frame): { left: number; right: number; top: number; bottom: number } {
  return {
    left: -frame.left / frame.width,
    right: (1 - frame.left) / frame.width,
    top: -frame.top / frame.height,
    bottom: (1 - frame.top) / frame.height,
  };
}

// The box aspects in use: round and square hero thumbs, 4:3 villain tiles; and two extremes.
const ASPECTS = [1, 4 / 3, 3, 0.5];

describe('artFrame', () => {
  it.each(ASPECTS)('shows only the art of the card in a box of aspect %d', (aspect) => {
    const part = shown(artFrame(aspect));

    expect(part.left).toBeGreaterThanOrEqual(ART_LEFT - 1e-9);
    expect(part.right).toBeLessThanOrEqual(ART_RIGHT + 1e-9);
    expect(part.top).toBeGreaterThanOrEqual(ART_TOP - 1e-9);
    expect(part.bottom).toBeLessThanOrEqual(ART_BOTTOM + 1e-9);
  });

  it.each(ASPECTS)('centres a box of aspect %d on the art', (aspect) => {
    const part = shown(artFrame(aspect));

    expect((part.left + part.right) / 2).toBeCloseTo((ART_LEFT + ART_RIGHT) / 2);
    expect((part.top + part.bottom) / 2).toBeCloseTo((ART_TOP + ART_BOTTOM) / 2);
  });

  it.each(ASPECTS)('keeps the card image at the card aspect in a box of aspect %d', (aspect) => {
    const frame = artFrame(aspect);

    // In pixels of a box of height 1: width over height.
    expect((frame.width * aspect) / frame.height).toBeCloseTo(CARD_ASPECT);
  });

  it('shows the full height of the art in a square box, cutting its sides', () => {
    const part = shown(artFrame(1));

    expect(part.top).toBeCloseTo(ART_TOP);
    expect(part.bottom).toBeCloseTo(ART_BOTTOM);
    expect(part.left).toBeGreaterThan(ART_LEFT);
    expect(part.right).toBeLessThan(ART_RIGHT);
  });

  it('shows the full width of the art in a villain tile (4:3)', () => {
    const part = shown(artFrame(4 / 3));

    expect(part.left).toBeCloseTo(ART_LEFT);
    expect(part.right).toBeCloseTo(ART_RIGHT);
  });
});

// Every portrait face type of the packs, by the layout of its art.
const CHARACTERS = ['hero', 'alter_ego', 'ally', 'villain', 'minion', 'leader'];
const OTHERS = [
  'upgrade',
  'support',
  'event',
  'resource',
  'attachment',
  'treachery',
  'obligation',
  'environment',
  'evidence_means',
  'evidence_motive',
  'evidence_opportunity',
];
const SCHEMES = ['main_scheme', 'side_scheme', 'player_side_scheme'];

// A table card's box: 112 × 157 table units.
const TILE_ASPECT = 112 / 157;

describe('artWindowFor', () => {
  it.each(CHARACTERS)("gives a %s the character's window", (type) => {
    expect(artWindowFor(type)).toEqual({
      left: ART_LEFT,
      right: ART_RIGHT,
      top: ART_TOP,
      bottom: ART_BOTTOM,
    });
  });

  it.each(OTHERS)('gives a %s a window of its own inside the card', (type) => {
    const art = artWindowFor(type);

    expect(art).not.toBeNull();
    expect(art).not.toEqual(CHARACTER_ART);
    expect(art!.left).toBeGreaterThan(0);
    expect(art!.right).toBeLessThan(1);
    expect(art!.top).toBeGreaterThan(0);
    // The text box fills the bottom half of every card.
    expect(art!.bottom).toBeLessThanOrEqual(0.55);
    expect(art!.right - art!.left).toBeGreaterThan(0.3);
    expect(art!.bottom - art!.top).toBeGreaterThan(0.3);
  });

  it('keeps the art of an upgrade right of its title, which runs up the left edge', () => {
    expect(artWindowFor('upgrade')!.left).toBeGreaterThan(0.1);
  });

  it('keeps the art of an encounter card under its title, across the top', () => {
    for (const type of ['treachery', 'obligation', 'environment', 'evidence_means']) {
      expect(artWindowFor(type)!.top).toBeGreaterThan(0.1);
    }
  });

  it.each(SCHEMES)('gives a %s none: it is drawn whole', (type) => {
    expect(artWindowFor(type)).toBeNull();
  });

  it('gives an unknown type none', () => {
    expect(artWindowFor('mystery')).toBeNull();
    expect(artWindowFor('')).toBeNull();
  });
});

describe('artFrame with a window', () => {
  const WINDOWS: [string, ArtWindow][] = OTHERS.map((type) => [type, artWindowFor(type)!]);

  it.each(WINDOWS)('shows only the art of a %s in a table card', (_type, art) => {
    const part = shown(artFrame(TILE_ASPECT, art));

    expect(part.left).toBeGreaterThanOrEqual(art.left - 1e-9);
    expect(part.right).toBeLessThanOrEqual(art.right + 1e-9);
    expect(part.top).toBeGreaterThanOrEqual(art.top - 1e-9);
    expect(part.bottom).toBeLessThanOrEqual(art.bottom + 1e-9);
  });

  it.each(WINDOWS)(
    'fills a table card with the full height of the art of a %s, centred',
    (_type, art) => {
      const frame = artFrame(TILE_ASPECT, art);
      const part = shown(frame);

      expect(part.top).toBeCloseTo(art.top);
      expect(part.bottom).toBeCloseTo(art.bottom);
      expect((part.left + part.right) / 2).toBeCloseTo((art.left + art.right) / 2);
      expect((frame.width * TILE_ASPECT) / frame.height).toBeCloseTo(CARD_ASPECT);
    },
  );

  it("uses the character's window when given none", () => {
    expect(artFrame(1)).toEqual(artFrame(1, CHARACTER_ART));
  });
});
