import { render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
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

describe('App title', () => {
  it('follows the route', () => {
    navigate('/about');
    render(App);
    expect(document.title).toBe('About · Into the Fray');

    navigate('/options');
    flushSync();
    expect(document.title).toBe('Options · Into the Fray');

    navigate('/');
    flushSync();
    expect(document.title).toBe('Into the Fray · Play Marvel Champions in your browser');
  });
});
