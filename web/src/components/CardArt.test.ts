import { render, screen } from '@testing-library/svelte';
import CardArt from './CardArt.svelte';
import { artFrame, artWindowFor } from '../lib/cardArt';

/** The image's place in its box, in percent, as its style gives it. */
function placeOf(image: HTMLImageElement): {
  width: number;
  height: number;
  left: number;
  top: number;
} {
  return {
    width: parseFloat(image.style.width),
    height: parseFloat(image.style.height),
    left: parseFloat(image.style.left),
    top: parseFloat(image.style.top),
  };
}

describe('CardArt', () => {
  it('shows the card image named, lazily, zoomed and moved onto its art', () => {
    render(CardArt, { src: 'hero.jpg', alt: 'Spider-Man', aspect: 1, loading: 'lazy' });

    const image = screen.getByRole<HTMLImageElement>('img', { name: 'Spider-Man' });
    const frame = artFrame(1);
    const place = placeOf(image);
    expect(image.getAttribute('src')).toBe('hero.jpg');
    expect(image.getAttribute('loading')).toBe('lazy');
    expect(place.width).toBeCloseTo(frame.width * 100, 1);
    expect(place.height).toBeCloseTo(frame.height * 100, 1);
    expect(place.left).toBeCloseTo(frame.left * 100, 1);
    expect(place.top).toBeCloseTo(frame.top * 100, 1);
  });

  it('is decorative without a name', () => {
    const { container } = render(CardArt, { src: 'villain.jpg', aspect: 4 / 3 });

    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('');
  });

  it('zooms onto the window it is given', () => {
    const art = artWindowFor('event')!;
    render(CardArt, { src: 'event.jpg', alt: 'Sector Scan', aspect: 5 / 7, artWindow: art });

    const frame = artFrame(5 / 7, art);
    const place = placeOf(screen.getByRole<HTMLImageElement>('img', { name: 'Sector Scan' }));
    expect(place.width).toBeCloseTo(frame.width * 100, 1);
    expect(place.height).toBeCloseTo(frame.height * 100, 1);
    expect(place.left).toBeCloseTo(frame.left * 100, 1);
    expect(place.top).toBeCloseTo(frame.top * 100, 1);
    // Not where a character's art lies.
    expect(place.top).not.toBeCloseTo(artFrame(5 / 7).top * 100, 1);
  });

  it('tells its parent when the image fails to load', () => {
    const onerror = vi.fn();
    render(CardArt, { src: 'gone.jpg', alt: 'Rhino', aspect: 1, onerror });

    screen.getByRole('img', { name: 'Rhino' }).dispatchEvent(new Event('error'));

    expect(onerror).toHaveBeenCalledOnce();
  });
});
