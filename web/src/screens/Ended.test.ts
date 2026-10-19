import { render, screen } from '@testing-library/svelte';
import Ended from './Ended.svelte';

describe('Ended', () => {
  it('says the game has ended and links back to home', () => {
    render(Ended);

    expect(screen.getByText('Game over').classList.contains('caption')).toBe(true);
    expect(screen.getByRole('heading', { level: 1, name: 'THIS GAME HAS ENDED' })).toBeTruthy();
    const home = screen.getByRole('link', { name: 'Back to home' });
    expect(home.classList.contains('btn-primary')).toBe(true);
  });
});
