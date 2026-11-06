// Table cards in dock mode (spec 3.6): every card is drawn whole at 60 % of its footprint, scaled
// about its top-left corner, and its element is the drawn box. Out of dock mode nothing changes.
import { render, screen } from '@testing-library/svelte';
import CardView from './CardView.svelte';
import cardViewSource from './CardView.svelte?raw';
import cardFaceSource from './CardFace.svelte?raw';
import { DOCK_MODE_KEY } from './dockMode';
import { DOCK_SCALE } from './dockPiles';
import type { CardView as TableCard, PackFace } from '../lib/types';
import { cardBox, SLOT_GAP } from './layout';
import { card } from './fixtures.testing';

function tableCard(extra: Partial<TableCard> = {}): TableCard {
  return card('c1', { code: '01001a', x: 120, y: 40, z: 7, ...extra });
}

function face(extra: Partial<PackFace> = {}): PackFace {
  return { name: 'Spider-Man', type: 'hero', size: 'std', images: ['spidey.png'], ...extra };
}

/** Renders the card as the table does in dock mode, or out of it. */
function renderCard(
  props: { card: TableCard; face: PackFace | null; ghost?: boolean },
  dock = true,
) {
  return render(CardView, { props, context: new Map([[DOCK_MODE_KEY, { current: dock }]]) });
}

function cardElement(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>('.card');
  if (!el) {
    throw new Error('no .card element');
  }
  return el;
}

/** The element's box, in table units, as its style places it. */
function boxOf(el: HTMLElement): { x: number; y: number; w: number; h: number } {
  return {
    x: Number.parseFloat(el.style.left),
    y: Number.parseFloat(el.style.top),
    w: Number.parseFloat(el.style.width),
    h: Number.parseFloat(el.style.height),
  };
}

function expectDrawnAt60(el: HTMLElement, footprint: { w: number; h: number }): void {
  const box = boxOf(el);
  // The same top-left corner: only the size shrinks.
  expect(box.x).toBe(120);
  expect(box.y).toBe(40);
  expect(box.w).toBeCloseTo(footprint.w * 0.6, 6);
  expect(box.h).toBeCloseTo(footprint.h * 0.6, 6);
  expect(el.classList.contains('scaled')).toBe(true);
  expect(el.style.getPropertyValue('--scale')).toBe('0.6');
}

/** The body of the first rule of the source whose selector list starts with that selector. */
function ruleOf(source: string, selector: string): string | undefined {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\n {2}${escaped}(?: \\{|,[^{]*\\{)([^}]*)\\}`).exec(source)?.[1];
}

describe('CardView in dock mode (small cards, spec 3.6)', () => {
  it('shares its scale with the piles: 60 %', () => {
    expect(DOCK_SCALE).toBe(0.6);
  });

  it.each([
    ['hero', 'Spider-Man'],
    ['ally', 'Black Cat'],
    ['upgrade', 'Web-Shooter'],
    ['treachery', 'Hard to Keep Down'],
  ])('draws a face-up %s whole, at 60 % from its top-left corner', (type, name) => {
    const { container } = renderCard({ card: tableCard(), face: face({ type, name }) });

    const el = cardElement(container);
    expectDrawnAt60(el, cardBox('std', {}));
    const image = screen.getByRole('img', { name });
    expect(image.getAttribute('src')).toBe('spidey.png');
    expect(image.parentElement).toBe(el);
    // No art tile: neither the illustration cut out of the face nor a name strip.
    expect(container.querySelector('.tile, .art, .name')).toBeNull();
    expect(el.classList.contains('tile')).toBe(false);
  });

  it('draws a landscape scheme whole, at 60 % from its top-left corner', () => {
    const { container } = renderCard({
      card: tableCard(),
      face: face({ type: 'side_scheme', size: 'land', name: 'Bomb Scare' }),
    });

    const el = cardElement(container);
    expectDrawnAt60(el, cardBox('land', {}));
    expect(el.classList.contains('scheme')).toBe(true);
    expect(screen.getByRole('img', { name: 'Bomb Scare' }).classList.contains('land')).toBe(true);
  });

  it('draws a portrait main scheme and a double face at 60 % too', () => {
    const scheme = renderCard({ card: tableCard(), face: face({ type: 'main_scheme' }) });
    expectDrawnAt60(cardElement(scheme.container), cardBox('std', {}));
    scheme.unmount();

    const double = renderCard({ card: tableCard(), face: face({ size: 'dstd' }) });
    expectDrawnAt60(cardElement(double.container), cardBox('dstd', {}));
  });

  it('draws a face-down card at 60 % of a portrait card, its back whole', () => {
    const { container } = renderCard({ card: tableCard({ faceDown: true }), face: face() });

    expectDrawnAt60(cardElement(container), cardBox('std', { faceDown: true }));
    expect(screen.getByRole('img', { name: 'Player card back' })).toBeTruthy();
  });

  it('draws its ghost at the same 60 %', () => {
    const { container } = renderCard({ card: tableCard(), face: face(), ghost: true });

    const el = cardElement(container);
    expect(el.classList.contains('ghost')).toBe(true);
    expectDrawnAt60(el, cardBox('std', {}));
  });

  it('draws its counters in their dock regions, not in the desktop corner pile and tabs', () => {
    const { container } = renderCard({
      card: tableCard({
        exhausted: true,
        tokens: { dmg: 2 },
        status: { tough: 2, retaliate: 1, stunned: 1 },
        mods: { atk: 1 },
      }),
      face: face(),
    });

    const el = cardElement(container);
    expect(el.classList.contains('exhausted')).toBe(true);
    const layer = el.querySelector<HTMLElement>(':scope > .dock-counters');
    expect(layer).not.toBeNull();
    // Inside the card box, which turns it with the card.
    expect(el.querySelector('.tokens, .statuses, .mods')).toBeNull();

    const damage = layer?.querySelector<HTMLElement>('.tok.dmg');
    expect(damage?.textContent).toBe('2');
    expect(damage?.dataset.counter).toBe('token:dmg');
    // Placed by dockCounters.ts: its box is inline.
    expect(damage?.style.left).toMatch(/px$/);
    expect(damage?.style.width).toMatch(/px$/);
    // Initials, in status order, on a 67.2 px wide card at zoom 1: "S" and "T×2" leave no room
    // for "R1", so the row ends with "+2" (the measure without a canvas: 0.7 em a character).
    const chips = [...(layer?.querySelectorAll('.st:not(.mod)') ?? [])].map(
      (chip) => chip.textContent,
    );
    expect(chips).toEqual(['S', '+2']);
    expect(layer?.querySelector('.st.more')?.textContent).toBe('+2');
    const modifier = layer?.querySelector('.st.mod');
    expect(modifier?.querySelector('.n')?.textContent).toBe('+1');
    expect(modifier?.textContent).toBe('+1 ATK');
  });

  it('draws a modifier badge whole at 11 px, out of the left edge when the card is too narrow', () => {
    const { container } = render(CardView, {
      props: { card: tableCard({ tokens: { dmg: 1 }, mods: { hp: 2 } }), face: face() },
      context: new Map([[DOCK_MODE_KEY, { current: true, zoom: 0.75 }]]),
    });

    const badge = container.querySelector<HTMLElement>('.dock-counters .st.mod');
    expect(badge?.textContent).toBe('+2 HP');
    // The measure without a canvas gives 0.7 em a character: "+2 HP" needs 38.5 and 2 + 2 of
    // padding, more than the 29.9 left of the tokens on a 50.4 px card. It stands out of the left
    // edge, short of the neighbouring slot: 40 table units at 60 %, 18 px at this zoom.
    const left = Number.parseFloat(badge?.style.left ?? '');
    const width = Number.parseFloat(badge?.style.width ?? '');
    expect(width).toBeCloseTo(5 * 11 * 0.7 + 4, 6);
    expect(left).toBeLessThan(0);
    expect(left).toBeGreaterThanOrEqual(-SLOT_GAP * DOCK_SCALE * 0.75);
    // The whole text in one size, never clipped.
    expect(ruleOf(cardViewSource, '.dock-counters .st')).not.toContain('overflow: hidden');
    expect(cardViewSource).not.toMatch(/\.mod \.stat/);
  });

  it('undoes the table zoom in its counter layer, so that it draws in screen px', () => {
    const { container } = render(CardView, {
      props: { card: tableCard({ tokens: { dmg: 1 } }), face: face() },
      context: new Map([[DOCK_MODE_KEY, { current: true, zoom: 0.8 }]]),
    });

    const layer = container.querySelector<HTMLElement>('.dock-counters');
    expect(Number(layer?.style.getPropertyValue('zoom'))).toBeCloseTo(1.25, 6);
  });

  it('zooms its face, back and shade by its scale, and turns about its own centre', () => {
    expect(ruleOf(cardViewSource, '.card.scaled > :global(*)')).toContain('zoom: var(--scale);');
    // Its counters keep 11 screen px.
    expect(ruleOf(cardViewSource, '.dock-counters .tok')).toContain('font-size: 11px;');
    expect(ruleOf(cardViewSource, '.dock-counters .st')).toContain('font-size: 11px;');
    // The tilt turns the element about its own centre: the drawn card's.
    expect(ruleOf(cardViewSource, '.card.exhausted')).toContain(
      'transform: rotate(var(--exhaust-angle));',
    );
    expect(cardViewSource).not.toMatch(/transform-origin/);
  });

  it('draws no art tile anywhere', () => {
    expect(cardViewSource).not.toMatch(/artWindow|cardArt|class:tile/);
    expect(cardFaceSource).not.toMatch(/artWindow|CardArt|\.tile/);
  });
});

describe('CardView out of dock mode', () => {
  it('draws the card at its full footprint, unscaled', () => {
    const { container } = renderCard({ card: tableCard(), face: face() }, false);

    const el = cardElement(container);
    expect(boxOf(el)).toEqual({ x: 120, y: 40, w: 112, h: 157 });
    expect(el.classList.contains('scaled')).toBe(false);
    expect(el.style.getPropertyValue('--scale')).toBe('');
  });

  it('draws its counters in the desktop corner pile and tabs, without the dock layer', () => {
    const { container } = renderCard(
      {
        card: tableCard({ tokens: { dmg: 2 }, status: { stunned: 1 }, mods: { atk: 1 } }),
        face: face(),
      },
      false,
    );

    expect(container.querySelector('.dock-counters')).toBeNull();
    expect(container.querySelector('.tokens.bottom-right .tok.dmg')?.textContent).toBe('2');
    expect(container.querySelector('.statuses .st.stunned')?.textContent).toBe('Stunned');
    expect(container.querySelector('.mods .st.mod')?.textContent).toBe('+1 ATK');
  });

  it('draws the card at its full footprint outside any table', () => {
    const { container } = render(CardView, { card: tableCard(), face: face({ size: 'land' }) });

    const el = cardElement(container);
    expect(boxOf(el)).toEqual({ x: 120, y: 40, w: 157, h: 112 });
    expect(el.classList.contains('scaled')).toBe(false);
  });
});
