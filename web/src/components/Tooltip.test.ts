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

  it('speaks from below an element at the top of the window, else from above', async () => {
    vi.useFakeTimers();
    render(Tooltip);
    const high = button('Fullscreen');
    high.getBoundingClientRect = () => new DOMRect(100, 10, 40, 40);
    const low = button('Draw 1');
    low.getBoundingClientRect = () => new DOMRect(100, 400, 40, 40);

    await fireEvent.pointerOver(high);
    await vi.advanceTimersByTimeAsync(350);
    expect(screen.getByRole('tooltip').classList.contains('below')).toBe(true);

    await fireEvent.pointerOver(low);
    await vi.advanceTimersByTimeAsync(350);
    expect(screen.getByRole('tooltip').classList.contains('below')).toBe(false);
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
