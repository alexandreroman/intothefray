import { render, screen } from '@testing-library/svelte';
import App from './App.svelte';

// Moves the address bar as the browser does on back/forward, then tells the router.
function navigate(path: string): void {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

describe('App', () => {
  it('shows the title on the home route', () => {
    navigate('/');
    render(App);
    expect(screen.getByRole('heading', { name: 'Into The Fray' })).toBeTruthy();
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
