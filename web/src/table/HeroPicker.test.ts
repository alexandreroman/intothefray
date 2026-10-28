import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import HeroPicker, { type HeroEntry } from './HeroPicker.svelte';
import pickerSource from './HeroPicker.svelte?raw';

const SPIDER_MAN: HeroEntry = {
  seat: 0,
  label: 'Alex · Spider-Man',
  name: 'Spider-Man',
  image: 'https://img.example/01001a.avif',
  color: 'var(--p1)',
  handCount: 5,
};
const ANT_MAN: HeroEntry = {
  seat: 1,
  label: 'Alex · Ant-Man',
  name: 'Ant-Man',
  image: 'https://img.example/12001a.avif',
  color: 'var(--p1)',
  handCount: 3,
};
// Kim has loaded no deck yet: the player's name stands in for the hero's.
const KIM: HeroEntry = { seat: 2, label: 'Kim', name: 'Kim', color: 'var(--p3)', handCount: 0 };

function group(): HTMLElement {
  return screen.getByRole('radiogroup', { name: 'Hand shown' });
}

function radios(): HTMLElement[] {
  return within(group()).getAllByRole('radio');
}

function checked(): (string | null)[] {
  return within(group())
    .getAllByRole('radio', { checked: true })
    .map((radio) => radio.getAttribute('aria-label'));
}

/** The declarations of a rule of the picker's stylesheet. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.[\]()]/g, (char) => `\\${char}`);
  const pattern = new RegExp(`\\n {2}${escaped} \\{([^}]*)\\}`);
  return pattern.exec(pickerSource)?.[1] ?? '';
}

/**
 * Renders the picker as the table does: a pick makes the picked seat the current one. Returns the
 * spy on the picks and the render's result.
 */
function renderPicker(entries: HeroEntry[], current: number) {
  const onpick = vi.fn<(seat: number) => void>();
  const result = render(HeroPicker, { entries, current, label: 'Hand shown', onpick });
  onpick.mockImplementation((seat) => void result.rerender({ current: seat }));
  return { onpick, ...result };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('HeroPicker', () => {
  it('names each entry with its player and hero, in its label and tooltip', () => {
    renderPicker([SPIDER_MAN, ANT_MAN, KIM], 0);

    expect(radios().map((radio) => [radio.getAttribute('aria-label'), radio.dataset.tip])).toEqual([
      ['Alex · Spider-Man', 'Alex · Spider-Man'],
      ['Alex · Ant-Man', 'Alex · Ant-Man'],
      ['Kim', 'Kim'],
    ]);
  });

  it('checks the current entry, the only one tabbed to', () => {
    renderPicker([SPIDER_MAN, ANT_MAN], 1);

    expect(radios().map((radio) => [radio.getAttribute('aria-checked'), radio.tabIndex])).toEqual([
      ['false', -1],
      ['true', 0],
    ]);
  });

  it('picks an entry when it is clicked, and the check follows', async () => {
    const { onpick } = renderPicker([SPIDER_MAN, ANT_MAN], 0);

    await fireEvent.click(within(group()).getByRole('radio', { name: 'Alex · Ant-Man' }));
    expect(onpick).toHaveBeenCalledExactlyOnceWith(1);
    await waitFor(() => expect(checked()).toEqual(['Alex · Ant-Man']));
  });

  it('names its hero beside the current entry only', () => {
    const { container } = renderPicker([SPIDER_MAN, ANT_MAN, KIM], 1);

    // Every entry holds its name, so that it can unfold and fold; the hero's, else the player's.
    expect(radios().map((radio) => radio.querySelector('.txt')?.textContent)).toEqual([
      'Spider-Man',
      'Ant-Man',
      'Kim',
    ]);
    // jsdom applies no stylesheet: the rules themselves are checked. Folded, but on the current entry.
    expect(rule('.item .name')).toMatch(/max-width: 0;/);
    expect(rule(".item[aria-checked='true'] .name")).toMatch(/max-width: var\(--nw/);
    expect(container.querySelector('[aria-checked="true"] .txt')?.textContent).toBe('Ant-Man');
  });

  it('moves the choice and the focus with the arrow keys, round the entries', async () => {
    const { onpick } = renderPicker([SPIDER_MAN, ANT_MAN, KIM], 0);
    const first = within(group()).getByRole('radio', { name: 'Alex · Spider-Man' });
    first.focus();

    await fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(onpick).toHaveBeenLastCalledWith(1);
    await waitFor(() =>
      expect(document.activeElement?.getAttribute('aria-label')).toBe('Alex · Ant-Man'),
    );

    await fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    await waitFor(() => expect(document.activeElement?.getAttribute('aria-label')).toBe('Kim'));
    await fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    await waitFor(() => expect(document.activeElement).toBe(first));
    await fireEvent.keyDown(first, { key: 'ArrowLeft' });
    await waitFor(() => expect(document.activeElement?.getAttribute('aria-label')).toBe('Kim'));
    await fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    await waitFor(() => expect(checked()).toEqual(['Alex · Ant-Man']));
  });

  it('leaves other keys to the table', async () => {
    const { onpick } = renderPicker([SPIDER_MAN, ANT_MAN], 0);
    const first = within(group()).getByRole('radio', { name: 'Alex · Spider-Man' });

    const unhandled = await fireEvent.keyDown(first, { key: 'q' });
    expect(unhandled).toBe(true);
    expect(onpick).not.toHaveBeenCalled();
  });

  it('offers no previous and next buttons with two entries', () => {
    renderPicker([SPIDER_MAN, ANT_MAN], 0);

    expect(screen.queryByRole('button', { name: 'Next hero' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Previous hero' })).toBeNull();
  });

  it('steps round the entries with the previous and next buttons from three entries', async () => {
    const { onpick } = renderPicker([SPIDER_MAN, ANT_MAN, KIM], 0);

    await fireEvent.click(screen.getByRole('button', { name: 'Previous hero' }));
    expect(onpick).toHaveBeenLastCalledWith(2);
    await waitFor(() => expect(checked()).toEqual(['Kim']));
    await fireEvent.click(screen.getByRole('button', { name: 'Next hero' }));
    expect(onpick).toHaveBeenLastCalledWith(0);
  });

  it('shows the hand size of each entry in its badge', () => {
    renderPicker([SPIDER_MAN, ANT_MAN, KIM], 0);

    expect(radios().map((radio) => radio.querySelector('.n')?.textContent)).toEqual([
      '5',
      '3',
      '0',
    ]);
  });

  it("shows the hero's art, and a disc of the seat colour for a seat without a hero", () => {
    renderPicker([SPIDER_MAN, KIM], 0);

    const [spiderMan, kim] = radios();
    expect(spiderMan!.querySelector('img')?.getAttribute('src')).toBe(SPIDER_MAN.image);
    expect(kim!.querySelector('img')).toBeNull();
    expect(kim!.style.getPropertyValue('--seat')).toBe('var(--p3)');
  });

  it('rings the current avatar in its colour, sliding from avatar to avatar', async () => {
    const { container } = renderPicker([SPIDER_MAN, ANT_MAN, KIM], 0);
    const ring = container.querySelector<HTMLElement>('.ring')!;
    expect(ring.getAttribute('aria-hidden')).toBe('true');
    expect([ring.style.getPropertyValue('--at'), ring.style.getPropertyValue('--ring')]).toEqual([
      '0',
      'var(--p1)',
    ]);

    await fireEvent.click(within(group()).getByRole('radio', { name: 'Kim' }));
    await waitFor(() =>
      expect([ring.style.getPropertyValue('--at'), ring.style.getPropertyValue('--ring')]).toEqual([
        '2',
        'var(--p3)',
      ]),
    );
    // The avatars before the current one have their names folded: the ring's place is their count.
    expect(rule('.ring')).toMatch(
      /transform: translateX\(calc\(var\(--at\) \* \(var\(--avatar\) \+ var\(--spacing\)\)\)\);/,
    );
    expect(rule('.ring')).toMatch(/transform 0\.3s ease/);
    expect(rule('.ring')).toMatch(/box-shadow 0\.3s ease/);
  });

  it('sizes every name box to the longest name, whatever the current entry', async () => {
    // jsdom lays nothing out: a name's natural width is 7 px a letter here.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      const width = this.classList.contains('txt') ? (this.textContent?.length ?? 0) * 7 : 0;
      return { x: 0, y: 0, left: 0, top: 0, right: width, bottom: 0, width, height: 0 } as DOMRect;
    });
    const { container, rerender } = renderPicker([SPIDER_MAN, ANT_MAN, KIM], 0);
    const nameWidth = () =>
      container.querySelector<HTMLElement>('.heroes')?.style.getPropertyValue('--nw');
    // "Spider-Man", 10 letters.
    await waitFor(() => expect(nameWidth()).toBe('70px'));

    // A switch leaves it: the name folding gives the room the one unfolding takes.
    await fireEvent.click(within(group()).getByRole('radio', { name: 'Kim' }));
    await waitFor(() => expect(checked()).toEqual(['Kim']));
    expect(nameWidth()).toBe('70px');

    // New names are measured again.
    await rerender({ entries: [SPIDER_MAN, ANT_MAN, { ...KIM, name: 'Captain Marvel' }] });
    await waitFor(() => expect(nameWidth()).toBe('98px'));
  });

  it('animates nothing under a reduced-motion preference', () => {
    const reduced = /@media \(prefers-reduced-motion: reduce\) \{([^]*?)\n {2}\}/.exec(
      pickerSource,
    )?.[1];
    expect(reduced).toMatch(/\.ring,\s*\.name,\s*\.txt,\s*\.art \{\s*transition: none;/);
  });
});
