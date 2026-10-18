import { render, screen } from '@testing-library/svelte';
import PileView from './PileView.svelte';
import { cardByCode, type CardInfo } from '../lib/catalog';
import type { CardView as TableCard, PackFace, PileView as Pile } from '../lib/types';

vi.mock('../lib/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/catalog')>()),
  cardByCode: vi.fn(),
}));

const ENCOUNTER_BACK =
  'https://pub-d27e6715f4ba4529bc9d8fd13938a5a1.r2.dev/cerebro-cards/EncounterBack.jpg';

function pile(extra: Partial<Pile> = {}): Pile {
  return {
    id: 'enc',
    kind: 'encounter',
    owner: -1,
    area: 'villain',
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

function info(face: Partial<PackFace>): CardInfo {
  const full: PackFace = {
    name: 'Hydra Mercenary',
    type: 'minion',
    size: 'std',
    images: ['hydra.png'],
    ...face,
  };
  return {
    card: { code: '01101', faces: [full], back: 'encounter', quantity: 1 },
    face: 0,
    pack: 'core',
  };
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
  vi.mocked(cardByCode).mockResolvedValue(info({}));
});

afterEach(() => {
  vi.mocked(cardByCode).mockReset();
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
    expect(el.style.width).toBe('100px');
    expect(el.style.height).toBe('140px');
    expect(cardByCode).not.toHaveBeenCalled();
  });

  it('a player deck shows the player back', () => {
    render(PileView, { pile: pile({ kind: 'deck', owner: 0, area: 'p0', count: 30 }) });
    expect(screen.getByRole('img', { name: 'Player card back' })).toBeTruthy();
  });

  it('a pile listing its cards shows the top one', async () => {
    const shown = pile({ kind: 'encounterDiscard', count: 2, cards: ['c8', 'c9'] });
    render(PileView, { pile: shown, top: topCard() });

    const img = await screen.findByRole('img', { name: 'Hydra Mercenary' });
    expect(img.getAttribute('src')).toBe('hydra.png');
    expect(cardByCode).toHaveBeenCalledWith('01101');
  });

  it('a landscape top card shows in a portrait slot', async () => {
    vi.mocked(cardByCode).mockResolvedValue(info({ size: 'land', name: 'Bomb Scare' }));
    const shown = pile({ kind: 'encounterDiscard', count: 1, cards: ['c9'] });
    const { container } = render(PileView, { pile: shown, top: topCard() });

    await screen.findByRole('img', { name: 'Bomb Scare' });
    const el = pileElement(container);
    expect(el.style.width).toBe('100px');
    expect(el.style.height).toBe('140px');
    expect(el.querySelector('.land-in-portrait img')).toBeTruthy();
  });

  it('the victory display is out of play, with a trophy badge', async () => {
    const victory = pile({ id: 'vic', kind: 'victory', count: 1, cards: ['c9'] });
    const { container } = render(PileView, { pile: victory, top: topCard() });

    await screen.findByRole('img', { name: 'Hydra Mercenary' });
    expect(pileElement(container).classList.contains('out')).toBe(true);
    expect(screen.getByRole('img', { name: 'Victory display' })).toBeTruthy();
  });

  it('the set-aside cards are out of play, with an hourglass badge', () => {
    const { container } = render(PileView, {
      pile: pile({ id: 'aside', kind: 'aside', count: 0 }),
    });

    const el = pileElement(container);
    expect(el.classList.contains('out')).toBe(true);
    expect(el.querySelector('.slot')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Set-aside cards' })).toBeTruthy();
  });

  it('a pile in play has no badge', () => {
    render(PileView, { pile: pile({ count: 3 }) });
    expect(screen.queryByRole('img', { name: 'Victory display' })).toBeNull();
    expect(screen.queryByRole('img', { name: 'Set-aside cards' })).toBeNull();
  });
});
