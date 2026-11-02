import { render, screen } from '@testing-library/svelte';
import Ended from './Ended.svelte';

describe('Ended', () => {
  it('shows its caption, title and text, and links back to home', () => {
    render(Ended, { caption: 'Game over', title: 'THIS GAME HAS ENDED', text: 'Start anew.' });

    expect(screen.getByText('Game over').classList.contains('caption')).toBe(true);
    expect(screen.getByRole('heading', { level: 1, name: 'THIS GAME HAS ENDED' })).toBeTruthy();
    expect(screen.getByText('Start anew.')).toBeTruthy();
    const home = screen.getByRole('link', { name: 'Back to home' });
    expect(home.classList.contains('btn-primary')).toBe(true);
    expect(home.getAttribute('href')).toBe('/');
  });

  it('shows no heading without a title', () => {
    render(Ended, { caption: 'Game not found', text: 'Gone.' });

    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByText('Game not found')).toBeTruthy();
  });
});
