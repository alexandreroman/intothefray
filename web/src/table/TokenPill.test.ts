import { fireEvent, render, screen } from '@testing-library/svelte';
import TokenPill from './TokenPill.svelte';

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
});
