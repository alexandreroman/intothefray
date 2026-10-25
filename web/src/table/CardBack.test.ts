import { render, screen } from '@testing-library/svelte';
import CardBack from './CardBack.svelte';

const ASSETS = 'https://img.intothefray.xyz/assets/';

beforeEach(() => {
  localStorage.clear();
});

describe('CardBack', () => {
  it('shows the theme image of a back', () => {
    render(CardBack, { back: 'player' });
    expect(screen.getByRole('img', { name: 'Player card back' }).getAttribute('src')).toBe(
      ASSETS + 'back-player.avif',
    );
  });

  it('draws the label on a back the theme has no image for', () => {
    localStorage.setItem('itf-theme', 'minimal');
    render(CardBack, { back: 'encounter', label: 'ENCOUNTER' });
    const back = screen.getByRole('img', { name: 'Encounter card back' });
    expect(back.tagName.toLowerCase()).toBe('div');
    expect(back.textContent).toBe('ENCOUNTER');
  });

  it('shows the back of an explicit theme over the stored one', () => {
    localStorage.setItem('itf-theme', 'minimal');
    render(CardBack, { back: 'player', theme: 'official' });
    expect(screen.getByRole('img', { name: 'Player card back' }).getAttribute('src')).toBe(
      ASSETS + 'back-player.avif',
    );
  });

  it('draws the back of an explicit theme without images', () => {
    render(CardBack, { back: 'player', theme: 'minimal' });
    const back = screen.getByRole('img', { name: 'Player card back' });
    expect(back.tagName.toLowerCase()).toBe('div');
  });

  it("captions a side deck's own back at its bottom, over the theme image", () => {
    render(CardBack, { back: 'encounter', caption: 'Gift' });
    const back = screen.getByRole('img', { name: 'Gift card back' });
    expect(back.querySelector('img')?.getAttribute('src')).toBe(ASSETS + 'back-encounter.avif');
    expect(back.querySelector('.caption')?.textContent).toBe('GIFT');
    // One name for the whole back: the image and the caption say nothing more.
    expect(screen.getAllByRole('img')).toHaveLength(1);
  });

  it('captions a drawn back too', () => {
    localStorage.setItem('itf-theme', 'minimal');
    render(CardBack, { back: 'player', caption: 'Labor' });
    const back = screen.getByRole('img', { name: 'Labor card back' });
    expect(back.querySelector('.back.player')).not.toBeNull();
    expect(back.querySelector('.caption')?.textContent).toBe('LABOR');
  });
});
