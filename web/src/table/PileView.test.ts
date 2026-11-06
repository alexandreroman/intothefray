import { fireEvent, render, screen } from '@testing-library/svelte';
import { DOCK_MODE_KEY } from './dockMode';
import { interaction } from './interaction.svelte';
import PileView from './PileView.svelte';
import pileSource from './PileView.svelte?raw';
import tableSource from './Table.svelte?raw';
import type { CardView as TableCard, PackFace, PileView as TablePile } from '../lib/types';
import { card, pile } from './fixtures.testing';

const ENCOUNTER_BACK = 'https://img.intothefray.xyz/assets/back-encounter.avif';

function topCard(extra: Partial<TableCard> = {}): TableCard {
  return card('c9', { code: '01101', back: 'encounter', owner: -1, zone: 'pile', z: 0, ...extra });
}

function face(extra: Partial<PackFace> = {}): PackFace {
  return { name: 'Hydra Mercenary', type: 'minion', size: 'std', images: ['hydra.png'], ...extra };
}

function pileElement(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>('.pile');
  if (!el) {
    throw new Error('no .pile element');
  }
  return el;
}

describe('PileView', () => {
  it('empty pile renders a slot without count', () => {
    const { container } = render(PileView, { pile: pile('enc', { kind: 'discard', count: 0 }) });

    const el = pileElement(container);
    expect(el.classList.contains('inert')).toBe(true);
    expect(el.querySelector('.slot')).toBeTruthy();
    expect(el.querySelector('.count')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('a pile without listed cards shows its back and its count', () => {
    const { container } = render(PileView, {
      pile: pile('enc', { kind: 'encounter', x: 120, y: 20, count: 12 }),
    });

    expect(screen.getByRole('img', { name: 'Encounter card back' }).getAttribute('src')).toBe(
      ENCOUNTER_BACK,
    );
    const el = pileElement(container);
    expect(el.querySelector('.count')?.textContent).toBe('12');
    expect(el.querySelector('.count')?.classList.contains('count-pill')).toBe(true);
    expect(el.style.left).toBe('120px');
    expect(el.style.top).toBe('20px');
    expect(el.style.width).toBe('112px');
    expect(el.style.height).toBe('157px');
    expect(el.dataset.id).toBe('enc');
  });

  it('draws its count over its card and every ring the table draws on it', () => {
    const zOf = (rule: string | undefined) => Number(/z-index: (\d+);/.exec(rule ?? '')?.[1]);
    const count = zOf(/\n {2}\.count \{([^}]*)\}/.exec(pileSource)?.[1]);
    const rings = zOf(/drop-pile\)::before \{([^}]*)\}/.exec(tableSource)?.[1]);
    expect(rings).toBeGreaterThan(0);
    expect(count).toBeGreaterThan(rings);
  });

  it('fades its count out of the way of an animation on its opacity alone', () => {
    const rule = (selector: string) =>
      new RegExp(`\\n {2}${selector} \\{([^}]*)\\}`).exec(pileSource)?.[1];
    expect(rule('\\.count\\.hushed')).toContain('opacity: 0;');
    expect(rule('\\.count')).toContain('transition: opacity 0.12s');
    expect(pileSource).not.toMatch(/filter:/);
  });

  it('draws the ring of the player who previews it inside itself, so that it follows the pile', () => {
    interaction.previewByOthers(new Map([['enc', 2]]));
    try {
      const { container } = render(PileView, {
        pile: pile('enc', { kind: 'encounter', count: 3 }),
      });

      const ring = pileElement(container).querySelector<HTMLElement>(':scope > .rring');
      expect(ring?.style.getPropertyValue('--c')).toBe('var(--p3)');
    } finally {
      interaction.reset();
    }
  });

  it('a player deck shows the player back', () => {
    render(PileView, { pile: pile('enc', { kind: 'deck', owner: 0, count: 30 }) });
    expect(screen.getByRole('img', { name: 'Player card back' })).toBeTruthy();
  });

  it('a side deck with its own back draws that back captioned, one without the player back', () => {
    const gift = pile('side:p0:0', { kind: 'sideDeck', owner: 0, count: 3, label: 'Gift' });
    render(PileView, { pile: { ...gift, back: 'encounter' } });
    const back = screen.getByRole('img', { name: 'Gift card back' });
    expect(back.querySelector('img')?.getAttribute('src')).toBe(ENCOUNTER_BACK);
    expect(back.querySelector('.caption')?.textContent).toBe('GIFT');

    const invocation = pile('side:p0:1', { kind: 'sideDeck', owner: 0, count: 5 });
    render(PileView, { pile: { ...invocation, label: 'Invocation' } });
    expect(screen.getByRole('img', { name: 'Player card back' })).toBeTruthy();
  });

  it('a pile listing its cards shows the face of the top one', () => {
    const shown = pile('enc', { kind: 'encounterDiscard', count: 2, cards: ['c8', 'c9'] });
    render(PileView, { pile: shown, top: topCard(), face: face() });

    const img = screen.getByRole('img', { name: 'Hydra Mercenary' });
    expect(img.getAttribute('src')).toBe('hydra.png');
  });

  it('a face-down top card shows its back, whatever face it is given', () => {
    const shown = pile('enc', { kind: 'deck', count: 2, cards: ['c8', 'c9'] });
    render(PileView, { pile: shown, top: topCard({ faceDown: true }), face: face() });

    expect(screen.getByRole('img', { name: 'Encounter card back' })).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'Hydra Mercenary' })).toBeNull();
  });

  it('a landscape top card shows in a portrait slot', () => {
    const shown = pile('enc', { kind: 'encounterDiscard', count: 1, cards: ['c9'] });
    const { container } = render(PileView, {
      pile: shown,
      top: topCard(),
      face: face({ size: 'land', name: 'Bomb Scare' }),
    });

    expect(screen.getByRole('img', { name: 'Bomb Scare' })).toBeTruthy();
    const el = pileElement(container);
    expect(el.style.width).toBe('112px');
    expect(el.style.height).toBe('157px');
    expect(el.querySelector('.land-in-portrait img')).toBeTruthy();
  });

  it('a pile has no label: its owner is named by the frame around it', () => {
    const { container } = render(PileView, { pile: pile('enc', { kind: 'encounter', count: 3 }) });

    const el = pileElement(container);
    expect(el.querySelector('.label')).toBeNull();
    expect(el.querySelector('.tray')).toBeNull();
  });

  it('a press takes the focus away from a control clicked before, as on a card', async () => {
    const button = document.createElement('button');
    document.body.append(button);
    button.focus();
    try {
      const { container } = render(PileView, {
        pile: pile('enc', { kind: 'encounter', count: 3 }),
      });

      await fireEvent.pointerDown(pileElement(container), { button: 0 });

      expect(interaction.held?.element).toEqual({ kind: 'pile', id: 'enc' });
      expect(document.activeElement).not.toBe(button);
    } finally {
      interaction.reset();
      button.remove();
    }
  });
});

describe('PileView in dock mode (small piles)', () => {
  // The discard pile as the table's projection draws it (dockLayout.ts): its corner at 74, 65.2.
  const discard = pile('enc', { kind: 'encounterDiscard', x: 74, y: 65.2, count: 12 });

  function renderPile(props: { pile: TablePile }, dock = true) {
    return render(PileView, { props, context: new Map([[DOCK_MODE_KEY, { current: dock }]]) });
  }

  it('is drawn at 60 % from its drawn corner, as its hit and drop area, with its count', () => {
    const { container } = renderPile({ pile: discard });

    const el = pileElement(container);
    const [left, top, width, height] = [
      el.style.left,
      el.style.top,
      el.style.width,
      el.style.height,
    ].map(Number.parseFloat);
    expect(left).toBeCloseTo(74, 6);
    expect(top).toBeCloseTo(65.2, 6);
    expect(width).toBeCloseTo(67.2, 6);
    expect(height).toBeCloseTo(94.2, 6);
    expect(el.classList.contains('scaled')).toBe(true);
    expect(el.style.getPropertyValue('--scale')).toBe('0.6');
    expect(el.querySelector('.count')?.textContent).toBe('12');
  });

  it('zooms what it draws by its scale, so that its back and face shrink alike', () => {
    const rule = (selector: string) =>
      new RegExp(`\\n {2}${selector} \\{([^}]*)\\}`).exec(pileSource)?.[1];
    const inner = /\n {2}(\.card\.scaled > \.shade,[^{]*)\{([^}]*)\}/.exec(pileSource);
    expect(inner?.[1]).toContain('.card.scaled > .art');
    expect(inner?.[1]).toContain('.card.scaled > .slot');
    expect(inner?.[2]).toContain('zoom: var(--scale);');
    expect(rule('\\.card\\.scaled \\.count')).toMatch(
      /font-size: max\(9px, 9px \/ var\(--z, 1\)\);/,
    );
    // Nothing is drawn smaller inside the element: the table's rings go round it as it is.
    expect(pileSource).not.toMatch(/scale: 0\.6;/);
    expect(pileSource).not.toMatch(/class:small/);
  });

  it('is drawn full size in its slot out of dock mode', () => {
    const { container } = renderPile({ pile: discard }, false);

    const el = pileElement(container);
    expect(el.classList.contains('scaled')).toBe(false);
    expect(el.style.left).toBe('74px');
    expect(el.style.top).toBe('65.2px');
    expect(el.style.width).toBe('112px');
    expect(el.style.height).toBe('157px');
  });

  it('is drawn full size outside any table', () => {
    const { container } = render(PileView, { pile: discard });

    expect(pileElement(container).classList.contains('scaled')).toBe(false);
  });
});
