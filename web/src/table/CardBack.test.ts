import { render, screen } from '@testing-library/svelte';
import CardBack from './CardBack.svelte';

const HERO_BACK = 'https://pub-d27e6715f4ba4529bc9d8fd13938a5a1.r2.dev/cerebro-cards/HeroBack.jpg';

beforeEach(() => {
  localStorage.clear();
});

describe('CardBack', () => {
  it('shows the theme image of a player back', () => {
    render(CardBack, { back: 'player' });
    expect(screen.getByRole('img', { name: 'Player card back' }).getAttribute('src')).toBe(
      HERO_BACK,
    );
  });

  it('draws the label on a back the theme has no image for', () => {
    localStorage.setItem('itf-theme', 'minimal');
    render(CardBack, { back: 'encounter', label: 'ENCOUNTER' });
    const back = screen.getByRole('img', { name: 'Encounter card back' });
    expect(back.tagName.toLowerCase()).toBe('div');
    expect(back.textContent).toBe('ENCOUNTER');
  });

  it.each(['official', 'minimal', 'felt'])(
    "draws a side deck's own back with its name in the %s theme",
    (theme) => {
      localStorage.setItem('itf-theme', theme);
      render(CardBack, { back: 'side', side: 'Labor', label: 'SIDE' });
      const back = screen.getByRole('img', { name: 'Labor card back' });
      expect(back.tagName.toLowerCase()).toBe('div');
      expect(back.classList).toContain('side');
      expect(back.textContent).toBe('LABOR');
    },
  );

  it('draws a question mark on a side back whose deck is unknown', () => {
    render(CardBack, { back: 'side' });
    expect(screen.getByRole('img', { name: 'Side card back' }).textContent).toBe('?');
  });
});
