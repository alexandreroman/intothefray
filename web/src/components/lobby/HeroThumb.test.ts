import { render, screen } from '@testing-library/svelte';
import HeroThumb from './HeroThumb.svelte';

describe('HeroThumb', () => {
  it('shows the hero image, named after the hero', () => {
    render(HeroThumb, { image: 'hero.jpg', name: 'Spider-Man' });

    expect(screen.getByRole('img', { name: 'Spider-Man' }).getAttribute('src')).toBe('hero.jpg');
  });

  it("shows the hero's initial without an image", () => {
    const { container } = render(HeroThumb, { name: 'spider-Man' });

    expect(screen.queryByRole('img')).toBeNull();
    expect(container.textContent?.trim()).toBe('S');
  });

  it('shows a question mark without a hero', () => {
    const { container } = render(HeroThumb, {});

    expect(container.textContent?.trim()).toBe('?');
  });
});
