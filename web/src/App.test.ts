import { render, screen } from '@testing-library/svelte';
import App from './App.svelte';
import { navigate } from './lib/router.testing';

describe('App', () => {
  it('shows the title on the home route', () => {
    navigate('/');
    render(App);
    expect(screen.getByRole('heading', { name: 'Into the Fray' })).toBeTruthy();
  });
});

describe('App routes', () => {
  it('shows the options screen', async () => {
    navigate('/options');
    render(App);
    expect(
      await screen.findByText('Saved in this browser only. Changes apply right away.'),
    ).toBeTruthy();
  });
});
