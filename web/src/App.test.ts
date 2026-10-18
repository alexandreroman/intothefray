import { render, screen } from '@testing-library/svelte';
import App from './App.svelte';

describe('App', () => {
  it('shows the title on the home route', () => {
    window.location.hash = '#/';
    render(App);
    expect(screen.getByRole('heading', { name: 'INTO THE FRAY' })).toBeTruthy();
  });
});

describe('App routes', () => {
  it('shows the options screen', async () => {
    window.location.hash = '#/options';
    render(App);
    expect(await screen.findByText('Saved in this browser only.')).toBeTruthy();
  });
});
