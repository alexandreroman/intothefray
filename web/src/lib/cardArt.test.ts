import { render, screen } from '@testing-library/svelte';
import CardArt from '../components/CardArt.svelte';
import { ART_BOTTOM, ART_LEFT, ART_RIGHT, ART_TOP, artFrame, CARD_ASPECT } from './cardArt';

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

describe('CardArt', () => {
  it('shows the card image named, lazily, zoomed and moved onto its art', () => {
    render(CardArt, { src: 'hero.jpg', alt: 'Spider-Man', aspect: 1, loading: 'lazy' });

    const image = screen.getByRole<HTMLImageElement>('img', { name: 'Spider-Man' });
    const frame = artFrame(1);
    expect(image.getAttribute('src')).toBe('hero.jpg');
    expect(image.getAttribute('loading')).toBe('lazy');
    expect(parseFloat(image.style.width)).toBeCloseTo(frame.width * 100, 1);
    expect(parseFloat(image.style.height)).toBeCloseTo(frame.height * 100, 1);
    expect(parseFloat(image.style.left)).toBeCloseTo(frame.left * 100, 1);
    expect(parseFloat(image.style.top)).toBeCloseTo(frame.top * 100, 1);
  });

  it('is decorative without a name', () => {
    const { container } = render(CardArt, { src: 'villain.jpg', aspect: 4 / 3 });

    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('');
  });
});
