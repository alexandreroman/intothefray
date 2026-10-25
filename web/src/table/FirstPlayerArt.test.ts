import { fireEvent, render, screen } from '@testing-library/svelte';
import FirstPlayerArt from './FirstPlayerArt.svelte';

const FIRST_PLAYER = 'https://img.intothefray.xyz/assets/first-player.avif';

beforeEach(() => {
  localStorage.clear();
});

describe('FirstPlayerArt', () => {
  it("shows the stored theme's image by default", () => {
    render(FirstPlayerArt);
    expect(screen.getByRole('img', { name: 'First player' }).getAttribute('src')).toBe(
      FIRST_PLAYER,
    );
  });

  it('shows the image of an explicit theme over the stored one', () => {
    localStorage.setItem('itf-theme', 'minimal');
    render(FirstPlayerArt, { theme: 'felt' });
    expect(screen.getByRole('img', { name: 'First player' }).getAttribute('src')).toBe(
      FIRST_PLAYER,
    );
  });

  it('draws the token of a theme without images', () => {
    render(FirstPlayerArt, { theme: 'minimal' });
    expect(screen.getByRole('img', { name: 'First player' }).tagName.toLowerCase()).toBe('svg');
  });

  it('draws the token again when its image fails to load', async () => {
    render(FirstPlayerArt, { theme: 'official' });
    await fireEvent.error(screen.getByRole('img', { name: 'First player' }));
    expect(screen.getByRole('img', { name: 'First player' }).tagName.toLowerCase()).toBe('svg');
  });

  it('names the paths of each drawn token apart, so that two can show at once', () => {
    render(FirstPlayerArt, { theme: 'minimal' });
    render(FirstPlayerArt, { theme: 'minimal' });
    const ids = [...document.querySelectorAll('defs path')].map((path) => path.id);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    for (const textPath of document.querySelectorAll('textPath')) {
      expect(ids).toContain(textPath.getAttribute('href')?.slice(1));
    }
  });
});
