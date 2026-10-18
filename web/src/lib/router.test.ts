import { go, route } from './router.svelte';

function navigate(hash: string): void {
  window.location.hash = hash;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

describe('router', () => {
  it('parses #/g/abc', () => {
    navigate('#/g/abc');
    expect(route.current).toEqual({ name: 'game', id: 'abc' });
  });

  it('parses the home and options routes', () => {
    navigate('#/options');
    expect(route.current).toEqual({ name: 'options' });
    navigate('#/');
    expect(route.current).toEqual({ name: 'home' });
  });

  it('falls back to home on an unknown hash', () => {
    navigate('#/nowhere');
    expect(route.current).toEqual({ name: 'home' });
  });

  it('falls back to home on a malformed escape', () => {
    navigate('#/g/%E0%A4%A');
    expect(route.current).toEqual({ name: 'home' });
  });

  it('go sets the location hash', () => {
    go('#/options');
    expect(window.location.hash).toBe('#/options');
  });
});
