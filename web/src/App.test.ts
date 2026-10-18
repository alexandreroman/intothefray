import { render, screen } from '@testing-library/svelte';
import App from './App.svelte';

describe('App', () => {
  it('shows the title on the home route', () => {
    window.location.hash = '#/';
    render(App);
    expect(screen.getByText('INTO THE FRAY')).toBeTruthy();
  });
});
