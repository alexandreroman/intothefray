import { render, screen } from '@testing-library/svelte';
import { interaction } from './interaction.svelte';
import PileView from './PileView.svelte';
import pileSource from './PileView.svelte?raw';
import tableSource from './Table.svelte?raw';
import type { CardView as TableCard, PackFace, PileView as Pile } from '../lib/types';

const ENCOUNTER_BACK =
  'https://pub-d27e6715f4ba4529bc9d8fd13938a5a1.r2.dev/cerebro-cards/EncounterBack.jpg';

function pile(extra: Partial<Pile> = {}): Pile {
  return {
    id: 'enc',
    kind: 'encounter',
    owner: -1,
    x: 0,
    y: 0,
    count: 0,
    ...extra,
  };
}

function topCard(extra: Partial<TableCard> = {}): TableCard {
  return {
    id: 'c9',
    code: '01101',
    face: 0,
    back: 'encounter',
    owner: -1,
    zone: 'pile',
    x: 0,
    y: 0,
    z: 0,
    ...extra,
  };
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

beforeEach(() => {
  localStorage.clear();
});

describe('PileView', () => {
  it('empty pile renders a slot without count', () => {
    const { container } = render(PileView, { pile: pile({ kind: 'discard', count: 0 }) });

    const el = pileElement(container);
    expect(el.classList.contains('inert')).toBe(true);
    expect(el.querySelector('.slot')).toBeTruthy();
    expect(el.querySelector('.count')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('a pile without listed cards shows its back and its count', () => {
    const { container } = render(PileView, { pile: pile({ x: 120, y: 20, count: 12 }) });

    expect(screen.getByRole('img', { name: 'Encounter card back' }).getAttribute('src')).toBe(
      ENCOUNTER_BACK,
    );
    const el = pileElement(container);
    expect(el.querySelector('.count')?.textContent).toBe('12');
    expect(el.style.left).toBe('120px');
    expect(el.style.top).toBe('20px');
    expect(el.style.width).toBe('140px');
    expect(el.style.height).toBe('196px');
    expect(el.dataset.id).toBe('enc');
  });

  it('draws its count over its card and every ring the table draws on it', () => {
    const zOf = (rule: string | undefined) => Number(/z-index: (\d+);/.exec(rule ?? '')?.[1]);
    const count = zOf(/\n {2}\.count \{([^}]*)\}/.exec(pileSource)?.[1]);
    const rings = zOf(/drop-pile\)::before \{([^}]*)\}/.exec(tableSource)?.[1]);
    expect(rings).toBeGreaterThan(0);
    expect(count).toBeGreaterThan(rings);
  });

  it('draws the ring of the player who previews it inside itself, so that it follows the pile', () => {
    interaction.previewByOthers(new Map([['enc', 2]]));
    try {
      const { container } = render(PileView, { pile: pile({ count: 3 }) });

      const ring = pileElement(container).querySelector<HTMLElement>(':scope > .rring');
      expect(ring?.style.getPropertyValue('--c')).toBe('var(--p3)');
    } finally {
      interaction.reset();
    }
  });

  it('a player deck shows the player back', () => {
    render(PileView, { pile: pile({ kind: 'deck', owner: 0, count: 30 }) });
    expect(screen.getByRole('img', { name: 'Player card back' })).toBeTruthy();
  });

  it('a side deck with its own back draws it with its label, a side deck without one the player back', () => {
    const sense = pile({ id: 'side:p0:0', kind: 'sideDeck', owner: 0, count: 5, label: 'Sense' });
    render(PileView, { pile: { ...sense, ownBack: true } });
    const back = screen.getByRole('img', { name: 'Sense card back' });
    expect(back.textContent).toBe('SENSE');

    const invocation = pile({ id: 'side:p0:1', kind: 'sideDeck', owner: 0, count: 5 });
    render(PileView, { pile: { ...invocation, label: 'Invocation' } });
    expect(screen.getByRole('img', { name: 'Player card back' })).toBeTruthy();
  });

  it('a pile listing its cards shows the face of the top one', () => {
    const shown = pile({ kind: 'encounterDiscard', count: 2, cards: ['c8', 'c9'] });
    render(PileView, { pile: shown, top: topCard(), face: face() });

    const img = screen.getByRole('img', { name: 'Hydra Mercenary' });
    expect(img.getAttribute('src')).toBe('hydra.png');
  });

  it('a face-down top card shows its back, whatever face it is given', () => {
    const shown = pile({ kind: 'deck', count: 2, cards: ['c8', 'c9'] });
    render(PileView, { pile: shown, top: topCard({ faceDown: true }), face: face() });

    expect(screen.getByRole('img', { name: 'Encounter card back' })).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'Hydra Mercenary' })).toBeNull();
  });

  it('a landscape top card shows in a portrait slot', () => {
    const shown = pile({ kind: 'encounterDiscard', count: 1, cards: ['c9'] });
    const { container } = render(PileView, {
      pile: shown,
      top: topCard(),
      face: face({ size: 'land', name: 'Bomb Scare' }),
    });

    expect(screen.getByRole('img', { name: 'Bomb Scare' })).toBeTruthy();
    const el = pileElement(container);
    expect(el.style.width).toBe('140px');
    expect(el.style.height).toBe('196px');
    expect(el.querySelector('.land-in-portrait img')).toBeTruthy();
  });

  it('a pile has no label: its owner is named by the frame around it', () => {
    const { container } = render(PileView, { pile: pile({ count: 3 }) });

    const el = pileElement(container);
    expect(el.querySelector('.label')).toBeNull();
    expect(el.querySelector('.tray')).toBeNull();
  });
});
