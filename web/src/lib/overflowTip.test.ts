import { fireEvent, render, screen } from '@testing-library/svelte';
import Tooltip from '../components/Tooltip.svelte';
import { overflowTip } from './overflowTip';
import { setWidths } from './overflowTip.testing';

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

/** A line of text, as wide as its text (scrollWidth) and as its box (clientWidth). */
function line(text: string, widths: { scroll: number; client: number }): HTMLElement {
  const element = document.createElement('span');
  element.textContent = text;
  setWidths(element, widths);
  document.body.append(element);
  return element;
}

describe('overflowTip', () => {
  it('gives a cut text its full text as a tooltip', async () => {
    const element = line('Spectacular Spider-Man', { scroll: 180, client: 120 });
    overflowTip(element);

    await fireEvent.pointerOver(element);
    expect(element.dataset.tip).toBe('Spectacular Spider-Man');
  });

  it('gives no tooltip to a text that fits, rounding aside', async () => {
    const element = line('Spider-Man', { scroll: 121, client: 120 });
    overflowTip(element);

    await fireEvent.pointerOver(element);
    expect(element.dataset.tip).toBeUndefined();
  });

  it('drops its tooltip once the text fits again', async () => {
    const element = line('Spectacular Spider-Man', { scroll: 180, client: 120 });
    overflowTip(element);
    await fireEvent.pointerOver(element);

    setWidths(element, { scroll: 180, client: 200 });
    await fireEvent.pointerOver(element);
    expect(element.dataset.tip).toBeUndefined();
  });

  it("leaves an element's own tooltip alone", async () => {
    const element = line('Spectacular Spider-Man', { scroll: 180, client: 120 });
    element.dataset.tip = '5 cards in hand';
    overflowTip(element);

    await fireEvent.pointerOver(element);
    expect(element.dataset.tip).toBe('5 cards in hand');

    setWidths(element, { scroll: 180, client: 200 });
    await fireEvent.pointerOver(element);
    expect(element.dataset.tip).toBe('5 cards in hand');
  });

  it('is shown by the tooltip from the first hover', async () => {
    vi.useFakeTimers();
    render(Tooltip);
    const element = line('Spectacular Spider-Man', { scroll: 180, client: 120 });
    overflowTip(element);

    await fireEvent.pointerOver(element);
    await vi.advanceTimersByTimeAsync(350);
    expect(screen.getByRole('tooltip').textContent).toBe('Spectacular Spider-Man');
  });

  it('stops listening once destroyed', async () => {
    const element = line('Spectacular Spider-Man', { scroll: 180, client: 120 });
    overflowTip(element).destroy?.();

    await fireEvent.pointerOver(element);
    expect(element.dataset.tip).toBeUndefined();
  });
});
