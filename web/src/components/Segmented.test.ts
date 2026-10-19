import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import Segmented from './Segmented.svelte';

const LEVELS = [
  { value: 'standard', label: 'Standard' },
  { value: 'expert', label: 'Expert' },
] as const;

type Level = (typeof LEVELS)[number]['value'];

afterEach(() => {
  vi.restoreAllMocks();
});

function renderLevels(value: Level, onchange: (value: Level) => void = vi.fn()) {
  return render(Segmented<Level>, {
    props: { options: LEVELS, value, onchange, label: 'Difficulty' },
  });
}

function group(): HTMLElement {
  return screen.getByRole('group', { name: 'Difficulty' });
}

function indicator(): HTMLElement {
  const element = group().querySelector<HTMLElement>('[data-indicator]');
  if (!element) {
    throw new Error('no indicator');
  }
  return element;
}

/** jsdom lays nothing out: gives a button the place a browser would. */
function placeAt(button: HTMLElement, place: { left: number; width: number }): void {
  Object.defineProperty(button, 'offsetLeft', { value: place.left });
  Object.defineProperty(button, 'offsetWidth', { value: place.width });
  Object.defineProperty(button, 'offsetHeight', { value: 26 });
}

describe('Segmented', () => {
  it('presses the selected option only', () => {
    renderLevels('expert');

    const buttons = within(group()).getAllByRole('button');
    expect(buttons.map((b) => [b.textContent?.trim(), b.getAttribute('aria-pressed')])).toEqual([
      ['Standard', 'false'],
      ['Expert', 'true'],
    ]);
  });

  it('emits the option chosen, and nothing for the selected one', async () => {
    const onchange = vi.fn();
    renderLevels('standard', onchange);

    await fireEvent.click(screen.getByRole('button', { name: 'Standard' }));
    expect(onchange).not.toHaveBeenCalled();

    await fireEvent.click(screen.getByRole('button', { name: 'Expert' }));
    expect(onchange).toHaveBeenCalledExactlyOnceWith('expert');
  });

  it('names an option with an icon in its tooltip too, since its label may be hidden', () => {
    render(Segmented<'all'>, {
      props: {
        options: [{ value: 'all', label: 'All', icon: 'rows-all' }],
        value: 'all',
        onchange: vi.fn(),
        label: 'Table view',
      },
    });

    const button = screen.getByRole('button', { name: 'All' });
    expect(button.getAttribute('title')).toBe('All');
    expect(button.querySelector('svg')).not.toBeNull();
  });

  it('keeps a read-only selection showing', () => {
    render(Segmented<Level>, {
      props: {
        options: LEVELS,
        value: 'expert',
        onchange: vi.fn(),
        label: 'Difficulty',
        disabled: true,
      },
    });

    expect(
      within(group())
        .getAllByRole('button')
        .every((b) => b.hasAttribute('disabled')),
    ).toBe(true);
    expect(screen.getByRole('button', { name: 'Expert' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('places its indicator over the selected option without sliding', () => {
    renderLevels('standard');

    expect(indicator().getAttribute('aria-hidden')).toBe('true');
    expect(indicator().style.transform).toBe('translate(0px, 0px)');
    expect(indicator().dataset.slides).toBeUndefined();
  });

  it('slides its indicator to the new option on a change', async () => {
    const { rerender } = renderLevels('standard');
    placeAt(screen.getByRole('button', { name: 'Expert' }), { left: 90, width: 70 });

    await rerender({ value: 'expert' });
    await tick();

    expect(indicator().style.transform).toBe('translate(90px, 0px)');
    expect(indicator().style.width).toBe('70px');
    expect(indicator().style.height).toBe('26px');
    expect(indicator().dataset.slides).toBe('');
  });

  it('moves its indicator at once under a reduced-motion preference', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) => ({ matches: query === '(prefers-reduced-motion: reduce)' }) as MediaQueryList,
    );
    const { rerender } = renderLevels('standard');
    placeAt(screen.getByRole('button', { name: 'Expert' }), { left: 90, width: 70 });

    await rerender({ value: 'expert' });
    await tick();

    expect(indicator().style.transform).toBe('translate(90px, 0px)');
    expect(indicator().dataset.slides).toBeUndefined();
  });
});
