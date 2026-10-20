import { fireEvent, render, screen } from '@testing-library/svelte';
import TokenPill from './TokenPill.svelte';
import pillSource from './TokenPill.svelte?raw';

function renderPill(value = 3, anchor = document.createElement('span')) {
  document.body.append(anchor);
  const onstep = vi.fn();
  render(TokenPill, { props: { anchor: () => anchor, label: 'damage', value, zoom: 1, onstep } });
  return onstep;
}

describe('TokenPill', () => {
  it('shows the value between minus and plus', () => {
    renderPill(3);
    const pill = screen.getByRole('group', { name: 'Change damage' });
    expect(pill.textContent?.replace(/\s/g, '')).toBe('−3+');
  });

  it('steps by one in each direction', async () => {
    const onstep = renderPill();
    await fireEvent.click(screen.getByRole('button', { name: 'Remove 1' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Add 1' }));
    expect(onstep.mock.calls).toEqual([[-1], [1]]);
  });

  it('sits centred above its token, wherever the token is on the card', () => {
    const anchor = document.createElement('span');
    anchor.getBoundingClientRect = () =>
      DOMRect.fromRect({ x: 300, y: 200, width: 28, height: 26 });
    renderPill(3, anchor);

    // jsdom lays nothing out: the pill measures 0 × 0, so it lands at the token's top middle, less the gap.
    const pill = screen.getByRole('group', { name: 'Change damage' });
    expect(pill.style.left).toBe('314px');
    expect(pill.style.top).toBe('198px');
    expect(pill.classList).toContain('placed');
  });

  it('gives − and + a hit area of 44 px a side on a touch screen', () => {
    const coarse = /@media \(pointer: coarse\) \{[\s\S]*?button::before \{([^}]*)\}/.exec(
      pillSource,
    )?.[1];
    expect(coarse).toMatch(/width: max\(100%, 44px\);/);
    expect(coarse).toMatch(/height: max\(100%, 44px\);/);
    // Invisible, and rising from the button: the token under the pill keeps its own taps.
    expect(coarse).not.toMatch(/background|border/);
    expect(coarse).toMatch(/bottom: 0;/);
  });

  it('never starts a text selection, however quickly − and + are clicked', async () => {
    renderPill();
    for (const name of ['Remove 1', 'Add 1']) {
      const button = screen.getByRole('button', { name });
      // fireEvent returns false when the default (starting a selection) is prevented.
      expect(await fireEvent.mouseDown(button, { detail: 2 })).toBe(false);
    }
    // Nor in the browsers that select around a click anyway: nothing in the pill is selectable.
    expect(/\.tokpill \{[^}]*user-select: none;/.exec(pillSource)).not.toBeNull();
  });
});
