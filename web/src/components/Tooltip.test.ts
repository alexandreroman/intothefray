import { fireEvent, render, screen } from '@testing-library/svelte';
import Tooltip from './Tooltip.svelte';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

/** Gives every tooltip bubble a height; jsdom lays nothing out. */
function bubbleHeight(height: number): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.getAttribute('role') === 'tooltip'
      ? new DOMRect(0, 0, 60, height)
      : new DOMRect(0, 0, 0, 0);
  });
}

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

  it('speaks from above whenever the bubble fits between the element and the window top', async () => {
    vi.useFakeTimers();
    render(Tooltip);
    const element = button('Fullscreen');
    const shownAt = async (top: number): Promise<HTMLElement> => {
      element.getBoundingClientRect = () => new DOMRect(100, top, 40, 40);
      await fireEvent.pointerOver(element);
      await vi.advanceTimersByTimeAsync(350);
      const tip = screen.getByRole('tooltip');
      await fireEvent.pointerOver(document.body);
      return tip;
    };

    bubbleHeight(20);
    expect((await shownAt(40)).classList.contains('below')).toBe(false);
    expect((await shownAt(20)).classList.contains('below')).toBe(true);

    bubbleHeight(40);
    expect((await shownAt(50)).classList.contains('below')).toBe(true);
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

  it('hides when its element leaves the page, as when the screen changes, without a pointer move', async () => {
    vi.useFakeTimers();
    render(Tooltip);
    const screenRoot = document.createElement('div');
    document.body.append(screenRoot);
    const start = document.createElement('button');
    start.dataset.tip = 'Start the game';
    screenRoot.append(start);

    await fireEvent.pointerOver(start);
    await vi.advanceTimersByTimeAsync(350);
    expect(screen.getByRole('tooltip').textContent).toBe('Start the game');

    // The lobby gives way to the table: the button goes with it, under a pointer that does not move.
    screenRoot.remove();
    await vi.advanceTimersByTimeAsync(0);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
