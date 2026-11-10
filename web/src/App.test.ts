import { fireEvent, render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import App from './App.svelte';
import appSource from './App.svelte?raw';
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

describe('App tooltips', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('hide with their screen when the route changes, the pointer still', async () => {
    vi.useFakeTimers();
    navigate('/');
    render(App);
    const options = screen.getByRole('button', { name: 'Options' });

    await fireEvent.pointerOver(options);
    await vi.advanceTimersByTimeAsync(350);
    expect(screen.getByRole('tooltip').textContent).toBe('Options');

    navigate('/about');
    flushSync();
    await vi.advanceTimersByTimeAsync(0);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

describe('App status bar backdrop', () => {
  // jsdom has no env() and applies no stylesheet: the rule itself is checked.
  const rule = /\n {2}\.status-backdrop \{([^}]*)\}/.exec(appSource)?.[1] ?? '';

  it('lies behind the status bar of a Home Screen app on every screen, as tall as the top safe area', () => {
    navigate('/');
    const { container } = render(App);
    const backdrop = container.querySelector('.status-backdrop');
    expect(backdrop?.getAttribute('aria-hidden')).toBe('true');

    expect(rule).toMatch(/position: fixed;/);
    expect(rule).toMatch(/top: 0;/);
    expect(rule).toMatch(/left: 0;/);
    expect(rule).toMatch(/right: 0;/);
    expect(rule).toMatch(/height: var\(--status-room\);/);
    expect(rule).toMatch(/background: var\(--bg\);/);
    expect(rule).toMatch(/pointer-events: none;/);
  });

  it('leaves the table to draw its own band, under its dialogs and sheets (Table.svelte)', () => {
    const onTable = /\n {2}:global\(html\.fixed-screen\) \.status-backdrop \{([^}]*)\}/.exec(
      appSource,
    )?.[1];
    expect(onTable).toMatch(/display: none;/);
  });

  it('stands over the pages and their top bar, under the sheets, the dialogs and the tooltips', () => {
    const zIndex = Number(/z-index: (\d+);/.exec(rule)?.[1]);
    // The connection status (Game.svelte) over the top bar (TopBar.svelte), then the sheets
    // (Sheet.svelte), the dialogs (Dialog.svelte) and the tooltips (Tooltip.svelte).
    expect(zIndex).toBeGreaterThan(200);
    expect(zIndex).toBeLessThan(5500);
  });
});
