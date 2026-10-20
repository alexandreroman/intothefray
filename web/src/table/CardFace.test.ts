import { fireEvent, render, screen } from '@testing-library/svelte';
import CardFace from './CardFace.svelte';
import { localizedFace } from '../lib/localize';

describe('CardFace', () => {
  it('CardFace falls back to the next image', async () => {
    render(CardFace, { images: ['a.png', 'b.png'], name: 'Rhino' });
    const img = screen.getByRole('img', { name: 'Rhino' });
    expect(img.getAttribute('src')).toBe('a.png');

    await fireEvent.error(img);

    expect(screen.getByRole('img', { name: 'Rhino' }).getAttribute('src')).toBe('b.png');
  });

  it('falls back from the French image to the English one', async () => {
    const rhino = localizedFace(
      {
        name: 'Rhino',
        type: 'villain',
        size: 'std',
        images: ['en/01094.jpg'],
        localized: { fr: { images: ['fr/01094.webp'] } },
      },
      'fr',
    );
    render(CardFace, { images: rhino.images, name: rhino.name });
    const img = screen.getByRole('img', { name: 'Rhino' });
    expect(img.getAttribute('src')).toBe('fr/01094.webp');

    await fireEvent.error(img);

    expect(screen.getByRole('img', { name: 'Rhino' }).getAttribute('src')).toBe('en/01094.jpg');
  });

  it('shows a placeholder with the name once no URL is left', async () => {
    render(CardFace, { images: ['a.png'], name: 'Rhino' });

    await fireEvent.error(screen.getByRole('img', { name: 'Rhino' }));

    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('Rhino')).toBeTruthy();
  });

  it('shows the placeholder when there is no image at all', () => {
    render(CardFace, { images: [], name: 'Rhino' });
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('Rhino')).toBeTruthy();
  });

  it('goes back to the first URL when the images change', async () => {
    const { rerender } = render(CardFace, { images: ['a.png', 'b.png'], name: 'Rhino' });
    await fireEvent.error(screen.getByRole('img', { name: 'Rhino' }));

    await rerender({ images: ['c.png', 'd.png'] });

    expect(screen.getByRole('img', { name: 'Rhino' }).getAttribute('src')).toBe('c.png');
  });

  it('crops a landscape image with the landscape cut', () => {
    render(CardFace, { images: ['a.png'], name: 'Bomb Scare', landscape: true });
    expect(screen.getByRole('img').classList.contains('land')).toBe(true);
  });

  it('turns a rotated image a quarter inside its portrait slot', () => {
    const { container } = render(CardFace, {
      images: ['a.png'],
      name: 'Bomb Scare',
      rotated: true,
    });
    expect(container.querySelector('.land-in-portrait img')).toBeTruthy();
  });

  describe('an image stored the other way round', () => {
    /** The image of that name loads at that natural size. */
    async function load(name: string, width: number, height: number): Promise<HTMLElement> {
      const img = screen.getByRole('img', { name });
      Object.defineProperty(img, 'naturalWidth', { value: width, configurable: true });
      Object.defineProperty(img, 'naturalHeight', { value: height, configurable: true });
      await fireEvent.load(img);
      return screen.getByRole('img', { name });
    }

    it('turns a portrait image of a landscape card a quarter clockwise in its landscape slot', async () => {
      const { container } = render(CardFace, {
        images: ['01109.jpg'],
        name: 'Bomb Scare',
        landscape: true,
      });
      expect(container.querySelector('.portrait-in-land')).toBeNull();

      const img = await load('Bomb Scare', 710, 1030);

      expect(img.closest('.portrait-in-land')).not.toBeNull();
      expect(img.getAttribute('src')).toBe('01109.jpg');
    });

    it('leaves a landscape image of a landscape card as it is', async () => {
      const { container } = render(CardFace, {
        images: ['01109.jpg'],
        name: 'Bomb Scare',
        landscape: true,
      });

      const img = await load('Bomb Scare', 1030, 710);

      expect(container.querySelector('.portrait-in-land')).toBeNull();
      expect(img.classList.contains('land')).toBe(true);
    });

    it('draws a portrait image of a landscape card as it is in a portrait slot, turned already', async () => {
      const { container } = render(CardFace, {
        images: ['01109.jpg'],
        name: 'Bomb Scare',
        rotated: true,
      });
      expect(container.querySelector('.land-in-portrait img')).toBeTruthy();

      const img = await load('Bomb Scare', 710, 1030);

      expect(container.querySelector('.land-in-portrait')).toBeNull();
      expect(img.getAttribute('src')).toBe('01109.jpg');
    });

    it('measures the next image again: a fallback, or another face', async () => {
      const { container, rerender } = render(CardFace, {
        images: ['cerebro.jpg', 'marvelcdb.png'],
        name: 'Bomb Scare',
        landscape: true,
      });
      await load('Bomb Scare', 710, 1030);
      expect(container.querySelector('.portrait-in-land')).not.toBeNull();

      // Another face: its image is not turned until it loads the other way round too.
      await rerender({ images: ['other.jpg'] });
      expect(container.querySelector('.portrait-in-land')).toBeNull();
      await load('Bomb Scare', 1030, 710);
      expect(container.querySelector('.portrait-in-land')).toBeNull();

      // A portrait image that fails: the next one is measured on its own.
      await rerender({ images: ['cerebro.jpg', 'marvelcdb.png'] });
      await load('Bomb Scare', 710, 1030);
      await fireEvent.error(screen.getByRole('img', { name: 'Bomb Scare' }));
      expect(screen.getByRole('img', { name: 'Bomb Scare' }).getAttribute('src')).toBe(
        'marvelcdb.png',
      );
      expect(container.querySelector('.portrait-in-land')).toBeNull();
    });
  });
});
