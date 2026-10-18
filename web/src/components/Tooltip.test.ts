import { fireEvent, render, screen } from '@testing-library/svelte';
import Tooltip from './Tooltip.svelte';

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

function button(tip: string, kbd?: string): HTMLElement {
  const element = document.createElement('button');
  element.dataset.tip = tip;
  if (kbd) {
    element.dataset.kbd = kbd;
  }
  document.body.append(element);
  return element;
}

describe('Tooltip', () => {
  it('shows the name and the key after a short hover', async () => {
    vi.useFakeTimers();
    render(Tooltip);
    const exhaust = button('Exhaust', 'E');

    await fireEvent.pointerOver(exhaust);
    expect(screen.queryByRole('tooltip')).toBeNull();
    await vi.advanceTimersByTimeAsync(350);
    const tip = screen.getByRole('tooltip');
    expect(tip.textContent).toBe('ExhaustE');
    expect(tip.querySelector('kbd')?.textContent).toBe('E');
  });

  it('hides when the pointer moves away or presses', async () => {
    vi.useFakeTimers();
    render(Tooltip);
    const exhaust = button('Exhaust', 'E');
    const other = document.createElement('div');
    document.body.append(other);

    await fireEvent.pointerOver(exhaust);
    await vi.advanceTimersByTimeAsync(350);
    await fireEvent.pointerOver(other);
    expect(screen.queryByRole('tooltip')).toBeNull();

    await fireEvent.pointerOver(exhaust);
    await vi.advanceTimersByTimeAsync(350);
    await fireEvent.pointerDown(exhaust);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
