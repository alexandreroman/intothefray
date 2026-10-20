import { render, screen } from '@testing-library/svelte';
import CardBack from './CardBack.svelte';

const CEREBRO = 'https://pub-d27e6715f4ba4529bc9d8fd13938a5a1.r2.dev/cerebro-cards/';

beforeEach(() => {
  localStorage.clear();
});

describe('CardBack', () => {
  it('shows the theme image of a back', () => {
    render(CardBack, { back: 'player' });
    expect(screen.getByRole('img', { name: 'Player card back' }).getAttribute('src')).toBe(
      CEREBRO + 'HeroBack.jpg',
    );
  });

  it('draws the label on a back the theme has no image for', () => {
    localStorage.setItem('itf-theme', 'minimal');
    render(CardBack, { back: 'encounter', label: 'ENCOUNTER' });
    const back = screen.getByRole('img', { name: 'Encounter card back' });
    expect(back.tagName.toLowerCase()).toBe('div');
    expect(back.textContent).toBe('ENCOUNTER');
  });

  it("captions a side deck's own back at its bottom, over the theme image", () => {
    render(CardBack, { back: 'encounter', caption: 'Gift' });
    const back = screen.getByRole('img', { name: 'Gift card back' });
    expect(back.querySelector('img')?.getAttribute('src')).toBe(CEREBRO + 'EncounterBack.jpg');
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
