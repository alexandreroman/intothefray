// The copies of flying cards in dock mode: the table draws its cards and piles at 60 %, so
// a copy flies at that drawn size, its back's label and its face zoomed alike. Out of dock mode
// nothing changes.
import { render } from '@testing-library/svelte';
import Flights from './Flights.svelte';
import flightsSource from './Flights.svelte?raw';
import { DOCK_MODE_KEY } from './dockMode';
import { DOCK_SCALE } from './dockPiles';
import { motion } from './motion.svelte';
import { card } from './fixtures.testing';

/** A face-down card flying from the table to its deck: it shows its back, with its label. */
const TO_DECK = {
  kind: 'toPile',
  key: 1,
  delay: 0,
  from: { cx: 100, cy: 100, w: 67, h: 94 },
  to: { cx: 300, cy: 100, w: 67, h: 94 },
  pile: 'deck:p0',
  card: card('c', { faceDown: true }),
  under: false,
  asOnPile: true,
  turns: undefined,
  quarter: false,
  fades: false,
} as const;

function renderFlights(dock: boolean) {
  vi.spyOn(motion, 'launch').mockReturnValue(() => {});
  motion.flights = [TO_DECK] as unknown as typeof motion.flights;
  return render(Flights, {
    props: { faceOf: () => null, captionOf: () => undefined },
    context: new Map([[DOCK_MODE_KEY, { current: dock }]]),
  });
}

afterEach(() => {
  motion.flights = [];
  vi.restoreAllMocks();
});

describe('a flying copy', () => {
  it('draws what it shows at the dock scale in dock mode (F-R3)', () => {
    const { container } = renderFlights(true);

    const copy = container.querySelector<HTMLElement>('.fly')!;
    expect(copy.classList).toContain('scaled');
    expect(copy.style.getPropertyValue('--scale')).toBe(String(DOCK_SCALE));
    // Its box is the drawn box it was measured at: only what it draws is zoomed.
    expect(copy.style.width).toBe('67px');
  });

  it('draws what it shows at full size out of dock mode', () => {
    const { container } = renderFlights(false);

    const copy = container.querySelector<HTMLElement>('.fly')!;
    expect(copy.classList).not.toContain('scaled');
    expect(copy.style.getPropertyValue('--scale')).toBe('');
  });

  it('zooms its face and its back, and the back inside a turning side, not the side itself nor its shade', () => {
    const rule = /\n {2}(\.fly\.scaled[^{]*)\{\s*zoom: var\(--scale\);/.exec(flightsSource);
    // One selector per line: a comma inside :not() does not split them.
    const selectors = rule?.[1]?.split(/,\s*\n/).map((selector) => selector.trim());
    expect(selectors).toEqual([
      '.fly.scaled > :global(*:not(.side, .shade))',
      '.fly.scaled > .side > :global(*)',
    ]);
  });

  it('casts its shadow from a shade under what it shows, not through a filter', () => {
    const { container } = renderFlights(false);

    const copy = container.querySelector<HTMLElement>('.fly')!;
    expect(copy.firstElementChild?.classList).toContain('shade');
    expect(copy.classList).not.toContain('land');
    const fly = /\n {2}\.fly \{([^}]*)\}/.exec(flightsSource)?.[1];
    expect(fly).not.toMatch(/filter/);
  });

  it('gives a landscape copy the landscape corners', () => {
    vi.spyOn(motion, 'launch').mockReturnValue(() => {});
    const from = { cx: 100, cy: 100, w: 94, h: 67 };
    motion.flights = [{ ...TO_DECK, from }] as unknown as typeof motion.flights;
    const { container } = render(Flights, {
      props: { faceOf: () => null, captionOf: () => undefined },
      context: new Map([[DOCK_MODE_KEY, { current: false }]]),
    });

    expect(container.querySelector('.fly')?.classList).toContain('land');
    expect(flightsSource).toMatch(
      /\n {2}\.fly\.land \.shade \{\s*border-radius: var\(--card-radius-land\);/,
    );
  });
});
