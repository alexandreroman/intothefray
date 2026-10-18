import { fireEvent, render, screen } from '@testing-library/svelte';
import TokenPill from './TokenPill.svelte';

function renderPill(value = 3) {
  const anchor = document.createElement('span');
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
});
