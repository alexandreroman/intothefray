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

  it('portrait image in a landscape slot stays as is', async () => {
    render(CardFace, {
      images: ['01109.avif'],
      name: 'Bomb Scare',
      landscape: true,
    });
    const loaded = screen.getByRole('img', { name: 'Bomb Scare' });
    Object.defineProperty(loaded, 'naturalWidth', { value: 600, configurable: true });
    Object.defineProperty(loaded, 'naturalHeight', { value: 838, configurable: true });

    await fireEvent.load(loaded);

    const img = screen.getByRole('img', { name: 'Bomb Scare' });
    expect(img.classList.contains('land')).toBe(true);
    expect(img.getAttribute('src')).toBe('01109.avif');
  });
});
