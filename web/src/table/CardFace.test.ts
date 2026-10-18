import { fireEvent, render, screen } from '@testing-library/svelte';
import CardFace from './CardFace.svelte';

describe('CardFace', () => {
  it('CardFace falls back to the next image', async () => {
    render(CardFace, { images: ['a.png', 'b.png'], name: 'Rhino' });
    const img = screen.getByRole('img', { name: 'Rhino' });
    expect(img.getAttribute('src')).toBe('a.png');

    await fireEvent.error(img);

    expect(screen.getByRole('img', { name: 'Rhino' }).getAttribute('src')).toBe('b.png');
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
});
